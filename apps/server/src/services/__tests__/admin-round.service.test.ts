import { describe, expect, it } from 'vitest';
import { classicOgStreetPassA, type Ruleset } from '@streets/rulesets';
import { availableRoundActions, rulesetChangeWarnings, slugifyRoundName, startDecision, streetPassTiersProblem } from '../admin-round.service.js';

const round = (id: string, startsAt: string) => ({ id, name: `Round ${id}`, startsAt: new Date(startsAt) });

describe('availableRoundActions', () => {
  it('only offers moves the round lifecycle allows', () => {
    expect(availableRoundActions({ status: 'SCHEDULED' })).toEqual(['open-registration', 'start']);
    expect(availableRoundActions({ status: 'REGISTRATION' })).toEqual(['start', 'end-early']);
    expect(availableRoundActions({ status: 'ACTIVE' })).toEqual(['pause', 'end-early']);
    // 1.0.0-E: a paused season resumes instead.
    expect(availableRoundActions({ status: 'ACTIVE', pausedAt: new Date() })).toEqual(['resume', 'end-early']);
    expect(availableRoundActions({ status: 'ENDED' })).toEqual(['archive']);
    expect(availableRoundActions({ status: 'ARCHIVED' })).toEqual([]);
  });
});

describe('startDecision', () => {
  const next = round('next', '2026-10-01T00:00:00.000Z');

  it('starts freely when nothing else is live', () => {
    expect(startDecision(next, [], next.startsAt, false)).toEqual({ ok: true, supersedes: [] });
  });

  it('ignores the round being started', () => {
    expect(startDecision(next, [next], next.startsAt, false)).toEqual({ ok: true, supersedes: [] });
  });

  it('requires confirmation before handing off an older live round', () => {
    const live = [round('current', '2026-09-01T00:00:00.000Z')];
    expect(startDecision(next, live, next.startsAt, false)).toMatchObject({ ok: false, code: 'ROUND_HANDOFF_REQUIRED' });
    expect(startDecision(next, live, next.startsAt, true)).toEqual({ ok: true, supersedes: live });
  });

  it('refuses when a live round started at or after the new start, even with confirmation', () => {
    for (const startsAt of ['2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z']) {
      const live = [round('current', '2026-09-01T00:00:00.000Z'), round('newer', startsAt)];
      expect(startDecision(next, live, next.startsAt, true)).toMatchObject({ ok: false, code: 'ROUND_WOULD_BE_SUPERSEDED' });
    }
  });
});

describe('slugifyRoundName', () => {
  it('makes url-safe slugs from round names', () => {
    expect(slugifyRoundName('Game #010 - Admin Tools')).toBe('game-010-admin-tools');
    expect(slugifyRoundName('  ***  ')).toBe('');
  });
});

describe('rulesetChangeWarnings', () => {
  const from = classicOgStreetPassA;
  const pass = from.streetPass!;
  const tiers = pass.tiers.map((tier) => ({ tier: tier.tier, rewards: [{ kind: 'CASH' as const, amount: 100 }] }));
  const pinned = (extra: Partial<Parameters<typeof rulesetChangeWarnings>[0]> = {}) => ({
    name: 'Game #100',
    status: 'SCHEDULED' as const,
    rulesetId: from.meta.id,
    rulesetVersion: from.meta.version,
    streetPassOverride: null,
    ...extra,
  });
  const target = (changes: Partial<Ruleset> = {}): Ruleset => ({ ...from, meta: { ...from.meta, id: 'target', version: 'target-A' }, ...changes });
  const codes = (round: ReturnType<typeof pinned>, to: Ruleset) => rulesetChangeWarnings(round, to).map((warning) => warning.code);

  it('has nothing to confirm when a scheduled round moves to a ruleset with the same shape', () => {
    expect(codes(pinned(), target())).toEqual([]);
  });

  it('flags a live round', () => {
    expect(codes(pinned({ status: 'ACTIVE' }), target())).toEqual(['ROUND_LIVE']);
  });

  it('flags a round whose pinned ruleset the code no longer ships', () => {
    expect(codes(pinned({ rulesetVersion: 'street-pass-gone' }), target())).toEqual(['CURRENT_RULESET_MISSING']);
  });

  it('flags removed sections and removed catalog keys', () => {
    const { WEED: _weed, ...products } = from.products!;
    const warnings = rulesetChangeWarnings(pinned(), target({ turf: undefined, products: products as Ruleset['products'] }));
    expect(warnings.map((warning) => warning.code)).toEqual(['SECTIONS_REMOVED', 'KEYS_REMOVED']);
    expect(warnings[0]!.message).toContain('turf');
    expect(warnings[1]!.message).toContain('products: WEED is');
  });

  it('flags a new Street Pass track once players could have claimed on the old one', () => {
    const renamed = target({ streetPass: { ...pass, key: 'street-pass-s2' } });
    expect(codes(pinned(), renamed)).toEqual([]);
    expect(codes(pinned({ status: 'REGISTRATION' }), renamed)).toEqual(['STREET_PASS_TRACK_CHANGED']);
  });

  it('keeps Street Pass edits that fit the new track and drops ones that do not', () => {
    const edited = pinned({ streetPassOverride: { ...pass, tiers } });
    expect(codes(edited, target())).toEqual([]);
    expect(codes(edited, target({ streetPass: { ...pass, tiers: pass.tiers.slice(1) } }))).toEqual(['STREET_PASS_EDITS_DROPPED']);
    expect(codes(edited, target({ streetPass: undefined }))).toEqual(['SECTIONS_REMOVED', 'STREET_PASS_EDITS_DROPPED']);
  });
});

describe('streetPassTiersProblem', () => {
  const pass = classicOgStreetPassA.streetPass!;
  const tiers = pass.tiers.map((tier) => ({ tier: tier.tier, rewards: [{ kind: 'CASH' as const, amount: 100 }] }));

  it('accepts every tier with valid rewards', () => {
    expect(streetPassTiersProblem(classicOgStreetPassA, tiers)).toBeNull();
  });

  it('refuses missing tiers, bad amounts and keys the ruleset does not have', () => {
    expect(streetPassTiersProblem(classicOgStreetPassA, tiers.slice(1))).toMatch(/Keep every existing tier/);
    expect(streetPassTiersProblem(classicOgStreetPassA, [{ tier: 1, rewards: [{ kind: 'CASH', amount: 0 }] }, ...tiers.slice(1)])).toMatch(/positive whole/);
    expect(streetPassTiersProblem(classicOgStreetPassA, [{ tier: 1, rewards: [{ kind: 'PRODUCT', key: 'NOPE', amount: 1 }] }, ...tiers.slice(1)])).toMatch(/valid product/);
  });
});
