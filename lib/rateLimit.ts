import type { NextRequest } from "next/server";

type Bucket = { count: number; resetsAt: number };
const buckets = new Map<string, Bucket>();

/** Small in-process guard for MVP routes. Replace with shared storage at scale. */
export function allowRequest(
  req: NextRequest,
  scope: string,
  options: { limit?: number; windowMs?: number } = {},
): boolean {
  const now = Date.now();
  const limit = options.limit ?? 20;
  const windowMs = options.windowMs ?? 60_000;
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = `${scope}:${forwarded || req.headers.get("x-real-ip") || "local"}`;
  const current = buckets.get(key);
  if (!current || current.resetsAt <= now) {
    buckets.set(key, { count: 1, resetsAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;

  if (buckets.size > 2_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetsAt <= now) buckets.delete(bucketKey);
    }
  }
  return true;
}
