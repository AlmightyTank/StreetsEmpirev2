import { createHash } from 'node:crypto';

/**
 * Same-process safety net for repeated Discord OAuth callback requests.
 * Discord's authorization code can only be redeemed once. We never cache
 * tokens, sessions, or raw authorization codes in this process.
 */
type Entry = {
  at: number;
  completed: Promise<string>;
  finish: (redirect: string) => void;
};
const WINDOW_MS = 2 * 60_000;
const MAX_ENTRIES = 500;
const WAIT_MS = 12_000;
const recent = new Map<string, Entry>();

function hashCallback(code: string, state: string): string {
  return createHash('sha256').update(code).update('\0').update(state).digest('hex');
}

export function beginDiscordOAuthCallback(code: string, state: string, now = Date.now()):
  | { duplicate: true; redirect: Promise<string | null> }
  | { duplicate: false; finish: (redirect: string) => void } {
  for (const [key, entry] of recent) {
    if (now - entry.at >= WINDOW_MS) recent.delete(key);
  }
  const key = hashCallback(code, state);
  const previous = recent.get(key);
  if (previous) {
    // If another request is still exchanging this one-time code, wait for its
    // destination instead of presenting the second exchange's false 400.
    return {
      duplicate: true,
      redirect: Promise.race([
        previous.completed,
        new Promise<null>((resolve) => {
          const timer = setTimeout(() => resolve(null), WAIT_MS);
          timer.unref?.();
        }),
      ]),
    };
  }
  let finish!: (redirect: string) => void;
  const completed = new Promise<string>((resolve) => { finish = resolve; });
  recent.set(key, { at: now, completed, finish });
  while (recent.size > MAX_ENTRIES) {
    const oldest = recent.keys().next().value;
    if (oldest === undefined) break;
    recent.delete(oldest);
  }
  let done = false;
  return {
    duplicate: false,
    finish: (redirect) => {
      if (done) return;
      done = true;
      finish(redirect);
    },
  };
}

/** For isolated tests only; no user data persists across restarts. */
export function resetDiscordOAuthGuardForTests(): void {
  recent.clear();
}
