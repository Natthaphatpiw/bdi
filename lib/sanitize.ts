import type { Understood } from "./types";

const INTERNAL_SLOT_KEYS = new Set([
  "_last_prescreen",
  "_prescreened_symptoms",
  "_clinical_questions",
  "_clinical_for",
  "_answered",
  "_review_confirm",
]);

/** Reject a contiguous or commonly separated Thai national ID before it can
 * enter model prompts, messages, feedback, or analytics. */
export function containsThaiNationalId(value: string): boolean {
  return /(?:^|\D)\d[\s-]?\d{4}[\s-]?\d{5}[\s-]?\d{2}[\s-]?\d(?!\d)/.test(value);
}

/** Remove provider/debug state before a case snapshot crosses the API boundary. */
export function publicUnderstood(input: Understood): Understood {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !key.startsWith("_") && !INTERNAL_SLOT_KEYS.has(key)),
  ) as Understood;
}
