import { Prisma, type AccountProfile, type PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import {
  AVATAR_LOCKED_OPTIONS,
  DEFAULT_CREW_COSMETICS,
  lockedAvatarParts,
  RELEASED_CREW_COSMETIC_STYLES,
  RELEASED_ITEM_COSMETIC_STYLES,
  collectionOptions,
  isOwnedCollection,
  isReleasedItemCosmeticStyle,
  readAvatarParts,
  readStreetSignDesign,
  streetSignForCrewName,
  SIGNATURE_CARD_FRAME_KEY,
  SUPPORTER_UNLOCK_HINT,
  DROP_UNLOCK_HINT,
  STREET_SIGN_FONT_PACKS,
  experienceLevelFor,
} from '@streets/shared';
import type {
  AccountProfileSettingsDto,
  AccountProfileSettingsResponseDto,
  BadgeCosmeticOptionDto,
  CollectionOptionDto,
  CosmeticOptionDto,
  DefaultLanding,
  ItemCosmeticStyleKey,
  MoneyFormat,
  ProfileAccent,
  ProfileEffect,
  ProfileSurface,
  PublicAwardDto,
  UiDensity,
  UpdateAccountProfileSettingsInput,
} from '@streets/shared';
import { rulesets, SUPPORTER_COSMETICS, ROUND_ROLL_CALL_FINALE_COSMETICS, DROP_ITEMS, type QuestCosmeticDefinition, type Ruleset } from '@streets/rulesets';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { CommunityService, permanentAwardsForAccount } from './community.service.js';
import { RoundPlayerService } from './round-player.service.js';
import { RoundService } from './round.service.js';
import { QuestCosmeticService, withThemeCompanionFrames } from './quest-cosmetic.service.js';
import { AvatarWearableService } from './avatar-wearable.service.js';
import { isPermanentAward } from './profile-badges.js';
import { profileTitleForAward } from './profile-titles.js';
import { crewCosmeticLoadout, itemCosmeticLoadout } from './profile-showcase.service.js';
import { SupporterService } from './supporter.service.js';
import { supporterTrialActive, TRIAL_SUPPORTER_COSMETICS } from './supporter-trial.service.js';
import { birthdayLookOptions } from './birthday.service.js';
import { assertCommunicationContent } from './content-moderation.service.js';

export const PROFILE_BADGE_FEATURE_LIMIT = 6;
export const FREE_PROFILE_PRESET_SLOTS = 1;
export const SUPPORTER_PROFILE_PRESET_SLOTS = 4;
export const FREE_COSMETIC_LOADOUT_SLOTS = 1;
export const SUPPORTER_COSMETIC_LOADOUT_SLOTS = 4;

function convenienceLimits(hasRewards: boolean): AccountProfileSettingsResponseDto['convenience'] {
  return {
    hasRewards,
    presetSlots: hasRewards ? SUPPORTER_PROFILE_PRESET_SLOTS : FREE_PROFILE_PRESET_SLOTS,
    loadoutSlots: hasRewards ? SUPPORTER_COSMETIC_LOADOUT_SLOTS : FREE_COSMETIC_LOADOUT_SLOTS,
  };
}

/**
 * Slice D: "Street Pass · Season 1, tier 18" for each collection the round's
 * pass pays, so the locker can say how to earn a locked one.
 */
function collectionUnlockHints(ruleset: Ruleset | null): Partial<Record<ItemCosmeticStyleKey, string>> {
  const hints: Partial<Record<ItemCosmeticStyleKey, string>> = {};
  for (const cosmetic of Object.values(SUPPORTER_COSMETICS)) {
    if (cosmetic.kind === 'ITEM_COLLECTION' && isReleasedItemCosmeticStyle(cosmetic.styleKey)) hints[cosmetic.styleKey] = SUPPORTER_UNLOCK_HINT;
  }
  hints['obsidian-signal-crew'] = 'Finish the Round Roll Call attendance track to earn the permanent pair.';
  for (const item of Object.values(DROP_ITEMS)) {
    if (item.kind === 'ITEM_COLLECTION' && item.styleKey && isReleasedItemCosmeticStyle(item.styleKey)) hints[item.styleKey] = DROP_UNLOCK_HINT;
  }
  const pass = ruleset?.streetPass;
  if (!ruleset || !pass) return hints;
  for (const tier of pass.tiers) {
    for (const reward of tier.rewards) {
      if (reward.kind !== 'COSMETIC_UNLOCK' || !reward.key) continue;
      const cosmetic = ruleset.cosmetics?.[reward.key];
      if (cosmetic?.kind === 'ITEM_COLLECTION' && cosmetic.styleKey && isReleasedItemCosmeticStyle(cosmetic.styleKey)) {
        hints[cosmetic.styleKey] ??= `${pass.name}, tier ${tier.tier}`;
      }
    }
  }
  return hints;
}

async function currentRuleset(prisma: PrismaClient): Promise<Ruleset | null> {
  const round = await RoundService.getCurrent(prisma);
  return round ? loadRulesetForRound(round) : null;
}

const honorificTitles: BadgeCosmeticOptionDto[] = [
  { key: 'honorific-sir', label: 'Sir', description: 'A classic street honorific.', rarity: 'common', permanent: true },
  { key: 'honorific-madam', label: 'Madam', description: 'A classic street honorific.', rarity: 'common', permanent: true },
  { key: 'honorific-don', label: 'Don', description: 'A classic underworld honorific.', rarity: 'common', permanent: true },
  { key: 'honorific-donna', label: 'Donna', description: 'A classic underworld honorific.', rarity: 'common', permanent: true },
];
const honorificTitleKeys = honorificTitles.map((option) => option.key);

export const PROFILE_ACCENTS: CosmeticOptionDto[] = [
  { key: 'default', label: 'StreetsEmpire', description: 'The house crimson accent.' },
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
  { key: 'none', label: 'No animation', description: 'Keep both frames still.' },
  { key: 'chrome-serpent', label: 'Chrome Serpent', description: 'A scale-plated chrome dragon coils around the frame with animated teal light.' },
  { key: 'phantom-convoy', label: 'Phantom Convoy', description: 'Headlights sweep across the popup while a road-glass frame shimmers.' },
  { key: 'lantern-district', label: 'Lantern District', description: 'Lanterns sway and cast warm, animated pools of light around the popup.' },
  { key: 'siren-breaker', label: 'Siren Breaker', description: 'A searchlight cuts across the card as red-blue signal light moves around its rim.' },
  { key: 'block-sovereign', label: 'Block Sovereign', description: 'A neighborhood crest lights up as claim marks pulse across the frame.' },
  { key: 'gilded-house', label: 'Gilded House', description: 'A fan of cards opens behind the banner as gold light travels over the trim.' },
  { key: 'dead-or-alive', label: 'Dead-or-Alive', description: 'A wanted notice flutters with paper grain, drifting dust and a stamped seal.' },
  { key: 'laurel-ascendant', label: 'Laurel Ascendant', description: 'A medal turns as gold laurel leaves unfurl around the profile.' },
  { key: 'snowstorm', label: 'Snowstorm', description: 'A living ice-dragon frame sweeps through snow and frost.' },
  { key: 'inferno', label: 'Inferno', description: 'A living fire-dragon frame moves through flame and rising embers.' },
  { key: 'midnight-chrome', label: 'Chrome Glint', description: 'One slow glint crosses the Midnight Chrome avatar ring every few seconds.' },
];

/** Signature Profile Card surfaces. Each is its own authored tile in public/profile-frames/. */
export const PROFILE_SURFACES: CosmeticOptionDto[] = [
  { key: 'brushed', label: 'Brushed', description: 'Charcoal with a fine horizontal grain.' },
  { key: 'carbon', label: 'Carbon', description: 'A tight charcoal twill weave.' },
  { key: 'engine-turned', label: 'Engine-turned', description: 'Overlapping machined swirls, low contrast.' },
];

function profileSurface(value: string | null | undefined): ProfileSurface | null {
  return PROFILE_SURFACES.some((option) => option.key === value) ? value as ProfileSurface : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function uniqueKeys(keys: string[]): string[] {
  return [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
}

function profileEffectsForFrames(frames: CosmeticOptionDto[]): CosmeticOptionDto[] {
  const earnedFrames = new Set(frames.map((frame) => frame.key));
  const frameByEffect: Record<string, string> = {
    'chrome-serpent': 'chrome-serpent-frame',
    'phantom-convoy': 'phantom-convoy-frame',
    'lantern-district': 'lantern-district-frame',
    'siren-breaker': 'siren-breaker-frame',
    'block-sovereign': 'block-sovereign-frame',
    'gilded-house': 'gilded-house-frame',
    'dead-or-alive': 'dead-or-alive-frame',
    'laurel-ascendant': 'laurel-ascendant-frame',
    snowstorm: 'snowstorm-drake',
    inferno: 'inferno-drake',
    'midnight-chrome': SIGNATURE_CARD_FRAME_KEY,
  };
  return PROFILE_EFFECTS.filter((effect) => effect.key === 'none'
    || (frameByEffect[effect.key] !== undefined && earnedFrames.has(frameByEffect[effect.key]!)));
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

function catalogCosmeticOptionsForRuleset(ruleset: Ruleset, kind: 'PROFILE_FRAME' | 'SITE_THEME'): CosmeticOptionDto[] {
  return Object.values(ruleset.cosmetics ?? {})
    .filter((cosmetic) => cosmetic.kind === kind)
    .map(optionFromCosmetic);
}

function catalogCosmeticOptions(kind: 'PROFILE_FRAME' | 'SITE_THEME'): CosmeticOptionDto[] {
  const options: CosmeticOptionDto[] = [];
  const known = new Set<string>();
  for (const cosmetic of [...Object.values(SUPPORTER_COSMETICS), ...Object.values(ROUND_ROLL_CALL_FINALE_COSMETICS)]) {
    if (cosmetic.kind !== kind) continue;
    const option = optionFromCosmetic(cosmetic);
    if (!known.has(option.key)) {
      options.push(option);
      known.add(option.key);
    }
  }
  for (const ruleset of Object.values(rulesets)) {
    for (const option of catalogCosmeticOptionsForRuleset(ruleset, kind)) {
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
  ownedCollections: ReadonlySet<string>,
  bannerOptions: CollectionOptionDto[],
  avatarUnlocks: ReadonlySet<string>,
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
  const savedAvatarFrameKey = profile?.activeAvatarFrameKey ?? null;
  const activeAvatarFrameKey = savedAvatarFrameKey && frameKeys.has(savedAvatarFrameKey)
    ? savedAvatarFrameKey
    : activeProfileFrameKey;
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
    && profileEffectsForFrames(frameOptions).some((option) => option.key === profile?.profileEffect)
    ? profile!.profileEffect as ProfileEffect
    : 'none';
  return {
    activeTitleKey,
    titlePlacement: profile?.titlePlacement === 'suffix' ? 'suffix' : 'prefix',
    crewName: profile?.crewName ?? null,
    streetSign: streetSignForCrewName(profile?.streetSign, profile?.crewName),
    profileBio: profile?.profileBio ?? null,
    profileImageUrl: profile?.profileImageUrl ?? null,
    profileAvatar: readAvatarParts(profile?.profileAvatar, avatarUnlocks),
    profileBannerUrl: profile?.profileBannerUrl ?? null,
    activeCrewBannerKey: profile?.activeCrewBannerKey && bannerOptions.some((option) => option.key === profile.activeCrewBannerKey && !option.locked)
      ? profile.activeCrewBannerKey
      : null,
    profileEffect,
    activeProfileFrameKey,
    activeAvatarFrameKey,
    profileSurface: frameKeys.has(SIGNATURE_CARD_FRAME_KEY) ? profileSurface(profile?.profileSurface) : null,
    activeSiteThemeKey,
    itemCosmetics: itemCosmeticLoadout(profile?.itemCosmetics, ownedCollections),
    crewCosmetics: crewCosmeticLoadout(profile?.crewCosmetics, ownedCollections),
    showThemeOnProfile: profile?.showThemeOnProfile ?? true,
    showLookOnProfile: profile?.showLookOnProfile ?? true,
    forumCosmeticsVisible: profile?.forumCosmeticsVisible ?? false,
    showCrewMoments: profile?.showCrewMoments ?? false,
    showCrewCelebrations: profile?.showCrewCelebrations ?? false,
    showBirthdayCake: profile?.showBirthdayCake ?? false,
    featuredBadgeKeys,
    profileAccent,
    uiDensity,
    reducedMotion: profile?.reducedMotion ?? false,
    moneyFormat,
    defaultLanding,
    showProfanity: profile?.showProfanity ?? false,
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
  /** Item art collection keys this account has earned (Classic is implicit). */
  collections: Set<string>;
  crewBanners: CollectionOptionDto[];
  /** Unlock keys of the avatar wearables this account may wear. */
  avatarUnlocks: Set<string>;
  streetSignFontPackKeys: Set<string>;
}> {
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { isAdmin: true, experiencePoints: true } });
  const earnedFontPacks = STREET_SIGN_FONT_PACKS.filter((pack) => pack.level <= experienceLevelFor(account?.experiencePoints ?? 0));
  if (earnedFontPacks.length) {
    await prisma.accountCosmeticUnlock.createMany({
      data: earnedFontPacks.map((pack) => ({
        accountId,
        key: pack.key,
        kind: 'STREET_SIGN_FONT_PACK',
        title: pack.label,
        description: pack.description,
        rarity: pack.level >= 20 ? 'rare' : 'uncommon',
        styleKey: null,
        sourceQuestKey: 'PLAYER_EXPERIENCE_SIGN_FONT_PACK',
        sourceRulesetId: 'account-progression',
        sourceRulesetVersion: '1',
        awardedAt: new Date(),
      })),
      skipDuplicates: true,
    });
  }
  const [questAccents, frames, themes, bannerUnlocks, collectionUnlocks, trialActive, birthday, avatarUnlocks, streetSignFontUnlocks] = await Promise.all([
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'ACCENT'),
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'PROFILE_FRAME'),
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'SITE_THEME'),
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'CREW_BANNER'),
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'ITEM_COLLECTION'),
    supporterTrialActive(prisma, accountId),
    birthdayLookOptions(prisma, accountId, new Date()),
    AvatarWearableService.ownedKeys(prisma, accountId),
    QuestCosmeticService.optionsForAccount(prisma, accountId, 'STREET_SIGN_FONT_PACK'),
  ]);
  const accents = [...PROFILE_ACCENTS];
  const known = new Set(accents.map((option) => option.key));
  for (const option of questAccents) {
    if (!known.has(option.key)) {
      accents.push(option);
      known.add(option.key);
    }
  }
  // The birthday frame and theme are offered on the day only (birthday.service).
  const themeOptions = [...themes, ...birthday.themes];
  const frameOptions = [...frames, ...birthday.frames];
  const knownThemes = new Set(themeOptions.map((option) => option.key));
  const knownFrames = new Set(frameOptions.map((option) => option.key));
  const collections = new Set(collectionUnlocks.map((option) => option.key));
  const bannerCatalog = Object.values(SUPPORTER_COSMETICS).filter((cosmetic) => cosmetic.kind === 'CREW_BANNER').map(optionFromCosmetic);
  const ownedBanners = new Set(bannerUnlocks.map((option) => option.key));
  const crewBanners: CollectionOptionDto[] = bannerCatalog.map((option) => ({
    ...option,
    locked: !ownedBanners.has(option.key),
    unlockHint: ownedBanners.has(option.key) ? null : 'Active paid supporter reward',
    description: ownedBanners.has(option.key) ? option.description : `${option.description} Unlock through paid supporter rewards.`,
  }));
  if (trialActive) {
    for (const cosmetic of TRIAL_SUPPORTER_COSMETICS) {
      const option = optionFromCosmetic(cosmetic);
      if (cosmetic.kind === 'ACCENT' && !known.has(option.key)) {
        accents.push(option);
        known.add(option.key);
      } else if (cosmetic.kind === 'PROFILE_FRAME' && !knownFrames.has(option.key)) {
        frameOptions.push(option);
        knownFrames.add(option.key);
      } else if (cosmetic.kind === 'ITEM_COLLECTION' && cosmetic.styleKey) {
        collections.add(cosmetic.styleKey);
      }
    }
  }
  const unlockCatalogCosmetics = env.appEnvironment === 'development' || (account?.isAdmin && env.seasonalEvents.adminTestMode);
  if (unlockCatalogCosmetics) {
    for (const option of catalogCosmeticOptions('PROFILE_FRAME')) {
      if (!knownFrames.has(option.key)) {
        frameOptions.push(option);
        knownFrames.add(option.key);
      }
    }
    for (const option of catalogCosmeticOptions('SITE_THEME')) {
      if (!knownThemes.has(option.key)) {
        themeOptions.push(option);
        knownThemes.add(option.key);
      }
    }
    for (const key of AVATAR_LOCKED_OPTIONS.keys()) avatarUnlocks.add(key);
  }
  if (account?.isAdmin && env.seasonalEvents.adminTestMode) {
    for (const style of RELEASED_ITEM_COSMETIC_STYLES) collections.add(style.key);
  }
  return { accents, frames: withThemeCompanionFrames(frameOptions, themeOptions), themes: themeOptions, collections, crewBanners, avatarUnlocks, streetSignFontPackKeys: new Set(streetSignFontUnlocks.map((option) => option.key)) };
}

export const AccountProfileService = {
  async settings(prisma: PrismaClient, accountId: string): Promise<AccountProfileSettingsResponseDto> {
    const [profile, awards, appearance, ruleset, supporterSince] = await Promise.all([
      readProfile(prisma, accountId),
      earnedAwards(prisma, accountId),
      appearanceOptions(prisma, accountId),
      currentRuleset(prisma),
      SupporterService.since(prisma, accountId),
    ]);
    const hints = collectionUnlockHints(ruleset);
    const titleOptions = [...honorificTitles, ...awards.map(titleOptionFromAward)];
    const badgeOptions = awards.map(optionFromAward);
    const earnedBadgeKeys = new Set(badgeOptions.map((option) => option.key));
    const earnedTitleKeys = new Set([...earnedBadgeKeys, ...honorificTitleKeys]);

    return {
      settings: toSettingsDto(profile, earnedBadgeKeys, earnedTitleKeys, appearance.accents, appearance.frames, appearance.themes, appearance.collections, appearance.crewBanners, appearance.avatarUnlocks),
      convenience: convenienceLimits(supporterSince !== null),
      options: {
        titles: titleOptions,
        badges: badgeOptions,
        accents: appearance.accents,
        frames: appearance.frames,
        themes: appearance.themes,
        effects: profileEffectsForFrames(appearance.frames),
        surfaces: appearance.frames.some((frame) => frame.key === SIGNATURE_CARD_FRAME_KEY) ? PROFILE_SURFACES : [],
        itemStyles: collectionOptions(RELEASED_ITEM_COSMETIC_STYLES, appearance.collections, hints),
        crewStyles: collectionOptions(RELEASED_CREW_COSMETIC_STYLES, appearance.collections, hints),
         crewBanners: appearance.crewBanners,
        avatarUnlocks: [...appearance.avatarUnlocks].sort(),
        streetSignFontPacks: [...appearance.streetSignFontPackKeys].sort(),
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
    const [awards, appearance, savedProfile] = await Promise.all([
      earnedAwards(prisma, accountId),
      appearanceOptions(prisma, accountId),
      prisma.accountProfile.findUnique({ where: { accountId }, select: { crewName: true } }),
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
    const activeProfileFrameKey = null;
    const requestedAvatarFrameKey = input.activeAvatarFrameKey ?? null;
    const activeAvatarFrameKey = requestedAvatarFrameKey && frameKeys.has(requestedAvatarFrameKey)
      ? requestedAvatarFrameKey
      : null;
    if (requestedAvatarFrameKey && !activeAvatarFrameKey) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick an avatar frame you have already earned.', {
        activeAvatarFrameKey: 'That avatar frame is not unlocked.',
      });
    }
    if (input.profileSurface && !frameKeys.has(SIGNATURE_CARD_FRAME_KEY)) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'The surface finish comes with the Signature Profile Card.', {
        profileSurface: 'That surface is not unlocked.',
      });
    }
    const effectOptions = profileEffectsForFrames(appearance.frames);
    if (input.profileEffect && !effectOptions.some((option) => option.key === input.profileEffect)) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Unlock the matching animated frame before equipping its popup animation.', {
        profileEffect: 'That popup animation is not unlocked.',
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
    const activeCrewBannerKey = input.activeCrewBannerKey ?? null;
    if (activeCrewBannerKey && !appearance.crewBanners.some((option) => option.key === activeCrewBannerKey && !option.locked)) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick a crew banner you have already unlocked.', { activeCrewBannerKey: 'That crew banner is not unlocked.' });
    }
    const accentKeys = new Set(appearance.accents.map((option) => option.key));
    if (!accentKeys.has(input.profileAccent)) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick an accent you have already unlocked.', {
        profileAccent: 'That profile accent is not unlocked.',
      });
    }
    if (Object.values(input.itemCosmetics ?? {}).some((style) => !isOwnedCollection(style, appearance.collections))) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick a collection you have already unlocked.', {
        itemCosmetics: 'That collection is not unlocked.',
      });
    }
    if (Object.values(input.crewCosmetics ?? {}).some((style) => !isOwnedCollection(style, appearance.collections))) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Pick an outfit collection you have already unlocked.', {
        crewCosmetics: 'That outfit collection is not unlocked.',
      });
    }
    if (input.profileAvatar && lockedAvatarParts(input.profileAvatar, appearance.avatarUnlocks).length) {
      throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Your avatar is wearing a piece you have not unlocked yet.', {
        profileAvatar: 'One or more avatar pieces are not unlocked.',
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
    const effectiveCrewName = crewName === undefined ? savedProfile?.crewName ?? null : crewName;
    const streetSign = input.streetSign === undefined
      ? undefined
      : input.streetSign === null
        ? null
        : effectiveCrewName
          ? { ...input.streetSign, streetName: effectiveCrewName }
          : input.streetSign;
    if (streetSign && !effectiveCrewName) {
      throw AppError.badRequest('CREW_NAME_REQUIRED', 'Set a crew name before saving a street sign.', {
        streetSign: 'Street sign lettering is linked to your crew name.',
      });
    }
    if (streetSign) {
      assertCommunicationContent('Street sign', `${streetSign.streetName} ${streetSign.tag}`);
      const requestedFonts = [
        { font: streetSign.font, slot: 'streetText' as const },
        { font: streetSign.tagFont, slot: 'graffiti' as const },
      ];
      for (const { font, slot } of requestedFonts) {
        const pack = STREET_SIGN_FONT_PACKS.find((candidate) => (candidate.fonts as readonly string[]).includes(font));
        if (pack && (!pack[slot] || !appearance.streetSignFontPackKeys.has(pack.key))) {
          throw AppError.badRequest('COSMETIC_NOT_EARNED', 'Earn that street sign font pack before using it.', {
            streetSign: `${pack.label} unlocks at account level ${pack.level}.`,
          });
        }
      }
    }
    const profileBio = input.profileBio === undefined ? undefined : input.profileBio;
    const profileImageUrl = input.profileImageUrl === undefined ? undefined : input.profileImageUrl;
    const profileAvatar = input.profileAvatar === undefined
      ? undefined
      : input.profileAvatar ?? Prisma.DbNull;
    const profileBannerUrl = input.profileBannerUrl === undefined ? undefined : input.profileBannerUrl;
    const profileEffect = input.profileEffect === undefined ? undefined : input.profileEffect;
    const surface = input.profileSurface === undefined ? undefined : input.profileSurface;

    await prisma.accountProfile.upsert({
      where: { accountId },
      create: {
        accountId,
        activeTitleKey,
        titlePlacement: input.titlePlacement,
        crewName: crewName ?? null,
        ...(streetSign !== undefined ? { streetSign: streetSign ?? Prisma.DbNull } : {}),
        profileBio: profileBio ?? null,
        profileImageUrl: profileImageUrl ?? null,
        ...(profileAvatar !== undefined ? { profileAvatar } : {}),
        profileBannerUrl: profileBannerUrl ?? null,
        activeCrewBannerKey,
        profileEffect: profileEffect ?? 'none',
        profileSurface: surface ?? null,
        activeProfileFrameKey,
        activeAvatarFrameKey,
        activeSiteThemeKey,
        itemCosmetics: input.itemCosmetics ?? {},
        crewCosmetics: { ...(input.crewCosmetics ?? DEFAULT_CREW_COSMETICS) },
        showThemeOnProfile: input.showThemeOnProfile ?? true,
        showLookOnProfile: input.showLookOnProfile ?? true,
        forumCosmeticsVisible: input.forumCosmeticsVisible ?? false,
        showCrewMoments: input.showCrewMoments ?? false,
        showCrewCelebrations: input.showCrewCelebrations ?? false,
        showBirthdayCake: input.showBirthdayCake ?? false,
        featuredBadgeKeys,
        profileAccent: input.profileAccent,
        uiDensity: input.uiDensity,
        reducedMotion: input.reducedMotion,
        moneyFormat: input.moneyFormat,
        defaultLanding: input.defaultLanding,
        showProfanity: input.showProfanity,
      },
      update: {
        activeTitleKey,
        titlePlacement: input.titlePlacement,
        ...(crewName !== undefined ? { crewName } : {}),
        ...(streetSign !== undefined ? { streetSign: streetSign ?? Prisma.DbNull } : {}),
        ...(profileBio !== undefined ? { profileBio } : {}),
        ...(profileImageUrl !== undefined ? { profileImageUrl } : {}),
        ...(profileAvatar !== undefined ? { profileAvatar } : {}),
        ...(profileBannerUrl !== undefined ? { profileBannerUrl } : {}),
        activeCrewBannerKey,
        ...(profileEffect !== undefined ? { profileEffect } : {}),
        ...(surface !== undefined ? { profileSurface: surface } : {}),
        activeProfileFrameKey,
        activeAvatarFrameKey,
        activeSiteThemeKey,
        itemCosmetics: input.itemCosmetics ?? {},
        crewCosmetics: { ...(input.crewCosmetics ?? DEFAULT_CREW_COSMETICS) },
        showThemeOnProfile: input.showThemeOnProfile ?? true,
        showLookOnProfile: input.showLookOnProfile ?? true,
        forumCosmeticsVisible: input.forumCosmeticsVisible ?? false,
        showCrewMoments: input.showCrewMoments,
        showCrewCelebrations: input.showCrewCelebrations,
        showBirthdayCake: input.showBirthdayCake,
        featuredBadgeKeys,
        profileAccent: input.profileAccent,
        uiDensity: input.uiDensity,
        reducedMotion: input.reducedMotion,
        moneyFormat: input.moneyFormat,
        defaultLanding: input.defaultLanding,
        showProfanity: input.showProfanity,
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
    const settings = toSettingsDto(profile, earnedBadgeKeys, earnedTitleKeys, appearance.accents, appearance.frames, appearance.themes, appearance.collections, appearance.crewBanners, appearance.avatarUnlocks);
    const titleAward = unlocked.find((award) => award.key === settings.activeTitleKey);
    const title = settings.activeTitleKey && honorificTitleKeys.includes(settings.activeTitleKey)
      ? profileTitleForAward({ key: settings.activeTitleKey, title: settings.activeTitleKey })
      : titleAward ? profileTitleForAward(titleAward) : null;
    return { settings, title, titlePlacement: settings.titlePlacement };
  },
};
