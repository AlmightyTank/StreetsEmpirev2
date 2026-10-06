import type { AccountProfile, PrismaClient } from '@prisma/client';
import { classicOgStreetPassA, classicOgV07AA } from '@streets/rulesets';
import type { UpdateAccountProfileSettingsInput } from '@streets/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProfileService } from '../account-profile.service.js';
import { RoundService } from '../round.service.js';

vi.mock('../round.service.js', () => ({
  RoundService: {
    getCurrent: vi.fn(),
  },
}));

function currentRound() {
  return {
    id: 'round-1',
    rulesetId: classicOgV07AA.meta.id,
    rulesetVersion: classicOgV07AA.meta.version,
  };
}

type UnlockRow = { key: string; kind: string; title: string; description: string; styleKey: string | null; awardedAt: Date };

function collectionUnlock(styleKey: string): UnlockRow {
  return { key: `street-pass-s1-${styleKey}`, kind: 'ITEM_COLLECTION', title: styleKey, description: styleKey, styleKey, awardedAt: new Date(0) };
}

function prismaFor(isAdmin: boolean, unlocks: UnlockRow[] = []): PrismaClient {
  let profile: AccountProfile | null = null;
  return {
    account: {
      findUnique: async () => ({ isAdmin }),
      // Beta-tester awards look the account up when BETA_TESTER_DISCORD_LINKED is on in .env.
      findFirst: async () => null,
    },
    accountProfile: {
      findUnique: async () => profile,
      upsert: async (args: { create: AccountProfile; update: AccountProfile }) => {
        profile = { ...args.create, ...args.update } as AccountProfile;
        return profile;
      },
    },
    accountCosmeticUnlock: {
      findMany: async (args: { where: { kind: string } }) => unlocks.filter((row) => row.kind === args.where.kind),
    },
    roundPlayer: {
      findUnique: async () => null,
      findMany: async () => [],
    },
  } as unknown as PrismaClient;
}

const updateInput: UpdateAccountProfileSettingsInput = {
  activeTitleKey: null,
  titlePlacement: 'prefix',
  activeProfileFrameKey: null,
  activeSiteThemeKey: 'neon-vice',
  itemCosmetics: {},
  crewCosmetics: { THUG: 'classic', HOE: 'classic' },
  featuredBadgeKeys: [],
  profileAccent: 'default',
  uiDensity: 'comfortable',
  reducedMotion: false,
  moneyFormat: 'full',
  defaultLanding: 'game',
};

describe('AccountProfileService admin site theme QA', () => {
  beforeEach(() => {
    vi.mocked(RoundService.getCurrent).mockResolvedValue(null);
  });

  it('shows catalog site themes to admins without unlock rows or a current round', async () => {
    const response = await AccountProfileService.settings(prismaFor(true), 'account-1');

    expect(response.options.themes.map((option) => option.key)).toEqual(expect.arrayContaining([
      'neon-vice',
      'motor-city-iron',
      'rain-city-wire',
      'open-road',
      'blue-heat',
      'back-office',
      'casino-floor',
      'federal-case',
      'midnight-market',
      'winter-lights',
      'halloween-moon',
    ]));
  });

  it('does not show unearned current-ruleset site themes to non-admins', async () => {
    const response = await AccountProfileService.settings(prismaFor(false), 'account-1');

    expect(response.options.themes).toEqual([]);
  });

  it('offers selectable honorifics and saves title placement without an achievement unlock', async () => {
    const prisma = prismaFor(false);
    const settings = await AccountProfileService.settings(prisma, 'account-1');
    expect(settings.options.titles.map((option) => option.label)).toEqual(expect.arrayContaining(['Sir', 'Madam', 'Don', 'Donna']));

    const response = await AccountProfileService.update(prisma, 'account-1', {
      ...updateInput,
      activeTitleKey: 'honorific-madam',
      titlePlacement: 'prefix',
      activeSiteThemeKey: null,
    });

    expect(response.settings.activeTitleKey).toBe('honorific-madam');
    expect(response.settings.titlePlacement).toBe('prefix');

    const publicCosmetics = await AccountProfileService.publicCosmetics(prisma, 'account-1', []);
    expect(publicCosmetics.title).toBe('Madam');
    expect(publicCosmetics.titlePlacement).toBe('prefix');
  });

  it('does not allow an always-available honorific to be featured as an earned badge', async () => {
    await expect(AccountProfileService.update(prismaFor(false), 'account-1', {
      ...updateInput,
      activeSiteThemeKey: null,
      featuredBadgeKeys: ['honorific-sir'],
    })).rejects.toMatchObject({ code: 'COSMETIC_NOT_EARNED' });
  });

  it('lets admins save a current-ruleset QA theme without an unlock row', async () => {
    const response = await AccountProfileService.update(prismaFor(true), 'account-1', updateInput);

    expect(response.settings.activeSiteThemeKey).toBe('neon-vice');
  });

  it('also supports the current-round path when one exists', async () => {
    vi.mocked(RoundService.getCurrent).mockResolvedValue(currentRound() as Awaited<ReturnType<typeof RoundService.getCurrent>>);

    const response = await AccountProfileService.settings(prismaFor(true), 'account-1');

    expect(response.options.themes.map((option) => option.key)).toContain('neon-vice');
  });
});

describe('AccountProfileService Street Pass collection unlocks', () => {
  beforeEach(() => {
    vi.mocked(RoundService.getCurrent).mockResolvedValue(null);
  });

  it('offers every collection but locks the ones the account has not earned', async () => {
    const response = await AccountProfileService.settings(prismaFor(false, [collectionUnlock('urban-ghost')]), 'account-1');

    expect(response.options.itemStyles?.map((option) => [option.key, option.locked])).toEqual([
      ['classic', false],
      ['midnight-ops', true],
      ['urban-ghost', false],
      ['cartel-gold', true],
    ]);
    expect(response.options.crewStyles?.find((option) => option.key === 'cartel-gold')).toMatchObject({
      locked: true,
      unlockHint: 'Earned on the Street Pass.',
    });
  });

  it('names the Street Pass tier that pays each collection on a pass round', async () => {
    vi.mocked(RoundService.getCurrent).mockResolvedValue({
      id: 'round-1',
      rulesetId: classicOgStreetPassA.meta.id,
      rulesetVersion: classicOgStreetPassA.meta.version,
    } as Awaited<ReturnType<typeof RoundService.getCurrent>>);

    const response = await AccountProfileService.settings(prismaFor(false), 'account-1');

    expect(Object.fromEntries(response.options.itemStyles!.map((option) => [option.key, option.unlockHint]))).toEqual({
      classic: null,
      'urban-ghost': 'Street Pass · Season 1, tier 8',
      'midnight-ops': 'Street Pass · Season 1, tier 18',
      'cartel-gold': 'Street Pass · Season 1, tier 28',
    });
  });

  it('saves earned collections and refuses unearned ones for items and crew', async () => {
    const prisma = prismaFor(false, [collectionUnlock('urban-ghost')]);
    const input = { ...updateInput, activeSiteThemeKey: null };

    const saved = await AccountProfileService.update(prisma, 'account-1', {
      ...input,
      itemCosmetics: { AK47: 'urban-ghost' },
      crewCosmetics: { THUG: 'urban-ghost', HOE: 'classic' },
    });
    expect(saved.settings.itemCosmetics).toEqual({ AK47: 'urban-ghost' });
    expect(saved.settings.crewCosmetics).toEqual({ THUG: 'urban-ghost', HOE: 'classic' });

    await expect(AccountProfileService.update(prisma, 'account-1', { ...input, itemCosmetics: { AK47: 'cartel-gold' } }))
      .rejects.toMatchObject({ code: 'COSMETIC_NOT_EARNED' });
    await expect(AccountProfileService.update(prisma, 'account-1', { ...input, crewCosmetics: { THUG: 'classic', HOE: 'midnight-ops' } }))
      .rejects.toMatchObject({ code: 'COSMETIC_NOT_EARNED' });
  });

  it('reads a saved collection the account no longer owns as Classic', async () => {
    const unlocks = [collectionUnlock('cartel-gold')];
    const prisma = prismaFor(false, unlocks);
    await AccountProfileService.update(prisma, 'account-1', {
      ...updateInput,
      activeSiteThemeKey: null,
      itemCosmetics: { PISTOL: 'cartel-gold' },
      crewCosmetics: { THUG: 'cartel-gold', HOE: 'cartel-gold' },
    });

    unlocks.length = 0;
    const response = await AccountProfileService.settings(prisma, 'account-1');

    expect(response.settings.itemCosmetics).toEqual({});
    expect(response.settings.crewCosmetics).toEqual({ THUG: 'classic', HOE: 'classic' });
  });

  it('opens every collection to admins in seasonal QA mode', async () => {
    const response = await AccountProfileService.settings(prismaFor(true), 'account-1');

    expect(response.options.itemStyles?.every((option) => !option.locked)).toBe(true);
  });
});
