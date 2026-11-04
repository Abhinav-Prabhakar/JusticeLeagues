/**
 * Tiny in-memory sliding-window limiter. Good enough for a single local
 * process; swap for SQLite if the app ever runs more than one node.
 */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((at) => at > cutoff);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > 5_000) {
    for (const [bucketKey, times] of buckets) {
      if (times.every((at) => at <= cutoff)) buckets.delete(bucketKey);
    }
  }
  return true;
}

export function clientKey(headers: Headers, suffix: string): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `${forwarded ?? "local"}:${suffix}`;
}
