import { describe, expect, it } from "vitest";

import { buildDeterministicAnswer, extractConstraintsFromText, findRequestedCartItems, getItemWarnings, getMenuItemById, recommendItems } from "@/lib/menu";
import type { CustomerConstraints } from "@/types";

const baseConstraints: CustomerConstraints = {
  allergens: [],
  avoidIngredients: [],
  dietaryPrefs: [],
  nutritionGoal: "balanced",
};

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
});
