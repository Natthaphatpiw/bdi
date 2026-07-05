// The orchestrator — turns one health story into ordered AnswerCards.
// Pipeline (product-architecture.md §4): safety pre-check → NLU (Claude sonnet-5,
// Gemini fallback) → prescreen (RunPod 27B + rails) ∥ KG ∥ rule engine → synthesis.
// Deterministic facts come from KG + rule engine; the LLM only verbalizes.
import { safeParseJson } from "./gemini";
import { llmJson, llmText } from "./llm";
import { featureFlags } from "./env";
import { safetyPreCheck, emergencyCardFromHotline } from "./safety";
import { runPrescreen } from "./runpod/prescreen";
import type { PatientCase } from "./runpod/prompt";
import {
  servicesForScheme,
  recommendedServices,
  benefitsForScheme,
  searchFacilities,
  comorbidityFor,
  rightInfo,
  benefitById,
  SCHEME_LABELS,
} from "./kg";
import { evaluateRule, getRule, evaluateBenefit, questionFor, ATTR_QUESTIONS_TH } from "./ruleEngine";
import { retrieveKgChunks, retrieveUserDocs } from "./retrieve";
import { computeValueUnlock } from "./valueUnlock";
import { buildOptionsCard, optionCitations } from "./options";
import { deptThai, severityThai } from "./triageLabels";
import type {
  Card,
  Understood,
  Profile,
  Scheme,
  Intent,
  BenefitCard,
  EvidenceCard,
  PrescreenResult,
  TurnQuestion,
  ValueUnlockCard,
} from "./types";

const CURRENT_YEAR = new Date().getFullYear();

export interface TurnContext {
  text: string;
  profile: Profile;
  priorSlots: Understood;
  userId: string;
  channel: "web" | "line";
  hasDoc?: boolean;
  documentId?: string;
  /** structured answers to a previous questions panel — merged without NLU */
  answers?: Record<string, string>;
  /** one-shot quick-chip values (patient_role/scheme/area) from the home screen */
  prefill?: Record<string, string>;
}

export interface TurnResult {
  understood: Understood;
  pending_question: string | null;
  quick_replies?: string[];
  questions?: TurnQuestion[];
  cards: Card[];
  audit: {
    queries_run: string[];
    rule_traces: unknown[];
    citations: { title: string; url: string; publisher: string }[];
    prescreen_result: unknown;
  };
}

// ---- 0) base slots: prior session slots + profile defaults ------------------
function baseSlots(ctx: TurnContext): Understood {
  const base: Understood = { ...ctx.priorSlots };
  if (ctx.profile.scheme && !base.scheme) base.scheme = ctx.profile.scheme;
  if (ctx.profile.birth_year && !base.age) base.age = CURRENT_YEAR - ctx.profile.birth_year;
  return base;
}

// Affirmative answer values only — negative answers ("ไม่มีอาการเหล่านี้") must
// not feed keyword-based red-flag detection even if they contain scary words.
function affirmativeAnswerText(answers: Record<string, string>): string {
  return Object.values(answers)
    .map((v) => (v ?? "").trim())
    .filter((v) => v && !/^(ไม่|ยังไม่|ปกติ|ไม่มี|ไม่เคย|ไม่แน่ใจ)/.test(v))
    .join(" ");
}

// ---- 0b) deterministic merge of structured answers (no NLU → no hallucination)
function applyAnswers(base: Understood, answers: Record<string, string>): Understood {
  const u: Understood = { ...base };
  // remember every answered field — "ไม่แน่ใจ" deliberately leaves its slot null
  // (rule stays INDETERMINATE), and without this marker buildQuestions would
  // re-ask the same question forever
  const prevAnswered = (base._answered as string[] | undefined) ?? [];
  u._answered = [...new Set([...prevAnswered, ...Object.keys(answers)])];
  for (const [field, raw] of Object.entries(answers)) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    if (field === "__review_confirm") {
      u._review_confirm = true;
    } else if (field === "scheme") {
      if (/ประกันสังคม|ประกันตน|มาตรา|SSS/i.test(v)) u.scheme = "SSS";
      else if (/ข้าราชการ|รัฐวิสาหกิจ|เบิก|CSMBS/i.test(v)) u.scheme = "CSMBS";
      // บัตรทอง / ไม่แน่ใจ → UCS (สิทธิพื้นฐานตามกฎหมายเมื่อไม่มีสิทธิอื่น)
      else u.scheme = "UCS";
    } else if (field === "age") {
      const nums = v.match(/\d+/g)?.map(Number) ?? [];
      if (/ต่ำกว่า\s*60/.test(v)) u.age = 50;
      else if (/ขึ้นไป/.test(v) && nums.length) u.age = nums[0] + 2;
      else if (nums.length >= 2) u.age = Math.round((nums[0] + nums[1]) / 2);
      else if (nums.length === 1) u.age = nums[0];
    } else if (field === "area") {
      u.area = v.replace(/^เขต\s*/, "").trim();
    } else if (field === "patient_role") {
      u.patient_role = v;
    } else if (field === "symptoms") {
      const parts = v
        .split(/[,\n·]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length) u.symptoms = parts;
    } else if (field === "condition_hint") {
      u.condition_hint = v;
    } else if (field === "pension") {
      // เบี้ยผู้สูงอายุ disqualifier: รับบำนาญ/เบี้ยหวัดจากรัฐอยู่ไหม
      if (/ไม่ได้รับ|ไม่รับ|ไม่มี/.test(v)) u.receives_state_pension = false;
      else if (/ได้รับ|รับอยู่|มี/.test(v)) u.receives_state_pension = true;
      // ไม่แน่ใจ → leave unknown (rule stays INDETERMINATE, never guessed)
    } else if (field === "sss_section") {
      const m = v.match(/33|39|40/);
      if (m) u.sss_section = parseInt(m[0], 10);
    } else if (field === "sss_months") {
      // เงื่อนไขรักษาพยาบาล ปกส.: ส่งสมทบ ≥3 เดือนใน 15 เดือน
      if (/เกิน|มากกว่า|ครบ|ใช่/.test(v)) u.contribution_months_in_last_15 = 6;
      else if (/ไม่ถึง|น้อยกว่า|ยังไม่/.test(v)) u.contribution_months_in_last_15 = 1;
      // ไม่แน่ใจ → leave unknown
    } else if (field.startsWith("clin_")) {
      // clinical follow-up answer → pair with its stored question and append to
      // the Q/A history the 27B prescreen consumes (conversation field)
      const asked = (base._clinical_questions as { field: string; question: string }[] | undefined) ?? [];
      const q = asked.find((c) => c.field === field);
      const qa = (u._clinical_qa as { q: string; a: string }[] | undefined) ?? [];
      u._clinical_qa = [...qa, { q: q?.question ?? field, a: v }];
    } else {
      u[field] = v;
    }
  }
  return u;
}

// ---- 0d) clinical follow-up questions (fed into the 27B conversation) -------
// Generated once per symptom set; answered via clickable options like the rest.
async function generateClinicalQuestions(u: Understood, text: string): Promise<TurnQuestion[]> {
  if (!featureFlags.hasLLM()) return [];
  const prompt = `คุณเป็นพยาบาลคัดกรอง ตั้งคำถามติดตามอาการที่สำคัญที่สุดต่อการประเมินความเร่งด่วน 2-3 ข้อ
อาการที่ผู้ป่วยเล่า: "${(u.symptoms ?? []).join(", ")}" (ข้อความเต็ม: "${text}")
กติกา:
- ภาษาไทยง่ายๆ สั้น คนทั่วไปเข้าใจ ถามทีละประเด็น (เช่น เป็นมานานเท่าไหร่ / มีอาการอันตรายร่วมไหม / ความรุนแรง)
- แต่ละข้อมีตัวเลือกตอบสั้นๆ 2-4 ตัวเลือก ครอบคลุมคำตอบที่พบบ่อย
- ห้ามถามข้อมูลส่วนตัว (อายุ สิทธิ พื้นที่) และห้ามถามซ้ำสิ่งที่ผู้ป่วยบอกแล้ว
ตอบเป็น JSON array เท่านั้น: [{"question":"...","options":["...","..."]}]`;
  const out = await llmJson<{ question: string; options: string[] }[]>(prompt, [], {
    maxOutputTokens: 700,
  });
  return (Array.isArray(out) ? out : [])
    .filter((q) => q?.question && Array.isArray(q.options) && q.options.length >= 2)
    .slice(0, 3)
    .map((q, i) => ({
      field: `clin_${i}`,
      label: q.question,
      question: "",
      options: q.options.slice(0, 4),
      allow_other: true,
      other_placeholder: "พิมพ์คำตอบ",
    }));
}

// ---- 0c) which questions must be answered before the deep analysis ----------
// Eligibility-discovery battery: enough to know WHICH rights this person can
// actually claim (scheme → SSS details; age → elder allowance → pension check).
// Conditional questions use show_if so the client stepper skips them unless the
// earlier answer makes them relevant.
const SCHEME_OPTIONS = ["บัตรทอง", "ประกันสังคม", "ข้าราชการ", "ไม่แน่ใจ"];
const AGE_OPTIONS = ["ต่ำกว่า 60 ปี", "60-69 ปี", "70-79 ปี", "80-89 ปี", "90 ปีขึ้นไป"];
const ELDER_BANDS = ["60-69 ปี", "70-79 ปี", "80-89 ปี", "90 ปีขึ้นไป"];
const AREA_OPTIONS = ["บางกะปิ", "ลาดพร้าว", "ห้วยขวาง", "วังทองหลาง"];

function buildQuestions(u: Understood): TurnQuestion[] {
  const intent = u.intent;
  // symptoms present = full battery regardless of the classified intent
  // (e.g. "เบาหวาน... พาไปตรวจที่ไหนดี" classifies as facility_search but still
  // needs age for rights matching)
  const symptomFlow = (u.symptoms?.length ?? 0) > 0;
  const rightsRelevant =
    symptomFlow ||
    ["symptom_triage", "rights_discovery", "benefit_eligibility", "facility_search"].includes(intent ?? "");
  const needAge =
    symptomFlow || ["symptom_triage", "benefit_eligibility", "rights_discovery"].includes(intent ?? "");
  const needArea = symptomFlow || ["symptom_triage", "facility_search"].includes(intent ?? "");

  const qs: TurnQuestion[] = [];

  // 1) scheme — "จ่ายประกันสังคมอยู่ไหม / มีสิทธิอะไร"
  const schemeUnknown = rightsRelevant && !u.scheme;
  if (schemeUnknown)
    qs.push({
      field: "scheme",
      label: "สิทธิการรักษา",
      question: "มีสิทธิการรักษาแบบไหน / จ่ายประกันสังคมอยู่หรือไม่",
      options: SCHEME_OPTIONS,
      allow_other: true,
      other_placeholder: "เช่น ประกันเอกชน",
    });

  // 2) SSS details — only when ประกันสังคม (known or just answered)
  const isSSS = u.scheme === "SSS";
  const sssShowIf = schemeUnknown ? { field: "scheme", any_of: ["ประกันสังคม"] } : undefined;
  if (rightsRelevant && (isSSS || schemeUnknown) && u.sss_section == null)
    qs.push({
      field: "sss_section",
      label: "มาตราประกันสังคม",
      question: "เป็นผู้ประกันตนมาตราไหน",
      options: ["ม.33 (พนักงานบริษัท)", "ม.39 (สมัครใจ)", "ม.40 (อาชีพอิสระ)", "ไม่แน่ใจ"],
      allow_other: false,
      show_if: sssShowIf,
    });
  if (rightsRelevant && (isSSS || schemeUnknown) && u.contribution_months_in_last_15 == null)
    qs.push({
      field: "sss_months",
      label: "การส่งเงินสมทบ",
      question: "ส่งเงินสมทบต่อเนื่องเกิน 3 เดือน (ใน 15 เดือนล่าสุด) หรือไม่",
      options: ["เกิน 3 เดือน", "ไม่ถึง 3 เดือน", "ไม่แน่ใจ"],
      allow_other: false,
      show_if: sssShowIf,
    });

  // 3) age — unlocks เบี้ยผู้สูงอายุ ฯลฯ
  const ageUnknown = needAge && u.age == null;
  if (ageUnknown)
    qs.push({
      field: "age",
      label: "อายุผู้ป่วย",
      question: "ผู้ป่วยอายุเท่าไหร่ (ช่วยจับคู่สิทธิ์ เช่น เบี้ยผู้สูงอายุ)",
      options: AGE_OPTIONS,
      allow_other: true,
      other_placeholder: "พิมพ์อายุเป็นตัวเลข",
    });

  // 4) pension — เบี้ยผู้สูงอายุ disqualifier; asked only for 60+
  const elder = (u.age ?? 0) >= 60;
  if (rightsRelevant && (elder || ageUnknown) && u.receives_state_pension == null)
    qs.push({
      field: "pension",
      label: "บำนาญ/รายได้ประจำจากรัฐ",
      question:
        "ผู้ป่วยรับบำนาญ เบี้ยหวัด หรือมีเงินเดือน/รายได้ประจำจากรัฐหรือไม่ (มีผลต่อเบี้ยยังชีพผู้สูงอายุ)",
      options: ["ไม่ได้รับ", "ได้รับอยู่", "ไม่แน่ใจ"],
      allow_other: false,
      show_if: ageUnknown ? { field: "age", any_of: ELDER_BANDS } : undefined,
    });

  // 5) area — facility matching
  if (needArea && !u.area)
    qs.push({
      field: "area",
      label: "พื้นที่",
      question: "อยู่เขต/อำเภอไหน (เพื่อหาสถานพยาบาลใกล้บ้านที่รับสิทธิ์)",
      options: AREA_OPTIONS,
      allow_other: true,
      other_placeholder: "พิมพ์ชื่อเขต/อำเภอ",
    });
  // never re-ask a question the user already answered (incl. "ไม่แน่ใจ",
  // which intentionally leaves its slot null → rule stays INDETERMINATE)
  const answered = new Set((u._answered as string[] | undefined) ?? []);
  return qs.filter((q) => !answered.has(q.field));
}

// ---- 1) NLU: extract structured understanding -------------------------------
async function extractUnderstanding(
  ctx: TurnContext
): Promise<{ u: Understood; freshSymptoms: string[] }> {
  const base = baseSlots(ctx);

  const prompt = `คุณเป็นตัวสกัดข้อมูล (information extraction) จากข้อความสุขภาพภาษาไทย ตอบเป็น JSON เท่านั้น
กฎเด็ดขาด:
- สกัดเฉพาะข้อมูลที่ปรากฏชัดเจนในข้อความ หรืออยู่ใน "ข้อมูลที่ทราบแล้ว" เท่านั้น
- ห้ามเดา ห้ามสมมติ ห้ามอนุมานจากโรคหรือบริบท เช่น อย่าเดาอายุ และอย่าเดาสิทธิการรักษา (scheme) ถ้าผู้ใช้ไม่ได้บอกตรงๆ
- ถ้าไม่ทราบฟิลด์ไหน ให้ใส่ null

ข้อความผู้ใช้ล่าสุด: "${ctx.text}"
ข้อมูลที่ทราบแล้ว: ${JSON.stringify(base)}

สกัดเป็น JSON ตามคีย์นี้:
{
 "patient_role": "ผู้ป่วยเอง|ผู้ดูแล|null",
 "age": "number|null   // เฉพาะเมื่อมีตัวเลขอายุในข้อความ",
 "scheme": "UCS|SSS|CSMBS|null   // เฉพาะเมื่อผู้ใช้ระบุ: บัตรทอง=UCS ประกันสังคม=SSS ข้าราชการ=CSMBS",
 "area": "ชื่อเขต/อำเภอ|null",
 "symptoms": ["อาการเป็นคำสั้นๆ"],
 "condition_hint": "โรคที่กล่าวถึง เช่น เบาหวาน|null",
 "intent": "symptom_triage|rights_discovery|facility_search|benefit_eligibility|document_qa|general_info"
}`;
  const extracted = await llmJson<Partial<Understood>>(prompt, {}, { maxOutputTokens: 700 });

  // Deterministic guard against hallucinated demographics: only accept a scheme /
  // age that the user actually mentioned (or that we already knew).
  if (
    extracted.scheme &&
    !base.scheme &&
    !/บัตรทอง|30 ?บาท|สปสช|ประกันสังคม|ประกันตน|มาตรา ?(33|39|40)|ข้าราชการ|เบิกได้|กรมบัญชีกลาง|UCS|SSS|CSMBS/i.test(ctx.text)
  ) {
    delete extracted.scheme;
  }
  if (extracted.age != null && base.age == null && !/\d|อายุ|ขวบ|ปี/.test(ctx.text)) {
    delete extracted.age;
  }

  // symptoms newly introduced THIS turn (not carried over) — drives whether we
  // need to (re)run the 27B prescreen.
  const priorSet = new Set(base.symptoms ?? []);
  const freshSymptoms = (extracted.symptoms ?? []).filter((s) => s && !priorSet.has(s));

  const merged: Understood = { ...base, ...stripEmpty(extracted) };
  // keep prior symptoms ∪ new
  const sym = [...new Set([...(base.symptoms ?? []), ...(extracted.symptoms ?? [])])].filter(Boolean);
  if (sym.length) merged.symptoms = sym;
  if (!merged.intent) merged.intent = inferIntent(ctx.text, merged);
  return { u: merged, freshSymptoms };
}

function stripEmpty<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === "" || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

function inferIntent(text: string, u: Understood): Intent {
  if (u.symptoms?.length) return "symptom_triage";
  if (/สิทธิ|ประกันสังคม|บัตรทอง|เบิก|ได้อะไร/.test(text)) return "rights_discovery";
  if (/ที่ไหน|โรงพยาบาล|คลินิก|รพ\.|ใกล้/.test(text)) return "facility_search";
  if (u.scheme) return "rights_discovery";
  return "general_info";
}

// ---- 2) build the patient case for prescreen --------------------------------
function buildCase(u: Understood, profile: Profile, text: string): PatientCase {
  return {
    age: u.age,
    gender: undefined,
    complaint: text,
    primary_symptom: u.symptoms?.[0],
    secondary_symptoms: u.symptoms?.slice(1),
    underlying_diseases: u.condition_hint ? [u.condition_hint] : undefined,
    // answered clinical follow-ups → the Q/A history the 27B was trained on
    conversation: (u._clinical_qa as { q: string; a: string }[] | undefined) ?? undefined,
  };
}

// ---- 3) attrs for the rule engine -------------------------------------------
function buildAttrs(u: Understood, profile: Profile): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (u.age != null) attrs.age = u.age;
  if (u.area) attrs.registered_in_area = u.area;
  if (u.scheme) attrs.scheme = u.scheme;
  // Product assumption (documented in the rule trace): Thai public health-rights
  // schemes require Thai nationality, so a user of this flow is treated as Thai.
  attrs.thai_nationality = true;
  // answered in-chat (questions panel) wins over profile
  const sssSection = (u.sss_section as number | undefined) ?? profile.sss_section;
  if (sssSection != null) attrs.sss_section = sssSection;
  const months = u.contribution_months_in_last_15 as number | undefined;
  if (months != null) attrs.contribution_months_in_last_15 = months;
  const pension = (u.receives_state_pension as boolean | undefined) ?? profile.receives_state_pension;
  if (pension != null) {
    attrs.receives_state_pension_or_benapd = pension;
    // the panel question text covers regular state income too; institutional
    // residents (สถานสงเคราะห์) are outside this self-serve flow
    attrs.receives_regular_state_salary_or_income = pension;
    attrs.resides_in_state_welfare_institution = false;
  }
  return attrs;
}

// ---- main (progressive) -----------------------------------------------------
// `emit` fires for `understood` and for each card the moment its tool finishes,
// so the UI fills in live (ChatGPT-style). Cards are re-pinned to canonical order
// client-side (CardStack), so streaming arrival order doesn't matter.
export type StreamEmit = (type: "understood" | "card" | "questions", data: unknown) => void;
const NOOP_EMIT: StreamEmit = () => {};

export async function runTurnStream(
  ctx: TurnContext,
  emit: StreamEmit = NOOP_EMIT
): Promise<TurnResult> {
  const queries_run: string[] = [];
  const citations: { title: string; url: string; publisher: string }[] = [];
  const ruleTraces: unknown[] = [];
  const cards: Card[] = [];
  const push = (card: Card) => {
    cards.push(card);
    emit("card", card);
  };

  // (1) deterministic safety pre-check (instant — runs even before questions).
  // CRITICAL: on answers turns the text is a summary that INCLUDES the question
  // labels (e.g. "มีอาการหมดสติร่วมด้วยไหม: ไม่มี") — keyword-matching that would
  // fire a false emergency. Only AFFIRMATIVE answer values count as safety text.
  const safetyText = ctx.answers ? affirmativeAnswerText(ctx.answers) : ctx.text;
  const pre = safetyPreCheck(safetyText);
  if (pre.card) push(pre.card);

  // (2) understanding: structured answers merge deterministically (no NLU),
  //     free text goes through guarded NLU extraction.
  let u: Understood;
  if (ctx.answers && Object.keys(ctx.answers).length) {
    u = applyAnswers(baseSlots(ctx), ctx.answers);
    queries_run.push("answers_merge(deterministic)");
  } else {
    ({ u } = await extractUnderstanding(ctx));
  }
  // one-shot quick chips (role/scheme/area) ride the first text turn; merged via
  // the same deterministic path AFTER NLU so a chip always beats an NLU guess
  if (ctx.prefill && Object.keys(ctx.prefill).length) {
    u = applyAnswers(u, ctx.prefill);
    queries_run.push("prefill_merge(deterministic)");
  }
  emit("understood", u);

  // (3) GATE — if the screening/rights matching still lacks required info,
  //     ask ALL missing questions at once (clickable options + อื่นๆ) and stop.
  //     EMERGENCY BYPASS: when the pre-check finds red flags we never hold the
  //     answer hostage to questions — respond immediately with what we have.
  const symKey = (u.symptoms ?? []).join("|");
  const isSymptomFlow = u.intent === "symptom_triage" || (u.symptoms?.length ?? 0) > 0;

  if (!pre.emergency) {
    let questions = buildQuestions(u);
    // clinical follow-ups: once per symptom set, before the deep analysis, so
    // the 27B triages with the same Q/A style it was trained on.
    if (
      isSymptomFlow &&
      symKey &&
      !u._review_confirm &&
      u._clinical_for !== symKey &&
      u._prescreened_symptoms !== symKey
    ) {
      const clin = await generateClinicalQuestions(u, ctx.text);
      if (clin.length) {
        u._clinical_questions = clin.map((c) => ({ field: c.field, question: c.label }));
        u._clinical_for = symKey;
        questions = [...clin, ...questions];
      }
    }
    if (questions.length) {
      emit("questions", questions);
      return {
        understood: u,
        pending_question: null,
        questions,
        cards,
        audit: { queries_run, rule_traces: [], citations: [], prescreen_result: null },
      };
    }
  }

  const scheme = u.scheme as Scheme | undefined;
  const attrs = buildAttrs(u, ctx.profile);
  // same rule for the red-flag detector inside the prescreen rails: question
  // labels must never leak into the keyword-matched symptom text
  const symptomsText = (u.symptoms ?? []).join(" ") + " " + safetyText;

  // (4) PRESCREEN FIRST (ThaiLLM-27B + rails) — the screening result drives
  //     which rights we show. Re-run only when the symptom set changed.
  const needPrescreen = (u.symptoms?.length ?? 0) > 0 && u._prescreened_symptoms !== symKey;
  let prescreen: PrescreenResult | null =
    !needPrescreen && u._last_prescreen
      ? (u._last_prescreen as PrescreenResult)
      : null;

  if (needPrescreen) {
    prescreen = await runPrescreen({
      patientCase: buildCase(u, ctx.profile, ctx.text),
      symptomsText,
    });
    u._prescreened_symptoms = symKey; // persisted via session_state
    u._last_prescreen = prescreen;
    queries_run.push(`prescreen(${prescreen.source})+rails`);
    if (prescreen.escalate_hotline) {
      push(emergencyCardFromHotline(prescreen.safety_note, prescreen.escalate_hotline, prescreen.red_flags));
    }
  }

  // condition in focus (from the 27B mapping, else the mentioned condition)
  const condId =
    prescreen?.condition_id || (u.condition_hint ? condIdFromHint(u.condition_hint) : "");

  // captured for the post-barrier synthesis
  let benefitCard: BenefitCard | null = null;
  let hasFacility = false;

  const tasks: Promise<void>[] = [];

  // shared fetch: case-relevant services (used by BOTH the care synthesis and
  // the rights card, so the advice names the actual free tests)
  const emergencyCase = pre.emergency || !!prescreen?.escalate_hotline;
  const servicesPromise: Promise<import("./kg").CoveredService[]> = scheme
    ? (async () => {
        let services =
          isSymptomFlow && (condId || prescreen?.disease)
            ? await recommendedServices({
                conditionId: condId || undefined,
                diseaseNameEn: prescreen?.disease ?? undefined,
                scheme,
                age: u.age, // never surface age-gated services to the wrong age
              })
            : [];
        if (!services.length) {
          const all = await servicesForScheme(scheme);
          const age = u.age ?? 999;
          services = all.filter((s) => (s.age_min ?? 0) <= age);
        }
        return rankServicesForCase(services, { emergencyCase, condId });
      })()
    : Promise.resolve([]);

  // care card — consultative text from the screening result, made ACTIONABLE:
  // names the suspected condition + the actual free tests under the user's right
  if (prescreen) {
    const pr = prescreen;
    tasks.push(
      (async () => {
        const [comorbid, services] = await Promise.all([
          condId && scheme ? comorbidityFor(condId, scheme) : Promise.resolve([]),
          servicesPromise,
        ]);
        const careBody = await synthCareBody(u, pr, comorbid, {
          scheme: scheme ? SCHEME_LABELS[scheme] ?? scheme : undefined,
          services: services.slice(0, 2).map((s) => s.name),
        });
        push({
          type: "care",
          title: "ผลคัดกรองเบื้องต้น — วันนี้ควรทำอะไร",
          body: careBody,
          department: deptThai(pr.department),
        });
      })()
    );
  }

  // rights — RELEVANT ONLY: services the KG recommends for the screened
  // condition; fall back to age-appropriate essentials, never the whole catalog.
  if (scheme) {
    tasks.push(
      (async () => {
        const services = await servicesPromise;
        const title = isSymptomFlow
          ? `สิทธิ์ที่เกี่ยวกับเคสนี้ (${SCHEME_LABELS[scheme] ?? scheme})`
          : `สิทธิ์ที่ครอบคลุม (${SCHEME_LABELS[scheme] ?? scheme})`;
        queries_run.push(isSymptomFlow ? `R1 recommended(${scheme})` : `R1 services(${scheme})`);
        if (services.length) {
          push({
            type: "rights",
            title,
            items: services.slice(0, 6).map((s) => ({
              name: s.name,
              copay: s.copay || "ไม่มีค่าใช้จ่าย",
              interval: s.interval,
            })),
          });
          const ri = rightInfo(scheme);
          if (ri?.source_url)
            citations.push({ title: ri.source_title ?? ri.name_th, url: ri.source_url, publisher: ri.publisher ?? "" });
        }
      })()
    );
  }

  // benefit (rule engine) + value-unlock — for symptom flow keep only benefits
  // relevant to being sick (no maternity/death/child dumps).
  if (scheme || (u.age ?? 0) >= 55) {
    tasks.push(
      (async () => {
        let benefits = scheme ? await benefitsForScheme(scheme) : [];
        if (scheme) queries_run.push(`R2 benefits(${scheme})`);
        if (isSymptomFlow) {
          benefits = benefits.filter((b) => /SICK|MEDICAL|HEALTH|DENTAL/i.test(b.benefit_id));
        }
        benefitCard = buildBenefitCard(u, scheme, benefits, attrs, ruleTraces, citations);
        if (benefitCard) push(benefitCard);
        const value = computeValueUnlock({ age: u.age, scheme }, attrs);
        if (value) push(value);
      })()
    );
  }

  // facility
  if (scheme) {
    tasks.push(
      (async () => {
        const facilities = await searchFacilities({ scheme, area: u.area, conditionId: condId || undefined });
        queries_run.push(`facility_match(${scheme})`);
        if (facilities.length) {
          hasFacility = true;
          push({ type: "facility", title: "ไปที่ไหน", items: facilities.slice(0, 2) });
        }
      })()
    );
  }

  // graphrag citations (no card)
  tasks.push(
    (async () => {
      const chunks = await retrieveKgChunks(ctx.text, 4);
      if (chunks.length) {
        queries_run.push("graphrag_retrieve");
        for (const c of chunks)
          if (c.source_url) citations.push({ title: c.source_title || c.name, url: c.source_url, publisher: c.publisher || "" });
      }
    })()
  );

  // document QA (no card; citations folded into evidence)
  if (ctx.hasDoc) {
    tasks.push(
      (async () => {
        const docChunks = await retrieveUserDocs(ctx.text, ctx.userId, 4);
        if (docChunks.length) queries_run.push("document_qa(user_doc_chunks)");
      })()
    );
  }

  await Promise.all(tasks);

  // next steps (needs prescreen + benefit)
  const checklist = await synthNextSteps(u, prescreen, benefitCard, hasFacility);
  if (checklist.length) push({ type: "next_steps", title: "ขั้นตอนถัดไป", checklist });

  // private alternatives + real insurance products. Deterministic from verified
  // JSON, then cited in the evidence drawer. This keeps the product broader than
  // government benefits without asking the LLM to invent offers.
  if (isSymptomFlow || scheme) {
    const optionsCard = buildOptionsCard(u, scheme);
    push(optionsCard);
    citations.push(...optionCitations(optionsCard));
  }

  // evidence (last)
  push({
    type: "evidence",
    title: "ที่มา & ความน่าเชื่อถือ",
    sources: dedupeCitations(citations).slice(0, 8),
    rule_traces: ruleTraces as EvidenceCard["rule_traces"],
    disclaimer:
      "คำแนะนำเบื้องต้น ไม่ใช่การวินิจฉัยแทนแพทย์ · สิทธิ์ตัดสินด้วย rule engine (ไม่ใช่ AI) · ไม่เก็บข้อมูลส่วนตัวถ้าไม่ยินยอม",
  });

  return {
    understood: u,
    pending_question: null,
    cards,
    audit: {
      queries_run,
      rule_traces: ruleTraces,
      citations: dedupeCitations(citations),
      prescreen_result: prescreen,
    },
  };
}

/** Non-streaming convenience wrapper. */
export function runTurn(ctx: TurnContext): Promise<TurnResult> {
  return runTurnStream(ctx);
}

// ---- helpers ----------------------------------------------------------------
// Rank case-relevant services: screening/chronic-care first; emergency, mental
// health and dialysis lines are noise for a routine case — keep them only when
// the case actually calls for them.
function rankServicesForCase(
  services: import("./kg").CoveredService[],
  opts: { emergencyCase: boolean; condId: string }
): import("./kg").CoveredService[] {
  const isCkd = opts.condId === "COND_CKD";
  const filtered = services.filter((s) => {
    const n = s.name;
    if (!opts.emergencyCase && /ฉุกเฉิน|1669/.test(n)) return false; // lives in next_steps
    if (!opts.emergencyCase && /สุขภาพจิต|1323/.test(n)) return false;
    if (!isCkd && /ฟอกเลือด|ล้างไต|ปลูกถ่ายไต|บำบัดทดแทนไต/.test(n)) return false;
    return true;
  });
  const rank = (s: import("./kg").CoveredService) => {
    const t = s.type ?? "";
    if (/screening/.test(t)) return 0;
    if (/chronic|ncd/i.test(t) || /เรื้อรัง|NCD/.test(s.name)) return 1;
    if (/primary/.test(t)) return 2;
    return 3;
  };
  return filtered.sort((a, b) => rank(a) - rank(b));
}

function condIdFromHint(hint: string): string {
  const h = hint.toLowerCase();
  if (h.includes("เบาหวาน")) return "COND_T2DM";
  if (h.includes("ความดัน")) return "COND_HYPERTENSION";
  if (h.includes("ไต")) return "COND_CKD";
  return "COND_T2DM";
}

function buildBenefitCard(
  u: Understood,
  scheme: Scheme | undefined,
  schemeBenefits: { benefit_id: string; name: string; value?: string; apply_at?: string; documents?: string[]; logic_json?: string | null; source_url?: string; source_title?: string; publisher?: string }[],
  attrs: Record<string, unknown>,
  ruleTraces: unknown[],
  citations: { title: string; url: string; publisher: string }[]
): BenefitCard | null {
  const items: BenefitCard["items"] = [];

  // Universal elder benefit (OAA) — evaluate when age is in scope.
  if ((u.age ?? 0) >= 55) {
    const rule = getRule("RULE_OAA");
    const oaa = benefitById("BEN_OAA");
    if (rule && oaa) {
      const r = evaluateRule(rule.logic as Record<string, unknown>, attrs);
      ruleTraces.push({ rule: "RULE_OAA", status: r.status, passed: r.trace.filter((t) => t.result === true).map((t) => t.attr), asked: r.missing_attrs });
      // rules.json units are English ("THB/month"); the age-band fallback string
      // uses " | " separators — both need the same Thai/bullet treatment
      const unitTh = (unit: string) =>
        unit.replace(/THB\/month/i, "บาท/เดือน").replace(/THB\/year/i, "บาท/ปี").replace(/THB/i, "บาท");
      const oaaSegs = !r.value
        ? (oaa.value ?? "").split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)
        : [];
      items.push({
        name: oaa.name,
        status: r.status,
        value: r.value
          ? `${r.value.amount.toLocaleString()} ${unitTh(r.value.unit)}`
          : oaaSegs.length > 1
            ? undefined
            : oaa.value,
        details: oaaSegs.length > 1 ? oaaSegs : undefined,
        missing: r.missing_attrs,
        ask_th: r.missing_attrs.length ? questionFor(r.missing_attrs[0]) : undefined,
        apply_at: oaa.agency,
        documents: oaa.documents ? oaa.documents.split(";").map((d) => d.trim()).slice(0, 4) : undefined,
      });
      if (oaa.source_url) citations.push({ title: oaa.source_title ?? oaa.name, url: oaa.source_url, publisher: oaa.publisher ?? "" });
    }
  }

  // Scheme-specific benefits — keep the card focused: show benefits the user has
  // (ELIGIBLE) or can confirm with a friendly question; drop noise we can't ask
  // nicely (e.g. a rule needing a raw attr like active_children_count) or that
  // clearly doesn't apply.
  for (const b of schemeBenefits) {
    if (items.length >= 4) break;
    // no rule exists for maternity/child benefits — don't show them as "มีสิทธิ์"
    // to patients whose age makes them clearly inapplicable
    if ((u.age ?? 0) >= 50 && /คลอดบุตร|สงเคราะห์บุตร/.test(b.name)) continue;
    let status: BenefitCard["items"][number]["status"] = "ELIGIBLE";
    let missing: string[] = [];
    let ask: string | undefined;
    const evals = evaluateBenefit(b.benefit_id, attrs);
    if (evals.length) {
      const r = evals[0];
      status = r.status;
      missing = r.missing_attrs;
      const friendly = r.missing_attrs.find((a) => a in ATTR_QUESTIONS_TH);
      if (status === "NOT_ELIGIBLE") continue; // don't clutter with non-eligible
      if (status === "INDETERMINATE" && !friendly) continue; // can't ask nicely → skip
      ask = friendly ? questionFor(friendly) : undefined;
      ruleTraces.push({ rule: r.rule_id, status: r.status, passed: r.trace.filter((t) => t.result === true).map((t) => t.attr), asked: r.missing_attrs });
    }
    // KG values are semicolon-joined lists — break them into scannable bullets.
    const segs = (b.value ?? "").split(/;\s*/).map((s) => s.trim()).filter(Boolean);
    items.push({
      name: b.name,
      status,
      value: segs.length > 1 ? undefined : b.value,
      details: segs.length > 1 ? segs : undefined,
      missing,
      ask_th: ask,
      apply_at: b.apply_at,
      documents: b.documents,
    });
    if (b.source_url) citations.push({ title: b.source_title ?? b.name, url: b.source_url, publisher: b.publisher ?? "" });
  }

  if (!items.length) return null;
  return { type: "benefit", title: "สิทธิประโยชน์ของคุณ", items: items.slice(0, 4) };
}

async function synthCareBody(
  u: Understood,
  prescreen: NonNullable<Awaited<ReturnType<typeof runPrescreen>>>,
  comorbid: { disease: string; services: string[] }[],
  extra?: { scheme?: string; services?: string[] }
): Promise<string> {
  const { conditionThaiFor } = await import("./triageLabels");
  const conditionTh = conditionThaiFor(prescreen.disease);
  const facts = {
    suspected_condition: conditionTh ?? prescreen.disease,
    department: deptThai(prescreen.department),
    severity_th: severityThai(prescreen.severity),
    scheme: extra?.scheme,
    free_services_under_scheme: extra?.services,
    comorbidity: comorbid.map((c) => c.disease),
  };
  const fallback =
    `อาการที่เล่ามาเข้าได้กับ${conditionTh ?? prescreen.disease ?? "ภาวะที่ควรตรวจเพิ่ม"} ` +
    `แนะนำให้ไปพบ${deptThai(prescreen.department) ?? "แพทย์"} (${severityThai(prescreen.severity)})` +
    `${extra?.services?.length ? ` — ตรวจ${extra.services[0]}ได้ฟรีตามสิทธิ${extra.scheme ?? ""}` : ""}. ` +
    `นี่เป็นคำแนะนำเบื้องต้น ไม่ใช่การวินิจฉัยแทนแพทย์`;
  if (!featureFlags.hasLLM()) return fallback;
  const prompt = `เขียนคำแนะนำเชิงปรึกษา 2-3 ประโยคสั้นๆ ภาษาไทยสุภาพ อบอุ่น จากข้อมูล JSON ด้านล่าง โครงคำตอบ:
(1) อาการที่เล่ามา "เข้าได้กับ/อาจเกี่ยวกับ" ภาวะอะไร (ใช้คำระวัง ห้ามฟันธงวินิจฉัย)
(2) ควรทำอะไรต่อแบบจับต้องได้ — ไปแผนกไหน เร่งด่วนแค่ไหน และถ้ามี free_services_under_scheme ให้บอกว่าตรวจอะไรได้ฟรีตามสิทธิ
ห้ามตัดสินสิทธิ์ ห้ามเวิ่นเว้อ ห้ามขึ้นต้นด้วย "จากข้อมูล":
${JSON.stringify(facts)}
ตอบเป็นข้อความล้วน ไม่เกิน 3 ประโยค`;
  const text = await llmText(prompt, { maxOutputTokens: 300 }).catch(() => "");
  return text.trim() || fallback;
}

async function synthNextSteps(
  u: Understood,
  prescreen: Awaited<ReturnType<typeof runPrescreen>> | null,
  benefitCard: BenefitCard | null,
  hasFacility: boolean
): Promise<string[]> {
  const steps: string[] = [];
  steps.push("เตรียมบัตรประชาชน" + (u.scheme === "SSS" ? " + บัตรรับรองสิทธิประกันสังคม" : ""));
  if (hasFacility) steps.push("โทรนัด/สอบถามสถานพยาบาลก่อนไป");
  const indeterminate = benefitCard?.items.find((i) => i.status === "INDETERMINATE");
  if (indeterminate?.ask_th) steps.push(`ตอบคำถามเพื่อยืนยันสิทธิ: ${indeterminate.ask_th}`);
  if (prescreen?.escalate_hotline) steps.unshift(`ถ้าอาการแย่ลงเฉียบพลัน โทร ${prescreen.escalate_hotline} ทันที`);
  else steps.push("ถ้าอาการรุนแรง/ฉุกเฉิน โทร 1669");
  steps.push("ถ้าไม่แน่ใจเรื่องสิทธิ โทร สปสช. 1330");
  return [...new Set(steps)].slice(0, 6);
}

function dedupeCitations(cs: { title: string; url: string; publisher: string }[]) {
  const seen = new Set<string>();
  const out: typeof cs = [];
  for (const c of cs) {
    if (!c.url || seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}

export { safeParseJson };
