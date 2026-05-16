import { NextResponse } from "next/server";

import { checkSupabaseSchema } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await checkSupabaseSchema();

  return NextResponse.json(
    {
      ok: status.configured && status.schemaReady,
      ...status,
    },
    {
      status: status.configured && status.schemaReady ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
