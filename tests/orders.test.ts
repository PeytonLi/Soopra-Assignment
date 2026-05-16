import { describe, expect, it } from "vitest";

import { buildPickupSummary, buildTrustedOrderPayload, getCartTotals } from "@/lib/orders";
import type { CartItem } from "@/types";

const cart: CartItem[] = [
  { menuItemId: "harvest-bowl", quantity: 2, allergyWarnings: [] },
  { menuItemId: "open-water-still", quantity: 1, allergyWarnings: [] },
];

describe("pickup orders", () => {
  it("calculates cart macro totals", () => {
    const totals = getCartTotals(cart);

    expect(totals.itemCount).toBe(3);
    expect(totals.calories).toBe(1520);
    expect(totals.protein).toBe(80);
  });

  it("formats pickup summaries without payment assumptions", () => {
    const summary = buildPickupSummary("Ada", "12:30", cart);

    expect(summary.customerName).toBe("Ada");
    expect(summary.lines).toContain("2x Harvest Bowl");
    expect(summary.totalNutrition.carbs).toBe(120);
  });

  it("rebuilds trusted order payloads from menu data", () => {
    const order = buildTrustedOrderPayload({
      sessionId: "session-1",
      customerName: " Ada ",
      pickupTime: "12:30",
      cart,
      constraints: { allergens: [], avoidIngredients: [], dietaryPrefs: [], nutritionGoal: "balanced" },
    });

    expect(order.customerName).toBe("Ada");
    expect(order.status).toBe("submitted");
    expect(order.items[0]).toEqual(
      expect.objectContaining({
        menuItemId: "harvest-bowl",
        name: "Harvest Bowl",
        quantity: 2,
      }),
    );
    expect(order.totalNutrition.calories).toBe(1520);
  });

  it("rejects unknown order items", () => {
    expect(() =>
      buildTrustedOrderPayload({
        sessionId: "session-1",
        customerName: "Ada",
        pickupTime: "12:30",
        cart: [{ menuItemId: "not-real", quantity: 1, allergyWarnings: [] }],
        constraints: { allergens: [], avoidIngredients: [], dietaryPrefs: [], nutritionGoal: "balanced" },
      }),
    ).toThrow("Unknown menu item");
  });
});
