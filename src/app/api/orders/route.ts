import { NextRequest, NextResponse } from "next/server";

import { buildTrustedOrderPayload } from "@/lib/orders";
import { savePickupOrder } from "@/lib/supabase";
import type { CartItem, CustomerConstraints } from "@/types";

export const runtime = "nodejs";

function sanitizeConstraints(input: Partial<CustomerConstraints> | undefined): CustomerConstraints {
  return {
    allergens: Array.isArray(input?.allergens) ? input.allergens : [],
    avoidIngredients: Array.isArray(input?.avoidIngredients) ? input.avoidIngredients : [],
    dietaryPrefs: Array.isArray(input?.dietaryPrefs) ? input.dietaryPrefs : [],
    nutritionGoal: input?.nutritionGoal,
  } as CustomerConstraints;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      customerName?: string;
      pickupTime?: string;
      cart?: CartItem[];
      constraints?: CustomerConstraints;
    };

    const order = buildTrustedOrderPayload({
      sessionId: body.sessionId ?? "",
      customerName: body.customerName ?? "",
      pickupTime: body.pickupTime ?? "",
      cart: Array.isArray(body.cart) ? body.cart : [],
      constraints: sanitizeConstraints(body.constraints),
    });

    const result = await savePickupOrder(order);

    if (!result.configured) {
      return NextResponse.json({
        ok: false,
        configured: false,
        orderId: null,
        message: "Summary created locally, not saved. Add Supabase env vars to persist pickup requests.",
      });
    }

    if (result.error || !result.orderId) {
      console.error("Pickup order insert failed", result.error);
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          orderId: null,
          message: "Summary created locally, not saved. Supabase could not save the pickup request.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      orderId: result.orderId,
      message: "Saved to Supabase.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        orderId: null,
        message: error instanceof Error ? error.message : "Invalid pickup order.",
      },
      { status: 400 },
    );
  }
}
