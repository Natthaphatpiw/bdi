"use client";
// Typed client SDK — one place that talks to /api/*. Every call attaches the
// current Supabase access token as Bearer. Shared by BOTH web and LIFF surfaces.
import { currentToken } from "./supabaseBrowser";
import type {
  Card,
  CaseSnapshot,
  Consent,
  DocumentRecord,
  FacilityResult,
  PassportResult,
  Profile,
  Scheme,
  SessionResponse,
  TurnQuestion,
  TurnResponse,
  Understood,
} from "../types";

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await currentToken();
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function jsonFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await authHeaders()), ...(init.headers as object) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiClientError(res.status, body?.error?.message_th || "เกิดข้อผิดพลาด", body?.error?.retryable);
  }
  return res.json() as Promise<T>;
}

export class ApiClientError extends Error {
  constructor(public status: number, message: string, public retryable = false) {
    super(message);
  }
}

// ---- session / turn ---------------------------------------------------------
export function createSession(channel: "web" | "line"): Promise<SessionResponse> {
  return jsonFetch("/api/session", { method: "POST", body: JSON.stringify({ channel }) });
}

export interface TurnInputClient {
  type: "text" | "voice" | "document" | "answers";
  text?: string;
  audio?: { data_base64: string; mime: string };
  document_id?: string;
  answers?: Record<string, string>;
  /** one-shot quick-chip values (patient_role/scheme/area) from the home screen */
  prefill?: Record<string, string>;
}

export function turn(
  sessionId: string,
  input: TurnInputClient,
  signal?: AbortSignal
): Promise<TurnResponse> {
  return jsonFetch("/api/turn", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, input }),
    signal,
  });
}

// SSE streaming variant — callbacks fire as events arrive.
export interface TurnStreamHandlers {
  onTranscript?: (text: string) => void;
  onUnderstood?: (u: Understood) => void;
  onCard?: (card: Card) => void;
  onPending?: (question: string, quickReplies?: string[]) => void;
  onQuestions?: (questions: TurnQuestion[]) => void;
  onDone?: (auditId?: string) => void;
  onError?: (message: string) => void;
}

export async function turnStream(
  sessionId: string,
  input: TurnInputClient,
  handlers: TurnStreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch("/api/turn", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...(await authHeaders()) },
    body: JSON.stringify({ session_id: sessionId, input }),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    handlers.onError?.(body?.error?.message_th || "เกิดข้อผิดพลาด");
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const ev = parseSSE(block);
      if (!ev) continue;
      switch (ev.event) {
        case "transcript": handlers.onTranscript?.(ev.data.text); break;
        case "understood": handlers.onUnderstood?.(ev.data); break;
        case "card": handlers.onCard?.(ev.data); break;
        case "pending": handlers.onPending?.(ev.data.question, ev.data.quick_replies); break;
        case "questions": handlers.onQuestions?.(ev.data); break;
        case "done": handlers.onDone?.(ev.data.audit_id); break;
        case "error": handlers.onError?.(ev.data.message_th); break;
      }
    }
  }
}

function parseSSE(block: string): { event: string; data: any } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

// ---- voice ------------------------------------------------------------------
export async function stt(blob: Blob): Promise<{ text: string; model: string }> {
  const form = new FormData();
  form.append("file", blob, "audio.webm");
  const res = await fetch("/api/stt", { method: "POST", headers: await authHeaders(), body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiClientError(res.status, body?.error?.message_th || "ถอดเสียงไม่สำเร็จ");
  }
  return res.json();
}

// ---- profile / consent ------------------------------------------------------
export const getProfile = () => jsonFetch<Profile>("/api/profile");
export const putProfile = (p: Partial<Profile>) =>
  jsonFetch<Profile>("/api/profile", { method: "PUT", body: JSON.stringify(p) });
export const getConsents = () => jsonFetch<{ consents: Consent[] }>("/api/consent");
export const postConsent = (c: Consent) =>
  jsonFetch<Consent>("/api/consent", { method: "POST", body: JSON.stringify(c) });
export const deleteMe = () => jsonFetch<{ deleted: boolean }>("/api/me", { method: "DELETE" });

// ---- documents --------------------------------------------------------------
export const listDocuments = () => jsonFetch<{ documents: DocumentRecord[] }>("/api/documents");
export async function uploadDocument(file: File, docType = "policy"): Promise<DocumentRecord> {
  const form = new FormData();
  form.append("file", file);
  form.append("doc_type", docType);
  const res = await fetch("/api/documents", { method: "POST", headers: await authHeaders(), body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiClientError(res.status, body?.error?.message_th || "อัปโหลดไม่สำเร็จ");
  }
  return res.json();
}
export const getDocument = (id: string) => jsonFetch<DocumentRecord>(`/api/documents/${id}`);
export const deleteDocument = (id: string) =>
  jsonFetch<{ deleted: boolean }>(`/api/documents/${id}`, { method: "DELETE" });

// ---- facilities -------------------------------------------------------------
export function searchFacilities(params: {
  scheme: Scheme;
  condition_id?: string;
  area?: string;
  lat?: number;
  lng?: number;
  limit?: number;
}): Promise<{ facilities: FacilityResult[] }> {
  return jsonFetch("/api/facilities/search", { method: "POST", body: JSON.stringify(params) });
}

// ---- Case Passport ----------------------------------------------------------
export function generatePassport(
  sessionId: string,
  extra?: Record<string, string>
): Promise<PassportResult> {
  return jsonFetch("/api/passport", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, extra }),
  });
}

// ---- case result dashboard ---------------------------------------------------
export const getCase = (sessionId: string) =>
  jsonFetch<CaseSnapshot>(`/api/case/${sessionId}`);

/** follow-up assistant on the result dashboard — stateless server, local history */
export function askCaseChat(
  sessionId: string,
  history: { role: "user" | "assistant"; content: string }[],
  question: string,
  signal?: AbortSignal
): Promise<{ text: string }> {
  return jsonFetch("/api/case-chat", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, history, question }),
    signal,
  });
}

// ---- feedback / history -----------------------------------------------------
export const postFeedback = (session_id: string, rating: number, note?: string) =>
  jsonFetch("/api/feedback", { method: "POST", body: JSON.stringify({ session_id, rating, note }) });
export const getSessions = () =>
  jsonFetch<{ sessions: { id: string; channel: string; status: string; started_at: string; preview: string }[] }>(
    "/api/sessions"
  );
export const getMessages = (sessionId: string) =>
  jsonFetch<{ session_id: string; messages: { id: string; role: string; content: string; cards?: Card[]; created_at: string }[] }>(
    `/api/session/${sessionId}/messages`
  );
