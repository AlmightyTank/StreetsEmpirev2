import type { AccountProfile, PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { CUSTOMIZABLE_ITEM_KEYS, DEFAULT_CREW_COSMETICS, ITEM_COSMETIC_STYLES, ITEM_COSMETIC_STYLE_KEYS } from '@streets/shared';
import type {
  AccountProfileSettingsDto,
  AccountProfileSettingsResponseDto,
  BadgeCosmeticOptionDto,
  CosmeticOptionDto,
  CrewCosmeticLoadout,
  DefaultLanding,
  ItemCosmeticLoadout,
  ItemCosmeticStyleKey,
  MoneyFormat,
  ProfileAccent,
  ProfileEffect,
  PublicAwardDto,
  UiDensity,
  UpdateAccountProfileSettingsInput,
} from '@streets/shared';
import { rulesets, type QuestCosmeticDefinition, type Ruleset } from '@streets/rulesets';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { CommunityService, permanentAwardsForAccount } from './community.service.js';
import { RoundPlayerService } from './round-player.service.js';
import { RoundService } from './round.service.js';
import { QuestCosmeticService } from './quest-cosmetic.service.js';
import { isPermanentAward } from './profile-badges.js';
import { profileTitleForAward } from './profile-titles.js';

export const PROFILE_BADGE_FEATURE_LIMIT = 6;

export const ITEM_COSMETIC_STYLE_OPTIONS: CosmeticOptionDto[] = ITEM_COSMETIC_STYLES.map((style) => ({
  key: style.key,
  label: style.label,
  description: style.description,
}));

const itemCosmeticStyleKeys = new Set<string>(ITEM_COSMETIC_STYLE_KEYS);

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function itemCosmeticLoadout(value: unknown): ItemCosmeticLoadout {
  const raw = stringRecord(value);
  const loadout: ItemCosmeticLoadout = {};
  for (const key of CUSTOMIZABLE_ITEM_KEYS) {
    const style = raw[key];
    if (style && itemCosmeticStyleKeys.has(style)) loadout[key] = style as ItemCosmeticStyleKey;
  }
  return loadout;
}

function crewCosmeticLoadout(value: unknown): CrewCosmeticLoadout {
  const raw = stringRecord(value);
  const style = (key: keyof CrewCosmeticLoadout): ItemCosmeticStyleKey => {
    const candidate = raw[key];
    return candidate && itemCosmeticStyleKeys.has(candidate)
      ? candidate as ItemCosmeticStyleKey
      : DEFAULT_CREW_COSMETICS[key];
  };
  return { THUG: style('THUG'), HOE: style('HOE') };
}

const honorificTitles: BadgeCosmeticOptionDto[] = [
  { key: 'honorific-sir', label: 'Sir', description: 'A classic street honorific.', rarity: 'common', permanent: true },
  { key: 'honorific-madam', label: 'Madam', description: 'A classic street honorific.', rarity: 'common', permanent: true },
  { key: 'honorific-don', label: 'Don', description: 'A classic underworld honorific.', rarity: 'common', permanent: true },
  { key: 'honorific-donna', label: 'Donna', description: 'A classic underworld honorific.', rarity: 'common', permanent: true },
];
const honorificTitleKeys = honorificTitles.map((option) => option.key);

export const PROFILE_ACCENTS: CosmeticOptionDto[] = [
  { key: 'default', label: 'StreetsEmpire', description: 'The classic neon-green profile accent.' },
  { key: 'crimson', label: 'Crimson', description: 'A deep red profile accent.' },
  { key: 'gold', label: 'Goldenrod', description: 'A bright goldenrod profile accent.' },
  { key: 'green', label: 'Emerald', description: 'A rich emerald-green profile accent.' },
  { key: 'blue', label: 'Cornflower', description: 'A soft cornflower-blue profile accent.' },
  { key: 'purple', label: 'Orchid', description: 'A vivid orchid-purple profile accent.' },
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

export const PROFILE_EFFECTS: CosmeticOptionDto[] = [
  { key: 'none', label: 'No effect', description: 'Keep the profile card still and clean.' },
  { key: 'neon-pulse', label: 'Neon pulse', description: 'A soft animated accent glow around your profile.' },
  { key: 'scanlines', label: 'Scanlines', description: 'A subtle moving screen-line overlay.' },
  { key: 'spotlight', label: 'Spotlight', description: 'A slow highlight sweep across the card.' },
  { key: 'glitch', label: 'Glitch', description: 'A sharper flicker effect for loud profiles.' },
  { key: 'ember-sparks', label: 'Ember sparks', description: 'Warm sparks and corner heat for a late-night profile card.' },
  { key: 'cash-shimmer', label: 'Cash shimmer', description: 'A soft green-gold money glint across the profile.' },
  { key: 'sirens', label: 'Sirens', description: 'Alternating red and blue pressure lights on the card edge.' },
  { key: 'smoke', label: 'Smoke', description: 'A slow smoky haze over the profile banner and frame.' },
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
    permanent: isPermanentAward(award),
  };
}

function titleOptionFromAward(award: PublicAwardDto): BadgeCosmeticOptionDto {
  return {
    key: award.key,
    label: profileTitleForAward(award),
    description: `Earned from ${award.title}: ${award.description}`,
    rarity: award.rarity,
    permanent: isPermanentAward(award),
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

function adminCatalogSiteThemeOptions(): CosmeticOptionDto[] {
  const options: CosmeticOptionDto[] = [];
  const known = new Set<string>();
  for (const ruleset of Object.values(rulesets)) {
    for (const option of adminSiteThemeOptions(ruleset)) {
      if (!known.has(option.key)) {
        options.push(option);
        known.add(option.key);
      }
    }
  }
  return options;
}

function toSettingsDto(
  profile: AccountProfile | null,
  earnedBadgeKeys: Set<string>,
  earnedTitleKeys: Set<string>,
  accentOptions: CosmeticOptionDto[],
  frameOptions: CosmeticOptionDto[],
  themeOptions: CosmeticOptionDto[],
): AccountProfileSettingsDto {
  const activeTitleKey = profile?.activeTitleKey && earnedTitleKeys.has(profile.activeTitleKey)
    ? profile.activeTitleKey
    : null;
  const featuredBadgeKeys = uniqueKeys(stringArray(profile?.featuredBadgeKeys))
    .filter((key) => earnedBadgeKeys.has(key))
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
  const profileEffect = PROFILE_EFFECTS.some((option) => option.key === profile?.profileEffect)
    ? profile!.profileEffect as ProfileEffect
    : 'none';
  return {
    activeTitleKey,
    titlePlacement: profile?.titlePlacement === 'suffix' ? 'suffix' : 'prefix',
    crewName: profile?.crewName ?? null,
    profileBio: profile?.profileBio ?? null,
    profileImageUrl: profile?.profileImageUrl ?? null,
    profileBannerUrl: profile?.profileBannerUrl ?? null,
    profileEffect,
    activeProfileFrameKey,
    activeSiteThemeKey,
    itemCosmetics: itemCosmeticLoadout(profile?.itemCosmetics),
    crewCosmetics: crewCosmeticLoadout(profile?.crewCosmetics),
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
  return (await permanentAwardsForAccount(prisma, accountId, round?.id ?? null))
    .filter((award) => award.unlocked);
}

async function readProfile(prisma: PrismaClient, accountId: string): Promise<AccountProfile | null> {
  return prisma.accountProfile.findUnique({ where: { accountId } });
}

async function appearanceOptions(prisma: PrismaClient, accountId: string): Promise<{
  accents: CosmeticOptionDto[];
  frames: CosmeticOptionDto[];
  themes: CosmeticOptionDto[];
}> {
  const [questAccents, frames, themes, account] = await Promise.all([
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'ACCENT'),
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'PROFILE_FRAME'),
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'SITE_THEME'),
    prisma.account.findUnique({ where: { id: accountId }, select: { isAdmin: true } }),
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
  if (account?.isAdmin && env.seasonalEvents.adminTestMode) {
    for (const option of adminCatalogSiteThemeOptions()) {
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
    const titleOptions = [...honorificTitles, ...awards.map(titleOptionFromAward)];
    const badgeOptions = awards.map(optionFromAward);
    const earnedBadgeKeys = new Set(badgeOptions.map((option) => option.key));
    const earnedTitleKeys = new Set([...earnedBadgeKeys, ...honorificTitleKeys]);

    return {
      settings: toSettingsDto(profile, earnedBadgeKeys, earnedTitleKeys, appearance.accents, appearance.frames, appearance.themes),
      options: {
        titles: titleOptions,
        badges: badgeOptions,
        accents: appearance.accents,
        frames: appearance.frames,
        themes: appearance.themes,
        effects: PROFILE_EFFECTS,
        itemStyles: ITEM_COSMETIC_STYLE_OPTIONS,
        crewStyles: ITEM_COSMETIC_STYLE_OPTIONS,
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
    const earnedBadgeKeys = new Set(awards.map((award) => award.key));
    const earnedTitleKeys = new Set([...earnedBadgeKeys, ...honorificTitleKeys]);
    const activeTitleKey = input.activeTitleKey && earnedTitleKeys.has(input.activeTitleKey)
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
        profileAccent: 'That profile accent is not unlocked.',
      });
    }
    const featuredBadgeKeys = uniqueKeys(input.featuredBadgeKeys)
      .filter((key) => earnedBadgeKeys.has(key))
      .slice(0, PROFILE_BADGE_FEATURE_LIMIT);
    if (featuredBadgeKeys.length !== uniqueKeys(input.featuredBadgeKeys).length) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Feature only badges you have already earned.', {
        featuredBadgeKeys: 'One or more badges are not unlocked.',
      });
    }

    const crewName = input.crewName === undefined ? undefined : input.crewName;
    const profileBio = input.profileBio === undefined ? undefined : input.profileBio;
    const profileImageUrl = input.profileImageUrl === undefined ? undefined : input.profileImageUrl;
    const profileBannerUrl = input.profileBannerUrl === undefined ? undefined : input.profileBannerUrl;
    const profileEffect = input.profileEffect === undefined ? undefined : input.profileEffect;

    await prisma.accountProfile.upsert({
      where: { accountId },
      create: {
        accountId,
        activeTitleKey,
        titlePlacement: input.titlePlacement,
        crewName: crewName ?? null,
        profileBio: profileBio ?? null,
        profileImageUrl: profileImageUrl ?? null,
        profileBannerUrl: profileBannerUrl ?? null,
        profileEffect: profileEffect ?? 'none',
        activeProfileFrameKey,
        activeSiteThemeKey,
        itemCosmetics: input.itemCosmetics ?? {},
        crewCosmetics: input.crewCosmetics ?? DEFAULT_CREW_COSMETICS,
        featuredBadgeKeys,
        profileAccent: input.profileAccent,
        uiDensity: input.uiDensity,
        reducedMotion: input.reducedMotion,
        moneyFormat: input.moneyFormat,
        defaultLanding: input.defaultLanding,
      },
      update: {
        activeTitleKey,
        titlePlacement: input.titlePlacement,
        ...(crewName !== undefined ? { crewName } : {}),
        ...(profileBio !== undefined ? { profileBio } : {}),
        ...(profileImageUrl !== undefined ? { profileImageUrl } : {}),
        ...(profileBannerUrl !== undefined ? { profileBannerUrl } : {}),
        ...(profileEffect !== undefined ? { profileEffect } : {}),
        activeProfileFrameKey,
        activeSiteThemeKey,
        itemCosmetics: input.itemCosmetics ?? {},
        crewCosmetics: input.crewCosmetics ?? DEFAULT_CREW_COSMETICS,
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
  ): Promise<{ settings: AccountProfileSettingsDto; title: string | null; titlePlacement: 'prefix' | 'suffix' }> {
    const [profile, appearance] = await Promise.all([
      readProfile(prisma, accountId),
      appearanceOptions(prisma, accountId),
    ]);
    const unlocked = awards.filter((award) => award.unlocked);
    const earnedBadgeKeys = new Set(unlocked.map((award) => award.key));
    const earnedTitleKeys = new Set([...earnedBadgeKeys, ...honorificTitleKeys]);
    const settings = toSettingsDto(profile, earnedBadgeKeys, earnedTitleKeys, appearance.accents, appearance.frames, appearance.themes);
    const titleAward = unlocked.find((award) => award.key === settings.activeTitleKey);
    const title = settings.activeTitleKey && honorificTitleKeys.includes(settings.activeTitleKey)
      ? profileTitleForAward({ key: settings.activeTitleKey, title: settings.activeTitleKey })
      : titleAward ? profileTitleForAward(titleAward) : null;
    return { settings, title, titlePlacement: settings.titlePlacement };
  },
};
