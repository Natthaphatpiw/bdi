import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/health-check/history — สรุปรอบที่ทำเสร็จ (ใหม่ → เก่า) สำหรับ
// badge บน HomeScreen และ sparkline ในหน้าประวัติผล
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const sb = userClient(auth.token);
  const { data, error } = await sb
    .from("health_check_sessions")
    .select("id, started_at, completed_at, is_baseline, summary")
    .eq("user_id", auth.user.id)
    .not("completed_at", "is", null)
    .order("started_at", { ascending: false })
    .limit(24);
  if (error) return ERR.server();
  return ok({
    entries: (data ?? []).map((row) => ({
      session_id: row.id,
      started_at: row.started_at,
      completed_at: row.completed_at,
      is_baseline: row.is_baseline,
      summary: row.summary ?? {},
    })),
  });
}
