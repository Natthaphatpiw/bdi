import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { userClient } from "@/lib/supabase/server";
import { allowRequest } from "@/lib/rateLimit";
import { DISMISS_COOLDOWN_HOURS } from "@/lib/guardian/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATTERNS = ["fall", "tremor", "drops"] as const;
const SOURCES = ["simulated", "sensor"] as const;

interface SignalBody {
  action: "signal";
  pattern: string;
  source: string;
  confidence?: number;
  detected_at?: string;
}

interface UpdateBody {
  action: "update";
  event_id: string;
  chosen_symptom?: string;
  outcome?: string;
  payload?: Record<string, unknown>;
}

// POST /api/guardian/event
//   {action:'signal', pattern, source}            → insert + server-side cooldown check
//   {action:'update', event_id, outcome, ...}     → update chosen_symptom/outcome, append timeline
export async function POST(req: NextRequest) {
  if (!allowRequest(req, "guardian-event", { limit: 30 })) return ERR.tooMany();
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: SignalBody | UpdateBody;
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }

  const sb = userClient(auth.token);

  if (body.action === "signal") {
    if (!PATTERNS.includes(body.pattern as (typeof PATTERNS)[number]))
      return ERR.badRequest("pattern ไม่ถูกต้อง");
    if (!SOURCES.includes(body.source as (typeof SOURCES)[number]))
      return ERR.badRequest("source ไม่ถูกต้อง");

    // Guardrail §9.5 — cooldown 24 ชม. หลัง "ฉันสบายดี" บังคับฝั่ง server:
    // ถ้ามี dismissed ภายในช่วง cooldown → บันทึก signal ไว้เป็น telemetry
    // แต่ตอบ suppressed ให้ client เงียบ
    const cooldownSince = new Date(
      Date.now() - DISMISS_COOLDOWN_HOURS * 3600 * 1000
    ).toISOString();
    const { data: recentDismiss } = await sb
      .from("guardian_events")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("outcome", "dismissed")
      .gte("created_at", cooldownSince)
      .limit(1)
      .maybeSingle();
    const suppressed = !!recentDismiss;

    const { data, error } = await sb
      .from("guardian_events")
      .insert({
        user_id: auth.user.id,
        source: body.source,
        pattern: body.pattern,
        outcome: suppressed ? "suppressed_cooldown" : "signal_shown",
        payload: {
          confidence: body.confidence ?? null,
          detected_at: body.detected_at ?? null,
          timeline: [{ outcome: suppressed ? "suppressed_cooldown" : "signal_shown", at: new Date().toISOString() }],
        },
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("[guardian-event] insert:", error?.message);
      return ERR.server();
    }
    return ok({ event_id: data.id, suppressed });
  }

  if (body.action === "update") {
    if (!body.event_id) return ERR.badRequest("ต้องมี event_id");
    const { data: existing } = await sb
      .from("guardian_events")
      .select("id, payload")
      .eq("id", body.event_id)
      .maybeSingle();
    if (!existing) return ERR.notFound();

    const payload = (existing.payload ?? {}) as Record<string, unknown>;
    const timeline = Array.isArray(payload.timeline) ? payload.timeline : [];
    if (body.outcome) timeline.push({ outcome: body.outcome, at: new Date().toISOString() });

    const { error } = await sb
      .from("guardian_events")
      .update({
        ...(body.chosen_symptom ? { chosen_symptom: body.chosen_symptom } : {}),
        ...(body.outcome ? { outcome: body.outcome } : {}),
        payload: { ...payload, ...(body.payload ?? {}), timeline },
      })
      .eq("id", body.event_id);
    if (error) {
      console.error("[guardian-event] update:", error.message);
      return ERR.server();
    }
    return ok({ updated: true });
  }

  return ERR.badRequest("action ไม่ถูกต้อง");
}
