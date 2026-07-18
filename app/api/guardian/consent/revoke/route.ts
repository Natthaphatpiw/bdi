import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/guardian/consent/revoke — soft-revoke consent (revoked_at) +
// hard-delete ข้อมูลพฤติกรรมทั้งหมดของผู้ใช้ (behavioral_samples ลบตาม
// health_check_sessions ผ่าน FK cascade)
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const sb = userClient(auth.token);

  const { error: revokeErr } = await sb
    .from("guardian_consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", auth.user.id)
    .is("revoked_at", null);
  if (revokeErr) {
    console.error("[guardian-consent] revoke:", revokeErr.message);
    return ERR.server();
  }

  const { error: deleteErr } = await sb
    .from("health_check_sessions")
    .delete()
    .eq("user_id", auth.user.id);
  if (deleteErr) {
    console.error("[guardian-consent] delete sessions:", deleteErr.message);
    return ERR.server("เพิกถอนแล้ว แต่ลบข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง");
  }

  return ok({ revoked: true });
}
