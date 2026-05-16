import { NextRequest, NextResponse } from "next/server";

import { logAnalyticsEvent } from "@/lib/supabase";

export const runtime = "nodejs";

const blockedPayloadKeys = new Set(["name", "customerName", "phone", "email", "messages", "chat", "content", "transcript"]);

function sanitizePayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return Object.fromEntries(
    Object.entries(payload as Record<string, unknown>)
      .filter(([key]) => !blockedPayloadKeys.has(key))
      .map(([key, value]) => {
        if (typeof value === "string") return [key, value.slice(0, 120)];
        if (Array.isArray(value)) return [key, value.slice(0, 20)];
        if (typeof value === "number" || typeof value === "boolean" || value === null) return [key, value];
        return [key, "[redacted]"];
      }),
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sessionId?: string;
      eventType?: string;
      payload?: Record<string, unknown>;
    };

    if (!body.sessionId || !body.eventType) {
      return NextResponse.json({ error: "sessionId and eventType are required" }, { status: 400 });
    }

    const result = await logAnalyticsEvent({
      session_id: body.sessionId.slice(0, 80),
      event_type: body.eventType.slice(0, 80),
      payload: sanitizePayload(body.payload),
    });

    if (result.error) {
      console.error("Supabase event logging failed", result.error);
      return NextResponse.json({ configured: result.configured, ok: false }, { status: 500 });
    }

    return NextResponse.json({ configured: result.configured, ok: true });
  } catch (error) {
    console.error("Event route failed", error);
    return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
  }
}
