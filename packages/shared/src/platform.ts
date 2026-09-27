/**
 * 1.0.0-A. What is running, and where.
 *
 * APP_VERSION is the application release, independent of any round's pinned
 * ruleset version. Bump it with each milestone.
 */
export const APP_VERSION = '1.0.0-rc.2';

export const APP_ENVIRONMENTS = ['production', 'beta', 'development', 'test'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/** The session cookie production uses. Beta must never reuse it. */
export const PRODUCTION_SESSION_COOKIE = 'se_session';

/**
 * The environment a server is running as. An explicit APP_ENV always wins.
 * Without one, existing deployments keep working unchanged. A production-mode
 * server is beta only when it is invite-only AND uses its own session cookie
 * (the documented beta setup). Invite-only alone is not enough: a live server
 * running a closed launch on the production cookie stays production, so
 * upgrading can never stop it booting.
 */
export function inferAppEnvironment(input: {
  appEnv?: string | undefined;
  nodeEnv: string;
  betaInviteOnly: boolean;
  sessionCookieName?: string | undefined;
}): AppEnvironment {
  const explicit = input.appEnv?.trim().toLowerCase();
  if (explicit) {
    if (!(APP_ENVIRONMENTS as readonly string[]).includes(explicit)) {
      throw new Error(`APP_ENV must be one of ${APP_ENVIRONMENTS.join(', ')}.`);
    }
    return explicit as AppEnvironment;
  }
  if (input.nodeEnv === 'test') return 'test';
  if (input.nodeEnv !== 'production') return 'development';
  const ownCookie = (input.sessionCookieName ?? PRODUCTION_SESSION_COOKIE) !== PRODUCTION_SESSION_COOKIE;
  return input.betaInviteOnly && ownCookie ? 'beta' : 'production';
}

/**
 * Settings that would let beta and production be confused. Returns problems;
 * the server refuses to start when there are any.
 */
export function environmentConflicts(input: {
  environment: AppEnvironment;
  nodeEnv: string;
  sessionCookieName: string;
  betaInviteOnly: boolean;
}): string[] {
  const problems: string[] = [];
  const cookie = input.sessionCookieName;
  if (input.environment === 'beta') {
    if (cookie === PRODUCTION_SESSION_COOKIE) {
      problems.push(`Beta must not use the production session cookie name "${PRODUCTION_SESSION_COOKIE}". Set SESSION_COOKIE_NAME, e.g. "se_beta_session".`);
    }
    if (!input.betaInviteOnly) problems.push('Beta must run invite-only: set BETA_INVITE_ONLY=true.');
  }
  if (input.environment === 'production') {
    if (/beta/i.test(cookie)) problems.push(`Production must not use a beta session cookie name ("${cookie}").`);
    if (input.nodeEnv !== 'production') problems.push('APP_ENV=production needs NODE_ENV=production.');
  }
  return problems;
}

/** 1.0.0-A. Version and environment, public on every host. */
export interface PlatformMetaDto {
  environment: AppEnvironment;
  app: {
    version: string;
    /** Short git commit of the running build, when the server could read it. */
    commit: string | null;
  };
  /** The current season's pinned ruleset, else the newest the build ships. */
  ruleset: { id: string; version: string };
  season: {
    name: string;
    slug: string;
    status: string;
    endsAt: string;
  } | null;
}
