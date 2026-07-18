"use client";
// Emergency context hand-off — popup/BEFAST run inside the main shells while
// the Emergency Co-pilot is its own full-screen route, so the context crosses
// via sessionStorage (survives the route change, dies with the tab).
import type { EmergencyContext } from './types';

const KEY = 'rusit-guardian-emergency';

export function saveEmergencyContext(ctx: EmergencyContext): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ctx));
  } catch {
    /* private mode — emergency screen still works without context */
  }
}

export function loadEmergencyContext(): EmergencyContext | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as EmergencyContext;
  } catch {
    return null;
  }
}

export function clearEmergencyContext(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
