// Server-side sample sanitization — the hard privacy gate for behavioral data.
// Whitelist per station: any field outside the list (especially strings) is
// dropped before the row reaches Postgres. สถานีพิมพ์ห้ามมีข้อความผู้ใช้หลุด
// ลง DB ไม่ว่ากรณีใด (Guardrail §9.7)
import { MAX_SAMPLES_PER_STATION } from "./config";
import type { StationId } from "./types";

export const STATIONS: readonly StationId[] = ["hold_still", "tap_target", "typing", "gait"];

export const SAMPLE_KEYS: Record<StationId, string[]> = {
  hold_still: ["t", "ax", "ay", "az", "ra", "rb", "rg"],
  gait: ["t", "ax", "ay", "az", "ra", "rb", "rg"],
  tap_target: ["t", "tx", "ty", "px", "py", "rt", "miss"],
  typing: ["t", "len", "del"],
};

export function sanitizeSamples(
  station: StationId,
  samples: unknown[]
): Record<string, number | boolean>[] {
  const keys = SAMPLE_KEYS[station];
  const out: Record<string, number | boolean>[] = [];
  for (const s of samples.slice(0, MAX_SAMPLES_PER_STATION)) {
    if (s === null || typeof s !== "object") continue;
    const row: Record<string, number | boolean> = {};
    for (const k of keys) {
      const v = (s as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) row[k] = v;
      else if (typeof v === "boolean") row[k] = v;
    }
    if (Object.keys(row).length) out.push(row);
  }
  return out;
}

export function sanitizeFeatures(features: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (features && typeof features === "object") {
    for (const [k, v] of Object.entries(features as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  }
  return out;
}
