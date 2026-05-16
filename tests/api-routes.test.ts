import { beforeEach, describe, expect, it, vi } from "vitest";

describe("api routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("uses a mocked OpenAI response while preserving allergy safety text", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "gpt-test");
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = {
          create: vi.fn(async () => ({ output_text: "Try the Shroomami." })),
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

    expect(json.message).toContain("Try the Shroomami");
    expect(json.message).toContain("cross-contact");
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
});
