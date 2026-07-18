import {
  ExtractedCaseSchema,
  PrescreenResultSchema,
  type ExtractedCase,
  type MvpScheme,
  type PrescreenResult,
  type Urgency,
} from "./contracts";
import conditionsData from "@/data/knowledge/v1/conditions.json";
import { applyUrgencyFloor, runSafetyPrecheck } from "./safety";
import { DEMO_CASES, type DemoScenarioId } from "./demo-cases";

export interface DemoProfile {
  id: DemoScenarioId | "generic";
  aliases: string[];
  conditionIds: string[];
  serviceIds: string[];
  preferredFacilityIds: string[];
  urgency: Urgency;
  department: string | null;
  prefillAge: number | null;
  areaName: string;
  userGoal: string;
}

export const DEMO_PROFILES: DemoProfile[] = DEMO_CASES.map((item) => ({
  id: item.scenarioId,
  aliases: item.aliases,
  conditionIds: item.conditionIds,
  serviceIds: item.serviceIds,
  preferredFacilityIds: [item.primaryFacilityId, item.backupFacilityId].filter(
    (value): value is string => Boolean(value),
  ),
  urgency: item.urgency,
  department: item.departmentTh,
  prefillAge: item.age,
  areaName: item.areaName,
  userGoal: item.userGoalTh,
}));

const GENERIC_PROFILE: DemoProfile = {
  id: "generic",
  aliases: [],
  conditionIds: ["cond:acute-unspecified"],
  serviceIds: ["svc:general-acute-assessment"],
  preferredFacilityIds: [],
  urgency: "SOON_1_3_DAYS",
  department: "เวชปฏิบัติทั่วไป",
  prefillAge: null,
  areaName: "",
  userGoal: "",
};

export function resolveDemoProfile(id: string | null | undefined, narrative = ""): DemoProfile {
  const normalizedId = (id ?? "").toLowerCase();
  const byId = DEMO_PROFILES.find((profile) => profile.id === normalizedId || profile.aliases.includes(normalizedId));
  if (byId) return byId;
  const text = narrative.toLowerCase();
  if (/(ปัสสาวะบ่อย|กระหายน้ำ).*(พ่อ|68)|(?:พ่อ|68).*(ปัสสาวะบ่อย|กระหายน้ำ)/.test(text)) return DEMO_PROFILES[0];
  if (/(บัตรทอง|ต่างจังหวัด).*(กรุงเทพ|บางกะปิ)|(?:กรุงเทพ|บางกะปิ).*(บัตรทอง|ต่างจังหวัด)/.test(text)) return DEMO_PROFILES[1];
  if (/(ประกันสังคม|ขูดหินปูน|ทันตกรรม)/.test(text)) return DEMO_PROFILES[2];
  return GENERIC_PROFILE;
}

export function deterministicExtract(input: {
  narrative: string;
  patientRelation?: string;
  scheme?: MvpScheme;
  area?: string;
  demoScenarioId?: string | null;
}): ExtractedCase {
  const text = input.narrative.normalize("NFC");
  const profile = resolveDemoProfile(input.demoScenarioId, text);
  const relation = normalizeRelation(input.patientRelation, text);
  const ageMatch = /(?:อายุ\s*)?(\d{1,3})\s*(?:ปี|ขวบ)/.exec(text);
  const age = ageMatch ? clamp(Number(ageMatch[1]), 0, 125) : profile.prefillAge;
  const scheme = input.scheme && input.scheme !== "UNKNOWN" ? input.scheme : inferScheme(text);
  const areaName = input.area?.trim() || inferArea(text, profile);
  const duration = inferDuration(text, profile);
  const negated = extractNegatedSymptoms(text);
  const symptoms = inferSymptoms(text, profile, negated);
  const safety = runSafetyPrecheck(text);
  const missingCriticalFields = [
    relation === "unknown" ? "patient_relation" : null,
    !areaName ? "area" : null,
    age == null && symptoms.length ? "age" : null,
    duration.unit === "unknown" && symptoms.length ? "duration" : null,
  ].filter((value): value is string => Boolean(value));

  return ExtractedCaseSchema.parse({
    patientRelation: relation,
    age,
    ageGroup: age == null ? "unknown" : age < 18 ? "child" : age >= 60 ? "older_adult" : "adult",
    sex: relation === "father" ? "male" : relation === "mother" ? "female" : "unknown",
    symptoms,
    duration,
    onset: /ทันที|เฉียบพลัน|จู่ๆ/.test(text) ? "sudden" : "gradual",
    knownConditions: [],
    medications: [],
    allergies: [],
    scheme,
    area: { name: areaName || null, code: inferAreaCode(areaName) },
    currentLocation: null,
    preferredTime: null,
    userGoal: inferGoal(text, profile),
    redFlagMentions: safety.matchedLabels,
    negatedSymptoms: negated,
    uncertainties: scheme === "UNKNOWN" ? ["ยังไม่ทราบสิทธิรักษาหลัก"] : [],
    missingCriticalFields,
    fieldConfidence: {
      patientRelation: relation === "unknown" ? 0 : input.patientRelation ? 1 : 0.85,
      age: age == null ? 0 : 0.9,
      scheme: input.scheme && input.scheme !== "UNKNOWN" ? 1 : scheme === "UNKNOWN" ? 0 : 0.85,
      area: areaName ? (input.area ? 1 : 0.8) : 0,
    },
    overallConfidence: profile.id === "generic" ? 0.55 : 0.9,
  });
}

export function deterministicPrescreen(
  extracted: ExtractedCase,
  profile = resolveDemoProfile(null, extracted.userGoal + " " + extracted.symptoms.map((item) => item.text).join(" ")),
  urgencyFloor: Urgency = "SELF_CARE_WITH_MONITORING",
): PrescreenResult {
  const urgency = applyUrgencyFloor(profile.urgency, urgencyFloor);
  if (urgency === "EMERGENCY_NOW") {
    return PrescreenResultSchema.parse({
      urgency,
      possibleConditions: [],
      recommendedCareLevel: "emergency",
      recommendedDepartment: "บริการการแพทย์ฉุกเฉิน",
      recommendedServiceTypes: ["svc:emergency-response"],
      redFlagsToWatch: ["หมดสติหรือเรียกไม่รู้ตัว", "หายใจลำบากรุนแรง", "เจ็บหน้าอกรุนแรง"],
      clinicianQuestions: [],
      explanationTh: "ข้อมูลที่เล่ามีสัญญาณอันตราย ควรโทร 1669 ทันทีและไม่รอค้นหาสถานพยาบาลตามสิทธิ์",
      limitationsTh: "ระบบไม่สามารถประเมินอาการฉุกเฉินแทนบุคลากรทางการแพทย์ได้",
    });
  }
  const condition = conditionCopy(profile.id);
  return PrescreenResultSchema.parse({
    urgency,
    possibleConditions: condition ? [condition] : [],
    recommendedCareLevel: "primary",
    recommendedDepartment: profile.department,
    recommendedServiceTypes: profile.serviceIds,
    redFlagsToWatch: profile.id === "sss-dental"
      ? ["หน้าหรือคอบวมมาก", "ไข้สูง", "กลืนหรือหายใจลำบาก"]
      : ["หมดสติหรือเรียกไม่รู้ตัว", "หายใจลำบากรุนแรง", "เจ็บหน้าอกรุนแรง", "ซึมลงมาก"],
    clinicianQuestions: clinicianQuestions(profile.id),
    explanationTh: urgency === "ROUTINE_APPOINTMENT"
      ? "ข้อมูลตั้งต้นเหมาะกับการนัดประเมินและตรวจสอบสิทธิ์ก่อนเข้ารับบริการ"
      : "ควรให้บุคลากรทางการแพทย์ประเมินอาการภายใน 1–3 วัน หรือเร็วกว่านั้นหากอาการแย่ลง",
    limitationsTh: "ภาวะที่ระบุเป็นเพียงสิ่งที่อาจเกี่ยวข้อง ไม่ใช่การวินิจฉัย และต้องตรวจยืนยันโดยบุคลากรทางการแพทย์",
  });
}

function conditionCopy(id: DemoProfile["id"]): PrescreenResult["possibleConditions"][number] | null {
  const profile = id === "generic" ? GENERIC_PROFILE : DEMO_PROFILES.find((item) => item.id === id);
  const conditionId = profile?.conditionIds[0];
  const condition = conditionsData.records.find((item) => item.id === conditionId && item.active);
  if (!condition) return null;
  return {
    conditionId: condition.id,
    nameTh: condition.name_th,
    rationale: condition.safety_note_th,
    confidence: id === "hero-father-diabetes" ? "medium" : "low",
  };
}

function inferSymptoms(text: string, profile: DemoProfile, negated: string[]): ExtractedCase["symptoms"] {
  const routineDentalGoal = profile.id === "sss-dental"
    && /ขูดหินปูน|ตรวจฟัน/.test(text)
    && !/ปวดฟัน|ฟันผุ|เหงือกอักเสบ|บวม|ไข้|กลืนลำบาก/.test(text);
  if (routineDentalGoal) return [];
  const catalog = [
    ["sym:fatigue", "อ่อนเพลีย", /เพลีย|ไม่มีแรง/],
    ["sym:polyuria", "ปัสสาวะบ่อย", /ปัสสาวะบ่อย|ฉี่บ่อย/],
    ["sym:polydipsia", "กระหายน้ำบ่อย", /กระหายน้ำ|หิวน้ำบ่อย/],
    ["sym:dental-pain", "ปัญหาทันตกรรม", /ปวดฟัน|ฟันผุ|ขูดหินปูน|ทันตกรรม|ตรวจฟัน/],
    ["sym:fever", "ไข้", /มีไข้|ไข้ต่ำ|ไข้สูง/],
    ["sym:sore-throat", "เจ็บคอ", /เจ็บคอ/],
  ] as const;
  const found = catalog
    .filter(([, label, pattern]) => pattern.test(text) && !negated.includes(label))
    .map(([id, label]) => ({ id, text: label, normalizedName: label, present: true, confidence: 0.95 }));
  if (found.length) return found;
  if (profile.id === "generic") return [];
  return profile.id === "sss-dental"
    ? [{ id: "sym:dental-pain", text: "ต้องการรับบริการทันตกรรม", normalizedName: "ปัญหาทันตกรรม", present: true, confidence: 0.9 }]
    : [];
}

function extractNegatedSymptoms(text: string): string[] {
  const result: string[] = [];
  const checks: Array<[string, RegExp]> = [
    ["เจ็บหน้าอก", /(?:ไม่|ไม่มี)\s*(?:มี)?\s*อาการ?เจ็บหน้าอก/],
    ["หายใจลำบาก", /(?:ไม่|ไม่มี)\s*(?:มี)?\s*(?:อาการ)?หายใจ(?:ไม่ออก|ลำบาก)/],
    ["หมดสติ", /(?:ไม่|ไม่มี)\s*(?:มี)?\s*(?:อาการ)?หมดสติ/],
    ["ซึม", /(?:ไม่|ไม่มี)\s*(?:มี)?\s*(?:อาการ)?ซึม/],
  ];
  for (const [label, pattern] of checks) if (pattern.test(text)) result.push(label);
  return result;
}

function inferDuration(text: string, profile: DemoProfile): ExtractedCase["duration"] {
  const match = /(\d+)\s*(ชั่วโมง|วัน|สัปดาห์|เดือน)/.exec(text);
  if (match) {
    const units = { ชั่วโมง: "hours", วัน: "days", สัปดาห์: "weeks", เดือน: "months" } as const;
    return { value: Number(match[1]), unit: units[match[2] as keyof typeof units], raw: match[0] };
  }
  if (profile.id === "sss-dental") return { value: null, unit: "unknown", raw: null };
  return { value: null, unit: "unknown", raw: null };
}

function inferGoal(text: string, profile: DemoProfile): string {
  if (profile.id !== "generic") return profile.userGoal;
  return text.trim().slice(0, 500) || "ต้องการเส้นทางเข้ารับบริการที่เหมาะสม";
}

function inferScheme(text: string): MvpScheme {
  if (/บัตรทอง|หลักประกันสุขภาพ/.test(text)) return "UCS";
  if (/ประกันสังคม|ผู้ประกันตน/.test(text)) return "SSS";
  if (/ข้าราชการ|เบิกตรง/.test(text)) return "CSMBS";
  if (/ประกันเอกชน/.test(text)) return "PRIVATE";
  return "UNKNOWN";
}

function inferArea(text: string, profile: DemoProfile): string {
  for (const area of ["ลาดพร้าว", "บางกะปิ", "ห้วยขวาง", "กรุงเทพฯ", "กรุงเทพ"]) if (text.includes(area)) return area;
  return profile.areaName;
}

function inferAreaCode(area: string): string | null {
  if (area.includes("ลาดพร้าว")) return "BKK-LATPHRAO";
  if (area.includes("บางกะปิ")) return "BKK-BANGKAPI";
  if (area.includes("ห้วยขวาง")) return "BKK-HUAIKHWANG";
  return null;
}

function normalizeRelation(value: string | undefined, text: string): ExtractedCase["patientRelation"] {
  const allowed = ["self", "father", "mother", "child", "relative", "other", "unknown"] as const;
  if (value && allowed.includes(value as (typeof allowed)[number])) return value as ExtractedCase["patientRelation"];
  if (/พ่อ|บิดา/.test(text)) return "father";
  if (/แม่|มารดา/.test(text)) return "mother";
  if (/ลูก/.test(text)) return "child";
  if (/ฉัน|ผม|ดิฉัน|ตัวเอง/.test(text)) return "self";
  return "unknown";
}

function clinicianQuestions(id: DemoProfile["id"]): string[] {
  if (id === "hero-father-diabetes") return ["ควรตรวจระดับน้ำตาลหรือการตรวจใดเพิ่มเติม", "ยาที่ใช้อยู่มีผลต่ออาการหรือไม่"];
  if (id === "sss-dental") return ["บริการใดเหมาะกับสภาพช่องปากในครั้งนี้", "ต้องนัดหมายหรือเตรียมเอกสารสิทธิ์อะไร"];
  return ["อาการนี้จำเป็นต้องตรวจเพิ่มเติมหรือไม่", "ถ้าอาการแย่ลงควรกลับมาหรือไปฉุกเฉินเมื่อใด"];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
