"use client";

import type {
  ApiEnvelope,
  CasePassportSnapshot,
  FeedbackOutcome,
  MvpCaseRecord,
  MvpScheme,
  StoredPassport,
  VerifiedCareRoute,
} from "@/lib/mvp/contracts";
import { supabaseBrowser } from "@/lib/client/supabaseBrowser";

export class MvpApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
    public readonly requestId: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MvpApiError";
  }
}

async function accessToken(): Promise<string | null> {
  try {
    const client = supabaseBrowser();
    const current = await client.auth.getSession();
    if (current.data.session?.access_token) return current.data.session.access_token;
    const signedIn = await client.auth.signInAnonymously();
    return signedIn.data.session?.access_token ?? null;
  } catch {
    // Demo sessions can be served without a user session by the server. Missing
    // browser auth must not prevent the deterministic booth flow from starting.
    return null;
  }
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  options: { public?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!options.public) {
    const token = await accessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  try {
    const response = await fetch(path, {
      ...init,
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (!response.ok || !payload?.success || payload.data == null) {
      const error = payload?.error;
      throw new MvpApiError(
        error?.code ?? (controller.signal.aborted ? "REQUEST_TIMEOUT" : "REQUEST_FAILED"),
        error?.message ??
          (controller.signal.aborted
            ? "ใช้เวลาตรวจสอบนานกว่าที่กำหนด กรุณาลองอีกครั้ง"
            : "ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง"),
        error?.retryable ?? true,
        payload?.requestId ?? "unknown",
        response.status,
      );
    }
    return payload.data;
  } catch (error) {
    if (error instanceof MvpApiError) throw error;
    if (controller.signal.aborted) {
      throw new MvpApiError(
        "REQUEST_TIMEOUT",
        "ใช้เวลาตรวจสอบนานกว่าที่กำหนด กรุณาลองอีกครั้ง",
        true,
        "client-timeout",
        408,
      );
    }
    throw new MvpApiError(
      "NETWORK_ERROR",
      "เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง",
      true,
      "client-network",
      0,
    );
  } finally {
    window.clearTimeout(timeout);
  }
}

export interface CreateCaseInput {
  narrative: string;
  patientRelation: string;
  scheme: MvpScheme;
  area: string;
  demoSessionId: string;
  demoScenarioId?: string;
  demo: boolean;
}

export const createCase = (input: CreateCaseInput) =>
  apiRequest<{ case: MvpCaseRecord }>("/api/cases", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const turnCase = (
  caseId: string,
  input: {
    message?: string;
    answers?: Record<string, string>;
    answer?: { questionId: string; slotKey: string; value: string };
  },
) =>
  apiRequest<{ case: MvpCaseRecord }>(`/api/cases/${encodeURIComponent(caseId)}/turn`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const confirmCase = (
  caseId: string,
  updates: {
    patientRelation: string;
    age: number | null;
    scheme: MvpScheme;
    area: string;
    symptoms: string[];
    duration: string;
    userGoal: string;
  },
) =>
  apiRequest<{ case: MvpCaseRecord }>(`/api/cases/${encodeURIComponent(caseId)}/confirm`, {
    method: "POST",
    body: JSON.stringify({ confirmed: true, updates }),
  });

export const generateCareRoute = (caseId: string) =>
  apiRequest<{ case: MvpCaseRecord; route: VerifiedCareRoute }>(
    `/api/cases/${encodeURIComponent(caseId)}/generate-route`,
    { method: "POST", body: JSON.stringify({}) },
    { timeoutMs: 30_000 },
  );

export const getMvpCase = (caseId: string) =>
  apiRequest<{ case: MvpCaseRecord }>(`/api/cases/${encodeURIComponent(caseId)}`);

export const getCareRoute = (caseId: string) =>
  apiRequest<{ route: VerifiedCareRoute }>(`/api/cases/${encodeURIComponent(caseId)}/route`);

export const createPassport = (caseId: string, shareAllowed: boolean) =>
  apiRequest<{ passport: { id: string; snapshot: CasePassportSnapshot } }>(
    `/api/cases/${encodeURIComponent(caseId)}/passport`,
    {
      method: "POST",
      body: JSON.stringify({
        consent: {
          scope: ["PRE_VISIT_HANDOFF"],
          shareAllowed,
          sensitiveFieldsExcluded: ["national_id", "system_internal_data"],
        },
      }),
    },
  );

export const createPassportShare = (passportId: string) =>
  apiRequest<{ token: string; url: string; expiresAt: string }>(
    `/api/passports/${encodeURIComponent(passportId)}/share`,
    { method: "POST", body: JSON.stringify({ consentGranted: true, expiresInHours: 72 }) },
  );

export const revokePassportShare = (passportId: string) =>
  apiRequest<{ revoked: boolean }>(`/api/passports/${encodeURIComponent(passportId)}/share`, {
    method: "DELETE",
  });

export const getSharedPassport = (token: string) =>
  apiRequest<{ passport: StoredPassport | { id: string; snapshot: CasePassportSnapshot } }>(
    `/api/passport/share/${encodeURIComponent(token)}`,
    {},
    { public: true },
  );

export const askFollowUp = (
  caseId: string,
  question: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
) =>
  apiRequest<{
    answer: string;
    safety: { emergency: boolean; hotline: string | null; messageTh: string | null };
  }>(`/api/cases/${encodeURIComponent(caseId)}/follow-up`, {
    method: "POST",
    body: JSON.stringify({ question, history }),
  });

export const submitAccessFeedback = (
  caseId: string,
  input: {
    outcome: FeedbackOutcome;
    rightAccepted: boolean | null;
    discrepancy: string | null;
  },
) =>
  apiRequest<{ saved: boolean }>(`/api/cases/${encodeURIComponent(caseId)}/feedback`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const resetDemo = (demoSessionId: string) =>
  apiRequest<{ reset: boolean }>("/api/demo/reset", {
    method: "POST",
    body: JSON.stringify({ demoSessionId }),
  });

export const trackCaseEvent = (
  caseId: string,
  event: "route_primary_called" | "route_primary_navigated" | "why_route_opened" | "evidence_opened",
  payload: { routeType?: "PRIMARY" | "BACKUP"; status?: string } = {},
) => apiRequest<{ tracked: true }>(`/api/cases/${encodeURIComponent(caseId)}/events`, {
  method: "POST",
  body: JSON.stringify({ event, payload }),
});

export const getDebugCase = (caseId: string) =>
  apiRequest<{ case: unknown; route: unknown; audit: unknown }>(
    `/api/internal/debug/case/${encodeURIComponent(caseId)}`,
  );
