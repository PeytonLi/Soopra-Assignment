export const ALLERGENS = [
  "dairy",
  "eggs",
  "fish",
  "shellfish",
  "wheat",
  "peanuts",
  "treeNuts",
  "soy",
  "sesame",
] as const;

export type Allergen = (typeof ALLERGENS)[number];

export type DietaryFlag =
  | "vegan"
  | "vegetarian"
  | "glutenAware"
  | "spicy"
  | "highProtein"
  | "lowerCalorie";

export type Nutrition = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  saturatedFat?: number;
  sodium?: number;
  fiber?: number;
  sugar?: number;
  cholesterol?: number;
};

export type MenuSource = {
  label: string;
  url: string;
  lastUpdated: string;
};

export type MenuCategory =
  | "Protein Plates"
  | "Bowls"
  | "Salads"
  | "Wraps"
  | "Kids Meals"
  | "Sides"
  | "Dessert"
  | "Drinks";

export type MenuItem = {
  id: string;
  name: string;
  category: MenuCategory;
  description: string;
  ingredients: string[];
  nutrition: Nutrition;
  allergens: Allergen[];
  dietaryFlags: DietaryFlag[];
  availableAtBerkeley: boolean;
  source: MenuSource;
};

export type CartItem = {
  menuItemId: string;
  quantity: number;
  modifications?: string;
  allergyWarnings: string[];
};

export type CustomerConstraints = {
  allergens: Allergen[];
  avoidIngredients: string[];
  dietaryPrefs: DietaryFlag[];
  nutritionGoal?: "highProtein" | "lowerCalorie" | "balanced";
};

export type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  cart: CartItem[];
  constraints: CustomerConstraints;
};

export type ChatResponse = {
  message: string;
  suggestedItemIds: string[];
  allergyWarnings: string[];
  cartActionSuggestions?: Array<{
    menuItemId: string;
    quantity: number;
    reason: string;
  }>;
};
