import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import type { Channel, SessionResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/session { channel } → { session_id, greeting_th }
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user, token } = auth;

  let channel: Channel = "web";
  try {
    const body = (await req.json()) as { channel?: Channel };
    if (body.channel === "line" || body.channel === "web") channel = body.channel;
  } catch {
    /* default web */
  }

  const sb = userClient(token);
  const { data, error } = await sb
    .from("sessions")
    .insert({ user_id: user.id, channel, status: "open" })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[session] insert:", error?.message);
    return ERR.server();
  }
  // initialize empty slot state
  await sb.from("session_state").upsert({ session_id: data.id, slots: {} });

  const res: SessionResponse = {
    session_id: data.id,
    greeting_th:
      "สวัสดีค่ะ เล่าเรื่องสุขภาพที่อยากปรึกษาได้เลย ทั้งพิมพ์และพูด เช่น “พ่ออายุ 68 เป็นเบาหวาน น้ำตาลขึ้นบ่อย อยู่บางกะปิ ใช้บัตรทอง”",
  };
  return ok(res);
}
