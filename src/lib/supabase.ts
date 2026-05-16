import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type AnalyticsEvent = {
  session_id: string;
  event_type: string;
  payload: Record<string, unknown>;
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
