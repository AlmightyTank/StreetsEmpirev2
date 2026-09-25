import type { AccountProfile, PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type {
  AccountProfileSettingsDto,
  AccountProfileSettingsResponseDto,
  BadgeCosmeticOptionDto,
  CosmeticOptionDto,
  DefaultLanding,
  MoneyFormat,
  ProfileAccent,
  PublicAwardDto,
  UiDensity,
  UpdateAccountProfileSettingsInput,
} from '@streets/shared';
import type { QuestCosmeticDefinition, Ruleset } from '@streets/rulesets';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { betaTesterAwardsForAccount, CommunityService, legacyAchievements, loadAccountLegacy } from './community.service.js';
import { RoundPlayerService } from './round-player.service.js';
import { RoundService } from './round.service.js';
import { QuestCosmeticService } from './quest-cosmetic.service.js';
import { profileTitleForAward } from './profile-titles.js';

export const PROFILE_BADGE_FEATURE_LIMIT = 6;

export const PROFILE_ACCENTS: CosmeticOptionDto[] = [
  { key: 'default', label: 'StreetsEmpire', description: 'The classic neon-green site accent.' },
  { key: 'crimson', label: 'Crimson', description: 'A deep red site-wide accent.' },
  { key: 'gold', label: 'Gold', description: 'A winner-style gold site-wide accent.' },
  { key: 'green', label: 'Green', description: 'A money-green site-wide accent.' },
  { key: 'blue', label: 'Blue', description: 'A cool blue site-wide accent.' },
  { key: 'purple', label: 'Purple', description: 'A rare purple site-wide accent.' },
];

export const UI_DENSITIES: CosmeticOptionDto[] = [
  { key: 'comfortable', label: 'Comfortable', description: 'Roomier spacing for slower, clearer scanning.' },
  { key: 'compact', label: 'Compact', description: 'Tighter panels and rows for repeated play.' },
];

export const MONEY_FORMATS: CosmeticOptionDto[] = [
  { key: 'full', label: 'Full money', description: 'Show full dollar amounts in the main status bar.' },
  { key: 'compact', label: 'Compact money', description: 'Use shortened money labels in the main status bar.' },
];

export const DEFAULT_LANDINGS: CosmeticOptionDto[] = [
  { key: 'game', label: 'Dashboard', description: 'Land on the main game dashboard after login.' },
  { key: 'profile', label: 'Profile', description: 'Land on your public profile after login.' },
  { key: 'rankings', label: 'Rankings', description: 'Land on the current rankings after login.' },
  { key: 'news', label: 'News', description: 'Land on the news page after login.' },
];

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function uniqueKeys(keys: string[]): string[] {
  return [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
}

function optionFromAward(award: PublicAwardDto): BadgeCosmeticOptionDto {
  return {
    key: award.key,
    label: award.title,
    description: award.description,
    rarity: award.rarity,
    permanent: award.category === 'legacy' || award.category === 'quest',
  };
}

function titleOptionFromAward(award: PublicAwardDto): BadgeCosmeticOptionDto {
  return {
    key: award.key,
    label: profileTitleForAward(award),
    description: `Earned from ${award.title}: ${award.description}`,
    rarity: award.rarity,
    permanent: award.category === 'legacy' || award.category === 'quest',
  };
}

function optionFromCosmetic(cosmetic: QuestCosmeticDefinition): CosmeticOptionDto {
  return {
    key: cosmetic.styleKey ?? cosmetic.key,
    label: cosmetic.name,
    description: cosmetic.description,
  };
}

function adminSiteThemeOptions(ruleset: Ruleset): CosmeticOptionDto[] {
  return Object.values(ruleset.cosmetics ?? {})
    .filter((cosmetic) => cosmetic.kind === 'SITE_THEME')
    .map(optionFromCosmetic);
}

function toSettingsDto(
  profile: AccountProfile | null,
  earnedKeys: Set<string>,
  accentOptions: CosmeticOptionDto[],
  frameOptions: CosmeticOptionDto[],
  themeOptions: CosmeticOptionDto[],
): AccountProfileSettingsDto {
  const activeTitleKey = profile?.activeTitleKey && earnedKeys.has(profile.activeTitleKey)
    ? profile.activeTitleKey
    : null;
  const featuredBadgeKeys = uniqueKeys(stringArray(profile?.featuredBadgeKeys))
    .filter((key) => earnedKeys.has(key))
    .slice(0, PROFILE_BADGE_FEATURE_LIMIT);
  const accentKeys = new Set(accentOptions.map((option) => option.key));
  const frameKeys = new Set(frameOptions.map((option) => option.key));
  const themeKeys = new Set(themeOptions.map((option) => option.key));
  const profileAccent = profile?.profileAccent && accentKeys.has(profile.profileAccent)
    ? profile.profileAccent as ProfileAccent
    : 'default';
  const activeProfileFrameKey = profile?.activeProfileFrameKey && frameKeys.has(profile.activeProfileFrameKey)
    ? profile.activeProfileFrameKey
    : null;
  const activeSiteThemeKey = profile?.activeSiteThemeKey && themeKeys.has(profile.activeSiteThemeKey)
    ? profile.activeSiteThemeKey
    : null;
  const uiDensity = UI_DENSITIES.some((option) => option.key === profile?.uiDensity)
    ? profile!.uiDensity as UiDensity
    : 'comfortable';
  const moneyFormat = MONEY_FORMATS.some((option) => option.key === profile?.moneyFormat)
    ? profile!.moneyFormat as MoneyFormat
    : 'full';
  const defaultLanding = DEFAULT_LANDINGS.some((option) => option.key === profile?.defaultLanding)
    ? profile!.defaultLanding as DefaultLanding
    : 'game';
  return {
    activeTitleKey,
    activeProfileFrameKey,
    activeSiteThemeKey,
    featuredBadgeKeys,
    profileAccent,
    uiDensity,
    reducedMotion: profile?.reducedMotion ?? false,
    moneyFormat,
    defaultLanding,
  };
}

async function earnedAwards(prisma: PrismaClient, accountId: string): Promise<PublicAwardDto[]> {
  const round = await RoundService.getCurrent(prisma);
  const player = round ? await RoundPlayerService.find(prisma, round.id, accountId) : null;
  if (round && player) {
    const profile = await CommunityService.profile(
      prisma,
      round.id,
      player.publicPimpId,
      player.publicPimpId,
      loadRulesetForRound(round),
      { forumGroups: false },
    );
    return profile.awards.filter((award) => award.unlocked);
  }
  const [legacy, betaTester, questCosmetics] = await Promise.all([
    loadAccountLegacy(prisma, accountId, round?.id ?? null),
    betaTesterAwardsForAccount(prisma, accountId),
    QuestCosmeticService.awardsForAccount(prisma, accountId),
  ]);
  return [
    ...legacyAchievements(legacy),
    ...betaTester,
    ...questCosmetics,
  ].filter((award) => award.unlocked);
}

async function readProfile(prisma: PrismaClient, accountId: string): Promise<AccountProfile | null> {
  return prisma.accountProfile.findUnique({ where: { accountId } });
}

async function appearanceOptions(prisma: PrismaClient, accountId: string): Promise<{
  accents: CosmeticOptionDto[];
  frames: CosmeticOptionDto[];
  themes: CosmeticOptionDto[];
}> {
  const [questAccents, frames, themes, account, round] = await Promise.all([
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'ACCENT'),
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'PROFILE_FRAME'),
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'SITE_THEME'),
    prisma.account.findUnique({ where: { id: accountId }, select: { isAdmin: true } }),
    RoundService.getCurrent(prisma),
  ]);
  const accents = [...PROFILE_ACCENTS];
  const known = new Set(accents.map((option) => option.key));
  for (const option of questAccents) {
    if (!known.has(option.key)) {
      accents.push(option);
      known.add(option.key);
    }
  }
  const themeOptions = [...themes];
  const knownThemes = new Set(themeOptions.map((option) => option.key));
  if (account?.isAdmin && env.seasonalEvents.adminTestMode && round) {
    for (const option of adminSiteThemeOptions(loadRulesetForRound(round))) {
      if (!knownThemes.has(option.key)) {
        themeOptions.push(option);
        knownThemes.add(option.key);
      }
    }
  }
  return { accents, frames, themes: themeOptions };
}

export const AccountProfileService = {
  async settings(prisma: PrismaClient, accountId: string): Promise<AccountProfileSettingsResponseDto> {
    const [profile, awards, appearance] = await Promise.all([
      readProfile(prisma, accountId),
      earnedAwards(prisma, accountId),
      appearanceOptions(prisma, accountId),
    ]);
    const titleOptions = awards.map(titleOptionFromAward);
    const badgeOptions = awards.map(optionFromAward);
    const earnedKeys = new Set(badgeOptions.map((option) => option.key));

    return {
      settings: toSettingsDto(profile, earnedKeys, appearance.accents, appearance.frames, appearance.themes),
      options: {
        titles: titleOptions,
        badges: badgeOptions,
        accents: appearance.accents,
        frames: appearance.frames,
        themes: appearance.themes,
        densities: UI_DENSITIES,
        moneyFormats: MONEY_FORMATS,
        defaultLandings: DEFAULT_LANDINGS,
      },
    };
  },

  async update(
    prisma: PrismaClient,
    accountId: string,
    input: UpdateAccountProfileSettingsInput,
  ): Promise<AccountProfileSettingsResponseDto> {
    const [awards, appearance] = await Promise.all([
      earnedAwards(prisma, accountId),
      appearanceOptions(prisma, accountId),
    ]);
    const earnedKeys = new Set(awards.map((award) => award.key));
    const activeTitleKey = input.activeTitleKey && earnedKeys.has(input.activeTitleKey)
      ? input.activeTitleKey
      : null;
    if (input.activeTitleKey && !activeTitleKey) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick a title you have already earned.', {
        activeTitleKey: 'That title is not unlocked.',
      });
    }
    const frameKeys = new Set(appearance.frames.map((option) => option.key));
    const activeProfileFrameKey = input.activeProfileFrameKey && frameKeys.has(input.activeProfileFrameKey)
      ? input.activeProfileFrameKey
      : null;
    if (input.activeProfileFrameKey && !activeProfileFrameKey) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick a profile frame you have already earned.', {
        activeProfileFrameKey: 'That profile frame is not unlocked.',
      });
    }
    const themeKeys = new Set(appearance.themes.map((option) => option.key));
    const activeSiteThemeKey = input.activeSiteThemeKey && themeKeys.has(input.activeSiteThemeKey)
      ? input.activeSiteThemeKey
      : null;
    if (input.activeSiteThemeKey && !activeSiteThemeKey) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick a site theme you have already earned.', {
        activeSiteThemeKey: 'That site theme is not unlocked.',
      });
    }
    const accentKeys = new Set(appearance.accents.map((option) => option.key));
    if (!accentKeys.has(input.profileAccent)) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick an accent you have already unlocked.', {
        profileAccent: 'That site accent is not unlocked.',
      });
    }
    const featuredBadgeKeys = uniqueKeys(input.featuredBadgeKeys)
      .filter((key) => earnedKeys.has(key))
      .slice(0, PROFILE_BADGE_FEATURE_LIMIT);
    if (featuredBadgeKeys.length !== uniqueKeys(input.featuredBadgeKeys).length) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Feature only badges you have already earned.', {
        featuredBadgeKeys: 'One or more badges are not unlocked.',
      });
    }

    await prisma.accountProfile.upsert({
      where: { accountId },
      create: {
        accountId,
        activeTitleKey,
        activeProfileFrameKey,
        activeSiteThemeKey,
        featuredBadgeKeys,
        profileAccent: input.profileAccent,
        uiDensity: input.uiDensity,
        reducedMotion: input.reducedMotion,
        moneyFormat: input.moneyFormat,
        defaultLanding: input.defaultLanding,
      },
      update: {
        activeTitleKey,
        activeProfileFrameKey,
        activeSiteThemeKey,
        featuredBadgeKeys,
        profileAccent: input.profileAccent,
        uiDensity: input.uiDensity,
        reducedMotion: input.reducedMotion,
        moneyFormat: input.moneyFormat,
        defaultLanding: input.defaultLanding,
      },
    });

    return AccountProfileService.settings(prisma, accountId);
  },

  async publicCosmetics(
    prisma: PrismaClient,
    accountId: string,
    awards: PublicAwardDto[],
  ): Promise<{ settings: AccountProfileSettingsDto; title: string | null }> {
    const [profile, appearance] = await Promise.all([
      readProfile(prisma, accountId),
      appearanceOptions(prisma, accountId),
    ]);
    const unlocked = awards.filter((award) => award.unlocked);
    const earnedKeys = new Set(unlocked.map((award) => award.key));
    const settings = toSettingsDto(profile, earnedKeys, appearance.accents, appearance.frames, appearance.themes);
    const titleAward = unlocked.find((award) => award.key === settings.activeTitleKey);
    const title = titleAward ? profileTitleForAward(titleAward) : null;
    return { settings, title };
  },
};
