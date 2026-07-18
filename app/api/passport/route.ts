import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import { buildPassport, buildEmergencyPassport, type EmergencyPassportInput } from "@/lib/passport";
import { allowRequest } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/passport { session_id, extra?, mode?, emergency? } → PassportResult
//  - default: LLM-assisted Case Passport (need_info | ready)
//  - mode: 'emergency': deterministic ER Passport จาก guardian context — ไม่แตะ LLM
export async function POST(req: NextRequest) {
  if (!allowRequest(req, "passport", { limit: 8 })) return ERR.tooMany();
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: {
    session_id?: string;
    extra?: Record<string, string>;
    mode?: "emergency";
    emergency?: EmergencyPassportInput;
  };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }
  if (!body.session_id) return ERR.badRequest("ต้องมี session_id");

  try {
    const result =
      body.mode === "emergency"
        ? await buildEmergencyPassport(userClient(auth.token), body.session_id, body.emergency ?? {})
        : await buildPassport(userClient(auth.token), body.session_id, body.extra);
    return ok(result);
  } catch (e) {
    console.error("[passport]", (e as Error).message);
    return ERR.server("สร้าง Case Passport ไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}
