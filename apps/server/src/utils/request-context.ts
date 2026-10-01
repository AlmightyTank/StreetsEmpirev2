import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 1.0.0-F. What a log line needs to say which request, player and action it belongs to.
 *
 * Set once per request (the request id and account) and filled in by the services as
 * they learn more (the round player, the round, the action id, the ruleset). Every
 * pino line during the request carries whatever is known, through the logger's mixin,
 * so a failed raid in the logs names the raid without each call site repeating it.
 *
 * Only identifiers ever go in here: never cookies, tokens, passwords or free text.
 */
export interface LogContext {
  requestId?: string;
  accountId?: string;
  roundPlayerId?: string;
  roundId?: string;
  actionId?: string;
  action?: string;
  ruleset?: string;
  /** Set on failures: validation, auth, conflict, rate_limit, state_guard, contention, internal... */
  errorCategory?: string;
  /** Background work outside any request: the job's name. */
  job?: string;
}

const storage = new AsyncLocalStorage<LogContext>();

/** Start a context for the rest of this async flow (a request, from its first hook). */
export function enterLogContext(context: LogContext): void {
  storage.enterWith({ ...context });
}

/** Run background work inside its own context. */
export function withLogContext<T>(context: LogContext, run: () => T): T {
  return storage.run({ ...context }, run);
}

/** Add what a service has just learned. A no-op outside a request or job. */
export function annotateLogContext(fields: Partial<LogContext>): void {
  const store = storage.getStore();
  if (!store) return;
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') (store as Record<string, unknown>)[key] = value;
  }
}

export function currentLogContext(): LogContext {
  return { ...(storage.getStore() ?? {}) };
}

/** Fields for the logger's mixin: only what is set. */
export function logContextFields(): Record<string, string> {
  const store = storage.getStore();
  if (!store) return {};
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(store)) if (typeof value === 'string' && value) fields[key] = value;
  return fields;
}

/** Paths pino blanks out wherever they appear in a logged object. */
export const LOG_REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-metrics-token"]',
  'res.headers["set-cookie"]',
  'headers.cookie',
  'headers.authorization',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.token',
  '*.tokenHash',
  '*.sessionToken',
  '*.secret',
  '*.apiKey',
  '*.p256dh',
  '*.auth',
] as const;

/** A request id we can safely echo: short, printable, no spaces. Otherwise we make our own. */
export function acceptRequestId(header: unknown): string | null {
  return typeof header === 'string' && /^[A-Za-z0-9._:-]{8,64}$/.test(header) ? header : null;
}
