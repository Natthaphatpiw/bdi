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
  benefitsForScheme,
  searchFacilities,
  comorbidityFor,
  rightInfo,
  benefitById,
  SCHEME_LABELS,
} from "./kg";
import { evaluateRule, getRule, evaluateBenefit, questionFor } from "./ruleEngine";
import { retrieveKgChunks, retrieveUserDocs } from "./retrieve";
import type {
  Card,
  Understood,
  Profile,
  Scheme,
  Intent,
  BenefitCard,
  EvidenceCard,
  SafetyCard,
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
}

export interface TurnResult {
  understood: Understood;
  pending_question: string | null;
  quick_replies?: string[];
  cards: Card[];
  audit: {
    queries_run: string[];
    rule_traces: unknown[];
    citations: { title: string; url: string; publisher: string }[];
    prescreen_result: unknown;
  };
}

// ---- 1) NLU: extract structured understanding -------------------------------
async function extractUnderstanding(ctx: TurnContext): Promise<Understood> {
  const base: Understood = { ...ctx.priorSlots };
  if (ctx.profile.scheme && !base.scheme) base.scheme = ctx.profile.scheme;
  if (ctx.profile.birth_year && !base.age) base.age = CURRENT_YEAR - ctx.profile.birth_year;

  const prompt = `คุณเป็นผู้ช่วยสกัดข้อมูลสุขภาพจากข้อความภาษาไทย ตอบเป็น JSON เท่านั้น
ข้อความผู้ใช้: "${ctx.text}"
ข้อมูลที่รู้แล้ว: ${JSON.stringify(base)}
สกัดและรวมข้อมูลเป็น JSON ตามคีย์นี้ (เว้นว่างถ้าไม่ทราบ ห้ามเดา):
{
 "patient_role": "ผู้ป่วยเอง|ผู้ดูแล",
 "age": number,
 "scheme": "UCS|SSS|CSMBS",            // บัตรทอง=UCS ประกันสังคม=SSS ข้าราชการ=CSMBS
 "area": "ชื่อเขต/อำเภอ เช่น บางกะปิ",
 "symptoms": ["อาการเป็นคำสั้นๆ"],
 "condition_hint": "โรคที่กล่าวถึง เช่น เบาหวาน",
 "intent": "symptom_triage|rights_discovery|facility_search|benefit_eligibility|document_qa|general_info"
}`;
  const extracted = await geminiJson<Partial<Understood>>(prompt, {}, { temperature: 0.1 });

  const merged: Understood = { ...base, ...stripEmpty(extracted) };
  // keep prior symptoms ∪ new
  const sym = [...new Set([...(base.symptoms ?? []), ...(extracted.symptoms ?? [])])].filter(Boolean);
  if (sym.length) merged.symptoms = sym;
  if (!merged.intent) merged.intent = inferIntent(ctx.text, merged);
  return merged;
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

// ---- main -------------------------------------------------------------------
export async function runTurn(ctx: TurnContext): Promise<TurnResult> {
  const queries_run: string[] = [];
  const citations: { title: string; url: string; publisher: string }[] = [];
  const ruleTraces: unknown[] = [];

  // (1) deterministic safety pre-check
  const pre = safetyPreCheck(ctx.text);

  // (2) NLU
  const u = await extractUnderstanding(ctx);
  const scheme = u.scheme as Scheme | undefined;
  const attrs = buildAttrs(u, ctx.profile);

  const cards: Card[] = [];
  let emergencyCard: SafetyCard | undefined = pre.card;

  // (3) tools in parallel
  const wantSymptom = (u.intent === "symptom_triage" || (u.symptoms?.length ?? 0) > 0);
  const symptomsText = (u.symptoms ?? []).join(" ") + " " + ctx.text;

  const [prescreen, services, benefits, facilities, comorbid, chunks, docChunks] = await Promise.all([
    wantSymptom ? runPrescreen({ patientCase: buildCase(u, ctx.profile, ctx.text), symptomsText }) : Promise.resolve(null),
    scheme ? servicesForScheme(scheme) : Promise.resolve([]),
    scheme ? benefitsForScheme(scheme) : Promise.resolve([]),
    scheme ? searchFacilities({ scheme, area: u.area, conditionId: u.condition_hint }) : Promise.resolve([]),
    u.condition_hint && scheme ? comorbidityFor(condIdFromHint(u.condition_hint), scheme) : Promise.resolve([]),
    retrieveKgChunks(ctx.text, 4),
    ctx.hasDoc ? retrieveUserDocs(ctx.text, ctx.userId, 4) : Promise.resolve([]),
  ]);

  if (wantSymptom) queries_run.push("prescreen(27B)+rails");
  if (scheme) queries_run.push(`R1 services(${scheme})`, `R2 benefits(${scheme})`, `facility_match(${scheme})`);
  if (chunks.length) queries_run.push("graphrag_retrieve");
  if (docChunks.length) queries_run.push("document_qa(user_doc_chunks)");

  // (4) Safety card from prescreen rails (overrides/augments pre-check)
  if (prescreen?.escalate_hotline) {
    emergencyCard = emergencyCardFromHotline(
      prescreen.safety_note,
      prescreen.escalate_hotline,
      prescreen.red_flags
    );
  }
  if (emergencyCard) cards.push(emergencyCard);

  // (5) Care card (prescreen + comorbidity → consultative text via Gemini)
  if (prescreen) {
    const careBody = await synthCareBody(u, prescreen, comorbid);
    cards.push({
      type: "care",
      title: "วันนี้ควรทำอะไร",
      body: careBody,
      department: deptThai(prescreen.department),
    });
  }

  // (6) Rights card
  if (services.length) {
    cards.push({
      type: "rights",
      title: `สิทธิ์ที่ครอบคลุม (${SCHEME_LABELS[scheme!] ?? scheme})`,
      items: services.slice(0, 8).map((s) => ({
        name: s.name,
        copay: s.copay || "ไม่มีค่าใช้จ่าย",
        interval: s.interval,
      })),
    });
    const ri = scheme ? rightInfo(scheme) : undefined;
    if (ri?.source_url) citations.push({ title: ri.source_title ?? ri.name_th, url: ri.source_url, publisher: ri.publisher ?? "" });
  }

  // (7) Benefit card (rule engine — deterministic eligibility)
  const benefitCard = buildBenefitCard(u, scheme, benefits, attrs, ruleTraces, citations);
  if (benefitCard) cards.push(benefitCard);

  // (8) Facility card
  if (facilities.length) {
    cards.push({ type: "facility", title: "ไปที่ไหน", items: facilities });
  }

  // (9) Next steps (consultative checklist)
  const checklist = await synthNextSteps(u, prescreen, benefitCard, facilities.length > 0);
  if (checklist.length) {
    cards.push({ type: "next_steps", title: "ขั้นตอนถัดไป", checklist });
  }

  // (10) Evidence
  for (const c of chunks) {
    if (c.source_url) citations.push({ title: c.source_title || c.name, url: c.source_url, publisher: c.publisher || "" });
  }
  const evidence: EvidenceCard = {
    type: "evidence",
    title: "ที่มา & ความน่าเชื่อถือ",
    sources: dedupeCitations(citations).slice(0, 8),
    rule_traces: ruleTraces as EvidenceCard["rule_traces"],
    disclaimer:
      "คำแนะนำเบื้องต้น ไม่ใช่การวินิจฉัยแทนแพทย์ · สิทธิ์ตัดสินด้วย rule engine (ไม่ใช่ AI) · ไม่เก็บข้อมูลส่วนตัวถ้าไม่ยินยอม",
  };
  cards.push(evidence);

  // (11) slot-filling: ask one question only when truly blocking
  const pending = decidePending(u, cards);

  return {
    understood: u,
    pending_question: pending.question,
    quick_replies: pending.quickReplies,
    cards,
    audit: {
      queries_run,
      rule_traces: ruleTraces,
      citations: dedupeCitations(citations),
      prescreen_result: prescreen,
    },
  };
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

  // Scheme-specific benefits.
  for (const b of schemeBenefits.slice(0, 4)) {
    let status: BenefitCard["items"][number]["status"] = "ELIGIBLE";
    let missing: string[] = [];
    let ask: string | undefined;
    const evals = evaluateBenefit(b.benefit_id, attrs);
    if (evals.length) {
      const r = evals[0];
      status = r.status;
      missing = r.missing_attrs;
      ask = r.missing_attrs.length ? questionFor(r.missing_attrs[0]) : undefined;
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
  return { type: "benefit", title: "สิทธิประโยชน์ที่อาจได้", items: items.slice(0, 5) };
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
    `จากอาการที่เล่ามา แนะนำให้ไปพบ${deptThai(prescreen.department) ?? "แพทย์"} ` +
    `(ระดับความเร่งด่วน: ${severityThai(prescreen.severity)}) ` +
    `${prescreen.disease ? `เบื้องต้นอาจเกี่ยวกับ ${prescreen.disease}. ` : ""}` +
    `${comorbid.length ? `เนื่องจากเป็นกลุ่มโรคเรื้อรัง ควรเฝ้าระวัง ${comorbid.map((c) => c.disease).join(", ")} ด้วย. ` : ""}` +
    `นี่เป็นคำแนะนำเบื้องต้น ไม่ใช่การวินิจฉัยแทนแพทย์`;
  if (!featureFlags.hasGemini()) return fallback;
  const prompt = `เขียนคำแนะนำเชิงปรึกษาสั้นๆ (2-3 ประโยค ภาษาไทย อบอุ่น) จากข้อมูลนี้ ห้ามวินิจฉัยเด็ดขาด ห้ามตัดสินสิทธิ์ ให้แนะนำแผนกและความเร่งด่วน:
${JSON.stringify(facts)}
ตอบเป็นข้อความล้วน ไม่ต้องมีหัวข้อ`;
  const text = await geminiText(prompt, { temperature: 0.4, maxOutputTokens: 300 }).catch(() => "");
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

function decidePending(u: Understood, cards: Card[]): { question: string | null; quickReplies?: string[] } {
  // If we couldn't determine the scheme and there's nothing actionable yet, ask.
  const hasContent = cards.some((c) => c.type !== "evidence" && c.type !== "safety");
  if (!u.scheme && !hasContent) {
    return {
      question: "ขอทราบสิทธิการรักษาของคุณหน่อยค่ะ ใช้สิทธิอะไร?",
      quickReplies: ["บัตรทอง", "ประกันสังคม", "ข้าราชการ", "ไม่แน่ใจ"],
    };
  }
  return { question: null };
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
