import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import { GUARDIAN_CONSENT_VERSION } from "@/lib/guardian/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/guardian/consent → สถานะ consent behavioral data ล่าสุดที่ยังไม่ถูกเพิกถอน
// (consent_version เปลี่ยน → active=false เพื่อบังคับขอใหม่)
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const sb = userClient(auth.token);
  const { data, error } = await sb
    .from("guardian_consents")
    .select("id, consent_version, granted_at, revoked_at")
    .eq("user_id", auth.user.id)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return ERR.server();
  const active = !!data && data.consent_version === GUARDIAN_CONSENT_VERSION;
  return ok(
    active
      ? { active: true, consent_id: data.id, version: data.consent_version, granted_at: data.granted_at }
      : { active: false }
  );
}

// POST /api/guardian/consent { version } → บันทึก consent ใหม่ คืน consent_id
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  let body: { version?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }
  if (!body.version) return ERR.badRequest("ต้องมี version");
  const sb = userClient(auth.token);
  const { data, error } = await sb
    .from("guardian_consents")
    .insert({ user_id: auth.user.id, consent_version: body.version })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[guardian-consent] insert:", error?.message);
    return ERR.server();
  }
  return ok({ consent_id: data.id });
}
