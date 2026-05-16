import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "sweetgreen-berkeley-ai-assistant",
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
