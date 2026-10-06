import type { AccountProfile, PrismaClient } from '@prisma/client';
import { classicOgV07AA } from '@streets/rulesets';
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

function prismaFor(isAdmin: boolean): PrismaClient {
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
      findMany: async () => [],
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
