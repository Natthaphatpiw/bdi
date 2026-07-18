import { readFile } from "fs/promises";
import path from "path";
import {
  SafetyStateSchema,
  type SafetyState,
  type Urgency,
} from "./contracts";
import { recordsOf, first, asString, asStringArray } from "./providers/provider-utils";
import safetyRulesV1 from "../../data/knowledge/v1/safety-rules.json";

export interface SafetyRule {
  id: string;
  phrases: string[];
  normalizedSymptom: string;
  urgencyFloor: Urgency;
  hotline: string;
  messageTh: string;
  exclusions: string[];
  sourceId: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  verificationStatus: string;
  active: boolean;
}

const URGENCY_ORDER: Urgency[] = [
  "SELF_CARE_WITH_MONITORING",
  "ROUTINE_APPOINTMENT",
  "SOON_1_3_DAYS",
  "URGENT_TODAY",
  "EMERGENCY_NOW",
];

export const BUILTIN_SAFETY_RULES: SafetyRule[] = [
  emergency("safety:unresponsive", ["หมดสติ", "เรียกไม่รู้ตัว", "เรียกไม่ตื่น", "ไม่รู้สึกตัว"], "หมดสติ/เรียกไม่รู้ตัว"),
  emergency("safety:severe_breathing", ["หายใจไม่ออก", "หายใจลำบากรุนแรง", "หอบเหนื่อยมาก", "ปากเขียว"], "หายใจลำบากรุนแรง"),
  emergency("safety:severe_chest_pain", ["เจ็บหน้าอกรุนแรง", "แน่นหน้าอกรุนแรง", "เจ็บแน่นหน้าอก", "จุกอก"], "เจ็บหน้าอกรุนแรง"),
  emergency("safety:acute_weakness", ["แขนขาอ่อนแรงเฉียบพลัน", "อ่อนแรงครึ่งซีก", "ปากเบี้ยว", "หน้าเบี้ยว"], "แขนขาอ่อนแรงเฉียบพลัน"),
  emergency("safety:acute_speech", ["พูดไม่ชัดเฉียบพลัน", "พูดไม่ชัด", "พูดไม่ได้ทันที"], "พูดไม่ชัดเฉียบพลัน"),
  emergency("safety:seizure", ["ชัก", "เกร็งกระตุก"], "ชัก"),
  emergency("safety:major_bleeding", ["เลือดออกมาก", "เลือดออกไม่หยุด", "ตกเลือด"], "เลือดออกมาก"),
  emergency("safety:acute_confusion", ["สับสนเฉียบพลัน", "ซึมลงมาก", "พูดเพ้อทันที"], "สับสนเฉียบพลัน"),
  emergency("safety:anaphylaxis", ["แพ้รุนแรง", "หน้าบวมคอบวม", "ลิ้นบวม", "ผื่นร่วมกับหายใจลำบาก"], "อาการแพ้รุนแรง"),
];

/** Versioned repository data is the default runtime rule set. The built-ins
 * remain only as a fail-closed rescue if the versioned envelope is invalid. */
const parsedVersionedRules = parseSafetyRuleRecords(safetyRulesV1);
export const VERSIONED_SAFETY_RULES: SafetyRule[] = parsedVersionedRules.length
  ? parsedVersionedRules
  : BUILTIN_SAFETY_RULES;

export async function loadSafetyRules(dataDirectory?: string): Promise<SafetyRule[]> {
  const directory = dataDirectory ?? path.join(process.cwd(), "data", "knowledge", "v1");
  try {
    const raw = await readFile(path.join(directory, "safety-rules.json"), "utf8");
    const parsed = parseSafetyRuleRecords(JSON.parse(raw) as unknown);
    return parsed.length ? parsed : BUILTIN_SAFETY_RULES;
  } catch {
    return BUILTIN_SAFETY_RULES;
  }
}

export function runSafetyPrecheck(text: string, rules: SafetyRule[] = VERSIONED_SAFETY_RULES): SafetyState {
  const normalized = normalizeThai(text);
  const matches = rules.filter((rule) =>
    isCurrentRule(rule) && rule.phrases.some((phrase) => hasAffirmedPhrase(normalized, normalizeThai(phrase), rule.exclusions)),
  );
  const floor = matches.reduce<Urgency>(
    (current, rule) => maxUrgency(current, rule.urgencyFloor),
    "SELF_CARE_WITH_MONITORING",
  );
  const emergency = floor === "EMERGENCY_NOW";
  const leading = matches.sort(
    (a, b) => urgencyRank(b.urgencyFloor) - urgencyRank(a.urgencyFloor),
  )[0];
  return SafetyStateSchema.parse({
    emergency,
    finalUrgency: floor,
    matchedRuleIds: matches.map((rule) => rule.id),
    matchedLabels: unique(matches.map((rule) => rule.normalizedSymptom)),
    hotline: leading?.hotline ?? null,
    messageTh: leading?.messageTh ?? null,
  });
}

export function applyUrgencyFloor(modelUrgency: Urgency, safetyFloor: Urgency): Urgency {
  return maxUrgency(modelUrgency, safetyFloor);
}

export function maxUrgency(a: Urgency, b: Urgency): Urgency {
  return urgencyRank(a) >= urgencyRank(b) ? a : b;
}

export function urgencyRank(urgency: Urgency): number {
  return URGENCY_ORDER.indexOf(urgency);
}

function hasAffirmedPhrase(text: string, phrase: string, exclusions: string[]): boolean {
  if (!phrase) return false;
  let from = 0;
  while (from < text.length) {
    const index = text.indexOf(phrase, from);
    if (index < 0) return false;
    const before = text.slice(Math.max(0, index - 24), index);
    const around = text.slice(Math.max(0, index - 32), Math.min(text.length, index + phrase.length + 24));
    const explicitlyExcluded = exclusions.some((pattern) => {
      try {
        return new RegExp(pattern, "i").test(around);
      } catch {
        return around.includes(normalizeThai(pattern));
      }
    });
    const negated = /(?:ไม่มี|ไม่ได้มี|ไม่ได้|มิได้|ไม่เคย|ปฏิเสธว่า|ไม่)(?:มี)?(?:อาการ)?\s*$/.test(before);
    if (!negated && !explicitlyExcluded) return true;
    from = index + phrase.length;
  }
  return false;
}

function normalizeThai(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function emergency(id: string, phrases: string[], label: string): SafetyRule {
  return {
    id,
    phrases,
    normalizedSymptom: label,
    urgencyFloor: "EMERGENCY_NOW",
    hotline: "1669",
    messageTh: "อาการที่เล่ามาอาจต้องได้รับความช่วยเหลือฉุกเฉิน โทร 1669 ทันที",
    exclusions: [],
    sourceId: "doc:niem-emergency-guidance",
    effectiveFrom: null,
    effectiveTo: null,
    verificationStatus: "VERIFIED",
    active: true,
  };
}

function parseSafetyRuleRecords(input: unknown): SafetyRule[] {
  return recordsOf(input)
    .map((row): SafetyRule => {
      const phrases = unique([
        ...asStringArray(first(row, "keywords")),
        ...asStringArray(first(row, "phrases")),
      ]);
      return {
        id: asString(first(row, "id")),
        phrases,
        // The relational fact stores a normalized symptom ID; user-facing
        // safety summaries use the first reviewed Thai phrase as the label.
        normalizedSymptom: asString(first(row, "normalizedSymptom", "normalized_symptom"), phrases[0] ?? "สัญญาณอันตราย"),
        urgencyFloor: normalizeUrgency(asString(first(row, "urgencyFloor", "urgency_floor"))),
        hotline: asString(first(row, "hotline"), "1669"),
        messageTh: asString(first(row, "messageTh", "message_th")),
        exclusions: unique([
          ...asStringArray(first(row, "exclusions")),
          ...asStringArray(first(row, "negationPatterns", "negation_patterns")),
        ]),
        sourceId: asString(first(row, "sourceId", "source_id")),
        effectiveFrom: nullableString(first(row, "effectiveFrom", "effective_from")),
        effectiveTo: nullableString(first(row, "effectiveTo", "effective_to")),
        verificationStatus: asString(first(row, "verificationStatus", "verification_status"), "UNKNOWN"),
        active: first(row, "active") !== false,
      };
    })
    .filter((rule) => rule.id && rule.phrases.length && rule.sourceId && rule.active);
}

function isCurrentRule(rule: SafetyRule, asOf = new Date().toISOString().slice(0, 10)): boolean {
  if (!rule.active || ["EXPIRED", "REJECTED"].includes(rule.verificationStatus.toUpperCase())) return false;
  return (!rule.effectiveFrom || rule.effectiveFrom <= asOf) && (!rule.effectiveTo || rule.effectiveTo >= asOf);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeUrgency(value: string): Urgency {
  return URGENCY_ORDER.includes(value as Urgency) ? (value as Urgency) : "EMERGENCY_NOW";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
