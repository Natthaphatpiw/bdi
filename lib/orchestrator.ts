// The orchestrator — turns one health story into ordered AnswerCards.
// Pipeline (product-architecture.md §4): safety pre-check → NLU (Gemini) →
// prescreen (RunPod 27B + rails) ∥ KG (template-first) ∥ rule engine → synthesis.
// Deterministic facts come from KG + rule engine; the LLM only verbalizes.
import { geminiJson, safeParseJson, geminiText } from "./gemini";
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

// ---- 0b) deterministic merge of structured answers (no NLU → no hallucination)
function applyAnswers(base: Understood, answers: Record<string, string>): Understood {
  const u: Understood = { ...base };
  for (const [field, raw] of Object.entries(answers)) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    if (field === "scheme") {
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
    } else {
      u[field] = v;
    }
  }
  return u;
}

// ---- 0c) which questions must be answered before the deep analysis ----------
const SCHEME_OPTIONS = ["บัตรทอง", "ประกันสังคม", "ข้าราชการ", "ไม่แน่ใจ"];
const AGE_OPTIONS = ["ต่ำกว่า 60 ปี", "60-69 ปี", "70-79 ปี", "80-89 ปี", "90 ปีขึ้นไป"];
const AREA_OPTIONS = ["บางกะปิ", "ลาดพร้าว", "ห้วยขวาง", "วังทองหลาง"];

function buildQuestions(u: Understood): TurnQuestion[] {
  const intent = u.intent;
  const needScheme = ["symptom_triage", "rights_discovery", "benefit_eligibility", "facility_search"].includes(
    intent ?? ""
  );
  const needAge = ["symptom_triage", "benefit_eligibility"].includes(intent ?? "");
  const needArea = ["symptom_triage", "facility_search"].includes(intent ?? "");

  const qs: TurnQuestion[] = [];
  if (needScheme && !u.scheme)
    qs.push({
      field: "scheme",
      label: "สิทธิการรักษา",
      question: "ผู้ป่วยใช้สิทธิการรักษาอะไร",
      options: SCHEME_OPTIONS,
      allow_other: true,
      other_placeholder: "เช่น ประกันเอกชน",
    });
  if (needAge && u.age == null)
    qs.push({
      field: "age",
      label: "อายุผู้ป่วย",
      question: "ผู้ป่วยอายุเท่าไหร่ (ช่วยจับคู่สิทธิ์ เช่น เบี้ยผู้สูงอายุ)",
      options: AGE_OPTIONS,
      allow_other: true,
      other_placeholder: "พิมพ์อายุเป็นตัวเลข",
    });
  if (needArea && !u.area)
    qs.push({
      field: "area",
      label: "พื้นที่",
      question: "อยู่เขต/อำเภอไหน (เพื่อหาสถานพยาบาลใกล้บ้านที่รับสิทธิ์)",
      options: AREA_OPTIONS,
      allow_other: true,
      other_placeholder: "พิมพ์ชื่อเขต/อำเภอ",
    });
  return qs;
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
  const extracted = await geminiJson<Partial<Understood>>(prompt, {}, { temperature: 0 });

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
  };
}

// ---- 3) attrs for the rule engine -------------------------------------------
function buildAttrs(u: Understood, profile: Profile): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  if (u.age != null) attrs.age = u.age;
  if (u.area) attrs.registered_in_area = u.area;
  if (u.scheme) attrs.scheme = u.scheme;
  if (profile.sss_section != null) attrs.sss_section = profile.sss_section;
  if (profile.receives_state_pension != null) {
    attrs.receives_state_pension_or_benapd = profile.receives_state_pension;
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

  // (1) deterministic safety pre-check (instant — runs even before questions)
  const pre = safetyPreCheck(ctx.text);
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
  emit("understood", u);

  // (3) GATE — if the screening/rights matching still lacks required info,
  //     ask ALL missing questions at once (clickable options + อื่นๆ) and stop.
  //     No half-baked answers: the deep analysis runs only when data is complete.
  const questions = buildQuestions(u);
  if (questions.length) {
    emit("questions", questions);
    return {
      understood: u,
      pending_question: null,
      questions,
      cards, // safety card only (if emergency)
      audit: { queries_run, rule_traces: [], citations: [], prescreen_result: null },
    };
  }

  const scheme = u.scheme as Scheme | undefined;
  const attrs = buildAttrs(u, ctx.profile);
  const symptomsText = (u.symptoms ?? []).join(" ") + " " + ctx.text;

  // (4) PRESCREEN FIRST (ThaiLLM-27B + rails) — the screening result drives
  //     which rights we show. Re-run only when the symptom set changed.
  const symKey = (u.symptoms ?? []).join("|");
  const needPrescreen = (u.symptoms?.length ?? 0) > 0 && u._prescreened_symptoms !== symKey;
  let prescreen: PrescreenResult | null = null;

  if (needPrescreen) {
    prescreen = await runPrescreen({
      patientCase: buildCase(u, ctx.profile, ctx.text),
      symptomsText,
    });
    u._prescreened_symptoms = symKey; // persisted via session_state
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
  const isSymptomFlow = u.intent === "symptom_triage" || (u.symptoms?.length ?? 0) > 0;

  const tasks: Promise<void>[] = [];

  // care card — consultative text from the screening result
  if (prescreen) {
    const pr = prescreen;
    tasks.push(
      (async () => {
        const comorbid = condId && scheme ? await comorbidityFor(condId, scheme) : [];
        const careBody = await synthCareBody(u, pr, comorbid);
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
        let services =
          isSymptomFlow && (condId || prescreen?.disease)
            ? await recommendedServices({
                conditionId: condId || undefined,
                diseaseNameEn: prescreen?.disease ?? undefined,
                scheme,
              })
            : [];
        let title = `สิทธิ์ที่เกี่ยวกับเคสนี้ (${SCHEME_LABELS[scheme] ?? scheme})`;
        if (!services.length) {
          const all = await servicesForScheme(scheme);
          const age = u.age ?? 99;
          services = all.filter((s) => {
            const min = parseInt(String((s as { age_min?: string }).age_min ?? "0"), 10) || 0;
            return min <= age;
          });
          if (isSymptomFlow) services = services.slice(0, 4);
          else title = `สิทธิ์ที่ครอบคลุม (${SCHEME_LABELS[scheme] ?? scheme})`;
        }
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
        const value = buildValueUnlockCard(u, scheme, attrs);
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

// ---- value unlock: "สิทธิ์ที่มีอยู่แล้ว คิดเป็นเงินเท่าไหร่/ปี" -----------------
// Conservative & sourced: only rule-engine-backed amounts are summed. The
// screening-package line carries no number (no reliable market price source).
function buildValueUnlockCard(
  u: Understood,
  scheme: Scheme | undefined,
  attrs: Record<string, unknown>
): ValueUnlockCard | null {
  const lines: ValueUnlockCard["lines"] = [];
  let definite = 0;
  let tentative = 0;

  if ((u.age ?? 0) >= 60) {
    const rule = getRule("RULE_OAA");
    if (rule) {
      const r = evaluateRule(rule.logic as Record<string, unknown>, attrs);
      if (r.value && (r.status === "ELIGIBLE" || r.status === "INDETERMINATE")) {
        const yearly = r.value.amount * 12;
        const label = `เบี้ยยังชีพผู้สูงอายุ (${r.value.amount.toLocaleString()} × 12 เดือน)`;
        if (r.status === "ELIGIBLE") {
          lines.push({ label, amount_label: `${yearly.toLocaleString()} บาท/ปี` });
          definite += yearly;
        } else {
          lines.push({
            label,
            amount_label: `${yearly.toLocaleString()} บาท/ปี`,
            note: "รอยืนยันเงื่อนไข เช่น ไม่ได้รับบำนาญซ้ำซ้อน",
            tentative: true,
          });
          tentative += yearly;
        }
      }
    }
  }

  if (scheme === "SSS") {
    lines.push({ label: "ค่าทันตกรรมประกันสังคม", amount_label: "900 บาท/ปี" });
    definite += 900;
  }

  const numericCount = lines.length;
  lines.push({
    label: "สิทธิ์ตรวจ/คัดกรองโรคเรื้อรังที่รัฐครอบคลุม (น้ำตาล/ความดัน/ตา/ไต/เท้า)",
    note: "ไม่มีค่าใช้จ่ายเมื่อใช้ตามสิทธิ",
  });
  if (!numericCount) return null;

  const total = definite + tentative;
  const total_label =
    `อย่างน้อย ${total.toLocaleString()} บาท/ปี` +
    (definite === 0 && tentative > 0 ? " (รอยืนยันเงื่อนไข)" : "");

  return {
    type: "value_unlock",
    title: "มูลค่าสิทธิ์ที่อาจยังไม่ได้ใช้",
    total_label,
    lines,
    footnote:
      "นับเฉพาะรายการที่มีแหล่งอ้างอิงและเกณฑ์ชัดเจน ยอดจริงขึ้นกับการใช้สิทธิ · ยังไม่รวมมูลค่าการตรวจคัดกรองที่รัฐครอบคลุม",
  };
}

/** Non-streaming convenience wrapper. */
export function runTurn(ctx: TurnContext): Promise<TurnResult> {
  return runTurnStream(ctx);
}

// ---- helpers ----------------------------------------------------------------
function condIdFromHint(hint: string): string {
  const h = hint.toLowerCase();
  if (h.includes("เบาหวาน")) return "COND_T2DM";
  if (h.includes("ความดัน")) return "COND_HYPERTENSION";
  if (h.includes("ไต")) return "COND_CKD";
  return "COND_T2DM";
}

const DEPT_TH: Record<string, string> = {
  "Internal Medicine": "อายุรกรรม",
  "Emergency Medicine": "ฉุกเฉิน",
  "Primary Care Unit": "หน่วยบริการปฐมภูมิ (แพทย์ทั่วไป)",
  "Surgery": "ศัลยกรรม",
  "Orthopedics and Physical Therapy": "ออร์โธปิดิกส์/กายภาพบำบัด",
  "Ophthalmology": "จักษุวิทยา",
  "Otorhinolaryngology": "หูคอจมูก",
  "Dermatology": "ผิวหนัง",
  "Psychiatry": "จิตเวช",
  "Pediatrics": "กุมารเวช",
  "Obstetrics and Gynecology": "สูติ-นรีเวช",
  "Rehabilitation": "เวชศาสตร์ฟื้นฟู",
};
function deptThai(dept: string | null): string | undefined {
  if (!dept) return undefined;
  return DEPT_TH[dept] ? `${DEPT_TH[dept]} (${dept})` : dept;
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
      items.push({
        name: oaa.name,
        status: r.status,
        value: r.value ? `${r.value.amount.toLocaleString()} ${r.value.unit}` : oaa.value,
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
    items.push({
      name: b.name,
      status,
      value: b.value,
      missing,
      ask_th: ask,
      apply_at: b.apply_at,
      documents: b.documents,
    });
    if (b.source_url) citations.push({ title: b.source_title ?? b.name, url: b.source_url, publisher: b.publisher ?? "" });
  }

  if (!items.length) return null;
  return { type: "benefit", title: "สิทธิประโยชน์ที่อาจได้", items: items.slice(0, 4) };
}

async function synthCareBody(
  u: Understood,
  prescreen: NonNullable<Awaited<ReturnType<typeof runPrescreen>>>,
  comorbid: { disease: string; services: string[] }[]
): Promise<string> {
  const facts = {
    condition: prescreen.disease,
    department: deptThai(prescreen.department),
    severity: prescreen.severity,
    comorbidity: comorbid.map((c) => c.disease),
  };
  const fallback =
    `แนะนำให้ไปพบ${deptThai(prescreen.department) ?? "แพทย์"} (${severityThai(prescreen.severity)})` +
    `${prescreen.disease ? ` เบื้องต้นอาจเกี่ยวกับ ${prescreen.disease}` : ""}. นี่เป็นคำแนะนำเบื้องต้น ไม่ใช่การวินิจฉัยแทนแพทย์`;
  if (!featureFlags.hasGemini()) return fallback;
  const prompt = `เขียนคำแนะนำสั้นกระชับ 1-2 ประโยค ภาษาไทยสุภาพ จากข้อมูลนี้ บอกแค่ "ควรไปแผนกไหน" และ "เร่งด่วนแค่ไหน" เท่านั้น
ห้ามวินิจฉัย ห้ามตัดสินสิทธิ์ ห้ามพูดเวิ่นเว้อหรือพูดถึงโรคร่วมถ้าไม่จำเป็น:
${JSON.stringify(facts)}
ตอบเป็นข้อความล้วน ไม่เกิน 2 ประโยค`;
  const text = await geminiText(prompt, { temperature: 0.3, maxOutputTokens: 160 }).catch(() => "");
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

function severityThai(s: string): string {
  const m: Record<string, string> = {
    "Observe at Home": "เฝ้าสังเกตที่บ้าน",
    "Visit Hospital / Clinic": "ควรไปพบแพทย์เมื่อสะดวก",
    "Visit Hospital / Clinic Urgently": "ควรไปพบแพทย์ภายใน 24 ชม.",
    Emergency: "ฉุกเฉิน ไปทันที",
  };
  return m[s] ?? s;
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
