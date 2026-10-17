import {
  ITEM_COSMETIC_STYLES,
  COLLECTION_COVERAGE,
  RELEASED_ITEM_COSMETIC_STYLES,
  isHiddenStyle,
  type ItemCosmeticStyleKey,
} from '@streets/shared';
import {
  STREET_PASS_S1,
  STREET_PASS_S1_COSMETICS,
  SUPPORTER_COSMETICS,
  ROUND_ROLL_CALL_FINALE_COSMETICS,
  SUPPORTER_MONTHLY_DROPS,
  SUPPORTER_TENURE,
  rulesets,
  type FactionKey,
  type QuestCosmeticDefinition,
  type QuestCosmeticKind,
  type QuestCosmeticRarity,
} from '@streets/rulesets';

/**
 * Showcase catalog for the Collection page (/game/collection).
 *
 * Every earnable, non-hidden cosmetic in one place with its source:
 * site themes, item collections, titles/badges, frames and accents.
 * Hidden Easter-egg looks (`hidden: true` in ITEM_COSMETIC_STYLES) and the
 * eggs themselves are deliberately excluded: an unfound egg is never listed
 * anywhere (see docs/EASTER-EGGS.md).
 */

export type CollectionSourceKind =
  | 'default'
  | 'street-pass'
  | 'round-roll-call'
  | 'quest'
  | 'secret'
  | 'faction'
  | 'supporter'
  | 'supporter-drop'
  | 'supporter-tenure'
  | 'unavailable';

export interface CollectionSource {
  kind: CollectionSourceKind;
  /** One line: "Street Pass · Season 1, tier 8". */
  label: string;
}

export interface CollectionEntry {
  /** Equip/option key: the styleKey when one exists, else the catalog key. */
  key: string;
  /** Ruleset catalog key (or supporter key) this entry came from. */
  catalogKey: string;
  name: string;
  description: string;
  kind: QuestCosmeticKind;
  rarity: QuestCosmeticRarity;
  styleKey?: string;
  source: CollectionSource;
}

export interface ItemLookEntry {
  style: ItemCosmeticStyleKey;
  label: string;
  description: string;
  /** Full collections dress every item and crew; single-item styles do not. */
  fullCollection: boolean;
  source: CollectionSource;
}

export type CollectionTab = 'themes' | 'items' | 'titles' | 'frames';

const HIDDEN_STYLE_KEYS: Set<string> = new Set(
  ITEM_COSMETIC_STYLES.filter((style) => isHiddenStyle(style.key)).map((style) => style.key),
);

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  const name = MONTH_NAMES[Number(match[2]) - 1] ?? match[2];
  return `${name} ${match[1]}`;
}

function displayKeyOf(def: Pick<QuestCosmeticDefinition, 'key' | 'styleKey'>): string {
  return def.styleKey ?? def.key;
}

function factionName(rulesetFactions: unknown, factionKey: FactionKey): string {
  if (rulesetFactions && typeof rulesetFactions === 'object') {
    const entry = (rulesetFactions as Record<string, { name?: string }>)[factionKey];
    if (entry?.name) return entry.name;
  }
  return factionKey;
}

function buildSources(): Map<string, CollectionSource> {
  const sources = new Map<string, CollectionSource>();
  const set = (key: string, source: CollectionSource, overwrite = false) => {
    if (overwrite || !sources.has(key)) sources.set(key, source);
  };

  for (const def of Object.values(SUPPORTER_COSMETICS)) {
    set(displayKeyOf(def), { kind: 'supporter', label: 'Supporter reward' });
  }
  for (const def of Object.values(ROUND_ROLL_CALL_FINALE_COSMETICS)) {
    set(displayKeyOf(def), { kind: 'round-roll-call', label: 'Complete all Round Roll Call stamps · final reward' });
  }
  for (const [month, bundle] of Object.entries(SUPPORTER_MONTHLY_DROPS)) {
    for (const def of bundle) {
      set(displayKeyOf(def), { kind: 'supporter-drop', label: `Supporter · ${monthLabel(month)}` });
    }
  }
  for (const tier of SUPPORTER_TENURE) {
    set(displayKeyOf(tier.badge), {
      kind: 'supporter-tenure',
      label: `Supporter tenure · ${tier.months} months`,
    });
  }

  const passTiers: Array<{ name: string; tiers: readonly { tier: number; rewards: readonly { kind: string; key?: string }[] }[] }> = [
    { name: STREET_PASS_S1.name, tiers: STREET_PASS_S1.tiers },
  ];
  for (const ruleset of Object.values(rulesets)) {
    const pass = ruleset.streetPass;
    if (pass && pass.key !== STREET_PASS_S1.key) passTiers.push({ name: pass.name, tiers: pass.tiers });
  }
  for (const pass of passTiers) {
    for (const tier of pass.tiers) {
      for (const reward of tier.rewards) {
        if (reward.kind !== 'COSMETIC_UNLOCK' || !reward.key) continue;
        set(reward.key, { kind: 'street-pass', label: `${pass.name}, tier ${tier.tier}` });
      }
    }
  }
  // Street Pass rewards are keyed by catalog key; the same unlock is shown
  // under its style key, so mirror the tier source there too.
  // (Resolved after the catalog merge in buildCollectionCatalog.)

  for (const ruleset of Object.values(rulesets)) {
    const rewards = ruleset.factionPublic?.rewards;
    if (!rewards) continue;
    for (const tier of ['CONNECTED', 'INNER_CIRCLE'] as const) {
      const byFaction = rewards[tier];
      if (!byFaction) continue;
      for (const [factionKey, keys] of Object.entries(byFaction)) {
        for (const key of keys ?? []) {
          set(key, {
            kind: 'faction',
            label: tier === 'CONNECTED'
              ? `Connected with ${factionName(ruleset.factions, factionKey as FactionKey)}`
              : `Inner Circle with ${factionName(ruleset.factions, factionKey as FactionKey)}`,
          });
        }
      }
    }
  }

  for (const ruleset of Object.values(rulesets)) {
    const catalog = ruleset.questDefinitions;
    if (!catalog) continue;
    for (const quest of Object.values(catalog)) {
      const secret = quest.availability?.hidden === true;
      const questRewards = [
        ...quest.rewards,
        ...(quest.branches ?? []).flatMap((branch) => branch.rewards),
      ];
      for (const reward of questRewards) {
        if (reward.kind !== 'COSMETIC_UNLOCK' || !reward.key) continue;
        const existing = sources.get(reward.key);
        // A public job beats a secret one as the "how to earn" hint.
        if (existing && (!secret || existing.kind !== 'secret')) {
          if (existing.kind === 'secret' && !secret) {
            // fall through to overwrite below
          } else continue;
        }
        set(reward.key, {
          kind: secret ? 'secret' : 'quest',
          label: secret ? `Secret job: ${quest.title}` : `Job: ${quest.title}`,
        }, true);
      }
    }
  }
  return sources;
}

function buildCatalog(): Map<string, QuestCosmeticDefinition> {
  const catalog = new Map<string, QuestCosmeticDefinition>();
  for (const ruleset of Object.values(rulesets)) {
    for (const def of Object.values(ruleset.cosmetics ?? {})) {
      catalog.set(displayKeyOf(def), def);
    }
  }
  for (const def of Object.values(SUPPORTER_COSMETICS)) {
    if (!catalog.has(displayKeyOf(def))) catalog.set(displayKeyOf(def), def);
  }
  for (const bundle of Object.values(SUPPORTER_MONTHLY_DROPS)) {
    for (const def of bundle) {
      if (!catalog.has(displayKeyOf(def))) catalog.set(displayKeyOf(def), def);
    }
  }
  for (const tier of SUPPORTER_TENURE) {
    if (!catalog.has(displayKeyOf(tier.badge))) catalog.set(displayKeyOf(tier.badge), tier.badge);
  }
  for (const def of Object.values(ROUND_ROLL_CALL_FINALE_COSMETICS)) {
    catalog.set(displayKeyOf(def), def);
  }
  // Season names win over the unseasoned base entry for the same look.
  for (const def of Object.values(STREET_PASS_S1_COSMETICS)) {
    catalog.set(displayKeyOf(def), def);
  }
  return catalog;
}

const RARITY_ORDER: Record<QuestCosmeticRarity, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  uncommon: 3,
  common: 4,
};

export function sortCollectionEntries(entries: CollectionEntry[]): CollectionEntry[] {
  return [...entries].sort(
    (a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity] || a.name.localeCompare(b.name),
  );
}

/** Every earnable, non-hidden cosmetic with its source. Hidden egg looks excluded. */
export function buildCollectionCatalog(): CollectionEntry[] {
  const catalog = buildCatalog();
  const sources = buildSources();
  // Mirror Street Pass tier sources from catalog key to display (style) key.
  for (const [displayKey, def] of catalog) {
    if (def.styleKey && sources.has(def.key) && !sources.has(displayKey)) {
      sources.set(displayKey, sources.get(def.key)!);
    }
  }
  const entries: CollectionEntry[] = [];
  for (const [displayKey, def] of catalog) {
    if (def.styleKey && HIDDEN_STYLE_KEYS.has(def.styleKey)) continue;
    if (def.kind === 'ITEM_COLLECTION' && def.styleKey && HIDDEN_STYLE_KEYS.has(def.styleKey)) continue;
    entries.push({
      key: displayKey,
      catalogKey: def.key,
      name: def.name,
      description: def.description,
      kind: def.kind,
      rarity: def.rarity,
      styleKey: def.styleKey,
      source: sources.get(displayKey)
        ?? sources.get(def.key)
        ?? { kind: 'unavailable', label: 'Not yet earnable' },
    });
  }
  return sortCollectionEntries(entries);
}

/** Released, non-hidden item/crew looks with their sources. Hidden egg styles excluded. */
export function buildItemLooks(catalog: CollectionEntry[] = buildCollectionCatalog()): ItemLookEntry[] {
  const byStyle = new Map<string, CollectionSource>();
  for (const entry of catalog) {
    if (entry.kind === 'ITEM_COLLECTION' && entry.styleKey) byStyle.set(entry.styleKey, entry.source);
  }
  return RELEASED_ITEM_COSMETIC_STYLES.filter((style) => !isHiddenStyle(style.key)).map((style) => ({
    style: style.key,
    label: style.label,
    description: style.description,
    fullCollection: !('items' in style && style.items) && !COLLECTION_COVERAGE[style.key],
    source: style.key === 'classic'
      ? { kind: 'default', label: 'Included for everyone' } satisfies CollectionSource
      : byStyle.get(style.key) ?? ({ kind: 'unavailable', label: 'Not yet earnable' } satisfies CollectionSource),
  }));
}

export function entriesForTab(entries: CollectionEntry[], tab: CollectionTab): CollectionEntry[] {
  switch (tab) {
    case 'themes':
      return entries.filter((entry) => entry.kind === 'SITE_THEME');
    case 'titles':
      return entries.filter((entry) => entry.kind === 'TITLE_BADGE');
    case 'frames':
      return entries.filter((entry) =>
        entry.kind === 'PROFILE_FRAME' || entry.kind === 'ACCENT' || entry.kind === 'HIDEOUT_DECOR');
    case 'items':
      return entries.filter((entry) => entry.kind === 'ITEM_COLLECTION');
  }
}
