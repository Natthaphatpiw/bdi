export function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function recordsOf(value: unknown): Record<string, unknown>[] {
  const envelope = recordOf(value);
  const records = Array.isArray(value) ? value : envelope.records;
  return Array.isArray(records) ? records.map(recordOf) : [];
}

export function first(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) if (row[key] !== undefined) return row[key];
  return undefined;
}

export function isEffective(
  effectiveFrom: string | null | undefined,
  effectiveTo: string | null | undefined,
  asOfDate = new Date().toISOString().slice(0, 10),
): boolean {
  const asOf = asOfDate.slice(0, 10);
  return (!effectiveFrom || effectiveFrom.slice(0, 10) <= asOf) &&
    (!effectiveTo || effectiveTo.slice(0, 10) >= asOf);
}

export function normalizeCoverageStatus(
  value: unknown,
): "COVERED" | "CONDITIONAL" | "NOT_COVERED" | "UNKNOWN" {
  const status = asString(value).toUpperCase();
  if (["COVERED", "ACCEPTED", "FREE"].includes(status)) return "COVERED";
  if (["CONDITIONAL", "COVERED_CONDITIONAL", "ACCEPTED_CONDITIONAL"].includes(status)) return "CONDITIONAL";
  if (["NOT_COVERED", "REJECTED"].includes(status)) return "NOT_COVERED";
  return "UNKNOWN";
}

export function normalizeCopayType(value: unknown): "FREE" | "FIXED" | "VARIABLE" | "UNKNOWN" {
  const type = asString(value).toUpperCase();
  return ["FREE", "FIXED", "VARIABLE"].includes(type)
    ? (type as "FREE" | "FIXED" | "VARIABLE")
    : "UNKNOWN";
}

export function normalizeAcceptance(
  value: unknown,
): "ACCEPTED" | "CONDITIONAL" | "UNKNOWN" | "REJECTED" {
  const status = asString(value).toUpperCase();
  if (status === "ACCEPTED") return "ACCEPTED";
  if (status === "CONDITIONAL") return "CONDITIONAL";
  if (["REJECTED", "NOT_ACCEPTED"].includes(status)) return "REJECTED";
  return "UNKNOWN";
}
