import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import { allowRequest } from "@/lib/rateLimit";
import { createPassportShare, revokePassportShare } from "@/lib/passportShare";
import type { PassportAudience, PassportData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/passport/token { session_id, passport, audience } → สร้าง QR token
// (raw token คืนครั้งเดียว — DB เก็บเฉพาะ hash) | { revoke_token_id } → เพิกถอน
export async function POST(req: NextRequest) {
  if (!allowRequest(req, "passport-token", { limit: 15 })) return ERR.tooMany();
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: {
    session_id?: string;
    passport?: PassportData;
    audience?: PassportAudience;
    revoke_token_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }

  const sb = userClient(auth.token);

  if (body.revoke_token_id) {
    const done = await revokePassportShare(sb, body.revoke_token_id);
    return done ? ok({ revoked: true }) : ERR.server();
  }

  if (!body.passport || typeof body.passport !== "object" || !body.passport.ref_code) {
    return ERR.badRequest("ต้องมีข้อมูล passport");
  }
  try {
    const share = await createPassportShare(
      sb,
      auth.user.id,
      body.session_id ?? null,
      body.passport,
      body.audience ?? body.passport.audience ?? "general"
    );
    return ok({
      token: share.token,
      token_id: share.token_id,
      expires_at: share.expires_at,
      url: `/p/${share.token}`,
    });
  } catch (e) {
    console.error("[passport-token]", (e as Error).message);
    return ERR.server("สร้างลิงก์สำหรับเจ้าหน้าที่ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}
