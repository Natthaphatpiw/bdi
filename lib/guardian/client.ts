"use client";
// Guardian client SDK — typed calls to /api/guardian/* and /api/health-check/*.
// Same bearer-auth pattern as lib/client/api.ts (jsonFetch there is module-
// private, so guardian keeps its own thin copy to stay self-contained).
import { currentToken } from '@/lib/client/supabaseBrowser';
import { ApiClientError } from '@/lib/client/api';
import type {
  GuardianConsentStatus,
  GuardianEventRecord,
  GuardianOutcome,
  GuardianSignal,
  HealthCheckCompleteResponse,
  HealthCheckHistoryEntry,
  HealthCheckStartResponse,
  StationId,
} from './types';
import { GUARDIAN_CONSENT_VERSION } from './config';

async function guardianFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await currentToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers as object),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiClientError(res.status, body?.error?.message_th || 'เกิดข้อผิดพลาด', body?.error?.retryable);
  }
  return res.json() as Promise<T>;
}

// ---- guardian events ---------------------------------------------------------
export function postGuardianSignal(signal: GuardianSignal): Promise<GuardianEventRecord> {
  return guardianFetch('/api/guardian/event', {
    method: 'POST',
    body: JSON.stringify({
      action: 'signal',
      pattern: signal.pattern,
      source: signal.source,
      confidence: signal.confidence,
      detected_at: signal.detectedAt,
    }),
  });
}

export function updateGuardianEvent(
  eventId: string,
  update: { chosen_symptom?: string; outcome?: GuardianOutcome; payload?: Record<string, unknown> }
): Promise<{ updated: boolean }> {
  return guardianFetch('/api/guardian/event', {
    method: 'POST',
    body: JSON.stringify({ action: 'update', event_id: eventId, ...update }),
  });
}

/** best-effort telemetry — ห้าม throw ไปขวาง flow ฉุกเฉิน */
export function trackGuardianOutcome(
  eventId: string | null | undefined,
  outcome: GuardianOutcome,
  payload?: Record<string, unknown>
): void {
  if (!eventId) return;
  void updateGuardianEvent(eventId, { outcome, payload }).catch(() => undefined);
}

// ---- guardian consent --------------------------------------------------------
export function getGuardianConsent(): Promise<GuardianConsentStatus> {
  return guardianFetch('/api/guardian/consent');
}

export function grantGuardianConsent(): Promise<{ consent_id: string }> {
  return guardianFetch('/api/guardian/consent', {
    method: 'POST',
    body: JSON.stringify({ version: GUARDIAN_CONSENT_VERSION }),
  });
}

export function revokeGuardianConsent(): Promise<{ revoked: boolean }> {
  return guardianFetch('/api/guardian/consent/revoke', { method: 'POST', body: '{}' });
}

// ---- ER Passport (Guardian Emergency Mode) ----------------------------------
export interface EmergencyPassportRequest {
  symptom?: string;
  onset?: string;
  befast?: { f?: 'yes' | 'no'; a?: 'yes' | 'no'; s?: 'yes' | 'no' };
  conditions_meds?: string;
  contact_phone?: string;
}

export function generateEmergencyPassport(
  sessionId: string,
  emergency: EmergencyPassportRequest
): Promise<import('@/lib/types').PassportResult> {
  return guardianFetch('/api/passport', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, mode: 'emergency', emergency }),
  });
}

// ---- health check ------------------------------------------------------------
export function startHealthCheck(deviceInfo: Record<string, unknown>): Promise<HealthCheckStartResponse> {
  return guardianFetch('/api/health-check/start', {
    method: 'POST',
    body: JSON.stringify({ device_info: deviceInfo }),
  });
}

export interface StationSamplesPayload {
  session_id: string;
  station: StationId;
  seq: number;
  sample_rate_hz?: number;
  started_at: string;
  ended_at: string;
  samples: unknown[];
  features: Record<string, number>;
}

export function postStationSamples(payload: StationSamplesPayload): Promise<{ saved: boolean }> {
  return guardianFetch('/api/health-check/samples', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function completeHealthCheck(sessionId: string): Promise<HealthCheckCompleteResponse> {
  return guardianFetch('/api/health-check/complete', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function getHealthCheckHistory(): Promise<{ entries: HealthCheckHistoryEntry[] }> {
  return guardianFetch('/api/health-check/history');
}

// ---- fire-and-retry sample uploader -----------------------------------------
// คิว retry ในหน่วยความจำ + navigator.sendBeacon ตอนปิดหน้าเป็น fallback
const pendingUploads: StationSamplesPayload[] = [];
let flushing = false;
let beaconBound = false;
// sendBeacon ตั้ง header ไม่ได้ — เก็บ token ล่าสุดไว้แนบใน body ให้ server ตรวจแทน
let lastKnownToken = '';

function bindBeaconFallback(): void {
  if (beaconBound || typeof window === 'undefined') return;
  beaconBound = true;
  window.addEventListener('pagehide', () => {
    for (const payload of pendingUploads.splice(0)) {
      try {
        navigator.sendBeacon?.(
          '/api/health-check/samples',
          new Blob([JSON.stringify({ ...payload, beacon: true, token: lastKnownToken })], {
            type: 'application/json',
          })
        );
      } catch {
        /* best-effort */
      }
    }
  });
}

async function flushQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    while (pendingUploads.length) {
      const payload = pendingUploads[0];
      try {
        await postStationSamples(payload);
        pendingUploads.shift();
      } catch {
        // network hiccup — เว้นจังหวะแล้วลองใหม่ สูงสุด 3 รอบต่อ flush
        await new Promise((r) => setTimeout(r, 1200));
        const retries = ((payload as { __retries?: number }).__retries ?? 0) + 1;
        (payload as { __retries?: number }).__retries = retries;
        if (retries >= 3) break; // เหลือไว้ให้ beacon ตอนปิดหน้า
      }
    }
  } finally {
    flushing = false;
  }
}

/** ส่งแบบ fire-and-retry — ไม่ block UI สถานีถัดไป */
export function queueStationSamples(payload: StationSamplesPayload): void {
  bindBeaconFallback();
  void currentToken().then((t) => {
    if (t) lastKnownToken = t;
  });
  pendingUploads.push(payload);
  void flushQueue();
}

/** รอให้คิวส่งหมดก่อนเรียก complete (มี timeout กันค้าง) */
export async function drainSampleQueue(timeoutMs = 8000): Promise<boolean> {
  const started = Date.now();
  while (pendingUploads.length && Date.now() - started < timeoutMs) {
    await flushQueue();
    if (pendingUploads.length) await new Promise((r) => setTimeout(r, 400));
  }
  return pendingUploads.length === 0;
}
