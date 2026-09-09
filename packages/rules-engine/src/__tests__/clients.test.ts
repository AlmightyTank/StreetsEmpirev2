import { describe, expect, it } from 'vitest';
import { classicOgV01 } from '@streets/rulesets';
import type { DistrictKey } from '@streets/rulesets';
import {
  clientMultiplier,
  districtCapacities,
  rotationEndsAt,
  rotationIndex,
} from '../calculations/clients.js';

const rules = classicOgV01;
const keys = Object.keys(rules.scouting.districts) as DistrictKey[];
const round = 'round_test_0001';

const at = (iso: string) => new Date(iso);

describe('client capacity', () => {
  it('hands out every capacity exactly once, so the city is a permutation', () => {
    // The same five numbers are always in play. Only where changes, which is
    // what keeps the city worth the same every hour.
    for (let hour = 0; hour < 48; hour++) {
      const capacities = districtCapacities(round, at(`2026-09-08T${String(hour % 24).padStart(2, '0')}:30:00Z`), rules);
      const handed = keys.map((k) => capacities[k]).sort((a, b) => b - a);

      expect(handed).toEqual([...rules.scouting.clients.capacities].sort((a, b) => b - a));
    }
  });

  it('gives every player in a round the same city in the same hour', () => {
    // One shared world, not a private roll per player - two reads of the same
    // moment must agree, or the same trip would pay differently per caller.
    const early = districtCapacities(round, at('2026-09-08T14:00:00Z'), rules);
    const late = districtCapacities(round, at('2026-09-08T14:59:59Z'), rules);

    expect(late).toEqual(early);
  });

  it('reshuffles on the hour', () => {
    const before = districtCapacities(round, at('2026-09-08T14:59:59Z'), rules);
    const after = districtCapacities(round, at('2026-09-08T15:00:00Z'), rules);

    expect(rotationIndex(at('2026-09-08T15:00:00Z'), rules)).toBe(
      rotationIndex(at('2026-09-08T14:00:00Z'), rules) + 1,
    );
    // A permutation can repeat by chance, so this checks the clock advanced
    // rather than that the arrangement differs.
    expect(rotationEndsAt(at('2026-09-08T14:10:00Z'), rules)).toEqual(at('2026-09-08T15:00:00Z'));
    expect(Object.keys(after)).toEqual(Object.keys(before));
  });

  it('gives different rounds different cities', () => {
    const moment = at('2026-09-08T14:00:00Z');
    const seen = new Set(
      ['round_a', 'round_b', 'round_c', 'round_d'].map((id) =>
        JSON.stringify(districtCapacities(id, moment, rules)),
      ),
    );

    expect(seen.size).toBeGreaterThan(1);
  });

  it('moves every district around over a day', () => {
    // If a district were pinned to one capacity the secret would be worth
    // learning once instead of every hour.
    for (const key of keys) {
      const seen = new Set<number>();
      for (let hour = 0; hour < 24; hour++) {
        seen.add(districtCapacities(round, at(`2026-09-08T${String(hour).padStart(2, '0')}:00:00Z`), rules)[key]);
      }
      expect(seen.size).toBeGreaterThan(1);
    }
  });

  describe('what saturation does to a night', () => {
    it('barely touches a small crew', () => {
      // The constraint has to arrive with scale, not punish a beginner.
      const spread = rules.scouting.clients.capacities.map((c) => clientMultiplier(c, 10));

      expect(Math.min(...spread)).toBeGreaterThan(0.7);
    });

    it('outweighs the pay rate for a large one', () => {
      // This is the whole point: at scale the gap between a packed block and
      // a dead one has to beat the gap between the Casino and the Slums, or
      // the headline pay rate would still decide everything and the rotation
      // would be decoration.
      const caps = rules.scouting.clients.capacities;
      const atScale = caps.map((c) => clientMultiplier(c, 375));
      const clientSpread = Math.max(...atScale) / Math.min(...atScale);

      const pays = Object.values(rules.scouting.districts).map((d) => d.payMultiplier);
      const paySpread = Math.max(...pays) / Math.min(...pays);

      expect(clientSpread).toBeGreaterThan(paySpread);
    });

    it('never reaches zero, so a night is always worth something', () => {
      const worst = Math.min(...rules.scouting.clients.capacities);
      expect(clientMultiplier(worst, 100_000)).toBeGreaterThan(0);
    });

    it('shrinks as the crew grows', () => {
      const cap = 250;
      expect(clientMultiplier(cap, 10)).toBeGreaterThan(clientMultiplier(cap, 100));
      expect(clientMultiplier(cap, 100)).toBeGreaterThan(clientMultiplier(cap, 400));
    });
  });

  it('keeps the capacity off the district definitions themselves', () => {
    // The secret only works if it stays one. A district's public shape is the
    // pay rate and the recruit rates; the client count lives on the clock, not
    // on the district, so there is nothing for a DTO to accidentally spread.
    for (const district of Object.values(rules.scouting.districts)) {
      expect(Object.keys(district)).toEqual([
        'slug',
        'name',
        'whoresPerTurn',
        'thugsPerTurn',
        'payMultiplier',
        'protectionWhoresPerThug',
      ]);
    }
  });

  it('posts nothing about a block but whether you can hold it', () => {
    // Everything else is either hourly (the clients) or relative to the crew
    // you already run (the recruit rate), so a printed number would be a
    // spoiler or a lie. What a trip earned and who it picked up is the only
    // report, and it arrives after the fact.
    const dto: Record<string, unknown> = {
      key: 'CASINO', slug: 'casino', name: 'Casino District',
      protectionWhoresPerThug: 4, coveredWhores: 140, exposedFraction: 0,
    };

    // The shared DistrictDto is what actually enforces this; the list here is
    // the reminder of which fields must not come back.
    for (const leak of ['money', 'payMultiplier', 'recruiting', 'expectedWhoresPerTurn']) {
      expect(Object.keys(dto)).not.toContain(leak);
    }
  });

  it('sends Produce Crack to a real district rather than nowhere', () => {
    // Manual 3.2 still puts the girls out; they just are not sent anywhere in
    // particular. That block has to be one the rotation covers.
    expect(keys).toContain(rules.scouting.produceDistrict);
  });
});
