import { describe, expect, it } from "vitest";

import { buildPickupSummary, getCartTotals } from "@/lib/orders";
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
});
