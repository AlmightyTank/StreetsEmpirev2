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
  'supporter-banner-accent': {
    key: 'supporter-banner-accent',
    name: 'Supporter Banner Accent',
    description: 'A midnight-crimson banner glow for profile headers and hover cards. Cosmetic only.',
    kind: 'ACCENT',
    rarity: 'epic',
    styleKey: 'supporter-crimson',
  },
} as const satisfies QuestCosmeticCatalog;

export type SupporterCosmeticKey = keyof typeof SUPPORTER_COSMETICS;

/** Where monthly drops are recorded as coming from, beside SUPPORTER_SOURCE. */
export const SUPPORTER_DROP_SOURCE = 'supporter-drop';

/** Where tenure badges are recorded as coming from, beside SUPPORTER_SOURCE. */
export const SUPPORTER_TENURE_SOURCE = 'supporter-tenure';

/**
 * Monthly supporter drops, keyed by UTC month (YYYY-MM). Anyone supporting
 * during a month gets that month's bundle: active subscribers when the month
 * starts, and anyone whose payment lands during it. Kept for good like every
 * supporter reward; a month that has passed is not given out later. Each
 * bundle holds 1-3 items (titles/badges first, so no art is needed). Add next
 * months here before they start.
 */
export const SUPPORTER_MONTHLY_DROPS = {
  '2026-10': [
    {
      key: 'supporter-drop-2026-10',
      name: 'Supporter · October 2026',
      description: 'Supported StreetsEmpire in October 2026. Thank you.',
      kind: 'TITLE_BADGE',
      rarity: 'epic',
    },
  ],
  '2026-11': [
    {
      key: 'supporter-drop-2026-11',
      name: 'Supporter · November 2026',
      description: 'Supported StreetsEmpire in November 2026. Thank you.',
      kind: 'TITLE_BADGE',
      rarity: 'epic',
    },
  ],
  '2026-12': [
    {
      key: 'supporter-drop-2026-12',
      name: 'Supporter · December 2026',
      description: 'Supported StreetsEmpire in December 2026. Thank you.',
      kind: 'TITLE_BADGE',
      rarity: 'epic',
    },
  ],
  '2027-01': [
    {
      key: 'supporter-drop-2027-01',
      name: 'Supporter · January 2027',
      description: 'Supported StreetsEmpire in January 2027. Thank you.',
      kind: 'TITLE_BADGE',
      rarity: 'epic',
    },
  ],
  '2027-02': [
    {
      key: 'supporter-drop-2027-02',
      name: 'Supporter · February 2027',
      description: 'Supported StreetsEmpire in February 2027. Thank you.',
      kind: 'TITLE_BADGE',
      rarity: 'epic',
    },
  ],
  '2027-03': [
    {
      key: 'supporter-drop-2027-03',
      name: 'Supporter · March 2027',
      description: 'Supported StreetsEmpire in March 2027. Thank you.',
      kind: 'TITLE_BADGE',
      rarity: 'epic',
    },
    {
      key: 'supporter-drop-2027-03-backer',
      name: 'Backer · March 2027',
      description: 'Stood with the empire in March 2027. Wear it as a profile badge.',
      kind: 'TITLE_BADGE',
      rarity: 'legendary',
    },
  ],
} as const satisfies Readonly<Record<string, readonly QuestCosmeticDefinition[]>>;

/** The most unlocks one monthly bundle holds. */
export const SUPPORTER_BUNDLE_MAX = 3;

/** A tenure tier: cumulative paid months needed for its badge. */
export interface SupporterTenureTier {
  months: number;
  badge: QuestCosmeticDefinition;
}

/**
 * Tenure track. Badges unlock on *cumulative* paid months (distinct YYYY-MM
 * with a paid invoice above 0) on one unchanged price, so cancelled months
 * never reset the count. Permanent TITLE_BADGE unlocks like every supporter
 * reward; add higher tiers here later without touching grant logic.
 */
export const SUPPORTER_TENURE: readonly SupporterTenureTier[] = [
  {
    months: 3,
    badge: {
      key: 'supporter-tenure-3',
      name: 'Steadfast · 3 Months',
      description: 'Three months of backing the empire. Thank you for staying.',
      kind: 'TITLE_BADGE',
      rarity: 'epic',
    },
  },
  {
    months: 6,
    badge: {
      key: 'supporter-tenure-6',
      name: 'Cornerstone · 6 Months',
      description: 'Six months of backing the empire. The block stands on you.',
      kind: 'TITLE_BADGE',
      rarity: 'epic',
    },
  },
  {
    months: 12,
    badge: {
      key: 'supporter-tenure-12',
      name: 'Empire Pillar · 12 Months',
      description: 'A full year of backing the empire. A pillar of the streets.',
      kind: 'TITLE_BADGE',
      rarity: 'legendary',
    },
  },
];

/** Tenure badges earned at a cumulative paid-month count, lowest tier first. */
export function tenureTiersFor(paidMonths: number): QuestCosmeticDefinition[] {
  return SUPPORTER_TENURE.filter((tier) => paidMonths >= tier.months).map((tier) => tier.badge);
}

/** The UTC month a moment falls in, as YYYY-MM. */
export function supporterMonth(at: Date): string {
  return at.toISOString().slice(0, 7);
}

/** That month's drop bundle (1-3 unlocks), if one is set. */
export function supporterDropFor(month: string): readonly QuestCosmeticDefinition[] | undefined {
  return (SUPPORTER_MONTHLY_DROPS as Readonly<Record<string, readonly QuestCosmeticDefinition[]>>)[month];
}
