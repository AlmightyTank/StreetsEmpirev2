import type { AccountProfile, PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { battleLooks, profileShowcase, profileThemeTags, themeTagFields } from '../profile-showcase.service.js';

type UnlockRow = { key: string; kind: string; title: string; description: string; rarity: string; styleKey: string | null; awardedAt: Date };

const NIGHT_DRIVE: UnlockRow = {
  key: 'street-pass-s1-night-drive-theme', kind: 'SITE_THEME', title: 'Night Drive · Season 1', description: '',
  rarity: 'epic', styleKey: 'street-pass-s1-night-drive', awardedAt: new Date(1),
};
const CARTEL_GOLD: UnlockRow = {
  key: 'street-pass-s1-cartel-gold', kind: 'ITEM_COLLECTION', title: 'Cartel Gold Collection', description: '',
  rarity: 'legendary', styleKey: 'cartel-gold', awardedAt: new Date(2),
};

function dbWith(unlocks: UnlockRow[]): PrismaClient {
  return {
    accountCosmeticUnlock: {
      findMany: async (args: { where: { kind: string } }) => unlocks.filter((row) => row.kind === args.where.kind),
    },
  } as unknown as PrismaClient;
}

/** Overrides are loose so the test compiles against a Prisma client generated before Slice E. */
function profile(overrides: Record<string, unknown>): AccountProfile {
  return {
    activeSiteThemeKey: 'street-pass-s1-night-drive',
    itemCosmetics: { AK47: 'cartel-gold', PISTOL: 'midnight-ops' },
    crewCosmetics: { THUG: 'cartel-gold', HOE: 'urban-ghost' },
    showThemeOnProfile: true,
    showLookOnProfile: true,
    ...overrides,
  } as unknown as AccountProfile;
}

describe('profileShowcase', () => {
  it('shows the owner theme and look, limited to what the account has earned', async () => {
    const showcase = await profileShowcase(dbWith([NIGHT_DRIVE, CARTEL_GOLD]), 'account-1', profile({}));

    expect(showcase).toEqual({
      siteTheme: 'street-pass-s1-night-drive',
      siteThemeLabel: 'Night Drive · Season 1',
      look: {
        // Midnight Ops and Urban Ghost are not owned, so those picks read as Classic.
        items: { AK47: 'cartel-gold' },
        crew: { THUG: 'cartel-gold', HOE: 'classic' },
        collections: [{ key: 'street-pass-s1-cartel-gold', title: 'Cartel Gold Collection', rarity: 'legendary' }],
      },
    });
  });

  it('hides the theme and the look when the owner turns them off', async () => {
    const showcase = await profileShowcase(
      dbWith([NIGHT_DRIVE, CARTEL_GOLD]),
      'account-1',
      profile({ showThemeOnProfile: false, showLookOnProfile: false }),
    );

    expect(showcase).toEqual({ siteTheme: null, siteThemeLabel: null, look: null });
  });

  it('never shows a theme the account has not earned', async () => {
    const showcase = await profileShowcase(dbWith([]), 'account-1', profile({ activeSiteThemeKey: 'neon-vice' }));

    expect(showcase.siteTheme).toBeNull();
    expect(showcase.look).toEqual({ items: {}, crew: { THUG: 'classic', HOE: 'classic' }, collections: [] });
  });

  it('defaults to showing everything for an account without a profile row', async () => {
    const showcase = await profileShowcase(dbWith([]), 'account-1', null);

    expect(showcase).toEqual({
      siteTheme: null,
      siteThemeLabel: null,
      look: { items: {}, crew: { THUG: 'classic', HOE: 'classic' }, collections: [] },
    });
  });
});

describe('profileThemeTags', () => {
  type ProfileRow = { accountId: string; activeSiteThemeKey: string | null; showThemeOnProfile: boolean };

  function listDb(profiles: ProfileRow[], unlocks: (UnlockRow & { accountId: string })[]) {
    const calls = { profiles: 0, unlocks: 0 };
    const db = {
      accountProfile: {
        findMany: async (args: { where: { accountId: { in: string[] } } }) => {
          calls.profiles++;
          return profiles.filter((row) => args.where.accountId.in.includes(row.accountId) && row.activeSiteThemeKey && row.showThemeOnProfile);
        },
      },
      accountCosmeticUnlock: {
        findMany: async (args: { where: { accountId: { in: string[] }; kind: string } }) => {
          calls.unlocks++;
          return unlocks.filter((row) => args.where.accountId.in.includes(row.accountId) && row.kind === args.where.kind);
        },
      },
    } as unknown as PrismaClient;
    return { db, calls };
  }

  it('tags only players who show an earned theme, in two queries for the whole list', async () => {
    const { db, calls } = listDb(
      [
        { accountId: 'shows', activeSiteThemeKey: 'street-pass-s1-night-drive', showThemeOnProfile: true },
        { accountId: 'hides', activeSiteThemeKey: 'street-pass-s1-night-drive', showThemeOnProfile: false },
        { accountId: 'unearned', activeSiteThemeKey: 'neon-vice', showThemeOnProfile: true },
      ],
      [
        { ...NIGHT_DRIVE, accountId: 'shows' },
        { ...NIGHT_DRIVE, accountId: 'hides' },
      ],
    );

    const tags = await profileThemeTags(db, ['shows', 'hides', 'unearned', 'plain', 'shows']);

    expect([...tags.entries()]).toEqual([
      ['shows', { siteTheme: 'street-pass-s1-night-drive', siteThemeLabel: 'Night Drive · Season 1' }],
    ]);
    expect(calls).toEqual({ profiles: 1, unlocks: 1 });
    expect(themeTagFields(tags.get('plain'))).toEqual({ siteTheme: null, siteThemeLabel: null });
  });

  it('makes no queries for an empty list', async () => {
    const { db, calls } = listDb([], []);

    expect((await profileThemeTags(db, [])).size).toBe(0);
    expect(calls).toEqual({ profiles: 0, unlocks: 0 });
  });
});

describe('battleLooks', () => {
  type LookProfile = { accountId: string; itemCosmetics: unknown; crewCosmetics: unknown; showLookOnProfile: boolean };

  function battleDb(profiles: LookProfile[], unlocks: { accountId: string; key: string; styleKey: string | null }[]) {
    return {
      accountProfile: {
        findMany: async (args: { where: { accountId: { in: string[] } } }) => profiles.filter((row) => args.where.accountId.in.includes(row.accountId)),
      },
      accountCosmeticUnlock: {
        findMany: async (args: { where: { accountId: { in: string[] } } }) => unlocks.filter((row) => args.where.accountId.in.includes(row.accountId)),
      },
    } as unknown as PrismaClient;
  }

  const gold = { accountId: 'attacker', key: 'street-pass-s1-cartel-gold', styleKey: 'cartel-gold' };
  const ghost = { accountId: 'defender', key: 'street-pass-s1-urban-ghost', styleKey: 'urban-ghost' };

  it('gives each side its own look and the opponent the look they show', async () => {
    const looks = await battleLooks(battleDb([
      { accountId: 'attacker', itemCosmetics: { AK47: 'cartel-gold', PISTOL: 'midnight-ops' }, crewCosmetics: { THUG: 'cartel-gold' }, showLookOnProfile: true },
      { accountId: 'defender', itemCosmetics: { LOW_RIDER: 'urban-ghost' }, crewCosmetics: { HOE: 'urban-ghost' }, showLookOnProfile: true },
    ], [gold, ghost]), 'attacker', 'defender');

    const attackerLook = { items: { AK47: 'cartel-gold' }, crew: { THUG: 'cartel-gold', HOE: 'classic' } };
    const defenderLook = { items: { LOW_RIDER: 'urban-ghost' }, crew: { THUG: 'classic', HOE: 'urban-ghost' } };
    expect(looks).toEqual({
      attacker: { you: attackerLook, opponent: defenderLook },
      defender: { you: defenderLook, opponent: attackerLook },
    });
  });

  it('shows a hidden look as Classic to the opponent but keeps it in the owner report', async () => {
    const looks = await battleLooks(battleDb([
      { accountId: 'attacker', itemCosmetics: { AK47: 'cartel-gold' }, crewCosmetics: {}, showLookOnProfile: false },
    ], [gold]), 'attacker', 'defender');

    expect(looks.attacker.you).toEqual({ items: { AK47: 'cartel-gold' }, crew: { THUG: 'classic', HOE: 'classic' } });
    expect(looks.defender.opponent).toEqual({ items: {}, crew: { THUG: 'classic', HOE: 'classic' } });
    expect(looks.defender.you).toEqual({ items: {}, crew: { THUG: 'classic', HOE: 'classic' } });
  });
});
