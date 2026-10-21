import { Prisma, type AccountProfile, type PrismaClient } from '@prisma/client';
import { classicOgStreetPassA, classicOgV07AA } from '@streets/rulesets';
import { AVATAR_UNLOCKS, DEFAULT_AVATAR_PARTS, type UpdateAccountProfileSettingsInput } from '@streets/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProfileService, PROFILE_EFFECTS } from '../account-profile.service.js';
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

function frameUnlock(key: string): UnlockRow {
  return { key, kind: 'PROFILE_FRAME', title: key, description: key, styleKey: key, awardedAt: new Date(0) };
}

function themeUnlock(key: string): UnlockRow {
  return { key: `${key}-unlock`, kind: 'SITE_THEME', title: key, description: key, styleKey: key, awardedAt: new Date(0) };
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
        // Like Prisma: update merges onto the saved row, and DbNull is stored as a plain null.
        profile = Object.fromEntries(Object.entries(profile ? { ...profile, ...args.update } : { ...args.create })
          .map(([key, value]) => [key, (value as unknown) === Prisma.DbNull ? null : value])) as AccountProfile;
        return profile;
      },
    },
    accountCosmeticUnlock: {
      findMany: async (args: { where: { kind: string } }) => unlocks.filter((row) => row.kind === args.where.kind),
      findFirst: async () => unlocks
        .filter((row) => row.key.startsWith('supporter-'))
        .sort((a, b) => a.awardedAt.getTime() - b.awardedAt.getTime())[0] ?? null,
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
  showThemeOnProfile: true,
  showLookOnProfile: true,
  featuredBadgeKeys: [],
  profileAccent: 'default',
  uiDensity: 'comfortable',
  reducedMotion: false,
  moneyFormat: 'full',
  defaultLanding: 'game',
  showProfanity: false,
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
      'dragon-ice',
      'dragon-fire',
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

  it('lets an earned dragon shell theme and popup animation be equipped independently', async () => {
    const prisma = prismaFor(false, [themeUnlock('dragon-ice'), themeUnlock('dragon-fire')]);
    const saved = await AccountProfileService.update(prisma, 'account-1', {
      ...updateInput,
      activeSiteThemeKey: 'dragon-ice',
      profileEffect: 'inferno',
    });

    expect(saved.settings.activeSiteThemeKey).toBe('dragon-ice');
    expect(saved.settings.profileEffect).toBe('inferno');
    expect(saved.options.themes.map((option) => option.key)).toEqual(['dragon-ice', 'dragon-fire']);
    expect(saved.options.effects.map((option) => option.key)).toEqual(['none', 'snowstorm', 'inferno']);
  });

  it('unlocks a theme\'s avatar frame and popup animation with the theme', async () => {
    const prisma = prismaFor(false, [themeUnlock('dragon-fire')]);
    const saved = await AccountProfileService.update(prisma, 'account-1', {
      ...updateInput,
      activeSiteThemeKey: 'dragon-fire',
      activeProfileFrameKey: 'inferno-drake',
      activeAvatarFrameKey: 'inferno-drake',
      profileEffect: 'inferno',
    });

    expect(saved.options.frames.map((option) => option.key)).toEqual(['inferno-drake']);
    expect(saved.settings.activeProfileFrameKey).toBeNull();
    expect(saved.settings.activeAvatarFrameKey).toBe('inferno-drake');
    expect(saved.settings.profileEffect).toBe('inferno');
  });

  it('keeps animated popup choices locked for a theme with no matching frame', async () => {
    const prisma = prismaFor(false, [themeUnlock('back-office')]);
    await expect(AccountProfileService.update(prisma, 'account-1', {
      ...updateInput,
      activeSiteThemeKey: 'back-office',
      profileEffect: 'inferno',
    })).rejects.toMatchObject({ code: 'COSMETIC_NOT_EARNED' });
  });

  it('also supports the current-round path when one exists', async () => {
    vi.mocked(RoundService.getCurrent).mockResolvedValue(currentRound() as Awaited<ReturnType<typeof RoundService.getCurrent>>);

    const response = await AccountProfileService.settings(prismaFor(true), 'account-1');

    expect(response.options.themes.map((option) => option.key)).toContain('neon-vice');
  });
});

describe('AccountProfileService animated profile frames', () => {
  beforeEach(() => {
    vi.mocked(RoundService.getCurrent).mockResolvedValue(null);
  });

  it('keeps the dragon effect catalog and locks choices until their frames are earned', async () => {
    expect(PROFILE_EFFECTS.map((option) => option.key)).toEqual([
      'none', 'chrome-serpent', 'phantom-convoy', 'lantern-district', 'siren-breaker',
      'block-sovereign', 'gilded-house', 'dead-or-alive', 'laurel-ascendant', 'snowstorm', 'inferno', 'midnight-chrome',
    ]);
    expect((await AccountProfileService.settings(prismaFor(false), 'account-1')).options.effects.map((option) => option.key)).toEqual(['none']);
    expect((await AccountProfileService.settings(prismaFor(false, [frameUnlock('chrome-serpent-frame'), frameUnlock('phantom-convoy-frame'), frameUnlock('lantern-district-frame'), frameUnlock('siren-breaker-frame'), frameUnlock('block-sovereign-frame'), frameUnlock('gilded-house-frame'), frameUnlock('dead-or-alive-frame'), frameUnlock('laurel-ascendant-frame'), frameUnlock('snowstorm-drake'), frameUnlock('inferno-drake'), frameUnlock('midnight-chrome-frame')]), 'account-1')).options.effects.map((option) => option.key))
      .toEqual(PROFILE_EFFECTS.map((option) => option.key));
  });

  it('saves avatar frames and ignores the retired profile frame field', async () => {
    const prisma = prismaFor(false, [frameUnlock('popup-frame'), frameUnlock('avatar-frame')]);
    const saved = await AccountProfileService.update(prisma, 'account-1', {
      ...updateInput,
      activeSiteThemeKey: null,
      activeProfileFrameKey: 'popup-frame',
      activeAvatarFrameKey: 'avatar-frame',
    });

    expect(saved.settings).toMatchObject({
      activeProfileFrameKey: null,
      activeAvatarFrameKey: 'avatar-frame',
    });
    const withoutAvatarFrame = await AccountProfileService.update(prisma, 'account-1', {
      ...updateInput,
      activeSiteThemeKey: null,
      activeProfileFrameKey: 'popup-frame',
      activeAvatarFrameKey: null,
    });
    expect(withoutAvatarFrame.settings).toMatchObject({
      activeProfileFrameKey: null,
      activeAvatarFrameKey: null,
    });
    await expect(AccountProfileService.update(prisma, 'account-1', {
      ...updateInput,
      activeSiteThemeKey: null,
      activeProfileFrameKey: 'popup-frame',
      activeAvatarFrameKey: 'unearned-frame',
    })).rejects.toMatchObject({ code: 'COSMETIC_NOT_EARNED' });
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
      ['midnight-chrome', true],
      ['obsidian-signal-crew', true],
      ['kingpin-luxe-sedan', true],
      ['kingpin-luxe-thug', true],
      ['kingpin-luxe-hoe', true],
      ['neon-underworld-low-rider', true],
      ['neon-underworld-thug', true],
      ['neon-underworld-hoe', true],
      ['neon-underworld-tek9', true],
      ['winter-heist-van', true],
      ['winter-heist-crew', true],
      ['winter-heist-shotgun', true],
      ['biscayne-sunset-sedan', true],
      ['biscayne-sunset-thug', true],
      ['biscayne-sunset-hoe', true],
      ['biscayne-sunset-pistol', true],
      ['velvet-speakeasy-sedan', true],
      ['velvet-speakeasy-thug', true],
      ['velvet-speakeasy-hoe', true],
      ['velvet-speakeasy-ak47', true],
      ['platinum-funk-low-rider', true],
      ['platinum-funk-thug', true],
      ['platinum-funk-hoe', true],
      ['redline-syndicate-sedan', true],
      ['redline-syndicate-thug', true],
      ['redline-syndicate-hoe', true],
      ['redline-syndicate-ak47', true],
      ['wet-paint-low-rider', true],
      ['wet-paint-thug', true],
      ['wet-paint-hoe', true],
      ['wet-paint-pistol', true],
      ['hazard-cook-van', true],
      ['hazard-cook-crew', true],
      ['hazard-cook-shotgun', true],
      ['dockside-van', true],
      ['dockside-thug', true],
      ['dockside-hoe', true],
      ['dockside-ak47', true],
      ['crown-jewels-sedan', true],
      ['crown-jewels-crew', true],
      ['crown-jewels-ak47', true],
      ['bayou-smoke-van', true],
      ['bayou-smoke-thug', true],
      ['bayou-smoke-hoe', true],
      ['bayou-smoke-shotgun', true],
      ['desert-mirage-low-rider', true],
      ['desert-mirage-thug', true],
      ['desert-mirage-hoe', true],
      ['desert-mirage-tek9', true],
      ['rewind-van', true],
      ['rewind-thug', true],
      ['rewind-hoe', true],
      ['rewind-tek9', true],
      ['snake-eyes-sedan', true],
      ['snake-eyes-thug', true],
      ['snake-eyes-hoe', true],
      ['snake-eyes-pistol', true],
      ['quarter-mile-sedan', true],
      ['quarter-mile-low-rider', true],
      ['quarter-mile-thug', true],
      ['quarter-mile-hoe', true],
      ['quarter-mile-tek9', true],
      ['88-club-van', true],
      ['88-club-thug', true],
      ['88-club-hoe', true],
      ['88-club-pistol', true],
      ['swamp-kingdom-van', true],
      ['swamp-kingdom-thug', true],
      ['swamp-kingdom-hoe', true],
      ['swamp-kingdom-shotgun', true],
      ['zombie-apocalypse-van', true],
      ['zombie-apocalypse-thug', true],
      ['zombie-apocalypse-hoe', true],
      ['zombie-apocalypse-shotgun', true],
      ['taxi-hustle-sedan', true],
      ['two-tone-classic-sedan', true],
      ['lime-flake-low-rider', true],
      ['hot-flames-low-rider', true],
      ['pipe-dreams-van', true],
      ['flower-power-van', true],
      ['tiger-stripe-pistol', true],
      ['damascus-ak47', true],
      ['rust-bucket-shotgun', true],
      ['bubblegum-tek9', true],
      ['velour-tracksuit-thug', true],
      ['bowling-shirt-thug', true],
      ['leopard-coat-hoe', true],
      ['tie-dye-hoe', true],
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
      'midnight-chrome': 'Supporter reward.',
      'obsidian-signal-crew': 'Sold in The Drop for Crowns.',
      'kingpin-luxe-sedan': 'Sold in The Drop for Crowns.',
      'kingpin-luxe-thug': 'Sold in The Drop for Crowns.',
      'kingpin-luxe-hoe': 'Sold in The Drop for Crowns.',
      'neon-underworld-low-rider': 'Sold in The Drop for Crowns.',
      'neon-underworld-thug': 'Sold in The Drop for Crowns.',
      'neon-underworld-hoe': 'Sold in The Drop for Crowns.',
      'neon-underworld-tek9': 'Sold in The Drop for Crowns.',
      'winter-heist-van': 'Sold in The Drop for Crowns.',
      'winter-heist-crew': 'Sold in The Drop for Crowns.',
      'winter-heist-shotgun': 'Sold in The Drop for Crowns.',
      'biscayne-sunset-sedan': 'Sold in The Drop for Crowns.',
      'biscayne-sunset-thug': 'Sold in The Drop for Crowns.',
      'biscayne-sunset-hoe': 'Sold in The Drop for Crowns.',
      'biscayne-sunset-pistol': 'Sold in The Drop for Crowns.',
      'velvet-speakeasy-sedan': 'Sold in The Drop for Crowns.',
      'velvet-speakeasy-thug': 'Sold in The Drop for Crowns.',
      'velvet-speakeasy-hoe': 'Sold in The Drop for Crowns.',
      'velvet-speakeasy-ak47': 'Sold in The Drop for Crowns.',
      'platinum-funk-low-rider': 'Sold in The Drop for Crowns.',
      'platinum-funk-thug': 'Sold in The Drop for Crowns.',
      'platinum-funk-hoe': 'Sold in The Drop for Crowns.',
      'redline-syndicate-sedan': 'Sold in The Drop for Crowns.',
      'redline-syndicate-thug': 'Sold in The Drop for Crowns.',
      'redline-syndicate-hoe': 'Sold in The Drop for Crowns.',
      'redline-syndicate-ak47': 'Sold in The Drop for Crowns.',
      'wet-paint-low-rider': 'Sold in The Drop for Crowns.',
      'wet-paint-thug': 'Sold in The Drop for Crowns.',
      'wet-paint-hoe': 'Sold in The Drop for Crowns.',
      'wet-paint-pistol': 'Sold in The Drop for Crowns.',
      'hazard-cook-van': 'Sold in The Drop for Crowns.',
      'hazard-cook-crew': 'Sold in The Drop for Crowns.',
      'hazard-cook-shotgun': 'Sold in The Drop for Crowns.',
      'dockside-van': 'Sold in The Drop for Crowns.',
      'dockside-thug': 'Sold in The Drop for Crowns.',
      'dockside-hoe': 'Sold in The Drop for Crowns.',
      'dockside-ak47': 'Sold in The Drop for Crowns.',
      'crown-jewels-sedan': 'Sold in The Drop for Crowns.',
      'crown-jewels-crew': 'Sold in The Drop for Crowns.',
      'crown-jewels-ak47': 'Sold in The Drop for Crowns.',
      'bayou-smoke-van': 'Sold in The Drop for Crowns.',
      'bayou-smoke-thug': 'Sold in The Drop for Crowns.',
      'bayou-smoke-hoe': 'Sold in The Drop for Crowns.',
      'bayou-smoke-shotgun': 'Sold in The Drop for Crowns.',
      'desert-mirage-low-rider': 'Sold in The Drop for Crowns.',
      'desert-mirage-thug': 'Sold in The Drop for Crowns.',
      'desert-mirage-hoe': 'Sold in The Drop for Crowns.',
      'desert-mirage-tek9': 'Sold in The Drop for Crowns.',
      'rewind-van': 'Sold in The Drop for Crowns.',
      'rewind-thug': 'Sold in The Drop for Crowns.',
      'rewind-hoe': 'Sold in The Drop for Crowns.',
      'rewind-tek9': 'Sold in The Drop for Crowns.',
      'snake-eyes-sedan': 'Sold in The Drop for Crowns.',
      'snake-eyes-thug': 'Sold in The Drop for Crowns.',
      'snake-eyes-hoe': 'Sold in The Drop for Crowns.',
      'snake-eyes-pistol': 'Sold in The Drop for Crowns.',
      'quarter-mile-sedan': 'Sold in The Drop for Crowns.',
      'quarter-mile-low-rider': 'Sold in The Drop for Crowns.',
      'quarter-mile-thug': 'Sold in The Drop for Crowns.',
      'quarter-mile-hoe': 'Sold in The Drop for Crowns.',
      'quarter-mile-tek9': 'Sold in The Drop for Crowns.',
      '88-club-van': 'Sold in The Drop for Crowns.',
      '88-club-thug': 'Sold in The Drop for Crowns.',
      '88-club-hoe': 'Sold in The Drop for Crowns.',
      '88-club-pistol': 'Sold in The Drop for Crowns.',
      'swamp-kingdom-van': 'Sold in The Drop for Crowns.',
      'swamp-kingdom-thug': 'Sold in The Drop for Crowns.',
      'swamp-kingdom-hoe': 'Sold in The Drop for Crowns.',
      'swamp-kingdom-shotgun': 'Sold in The Drop for Crowns.',
      'zombie-apocalypse-van': 'Sold in The Drop for Crowns.',
      'zombie-apocalypse-thug': 'Sold in The Drop for Crowns.',
      'zombie-apocalypse-hoe': 'Sold in The Drop for Crowns.',
      'zombie-apocalypse-shotgun': 'Sold in The Drop for Crowns.',
      'taxi-hustle-sedan': 'Sold in The Drop for Crowns.',
      'two-tone-classic-sedan': 'Sold in The Drop for Crowns.',
      'lime-flake-low-rider': 'Sold in The Drop for Crowns.',
      'hot-flames-low-rider': 'Sold in The Drop for Crowns.',
      'pipe-dreams-van': 'Sold in The Drop for Crowns.',
      'flower-power-van': 'Sold in The Drop for Crowns.',
      'tiger-stripe-pistol': 'Sold in The Drop for Crowns.',
      'damascus-ak47': 'Sold in The Drop for Crowns.',
      'rust-bucket-shotgun': 'Sold in The Drop for Crowns.',
      'bubblegum-tek9': 'Sold in The Drop for Crowns.',
      'velour-tracksuit-thug': 'Sold in The Drop for Crowns.',
      'bowling-shirt-thug': 'Sold in The Drop for Crowns.',
      'leopard-coat-hoe': 'Sold in The Drop for Crowns.',
      'tie-dye-hoe': 'Sold in The Drop for Crowns.',
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

describe('AccountProfileService profile showcase toggles', () => {
  beforeEach(() => {
    vi.mocked(RoundService.getCurrent).mockResolvedValue(null);
  });

  it('defaults both toggles on and saves a player turning them off', async () => {
    const prisma = prismaFor(false);
    expect((await AccountProfileService.settings(prisma, 'account-1')).settings).toMatchObject({
      showThemeOnProfile: true,
      showLookOnProfile: true,
    });

    const saved = await AccountProfileService.update(prisma, 'account-1', {
      ...updateInput,
      activeSiteThemeKey: null,
      showThemeOnProfile: false,
      showLookOnProfile: false,
    });

    expect(saved.settings).toMatchObject({ showThemeOnProfile: false, showLookOnProfile: false });
  });

  it('saves a built avatar, keeps it when omitted and removes it on null', async () => {
    const prisma = prismaFor(false);
    const input = { ...updateInput, activeSiteThemeKey: null };
    expect((await AccountProfileService.settings(prisma, 'account-1')).settings.profileAvatar).toBeNull();

    const avatar = { ...DEFAULT_AVATAR_PARTS.girl, hair: 'braids' as const, shirtColor: 'gold' as const };
    const saved = await AccountProfileService.update(prisma, 'account-1', { ...input, profileImageUrl: null, profileAvatar: avatar });
    expect(saved.settings).toMatchObject({ profileImageUrl: null, profileAvatar: avatar });

    const kept = await AccountProfileService.update(prisma, 'account-1', input);
    expect(kept.settings.profileAvatar).toEqual(avatar);

    const cleared = await AccountProfileService.update(prisma, 'account-1', { ...input, profileAvatar: null });
    expect(cleared.settings.profileAvatar).toBeNull();
  });

  it('refuses a locked avatar piece until the account owns it, then saves it', async () => {
    const input = { ...updateInput, activeSiteThemeKey: null };
    const avatar = { ...DEFAULT_AVATAR_PARTS.boy, headwear: 'snapback' as const };

    await expect(AccountProfileService.update(prismaFor(false), 'account-1', { ...input, profileAvatar: avatar }))
      .rejects.toMatchObject({ code: 'COSMETIC_NOT_EARNED', fields: { profileAvatar: 'One or more avatar pieces are not unlocked.' } });

    const owner = prismaFor(false, [{ key: AVATAR_UNLOCKS.snapback, kind: 'AVATAR_PART', title: 'Snapback', description: '', styleKey: 'headwear:snapback', awardedAt: new Date(0) }]);
    const saved = await AccountProfileService.update(owner, 'account-1', { ...input, profileAvatar: avatar });
    expect(saved.settings.profileAvatar).toEqual(avatar);
    expect(saved.options.avatarUnlocks).toEqual([AVATAR_UNLOCKS.snapback]);
  });

  it('opens every avatar piece to admins in seasonal QA mode', async () => {
    const response = await AccountProfileService.settings(prismaFor(true), 'account-1');
    expect(response.options.avatarUnlocks).toEqual(expect.arrayContaining(Object.values(AVATAR_UNLOCKS)));
  });
});

describe('AccountProfileService Midnight Chrome supporter rewards', () => {
  const supporterUnlocks = (): UnlockRow[] => [
    { key: 'supporter-midnight-chrome', kind: 'ITEM_COLLECTION', title: 'Midnight Chrome Collection', description: '', styleKey: 'midnight-chrome', awardedAt: new Date(0) },
    frameUnlock('midnight-chrome-frame'),
    { key: 'supporter-banner-accent', kind: 'ACCENT', title: 'Supporter Banner Accent', description: '', styleKey: 'supporter-crimson', awardedAt: new Date(0) },
  ];
  const input = { ...updateInput, activeSiteThemeKey: null };

  beforeEach(() => {
    vi.mocked(RoundService.getCurrent).mockResolvedValue(null);
  });

  it('says how a locked supporter collection is earned', async () => {
    const response = await AccountProfileService.settings(prismaFor(false), 'account-1');

    expect(response.convenience).toEqual({ hasRewards: false, presetSlots: 1, loadoutSlots: 1 });
    expect(response.options.crewStyles?.find((option) => option.key === 'midnight-chrome')).toMatchObject({
      locked: true,
      unlockHint: 'Supporter reward.',
    });
  });

  it('keeps the collection on the crew and rides it has art for', async () => {
    const prisma = prismaFor(false, supporterUnlocks());
    const saved = await AccountProfileService.update(prisma, 'account-1', {
      ...input,
      // The route schema refuses AK47 here; a stale saved value must still read back as Classic.
      itemCosmetics: { SEDAN: 'midnight-chrome', AK47: 'midnight-chrome' },
      crewCosmetics: { THUG: 'midnight-chrome', HOE: 'midnight-chrome' },
    });

    expect(saved.settings.itemCosmetics).toEqual({ SEDAN: 'midnight-chrome' });
    expect(saved.settings.crewCosmetics).toEqual({ THUG: 'midnight-chrome', HOE: 'midnight-chrome' });
  });

  it('offers card surfaces and the chrome glint only with the Signature card', async () => {
    const without = await AccountProfileService.settings(prismaFor(false), 'account-1');
    expect(without.options.surfaces).toEqual([]);
    expect(without.options.effects.map((option) => option.key)).not.toContain('midnight-chrome');
    await expect(AccountProfileService.update(prismaFor(false), 'account-1', { ...input, profileSurface: 'carbon' }))
      .rejects.toMatchObject({ code: 'COSMETIC_NOT_EARNED' });

    const prisma = prismaFor(false, supporterUnlocks());
    const settings = await AccountProfileService.settings(prisma, 'account-1');
    expect(settings.convenience).toEqual({ hasRewards: true, presetSlots: 4, loadoutSlots: 4 });
    expect(settings.options.surfaces?.map((option) => option.key)).toEqual(['brushed', 'carbon', 'engine-turned']);
    expect(settings.options.effects.map((option) => option.key)).toContain('midnight-chrome');

    // The card rides on its avatar frame; the retired popup-frame slot stays empty.
    const saved = await AccountProfileService.update(prisma, 'account-1', {
      ...input,
      activeAvatarFrameKey: 'midnight-chrome-frame',
      profileEffect: 'midnight-chrome',
      profileSurface: 'engine-turned',
    });
    expect(saved.settings).toMatchObject({
      activeProfileFrameKey: null,
      activeAvatarFrameKey: 'midnight-chrome-frame',
      profileEffect: 'midnight-chrome',
      profileSurface: 'engine-turned',
    });
  });

  it('equips the supporter banner accent only after the unlock exists', async () => {
    await expect(AccountProfileService.update(prismaFor(false), 'account-1', {
      ...input,
      profileAccent: 'supporter-crimson',
    })).rejects.toMatchObject({ code: 'COSMETIC_NOT_EARNED' });

    const prisma = prismaFor(false, supporterUnlocks());
    const saved = await AccountProfileService.update(prisma, 'account-1', {
      ...input,
      profileAccent: 'supporter-crimson',
    });

    expect(saved.options.accents.find((option) => option.key === 'supporter-crimson')).toMatchObject({
      label: 'Supporter Banner Accent',
    });
    expect(saved.settings.profileAccent).toBe('supporter-crimson');
  });
});
