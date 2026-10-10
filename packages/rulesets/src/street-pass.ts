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
 * tier 30 badge and frame, an Ice Dragon shell and Snowstorm frame at tier 15,
 * a Fire Dragon shell and Inferno frame at tier 25, and the three
 * item art collections at tiers 8, 18 and 28. Eight reimagined theme packs
 * spread across cosmetic tiers pair a site shell with its popup/avatar frame.
 * A ruleset that ships this pass adds these to its cosmetics. Titles carry the
 * season so each season's set is collectible.
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
  'street-pass-s1-chrome-serpent-theme': {
    key: 'street-pass-s1-chrome-serpent-theme', name: 'Chrome Serpent · Season 1',
    description: 'A brushed-steel garage shell with animated route lines and teal scale light.',
    kind: 'SITE_THEME', rarity: 'epic', styleKey: 'motor-city-iron',
  },
  'street-pass-s1-chrome-serpent-frame': {
    key: 'street-pass-s1-chrome-serpent-frame', name: 'Chrome Serpent Frame · Season 1',
    description: 'A chrome serpent frame with moving scale highlights for the popup and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'chrome-serpent-frame',
  },
  'street-pass-s1-phantom-convoy-theme': {
    key: 'street-pass-s1-phantom-convoy-theme', name: 'Phantom Convoy · Season 1',
    description: 'A rain-slick interstate shell with distant city light and headlight reflections.',
    kind: 'SITE_THEME', rarity: 'epic', styleKey: 'open-road',
  },
  'street-pass-s1-phantom-convoy-frame': {
    key: 'street-pass-s1-phantom-convoy-frame', name: 'Phantom Convoy Frame · Season 1',
    description: 'A road-sign crest frame with sweeping headlight light for the popup and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'phantom-convoy-frame',
  },
  'street-pass-s1-lantern-district-theme': {
    key: 'street-pass-s1-lantern-district-theme', name: 'Lantern District · Season 1',
    description: 'A night-market shell with warm paper panels and animated lantern light.',
    kind: 'SITE_THEME', rarity: 'epic', styleKey: 'neon-vice',
  },
  'street-pass-s1-lantern-district-frame': {
    key: 'street-pass-s1-lantern-district-frame', name: 'Lantern District Frame · Season 1',
    description: 'A lacquered lantern frame with swaying tassels and animated light pools.',
    kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'lantern-district-frame',
  },
  'street-pass-s1-siren-breaker-theme': {
    key: 'street-pass-s1-siren-breaker-theme', name: 'Siren Breaker · Season 1',
    description: 'A rain-dark shell with evidence-board blues and distant siren reflections.',
    kind: 'SITE_THEME', rarity: 'epic', styleKey: 'blue-heat',
  },
  'street-pass-s1-siren-breaker-frame': {
    key: 'street-pass-s1-siren-breaker-frame', name: 'Siren Breaker Frame · Season 1',
    description: 'A cracked-glass signal frame with a sweeping searchlight and red-blue pulse.',
    kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'siren-breaker-frame',
  },
  'street-pass-s1-block-sovereign-theme': {
    key: 'street-pass-s1-block-sovereign-theme', name: 'Block Sovereign · Season 1',
    description: 'A wet-city shell with painted brick, a rooftop skyline and territory lines.',
    kind: 'SITE_THEME', rarity: 'epic', styleKey: 'rain-city-wire',
  },
  'street-pass-s1-block-sovereign-frame': {
    key: 'street-pass-s1-block-sovereign-frame', name: 'Block Sovereign Frame · Season 1',
    description: 'A neighborhood crest frame with pulsing claim marks for the popup and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'block-sovereign-frame',
  },
  'street-pass-s1-gilded-house-theme': {
    key: 'street-pass-s1-gilded-house-theme', name: 'Gilded House · Season 1',
    description: 'A casino shell with deep felt, brass rails and slow marquee light.',
    kind: 'SITE_THEME', rarity: 'epic', styleKey: 'casino-floor',
  },
  'street-pass-s1-gilded-house-frame': {
    key: 'street-pass-s1-gilded-house-frame', name: 'Gilded House Frame · Season 1',
    description: 'A coin-and-gem frame with an animated card fan and traveling gold glint.',
    kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'gilded-house-frame',
  },
  'street-pass-s1-dead-or-alive-theme': {
    key: 'street-pass-s1-dead-or-alive-theme', name: 'Dead-or-Alive · Season 1',
    description: 'A dusty case-office shell with pinned files and sepia paper surfaces.',
    kind: 'SITE_THEME', rarity: 'epic', styleKey: 'federal-case',
  },
  'street-pass-s1-dead-or-alive-frame': {
    key: 'street-pass-s1-dead-or-alive-frame', name: 'Dead-or-Alive Frame · Season 1',
    description: 'A weathered wanted-poster frame with fluttering paper and an animated seal.',
    kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'dead-or-alive-frame',
  },
  'street-pass-s1-laurel-ascendant-theme': {
    key: 'street-pass-s1-laurel-ascendant-theme', name: 'Laurel Ascendant · Season 1',
    description: 'A velvet championship shell with trophy brass, banners and marquee light.',
    kind: 'SITE_THEME', rarity: 'epic', styleKey: 'midnight-market',
  },
  'street-pass-s1-laurel-ascendant-frame': {
    key: 'street-pass-s1-laurel-ascendant-frame', name: 'Laurel Ascendant Frame · Season 1',
    description: 'A sculpted laurel and medal frame that unfurls around the popup and avatar.',
    kind: 'PROFILE_FRAME', rarity: 'epic', styleKey: 'laurel-ascendant-frame',
  },
  'street-pass-s1-ice-dragon-theme': {
    key: 'street-pass-s1-ice-dragon-theme',
    name: 'Ice Dragon · Season 1',
    description: 'A glacial dragon shell with frozen blue panels, drifting snow and ice-lit details.',
    kind: 'SITE_THEME',
    rarity: 'legendary',
    styleKey: 'dragon-ice',
  },
  'street-pass-s1-snowstorm-frame': {
    key: 'street-pass-s1-snowstorm-frame',
    name: 'Snowstorm Drake Frame · Season 1',
    description: 'An illustrated ice dragon curls around the popup and avatar, with animated frost and snow.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'snowstorm-drake',
  },
  'street-pass-s1-fire-dragon-theme': {
    key: 'street-pass-s1-fire-dragon-theme',
    name: 'Fire Dragon · Season 1',
    description: 'A fire dragon shell with ember-lit panels, heated accents and rising sparks.',
    kind: 'SITE_THEME',
    rarity: 'legendary',
    styleKey: 'dragon-fire',
  },
  'street-pass-s1-inferno-frame': {
    key: 'street-pass-s1-inferno-frame',
    name: 'Inferno Drake Frame · Season 1',
    description: 'An illustrated fire dragon curls around the popup and avatar, with animated flame and embers.',
    kind: 'PROFILE_FRAME',
    rarity: 'legendary',
    styleKey: 'inferno-drake',
  },
  'street-pass-s1-urban-ghost': {
    key: 'street-pass-s1-urban-ghost',
    name: 'Urban Ghost Collection',
    description: 'Concrete, graphite and pale camo art for every weapon, ride, product, supply and crew outfit.',
    kind: 'ITEM_COLLECTION',
    rarity: 'rare',
    styleKey: 'urban-ghost',
  },
  'street-pass-s1-midnight-ops': {
    key: 'street-pass-s1-midnight-ops',
    name: 'Midnight Ops Collection',
    description: 'Blacked-out tactical art with teal accents for every weapon, ride, product, supply and crew outfit.',
    kind: 'ITEM_COLLECTION',
    rarity: 'epic',
    styleKey: 'midnight-ops',
  },
  'street-pass-s1-cartel-gold': {
    key: 'street-pass-s1-cartel-gold',
    name: 'Cartel Gold Collection',
    description: 'Engraved, gold-trimmed high-roller art for every weapon, ride, product, supply and crew outfit.',
    kind: 'ITEM_COLLECTION',
    rarity: 'legendary',
    styleKey: 'cartel-gold',
  },
} as const satisfies QuestCosmeticCatalog;

/**
 * Season 1, as agreed in docs/STREET-PASS.md and tuned by `npm run
 * qa:street-pass`: an active player finishes in the last week, a hardcore one
 * no sooner than day 18, and a casual one lands around tier 18.
 */
export const STREET_PASS_S1 = {
  key: 'street-pass-s1',
  name: 'Street Pass · Season 1',
  credPerTier: [
    { fromTier: 1, toTier: 10, cred: 800 },
    { fromTier: 11, toTier: 20, cred: 1200 },
    { fromTier: 21, toTier: 30, cred: 1600 },
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
    { tier: 1, rewards: [cash(20_000)] },
    { tier: 2, rewards: [item('condoms', 1000)] },
    { tier: 3, rewards: [item('whores', 3)] },
    { tier: 4, rewards: [turns(25)] },
    { tier: 5, rewards: [item('pistols', 25), item('thugs', 5)] },
    { tier: 6, rewards: [item('beer', 500)] },
    { tier: 7, rewards: [item('medicine', 50)] },
    { tier: 8, rewards: [cash(50_000), cosmetic('street-pass-s1-urban-ghost'), cosmetic('street-pass-s1-chrome-serpent-theme'), cosmetic('street-pass-s1-chrome-serpent-frame')] },
    { tier: 9, rewards: [product('WEED', 250)] },
    { tier: 10, rewards: [item('shotguns', 3), item('whores', 5), cosmetic('street-pass-s1-fresh-face'), cosmetic('street-pass-s1-phantom-convoy-theme'), cosmetic('street-pass-s1-phantom-convoy-frame')] },
    { tier: 11, rewards: [turns(40)] },
    { tier: 12, rewards: [favor('STREET_FRENZY'), cosmetic('street-pass-s1-lantern-district-theme'), cosmetic('street-pass-s1-lantern-district-frame')] },
    { tier: 13, rewards: [item('thugs', 10)] },
    { tier: 14, rewards: [product('ECSTASY', 150)] },
    { tier: 15, rewards: [cash(100_000), favor('TOMMY_VOUCHER'), cosmetic('street-pass-s1-ice-dragon-theme'), cosmetic('street-pass-s1-snowstorm-frame'), cosmetic('street-pass-s1-siren-breaker-theme'), cosmetic('street-pass-s1-siren-breaker-frame')] },
    { tier: 16, rewards: [item('whores', 8)] },
    { tier: 17, rewards: [favor('COOKHOUSE_RUSH')] },
    { tier: 18, rewards: [product('METH', 200), cosmetic('street-pass-s1-midnight-ops'), cosmetic('street-pass-s1-block-sovereign-theme'), cosmetic('street-pass-s1-block-sovereign-frame')] },
    { tier: 19, rewards: [turns(60)] },
    { tier: 20, rewards: [item('tek9s', 2), item('lowRiders', 1), cosmetic('street-pass-s1-made-man'), cosmetic('street-pass-s1-gilded-house-theme'), cosmetic('street-pass-s1-gilded-house-frame')] },
    { tier: 21, rewards: [cash(150_000)] },
    { tier: 22, rewards: [product('COCAINE', 150)] },
    { tier: 23, rewards: [favor('BURNER_PHONE', 2)] },
    { tier: 24, rewards: [item('thugs', 15)] },
    { tier: 25, rewards: [item('whores', 12), favor('DOCTOR_FAVOR'), cosmetic('street-pass-s1-fire-dragon-theme'), cosmetic('street-pass-s1-inferno-frame'), cosmetic('street-pass-s1-dead-or-alive-theme'), cosmetic('street-pass-s1-dead-or-alive-frame')] },
    { tier: 26, rewards: [turns(100)] },
    { tier: 27, rewards: [product('HEROIN', 200)] },
    { tier: 28, rewards: [cash(200_000), cosmetic('street-pass-s1-cartel-gold'), cosmetic('street-pass-s1-laurel-ascendant-theme'), cosmetic('street-pass-s1-laurel-ascendant-frame')] },
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
