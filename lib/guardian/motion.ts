"use client";
// DeviceMotion access for LIFF/web — the ONLY module that touches motion
// sensors. Consent gate lives here (Guardrail §9.3): every capture path
// checks the in-memory consent set by the health-check flow after the server
// confirmed an active guardian consent. No consent → no addEventListener,
// not even one sample.
import { MAX_SAMPLES_PER_STATION } from './config';
import type { MotionSample } from './types';

let activeConsentId: string | null = null;

/** เรียกหลัง server ยืนยัน consent แล้วเท่านั้น (null = เพิกถอน/ออกจาก flow) */
export function setMotionConsent(consentId: string | null): void {
  activeConsentId = consentId;
}

export function hasMotionConsent(): boolean {
  return activeConsentId !== null;
}

export type MotionAvailability = 'available' | 'needs_permission' | 'unsupported';

interface DeviceMotionEventConstructorWithPermission {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export function detectMotionSupport(): MotionAvailability {
  if (typeof window === 'undefined' || typeof DeviceMotionEvent === 'undefined') {
    return 'unsupported';
  }
  const ctor = DeviceMotionEvent as unknown as DeviceMotionEventConstructorWithPermission;
  // iOS 13+ ต้องขอ permission จาก user gesture เท่านั้น
  return typeof ctor.requestPermission === 'function' ? 'needs_permission' : 'available';
}

/**
 * ขอ permission (iOS 13+) — ต้องเรียกจาก user gesture (ปุ่ม "เริ่ม") เท่านั้น
 * ห้ามเรียกตอน mount. Android ส่วนใหญ่ไม่มี requestPermission → granted เลย
 */
export async function requestMotionPermission(): Promise<boolean> {
  if (!hasMotionConsent()) return false;
  const support = detectMotionSupport();
  if (support === 'unsupported') return false;
  if (support === 'available') return true;
  try {
    const ctor = DeviceMotionEvent as unknown as DeviceMotionEventConstructorWithPermission;
    const res = await ctor.requestPermission!();
    return res === 'granted';
  } catch {
    return false;
  }
}

export interface MotionCapture {
  /** หยุดเก็บและคืน samples ทั้งหมด */
  stop: () => MotionSample[];
  /** จำนวน sample ปัจจุบัน (ใช้โชว์สถานะ) */
  count: () => number;
}

export interface MotionCaptureResult {
  ok: boolean;
  capture?: MotionCapture;
  /** ไม่มี event ภายใน 1.5 วิ → อุปกรณ์/หน้านี้ใช้ motion ไม่ได้ */
  reason?: 'no_consent' | 'unsupported' | 'no_events';
}

const round3 = (v: number | null | undefined): number => Math.round(((v ?? 0) + Number.EPSILON) * 1000) / 1000;

/**
 * เริ่มเก็บ DeviceMotion ~ตาม rate ของอุปกรณ์ (มัก ~50–60Hz)
 * - Feature-detect + timeout: ไม่มี event ใน 1.5 วิ → ok:false ('no_events')
 * - Buffer เป็น array ธรรมดา, ปัดทศนิยม 3 ตำแหน่ง, จำกัด ≤ MAX_SAMPLES_PER_STATION
 */
export function startMotionCapture(): Promise<MotionCaptureResult> {
  if (!hasMotionConsent()) return Promise.resolve({ ok: false, reason: 'no_consent' });
  if (detectMotionSupport() === 'unsupported') {
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  return new Promise((resolve) => {
    const samples: MotionSample[] = [];
    let t0: number | null = null;
    let resolved = false;
    let stopped = false;

    const onMotion = (e: DeviceMotionEvent) => {
      if (stopped || samples.length >= MAX_SAMPLES_PER_STATION) return;
      const now = performance.now();
      if (t0 === null) t0 = now;
      const acc = e.accelerationIncludingGravity;
      const rot = e.rotationRate;
      samples.push({
        t: Math.round(now - t0),
        ax: round3(acc?.x),
        ay: round3(acc?.y),
        az: round3(acc?.z),
        ra: round3(rot?.alpha),
        rb: round3(rot?.beta),
        rg: round3(rot?.gamma),
      });
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ ok: true, capture });
      }
    };

    const capture: MotionCapture = {
      stop: () => {
        stopped = true;
        window.removeEventListener('devicemotion', onMotion);
        return samples;
      },
      count: () => samples.length,
    };

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener('devicemotion', onMotion);
        resolve({ ok: false, reason: 'no_events' });
      }
    }, 1500);

    window.addEventListener('devicemotion', onMotion);
  });
}
