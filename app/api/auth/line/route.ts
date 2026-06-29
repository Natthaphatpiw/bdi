import { NextRequest } from "next/server";
import { ok, ERR } from "@/lib/http";
import { featureFlags } from "@/lib/env";
import { verifyLineIdToken, bridgeLineUser } from "@/lib/line";
import type { LineAuthResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/line  { idToken }  → { access_token, refresh_token, user_id }
export async function POST(req: NextRequest) {
  if (!featureFlags.hasLine()) return ERR.server("ยังไม่ได้ตั้งค่า LINE channel");
  if (!featureFlags.hasSupabase()) return ERR.server("ยังไม่ได้ตั้งค่า Supabase");
  let body: { idToken?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }
  if (!body.idToken) return ERR.badRequest("ต้องมี idToken จาก LIFF");

  try {
    const profile = await verifyLineIdToken(body.idToken);
    const session = await bridgeLineUser(profile);
    const res: LineAuthResponse = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      user_id: session.user_id,
      display_name: profile.name,
      picture_url: profile.picture,
    };
    return ok(res);
  } catch (e) {
    console.error("[auth/line]", (e as Error).message);
    return ERR.server("เข้าสู่ระบบด้วย LINE ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}
