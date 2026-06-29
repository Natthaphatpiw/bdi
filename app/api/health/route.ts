import { NextResponse } from "next/server";
import { featureFlags, env } from "@/lib/env";
import { neo4jHealthy } from "@/lib/neo4j";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const neo4j = await neo4jHealthy();
  return NextResponse.json({
    ok: true,
    app: env.appName,
    integrations: {
      supabase: featureFlags.hasSupabase(),
      supabaseClientKey: featureFlags.hasSupabaseClient(),
      gemini: featureFlags.hasGemini(),
      geminiModel: env.geminiModel,
      runpod: featureFlags.hasRunpod(),
      neo4j_configured: featureFlags.hasNeo4j(),
      neo4j_reachable: neo4j,
      line: featureFlags.hasLine(),
      liffId: env.liffId || null,
    },
  });
}
