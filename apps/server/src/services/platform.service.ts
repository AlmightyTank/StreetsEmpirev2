import { execFileSync } from 'node:child_process';
import type { PrismaClient } from '@prisma/client';
import { rulesets } from '@streets/rulesets';
import { APP_VERSION, type AppEnvironment, type PlatformMetaDto } from '@streets/shared';
import { env } from '../config/env.js';
import { RoundService } from './round.service.js';

/**
 * 1.0.0-A. Launch infrastructure in code: which environment this process is,
 * which build it runs, and a guard that keeps production and beta from ever
 * sharing a database.
 */

let cachedCommit: string | null | undefined;

/** The running build's short commit: BUILD_COMMIT when a deploy passes it, else git. */
export function buildCommit(): string | null {
  if (env.buildCommit) return env.buildCommit;
  if (cachedCommit !== undefined) return cachedCommit;
  try {
    const out = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 2_000 }).trim();
    cachedCommit = /^[0-9a-f]{7,40}$/.test(out) ? out : null;
  } catch {
    cachedCommit = null;
  }
  return cachedCommit;
}

const LATEST_RULESET = Object.values(rulesets).at(-1)!;

/** Environments that own their database. Development and test never claim one. */
const CLAIMING: readonly AppEnvironment[] = ['production', 'beta'];

export class DatabaseEnvironmentMismatch extends Error {
  constructor(public readonly claimed: string, public readonly running: AppEnvironment) {
    super(
      `This database belongs to ${claimed}, but this server is running as ${running}. `
      + 'Check DATABASE_URL. Refusing to start so live and beta data never mix.',
    );
    this.name = 'DatabaseEnvironmentMismatch';
  }
}

export const PlatformService = {
  /**
   * Claim this database for production or beta on first boot, and refuse to
   * start against one another environment claimed. Development and test servers
   * never claim, but also refuse a production or beta database unless
   * ALLOW_DATABASE_ENVIRONMENT names it (for deliberate work on a restored copy).
   */
  async bindDatabase(
    prisma: Pick<PrismaClient, 'deploymentIdentity'>,
    environment: AppEnvironment = env.appEnvironment,
    allowed: string | undefined = process.env.ALLOW_DATABASE_ENVIRONMENT,
    now = new Date(),
  ): Promise<{ environment: string; claimed: boolean }> {
    const existing = await prisma.deploymentIdentity.findUnique({ where: { id: 'singleton' } });
    if (existing && existing.environment !== environment) {
      if (!allowed || allowed !== existing.environment) {
        throw new DatabaseEnvironmentMismatch(existing.environment, environment);
      }
      return { environment: existing.environment, claimed: false };
    }
    if (!CLAIMING.includes(environment)) return { environment: existing?.environment ?? 'unclaimed', claimed: false };
    if (existing) {
      await prisma.deploymentIdentity.update({ where: { id: 'singleton' }, data: { lastBootAt: now, lastBootVersion: APP_VERSION } });
      return { environment, claimed: false };
    }
    // Two processes booting at once: the unique id means one create wins; re-check after.
    try {
      await prisma.deploymentIdentity.create({ data: { id: 'singleton', environment, lastBootVersion: APP_VERSION, claimedAt: now, lastBootAt: now } });
    } catch {
      const winner = await prisma.deploymentIdentity.findUniqueOrThrow({ where: { id: 'singleton' } });
      if (winner.environment !== environment) throw new DatabaseEnvironmentMismatch(winner.environment, environment);
    }
    return { environment, claimed: true };
  },

  async meta(prisma: PrismaClient): Promise<PlatformMetaDto> {
    const round = await RoundService.getCurrent(prisma);
    return {
      environment: env.appEnvironment,
      app: { version: APP_VERSION, commit: buildCommit() },
      ruleset: round
        ? { id: round.rulesetId, version: round.rulesetVersion }
        : { id: LATEST_RULESET.meta.id, version: LATEST_RULESET.meta.version },
      season: round
        ? { name: round.name, slug: round.slug, status: round.status, endsAt: round.endsAt.toISOString() }
        : null,
      turnstileSiteKey: env.turnstile.enabled ? env.turnstile.siteKey : null,
    };
  },
};
