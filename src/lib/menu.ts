import { menuItems, restaurant } from "@/data/menu";
import { ALLERGENS, type Allergen, type CartItem, type CustomerConstraints, type DietaryFlag, type MenuItem } from "@/types";

const allergenLabels: Record<Allergen, string> = {
  dairy: "dairy",
  eggs: "eggs",
  fish: "fish",
  shellfish: "shellfish",
  wheat: "wheat/gluten",
  peanuts: "peanuts",
  treeNuts: "tree nuts",
  soy: "soy",
  sesame: "sesame",
};

const allergenSynonyms: Record<Allergen, string[]> = {
  dairy: ["dairy", "milk", "cheese", "lactose", "yogurt", "cream"],
  eggs: ["egg", "eggs", "mayo", "mayonnaise"],
  fish: ["fish", "salmon", "anchovy", "anchovies"],
  shellfish: ["shellfish", "shrimp", "crab", "lobster"],
  wheat: ["wheat", "gluten", "bread", "breadcrumbs", "focaccia", "tortilla", "celiac"],
  peanuts: ["peanut", "peanuts"],
  treeNuts: ["tree nut", "tree nuts", "nut allergy", "almond", "almonds", "cashew", "cashews", "coconut"],
  soy: ["soy", "tofu", "miso", "tamari"],
  sesame: ["sesame", "tahini"],
};

const avoidIngredientCandidates = [
  "almonds",
  "cashews",
  "coconut",
  "avocado",
  "chicken",
  "steak",
  "salmon",
  "tofu",
  "mushrooms",
  "cheese",
  "parmesan",
  "goat cheese",
  "feta",
  "cilantro",
  "onions",
  "tomatoes",
  "rice",
  "hummus",
  "broccoli",
  "sweet potatoes",
  "spicy",
  "hot sauce",
];

const mealCategories = new Set<MenuItem["category"]>(["Protein Plates", "Bowls", "Salads", "Wraps", "Kids Meals"]);

export function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s+]/g, " ").replace(/\s+/g, " ").trim();
}

function extractCalorieLimit(text: string) {
  const normalized = normalizeText(text);
  const match = normalized.match(/\b(?:under|below|less than|max|maximum)\s+(\d{2,4})\b/);
  return match ? Number(match[1]) : null;
}

export function getMenuItemById(id: string) {
  return menuItems.find((item) => item.id === id);
}

export function formatAllergen(allergen: Allergen) {
  return allergenLabels[allergen];
}

export function formatNutrition(item: MenuItem) {
  const { calories, protein, carbs, fat } = item.nutrition;
  return `${calories} cal, ${protein}g protein, ${carbs}g carbs, ${fat}g fat`;
}

export function emptyConstraints(): CustomerConstraints {
  return {
    allergens: [],
    avoidIngredients: [],
    dietaryPrefs: [],
    nutritionGoal: undefined,
  };
}

function uniqueArray<T>(values: T[]) {
  return Array.from(new Set(values));
}

function mergeConstraints(base: CustomerConstraints, next: Partial<CustomerConstraints>): CustomerConstraints {
  return {
    allergens: uniqueArray([...(base.allergens ?? []), ...(next.allergens ?? [])]),
    avoidIngredients: uniqueArray([...(base.avoidIngredients ?? []), ...(next.avoidIngredients ?? [])].map((item) => item.trim()).filter(Boolean)),
    dietaryPrefs: uniqueArray([...(base.dietaryPrefs ?? []), ...(next.dietaryPrefs ?? [])]),
    nutritionGoal: next.nutritionGoal ?? base.nutritionGoal,
  };
}

export function extractConstraintsFromText(text: string, current: CustomerConstraints = emptyConstraints()): CustomerConstraints {
  const normalized = normalizeText(text);
  const allergens = ALLERGENS.filter((allergen) =>
    allergenSynonyms[allergen].some((synonym) => normalized.includes(normalizeText(synonym))),
  );

  const dietaryPrefs: DietaryFlag[] = [];
  let nutritionGoal = current.nutritionGoal;

  if (/\bvegan\b/.test(normalized)) dietaryPrefs.push("vegan");
  if (/\bvegetarian\b|\bveggie\b/.test(normalized)) dietaryPrefs.push("vegetarian");
  if (normalized.includes("gluten free") || normalized.includes("celiac") || normalized.includes("no gluten")) {
    dietaryPrefs.push("glutenAware");
  }
  if (normalized.includes("spicy")) dietaryPrefs.push("spicy");
  if (normalized.includes("high protein") || normalized.includes("protein")) {
    dietaryPrefs.push("highProtein");
    nutritionGoal = "highProtein";
  }
  if (normalized.includes("low calorie") || normalized.includes("lower calorie") || normalized.includes("under 650") || normalized.includes("under 600")) {
    dietaryPrefs.push("lowerCalorie");
    if (!dietaryPrefs.includes("highProtein")) {
      nutritionGoal = "lowerCalorie";
    }
  }

  const avoidIngredients = avoidIngredientCandidates.filter((ingredient) => {
    const escaped = normalizeText(ingredient).replace(/\s+/g, "\\s+");
    const pattern = new RegExp(`\\b(no|without|avoid|cannot have|can't have|allergic to)\\s+${escaped}\\b`);
    return pattern.test(normalized);
  });

  return mergeConstraints(current, { allergens, avoidIngredients, dietaryPrefs, nutritionGoal });
}

export function itemContainsAvoidedIngredient(item: MenuItem, avoidedIngredient: string) {
  const target = normalizeText(avoidedIngredient);
  const haystack = normalizeText([item.name, item.description, ...item.ingredients].join(" "));
  if (target === "spicy") {
    return item.dietaryFlags.includes("spicy") || haystack.includes("hot sauce") || haystack.includes("jalapeno");
  }
  return haystack.includes(target);
}

export function getItemWarnings(item: MenuItem, constraints: CustomerConstraints) {
  const warnings: string[] = [];
  const allergenHits = item.allergens.filter((allergen) => constraints.allergens.includes(allergen));

  if (allergenHits.length > 0) {
    warnings.push(`${item.name} contains or is flagged for ${allergenHits.map(formatAllergen).join(", ")}.`);
  }

  const avoidHits = constraints.avoidIngredients.filter((ingredient) => itemContainsAvoidedIngredient(item, ingredient));
  if (avoidHits.length > 0) {
    warnings.push(`${item.name} includes or may include: ${avoidHits.join(", ")}.`);
  }

  return warnings;
}

export function isAllowedForConstraints(item: MenuItem, constraints: CustomerConstraints) {
  if (!item.availableAtBerkeley) return false;
  if (getItemWarnings(item, constraints).length > 0) return false;
  if (constraints.dietaryPrefs.includes("vegan") && !item.dietaryFlags.includes("vegan")) return false;
  if (constraints.dietaryPrefs.includes("vegetarian") && !item.dietaryFlags.includes("vegetarian") && !item.dietaryFlags.includes("vegan")) return false;
  if (constraints.dietaryPrefs.includes("glutenAware") && !item.dietaryFlags.includes("glutenAware")) return false;
  return true;
}

function isMealItem(item: MenuItem) {
  return mealCategories.has(item.category);
}

function isDrinkRequest(normalizedText: string) {
  return /\b(drink|drinks|beverage|water|tea|kombucha|soda)\b/.test(normalizedText);
}

function shouldFocusOnMeals(constraints: CustomerConstraints, normalizedText: string) {
  if (isDrinkRequest(normalizedText)) return false;
  return (
    /\b(meal|eat|order|pickup|bowl|salad|wrap|plate|avoid)\b/.test(normalizedText) ||
    constraints.allergens.length > 0 ||
    constraints.avoidIngredients.length > 0
  );
}

function scoreItem(item: MenuItem, constraints: CustomerConstraints, query = "") {
  const normalized = normalizeText(query);
  let score = 0;

  if (normalized.includes("spicy") && item.dietaryFlags.includes("spicy")) score += 5;
  if (normalized.includes("vegetarian") && (item.dietaryFlags.includes("vegetarian") || item.dietaryFlags.includes("vegan"))) score += 5;
  if (normalized.includes("vegan") && item.dietaryFlags.includes("vegan")) score += 6;
  if (normalized.includes("salad") && item.category === "Salads") score += 3;
  if (normalized.includes("bowl") && item.category === "Bowls") score += 3;
  if (normalized.includes("wrap") && item.category === "Wraps") score += 3;
  if (normalized.includes("drink") && item.category === "Drinks") score += 3;

  if (constraints.nutritionGoal === "highProtein") score += item.nutrition.protein / 8;
  if (constraints.nutritionGoal === "lowerCalorie") score += Math.max(0, 850 - item.nutrition.calories) / 100;
  if (constraints.nutritionGoal === "balanced") score += item.nutrition.protein / 12 + Math.max(0, 800 - item.nutrition.calories) / 180;

  if (item.dietaryFlags.includes("highProtein")) score += 1;
  if (item.dietaryFlags.includes("lowerCalorie")) score += 1;
  if (item.category === "Bowls" || item.category === "Salads" || item.category === "Protein Plates") score += 1;

  return score;
}

export function recommendItems(constraints: CustomerConstraints, query = "", limit = 5) {
  const normalized = normalizeText(query);
  const calorieLimit = extractCalorieLimit(query);
  const allowedItems = menuItems.filter((item) => isAllowedForConstraints(item, constraints));
  const calorieFilteredItems = calorieLimit ? allowedItems.filter((item) => item.nutrition.calories <= calorieLimit) : allowedItems;
  let candidates = calorieFilteredItems.length ? calorieFilteredItems : allowedItems;

  if (shouldFocusOnMeals(constraints, normalized)) {
    const mealCandidates = candidates.filter(isMealItem);
    if (mealCandidates.length) candidates = mealCandidates;
  }

  return candidates
    .map((item) => ({ item, score: scoreItem(item, constraints, query) }))
    .sort((a, b) => b.score - a.score || b.item.nutrition.protein - a.item.nutrition.protein || a.item.nutrition.calories - b.item.nutrition.calories)
    .slice(0, limit)
    .map(({ item }) => item);
}

export function isAllergyAvoidanceQuestion(text: string, constraints: CustomerConstraints) {
  if (constraints.allergens.length === 0 && constraints.avoidIngredients.length === 0) return false;
  const normalized = normalizeText(text);
  return /\b(avoid|stay away|not eat|not have|cannot have|can't have|unsafe)\b/.test(normalized);
}

function getAvoidanceItems(constraints: CustomerConstraints, limit = 6) {
  const flaggedItems = menuItems.filter((item) => item.availableAtBerkeley && getItemWarnings(item, constraints).length > 0);
  const mealFlaggedItems = flaggedItems.filter(isMealItem);
  const candidates = mealFlaggedItems.length ? mealFlaggedItems : flaggedItems;

  return candidates
    .map((item) => ({ item, score: scoreItem(item, constraints, "meal") }))
    .sort((a, b) => b.score - a.score || b.item.nutrition.protein - a.item.nutrition.protein || a.item.nutrition.calories - b.item.nutrition.calories)
    .slice(0, limit)
    .map(({ item }) => item);
}

function formatItemNames(items: MenuItem[]) {
  return items.map((item) => item.name).join(", ");
}

function allergyAvoidanceSummary(constraints: CustomerConstraints) {
  const allergenText = constraints.allergens.map(formatAllergen).join(", ");
  const parts = [
    constraints.allergens.length ? `${allergenText} ${constraints.allergens.length === 1 ? "allergy" : "allergies"}` : null,
    constraints.avoidIngredients.length ? `avoid ${constraints.avoidIngredients.join(", ")}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : constraintSummary(constraints);
}

export function findMentionedItems(text: string) {
  const normalized = normalizeText(text);
  return menuItems.filter((item) => {
    const normalizedName = normalizeText(item.name);
    const shortName = normalizedName.replace(/\b(the|and|with)\b/g, "").trim();
    return normalized.includes(normalizedName) || (shortName.length > 6 && normalized.includes(shortName));
  });
}

export function findRequestedCartItems(text: string) {
  const normalized = normalizeText(text);
  const mentioned = findMentionedItems(text);
  if (!/\b(order|pickup|pick up|cart|add|get|want|buy)\b/.test(normalized)) {
    return [];
  }

  const quantity = /\b(2|two|couple)\b/.test(normalized) ? 2 : /\b(3|three)\b/.test(normalized) ? 3 : 1;
  return mentioned.map((item) => ({
    menuItemId: item.id,
    quantity,
    reason: `Detected a pickup request for ${item.name}.`,
  }));
}

function nutritionDetails(item: MenuItem) {
  const n = item.nutrition;
  const optional = [
    typeof n.sodium === "number" ? `${n.sodium}mg sodium` : null,
    typeof n.fiber === "number" ? `${n.fiber}g fiber` : null,
    typeof n.sugar === "number" ? `${n.sugar}g sugar` : null,
  ].filter(Boolean);
  return `${formatNutrition(item)}${optional.length ? `, ${optional.join(", ")}` : ""}`;
}

export function buildDeterministicAnswer(
  userText: string,
  constraints: CustomerConstraints,
  cart: CartItem[] = [],
) {
  const normalized = normalizeText(userText);
  const mentioned = findMentionedItems(userText);
  const cartActionSuggestions = findRequestedCartItems(userText).filter(({ menuItemId }) => {
    const item = getMenuItemById(menuItemId);
    return item ? isAllowedForConstraints(item, constraints) : false;
  });
  const recommendations = recommendItems(constraints, userText, 4);

  if (normalized.includes("hour") || normalized.includes("open") || normalized.includes("location") || normalized.includes("address")) {
    return {
      message: `${restaurant.name} is at ${restaurant.address}. Hours are ${restaurant.hours.weekdays} and ${restaurant.hours.weekends}. Phone: ${restaurant.phone}.`,
      suggestedItemIds: [],
      allergyWarnings: [],
      cartActionSuggestions,
    };
  }

  if (mentioned.length > 0 && !normalized.includes("recommend")) {
    const details = mentioned.slice(0, 3).map((item) => {
      const allergenText = item.allergens.length ? `Allergens flagged: ${item.allergens.map(formatAllergen).join(", ")}.` : "No top-9 allergens are flagged in the dataset.";
      return `${item.name}: ${nutritionDetails(item)}. ${allergenText}`;
    });
    const warnings = mentioned.flatMap((item) => getItemWarnings(item, constraints));
    return {
      message: `${details.join("\n\n")}${warnings.length ? "\n\nBased on your constraints, I would avoid the flagged item(s) and ask the restaurant team about cross-contact." : ""}`,
      suggestedItemIds: mentioned.map((item) => item.id),
      allergyWarnings: warnings,
      cartActionSuggestions,
    };
  }

  const severeAllergyNote =
    constraints.allergens.length > 0
      ? " Because allergies can involve shared prep areas and cross-contact risk, please tell the Sweetgreen team before ordering; I can filter the official allergen data, but I cannot guarantee a meal is allergen-free."
      : "";

  if (isAllergyAvoidanceQuestion(userText, constraints)) {
    const avoidItems = getAvoidanceItems(constraints);
    const safeMealOptions = recommendItems(constraints, `${userText} meal`, 4);
    const constraintText = allergyAvoidanceSummary(constraints);
    const avoidText = avoidItems.length
      ? `In the Berkeley menu data, avoid meal items flagged against ${constraintText}: ${formatItemNames(avoidItems)}.`
      : `I do not see specific meal items flagged against ${constraintText} in the current menu data.`;
    const safeText = safeMealOptions.length
      ? `Better allergy-aware meal starts: ${safeMealOptions.map((item) => `${item.name} (${formatNutrition(item)})`).join("; ")}.`
      : "I do not see a safe meal match in the current menu data.";

    return {
      message: `${avoidText} ${safeText} For a pickup order, add a note that the guest has ${constraintText} and ask the team to avoid those ingredients and confirm cross-contact risk.`,
      suggestedItemIds: safeMealOptions.map((item) => item.id),
      allergyWarnings: avoidItems.flatMap((item) => getItemWarnings(item, constraints)),
      cartActionSuggestions,
    };
  }

  if (normalized.includes("order") || normalized.includes("pickup") || normalized.includes("pick up")) {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    const intro = cartActionSuggestions.length
      ? `I found ${cartActionSuggestions.length} item suggestion for your pickup request.`
      : `I can help build a mock pickup order. Your cart currently has ${count} item${count === 1 ? "" : "s"}.`;
    return {
      message: `${intro} Good options right now: ${recommendations.map((item) => `${item.name} (${formatNutrition(item)})`).join("; ")}.${severeAllergyNote}`,
      suggestedItemIds: recommendations.map((item) => item.id),
      allergyWarnings: recommendations.flatMap((item) => getItemWarnings(item, constraints)),
      cartActionSuggestions,
    };
  }

  const leading =
    constraints.nutritionGoal === "highProtein"
      ? "For a higher-protein order, I would start with:"
      : constraints.nutritionGoal === "lowerCalorie"
        ? "For a lower-calorie order, I would start with:"
        : constraints.allergens.length > 0 || constraints.avoidIngredients.length > 0
          ? "Filtering against your allergy or ingredient constraints, I would suggest:"
          : "I would suggest:";

  return {
    message: `${leading} ${recommendations.map((item) => `${item.name} (${formatNutrition(item)})`).join("; ")}.${severeAllergyNote}`,
    suggestedItemIds: recommendations.map((item) => item.id),
    allergyWarnings: recommendations.flatMap((item) => getItemWarnings(item, constraints)),
    cartActionSuggestions,
  };
}

export function constraintSummary(constraints: CustomerConstraints) {
  const parts = [
    constraints.allergens.length ? `allergens: ${constraints.allergens.map(formatAllergen).join(", ")}` : null,
    constraints.avoidIngredients.length ? `avoid: ${constraints.avoidIngredients.join(", ")}` : null,
    constraints.dietaryPrefs.length ? `preferences: ${constraints.dietaryPrefs.join(", ")}` : null,
    constraints.nutritionGoal ? `goal: ${constraints.nutritionGoal}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "none";
}
