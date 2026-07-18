import { NextRequest } from "next/server";
import { ok, ERR } from "@/lib/http";
import { userClient, getUserFromRequest } from "@/lib/supabase/server";
import { allowRequest } from "@/lib/rateLimit";
import { MAX_SAMPLES_PAYLOAD_BYTES } from "@/lib/guardian/config";
import { STATIONS, sanitizeFeatures, sanitizeSamples } from "@/lib/guardian/sanitize";
import type { StationId as Station } from "@/lib/guardian/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/health-check/samples
// {session_id, station, seq, sample_rate_hz?, started_at, ended_at, samples[], features{}}
// Auth ปกติผ่าน Bearer header; navigator.sendBeacon (ตอนปิดหน้า) แนบ token
// มาใน body แทนเพราะ beacon ตั้ง header ไม่ได้
export async function POST(req: NextRequest) {
  if (!allowRequest(req, "health-check-samples", { limit: 40 })) return ERR.tooMany();

  const raw = await req.text();
  if (raw.length > MAX_SAMPLES_PAYLOAD_BYTES) {
    return ERR.badRequest("payload ใหญ่เกินไป (จำกัด 200KB ต่อคำขอ)");
  }

  let body: {
    session_id?: string;
    station?: string;
    seq?: number;
    sample_rate_hz?: number;
    started_at?: string;
    ended_at?: string;
    samples?: unknown[];
    features?: unknown;
    beacon?: boolean;
    token?: string;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return ERR.badRequest();
  }

  const headerAuth = req.headers.get("authorization") || "";
  const token = headerAuth.startsWith("Bearer ")
    ? headerAuth.slice(7)
    : body.beacon && typeof body.token === "string"
      ? body.token
      : "";
  if (!token) return ERR.unauthorized();
  const user = await getUserFromRequest(token);
  if (!user) return ERR.unauthorized();

  if (!body.session_id || !body.station) return ERR.badRequest("ต้องมี session_id และ station");
  if (!STATIONS.includes(body.station as Station)) return ERR.badRequest("station ไม่ถูกต้อง");
  if (!Array.isArray(body.samples) || !body.samples.length)
    return ERR.badRequest("ไม่มีข้อมูล samples");

  const station = body.station as Station;
  const sb = userClient(token);

  // ownership ผ่าน RLS — session ของคนอื่นมองไม่เห็น
  const { data: session } = await sb
    .from("health_check_sessions")
    .select("id, completed_at")
    .eq("id", body.session_id)
    .maybeSingle();
  if (!session) return ERR.notFound("ไม่พบรอบเช็คสุขภาพนี้");

  const { error } = await sb.from("behavioral_samples").upsert(
    {
      session_id: body.session_id,
      station,
      seq: Number.isInteger(body.seq) ? (body.seq as number) : 0,
      sample_rate_hz: typeof body.sample_rate_hz === "number" ? body.sample_rate_hz : null,
      started_at: body.started_at ?? null,
      ended_at: body.ended_at ?? null,
      samples: sanitizeSamples(station, body.samples),
      features: sanitizeFeatures(body.features),
    },
    { onConflict: "session_id,station,seq" }
  );
  if (error) {
    console.error("[health-check] samples:", error.message);
    return ERR.server();
  }
  return ok({ saved: true });
}
