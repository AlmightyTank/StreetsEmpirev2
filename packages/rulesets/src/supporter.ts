import type { QuestCosmeticCatalog, QuestCosmeticDefinition } from './types.js';

/**
 * Supporter rewards. Account-level and permanent: once granted they are never
 * taken back, and they never touch stats, prices, ranking or combat (roadmap
 * 1.9, "never sell"). They live outside any round ruleset because supporting
 * is not tied to a season.
 */
export const SUPPORTER_SOURCE = 'supporter';
export const SUPPORTER_SOURCE_VERSION = '1';

export const SUPPORTER_COSMETICS = {
  'supporter-midnight-chrome': {
    key: 'supporter-midnight-chrome',
    name: 'Midnight Chrome Collection',
    description: 'Deep graphite, brushed chrome and a narrow crimson accent for the Thug, the Hoe, the Sedan, the Van and the Low-Rider.',
    kind: 'ITEM_COLLECTION',
    rarity: 'legendary',
    styleKey: 'midnight-chrome',
  },
  'midnight-chrome-frame': {
    key: 'midnight-chrome-frame',
    name: 'Midnight Chrome Signature Card',
    description: 'A brushed-chrome profile card with a crimson pinstripe, a choice of surface finish and the supporter mark.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'midnight-chrome-frame',
  },
} as const satisfies QuestCosmeticCatalog;

export type SupporterCosmeticKey = keyof typeof SUPPORTER_COSMETICS;

/** Where monthly drops are recorded as coming from, beside SUPPORTER_SOURCE. */
export const SUPPORTER_DROP_SOURCE = 'supporter-drop';

/**
 * Monthly supporter drops, keyed by UTC month (YYYY-MM). Anyone supporting
 * during a month gets that month's drop: active subscribers when the month
 * starts, and anyone whose payment lands during it. Kept for good like every
 * supporter reward; a month that has passed is not given out later. Each is a
 * title and profile badge, so it needs no art. Add next months here before
 * they start.
 */
export const SUPPORTER_MONTHLY_DROPS = {
  '2026-10': {
    key: 'supporter-drop-2026-10',
    name: 'Supporter · October 2026',
    description: 'Supported StreetsEmpire in October 2026. Thank you.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  '2026-11': {
    key: 'supporter-drop-2026-11',
    name: 'Supporter · November 2026',
    description: 'Supported StreetsEmpire in November 2026. Thank you.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  '2026-12': {
    key: 'supporter-drop-2026-12',
    name: 'Supporter · December 2026',
    description: 'Supported StreetsEmpire in December 2026. Thank you.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  '2027-01': {
    key: 'supporter-drop-2027-01',
    name: 'Supporter · January 2027',
    description: 'Supported StreetsEmpire in January 2027. Thank you.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  '2027-02': {
    key: 'supporter-drop-2027-02',
    name: 'Supporter · February 2027',
    description: 'Supported StreetsEmpire in February 2027. Thank you.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  '2027-03': {
    key: 'supporter-drop-2027-03',
    name: 'Supporter · March 2027',
    description: 'Supported StreetsEmpire in March 2027. Thank you.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
} as const satisfies Readonly<Record<string, QuestCosmeticDefinition>>;

/** The UTC month a moment falls in, as YYYY-MM. */
export function supporterMonth(at: Date): string {
  return at.toISOString().slice(0, 7);
}

/** That month's drop, if one is set. */
export function supporterDropFor(month: string): QuestCosmeticDefinition | undefined {
  return (SUPPORTER_MONTHLY_DROPS as Readonly<Record<string, QuestCosmeticDefinition>>)[month];
}
