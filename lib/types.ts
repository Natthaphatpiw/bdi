// =============================================================================
// Shared contract types — used by BOTH the API routes and the UI (web + LIFF).
// Mirrors api-ui-ux-spec.md §3 (AnswerCards) and §2 (endpoints).
// =============================================================================

export type Channel = "web" | "line";
export type Scheme = "UCS" | "SSS" | "CSMBS";

export type Intent =
  | "symptom_triage"
  | "rights_discovery"
  | "rights_lookup"
  | "facility_search"
  | "benefit_eligibility"
  | "document_qa"
  | "general_info";

export type EligibilityStatus = "ELIGIBLE" | "NOT_ELIGIBLE" | "INDETERMINATE";

// ---- AnswerCards (the answer payload) --------------------------------------
export interface SafetyCard {
  type: "safety";
  level: "none" | "warn" | "emergency";
  title: string;
  body: string;
  actions?: { label: string; tel?: string; url?: string; style?: "danger" | "primary" }[];
}
export interface CareCard {
  type: "care";
  title: string;
  body: string;
  department?: string;
}
export interface RightsCard {
  type: "rights";
  title: string;
  items: { name: string; copay: string; interval?: string }[];
}
export interface BenefitCard {
  type: "benefit";
  title: string;
  items: {
    name: string;
    status: EligibilityStatus;
    value?: string;
    details?: string[];
    missing?: string[];
    ask_th?: string;
    apply_at?: string;
    documents?: string[];
  }[];
}
export interface FacilityCard {
  type: "facility";
  title: string;
  items: FacilityResult[];
}
export interface NextStepsCard {
  type: "next_steps";
  title: string;
  checklist: string[];
}
// "ปลดล็อกมูลค่าสิทธิ์" — turns scattered entitlements into a understandable
// yearly value. Amounts are computed ONLY from sourced, rule-engine-backed items.
export interface ValueUnlockCard {
  type: "value_unlock";
  title: string;
  subtitle?: string;
  total_label?: string; // e.g. "อย่างน้อย 7,200 บาท/ปี"
  lines: { label: string; amount_label?: string; note?: string; tentative?: boolean }[];
  footnote?: string;
}
// ทางเลือกนอกสิทธิ์รัฐ — รพ.เอกชน/คลินิกใกล้พื้นที่ + ประกันสุขภาพจริงพร้อม
// ข้อควรระวังตรงไปตรงมา (สร้าง deterministic จาก JSON ที่ verify แล้วเท่านั้น)
export interface OptionsCard {
  type: "options";
  title: string;
  subtitle?: string;
  private_facilities: {
    id: string;
    name: string;
    kind: "private_hospital" | "clinic" | "lab";
    district?: string;
    phone?: string;
    hours?: string;
    services?: string[];
    price_note?: string;
    accepts_sss?: boolean;
    accepts_insurance?: boolean;
    reasons?: string[];
    source_url?: string;
    publisher?: string;
  }[];
  insurance_plans: {
    id: string;
    insurer: string;
    plan_name: string;
    plan_type: string;
    coverage: string[];
    premium_note?: string;
    /** ข้อยกเว้นแบบตรงไปตรงมา เช่น โรคที่เป็นมาก่อน/ระยะรอคอย — ห้ามละไว้ */
    exclusions_note: string;
    best_for?: string;
    reasons?: string[];
    source_url?: string;
    publisher?: string;
  }[];
  caveats?: string[];
  disclaimer?: string;
}

export interface EvidenceCard {
  type: "evidence";
  title: string;
  sources: { title: string; url: string; publisher: string; review_required?: boolean }[];
  rule_traces?: RuleTraceSummary[];
  disclaimer: string;
}

export type Card =
  | SafetyCard
  | CareCard
  | RightsCard
  | BenefitCard
  | FacilityCard
  | NextStepsCard
  | ValueUnlockCard
  | OptionsCard
  | EvidenceCard;

export type CardType = Card["type"];

// ---- "AI เข้าใจว่า…" structured slots --------------------------------------
export interface Understood {
  patient_role?: string; // ผู้ป่วยเอง / ผู้ดูแล
  age?: number;
  scheme?: Scheme;
  area?: string;
  area_code?: string;
  /** จังหวัดที่สิทธิ์ลงทะเบียน (เคสสิทธิ์ต่างจังหวัด/ประชากรแฝง) */
  scheme_registered_province?: string;
  symptoms?: string[];
  symptom_ids?: string[];
  condition_hint?: string;
  intent?: Intent;
  [k: string]: unknown;
}

// ---- structured slot-filling (AskUserQuestion-style, clickable options) ----
export interface TurnQuestion {
  field: string; // scheme | age | area | ...
  label: string; // short Thai label
  question: string; // full Thai question
  options: string[];
  allow_other?: boolean; // shows "อื่นๆ…" free-text option
  other_placeholder?: string;
  /** show only when an earlier answer matches (client-side conditional step) */
  show_if?: { field: string; any_of: string[] };
}

// ---- /api/turn ----
export interface TurnInput {
  type: "text" | "voice" | "document" | "answers";
  text?: string;
  audio?: { data_base64: string; mime: string };
  document_id?: string;
  /** structured answers to TurnQuestion[] — merged deterministically (no NLU) */
  answers?: Record<string, string>;
  /** one-shot quick-chip values (role/scheme/area) sent with the first text turn —
   *  merged via the same deterministic applyAnswers path, so no NLU can override them */
  prefill?: Record<string, string>;
}
export interface TurnRequest {
  session_id: string;
  input: TurnInput;
}
export interface TurnResponse {
  session_id: string;
  transcript?: string;
  understood: Understood;
  pending_question: string | null;
  quick_replies?: string[];
  /** when set, the client should show the option panel and wait for answers */
  questions?: TurnQuestion[];
  cards: Card[];
  audit_id?: string;
}

export interface CaseSnapshot {
  session_id: string;
  channel?: Channel;
  started_at?: string;
  preview?: string;
  understood: Understood;
  cards: Card[];
  audit?: {
    queries_run?: string[];
    rule_traces?: unknown[];
    citations?: { title: string; url: string; publisher: string }[];
    prescreen_result?: unknown;
  };
}

// SSE event envelope streamed from /api/turn (Accept: text/event-stream)
export type TurnStreamEvent =
  | { event: "transcript"; data: { text: string } }
  | { event: "understood"; data: Understood }
  | { event: "status"; data: { stage: string; message_th?: string } }
  | { event: "pending"; data: { question: string; quick_replies?: string[] } }
  | { event: "questions"; data: TurnQuestion[] }
  | { event: "card"; data: Card }
  | { event: "done"; data: { audit_id?: string } }
  | { event: "error"; data: ApiError };

// ---- rule engine ----
export interface RuleTraceLeaf {
  attr: string;
  op: string;
  expected: unknown;
  actual: unknown;
  result: boolean | null;
}
export interface RuleEvaluation {
  status: EligibilityStatus;
  trace: RuleTraceLeaf[];
  missing_attrs: string[];
  required_attrs: string[];
  value: { band: string; amount: number; unit: string } | null;
  note?: string | null;
  rule_id?: string;
  summary?: string;
  ask_th?: string;
}
export interface RuleTraceSummary {
  rule: string;
  status: EligibilityStatus;
  passed: string[];
  failed?: string[];
  asked?: string[];
}

// ---- prescreen ----
export interface PrescreenResult {
  raw?: string;
  disease: string | null;
  condition_id: string;
  department: string | null;
  severity: string;
  escalate_hotline: string | null;
  red_flags: string[];
  rails_applied: string[];
  safety_note: string;
  usage?: unknown;
  source: "runpod" | "claude" | "gemini" | "mock";
}

// ---- facilities ----
export interface FacilityResult {
  facility_id: string;
  name: string;
  level?: string;
  distance_km?: number;
  open_now?: boolean;
  accepts: string[];
  has_service?: boolean;
  phone?: string;
  address?: string;
  map_url?: string;
  note?: string;
  confidence?: string;
  review_required?: boolean;
  /** ประเภทเป็นภาษาไทย เช่น "ศูนย์บริการสาธารณสุข" / "รพ.เอกชน" */
  type_label?: string;
  /** compare-mode badges เช่น "แนะนำอันดับ 1" "ใกล้ที่สุด" "รับสิทธิ์นี้" "มี source" "รอตรวจสอบ" */
  labels?: string[];
  /** เหตุผลที่แนะนำ (checklist) เช่น "อยู่ในเขตของคุณ" */
  reasons?: string[];
  /** บริการเด่นที่เกี่ยวข้องกับเคส เช่น อายุรกรรม/ตรวจสุขภาพ/เบาหวาน */
  services?: string[];
  source_url?: string;
  source_title?: string;
  publisher?: string;
}

// ---- profile / consent ----
export interface Profile {
  birth_year?: number | null;
  scheme?: Scheme | null;
  area_code?: string | null;
  sss_section?: number | null;
  receives_state_pension?: boolean | null;
  /** เบอร์โทรกลับสำหรับเหตุฉุกเฉิน (Emergency Co-pilot จำค่าไว้) */
  emergency_phone?: string | null;
  /** โรคประจำตัว/ยา สำหรับสคริปต์ 1669 และ ER Passport */
  conditions_meds?: string | null;
}
export type ConsentScope = "chat" | "phr" | "wearable" | "doc";
export interface Consent {
  scope: ConsentScope;
  granted: boolean;
}

// ---- documents ----
export interface DocumentRecord {
  document_id: string;
  status: "uploaded" | "processing" | "ready" | "failed";
  doc_type?: string;
  chunk_count?: number;
  filename?: string;
}

// ---- generic API error ----
export interface ApiError {
  code: string;
  message_th: string;
  retryable: boolean;
}
export interface ApiErrorEnvelope {
  error: ApiError;
}

// ---- session ----
export interface SessionResponse {
  session_id: string;
  greeting_th: string;
}

// ---- Case Passport ----
/** ER Passport (Guardian Emergency Mode) — ข้อมูลวิกฤตที่พยาบาลคัดกรองต้องเห็นก่อน */
export interface PassportEmergencyData {
  symptom?: string;
  onset?: string; // เวลาเริ่มอาการ (จากคำถาม onset ใน BEFAST)
  befast?: { f?: "yes" | "no"; a?: "yes" | "no"; s?: "yes" | "no" };
  conditions_meds?: string;
  contact_phone?: string;
  /** บรรทัดสิทธิ UCEP — แสดงบนสุดของเอกสารเสมอ */
  ucep_line: string;
}

export interface PassportData {
  ref_code: string; // short reference, e.g. CP-7QK2
  generated_at: string; // ISO
  patient: {
    role?: string; // ผู้ป่วยเอง / ผู้ดูแล
    display_name?: string;
    age?: number;
    gender?: string;
    scheme?: string; // บัตรทอง / ประกันสังคม / ข้าราชการ
    area?: string;
  };
  chief_complaint: string; // สรุปเรื่องที่มา/อาการสำคัญ
  symptoms: string[];
  condition?: string;
  triage?: { department?: string; severity?: string };
  rights_summary: string[]; // สิทธิ/บริการที่ใช้กับเคสนี้เท่านั้น (สั้น)
  /** ประวัติจากการซักถามเบื้องต้น — deterministic จาก session slots (_clinical_qa) ไม่ใช่จาก LLM */
  clinical_qa?: { q: string; a: string }[];
  recommended_facility?: { name: string; note?: string };
  prepared_documents: string[];
  questions_for_provider?: string[];
  hotlines?: { number: string; name: string }[];
  notes?: string;
  /** deterministic (rule-engine) unclaimed-entitlement value — never from the LLM */
  unclaimed_value?: {
    total_label: string;
    lines: { label: string; amount_label?: string; note?: string; tentative?: boolean }[];
  };
  /** Guardian Emergency Mode — ส่วนข้อมูลวิกฤตของ ER Passport */
  emergency?: PassportEmergencyData;
  /** the actual triage result from the 27B prescreen (pulled from audit_log) */
  screening?: {
    condition_th?: string;
    disease_en?: string;
    department?: string;
    severity?: string;
    red_flags?: string[];
    screened_by?: string;
  };
  disclaimer: string;
}

export interface PassportMissingField {
  field: string;
  label: string; // Thai label for the input
  question: string; // Thai question shown to the user
  type?: "text" | "number" | "select";
  options?: string[];
}

export interface PassportResult {
  status: "ready" | "need_info";
  missing?: PassportMissingField[];
  passport?: PassportData;
}

// ---- auth bridge (LINE) ----
export interface LineAuthResponse {
  access_token: string;
  refresh_token: string;
  user_id: string;
  display_name?: string;
  picture_url?: string;
}
