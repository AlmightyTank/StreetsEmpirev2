import type { AccountProfile, PrismaClient } from '@prisma/client';
import {
  CUSTOMIZABLE_ITEM_KEYS,
  DEFAULT_CREW_COSMETICS,
  isOwnedCollection,
  isReleasedItemCosmeticStyle,
} from '@streets/shared';
import type { CrewCosmeticLoadout, CrewCosmeticStyleKey, ItemCosmeticLoadout, ProfileLookDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { QuestCosmeticService } from './quest-cosmetic.service.js';

/**
 * Cosmetic loadouts as an account can actually wear them (Slice D), and what a
 * visitor sees of them on the owner's public profile (Slice E). Shared by the
 * settings service and the community profile, which import each other's
 * neighbours, so it lives on its own.
 */

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

/** Saved item skins the account can still wear; anything else reads as Classic. */
export function itemCosmeticLoadout(value: unknown, owned: ReadonlySet<string>): ItemCosmeticLoadout {
  const raw = stringRecord(value);
  const loadout: ItemCosmeticLoadout = {};
  for (const key of CUSTOMIZABLE_ITEM_KEYS) {
    const style = raw[key];
    if (style && isReleasedItemCosmeticStyle(style) && isOwnedCollection(style, owned)) loadout[key] = style;
  }
  return loadout;
}

export function crewCosmeticLoadout(value: unknown, owned: ReadonlySet<string>): CrewCosmeticLoadout {
  const raw = stringRecord(value);
  const style = (key: keyof CrewCosmeticLoadout): CrewCosmeticStyleKey => {
    const candidate = raw[key];
    return candidate && isReleasedItemCosmeticStyle(candidate) && isOwnedCollection(candidate, owned)
      ? candidate
      : DEFAULT_CREW_COSMETICS[key];
  };
  return { THUG: style('THUG'), HOE: style('HOE') };
}

/**
 * Slice E: the owner's site theme and item/crew look, as a visitor sees them.
 * Each respects the owner's profile toggle and only shows what the account has
 * earned, so a stale or admin-QA selection never leaks onto a public page.
 */
export async function profileShowcase(
  db: Db | PrismaClient,
  accountId: string,
  profile: AccountProfile | null,
): Promise<{ siteTheme: string | null; siteThemeLabel: string | null; look: ProfileLookDto | null }> {
  const showTheme = profile?.showThemeOnProfile ?? true;
  const showLook = profile?.showLookOnProfile ?? true;
  const [themes, collections] = await Promise.all([
    showTheme && profile?.activeSiteThemeKey ? QuestCosmeticService.optionsForAccount(db, accountId, 'SITE_THEME') : [],
    showLook
      ? db.accountCosmeticUnlock.findMany({
        where: { accountId, kind: 'ITEM_COLLECTION' },
        orderBy: [{ awardedAt: 'asc' }, { key: 'asc' }],
      })
      : [],
  ]);
  const theme = themes.find((option) => option.key === profile?.activeSiteThemeKey) ?? null;
  const siteTheme = theme?.key ?? null;
  const siteThemeLabel = theme?.label ?? null;
  if (!showLook) return { siteTheme, siteThemeLabel, look: null };
  const owned = new Set(collections.map((row) => row.styleKey ?? row.key));
  return {
    siteTheme,
    siteThemeLabel,
    look: {
      items: itemCosmeticLoadout(profile?.itemCosmetics, owned),
      crew: crewCosmeticLoadout(profile?.crewCosmetics, owned),
      collections: collections.map((row) => ({ key: row.key, title: row.title, rarity: row.rarity })),
    },
  };
}

export interface ProfileThemeTag {
  siteTheme: string;
  siteThemeLabel: string;
}

/**
 * Slice F: the site theme each account shares, for lists that show many
 * players at once (rankings, the player directory). Two queries however long
 * the list. Only themes the owner shows on their profile and has earned get a
 * tag; anyone else is simply missing from the map.
 */
export async function profileThemeTags(
  db: Db | PrismaClient,
  accountIds: readonly string[],
): Promise<Map<string, ProfileThemeTag>> {
  const ids = [...new Set(accountIds)];
  const tags = new Map<string, ProfileThemeTag>();
  if (!ids.length) return tags;
  const profiles = await db.accountProfile.findMany({
    where: { accountId: { in: ids }, activeSiteThemeKey: { not: null }, showThemeOnProfile: true },
    select: { accountId: true, activeSiteThemeKey: true },
  });
  if (!profiles.length) return tags;
  const unlocks = await db.accountCosmeticUnlock.findMany({
    where: { accountId: { in: profiles.map((profile) => profile.accountId) }, kind: 'SITE_THEME' },
    select: { accountId: true, key: true, styleKey: true, title: true },
  });
  for (const profile of profiles) {
    const unlock = unlocks.find((row) => row.accountId === profile.accountId && (row.styleKey ?? row.key) === profile.activeSiteThemeKey);
    if (unlock && profile.activeSiteThemeKey) {
      tags.set(profile.accountId, { siteTheme: profile.activeSiteThemeKey, siteThemeLabel: unlock.title });
    }
  }
  return tags;
}

/** The DTO fields for a list row: the owner's theme tag, or nulls. */
export function themeTagFields(tag: ProfileThemeTag | undefined): { siteTheme: string | null; siteThemeLabel: string | null } {
  return { siteTheme: tag?.siteTheme ?? null, siteThemeLabel: tag?.siteThemeLabel ?? null };
}
