import { describe, expect, it } from 'vitest';
import { classicOgV14C2, classicOgV14D, classicOgV14E, type FactionKey } from '@streets/rulesets';
import { factionNudge, factionPerkOpen, innerCircleLockedBy, innerCirclePreview, nudgedAmount, nudgedCents, standingCap } from '../calculations/factions.js';
import { shortSupplies, supplyAt, supplyCrashesAhead } from '../calculations/markets.js';
import { cornerUpkeep } from '../calculations/turf.js';
import { bodyguardTicketCents, checkTrip, tripRules } from '../calculations/trips.js';

const HOUR = 3_600_000;

describe('1.4.0-D faction perks', () => {
  it('opens information at Known, warnings at Trusted and the nudge at Connected', () => {
    expect(factionPerkOpen('UNKNOWN', 'INFORMATION')).toBe(false);
    expect(factionPerkOpen('KNOWN', 'INFORMATION')).toBe(true);
    expect(factionPerkOpen('KNOWN', 'WARNINGS')).toBe(false);
    expect(factionPerkOpen('TRUSTED', 'WARNINGS')).toBe(true);
    expect(factionPerkOpen('TRUSTED', 'NUDGE')).toBe(false);
    expect(factionPerkOpen('CONNECTED', 'NUDGE')).toBe(true);
    expect(factionPerkOpen('INNER_CIRCLE', 'NUDGE')).toBe(true);
    expect(factionPerkOpen(undefined, 'INFORMATION')).toBe(false);
  });

  it('gives a nudge only from Connected, only for its own kind, and never before D', () => {
    expect(factionNudge(classicOgV14D, { OUTFIT: 'TRUSTED' }, 'TOMMY_WEAPONS')).toBeNull();
    expect(factionNudge(classicOgV14D, { OUTFIT: 'CONNECTED' }, 'TOMMY_WEAPONS')).toEqual({ factionKey: 'OUTFIT', percent: 5 });
    expect(factionNudge(classicOgV14D, { OUTFIT: 'CONNECTED' }, 'PIP_PRODUCT')).toBeNull();
    expect(factionNudge(classicOgV14D, { KINGS: 'INNER_CIRCLE' }, 'CORNER_UPKEEP')).toEqual({ factionKey: 'KINGS', percent: 10 });
    expect(factionNudge(classicOgV14C2, { OUTFIT: 'INNER_CIRCLE' }, 'TOMMY_WEAPONS')).toBeNull();
  });

  it('takes the percent off amounts and cents, never below zero', () => {
    expect(nudgedAmount(10, 10)).toBe(9);
    expect(nudgedAmount(30, 10)).toBe(27);
    expect(nudgedAmount(10, 0)).toBe(10);
    expect(nudgedCents(250_000n, 10)).toBe(225_000n);
    expect(nudgedCents(99n, 10)).toBe(90n);
    expect(nudgedCents(100n, 150)).toBe(0n);
  });

  it('cuts corner upkeep at the rate, before rounding up', () => {
    const full = cornerUpkeep(classicOgV14D, 200, 10);
    const cut = cornerUpkeep(classicOgV14D, 200, 10, 10);
    expect(cut.beer).toBeLessThan(full.beer);
    expect(cut.product).toBeLessThan(full.product);
    expect(cut.beer).toBe(Math.ceil(full.beer * 0.9));
    expect(cornerUpkeep(classicOgV14D, 200, 10, 0)).toEqual(full);
  });

  it('cuts only the bodyguards\' tickets for Road Saints, never the boss\'s', () => {
    const rules = tripRules(classicOgV14D)!;
    const perGuard = rules.bodyguards!.ticketCents;
    expect(bodyguardTicketCents(perGuard, 10)).toBe(BigInt(perGuard) - BigInt(perGuard) / 10n);
    const input = {
      from: 'new-york-city', to: 'miami-beach', now: new Date('2026-10-01T00:00:00Z'), stayMinutes: rules.stayMinutes[0]!,
      bankrollCents: 0n, cashCents: 10n ** 12n, turns: 1_000, roundEndsAt: new Date('2026-11-01T00:00:00Z'),
      tripOut: false, movingUntil: null, lockedUntil: null, bodyguards: 3, fitThugs: 10,
    };
    const full = checkTrip(classicOgV14D, input);
    const cut = checkTrip(classicOgV14D, { ...input, bodyguardTicketCutPercent: 10 });
    expect(full.ticketCents - cut.ticketCents).toBe(3n * (BigInt(perGuard) / 10n));
    expect(checkTrip(classicOgV14D, { ...input, bodyguards: 0, bodyguardTicketCutPercent: 10 }).ticketCents).toBe(BigInt(rules.ticketCents));
  });

  it('hears of supply crashes ahead that the schedule will deliver', () => {
    const seed = 'perk-seed';
    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date(from.getTime() + 14 * 24 * HOUR);
    const crashes = supplyCrashesAhead(classicOgV14D, seed, from, to);
    expect(crashes.length).toBeGreaterThan(0);
    for (const crash of crashes) {
      expect(crash.at.getTime()).toBeGreaterThan(from.getTime());
      expect(crash.at.getTime()).toBeLessThanOrEqual(to.getTime());
      // At the moment it lands, Pip is out there.
      expect(supplyAt(classicOgV14D, seed, crash.city, crash.product, new Date(crash.at.getTime() + 1))).toBe('OUT');
    }
    expect(crashes.map((crash) => crash.at.getTime())).toEqual([...crashes.map((crash) => crash.at.getTime())].sort((a, b) => a - b));
  });

  it('reads short supply only as it stands', () => {
    const at = new Date('2026-10-03T12:00:00Z');
    for (const short of shortSupplies(classicOgV14D, 'perk-seed', at)) {
      expect(supplyAt(classicOgV14D, 'perk-seed', short.city, short.product, at)).toBe(short.supply);
    }
  });
});

describe('1.4.0-E Inner Circle lock', () => {
  const ic = classicOgV14E.factionStanding.tiers.innerCircle;

  it('locks a faction once a rival is at Inner Circle, never before, and only from E', () => {
    expect(innerCircleLockedBy(classicOgV14E, { KINGS: ic - 1 }, 'OUTFIT')).toBeNull();
    expect(innerCircleLockedBy(classicOgV14E, { KINGS: ic }, 'OUTFIT')).toBe('KINGS');
    expect(innerCircleLockedBy(classicOgV14E, { CIVIC_HANDSHAKE: ic }, 'ROAD_SAINTS')).toBe('CIVIC_HANDSHAKE');
    expect(innerCircleLockedBy(classicOgV14E, { CIVIC_HANDSHAKE: ic }, 'CARTEL_LINE')).toBe('CIVIC_HANDSHAKE');
    expect(innerCircleLockedBy(classicOgV14E, { ROAD_SAINTS: ic }, 'CARTEL_LINE')).toBeNull();
    expect(innerCircleLockedBy(classicOgV14D, { KINGS: ic }, 'OUTFIT')).toBeNull();
  });

  it('caps a locked faction one point short, and never takes standing away', () => {
    expect(standingCap(classicOgV14E, { KINGS: ic }, 'OUTFIT')).toBe(ic - 1);
    expect(standingCap(classicOgV14E, { KINGS: ic, OUTFIT: 120 }, 'OUTFIT')).toBe(ic - 1);
    expect(standingCap(classicOgV14E, {}, 'OUTFIT')).toBe(classicOgV14E.factionStanding.max);
  });

  it('previews the lock on the step that reaches Inner Circle, and only that step', () => {
    expect(innerCirclePreview(classicOgV14E, { KINGS: ic - 10 }, 'KINGS', 10)).toEqual({ locks: ['OUTFIT'], lockedBy: null });
    expect(innerCirclePreview(classicOgV14E, { KINGS: ic - 10 }, 'KINGS', 9)).toEqual({ locks: [], lockedBy: null });
    expect(innerCirclePreview(classicOgV14E, { KINGS: ic }, 'KINGS', 10)).toEqual({ locks: [], lockedBy: null });
    expect(innerCirclePreview(classicOgV14E, { CIVIC_HANDSHAKE: ic - 1 }, 'CIVIC_HANDSHAKE', 5)).toEqual({ locks: ['ROAD_SAINTS', 'CARTEL_LINE'], lockedBy: null });
    expect(innerCirclePreview(classicOgV14E, { KINGS: ic, OUTFIT: ic - 3 }, 'OUTFIT', 5)).toEqual({ locks: [], lockedBy: 'KINGS' });
    expect(innerCirclePreview(classicOgV14D, { KINGS: ic - 10 }, 'KINGS', 10)).toEqual({ locks: [], lockedBy: null });
  });

  it('always leaves some faction whose Inner Circle is open, whatever has been reached', () => {
    const keys = Object.keys(classicOgV14E.factions) as FactionKey[];
    for (let mask = 0; mask < 1 << keys.length; mask++) {
      const points = Object.fromEntries(keys.map((key, index) => [key, mask & (1 << index) ? ic : 0])) as Partial<Record<FactionKey, number>>;
      // Only states the lock allows: two rivals never both at Inner Circle.
      if (keys.some((key) => (points[key] ?? 0) >= ic && innerCircleLockedBy(classicOgV14E, points, key))) continue;
      const open = keys.filter((key) => (points[key] ?? 0) >= ic || standingCap(classicOgV14E, points, key) >= ic);
      expect(open.length, JSON.stringify(points)).toBeGreaterThan(0);
    }
  });
});
