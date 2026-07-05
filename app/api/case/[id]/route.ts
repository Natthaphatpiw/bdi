import { NextRequest } from "next/server";
import { ERR, ok, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import { loadCaseSnapshot } from "@/lib/caseData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!id) return ERR.badRequest("ไม่พบรหัสเคส");

  const snapshot = await loadCaseSnapshot(userClient(auth.token), id);
  if (!snapshot) return ERR.notFound("ไม่พบเคสนี้");
  return ok(snapshot);
}
