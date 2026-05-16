import { beforeEach, describe, expect, it, vi } from "vitest";

describe("api routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("builds recommendation card presentation from trusted menu data", async () => {
    const question = "what is the best meal with 50 grams of protein for the least calories?";
    const { buildChatPresentation } = await import("@/app/api/chat/route");
    const { extractConstraintsFromText, recommendItems } = await import("@/lib/menu");
    const constraints = extractConstraintsFromText(question, {
      allergens: [],
      avoidIngredients: [],
      dietaryPrefs: [],
      nutritionGoal: "balanced",
    });
    const suggestedIds = recommendItems(constraints, question, 4).map((item) => item.id);
    const presentation = buildChatPresentation(question, constraints, suggestedIds);

    expect(presentation?.variant).toBe("recommendationCards");
    expect(presentation?.cards.length).toBeGreaterThan(0);
    expect(presentation?.cards[0]).toEqual(
      expect.objectContaining({
        menuItemId: expect.any(String),
        name: expect.any(String),
        calories: expect.any(Number),
        protein: expect.any(Number),
        carbs: expect.any(Number),
        fat: expect.any(Number),
      }),
    );
    expect(presentation?.notes?.join(" ")).toContain("50g protein");
  });

  it("uses a mocked OpenAI response while preserving allergy safety text", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-test");
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = {
          create: vi.fn(async () => ({ output_text: "Try the **Shroomami**." })),
        };
      },
    }));

    const { POST } = await import("@/app/api/chat/route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [{ role: "user", content: "I have a dairy allergy. Recommend a bowl." }],
          cart: [],
          constraints: { allergens: ["dairy"], avoidIngredients: [], dietaryPrefs: [], nutritionGoal: "balanced" },
        }),
      }) as never,
    );
    const json = await response.json();

    expect(json.message).not.toContain("**");
    expect(json.message).toContain("cross-contact");
    expect(json.presentation?.variant).toBe("recommendationCards");
    expect(json.suggestedItemIds.length).toBeGreaterThan(0);
  });

  it("sanitizes event payloads before Supabase logging", async () => {
    const logAnalyticsEvent = vi.fn(async () => ({ configured: true, error: null }));
    vi.doMock("@/lib/supabase", () => ({
      logAnalyticsEvent,
    }));

    const { POST } = await import("@/app/api/events/route");
    const response = await POST(
      new Request("http://localhost/api/events", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          eventType: "order_summary",
          payload: {
            customerName: "Ada",
            itemCount: 2,
            categories: ["Bowls"],
          },
        }),
      }) as never,
    );

    expect(response.status).toBe(200);
    expect(logAnalyticsEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { itemCount: 2, categories: ["Bowls"] },
      }),
    );
  });

  it("saves pickup orders through the backend route", async () => {
    const savePickupOrder = vi.fn(async () => ({ configured: true, error: null, orderId: "order-12345678" }));
    vi.doMock("@/lib/supabase", () => ({
      savePickupOrder,
    }));

    const { POST } = await import("@/app/api/orders/route");
    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          customerName: "Ada",
          pickupTime: "12:30",
          cart: [{ menuItemId: "harvest-bowl", quantity: 1, allergyWarnings: [] }],
          constraints: { allergens: [], avoidIngredients: [], dietaryPrefs: [], nutritionGoal: "balanced" },
        }),
      }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      configured: true,
      orderId: "order-12345678",
      message: "Saved to Supabase.",
    });
    expect(savePickupOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: "Ada",
        items: [expect.objectContaining({ name: "Harvest Bowl", quantity: 1 })],
      }),
    );
  });

  it("returns a clear local fallback when Supabase is not configured", async () => {
    vi.doMock("@/lib/supabase", () => ({
      savePickupOrder: vi.fn(async () => ({ configured: false, error: null, orderId: null })),
    }));

    const { POST } = await import("@/app/api/orders/route");
    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          customerName: "Ada",
          pickupTime: "12:30",
          cart: [{ menuItemId: "harvest-bowl", quantity: 1, allergyWarnings: [] }],
          constraints: { allergens: [], avoidIngredients: [], dietaryPrefs: [], nutritionGoal: "balanced" },
        }),
      }) as never,
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(json.configured).toBe(false);
    expect(json.message).toContain("not saved");
  });

  it("rejects empty pickup orders", async () => {
    vi.doMock("@/lib/supabase", () => ({
      savePickupOrder: vi.fn(),
    }));

    const { POST } = await import("@/app/api/orders/route");
    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          customerName: "Ada",
          pickupTime: "12:30",
          cart: [],
          constraints: { allergens: [], avoidIngredients: [], dietaryPrefs: [], nutritionGoal: "balanced" },
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ message: "At least one cart item is required." }));
  });

  it("rejects invalid pickup order item ids", async () => {
    vi.doMock("@/lib/supabase", () => ({
      savePickupOrder: vi.fn(),
    }));

    const { POST } = await import("@/app/api/orders/route");
    const response = await POST(
      new Request("http://localhost/api/orders", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-1",
          customerName: "Ada",
          pickupTime: "12:30",
          cart: [{ menuItemId: "missing-item", quantity: 1, allergyWarnings: [] }],
          constraints: { allergens: [], avoidIngredients: [], dietaryPrefs: [], nutritionGoal: "balanced" },
        }),
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ message: "Unknown menu item: missing-item" }));
  });
});
