import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

import { menuItems, restaurant } from "@/data/menu";
import {
  buildDeterministicAnswer,
  constraintSummary,
  extractConstraintsFromText,
  formatNutrition,
} from "@/lib/menu";
import type { ChatRequest, CustomerConstraints } from "@/types";

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
      "Write the final assistant reply in 2-5 short sentences.",
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

    if (constraints.allergens.length > 0 && !message.toLowerCase().includes("cross-contact")) {
      message += " For severe allergies, please tell the restaurant team before ordering because shared prep areas can create cross-contact risk.";
    }

    return NextResponse.json({
      message,
      suggestedItemIds: local.suggestedItemIds,
      allergyWarnings: local.allergyWarnings,
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
