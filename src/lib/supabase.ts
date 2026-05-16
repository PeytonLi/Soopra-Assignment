import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { TrustedOrderPayload } from "@/lib/orders";

const REQUIRED_TABLES = ["assistant_events", "pickup_orders"] as const;

type AnalyticsEvent = {
  session_id: string;
  event_type: string;
  payload: Record<string, unknown>;
};

type SupabaseErrorLike = {
  code?: string;
  message?: string;
};

let cachedClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdmin() {
  if (!isSupabaseConfigured()) return null;
  if (!cachedClient) {
    cachedClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );
  }
  return cachedClient;
}

export function isMissingSupabaseTableError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as SupabaseErrorLike).code === "PGRST205",
  );
}

export function describeSupabaseError(error: unknown, tableName: string) {
  if (isMissingSupabaseTableError(error)) {
    return `Supabase is connected, but the ${tableName} table is missing. Run supabase/schema.sql in the Supabase SQL editor, then try again.`;
  }

  if (error && typeof error === "object" && "message" in error && typeof (error as SupabaseErrorLike).message === "string") {
    return (error as SupabaseErrorLike).message as string;
  }

  return "Supabase could not complete the request.";
}

export async function checkSupabaseSchema() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      configured: false,
      connected: false,
      schemaReady: false,
      missingTables: [...REQUIRED_TABLES],
      errors: [],
    };
  }

  const missingTables: string[] = [];
  const errors: Array<{ table: string; message: string; code?: string }> = [];

  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select("id").limit(1);

    if (!error) continue;

    if (isMissingSupabaseTableError(error)) {
      missingTables.push(table);
      continue;
    }

    errors.push({
      table,
      message: describeSupabaseError(error, table),
      code: error.code,
    });
  }

  return {
    configured: true,
    connected: missingTables.length > 0 || errors.length < REQUIRED_TABLES.length,
    schemaReady: missingTables.length === 0 && errors.length === 0,
    missingTables,
    errors,
  };
}

export async function logAnalyticsEvent(event: AnalyticsEvent) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { configured: false, error: null };
  }

  const { error } = await supabase.from("assistant_events").insert({
    session_id: event.session_id,
    event_type: event.event_type,
    payload: event.payload,
  });

  return { configured: true, error };
}

export async function savePickupOrder(order: TrustedOrderPayload) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { configured: false, error: null, orderId: null };
  }

  const { data, error } = await supabase
    .from("pickup_orders")
    .insert({
      session_id: order.sessionId,
      customer_name: order.customerName,
      pickup_time: order.pickupTime,
      status: order.status,
      items: order.items,
      total_nutrition: order.totalNutrition,
      allergy_warnings: order.allergyWarnings,
      constraints: order.constraints,
    })
    .select("id")
    .single();

  return {
    configured: true,
    error,
    orderId: typeof data?.id === "string" ? data.id : null,
  };
}
