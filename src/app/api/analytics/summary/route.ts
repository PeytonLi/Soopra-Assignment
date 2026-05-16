import { NextResponse } from "next/server";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

type StoredEvent = {
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type StoredOrder = {
  id: string;
  created_at: string;
  customer_name: string;
  pickup_time: string;
  status: string;
  items: Array<{ name?: string; quantity?: number }> | null;
};

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      totalEvents: 0,
      chatEvents: 0,
      orderSummaries: 0,
      savedOrders: 0,
      allergyFilterUses: 0,
      topCategories: [],
      recentEvents: [],
      recentOrders: [],
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

  const { data: orderData, error: orderError } = await supabase
    .from("pickup_orders")
    .select("id,created_at,customer_name,pickup_time,status,items")
    .order("created_at", { ascending: false })
    .limit(25);

  if (orderError) {
    console.error("Pickup order summary failed", orderError);
    return NextResponse.json({ configured: true, error: "Unable to read pickup orders" }, { status: 500 });
  }

  const events = (data ?? []) as StoredEvent[];
  const orders = (orderData ?? []) as StoredOrder[];
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
    savedOrders: orders.length,
    allergyFilterUses: events.filter((event) => Boolean(event.payload?.hasAllergyFilter)).length,
    topCategories: Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count })),
    recentEvents: events.slice(0, 8).map((event) => ({
      type: event.event_type,
      createdAt: event.created_at,
    })),
    recentOrders: orders.slice(0, 8).map((order) => ({
      id: order.id,
      createdAt: order.created_at,
      customerName: order.customer_name,
      pickupTime: order.pickup_time,
      status: order.status,
      itemCount: (order.items ?? []).reduce((sum, item) => sum + (typeof item.quantity === "number" ? item.quantity : 0), 0),
      items: (order.items ?? []).map((item) => item.name).filter((name): name is string => Boolean(name)),
    })),
  });
}
