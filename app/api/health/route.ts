import { NextResponse } from "next/server";
import { featureFlags, env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: env.appName,
    runtime: {
      databaseReady: featureFlags.hasSupabase(),
      assistedProcessingReady: featureFlags.hasClaude(),
      degradedModeReady: env.enableJsonKnowledgeFallback,
    },
  });
}
