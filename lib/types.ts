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
  | EvidenceCard;

export type CardType = Card["type"];

// ---- "AI เข้าใจว่า…" structured slots --------------------------------------
export interface Understood {
  patient_role?: string; // ผู้ป่วยเอง / ผู้ดูแล
  age?: number;
  scheme?: Scheme;
  area?: string;
  area_code?: string;
  symptoms?: string[];
  symptom_ids?: string[];
  condition_hint?: string;
  intent?: Intent;
  [k: string]: unknown;
}

// ---- /api/turn ----
export interface TurnInput {
  type: "text" | "voice" | "document";
  text?: string;
  audio?: { data_base64: string; mime: string };
  document_id?: string;
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
  cards: Card[];
  audit_id?: string;
}

// SSE event envelope streamed from /api/turn (Accept: text/event-stream)
export type TurnStreamEvent =
  | { event: "transcript"; data: { text: string } }
  | { event: "understood"; data: Understood }
  | { event: "status"; data: { stage: string; message_th?: string } }
  | { event: "pending"; data: { question: string; quick_replies?: string[] } }
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
  source: "runpod" | "mock";
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
}

// ---- profile / consent ----
export interface Profile {
  birth_year?: number | null;
  scheme?: Scheme | null;
  area_code?: string | null;
  sss_section?: number | null;
  receives_state_pension?: boolean | null;
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

// ---- auth bridge (LINE) ----
export interface LineAuthResponse {
  access_token: string;
  refresh_token: string;
  user_id: string;
  display_name?: string;
  picture_url?: string;
}
