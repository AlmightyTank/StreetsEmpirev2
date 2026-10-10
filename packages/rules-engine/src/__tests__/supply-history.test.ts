import { describe, expect, it } from 'vitest';
import { rulesets, type Ruleset } from '@streets/rulesets';
import { dealerRules } from '../calculations/dealers.js';
import { laneRules } from '../calculations/supply-lanes.js';

/**
 * 1.6.0-I release gate: 1.6 behavior never reaches a round pinned before it. Every ruleset
 * outside the 1.6 family has no supply network at all, so orders, pickups, properties,
 * crews, sales and lanes are all switched off for it; and the 1.6 slices only ever add.
 */
const SLICES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
// 1.6.5 builds on the finished 1.6.0 season, so it carries the whole supply network.
const family = (ruleset: Ruleset) => ruleset.meta.id.startsWith('classic-og-v1.6-') || ruleset.meta.id.startsWith('classic-og-v1.6.5-');

describe('1.6.0 never reaches a round pinned before it', () => {
  it('leaves every earlier ruleset without a supply network', () => {
    const earlier = Object.values(rulesets).filter((ruleset) => !family(ruleset as Ruleset)) as Ruleset[];
    expect(earlier.length).toBeGreaterThan(100);
    for (const ruleset of earlier) {
      expect(ruleset.supplyNetwork, ruleset.meta.id).toBeUndefined();
      expect(dealerRules(ruleset), ruleset.meta.id).toBeUndefined();
      expect(laneRules(ruleset), ruleset.meta.id).toBeUndefined();
    }
  });

  it('adds each slice’s piece in order and never takes one away', () => {
    const pieces = (ruleset: Ruleset) => {
      const network = ruleset.supplyNetwork;
      return {
        suppliers: Boolean(network?.suppliers?.length),
        pickups: Boolean(network?.pickups),
        properties: Boolean(network?.properties),
        dealers: Boolean(network?.dealers),
        sales: Boolean(network?.dealers?.sales),
        shipments: Boolean(network?.pickups?.shipments),
        lanes: Boolean(network?.lanes),
      };
    };
    const firsts: Record<string, string> = { suppliers: 'b', pickups: 'c', properties: 'd', dealers: 'e', sales: 'f', shipments: 'f', lanes: 'h' };
    let previous: ReturnType<typeof pieces> | null = null;
    for (const slice of SLICES) {
      const ruleset = rulesets[`classic-og-v1.6-${slice}`] as Ruleset;
      expect(ruleset.supplyNetwork?.enabled, slice).toBe(true);
      const now = pieces(ruleset);
      for (const [piece, present] of Object.entries(now)) {
        expect(present, `${piece} in ${slice}`).toBe(slice >= firsts[piece]!);
        if (previous?.[piece as keyof typeof now]) expect(present, `${piece} kept in ${slice}`).toBe(true);
      }
      previous = now;
    }
  });

  it('carries the finished 1.6.0 supply network into 1.6.5 unchanged', () => {
    const finished = rulesets['classic-og-v1.6-h'] as Ruleset;
    for (const ruleset of Object.values(rulesets).filter((entry) => entry.meta.id.startsWith('classic-og-v1.6.5-')) as Ruleset[]) {
      expect(ruleset.supplyNetwork, ruleset.meta.id).toEqual(finished.supplyNetwork);
    }
  });
});
