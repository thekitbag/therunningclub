/**
 * In-process fixed-window rate limiting.
 *
 * Deliberately simple: v1 runs as a single Render web service, so an in-memory
 * counter is accurate for this deployment and adds no dependency. It is *not*
 * accurate across multiple instances — scaling the service horizontally means
 * moving this to the database or a shared store, which is recorded in the
 * README as a known limit rather than hidden here.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

/** Bounds memory if a flood of distinct keys arrives. */
const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitRule {
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export const SIGN_IN_RULE: RateLimitRule = { limit: 8, windowMs: 15 * 60_000 };
export const ADMIN_MUTATION_RULE: RateLimitRule = { limit: 20, windowMs: 60_000 };

export function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now = Date.now(),
): RateLimitResult {
  pruneExpired(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.limit - 1, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  const allowed = existing.count <= rule.limit;
  return {
    allowed,
    remaining: Math.max(rule.limit - existing.count, 0),
    retryAfterSeconds: allowed ? 0 : Math.ceil((existing.resetAt - now) / 1000),
  };
}

/** Clears a key after a successful sign-in, so one typo does not linger. */
export function resetRateLimit(key: string): void {
  windows.delete(key);
}

/** Test-only. Empties every window. */
export function clearAllRateLimits(): void {
  windows.clear();
}

function pruneExpired(now: number): void {
  if (windows.size < MAX_TRACKED_KEYS) return;
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
  // Still full of live windows: drop the oldest to keep memory bounded.
  if (windows.size >= MAX_TRACKED_KEYS) {
    const oldest = [...windows.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of oldest.slice(0, Math.floor(MAX_TRACKED_KEYS / 10))) {
      windows.delete(key);
    }
  }
}
