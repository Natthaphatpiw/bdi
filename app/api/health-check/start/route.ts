import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import { allowRequest } from "@/lib/rateLimit";
import { GUARDIAN_CONSENT_VERSION } from "@/lib/guardian/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/health-check/start { device_info? }
// ต้องมี guardian consent ที่ยังไม่ revoke (Consent มาก่อนการเก็บข้อมูลเสมอ)
// is_baseline = ยังไม่เคยมี session ที่ทำเสร็จ
export async function POST(req: NextRequest) {
  if (!allowRequest(req, "health-check", { limit: 10 })) return ERR.tooMany();
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: { device_info?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const sb = userClient(auth.token);

  const { data: consent } = await sb
    .from("guardian_consents")
    .select("id, consent_version")
    .eq("user_id", auth.user.id)
    .is("revoked_at", null)
    .order("granted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!consent || consent.consent_version !== GUARDIAN_CONSENT_VERSION) {
    return ERR.badRequest("ต้องยอมรับความยินยอมก่อนเริ่มเช็คสุขภาพ");
  }

  const { data: prior } = await sb
    .from("health_check_sessions")
    .select("id")
    .eq("user_id", auth.user.id)
    .not("completed_at", "is", null)
    .limit(1)
    .maybeSingle();
  const isBaseline = !prior;

  const { data, error } = await sb
    .from("health_check_sessions")
    .insert({
      user_id: auth.user.id,
      consent_id: consent.id,
      is_baseline: isBaseline,
      device_info: body.device_info ?? {},
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[health-check] start:", error?.message);
    return ERR.server();
  }
  return ok({ session_id: data.id, is_baseline: isBaseline });
}
