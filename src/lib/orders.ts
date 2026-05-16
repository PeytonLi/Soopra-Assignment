import { getMenuItemById } from "@/lib/menu";
import type { CartItem } from "@/types";

export type PickupSummary = {
  customerName: string;
  pickupTime: string;
  itemCount: number;
  totalNutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  lines: string[];
  warnings: string[];
};

export function getCartTotals(cart: CartItem[]) {
  return cart.reduce(
    (totals, cartItem) => {
      const item = getMenuItemById(cartItem.menuItemId);
      if (!item) return totals;
      totals.itemCount += cartItem.quantity;
      totals.calories += item.nutrition.calories * cartItem.quantity;
      totals.protein += item.nutrition.protein * cartItem.quantity;
      totals.carbs += item.nutrition.carbs * cartItem.quantity;
      totals.fat += item.nutrition.fat * cartItem.quantity;
      return totals;
    },
    { itemCount: 0, calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function buildPickupSummary(customerName: string, pickupTime: string, cart: CartItem[]): PickupSummary {
  const totals = getCartTotals(cart);
  const lines = cart
    .map((cartItem) => {
      const item = getMenuItemById(cartItem.menuItemId);
      if (!item) return null;
      const modificationText = cartItem.modifications ? ` - ${cartItem.modifications}` : "";
      return `${cartItem.quantity}x ${item.name}${modificationText}`;
    })
    .filter((line): line is string => Boolean(line));

  return {
    customerName: customerName.trim(),
    pickupTime,
    itemCount: totals.itemCount,
    totalNutrition: {
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
    },
    lines,
    warnings: Array.from(new Set(cart.flatMap((item) => item.allergyWarnings))),
  };
}
