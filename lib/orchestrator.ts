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
async function extractUnderstanding(
  ctx: TurnContext
): Promise<{ u: Understood; freshSymptoms: string[] }> {
  const base: Understood = { ...ctx.priorSlots };
  if (ctx.profile.scheme && !base.scheme) base.scheme = ctx.profile.scheme;
  if (ctx.profile.birth_year && !base.age) base.age = CURRENT_YEAR - ctx.profile.birth_year;

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
export type StreamEmit = (type: "understood" | "card", data: unknown) => void;
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

  // (1) deterministic safety pre-check (instant)
  const pre = safetyPreCheck(ctx.text);

  // (2) NLU
  const { u, freshSymptoms } = await extractUnderstanding(ctx);
  emit("understood", u);
  const scheme = u.scheme as Scheme | undefined;
  const attrs = buildAttrs(u, ctx.profile);

  if (pre.card) push(pre.card);

  // Only (re)run the 27B when THIS turn brings new symptoms (slot answers skip it).
  const wantSymptom = freshSymptoms.length > 0;
  const symptomsText = (u.symptoms ?? []).join(" ") + " " + ctx.text;

  // captured for the post-barrier synthesis
  let prescreen: PrescreenResult | null = null;
  let benefitCard: BenefitCard | null = null;
  let hasFacility = false;

  const tasks: Promise<void>[] = [];

  // prescreen → emergency(escalate) + care card (streams when 27B/Gemini returns)
  if (wantSymptom) {
    tasks.push(
      (async () => {
        const pr = await runPrescreen({
          patientCase: buildCase(u, ctx.profile, ctx.text),
          symptomsText,
        });
        prescreen = pr;
        queries_run.push(`prescreen(${pr.source})+rails`);
        if (pr.escalate_hotline) {
          push(emergencyCardFromHotline(pr.safety_note, pr.escalate_hotline, pr.red_flags));
        }
        const comorbid =
          u.condition_hint && scheme
            ? await comorbidityFor(condIdFromHint(u.condition_hint), scheme)
            : [];
        const careBody = await synthCareBody(u, pr, comorbid);
        push({ type: "care", title: "วันนี้ควรทำอะไร", body: careBody, department: deptThai(pr.department) });
      })()
    );
  }

  // rights
  if (scheme) {
    tasks.push(
      (async () => {
        const services = await servicesForScheme(scheme);
        queries_run.push(`R1 services(${scheme})`);
        if (services.length) {
          push({
            type: "rights",
            title: `สิทธิ์ที่ครอบคลุม (${SCHEME_LABELS[scheme] ?? scheme})`,
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

  // benefit (rule engine) — also covers the universal elder benefit by age
  if (scheme || (u.age ?? 0) >= 55) {
    tasks.push(
      (async () => {
        const benefits = scheme ? await benefitsForScheme(scheme) : [];
        if (scheme) queries_run.push(`R2 benefits(${scheme})`);
        benefitCard = buildBenefitCard(u, scheme, benefits, attrs, ruleTraces, citations);
        if (benefitCard) push(benefitCard);
      })()
    );
  }

  // facility
  if (scheme) {
    tasks.push(
      (async () => {
        const facilities = await searchFacilities({ scheme, area: u.area, conditionId: u.condition_hint });
        queries_run.push(`facility_match(${scheme})`);
        if (facilities.length) {
          hasFacility = true;
          push({ type: "facility", title: "ไปที่ไหน", items: facilities });
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

const SCHEME_INTENTS: (Intent | undefined)[] = [
  "symptom_triage",
  "rights_discovery",
  "rights_lookup",
  "facility_search",
  "benefit_eligibility",
];

function decidePending(u: Understood, cards: Card[]): { question: string | null; quickReplies?: string[] } {
  // Knowing the scheme unlocks rights / benefit / facility cards — so if it's
  // still missing for a rights-relevant intent, ask for it (one short question).
  if (!u.scheme && SCHEME_INTENTS.includes(u.intent)) {
    const hasContent = cards.some((c) => c.type !== "evidence" && c.type !== "safety");
    return {
      question: hasContent
        ? "เพื่อบอกสิทธิ์ที่ครอบคลุมและสถานพยาบาลที่ใช่ ขอทราบสิทธิการรักษาของคุณหน่อยค่ะ"
        : "ขอทราบสิทธิการรักษาของคุณหน่อยค่ะ ใช้สิทธิอะไร?",
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
