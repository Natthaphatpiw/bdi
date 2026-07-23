// ThaiLLM-27B-Prescreen on RunPod Serverless (OpenAI-compatible route) wrapped
// with DETERMINISTIC safety rails. The model classifies; the rails — which the
// LLM cannot override — guarantee we never under-triage a red-flag case.
import { env, featureFlags } from "../env";
import { llmTextEx } from "../llm";
import {
  buildSystemPrompt,
  buildUserPrompt,
  parsePrediction,
  type PatientCase,
} from "./prompt";
import kgStatic from "./kgStatic.json";
import type { PrescreenResult } from "../types";

// 4 production severity levels (KG/vistec ruleset), least→most urgent.
const SEVERITY = [
  "Observe at Home",
  "Visit Hospital / Clinic",
  "Visit Hospital / Clinic Urgently",
  "Emergency",
];

interface RedFlag {
  id: string;
  name: string;
  syn: string;
  note: string;
  hotline: string;
}
const REDFLAGS: RedFlag[] = kgStatic.redflags;
const DISEASE_TO_COND: Record<string, string> = Object.fromEntries(
  kgStatic.conditions
    .filter((c) => c.disease_name_en)
    .map((c) => [c.disease_name_en, c.condition_id])
);

// ---- low-level RunPod call --------------------------------------------------
async function callRunpod(messages: { role: string; content: string }[]): Promise<{
  text: string;
  usage?: unknown;
}> {
  const url = `https://api.runpod.ai/v2/${env.runpodEndpointId}/openai/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.runpodApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: env.runpodAdapter, // "prescreen" LoRA adapter
      messages,
      temperature: 0,
      max_tokens: 1024,
    }),
    // Bounded wait: on a cold worker (~60-120s to compile) we abort and fall
    // back to mock+rails so the turn still returns within the function limit.
    signal: AbortSignal.timeout(env.runpodTimeoutMs),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`RunPod ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: unknown;
  };
  return { text: json.choices?.[0]?.message?.content ?? "", usage: json.usage };
}

// ---- fallback: Claude (then Gemini) triages with the SAME prompt contract ----
// Used when RunPod is unavailable / times out (cold start). Much better than the
// canned mock; the deterministic safety rails still wrap the result.
async function fallbackPredict(
  patientCase: PatientCase,
  symptomsText: string
): Promise<{ raw: string; source: "claude" | "gemini" | "mock" }> {
  try {
    const r = await llmTextEx(buildUserPrompt(patientCase), {
      system: buildSystemPrompt(),
      maxOutputTokens: 400,
    });
    if (r && /<disease>/i.test(r.text)) return { raw: r.text, source: r.provider };
  } catch (e) {
    console.error("[prescreen] llm fallback failed:", (e as Error).message);
  }
  return { raw: mockPredict(symptomsText), source: "mock" };
}

// ---- mock (offline / no creds / last resort) --------------------------------
function mockPredict(symptomsText: string): string {
  const t = symptomsText || "";
  if (t.includes("เจ็บ") && t.includes("อก"))
    return "<disease>Ischemic heart disease</disease> <department>Emergency Medicine</department> <severity>Emergency</severity>";
  if (t.includes("หมดสติ") || t.includes("ชัก") || t.includes("น้ำตาลต่ำ"))
    // intentionally under-triaged → rails must escalate
    return "<disease>Hypoglycemia</disease> <department>Internal Medicine</department> <severity>Observe at Home</severity>";
  return "<disease>Diabetes mellitus</disease> <department>Internal Medicine</department> <severity>Visit Hospital / Clinic</severity>";
}

// ---- red-flag detection (deterministic) ------------------------------------
// token เดี่ยวที่ "แรงพอ" ให้ยิง red flag ได้ด้วยตัวเอง — ต้องเป็นวลีฉุกเฉิน
// เฉพาะเจาะจง ไม่ใช่คำอาการทั่วไปที่โผล่ในเรื่องเล่าธรรมดา
const STRONG_TOKENS = [
  "หมดสติ", "ไม่รู้สึกตัว", "เรียกไม่ตื่น", "ชัก",
  "แน่นหน้าอก", "เจ็บหน้าอก", "กลางอก", "จุกอก", "จุกลิ้นปี่", "ร้าวไปแขนซ้าย",
  "ชาครึ่งซีก", "ปากเบี้ยว", "หน้าเบี้ยว", "พูดไม่ชัด", "แขนขาอ่อนแรง",
  "อาเจียนเป็นเลือด", "อาเจียนเลือด", "ถ่ายดำ", "ถ่ายมูกเลือด", "เลือดออกไม่หยุด",
  "หายใจลำบาก", "หายใจไม่ทัน", "หอบจนพูดไม่เป็นประโยค", "ปากเขียว", "ตัวเขียว",
  "นอนราบไม่ได้", "ฉี่ไม่ออก", "ไม่ปัสสาวะ",
  "อยากตาย", "คิดสั้น", "ทำร้ายตัวเอง",
  "มือเท้าเย็น", "ลมหายใจมีกลิ่นผลไม้", "หายใจหอบลึก",
];

// คำอาการทั่วไปที่ "ห้าม" นับเป็นหลักฐาน red flag ตามลำพัง (กัน false positive
// อย่าง "ปวดฟันกราม"→'กราม' ของหัวใจขาดเลือด, "ปวดท้อง"→DKA, "มีไข้"→ติดเชื้อในข้อ)
const GENERIC_TOKENS = new Set([
  "กราม", "ปวดท้อง", "มีไข้", "ไข้", "แน่น", "จุก", "เหนื่อย", "ซึม", "สับสน",
  "หน้ามืด", "ใจสั่น", "เหงื่อแตก", "อ่อนเพลียมาก", "น้ำตาลตก", "บวม", "แดง",
  "ร้อน", "เวียน", "ปวดหัว", "เจ็บ", "หอบ", "ไอ", "อาเจียน", "คลื่นไส้",
]);

/**
 * Deterministic red-flag match: token เดี่ยวยิงได้เฉพาะวลีเฉพาะเจาะจง
 * (STRONG_TOKENS); token ทั่วไปต้องเจอ ≥2 token ต่างกันของ flag เดียวกัน
 * จึงนับเป็นสัญญาณ — exported เพื่อ unit test negative cases โดยตรง
 */
export function detectRedFlags(symptomsText: string, symptomIds: string[] = []): RedFlag[] {
  const sids = new Set(symptomIds);
  const text = symptomsText || "";
  const hits: RedFlag[] = [];
  for (const rf of REDFLAGS) {
    if (sids.has(rf.id)) {
      hits.push(rf);
      continue;
    }
    const tokens = [...new Set((rf.syn + ", " + rf.name).split(/[,\s/()]+/))].filter(
      (tok) => tok.length >= 4 && text.includes(tok)
    );
    const strongHit = tokens.some((tok) => STRONG_TOKENS.some((s) => tok.includes(s) || s.includes(tok)));
    const weightyHits = tokens.filter((tok) => !GENERIC_TOKENS.has(tok));
    if (strongHit || weightyHits.length >= 2) hits.push(rf);
  }
  return hits;
}

export interface PrescreenInput {
  patientCase: PatientCase;
  symptomsText: string;
  symptomIds?: string[];
}

/** Run the 27B (or mock) and apply ER-override + min-severity-floor rails. */
export async function runPrescreen(input: PrescreenInput): Promise<PrescreenResult> {
  const { patientCase, symptomsText, symptomIds = [] } = input;
  let raw = "";
  let usage: unknown;
  let source: "runpod" | "claude" | "gemini" | "mock" = "mock";

  if (featureFlags.hasRunpod()) {
    try {
      const r = await callRunpod([
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(patientCase) },
      ]);
      raw = r.text;
      usage = r.usage;
      source = "runpod";
    } catch (e) {
      console.error("[prescreen] RunPod failed, falling back to LLM:", (e as Error).message);
      const fb = await fallbackPredict(patientCase, symptomsText);
      raw = fb.raw;
      source = fb.source;
    }
  } else {
    const fb = await fallbackPredict(patientCase, symptomsText);
    raw = fb.raw;
    source = fb.source;
  }

  const parsed = parsePrediction(raw);
  const disease = parsed.disease;
  let department = parsed.department;
  let severity = parsed.severity;

  // ---- deterministic safety rails ----
  const rails: string[] = [];
  const redflags = detectRedFlags(symptomsText, symptomIds);
  let floorIdx = 0;
  let escalate: string | null = null;

  if (redflags.length) {
    escalate = redflags[0].hotline || "1669";
    floorIdx = SEVERITY.indexOf("Emergency");
    if (department !== "Emergency Medicine") {
      department = "Emergency Medicine";
      rails.push("ER_OVERRIDE: department→Emergency Medicine");
    }
  }
  let sevIdx = severity && SEVERITY.includes(severity) ? SEVERITY.indexOf(severity) : 1;
  if (sevIdx < floorIdx) {
    rails.push(`MIN_SEVERITY_FLOOR: '${severity}'→'${SEVERITY[floorIdx]}'`);
    sevIdx = floorIdx;
  }
  severity = SEVERITY[sevIdx];

  return {
    raw,
    disease,
    condition_id: disease ? DISEASE_TO_COND[disease] ?? "" : "",
    department,
    severity,
    escalate_hotline: escalate,
    red_flags: redflags.map((r) => r.name),
    rails_applied: rails,
    safety_note: redflags.length
      ? redflags[0].note
      : "ข้อมูลทั่วไป ไม่ใช่การวินิจฉัย — หากอาการแย่ลงพบแพทย์",
    usage,
    source,
  };
}

export const PRESCREEN_SEVERITY = SEVERITY;
