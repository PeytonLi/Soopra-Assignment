import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDeterministicAnswer, extractConstraintsFromText, findRequestedCartItems, getItemWarnings, getMenuItemById, recommendItems } from "@/lib/menu";
import { buildPickupSummary, buildTrustedOrderPayload } from "@/lib/orders";
import type { ChatResponse, CustomerConstraints } from "@/types";

const baseConstraints: CustomerConstraints = {
  allergens: [],
  avoidIngredients: [],
  dietaryPrefs: [],
  nutritionGoal: "balanced",
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.doUnmock("openai");
});

describe("menu filtering and recommendations", () => {
  it("filters items that contain a selected allergen", () => {
    const constraints = { ...baseConstraints, allergens: ["dairy" as const] };
    const harvest = getItemWarnings(getMenuItemById("harvest-bowl")!, constraints);
    const recommendations = recommendItems(constraints, "healthy bowl", 10);

    expect(harvest.join(" ")).toContain("dairy");
    expect(recommendations.every((item) => !item.allergens.includes("dairy"))).toBe(true);
  });

  it("filters ingredient exclusions like almonds", () => {
    const constraints = { ...baseConstraints, avoidIngredients: ["almonds"] };
    const recommendations = recommendItems(constraints, "bowl", 20);

    expect(recommendations.some((item) => item.id === "harvest-bowl")).toBe(false);
    expect(recommendations.some((item) => item.id === "crispy-rice-bowl")).toBe(false);
  });

  it("treats allergen-like avoid ingredients as meaningful filters", () => {
    const constraints = { ...baseConstraints, avoidIngredients: ["sesame"] };
    const warnings = getItemWarnings(getMenuItemById("shroomami")!, constraints);
    const recommendations = recommendItems(constraints, "vegetarian meal", 20);

    expect(warnings.join(" ")).toContain("sesame");
    expect(recommendations.some((item) => item.id === "shroomami")).toBe(false);
    expect(recommendations.every((item) => !item.allergens.includes("sesame"))).toBe(true);
  });

  it("updates recommendations from active dietary filters without requiring typed query text", () => {
    const vegetarian = recommendItems({ ...baseConstraints, dietaryPrefs: ["vegetarian"] }, "", 4);
    const spicy = recommendItems({ ...baseConstraints, dietaryPrefs: ["spicy"] }, "", 4);
    const highProtein = recommendItems({ ...baseConstraints, dietaryPrefs: ["highProtein"], nutritionGoal: "highProtein" }, "", 4);
    const lowerCalorie = recommendItems({ ...baseConstraints, dietaryPrefs: ["lowerCalorie"], nutritionGoal: "lowerCalorie" }, "", 4);

    expect(vegetarian.every((item) => item.dietaryFlags.includes("vegetarian") || item.dietaryFlags.includes("vegan"))).toBe(true);
    expect(spicy.every((item) => item.dietaryFlags.includes("spicy"))).toBe(true);
    expect(highProtein.every((item) => item.dietaryFlags.includes("highProtein") || item.nutrition.protein >= 30)).toBe(true);
    expect(lowerCalorie.every((item) => item.dietaryFlags.includes("lowerCalorie") || item.nutrition.calories <= 650)).toBe(true);
  });

  it("does not label impossible filter combinations as matches", () => {
    const constraints: CustomerConstraints = {
      ...baseConstraints,
      avoidIngredients: ["sesame"],
      dietaryPrefs: ["vegetarian", "spicy", "highProtein"],
      nutritionGoal: "highProtein",
    };
    const recommendations = recommendItems(constraints, "", 4);
    const answer = buildDeterministicAnswer("What should I get?", constraints, []);

    expect(recommendations).toHaveLength(0);
    expect(answer.message).toContain("I do not see an exact Berkeley menu match");
  });

  it("prioritizes high-protein requests", () => {
    const constraints = extractConstraintsFromText("I want high protein", baseConstraints);
    const recommendations = recommendItems(constraints, "high protein", 3);

    expect(recommendations[0].nutrition.protein).toBeGreaterThanOrEqual(34);
    expect(recommendations.some((item) => item.dietaryFlags.includes("highProtein"))).toBe(true);
  });

  it("keeps high-protein calorie-capped requests focused on meals", () => {
    const query = "High-protein meal under 650 calories";
    const constraints = extractConstraintsFromText(query, baseConstraints);
    const recommendations = recommendItems(constraints, query, 3);

    expect(recommendations.every((item) => item.nutrition.calories <= 650)).toBe(true);
    expect(recommendations[0].category).not.toBe("Drinks");
    expect(recommendations[0].nutrition.protein).toBeGreaterThanOrEqual(30);
  });

  it("detects pickup quantities from natural language", () => {
    const cartActions = findRequestedCartItems("Can I order two Harvest Bowls for pickup?");

    expect(cartActions).toEqual([
      expect.objectContaining({ menuItemId: "harvest-bowl", quantity: 2 }),
    ]);
  });

  it("adds conservative allergy language to deterministic answers", () => {
    const constraints = extractConstraintsFromText("I have a dairy allergy. What can I eat?", baseConstraints);
    const answer = buildDeterministicAnswer("I have a dairy allergy. What can I eat?", constraints, []);

    expect(answer.message).toContain("cross-contact");
    expect(answer.suggestedItemIds.length).toBeGreaterThan(0);
  });

  it("answers dairy avoidance questions with meal guidance instead of drinks", () => {
    const constraints = extractConstraintsFromText("I have a dairy allergy. What should I avoid?", baseConstraints);
    const answer = buildDeterministicAnswer("What should I avoid?", constraints, []);
    const suggestions = answer.suggestedItemIds.map(getMenuItemById);

    expect(answer.message).toContain("avoid meal items flagged against dairy allergy");
    expect(answer.message).toContain("Better allergy-aware meal starts");
    expect(answer.message).toContain("pickup order");
    expect(answer.message).not.toContain("Open Water");
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((item) => item?.category !== "Drinks")).toBe(true);
  });

  it("keeps allergy avoidance answers deterministic even if OpenAI suggests drinks", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = {
          create: vi.fn(async () => ({
            output_text: "You can have Open Water Still Water, Jasmine Green Tea, Hibiscus Berry Clover Tea, or Open Water Sparkling Water.",
          })),
        };
      },
    }));

    const { POST } = await import("@/app/api/chat/route");
    const response = await POST(
      new Request("http://localhost/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [
            { role: "user", content: "I have a dairy allergy." },
            { role: "assistant", content: "I will filter for dairy." },
            { role: "user", content: "What should I avoid?" },
          ],
          cart: [],
          constraints: { allergens: ["dairy"], avoidIngredients: [], dietaryPrefs: [], nutritionGoal: "balanced" },
        }),
      }) as never,
    );
    const json = (await response.json()) as ChatResponse;
    const suggestions = json.suggestedItemIds.map(getMenuItemById);

    expect(json.message).toContain("avoid meal items flagged against dairy allergy");
    expect(json.message).not.toContain("Open Water Still Water");
    expect(suggestions.every((item) => item?.category !== "Drinks")).toBe(true);
  });

  it("adds allergy notes to pickup summaries and trusted orders", () => {
    const constraints: CustomerConstraints = { ...baseConstraints, allergens: ["dairy"] };
    const cart = [{ menuItemId: "mini-mezze", quantity: 1, allergyWarnings: [] }];

    const summary = buildPickupSummary("Ada", "12:30", cart, constraints);
    const order = buildTrustedOrderPayload({
      sessionId: "session-1",
      customerName: "Ada",
      pickupTime: "12:30",
      cart,
      constraints,
    });

    expect(summary.warnings).toContain("Order note: dairy allergy. Avoid dairy ingredients and confirm shared-prep cross-contact risk with staff.");
    expect(order.allergyWarnings).toContain("Order note: dairy allergy. Avoid dairy ingredients and confirm shared-prep cross-contact risk with staff.");
  });
});
