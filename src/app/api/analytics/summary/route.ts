import { NextResponse } from "next/server";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

type StoredEvent = {
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      totalEvents: 0,
      chatEvents: 0,
      orderSummaries: 0,
      allergyFilterUses: 0,
      topCategories: [],
      recentEvents: [],
    });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ configured: false }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("assistant_events")
    .select("event_type,payload,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("Analytics summary failed", error);
    return NextResponse.json({ configured: true, error: "Unable to read analytics" }, { status: 500 });
  }

  const events = (data ?? []) as StoredEvent[];
  const categoryCounts = new Map<string, number>();

  for (const event of events) {
    const categories = event.payload?.categories;
    if (Array.isArray(categories)) {
      for (const category of categories) {
        if (typeof category === "string") {
          categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
        }
      }
    }
  }

  return NextResponse.json({
    configured: true,
    totalEvents: events.length,
    chatEvents: events.filter((event) => event.event_type === "chat_message").length,
    orderSummaries: events.filter((event) => event.event_type === "order_summary").length,
    allergyFilterUses: events.filter((event) => Boolean(event.payload?.hasAllergyFilter)).length,
    topCategories: Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count })),
    recentEvents: events.slice(0, 8).map((event) => ({
      type: event.event_type,
      createdAt: event.created_at,
    })),
  });
}
