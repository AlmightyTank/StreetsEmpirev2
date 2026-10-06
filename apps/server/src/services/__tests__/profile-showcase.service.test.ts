import type { AccountProfile, PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { profileShowcase } from '../profile-showcase.service.js';

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
