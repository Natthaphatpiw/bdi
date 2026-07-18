import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import { allowRequest } from "@/lib/rateLimit";
import {
  COMPARE_METRICS,
  MIN_DEVIATED_METRICS,
  Z_DEVIATION,
  Z_FALLBACK_STD_FRACTION,
} from "@/lib/guardian/config";
import type { HealthCheckSummary, StationId } from "@/lib/guardian/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

// POST /api/health-check/complete { session_id }
// รวม features จาก behavioral_samples → เขียน summary; ถ้าไม่ใช่ baseline
// คำนวณ z-score ต่อ metric เทียบ session ก่อนหน้าทั้งหมด (มี fallback ตัวหาร
// เมื่อมีแค่ baseline เดียว — ดู Z_FALLBACK_STD_FRACTION)
export async function POST(req: NextRequest) {
  if (!allowRequest(req, "health-check", { limit: 10 })) return ERR.tooMany();
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: { session_id?: string };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }
  if (!body.session_id) return ERR.badRequest("ต้องมี session_id");

  const sb = userClient(auth.token);
  const { data: session } = await sb
    .from("health_check_sessions")
    .select("id, is_baseline, started_at")
    .eq("id", body.session_id)
    .maybeSingle();
  if (!session) return ERR.notFound("ไม่พบรอบเช็คสุขภาพนี้");

  const { data: chunks, error: chunksErr } = await sb
    .from("behavioral_samples")
    .select("station, seq, features")
    .eq("session_id", body.session_id)
    .order("seq", { ascending: true });
  if (chunksErr) return ERR.server();
  if (!chunks?.length) return ERR.badRequest("ยังไม่มีข้อมูลจากสถานีใดเลย");

  // features ของสถานี = features บน chunk แรก (client คำนวณจาก samples ทั้งชุด
  // แล้วแนบซ้ำทุก chunk); ถ้าแถวแรกว่างให้ไล่หา chunk ที่มี
  const features: Partial<Record<StationId, Record<string, number>>> = {};
  for (const chunk of chunks) {
    const station = chunk.station as StationId;
    const f = (chunk.features ?? {}) as Record<string, number>;
    if (!features[station] || !Object.keys(features[station]!).length) {
      if (Object.keys(f).length) features[station] = f;
    }
  }
  const stationsCompleted = [...new Set(chunks.map((c) => c.station as StationId))];

  const summary: HealthCheckSummary = {
    stations_completed: stationsCompleted,
    features,
  };

  if (!session.is_baseline) {
    const { data: priors } = await sb
      .from("health_check_sessions")
      .select("summary")
      .eq("user_id", auth.user.id)
      .not("completed_at", "is", null)
      .neq("id", body.session_id)
      .order("started_at", { ascending: true });

    const zscores: Record<string, number> = {};
    for (const [station, metrics] of Object.entries(COMPARE_METRICS)) {
      const current = features[station as StationId];
      if (!current) continue;
      for (const metric of metrics) {
        const value = current[metric];
        if (typeof value !== "number") continue;
        const history = (priors ?? [])
          .map((p) => {
            const s = p.summary as HealthCheckSummary | null;
            return s?.features?.[station as StationId]?.[metric];
          })
          .filter((v): v is number => typeof v === "number");
        if (!history.length) continue;
        const m = mean(history);
        const denom = std(history) || Math.abs(m) * Z_FALLBACK_STD_FRACTION || 1;
        zscores[`${station}.${metric}`] = Math.round(((value - m) / denom) * 100) / 100;
      }
    }
    summary.zscores = zscores;
    summary.deviated =
      Object.values(zscores).filter((z) => Math.abs(z) >= Z_DEVIATION).length >=
      MIN_DEVIATED_METRICS;
  }

  const { error: updateErr } = await sb
    .from("health_check_sessions")
    .update({ completed_at: new Date().toISOString(), summary })
    .eq("id", body.session_id);
  if (updateErr) {
    console.error("[health-check] complete:", updateErr.message);
    return ERR.server();
  }

  return ok({ session_id: body.session_id, is_baseline: session.is_baseline, summary });
}
