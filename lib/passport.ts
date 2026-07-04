// Case Passport builder — uses the Mastra agent to (a) decide if the session has
// enough info and (b) structure a hand-to-hospital summary. Session data (the
// short-term memory) is loaded from Supabase and fed to the agent each call.
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { casePassportAgent } from "@/mastra/agents/casePassport";
import { computeValueUnlock } from "./valueUnlock";
import { deptThai, severityThai, conditionThaiFor } from "./triageLabels";
import type { Card, PassportData, PassportResult, PrescreenResult, Understood } from "./types";

const CURRENT_YEAR = new Date().getFullYear();

const PassportSchema = z.object({
  status: z.enum(["ready", "need_info"]),
  missing: z
    .array(
      z.object({
        field: z.string(),
        label: z.string(),
        question: z.string(),
        type: z.enum(["text", "number", "select"]).optional(),
        options: z.array(z.string()).optional(),
      })
    )
    .optional(),
  passport: z
    .object({
      patient: z.object({
        role: z.string().optional(),
        age: z.number().optional(),
        gender: z.string().optional(),
        scheme: z.string().optional(),
        area: z.string().optional(),
      }),
      chief_complaint: z.string(),
      // arrays optional — the model omits empty ones; we normalize to [] below
      symptoms: z.array(z.string()).optional(),
      condition: z.string().optional(),
      triage: z
        .object({ department: z.string().optional(), severity: z.string().optional() })
        .optional(),
      rights_summary: z.array(z.string()).optional(),
      recommended_facility: z.object({ name: z.string(), note: z.string().optional() }).optional(),
      prepared_documents: z.array(z.string()).optional(),
      questions_for_provider: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

type AgentOut = z.infer<typeof PassportSchema>;

// summarize stored assistant card JSON into readable lines for the agent
function cardsToSummary(cards: Card[]): string[] {
  const lines: string[] = [];
  for (const c of cards) {
    if (c.type === "care") lines.push(`คำแนะนำ: ${c.body}${c.department ? ` (แผนก ${c.department})` : ""}`);
    else if (c.type === "rights")
      lines.push(`สิทธิ์ครอบคลุม: ${c.items.map((i) => i.name).join(", ")}`);
    else if (c.type === "benefit")
      lines.push(`สิทธิประโยชน์: ${c.items.map((i) => `${i.name}(${i.status})`).join(", ")}`);
    else if (c.type === "facility")
      lines.push(`สถานพยาบาลแนะนำ: ${c.items.map((i) => i.name).join(", ")}`);
    else if (c.type === "next_steps") lines.push(`ขั้นตอนถัดไป: ${c.checklist.join("; ")}`);
    else if (c.type === "safety" && c.level === "emergency") lines.push(`⚠️ ความปลอดภัย: ${c.body}`);
  }
  return lines;
}

function refCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `CP-${s}`;
}

const DISCLAIMER =
  "เอกสารนี้เป็นข้อมูลสรุปเบื้องต้นที่ผู้ป่วยจัดทำผ่านผู้ช่วย AI ไม่ใช่ใบรับรองแพทย์หรือการวินิจฉัย โปรดให้บุคลากรทางการแพทย์ประเมินซ้ำ";

export async function buildPassport(
  sb: SupabaseClient,
  sessionId: string,
  extra?: Record<string, string>
): Promise<PassportResult> {
  // ---- load session context (short-term memory) ----
  const [{ data: msgs }, { data: state }, { data: prof }, { data: audits }] = await Promise.all([
    sb.from("messages").select("role, content").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(80),
    sb.from("session_state").select("slots").eq("session_id", sessionId).maybeSingle(),
    sb.from("profiles").select("birth_year, scheme, area_code, receives_state_pension").maybeSingle(),
    sb
      .from("audit_log")
      .select("prescreen_result, created_at")
      .eq("session_id", sessionId)
      .not("prescreen_result", "is", null)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  // the actual 27B triage result for this session (deterministic — not the LLM)
  const prescreen = (audits?.[0]?.prescreen_result ?? null) as PrescreenResult | null;

  const transcript: string[] = [];
  for (const m of msgs ?? []) {
    const content = (m.content as string) ?? "";
    if (m.role === "user") transcript.push(`ผู้ใช้: ${content}`);
    else if (m.role === "assistant" && content.trim().startsWith("[")) {
      try {
        transcript.push(...cardsToSummary(JSON.parse(content) as Card[]));
      } catch {
        /* skip */
      }
    }
  }

  const profileLines: string[] = [];
  if (prof?.scheme) profileLines.push(`สิทธิ: ${prof.scheme}`);
  if (prof?.birth_year) profileLines.push(`อายุ ~${CURRENT_YEAR - (prof.birth_year as number)}`);
  if (prof?.area_code) profileLines.push(`เขต/พื้นที่: ${prof.area_code}`);

  const context = [
    "สร้าง Case Passport จากข้อมูลเซสชันนี้",
    profileLines.length ? `\nโปรไฟล์ผู้ใช้: ${profileLines.join(" · ")}` : "",
    state?.slots ? `\nสิ่งที่ระบบเข้าใจ (slots): ${JSON.stringify(state.slots)}` : "",
    "\nสรุปบทสนทนา:\n" + (transcript.length ? transcript.join("\n") : "(ยังไม่มีบทสนทนา)"),
    extra && Object.keys(extra).length
      ? "\nข้อมูลเพิ่มเติมที่ผู้ใช้เพิ่งให้:\n" +
        Object.entries(extra)
          .map(([k, v]) => `- ${k}: ${v}`)
          .join("\n")
      : "",
    "\nโปรดประเมินความเพียงพอและตอบเป็น JSON ตามสคีมา (status/missing/passport)",
  ].join("");

  // ---- run the Mastra agent ----
  let out: AgentOut | undefined;
  try {
    // NOTE (claude-sonnet-5): non-default temperature is REJECTED (400) and
    // adaptive thinking runs by default — keep maxOutputTokens generous so the
    // thinking + JSON both fit.
    const res = await casePassportAgent.generate(context, {
      structuredOutput: { schema: PassportSchema },
      modelSettings: { maxOutputTokens: 6000 },
    });
    out = (res as { object?: AgentOut }).object;
  } catch (e) {
    console.error("[passport] agent error:", (e as Error).message);
    throw e;
  }

  if (!out || out.status === "need_info" || !out.passport) {
    // dedupe by field, preferring the richer entry (one that has options)
    const byField = new Map<string, NonNullable<AgentOut["missing"]>[number]>();
    for (const m of out?.missing ?? []) {
      const prev = byField.get(m.field);
      if (!prev || (!prev.options && m.options)) byField.set(m.field, m);
    }
    const deduped = [...byField.values()];
    return {
      status: "need_info",
      missing:
        deduped.length
          ? deduped
          : [
              {
                field: "scheme",
                label: "สิทธิการรักษา",
                question: "ขอทราบสิทธิการรักษาของคุณ",
                type: "select",
                options: ["บัตรทอง", "ประกันสังคม", "ข้าราชการ"],
              },
              { field: "chief_complaint", label: "เรื่องที่มา", question: "วันนี้มาด้วยเรื่องอะไร / มีอาการอะไร" },
            ],
    };
  }

  // ---- unclaimed-entitlement value: DETERMINISTIC (rule engine), never LLM ----
  const slots = (state?.slots ?? {}) as Understood;
  const age =
    slots.age ??
    out.passport.patient.age ??
    (prof?.birth_year ? CURRENT_YEAR - (prof.birth_year as number) : undefined);
  const schemeCode = mapScheme(slots.scheme ?? prof?.scheme ?? out.passport.patient.scheme);
  // mirror the orchestrator's buildAttrs so the passport value matches the chat card
  const attrs: Record<string, unknown> = { age, scheme: schemeCode, thai_nationality: true };
  if (slots.area) attrs.registered_in_area = slots.area;
  const pension =
    (slots.receives_state_pension as boolean | undefined) ?? prof?.receives_state_pension ?? null;
  if (pension != null) {
    attrs.receives_state_pension_or_benapd = pension;
    attrs.receives_regular_state_salary_or_income = pension;
    attrs.resides_in_state_welfare_institution = false;
  }
  const value = computeValueUnlock({ age, scheme: schemeCode }, attrs);

  // ---- detailed screening section: the 27B result itself (with rails applied) --
  const SOURCE_LABEL: Record<string, string> = {
    runpod: "ThaiLLM-27B-Prescreen (RunPod) + safety rails",
    claude: "Claude (fallback) + safety rails",
    gemini: "Gemini (fallback) + safety rails",
    mock: "ระบบสำรอง + safety rails",
  };
  const screening = prescreen
    ? {
        condition_th: conditionThaiFor(prescreen.disease) ?? out.passport.condition,
        disease_en: prescreen.disease ?? undefined,
        department: deptThai(prescreen.department),
        severity: severityThai(prescreen.severity),
        red_flags: prescreen.red_flags?.length ? prescreen.red_flags : undefined,
        screened_by: SOURCE_LABEL[prescreen.source] ?? "AI คัดกรองเบื้องต้น",
      }
    : undefined;

  // ---- assemble the final passport (server adds ref/date/hotlines/disclaimer) ----
  const passport: PassportData = {
    ...out.passport,
    symptoms: out.passport.symptoms ?? [],
    rights_summary: out.passport.rights_summary ?? [],
    prepared_documents: out.passport.prepared_documents ?? ["บัตรประชาชนตัวจริงของผู้ป่วย"],
    // prefer the real prescreen triage over the agent's summary
    triage: screening
      ? { department: screening.department, severity: screening.severity }
      : out.passport.triage,
    condition: screening?.condition_th ?? out.passport.condition,
    screening,
    ref_code: refCode(),
    generated_at: new Date().toISOString(),
    unclaimed_value:
      value && value.total_label
        ? { total_label: value.total_label, lines: value.lines }
        : undefined,
    hotlines: [
      { number: "1669", name: "การแพทย์ฉุกเฉิน" },
      { number: "1330", name: "สายด่วน สปสช." },
    ],
    disclaimer: DISCLAIMER,
  };
  return { status: "ready", passport };
}

// Thai scheme label → code (the passport agent may echo a Thai label)
function mapScheme(v: unknown): string | undefined {
  const s = String(v ?? "");
  if (!s) return undefined;
  if (/UCS|SSS|CSMBS/.test(s)) return s.match(/UCS|SSS|CSMBS/)![0];
  if (/ประกันสังคม|ประกันตน|มาตรา/.test(s)) return "SSS";
  if (/ข้าราชการ|รัฐวิสาหกิจ/.test(s)) return "CSMBS";
  if (/บัตรทอง|หลักประกันสุขภาพ|30 ?บาท/.test(s)) return "UCS";
  return undefined;
}
