/**
 * 1.0.0-C. Who keeps running into the rate limits.
 *
 * The limiter already refuses the traffic; this remembers who it refused, so an
 * admin can tell a script or a stuck client from ordinary play. Per process and
 * in memory like the limiter itself: operational signal, not game state.
 */

const DAY_MS = 86_400_000;

export interface ApiAbuseSubject {
  accountId: string | null;
  /** Only used when nobody is signed in. Stored as given; hashed before it leaves. */
  ip: string | null;
}

interface Entry extends ApiAbuseSubject {
  refusals: number[];
  buckets: Set<string>;
}

export interface ApiAbuseRow extends ApiAbuseSubject {
  refused: number;
  buckets: string[];
  firstAt: Date;
  lastAt: Date;
}

export class ApiAbuseRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxSubjects = 5_000,
    /** Enough refusals to show a pattern without growing with a flood. */
    private readonly maxPerSubject = 500,
  ) {}

  record(subject: ApiAbuseSubject, bucket: string): void {
    const key = subject.accountId ? `account:${subject.accountId}` : `ip:${subject.ip ?? 'unknown'}`;
    const now = this.now();
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= this.maxSubjects) this.prune(now, true);
      entry = { accountId: subject.accountId, ip: subject.accountId ? null : subject.ip, refusals: [], buckets: new Set() };
      this.entries.set(key, entry);
    } else {
      // Re-insert so iteration order stays least-recently-refused first.
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    entry.refusals.push(now);
    if (entry.refusals.length > this.maxPerSubject) entry.refusals.splice(0, entry.refusals.length - this.maxPerSubject);
    entry.buckets.add(bucket);
  }

  /** Subjects refused in the last day, most refused first. */
  list(limit = 50): ApiAbuseRow[] {
    const now = this.now();
    this.prune(now, false);
    return [...this.entries.values()]
      .map((entry) => ({
        accountId: entry.accountId,
        ip: entry.ip,
        refused: entry.refusals.length,
        buckets: [...entry.buckets].sort(),
        firstAt: new Date(entry.refusals[0]!),
        lastAt: new Date(entry.refusals[entry.refusals.length - 1]!),
      }))
      .sort((a, b) => b.refused - a.refused || b.lastAt.getTime() - a.lastAt.getTime())
      .slice(0, limit);
  }

  private prune(now: number, makeRoom: boolean): void {
    const since = now - DAY_MS;
    for (const [key, entry] of this.entries) {
      entry.refusals = entry.refusals.filter((at) => at > since);
      if (!entry.refusals.length) this.entries.delete(key);
    }
    while (makeRoom && this.entries.size >= this.maxSubjects) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

export const apiAbuse = new ApiAbuseRegistry();
