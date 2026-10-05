import { describe, expect, it } from 'vitest';
import { classicOgV08H } from '../classic-og-v0.8-h/index.js';
import { classicOgStreetPassA, classicOgTripsE, rulesets } from '../index.js';
import {
  STREET_PASS_S1,
  STREET_PASS_S1_COSMETICS,
  streetPassCredToReach,
  streetPassCredWithBonus,
  streetPassLateJoinBonusPercent,
  streetPassProblems,
  streetPassTierCost,
  streetPassTierForCred,
} from '../street-pass.js';
import type { Ruleset, StreetPassRules } from '../types.js';

/** The current round's rules with season 1's badge and frame added, as a shipping ruleset would. */
const shipping: Ruleset = {
  ...classicOgV08H,
  cosmetics: { ...classicOgV08H.cosmetics, ...STREET_PASS_S1_COSMETICS },
  streetPass: STREET_PASS_S1,
};

const DAY = 24 * 60 * 60 * 1000;

function sum(kind: string, key?: string): number {
  const tiers: StreetPassRules['tiers'] = STREET_PASS_S1.tiers;
  return tiers
    .flatMap((tier) => tier.rewards)
    .filter((reward) => reward.kind === kind && (key === undefined || reward.key === key))
    .reduce((total, reward) => total + (reward.amount ?? 0), 0);
}

describe('Street Pass season 1', () => {
  it('is valid for the current round once its cosmetics ship with it', () => {
    expect(streetPassProblems(STREET_PASS_S1, shipping)).toEqual([]);
  });

  it('has 30 tiers ending in the Kingpin title and the permanent season badge and frame', () => {
    expect(STREET_PASS_S1.tiers).toHaveLength(30);
    expect(STREET_PASS_S1.tiers.at(-1)!.rewards).toEqual([
      { kind: 'COSMETIC_UNLOCK', key: 'street-pass-s1-kingpin' },
      { kind: 'COSMETIC_UNLOCK', key: 'street-pass-s1-badge' },
      { kind: 'COSMETIC_UNLOCK', key: 'street-pass-s1-frame' },
    ]);
    expect(STREET_PASS_S1_COSMETICS['street-pass-s1-badge'].kind).toBe('TITLE_BADGE');
    expect(STREET_PASS_S1_COSMETICS['street-pass-s1-frame'].kind).toBe('PROFILE_FRAME');
    expect(STREET_PASS_S1.tiers[14]!.rewards).toContainEqual({ kind: 'COSMETIC_UNLOCK', key: 'street-pass-s1-night-drive-theme' });
    expect(STREET_PASS_S1.tiers[24]!.rewards).toContainEqual({ kind: 'COSMETIC_UNLOCK', key: 'street-pass-s1-chrome-halo-frame' });
    expect(STREET_PASS_S1_COSMETICS['street-pass-s1-night-drive-theme']).toMatchObject({
      kind: 'SITE_THEME', styleKey: 'street-pass-s1-night-drive',
    });
    expect(STREET_PASS_S1_COSMETICS['street-pass-s1-chrome-halo-frame']).toMatchObject({
      kind: 'PROFILE_FRAME', styleKey: 'street-pass-s1-chrome-halo',
    });
  });

  it('awards a season title at tiers 10, 20 and 30, rising in rarity', () => {
    const tiers: StreetPassRules['tiers'] = STREET_PASS_S1.tiers;
    const titles = tiers.flatMap((tier) => tier.rewards
      .filter((reward) => reward.kind === 'COSMETIC_UNLOCK'
        && ['street-pass-s1-fresh-face', 'street-pass-s1-made-man', 'street-pass-s1-kingpin'].includes(reward.key))
      .map((reward) => {
        const cosmetic = STREET_PASS_S1_COSMETICS[reward.key as keyof typeof STREET_PASS_S1_COSMETICS];
        return [tier.tier, cosmetic.name, cosmetic.kind, cosmetic.rarity];
      }));
    expect(titles).toEqual([
      [10, 'Fresh Face · Season 1', 'TITLE_BADGE', 'rare'],
      [20, 'Made Man · Season 1', 'TITLE_BADGE', 'epic'],
      [30, 'Kingpin · Season 1', 'TITLE_BADGE', 'legendary'],
    ]);
  });

  it('pays what the design doc promises for a full pass', () => {
    expect(sum('CASH')).toBe(520_000 * 100);
    expect(sum('ITEM', 'whores')).toBe(28);
    expect(sum('ITEM', 'thugs')).toBe(30);
    expect(sum('TURNS')).toBe(225);
    expect(sum('ITEM', 'lowRiders')).toBe(2);
    expect(sum('ITEM', 'ak47s')).toBe(2);
    expect(sum('ITEM', 'tek9s')).toBe(2);
    expect(sum('FAVOR_ITEM')).toBe(6);
  });

  it('gives guns as items and never buying access', () => {
    const kinds = STREET_PASS_S1.tiers.flatMap((tier) => tier.rewards.map((reward) => reward.kind));
    expect(kinds).not.toContain('WEAPON_ACCESS');
    expect(kinds).not.toContain('PERMANENT_UNLOCK');
  });

  it('costs 36,000 Cred in all, with tiers getting dearer', () => {
    expect(streetPassTierCost(STREET_PASS_S1, 1)).toBe(800);
    expect(streetPassTierCost(STREET_PASS_S1, 11)).toBe(1200);
    expect(streetPassTierCost(STREET_PASS_S1, 30)).toBe(1600);
    expect(streetPassCredToReach(STREET_PASS_S1, 10)).toBe(8_000);
    expect(streetPassCredToReach(STREET_PASS_S1, 20)).toBe(20_000);
    expect(streetPassCredToReach(STREET_PASS_S1, 30)).toBe(36_000);
  });

  it('turns Cred into the tier reached', () => {
    expect(streetPassTierForCred(STREET_PASS_S1, 0)).toBe(0);
    expect(streetPassTierForCred(STREET_PASS_S1, 799)).toBe(0);
    expect(streetPassTierForCred(STREET_PASS_S1, 800)).toBe(1);
    expect(streetPassTierForCred(STREET_PASS_S1, 9_199)).toBe(10);
    expect(streetPassTierForCred(STREET_PASS_S1, 9_200)).toBe(11);
    expect(streetPassTierForCred(STREET_PASS_S1, 35_999)).toBe(29);
    expect(streetPassTierForCred(STREET_PASS_S1, 36_000)).toBe(30);
    expect(streetPassTierForCred(STREET_PASS_S1, 1_000_000)).toBe(30);
  });

  it('gives late joiners +15% per full week behind, up to +45%', () => {
    const start = new Date('2026-10-01T00:00:00Z');
    const joined = (days: number) => new Date(start.getTime() + days * DAY);
    expect(streetPassLateJoinBonusPercent(STREET_PASS_S1, start, joined(-1))).toBe(0);
    expect(streetPassLateJoinBonusPercent(STREET_PASS_S1, start, joined(6.9))).toBe(0);
    expect(streetPassLateJoinBonusPercent(STREET_PASS_S1, start, joined(7))).toBe(15);
    expect(streetPassLateJoinBonusPercent(STREET_PASS_S1, start, joined(14))).toBe(30);
    expect(streetPassLateJoinBonusPercent(STREET_PASS_S1, start, joined(21))).toBe(45);
    expect(streetPassLateJoinBonusPercent(STREET_PASS_S1, start, joined(27))).toBe(45);
  });

  it('applies the bonus and rounds down', () => {
    expect(streetPassCredWithBonus(150, 0)).toBe(150);
    expect(streetPassCredWithBonus(150, 30)).toBe(195);
    expect(streetPassCredWithBonus(1, 45)).toBe(1);
  });
});

describe('classic-og-street-pass-a', () => {
  it('ships Season 1 on top of Trips E with its cosmetics', () => {
    expect(classicOgStreetPassA.meta).toEqual({ id: 'classic-og-street-pass-a', version: 'street-pass-A', name: 'Classic OG - Street Pass (Season 1)' });
    expect(rulesets['classic-og-street-pass-a']).toBe(classicOgStreetPassA);
    expect(classicOgStreetPassA.streetPass).toBe(STREET_PASS_S1);
    expect(classicOgStreetPassA.travel).toBe(classicOgTripsE.travel);
    for (const key of Object.keys(STREET_PASS_S1_COSMETICS)) expect(classicOgStreetPassA.cosmetics[key as keyof typeof STREET_PASS_S1_COSMETICS]).toBeDefined();
    expect(streetPassProblems(STREET_PASS_S1, classicOgStreetPassA)).toEqual([]);
  });

  it('leaves every older ruleset without a pass, and every later one with it', () => {
    const ids = Object.keys(rulesets);
    const from = ids.indexOf('classic-og-street-pass-a');
    const withPass = ids.filter((id) => rulesets[id]!.streetPass);
    // Rulesets built on street-pass-a (1.1.0 Businesses on) keep the pass.
    expect(withPass).toEqual(ids.slice(from));
    expect(withPass[0]).toBe('classic-og-street-pass-a');
  });
});

describe('streetPassProblems', () => {
  const withTiers = (tiers: StreetPassRules['tiers'], extra: Partial<StreetPassRules> = {}): StreetPassRules => ({
    ...STREET_PASS_S1,
    credPerTier: [{ fromTier: 1, toTier: tiers.length, cred: 100 }],
    tiers,
    ...extra,
  });

  it('catches rewards the round cannot grant', () => {
    const problems = streetPassProblems(withTiers([
      { tier: 1, rewards: [{ kind: 'PRODUCT', key: 'KRATOM', amount: 5 }] },
      { tier: 2, rewards: [{ kind: 'FAVOR_ITEM', key: 'NOT_A_FAVOR', amount: 1 }] },
      { tier: 3, rewards: [{ kind: 'ITEM', key: 'rocketLaunchers', amount: 1 }] },
      { tier: 4, rewards: [{ kind: 'COSMETIC_UNLOCK', key: 'street-pass-s9-badge' }] },
      { tier: 5, rewards: [{ kind: 'CASH', amount: 0 }] },
      { tier: 6, rewards: [{ kind: 'WEAPON_ACCESS', key: 'AK47' }] },
    ]), shipping);
    expect(problems).toEqual([
      'street-pass-s1 tier 1: PRODUCT KRATOM is not a product in this round',
      'street-pass-s1 tier 2: FAVOR_ITEM NOT_A_FAVOR is not a favor in this round',
      'street-pass-s1 tier 3: ITEM rocketLaunchers is not an item a reward can give',
      'street-pass-s1 tier 4: COSMETIC_UNLOCK street-pass-s9-badge is not a cosmetic in this round',
      'street-pass-s1 tier 5: CASH needs a positive whole amount',
      'street-pass-s1 tier 6: WEAPON_ACCESS AK47: the Street Pass gives the item itself, never buying access or unlocks',
    ]);
  });

  it('catches gaps in tier numbers and Cred costs', () => {
    const problems = streetPassProblems(withTiers(
      [{ tier: 1, rewards: [{ kind: 'TURNS', amount: 5 }] }, { tier: 3, rewards: [] }],
      { credPerTier: [{ fromTier: 1, toTier: 1, cred: 100 }] },
    ), shipping);
    expect(problems).toEqual([
      'street-pass-s1: tier 2 is numbered 3',
      'street-pass-s1: tier 3 has no reward',
      'street-pass-s1: Cred costs cover tiers 1-1, but the track has 2',
    ]);
  });

  it('refuses season 1 on a round without its cosmetics', () => {
    expect(streetPassProblems(STREET_PASS_S1, classicOgV08H)).toEqual([
      'street-pass-s1 tier 10: COSMETIC_UNLOCK street-pass-s1-fresh-face is not a cosmetic in this round',
      'street-pass-s1 tier 20: COSMETIC_UNLOCK street-pass-s1-made-man is not a cosmetic in this round',
      'street-pass-s1 tier 30: COSMETIC_UNLOCK street-pass-s1-kingpin is not a cosmetic in this round',
      'street-pass-s1 tier 30: COSMETIC_UNLOCK street-pass-s1-badge is not a cosmetic in this round',
      'street-pass-s1 tier 15: COSMETIC_UNLOCK street-pass-s1-night-drive-theme is not a cosmetic in this round',
      'street-pass-s1 tier 25: COSMETIC_UNLOCK street-pass-s1-chrome-halo-frame is not a cosmetic in this round',
      'street-pass-s1 tier 30: COSMETIC_UNLOCK street-pass-s1-frame is not a cosmetic in this round',
    ]);
  });

  it('passes for every ruleset that ships a Street Pass', () => {
    for (const ruleset of Object.values(rulesets)) {
      if (ruleset.streetPass) expect(streetPassProblems(ruleset.streetPass, ruleset), ruleset.meta.id).toEqual([]);
    }
  });
});
