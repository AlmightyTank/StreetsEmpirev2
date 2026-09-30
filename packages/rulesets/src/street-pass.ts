import type {
  QuestCosmeticCatalog,
  QuestRewardDefinition,
  Ruleset,
  StreetPassRules,
} from './types.js';

/**
 * Player columns an `ITEM` reward may add to. Guns are the gun itself, never
 * buying access: that stays behind the Jobs that unlock it.
 */
export const ITEM_REWARD_FIELDS = [
  'condoms',
  'medicine',
  'crack',
  'beer',
  'pistols',
  'shotguns',
  'tek9s',
  'ak47s',
  'lowRiders',
  'thugs',
  'whores',
] as const;

export type ItemRewardField = (typeof ITEM_REWARD_FIELDS)[number];

export function isItemRewardField(key: string | undefined): key is ItemRewardField {
  return key !== undefined && (ITEM_REWARD_FIELDS as readonly string[]).includes(key);
}

const cash = (dollars: number): QuestRewardDefinition => ({ kind: 'CASH', amount: dollars * 100 });
const turns = (amount: number): QuestRewardDefinition => ({ kind: 'TURNS', amount });
const item = (key: string, amount: number): QuestRewardDefinition => ({ kind: 'ITEM', key, amount });
const product = (key: string, amount: number): QuestRewardDefinition => ({ kind: 'PRODUCT', key, amount });
const favor = (key: string, amount = 1): QuestRewardDefinition => ({ kind: 'FAVOR_ITEM', key, amount });
const cosmetic = (key: string): QuestRewardDefinition => ({ kind: 'COSMETIC_UNLOCK', key });

/**
 * Season 1's permanent cosmetics: a title at tiers 10, 20 and 30, plus the
 * tier 30 badge and frame. A ruleset that ships this pass adds these to its
 * cosmetics. Titles carry the season so each season's set is collectible.
 */
export const STREET_PASS_S1_COSMETICS = {
  'street-pass-s1-fresh-face': {
    key: 'street-pass-s1-fresh-face',
    name: 'Fresh Face · Season 1',
    description: 'Reached tier 10 of the first Street Pass. New on the block, and already noticed.',
    kind: 'TITLE_BADGE',
    rarity: 'rare',
  },
  'street-pass-s1-made-man': {
    key: 'street-pass-s1-made-man',
    name: 'Made Man · Season 1',
    description: 'Reached tier 20 of the first Street Pass. The street knows your name.',
    kind: 'TITLE_BADGE',
    rarity: 'epic',
  },
  'street-pass-s1-kingpin': {
    key: 'street-pass-s1-kingpin',
    name: 'Kingpin · Season 1',
    description: 'Finished the first Street Pass. Nobody on the block outworked you.',
    kind: 'TITLE_BADGE',
    rarity: 'legendary',
  },
  'street-pass-s1-badge': {
    key: 'street-pass-s1-badge',
    name: 'Street Pass · Season 1',
    description: 'Finished the first Street Pass. Every tier, start to end.',
    kind: 'TITLE_BADGE',
    rarity: 'legendary',
  },
  'street-pass-s1-frame': {
    key: 'street-pass-s1-frame',
    name: 'Season 1 Frame',
    description: 'The profile frame for finishing the first Street Pass.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'street-pass-s1-frame',
  },
} as const satisfies QuestCosmeticCatalog;

/**
 * Season 1, as agreed in docs/STREET-PASS.md. Amounts are the starting point
 * for balance testing.
 */
export const STREET_PASS_S1 = {
  key: 'street-pass-s1',
  name: 'Street Pass · Season 1',
  credPerTier: [
    { fromTier: 1, toTier: 10, cred: 600 },
    { fromTier: 11, toTier: 20, cred: 900 },
    { fromTier: 21, toTier: 30, cred: 1200 },
  ],
  sources: {
    dailyContract: 150,
    weeklyContract: 750,
    perTurnSpent: 1,
    dailyTurnCap: 400,
    oneTimeJob: 200,
    eventContract: 300,
  },
  lateJoin: { bonusPercentPerWeek: 15, maxBonusPercent: 45 },
  tiers: [
    { tier: 1, rewards: [cash(10_000)] },
    { tier: 2, rewards: [item('condoms', 1000)] },
    { tier: 3, rewards: [item('whores', 3)] },
    { tier: 4, rewards: [turns(25)] },
    { tier: 5, rewards: [item('pistols', 25), item('thugs', 5)] },
    { tier: 6, rewards: [item('beer', 500)] },
    { tier: 7, rewards: [item('medicine', 50)] },
    { tier: 8, rewards: [cash(25_000)] },
    { tier: 9, rewards: [product('WEED', 250)] },
    { tier: 10, rewards: [item('shotguns', 3), item('whores', 5), cosmetic('street-pass-s1-fresh-face')] },
    { tier: 11, rewards: [turns(40)] },
    { tier: 12, rewards: [favor('STREET_FRENZY')] },
    { tier: 13, rewards: [item('thugs', 10)] },
    { tier: 14, rewards: [product('ECSTASY', 150)] },
    { tier: 15, rewards: [cash(50_000), favor('TOMMY_VOUCHER')] },
    { tier: 16, rewards: [item('whores', 8)] },
    { tier: 17, rewards: [favor('COOKHOUSE_RUSH')] },
    { tier: 18, rewards: [product('METH', 200)] },
    { tier: 19, rewards: [turns(60)] },
    { tier: 20, rewards: [item('tek9s', 2), item('lowRiders', 1), cosmetic('street-pass-s1-made-man')] },
    { tier: 21, rewards: [cash(75_000)] },
    { tier: 22, rewards: [product('COCAINE', 150)] },
    { tier: 23, rewards: [favor('BURNER_PHONE', 2)] },
    { tier: 24, rewards: [item('thugs', 15)] },
    { tier: 25, rewards: [item('whores', 12), favor('DOCTOR_FAVOR')] },
    { tier: 26, rewards: [turns(100)] },
    { tier: 27, rewards: [product('HEROIN', 200)] },
    { tier: 28, rewards: [cash(100_000)] },
    { tier: 29, rewards: [item('ak47s', 2), item('lowRiders', 1)] },
    { tier: 30, rewards: [cosmetic('street-pass-s1-kingpin'), cosmetic('street-pass-s1-badge'), cosmetic('street-pass-s1-frame')] },
  ],
} as const satisfies StreetPassRules;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Cred needed to go from `tier - 1` to `tier`. */
export function streetPassTierCost(rules: StreetPassRules, tier: number): number {
  const range = rules.credPerTier.find((cost) => tier >= cost.fromTier && tier <= cost.toTier);
  if (!range) throw new Error(`${rules.key}: no Cred cost for tier ${tier}`);
  return range.cred;
}

/** Total Cred needed to reach `tier` (0 for tier 0). */
export function streetPassCredToReach(rules: StreetPassRules, tier: number): number {
  let total = 0;
  for (let t = 1; t <= Math.min(tier, rules.tiers.length); t++) total += streetPassTierCost(rules, t);
  return total;
}

/** The highest tier `cred` reaches, from 0 up to the last tier. */
export function streetPassTierForCred(rules: StreetPassRules, cred: number): number {
  let reached = 0;
  let total = 0;
  for (let t = 1; t <= rules.tiers.length; t++) {
    total += streetPassTierCost(rules, t);
    if (cred < total) break;
    reached = t;
  }
  return reached;
}

/**
 * Bonus Cred percent for a player who joined after the round started: a fixed
 * step for each full week already run, up to the cap.
 */
export function streetPassLateJoinBonusPercent(rules: StreetPassRules, roundStartsAt: Date, joinedAt: Date): number {
  const weeks = Math.floor((joinedAt.getTime() - roundStartsAt.getTime()) / WEEK_MS);
  if (weeks <= 0) return 0;
  return Math.min(rules.lateJoin.maxBonusPercent, weeks * rules.lateJoin.bonusPercentPerWeek);
}

/** Cred actually earned from `base`, with the late-join bonus, rounded down. */
export function streetPassCredWithBonus(base: number, bonusPercent: number): number {
  return Math.floor((base * (100 + bonusPercent)) / 100);
}

const isWhole = (value: unknown, min: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= min;

/**
 * Everything wrong with a pass for the round it ships in. An empty list means
 * every tier can be reached and every reward can be granted.
 */
export function streetPassProblems(rules: StreetPassRules, ruleset: Ruleset): string[] {
  const problems: string[] = [];
  const where = rules.key || 'street pass';
  if (!rules.key.trim()) problems.push('street pass: key is required');
  if (!rules.name.trim()) problems.push(`${where}: name is required`);
  if (!rules.tiers.length) problems.push(`${where}: needs at least one tier`);

  rules.tiers.forEach((tier, index) => {
    if (tier.tier !== index + 1) problems.push(`${where}: tier ${index + 1} is numbered ${tier.tier}`);
    if (!tier.rewards.length) problems.push(`${where}: tier ${tier.tier} has no reward`);
  });

  let expected = 1;
  for (const cost of rules.credPerTier) {
    if (cost.fromTier !== expected) problems.push(`${where}: Cred costs skip or overlap at tier ${expected}`);
    if (cost.toTier < cost.fromTier) problems.push(`${where}: Cred cost range ${cost.fromTier}-${cost.toTier} is backwards`);
    if (!isWhole(cost.cred, 1)) problems.push(`${where}: tiers ${cost.fromTier}-${cost.toTier} need a positive whole Cred cost`);
    expected = cost.toTier + 1;
  }
  if (rules.tiers.length && expected !== rules.tiers.length + 1) {
    problems.push(`${where}: Cred costs cover tiers 1-${expected - 1}, but the track has ${rules.tiers.length}`);
  }

  for (const [source, value] of Object.entries(rules.sources)) {
    if (!isWhole(value, 0)) problems.push(`${where}: Cred source ${source} must be a whole number of 0 or more`);
  }
  if (!isWhole(rules.lateJoin.bonusPercentPerWeek, 0) || !isWhole(rules.lateJoin.maxBonusPercent, 0)) {
    problems.push(`${where}: late-join bonus must be whole percents of 0 or more`);
  }

  for (const tier of rules.tiers) {
    for (const reward of tier.rewards) {
      const at = `${where} tier ${tier.tier}: ${reward.kind}${reward.key ? ` ${reward.key}` : ''}`;
      switch (reward.kind) {
        case 'CASH':
        case 'TURNS':
          if (!isWhole(reward.amount, 1)) problems.push(`${at} needs a positive whole amount`);
          break;
        case 'ITEM':
          if (!isWhole(reward.amount, 1)) problems.push(`${at} needs a positive whole amount`);
          if (!isItemRewardField(reward.key)) problems.push(`${at} is not an item a reward can give`);
          break;
        case 'PRODUCT':
          if (!isWhole(reward.amount, 1)) problems.push(`${at} needs a positive whole amount`);
          if (!reward.key || !ruleset.products || !(reward.key in ruleset.products)) problems.push(`${at} is not a product in this round`);
          break;
        case 'FAVOR_ITEM':
          if (!isWhole(reward.amount, 1)) problems.push(`${at} needs a positive whole amount`);
          if (!reward.key || !ruleset.favors?.[reward.key]) problems.push(`${at} is not a favor in this round`);
          break;
        case 'CONTACT_REP':
          if (!isWhole(reward.amount, 1)) problems.push(`${at} needs a positive whole amount`);
          if (!reward.key || !ruleset.contacts || !(reward.key in ruleset.contacts)) problems.push(`${at} is not a contact in this round`);
          break;
        case 'COSMETIC_UNLOCK':
          if (!reward.key || !ruleset.cosmetics?.[reward.key]) problems.push(`${at} is not a cosmetic in this round`);
          break;
        case 'WEAPON_ACCESS':
        case 'PERMANENT_UNLOCK':
          problems.push(`${at}: the Street Pass gives the item itself, never buying access or unlocks`);
          break;
      }
    }
  }
  return problems;
}
