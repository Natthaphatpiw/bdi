"use client";
// triggerGuardian(signal) — the single entry point the real detection engine
// will call. Today only the simulation trigger calls it. Flow:
//   1. POST /api/guardian/event (records pattern + source truthfully;
//      the server enforces the 24h "ฉันสบายดี" cooldown)
//   2. suppressed → stay silent; else open the Anomaly Popup
// If the server is unreachable we fail OPEN (show the popup without an
// event id) — a missed safety prompt is worse than missed telemetry.
import { postGuardianSignal } from './client';
import { useGuardian } from './store';
import type { GuardianSignal } from './types';

let inFlight = false;

export async function triggerGuardian(signal: GuardianSignal): Promise<void> {
  const store = useGuardian.getState();
  if (store.activePattern || store.befastOpen || inFlight) return;
  inFlight = true;
  try {
    let eventId: string | null = null;
    try {
      const record = await postGuardianSignal(signal);
      if (record.suppressed) return;
      eventId = record.event_id;
    } catch {
      eventId = null;
    }
    useGuardian.getState().openPopup(signal, eventId);
  } finally {
    inFlight = false;
  }
}
