import { describe, expect, it } from 'vitest';
import { environmentConflicts, inferAppEnvironment, PRODUCTION_SESSION_COOKIE, type AppEnvironment } from '@streets/shared';
// Plain-Node deploy helper: it must agree with the server about every environment.
import { configProblems, environmentOf, metaProblems, parseEnvFile } from '../../../../../scripts/ops/check-environment.mjs';
import { DatabaseEnvironmentMismatch, PlatformService } from '../platform.service.js';

describe('1.0.0-A environment identity', () => {
  it('infers the environment without breaking existing servers', () => {
    const base = { nodeEnv: 'production', betaInviteOnly: false };
    expect(inferAppEnvironment(base)).toBe('production');
    // The documented beta setup: invite-only on its own cookie.
    expect(inferAppEnvironment({ ...base, betaInviteOnly: true, sessionCookieName: 'se_beta_session' })).toBe('beta');
    // A closed launch on the live cookie stays production, so it keeps booting.
    expect(inferAppEnvironment({ ...base, betaInviteOnly: true, sessionCookieName: PRODUCTION_SESSION_COOKIE })).toBe('production');
    expect(inferAppEnvironment({ nodeEnv: 'development', betaInviteOnly: true })).toBe('development');
    expect(inferAppEnvironment({ nodeEnv: 'test', betaInviteOnly: false })).toBe('test');
    expect(inferAppEnvironment({ ...base, appEnv: ' Beta ' })).toBe('beta');
    expect(() => inferAppEnvironment({ ...base, appEnv: 'staging' })).toThrow(/APP_ENV/);
  });

  it('refuses settings that would let beta pass for production', () => {
    expect(environmentConflicts({ environment: 'beta', nodeEnv: 'production', sessionCookieName: 'se_session', betaInviteOnly: true }))
      .toEqual([expect.stringContaining('production session cookie')]);
    expect(environmentConflicts({ environment: 'beta', nodeEnv: 'production', sessionCookieName: 'se_beta_session', betaInviteOnly: false }))
      .toEqual([expect.stringContaining('invite-only')]);
    expect(environmentConflicts({ environment: 'production', nodeEnv: 'production', sessionCookieName: 'se_beta_session', betaInviteOnly: false }))
      .toEqual([expect.stringContaining('beta session cookie')]);
    expect(environmentConflicts({ environment: 'production', nodeEnv: 'development', sessionCookieName: 'se_session', betaInviteOnly: false }))
      .toEqual([expect.stringContaining('NODE_ENV=production')]);
    expect(environmentConflicts({ environment: 'production', nodeEnv: 'production', sessionCookieName: 'se_session', betaInviteOnly: true })).toEqual([]);
    expect(environmentConflicts({ environment: 'beta', nodeEnv: 'production', sessionCookieName: 'se_beta_session', betaInviteOnly: true })).toEqual([]);
  });

  it("keeps the deploy script's rule identical to the server's", () => {
    for (const appEnv of [undefined, 'production', 'beta', 'development']) {
      for (const nodeEnv of ['production', 'development', 'test']) {
        for (const invite of [true, false]) {
          for (const cookie of [undefined, 'se_session', 'se_beta_session']) {
            const values = new Map<string, string>([['NODE_ENV', nodeEnv], ['BETA_INVITE_ONLY', String(invite)]]);
            if (appEnv) values.set('APP_ENV', appEnv);
            if (cookie) values.set('SESSION_COOKIE_NAME', cookie);
            expect(environmentOf(values), JSON.stringify([...values])).toBe(
              inferAppEnvironment({ appEnv, nodeEnv, betaInviteOnly: invite, sessionCookieName: cookie }),
            );
          }
        }
      }
    }
  });

  it('stops a deploy into the wrong checkout or the wrong running server', () => {
    const beta = parseEnvFile('NODE_ENV=production\nBETA_INVITE_ONLY="true"\nSESSION_COOKIE_NAME=se_beta_session\nREQUIRE_VERIFIED_EMAIL=false\n# comment\n');
    const live = parseEnvFile('NODE_ENV=production\nBETA_INVITE_ONLY=false\nREQUIRE_VERIFIED_EMAIL=false\n');
    expect(configProblems(beta, 'beta')).toEqual([]);
    expect(configProblems(live, 'production')).toEqual([]);
    expect(configProblems(beta, 'production')[0]).toMatch(/describes a beta server/);
    expect(configProblems(live, 'beta')[0]).toMatch(/describes a production server/);
    const liveWithoutMail = parseEnvFile('NODE_ENV=production\nBETA_INVITE_ONLY=false\n');
    expect(configProblems(liveWithoutMail, 'production')).toEqual(expect.arrayContaining([
      expect.stringMatching(/RESEND_API_KEY.*EMAIL_FROM.*missing/),
    ]));
    const liveWithMail = parseEnvFile('NODE_ENV=production\nBETA_INVITE_ONLY=false\nRESEND_API_KEY=re_test\nEMAIL_FROM=no-reply@example.invalid\n');
    expect(configProblems(liveWithMail, 'production')).toEqual([]);

    const meta = { environment: 'beta', app: { version: '1.0.0-A', commit: 'abc1234def56' } };
    expect(metaProblems(meta, 'beta', 'abc1234')).toEqual([]);
    expect(metaProblems(meta, 'production', 'abc1234')[0]).toMatch(/reports beta, expected production/);
    expect(metaProblems(meta, 'beta', 'fff0000')[0]).toMatch(/did not pick up the new build/);
    expect(metaProblems({ ...meta, app: { version: '1.0.0-A', commit: null } }, 'beta', 'fff0000')).toEqual([]);
    expect(metaProblems(null, 'beta', undefined)).toEqual(['the API did not return /api/meta.']);
  });
});

/** An in-memory DeploymentIdentity table. */
function fakeDb(initial: { environment: string } | null = null) {
  let row: Record<string, unknown> | null = initial ? { id: 'singleton', ...initial } : null;
  return {
    get row() { return row; },
    deploymentIdentity: {
      findUnique: async () => row,
      findUniqueOrThrow: async () => row!,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (row) throw new Error('unique violation');
        row = { ...data };
        return row;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        row = { ...row!, ...data };
        return row;
      },
    },
  };
}

describe('1.0.0-A database binding', () => {
  const bind = (db: ReturnType<typeof fakeDb>, environment: AppEnvironment, allowed?: string) =>
    PlatformService.bindDatabase(db as never, environment, allowed);

  it('claims an unclaimed database for production or beta, then keeps it', async () => {
    const db = fakeDb();
    await expect(bind(db, 'production')).resolves.toEqual({ environment: 'production', claimed: true });
    await expect(bind(db, 'production')).resolves.toEqual({ environment: 'production', claimed: false });
    expect(db.row).toMatchObject({ environment: 'production', lastBootVersion: expect.any(String) });
  });

  it("refuses the other environment's database, even from development, unless named", async () => {
    await expect(bind(fakeDb({ environment: 'beta' }), 'production')).rejects.toBeInstanceOf(DatabaseEnvironmentMismatch);
    await expect(bind(fakeDb({ environment: 'production' }), 'beta')).rejects.toThrow(/belongs to production/);
    await expect(bind(fakeDb({ environment: 'production' }), 'development')).rejects.toThrow(/belongs to production/);
    await expect(bind(fakeDb({ environment: 'production' }), 'development', 'beta')).rejects.toThrow(/belongs to production/);
    await expect(bind(fakeDb({ environment: 'production' }), 'development', 'production'))
      .resolves.toEqual({ environment: 'production', claimed: false });
  });

  it('never claims for development or test', async () => {
    const db = fakeDb();
    await expect(bind(db, 'development')).resolves.toEqual({ environment: 'unclaimed', claimed: false });
    await expect(bind(db, 'test')).resolves.toEqual({ environment: 'unclaimed', claimed: false });
    expect(db.row).toBeNull();
  });
});
