// Case Passport builder — uses the Mastra agent to (a) decide if the session has
// enough info and (b) structure a hand-to-hospital summary. Session data (the
// short-term memory) is loaded from Supabase and fed to the agent each call.
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { casePassportAgent, CASE_PASSPORT_INSTRUCTIONS } from "@/mastra/agents/casePassport";
import { llmJson } from "./llm";
import { deptThai, severityThai, conditionThaiFor } from "./triageLabels";
import { computeValueUnlock } from "./valueUnlock";
import { searchFacilities } from "./kg";
import {
  availableAudiences,
  buildVariantBlocks,
  decideAudience,
} from "./passportVariants";
import type {
  Card,
  PassportAudience,
  PassportData,
  PassportEmergencyData,
  PassportResult,
  PrescreenResult,
  Scheme,
  Understood,
} from "./types";

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

// Models sometimes wrap the whole structured-output object under a spurious key
// (observed: claude-sonnet-5 emitting {"parameters":{status,...}} to the
// structured-output tool). Unwrap the first wrapper whose value carries "status".
const WRAPPER_KEYS = ["parameters", "input", "arguments", "data", "output", "response", "result"];

function coerceAgentOut(raw: unknown): AgentOut | undefined {
  if (raw === null || typeof raw !== "object") return undefined;
  let candidate: unknown = raw;
  if (!("status" in (raw as Record<string, unknown>))) {
    for (const key of WRAPPER_KEYS) {
      const inner = (raw as Record<string, unknown>)[key];
      if (inner !== null && typeof inner === "object" && "status" in (inner as Record<string, unknown>)) {
        candidate = inner;
        break;
      }
    }
  }
  const parsed = PassportSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

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
  "ข้อมูลนี้เป็นการคัดกรองและนำทางเบื้องต้น ไม่ใช่ใบรับรองแพทย์ ใบส่งตัว หรือการวินิจฉัย โปรดให้บุคลากรทางการแพทย์ประเมินอีกครั้ง";

function passportAttrs(slots: Understood, prof?: Record<string, unknown> | null): Record<string, unknown> {
  const attrs: Record<string, unknown> = { thai_nationality: true };
  if (typeof slots.age === "number") attrs.age = slots.age;
  else if (typeof prof?.birth_year === "number") attrs.age = CURRENT_YEAR - prof.birth_year;
  const scheme = mapScheme(slots.scheme ?? prof?.scheme);
  if (scheme) attrs.scheme = scheme;
  const section = (slots.sss_section as number | undefined) ?? (prof?.sss_section as number | undefined);
  if (section != null) attrs.sss_section = section;
  const months = slots.contribution_months_in_last_15 as number | undefined;
  if (months != null) attrs.contribution_months_in_last_15 = months;
  const pension =
    (slots.receives_state_pension as boolean | undefined) ??
    (prof?.receives_state_pension as boolean | undefined);
  if (pension != null) {
    attrs.receives_state_pension_or_benapd = pension;
    attrs.receives_regular_state_salary_or_income = pension;
    attrs.resides_in_state_welfare_institution = false;
  }
  return attrs;
}

function filterPassportRights(lines: string[], passport: AgentOut["passport"], prescreen: PrescreenResult | null): string[] {
  const conditionText = [
    passport?.condition,
    prescreen?.disease,
    ...(passport?.symptoms ?? []),
    passport?.chief_complaint,
  ]
    .filter(Boolean)
    .join(" ");
  const isDentalCase = /ฟัน|ทันต|เหงือก/.test(conditionText);
  const isMaternityCase = /ตั้งครรภ์|คลอด|ฝากครรภ์/.test(conditionText);
  const blocked = lines.filter((line) => {
    if (!isDentalCase && /ทันต|ฟัน|ขูดหินปูน|ถอนฟัน/.test(line)) return false;
    if (!isMaternityCase && /คลอด|บุตร|ฝากครรภ์/.test(line)) return false;
    if (/เสียชีวิต|ทำศพ|ชราภาพ|ว่างงาน/.test(line)) return false;
    return true;
  });
  return blocked.slice(0, 5);
}

function isDentalContext(passport: AgentOut["passport"], prescreen: PrescreenResult | null): boolean {
  const conditionText = [
    passport?.condition,
    prescreen?.disease,
    ...(passport?.symptoms ?? []),
    passport?.chief_complaint,
  ]
    .filter(Boolean)
    .join(" ");
  return /ฟัน|ทันต|เหงือก/.test(conditionText);
}

function amountFromLabel(label?: string): number {
  const raw = label?.match(/[\d,]+/)?.[0];
  return raw ? Number(raw.replace(/,/g, "")) || 0 : 0;
}

function passportUnclaimedValue(
  value: ReturnType<typeof computeValueUnlock>,
  passport: AgentOut["passport"],
  prescreen: PrescreenResult | null
): PassportData["unclaimed_value"] | undefined {
  if (!value?.total_label) return undefined;
  const dentalCase = isDentalContext(passport, prescreen);
  const lines = value.lines.filter((line) => {
    if (!dentalCase && /ฟัน|ทันต|ขูดหินปูน|ถอนฟัน|ฟันคุด/.test(line.label)) return false;
    return Boolean(line.amount_label);
  });
  if (!lines.length) return undefined;

  const definite = lines
    .filter((line) => !line.tentative)
    .reduce((sum, line) => sum + amountFromLabel(line.amount_label), 0);
  const tentative = lines
    .filter((line) => line.tentative)
    .reduce((sum, line) => sum + amountFromLabel(line.amount_label), 0);
  const total = definite || tentative;
  if (!total) return undefined;

  return {
    total_label:
      definite > 0
        ? `อย่างน้อย ${definite.toLocaleString()} บาท/ปี`
        : `อย่างน้อย ${tentative.toLocaleString()} บาท/ปี (รอยืนยันเงื่อนไข)`,
    lines,
  };
}

// ---- ER Passport (Guardian Emergency Mode) ----------------------------------
// Deterministic — no LLM call. In an emergency the passport must render
// instantly and never fail on provider latency; every field comes verbatim
// from the guardian context + profile. ข้อมูลวิกฤตเรียงบนสุด อ่านจบใน 15 วินาที
const UCEP_LINE =
  "ผู้ป่วยฉุกเฉินวิกฤต ขอใช้สิทธิ UCEP — เข้ารักษาโรงพยาบาลที่ใกล้ที่สุดได้ทุกแห่ง รวมเอกชน ไม่ต้องสำรองจ่ายภายใน 72 ชั่วโมงแรก";

export interface EmergencyPassportInput {
  symptom?: string;
  onset?: string;
  befast?: { f?: "yes" | "no"; a?: "yes" | "no"; s?: "yes" | "no" };
  conditions_meds?: string;
  contact_phone?: string;
}

const befastLabel: Record<string, string> = { f: "ใบหน้า", a: "แขน", s: "การพูด" };

export async function buildEmergencyPassport(
  sb: SupabaseClient,
  sessionId: string,
  input: EmergencyPassportInput
): Promise<PassportResult> {
  const [{ data: state }, { data: prof }] = await Promise.all([
    sb.from("session_state").select("slots").eq("session_id", sessionId).maybeSingle(),
    sb
      .from("profiles")
      .select("birth_year, scheme, area_code, emergency_phone, conditions_meds")
      .maybeSingle(),
  ]);
  const slots = (state?.slots ?? {}) as Understood;

  const age =
    (typeof slots.age === "number" ? slots.age : undefined) ??
    (typeof prof?.birth_year === "number" ? CURRENT_YEAR - prof.birth_year : undefined);
  const schemeCode = mapScheme(slots.scheme ?? prof?.scheme);
  const schemeLabel =
    schemeCode === "UCS"
      ? "บัตรทอง"
      : schemeCode === "SSS"
        ? "ประกันสังคม"
        : schemeCode === "CSMBS"
          ? "ข้าราชการ"
          : undefined;

  const abnormal = Object.entries(input.befast ?? {})
    .filter(([, v]) => v === "yes")
    .map(([k]) => befastLabel[k] ?? k);

  const emergency: PassportEmergencyData = {
    symptom: input.symptom,
    onset: input.onset,
    befast: input.befast,
    conditions_meds: input.conditions_meds || prof?.conditions_meds || undefined,
    contact_phone: input.contact_phone || prof?.emergency_phone || undefined,
    ucep_line: UCEP_LINE,
  };

  const passport: PassportData = {
    ref_code: refCode(),
    generated_at: new Date().toISOString(),
    patient: {
      role: (slots.patient_role as string | undefined) ?? "ผู้ป่วยเอง",
      age,
      scheme: schemeLabel,
      area: (slots.area as string | undefined) ?? prof?.area_code ?? undefined,
    },
    chief_complaint: input.symptom
      ? `เหตุฉุกเฉิน — ${input.symptom}`
      : "เหตุฉุกเฉิน — อาการผิดปกติเฉียบพลัน",
    symptoms: input.symptom ? [input.symptom] : [],
    triage: { severity: "ฉุกเฉินวิกฤต" },
    rights_summary: [UCEP_LINE],
    prepared_documents: ["บัตรประชาชนตัวจริงของผู้ป่วย", "ยาที่กินประจำ (ถ้ามี)"],
    emergency,
    hotlines: [
      { number: "1669", name: "การแพทย์ฉุกเฉิน" },
      { number: "1646", name: "ศูนย์เอราวัณ (กรุงเทพฯ)" },
      { number: "1330", name: "สอบถามสิทธิ สปสช." },
    ],
    notes: abnormal.length
      ? `ผลเช็คเบื้องต้น BEFAST พบความผิดปกติที่ ${abnormal.join(", ")}${
          input.onset ? ` (เริ่มอาการ: ${input.onset})` : ""
        } — ข้อมูลนี้ให้แพทย์ใช้ประเมินภาวะหลอดเลือดสมองต่อไป`
      : undefined,
    audience: "er",
    available_audiences: availableAudiences(true),
    disclaimer: DISCLAIMER,
  };
  return { status: "ready", passport };
}

export interface BuildPassportOptions {
  /** ผู้ใช้เลือกปลายทางเองจาก dropdown "เตรียมไปที่ไหน" */
  audience?: PassportAudience;
}

export async function buildPassport(
  sb: SupabaseClient,
  sessionId: string,
  extra?: Record<string, string>,
  opts?: BuildPassportOptions
): Promise<PassportResult> {
  // ---- load session context (short-term memory) ----
  const [{ data: msgs }, { data: state }, { data: prof }, { data: audits }] = await Promise.all([
    sb.from("messages").select("role, content").eq("session_id", sessionId).order("created_at", { ascending: true }).limit(80),
    sb.from("session_state").select("slots").eq("session_id", sessionId).maybeSingle(),
    sb.from("profiles").select("birth_year, scheme, area_code, sss_section, receives_state_pension, conditions_meds").maybeSingle(),
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
  let hadEmergencyCard = false;
  for (const m of msgs ?? []) {
    const content = (m.content as string) ?? "";
    if (m.role === "user") transcript.push(`ผู้ใช้: ${content}`);
    else if (m.role === "assistant" && content.trim().startsWith("[")) {
      try {
        const parsedCards = JSON.parse(content) as Card[];
        if (parsedCards.some((c) => c.type === "safety" && c.level === "emergency")) {
          hadEmergencyCard = true;
        }
        transcript.push(...cardsToSummary(parsedCards));
      } catch {
        /* skip */
      }
    }
  }

  const profileLines: string[] = [];
  if (prof?.scheme) profileLines.push(`สิทธิ: ${prof.scheme}`);
  if (prof?.birth_year) profileLines.push(`อายุ ~${CURRENT_YEAR - (prof.birth_year as number)}`);
  if (prof?.area_code) profileLines.push(`เขต/พื้นที่: ${prof.area_code}`);

  // screening follow-up answers the user gave (e.g. "มีอาการมานานแค่ไหน → เป็นเดือนขึ้นไป")
  // — deterministic slot data, carried onto the passport verbatim (never from the LLM)
  const slots = (state?.slots ?? {}) as Understood;
  const clinicalQa = (
    Array.isArray(slots._clinical_qa) ? (slots._clinical_qa as { q: string; a: string }[]) : []
  )
    .filter((x) => x && typeof x.q === "string" && typeof x.a === "string" && x.q && x.a)
    .slice(0, 6);

  const context = [
    "สร้าง Case Passport จากข้อมูลเซสชันนี้",
    profileLines.length ? `\nโปรไฟล์ผู้ใช้: ${profileLines.join(" · ")}` : "",
    state?.slots ? `\nสิ่งที่ระบบเข้าใจ (slots): ${JSON.stringify(state.slots)}` : "",
    clinicalQa.length
      ? "\nประวัติจากการซักถามเบื้องต้น:\n" + clinicalQa.map((x) => `- ${x.q} → ${x.a}`).join("\n")
      : "",
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
    const rawObject: unknown = (res as { object?: unknown }).object;
    out = (res as { object?: AgentOut }).object;
    // direct read failed (missing/misshapen) → try unwrapping a wrapper key
    if (!out || typeof out !== "object" || !("status" in out)) out = coerceAgentOut(rawObject);
  } catch (e) {
    console.error("[passport] agent error:", (e as Error).message);
    // Rescue 1 — salvage the raw model output that Mastra attaches to
    // STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED. Confirmed in @mastra/core
    // 1.47.0 dist: MastraBaseError sets `this.details` from the error definition
    // ({ details: { value: JSON.stringify(value) } }) and Agent.generate throws
    // that MastraError as-is → the string lives at e.details.value. Check
    // e.cause.details.value too in case a future version wraps the error.
    const errAny = e as {
      details?: { value?: unknown };
      cause?: { details?: { value?: unknown } };
    };
    const rawValue = errAny?.details?.value ?? errAny?.cause?.details?.value;
    if (typeof rawValue === "string") {
      try {
        out = coerceAgentOut(JSON.parse(rawValue));
      } catch {
        /* raw output not parseable JSON — fall through to rescue 2 */
      }
      if (out) console.warn("[passport] salvaged wrapped structured output");
    }
    // Rescue 2 — last resort: ask the LLM directly (same instructions, plain
    // JSON contract). llmJson handles sonnet-5 constraints (no temperature).
    if (!out) {
      try {
        const raw = await llmJson<unknown>(context, null as unknown, {
          system:
            CASE_PASSPORT_INSTRUCTIONS +
            "\n\nตอบเป็น JSON object เดียวเท่านั้น มีฟิลด์: status ('ready'|'need_info'), missing (array, optional), passport (object, optional) ตามที่อธิบายไว้ข้างต้น ห้ามมีข้อความอื่นนอก JSON",
          maxOutputTokens: 4000,
        });
        out = coerceAgentOut(raw);
        if (out) console.warn("[passport] structured output failed — used direct llmJson fallback");
      } catch (fallbackErr) {
        console.error("[passport] llmJson fallback error:", (fallbackErr as Error).message);
      }
    }
    if (!out) throw e;
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

  // ---- detailed screening section: the 27B result itself (with rails applied) --
  const screening = prescreen
    ? {
        condition_th: conditionThaiFor(prescreen.disease) ?? out.passport.condition,
        disease_en: prescreen.disease ?? undefined,
        department: deptThai(prescreen.department),
        severity: severityThai(prescreen.severity),
        red_flags: prescreen.red_flags?.length ? prescreen.red_flags : undefined,
      }
    : undefined;
  const finalScheme = mapScheme(slots.scheme ?? out.passport?.patient?.scheme ?? prof?.scheme);

  // ---- variant system (ภาคเสริม 4): เลือกมุมมองผู้รับแบบ deterministic --------
  const hasRedFlag =
    hadEmergencyCard || (prescreen?.red_flags?.length ?? 0) > 0 || !!prescreen?.escalate_hotline;
  const allowed = availableAudiences(hasRedFlag);

  let facilityTop1Level: string | undefined;
  try {
    if (finalScheme) {
      const [top1] = await searchFacilities({
        scheme: finalScheme as Scheme,
        area: (slots.area as string | undefined) ?? prof?.area_code ?? undefined,
        limit: 1,
      });
      facilityTop1Level = top1?.level;
    }
  } catch {
    /* facility router ล่ม → ตกไป general ตามเดิม */
  }

  const decided = decideAudience({
    facilityTop1Level,
    symptoms: (slots.symptoms as string[] | undefined) ?? out.passport.symptoms ?? [],
    conditionHint: (slots.condition_hint as string | undefined) ?? out.passport.condition,
    hasRedFlag,
  });
  // Guardrail §6.1 (server-side): audience ที่ขอมาต้องอยู่ในรายการที่อนุญาต —
  // pharmacy + red flag ไม่มีทางออกจากชั้นนี้ได้
  const requested = opts?.audience && allowed.includes(opts.audience) ? opts.audience : undefined;
  const audience = requested ?? (allowed.includes(decided) ? decided : "general");

  // ทันตกรรม: ถาม 1 คำถามก่อนออกใบ (วงเงินที่ใช้ไปปีนี้) — ใช้กลไก need_info เดิม
  if (audience === "dental" && !extra?.dental_used_this_year) {
    return {
      status: "need_info",
      missing: [
        {
          field: "dental_used_this_year",
          label: "การใช้สิทธิ์ทำฟันปีนี้",
          question:
            'ปีนี้เคยใช้สิทธิ์ทำฟันไปแล้วประมาณเท่าไหร่ — พิมพ์จำนวนเงิน (บาท) หรือพิมพ์ว่า "ยังไม่เคยใช้" / "ไม่แน่ใจ"',
          type: "text",
        },
      ],
    };
  }

  const variantResult = buildVariantBlocks({
    audience,
    slots,
    scheme: (finalScheme as Scheme | undefined) ?? undefined,
    prescreen,
    safetyGateNegative: !hadEmergencyCard,
    conditionsMeds: (prof?.conditions_meds as string | undefined) ?? undefined,
    valueUnlock: computeValueUnlock(
      {
        age:
          out.passport?.patient?.age ??
          (slots.age as number | undefined) ??
          (typeof prof?.birth_year === "number" ? CURRENT_YEAR - prof.birth_year : undefined),
        scheme: finalScheme,
      },
      passportAttrs(slots, prof)
    ),
    dentalUsedThisYear: extra?.dental_used_this_year,
  });

  // ---- assemble the final passport (server adds ref/date/hotlines/disclaimer) ----
  const passport: PassportData = {
    ...out.passport,
    symptoms: out.passport.symptoms ?? [],
    rights_summary: filterPassportRights(out.passport.rights_summary ?? [], out.passport, prescreen),
    clinical_qa: clinicalQa.length ? clinicalQa : undefined,
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
      (() => {
        const age =
          out.passport?.patient?.age ??
          slots.age ??
          (typeof prof?.birth_year === "number" ? CURRENT_YEAR - prof.birth_year : undefined);
        const value = computeValueUnlock({ age, scheme: finalScheme }, passportAttrs(slots, prof));
        return passportUnclaimedValue(value, out.passport, prescreen);
      })(),
    hotlines: [
      { number: "1669", name: "การแพทย์ฉุกเฉิน" },
      ...(finalScheme === "SSS"
        ? [{ number: "1506", name: "สายด่วนประกันสังคม" }]
        : finalScheme === "CSMBS"
          ? []
          : [{ number: "1330", name: "สายด่วน สปสช." }]),
    ],
    audience,
    available_audiences: allowed,
    variant: variantResult.blocks,
    citations: dedupePassportCitations(variantResult.citations),
    disclaimer: DISCLAIMER,
  };
  return { status: "ready", passport };
}

function dedupePassportCitations(
  cs: { title: string; url: string; publisher?: string }[]
): { title: string; url: string; publisher?: string }[] {
  const seen = new Set<string>();
  return cs.filter((c) => {
    if (!c.url || seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
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
