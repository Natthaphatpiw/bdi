import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import type { Consent, ConsentScope } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES: ConsentScope[] = ["chat", "phr", "wearable", "doc"];

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const sb = userClient(auth.token);
  const { data, error } = await sb.from("consents").select("scope, granted").eq("user_id", auth.user.id);
  if (error) return ERR.server();
  const map = new Map((data ?? []).map((c) => [c.scope, c.granted]));
  const consents: Consent[] = SCOPES.map((scope) => ({ scope, granted: !!map.get(scope) }));
  return ok({ consents });
}

// POST /api/consent { scope, granted }
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  let body: Consent;
  try {
    body = (await req.json()) as Consent;
  } catch {
    return ERR.badRequest();
  }
  if (!SCOPES.includes(body.scope)) return ERR.badRequest("scope ไม่ถูกต้อง");
  const sb = userClient(auth.token);
  const { error } = await sb
    .from("consents")
    .upsert(
      { user_id: auth.user.id, scope: body.scope, granted: !!body.granted, updated_at: new Date().toISOString() },
      { onConflict: "user_id,scope" }
    );
  if (error) {
    console.error("[consent] upsert:", error.message);
    return ERR.server();
  }
  return ok({ scope: body.scope, granted: !!body.granted });
}
