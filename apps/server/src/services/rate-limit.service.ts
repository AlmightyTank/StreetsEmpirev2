export interface RateLimitPolicy {
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number;
  readonly retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * 0.1.0-F. A small fixed-window limiter for the single-process game server.
 *
 * It deliberately has no database dependency: rate limiting is operational
 * protection, not game state. A multi-instance deployment can replace this
 * one service with Redis without changing any route.
 */
export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private hitsSinceSweep = 0;

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 20_000,
  ) {}

  hit(identity: string, policy: RateLimitPolicy): RateLimitDecision {
    const now = this.now();
    const key = `${policy.name}:${identity}`;
    let bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + policy.windowMs };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;
    this.hitsSinceSweep += 1;

    if (this.hitsSinceSweep >= 500 || this.buckets.size > this.maxEntries) {
      this.sweep(now);
    }

    return {
      allowed: bucket.count <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  sweep(now = this.now()): void {
    this.hitsSinceSweep = 0;

    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }

    // A botnet can otherwise turn the limiter itself into an unbounded Map.
    // Map iteration is insertion ordered, so this evicts oldest live buckets.
    while (this.buckets.size > this.maxEntries) {
      const oldest = this.buckets.keys().next().value as string | undefined;
      if (!oldest) break;
      this.buckets.delete(oldest);
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}

export const RATE_LIMIT_POLICIES = {
  auth: { name: 'auth', limit: 10, windowMs: 5 * 60_000 },
  write: { name: 'write', limit: 90, windowMs: 60_000 },
  read: { name: 'read', limit: 300, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitPolicy>;

/** Requests that should share a bucket. Null means do not rate limit. */
export function rateLimitPolicyFor(method: string, path: string): RateLimitPolicy | null {
  if (method === 'OPTIONS' || path === '/api/health' || path === '/api/ready') return null;

  if (
    (method === 'POST' && (path === '/api/auth/register' || path === '/api/auth/login')) ||
    (method === 'GET' &&
      (path === '/api/auth/discord' || path === '/api/auth/discord/callback'))
  ) {
    return RATE_LIMIT_POLICIES.auth;
  }

  if (method === 'GET' || method === 'HEAD') return RATE_LIMIT_POLICIES.read;

  return RATE_LIMIT_POLICIES.write;
}
