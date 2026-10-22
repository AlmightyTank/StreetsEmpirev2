import { describe, expect, it } from 'vitest';
import {
  CROWN_EARN_RULES,
  CROWN_PACKS,
  DROP_BUNDLES,
  DROP_COLLECTIONS,
  DROP_ITEMS,
  DROP_KEY_PREFIX,
  ROUND_ROLL_CALL_FINALE_COSMETICS,
  STREET_PASS_SKIP_PRICES,
  SUPPORTER_COSMETICS,
  SUPPORTER_MONTHLY_DROPS,
  SUPPORTER_TENURE,
  bundleListPrice,
  bundlePriceFor,
  dropDailyWindow,
  dropWeeklyWindow,
  featuredCollectionFor,
  pickDaily,
  rulesets,
  streetPassSkipPrice,
  SUPPORTER_DROP_DISCOUNT_PERCENT,
  BIRTHDAY_DISCOUNT_PERCENT,
  discountedDropPrice,
  dropDefaultState,
  featuredCollectionsFor,
  evergreenDropCollections,
} from '../index.js';

const items = Object.values(DROP_ITEMS);
const bundles = Object.values(DROP_BUNDLES);

describe('The Drop catalogue', () => {
  it('ships twenty-three sets with a shell theme and a bundle each, plus Street Singles', () => {
    expect(Object.keys(DROP_COLLECTIONS)).toHaveLength(24);
    expect(items.length).toBeGreaterThanOrEqual(18);
    const singles = items.filter((item) => item.collection === 'street-singles');
    expect(singles).toHaveLength(50);
    expect(singles.filter((item) => item.kind === 'STREET_SIGN_BACKDROP')).toHaveLength(19);
    expect(singles.some((item) => item.kind === 'SITE_THEME')).toBe(false);
    expect(bundles.some((bundle) => bundle.collection === 'street-singles')).toBe(false);
    expect(evergreenDropCollections()).not.toContain('street-singles');
    for (const collection of Object.keys(DROP_COLLECTIONS).filter((key) => key !== 'street-singles')) {
      expect(items.filter((item) => item.collection === collection).length).toBeGreaterThanOrEqual(7);
      expect(items.filter((item) => item.collection === collection && item.kind === 'SITE_THEME')).toHaveLength(1);
      expect(bundles.filter((bundle) => bundle.collection === collection)).toHaveLength(1);
    }
  });

  it('keys every unlock with the drop- prefix and never reuses an existing reward key or style', () => {
    const others = new Set<string>([
      ...Object.keys(SUPPORTER_COSMETICS),
      ...Object.values(SUPPORTER_MONTHLY_DROPS).flat().map((drop) => drop.key),
      ...SUPPORTER_TENURE.map((tier) => tier.badge.key),
      ...Object.keys(ROUND_ROLL_CALL_FINALE_COSMETICS),
      ...Object.values(rulesets).flatMap((ruleset) => Object.keys(ruleset.cosmetics ?? {})),
    ]);
    const otherStyles = new Set<string>([
      ...Object.values(SUPPORTER_COSMETICS).map((cosmetic) => cosmetic.styleKey),
      ...Object.values(ROUND_ROLL_CALL_FINALE_COSMETICS).map((cosmetic) => (cosmetic as { styleKey?: string }).styleKey ?? ''),
      ...Object.values(rulesets).flatMap((ruleset) => Object.values(ruleset.cosmetics ?? {}).map((cosmetic) => cosmetic.styleKey ?? '')),
    ].filter(Boolean));
    const styles = new Set<string>();
    for (const item of items) {
      expect(item.key.startsWith(DROP_KEY_PREFIX)).toBe(true);
      expect(others.has(item.key)).toBe(false);
      if (item.styleKey) {
        expect(otherStyles.has(item.styleKey), item.styleKey).toBe(false);
        expect(styles.has(item.styleKey)).toBe(false);
        styles.add(item.styleKey);
      }
    }
  });

  it('prices every item inside the roadmap ranges and as whole Crowns', () => {
    for (const item of items) {
      expect(Number.isSafeInteger(item.priceCrowns)).toBe(true);
      expect(item.priceCrowns).toBeGreaterThanOrEqual(150);
      expect(item.priceCrowns).toBeLessThanOrEqual(1500);
    }
  });

  it('makes every bundle a real saving on its singles', () => {
    for (const bundle of bundles) {
      expect(bundle.itemKeys.every((key) => DROP_ITEMS[key])).toBe(true);
      expect(bundle.priceCrowns).toBeLessThan(bundleListPrice(bundle));
      expect(bundle.priceCrowns).toBeGreaterThanOrEqual(1500);
      expect(bundle.priceCrowns).toBeLessThanOrEqual(2000);
    }
  });
});

describe('bundlePriceFor', () => {
  const prices = [{ key: 'a', price: 800 }, { key: 'b', price: 200 }];

  it('charges the full bundle when nothing is owned', () => {
    expect(bundlePriceFor(700, prices, new Set())).toMatchObject({ price: 700, missing: ['a', 'b'] });
  });

  it('scales by the missing share of list value, rounded up, and keeps the saving', () => {
    const result = bundlePriceFor(700, prices, new Set(['a']));
    expect(result.price).toBe(140);
    expect(result.missing).toEqual(['b']);
    expect(result.price).toBeLessThanOrEqual(200);
  });

  it('cannot be bought once everything is owned', () => {
    expect(bundlePriceFor(700, prices, new Set(['a', 'b']))).toMatchObject({ price: 0, missing: [] });
  });
});

describe('Street Pass level skips', () => {
  it('prices singles and ten-packs', () => {
    expect(streetPassSkipPrice(1)).toBe(STREET_PASS_SKIP_PRICES.single);
    expect(streetPassSkipPrice(10)).toBe(STREET_PASS_SKIP_PRICES.tenPack);
    expect(streetPassSkipPrice(13)).toBe(STREET_PASS_SKIP_PRICES.tenPack + 3 * STREET_PASS_SKIP_PRICES.single);
    expect(streetPassSkipPrice(10)).toBeLessThan(10 * STREET_PASS_SKIP_PRICES.single);
    expect(streetPassSkipPrice(0)).toBe(0);
    expect(streetPassSkipPrice(1.5)).toBe(0);
  });
});

describe('Crown packs and earning', () => {
  it('gives more Crowns per dollar on bigger packs', () => {
    const rates = CROWN_PACKS.map((pack) => pack.crowns / pack.priceCents);
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
  });

  it('caps play earnings near 500 a round, and an earn-only player can afford a starter item', () => {
    const daily = CROWN_EARN_RULES.dailyContract * 28;
    const weekly = CROWN_EARN_RULES.weeklyContract * 4;
    const milestones = CROWN_EARN_RULES.milestone * CROWN_EARN_RULES.checkInMilestones.length;
    const max = Math.min(CROWN_EARN_RULES.roundCap, daily + weekly + milestones + CROWN_EARN_RULES.eventCap);
    expect(max).toBeGreaterThanOrEqual(400);
    expect(max).toBeLessThanOrEqual(600);
    expect(Math.min(...items.map((item) => item.priceCrowns))).toBeLessThan(max);
  });
});

describe('Rotation windows', () => {
  it('switches the daily shop exactly at the reset hour', () => {
    const before = dropDailyWindow(new Date('2026-10-18T23:59:59.999Z'));
    const after = dropDailyWindow(new Date('2026-10-19T00:00:00.000Z'));
    expect(before.key).toBe('2026-10-18');
    expect(after.key).toBe('2026-10-19');
    expect(before.endsAt.getTime()).toBe(after.startsAt.getTime());
    const shifted = dropDailyWindow(new Date('2026-10-19T03:00:00Z'), 5);
    expect(shifted.startsAt.toISOString()).toBe('2026-10-18T05:00:00.000Z');
  });

  it('runs the featured week Monday to Monday in UTC', () => {
    const week = dropWeeklyWindow(new Date('2026-10-18T12:00:00Z'));
    expect(week.startsAt.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(week.endsAt.toISOString()).toBe('2026-10-19T00:00:00.000Z');
    expect(dropWeeklyWindow(new Date('2026-10-19T00:00:00Z')).index).toBe(week.index + 1);
  });

  it('picks the same daily items on every server and cycles the featured collection', () => {
    const pool = items.map((item) => item.key);
    expect(pickDaily(pool, '2026-10-18', 4)).toEqual(pickDaily([...pool].reverse(), '2026-10-18', 4));
    expect(new Set(pickDaily(pool, '2026-10-18', 4)).size).toBe(4);
    expect(pickDaily(pool, '2026-10-18', 4)).not.toEqual(pickDaily(pool, '2026-10-19', 4));
    const collections = Object.keys(DROP_COLLECTIONS);
    expect(new Set([0, 1, 2].map((week) => featuredCollectionFor(week, collections))).size).toBe(3);
    expect(featuredCollectionFor(5, [])).toBeNull();
  });
});

describe('Holiday sets', () => {
  const holiday = Object.values(DROP_COLLECTIONS as Readonly<Record<string, { key: string; season?: string }>>).filter((collection) => collection.season);

  it('holds the four holiday sets as Draft by default and everything else Live', () => {
    expect(holiday.map((collection) => collection.key)).toEqual(['graveyard-shift', 'naughty-list', 'heartbreaker', 'block-party']);
    for (const entry of [...items, ...bundles]) {
      const seasonal = holiday.some((collection) => collection.key === entry.collection);
      expect(dropDefaultState(entry.key, new Date('2026-12-15T12:00:00Z')), entry.key).toBe(seasonal ? 'DRAFT' : 'LIVE');
    }
  });

  it('opens Graveyard Shift for its Halloween window only', () => {
    expect(dropDefaultState('drop-graveyard-shift-sedan', new Date('2026-10-18T23:59:59Z'))).toBe('DRAFT');
    expect(dropDefaultState('drop-graveyard-shift-sedan', new Date('2026-10-19T00:00:00Z'))).toBe('LIVE');
    expect(dropDefaultState('drop-graveyard-shift-bundle', new Date('2026-11-02T23:59:59Z'))).toBe('LIVE');
    expect(dropDefaultState('drop-graveyard-shift-bundle', new Date('2026-11-03T00:00:00Z'))).toBe('DRAFT');
    expect(dropDefaultState('drop-heartbreaker-thug', new Date('2026-10-31T00:00:00Z'))).toBe('DRAFT');
  });

  it('features consecutive pairs so every set gets a turn', () => {
    const sets = ['a', 'b', 'c', 'd', 'e'];
    expect(featuredCollectionsFor(0, sets)).toEqual(['a', 'b']);
    expect(featuredCollectionsFor(1, sets)).toEqual(['c', 'd']);
    expect(featuredCollectionsFor(2, sets)).toEqual(['e', 'a']);
    expect(featuredCollectionsFor(0, ['a'])).toEqual(['a']);
    expect(featuredCollectionsFor(0, [])).toEqual([]);
  });
});

describe('Drop discounts', () => {
  it('takes 10% off, rounded in the player\'s favour, and never below 1 Crown', () => {
    expect(SUPPORTER_DROP_DISCOUNT_PERCENT).toBe(10);
    expect(discountedDropPrice(2_800, SUPPORTER_DROP_DISCOUNT_PERCENT)).toBe(2_520);
    expect(discountedDropPrice(250, SUPPORTER_DROP_DISCOUNT_PERCENT)).toBe(225);
    expect(discountedDropPrice(155, SUPPORTER_DROP_DISCOUNT_PERCENT)).toBe(139);
    expect(discountedDropPrice(1, SUPPORTER_DROP_DISCOUNT_PERCENT)).toBe(1);
    expect(discountedDropPrice(0, SUPPORTER_DROP_DISCOUNT_PERCENT)).toBe(0);
    expect(discountedDropPrice(streetPassSkipPrice(10), SUPPORTER_DROP_DISCOUNT_PERCENT)).toBe(900);
  });

  it('ignores a zero or negative percent', () => {
    expect(discountedDropPrice(800, 0)).toBe(800);
    expect(discountedDropPrice(800, -5)).toBe(800);
    expect(discountedDropPrice(800, BIRTHDAY_DISCOUNT_PERCENT)).toBe(680);
  });

  it('always leaves a supporter price below the list price for every Drop item and bundle', () => {
    for (const entry of [...items, ...bundles]) {
      expect(discountedDropPrice(entry.priceCrowns, SUPPORTER_DROP_DISCOUNT_PERCENT)).toBeLessThan(entry.priceCrowns);
      expect(Number.isSafeInteger(discountedDropPrice(entry.priceCrowns, SUPPORTER_DROP_DISCOUNT_PERCENT))).toBe(true);
    }
  });
});

describe('level-gated Drop sets', () => {
  it('reports the highest account level the keys\' collections need', async () => {
    const { DROP_ITEMS, dropMinAccountLevel } = await import('../drop.js');
    const jewel = Object.values(DROP_ITEMS).find((item) => item.collection === 'crown-jewels')!;
    const open = Object.values(DROP_ITEMS).find((item) => item.collection === 'kingpin-luxe')!;
    expect(dropMinAccountLevel([open.key])).toBe(0);
    expect(dropMinAccountLevel([jewel.key])).toBe(25);
    expect(dropMinAccountLevel([open.key, jewel.key, 'not-a-key'])).toBe(25);
  });
});
