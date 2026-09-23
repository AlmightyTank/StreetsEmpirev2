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
import { AppError } from '../utils/errors.js';
import { betaTesterAwardsForAccount, CommunityService, legacyAchievements, loadAccountLegacy } from './community.service.js';
import { RoundPlayerService } from './round-player.service.js';
import { RoundService } from './round.service.js';
import { QuestCosmeticService } from './quest-cosmetic.service.js';

export const PROFILE_BADGE_FEATURE_LIMIT = 6;

export const PROFILE_ACCENTS: CosmeticOptionDto[] = [
  { key: 'default', label: 'StreetsEmpire', description: 'The classic red and neon profile accent.' },
  { key: 'crimson', label: 'Crimson', description: 'A deep red profile accent.' },
  { key: 'gold', label: 'Gold', description: 'A winner-style gold profile accent.' },
  { key: 'green', label: 'Green', description: 'A money-green profile accent.' },
  { key: 'blue', label: 'Blue', description: 'A cool blue profile accent.' },
  { key: 'purple', label: 'Purple', description: 'A rare purple profile accent.' },
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

function toSettingsDto(profile: AccountProfile | null, earnedKeys: Set<string>): AccountProfileSettingsDto {
  const activeTitleKey = profile?.activeTitleKey && earnedKeys.has(profile.activeTitleKey)
    ? profile.activeTitleKey
    : null;
  const featuredBadgeKeys = uniqueKeys(stringArray(profile?.featuredBadgeKeys))
    .filter((key) => earnedKeys.has(key))
    .slice(0, PROFILE_BADGE_FEATURE_LIMIT);
  const profileAccent = PROFILE_ACCENTS.some((option) => option.key === profile?.profileAccent)
    ? profile!.profileAccent as ProfileAccent
    : 'default';
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

export const AccountProfileService = {
  async settings(prisma: PrismaClient, accountId: string): Promise<AccountProfileSettingsResponseDto> {
    const [profile, awards] = await Promise.all([
      readProfile(prisma, accountId),
      earnedAwards(prisma, accountId),
    ]);
    const options = awards.map(optionFromAward);
    const earnedKeys = new Set(options.map((option) => option.key));

    return {
      settings: toSettingsDto(profile, earnedKeys),
      options: {
        titles: options,
        badges: options,
        accents: PROFILE_ACCENTS,
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
    const awards = await earnedAwards(prisma, accountId);
    const earnedKeys = new Set(awards.map((award) => award.key));
    const activeTitleKey = input.activeTitleKey && earnedKeys.has(input.activeTitleKey)
      ? input.activeTitleKey
      : null;
    if (input.activeTitleKey && !activeTitleKey) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick a title you have already earned.', {
        activeTitleKey: 'That title is not unlocked.',
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
        featuredBadgeKeys,
        profileAccent: input.profileAccent,
        uiDensity: input.uiDensity,
        reducedMotion: input.reducedMotion,
        moneyFormat: input.moneyFormat,
        defaultLanding: input.defaultLanding,
      },
      update: {
        activeTitleKey,
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
    const profile = await readProfile(prisma, accountId);
    const unlocked = awards.filter((award) => award.unlocked);
    const earnedKeys = new Set(unlocked.map((award) => award.key));
    const settings = toSettingsDto(profile, earnedKeys);
    const title = unlocked.find((award) => award.key === settings.activeTitleKey)?.title ?? null;
    return { settings, title };
  },
};
