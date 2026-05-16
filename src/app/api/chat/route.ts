import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

import { menuItems, restaurant } from "@/data/menu";
import {
  buildDeterministicAnswer,
  constraintSummary,
  extractConstraintsFromText,
  formatNutrition,
  getMenuItemById,
  normalizeText,
} from "@/lib/menu";
import type { ChatPresentation, ChatRequest, CustomerConstraints } from "@/types";

export const runtime = "nodejs";

function sanitizeConstraints(input: Partial<CustomerConstraints> | undefined): CustomerConstraints {
  return {
    allergens: Array.isArray(input?.allergens) ? input.allergens : [],
    avoidIngredients: Array.isArray(input?.avoidIngredients) ? input.avoidIngredients : [],
    dietaryPrefs: Array.isArray(input?.dietaryPrefs) ? input.dietaryPrefs : [],
    nutritionGoal: input?.nutritionGoal,
  } as CustomerConstraints;
}

function menuContext() {
  return menuItems
    .map((item) => {
      const allergenText = item.allergens.length ? item.allergens.join(", ") : "none flagged";
      const flagText = item.dietaryFlags.length ? item.dietaryFlags.join(", ") : "none";
      return `- ${item.name} [${item.category}]: ${item.description} Nutrition: ${formatNutrition(item)}. Allergens: ${allergenText}. Flags: ${flagText}.`;
    })
    .join("\n");
}

function sourceText() {
  return [
    `Restaurant: ${restaurant.name}`,
    `Address: ${restaurant.address}`,
    `Hours: ${restaurant.hours.weekdays}; ${restaurant.hours.weekends}`,
    `Phone: ${restaurant.phone}`,
    "Data source: Sweetgreen Bay Area menu and Sweetgreen Nutrition Guide, last updated May 2026.",
  ].join("\n");
}

export function stripUnsupportedMarkdown(value: string) {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .trim();
}

function requestedProteinTarget(normalizedText: string) {
  const match = normalizedText.match(/\b(\d{2,3})\s*(?:g|grams?)\s+(?:of\s+)?protein\b/);
  return match ? Number(match[1]) : null;
}

function shouldBuildRecommendationPresentation(
  userText: string,
  constraints: CustomerConstraints,
  suggestedItemIds: string[],
) {
  if (suggestedItemIds.length === 0) return false;

  const normalized = normalizeText(userText);
  const asksOperationalQuestion = /\b(hour|hours|open|location|address|phone)\b/.test(normalized);
  const asksPickupOnly = /\b(order|pickup|pick up|cart|add|get|buy)\b/.test(normalized);
  const asksForMenuChoice =
    /\b(best|option|options|meal|item|recommend|suggest|calorie|calories|macro|macros|protein|carb|carbs|fat|vegetarian|vegan|spicy|allergy|allergen|avoid)\b/.test(
      normalized,
    ) ||
    constraints.nutritionGoal === "highProtein" ||
    constraints.nutritionGoal === "lowerCalorie" ||
    constraints.dietaryPrefs.length > 0 ||
    constraints.allergens.length > 0 ||
    constraints.avoidIngredients.length > 0;

  if (asksOperationalQuestion && !asksForMenuChoice) return false;
  if (asksPickupOnly && !asksForMenuChoice) return false;

  return asksForMenuChoice;
}

function recommendationHeading(constraints: CustomerConstraints) {
  if (constraints.nutritionGoal === "highProtein") return "Best high-protein matches";
  if (constraints.nutritionGoal === "lowerCalorie") return "Lowest-calorie matches";
  if (constraints.allergens.length > 0 || constraints.avoidIngredients.length > 0) return "Allergy-aware matches";
  if (constraints.dietaryPrefs.includes("vegetarian") || constraints.dietaryPrefs.includes("vegan")) {
    return "Best vegetarian matches";
  }
  return "Best menu matches";
}

function recommendationReason(constraints: CustomerConstraints, item: NonNullable<ReturnType<typeof getMenuItemById>>) {
  if (constraints.nutritionGoal === "highProtein") {
    return `${item.nutrition.protein}g protein for ${item.nutrition.calories} calories.`;
  }
  if (constraints.nutritionGoal === "lowerCalorie") {
    return `${item.nutrition.calories} calories with ${item.nutrition.protein}g protein.`;
  }
  if (constraints.allergens.length > 0 || constraints.avoidIngredients.length > 0) {
    return "Matches your current allergy and ingredient filters.";
  }
  if (constraints.dietaryPrefs.length > 0) {
    return "Matches your current menu preferences.";
  }
  return "Recommended from the Berkeley menu data.";
}

export function buildChatPresentation(
  userText: string,
  constraints: CustomerConstraints,
  suggestedItemIds: string[],
): ChatPresentation | undefined {
  if (!shouldBuildRecommendationPresentation(userText, constraints, suggestedItemIds)) return undefined;

  const normalized = normalizeText(userText);
  const cards = Array.from(new Set(suggestedItemIds))
    .map(getMenuItemById)
    .filter((item): item is NonNullable<ReturnType<typeof getMenuItemById>> => Boolean(item))
    .slice(0, 4)
    .map((item) => ({
      menuItemId: item.id,
      name: item.name,
      reason: recommendationReason(constraints, item),
      calories: item.nutrition.calories,
      protein: item.nutrition.protein,
      carbs: item.nutrition.carbs,
      fat: item.nutrition.fat,
    }));

  if (cards.length === 0) return undefined;

  const notes: string[] = [];
  const proteinTarget = requestedProteinTarget(normalized);
  const topProteinCard = [...cards].sort((a, b) => b.protein - a.protein || a.calories - b.calories)[0];

  if (proteinTarget && topProteinCard.protein < proteinTarget) {
    notes.push(`No listed item reaches ${proteinTarget}g protein; the closest shown is ${topProteinCard.name} at ${topProteinCard.protein}g protein.`);
  }

  if (constraints.allergens.length > 0) {
    notes.push("For severe allergies, tell the restaurant team before ordering because shared prep areas can create cross-contact risk.");
  }

  return {
    variant: "recommendationCards",
    heading: recommendationHeading(constraints),
    cards,
    notes: notes.length ? notes : undefined,
  };
}

async function askOpenAI(userText: string, request: ChatRequest, constraints: CustomerConstraints, localMessage: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-5.2";
  const recentMessages = request.messages.slice(-8).map((message) => `${message.role}: ${message.content}`).join("\n");

  const response = await client.responses.create({
    model,
    instructions: [
      "You are a concise, helpful restaurant pickup assistant for Sweetgreen Berkeley.",
      "Use only the provided menu, nutrition, allergen, hours, and location data.",
      "Do not invent menu items, prices, availability, medical advice, or real order placement.",
      "If allergies or ingredient restrictions are involved, be conservative and mention shared-prep cross-contact risk.",
      "Pickup orders are mock summaries only; no payment or real Sweetgreen order is placed.",
      "Do not use Markdown formatting, bold markers, asterisks, tables, or bullet characters.",
    ].join(" "),
    input: [
      sourceText(),
      `Customer constraints: ${constraintSummary(constraints)}`,
      `Cart item count: ${request.cart.reduce((sum, item) => sum + item.quantity, 0)}`,
      "Menu data:",
      menuContext(),
      "Recent conversation:",
      recentMessages,
      `Latest user message: ${userText}`,
      `Deterministic safe recommendation baseline: ${localMessage}`,
      "Write the final assistant reply as plain prose. If the baseline contains menu recommendations, use one short summary sentence because structured cards will show the detailed macros.",
    ].join("\n\n"),
  });

  return response.output_text;
}

export async function POST(request: NextRequest) {
  let body: Partial<ChatRequest>;
  try {
    body = (await request.json()) as Partial<ChatRequest>;
  } catch {
    return NextResponse.json(
      { message: "Please send a valid chat request.", suggestedItemIds: [], allergyWarnings: [] },
      { status: 400 },
    );
  }

  try {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const latestUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
    const constraints = extractConstraintsFromText(latestUser, sanitizeConstraints(body.constraints));
    const local = buildDeterministicAnswer(latestUser, constraints, cart);

    let message = local.message;
    try {
      const aiMessage = await askOpenAI(latestUser, { messages, cart, constraints }, constraints, local.message);
      if (aiMessage) {
        message = aiMessage;
      }
    } catch (error) {
      console.error("OpenAI response failed; falling back to deterministic answer", error);
    }

    message = stripUnsupportedMarkdown(message);

    if (constraints.allergens.length > 0 && !message.toLowerCase().includes("cross-contact")) {
      message += " For severe allergies, please tell the restaurant team before ordering because shared prep areas can create cross-contact risk.";
    }

    const presentation = buildChatPresentation(latestUser, constraints, local.suggestedItemIds);

    return NextResponse.json({
      message,
      suggestedItemIds: local.suggestedItemIds,
      allergyWarnings: local.allergyWarnings,
      presentation,
      cartActionSuggestions: local.cartActionSuggestions,
    });
  } catch (error) {
    console.error("Chat route failed", error);
    return NextResponse.json(
      { message: "I could not process that request. Please try again.", suggestedItemIds: [], allergyWarnings: [] },
      { status: 400 },
    );
  }
}
