import { formatAllergen, getMenuItemById } from "@/lib/menu";
import type { CartItem, CustomerConstraints, MenuCategory, Nutrition } from "@/types";

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

export type TrustedOrderItem = {
  menuItemId: string;
  name: string;
  category: MenuCategory;
  quantity: number;
  modifications?: string;
  nutrition: Nutrition;
  lineNutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
};

export type TrustedOrderPayload = {
  sessionId: string;
  customerName: string;
  pickupTime: string;
  status: "submitted";
  items: TrustedOrderItem[];
  totalNutrition: PickupSummary["totalNutrition"];
  allergyWarnings: string[];
  constraints: CustomerConstraints;
};

export function buildOrderAllergyNotes(constraints?: CustomerConstraints) {
  if (!constraints) return [];

  const notes: string[] = [];
  if (constraints.allergens.length > 0) {
    const allergens = constraints.allergens.map(formatAllergen).join(", ");
    const allergyText = `${allergens} ${constraints.allergens.length === 1 ? "allergy" : "allergies"}`;
    notes.push(`Order note: ${allergyText}. Avoid ${allergens} ingredients and confirm shared-prep cross-contact risk with staff.`);
  }

  if (constraints.avoidIngredients.length > 0) {
    notes.push(`Order note: avoid ${constraints.avoidIngredients.join(", ")}. Confirm the selected items are prepared without those ingredients.`);
  }

  return notes;
}

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

function normalizeQuantity(quantity: unknown) {
  if (typeof quantity !== "number" || !Number.isFinite(quantity)) return 0;
  return Math.max(0, Math.min(20, Math.floor(quantity)));
}

export function buildTrustedOrderPayload(input: {
  sessionId: string;
  customerName: string;
  pickupTime: string;
  cart: CartItem[];
  constraints: CustomerConstraints;
}): TrustedOrderPayload {
  const sessionId = input.sessionId.trim();
  const customerName = input.customerName.trim();
  const pickupTime = input.pickupTime.trim();

  if (!sessionId) {
    throw new Error("A session id is required.");
  }

  if (!customerName) {
    throw new Error("A pickup name is required.");
  }

  if (!pickupTime) {
    throw new Error("A pickup time is required.");
  }

  const items = input.cart.map((cartItem) => {
    const item = getMenuItemById(cartItem.menuItemId);
    const quantity = normalizeQuantity(cartItem.quantity);

    if (!item) {
      throw new Error(`Unknown menu item: ${cartItem.menuItemId}`);
    }

    if (quantity < 1) {
      throw new Error(`Invalid quantity for ${item.name}.`);
    }

    return {
      menuItemId: item.id,
      name: item.name,
      category: item.category,
      quantity,
      modifications: cartItem.modifications?.trim() || undefined,
      nutrition: item.nutrition,
      lineNutrition: {
        calories: item.nutrition.calories * quantity,
        protein: item.nutrition.protein * quantity,
        carbs: item.nutrition.carbs * quantity,
        fat: item.nutrition.fat * quantity,
      },
    };
  });

  if (!items.length) {
    throw new Error("At least one cart item is required.");
  }

  const totalNutrition = items.reduce(
    (totals, item) => {
      totals.calories += item.lineNutrition.calories;
      totals.protein += item.lineNutrition.protein;
      totals.carbs += item.lineNutrition.carbs;
      totals.fat += item.lineNutrition.fat;
      return totals;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    sessionId,
    customerName,
    pickupTime,
    status: "submitted",
    items,
    totalNutrition,
    allergyWarnings: Array.from(new Set([...input.cart.flatMap((item) => item.allergyWarnings), ...buildOrderAllergyNotes(input.constraints)])),
    constraints: input.constraints,
  };
}

export function buildPickupSummary(customerName: string, pickupTime: string, cart: CartItem[], constraints?: CustomerConstraints): PickupSummary {
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
    warnings: Array.from(new Set([...cart.flatMap((item) => item.allergyWarnings), ...buildOrderAllergyNotes(constraints)])),
  };
}
