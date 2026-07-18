"use client";
// Simulation trigger enablement — the hidden control path exists ONLY when
// NEXT_PUBLIC_GUARDIAN_SIM=1 at build time. Referenced statically so Next.js
// inlines the value; with the env unset this entire path is dead code.
import type { GuardianPattern, GuardianSignal } from './types';

export function isSimEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GUARDIAN_SIM === '1';
}

export function makeSimSignal(pattern: GuardianPattern): GuardianSignal {
  return {
    pattern,
    confidence: 0.9,
    source: 'simulated',
    detectedAt: new Date().toISOString(),
  };
}

/** อ่าน ?g=tremor|drops|fall จาก URL (ใช้ได้เฉพาะเมื่อ sim เปิด) */
export function patternFromQuery(search: string): GuardianPattern | null {
  if (!isSimEnabled()) return null;
  const value = new URLSearchParams(search).get('g');
  return value === 'tremor' || value === 'drops' || value === 'fall' ? value : null;
}
