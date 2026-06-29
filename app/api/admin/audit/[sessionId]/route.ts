import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/audit/:sessionId → audit trace for a session (RLS: owner only)
export async function GET(req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { sessionId } = await ctx.params;

  const sb = userClient(auth.token);
  const { data, error } = await sb
    .from("audit_log")
    .select("id, queries_run, rule_traces, citations, prescreen_result, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) return ERR.server();
  return ok({ session_id: sessionId, audit: data ?? [] });
}
