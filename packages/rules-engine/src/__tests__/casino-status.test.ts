import { describe, expect, it } from 'vitest';
import {
  classicOgV12D,
  classicOgV12E,
  classicOgV12E2,
  type CasinoBlackjackTableRules,
  type CasinoRouletteTableRules,
  type CasinoStreetDiceTableRules,
  type Ruleset,
} from '@streets/rulesets';
import {
  blackjackRatingEdgeBps,
  casinoBasisToCents,
  casinoCompRateBps,
  casinoCompsCoverHotel,
  casinoMaxBankrollCents,
  casinoStatusTier,
  casinoVipAccess,
  effectiveSlotRtpBps,
  loadRuleset,
  rateCasinoHouseTake,
  rateCasinoWager,
  resolveRouletteSpin,
  rouletteRatingEdgeBps,
  seededRng,
  slotRatingEdgeBps,
  streetDiceRatingEdgeBps,
} from '../index.js';

const casino = classicOgV12E2.casino;
const status = casino.status;

function blackjack(key: string): CasinoBlackjackTableRules {
  return casino.blackjack.tables.find((table) => table.key === key)!;
}
function roulette(key: string): CasinoRouletteTableRules {
  return casino.roulette.tables.find((table) => table.key === key)!;
}
function dice(key: string): CasinoStreetDiceTableRules {
  return casino.streetDice.tables.find((table) => table.key === key)!;
}

/** Everything that decides an outcome or a payout, without the posted limits. */
function blackjackRules(table: CasinoBlackjackTableRules) {
  const { decks, reshuffleAtRemainingCards, dealerHitsSoft17, blackjackPayout, allowDoubleAfterSplit, maxSplitHands, splitAcesOneCard } = table;
  return { decks, reshuffleAtRemainingCards, dealerHitsSoft17, blackjackPayout, allowDoubleAfterSplit, maxSplitHands, splitAcesOneCard };
}

describe('1.2.0-E rulesets', () => {
  it('pins a new ruleset and leaves every older casino ruleset without status', () => {
    expect(loadRuleset('classic-og-v1.2-e2', '1.2.0-E2')).toBe(classicOgV12E2);
    expect((classicOgV12D as Ruleset).casino?.status).toBeUndefined();
    expect((classicOgV12E as Ruleset).casino?.status).toBeUndefined();
    for (const table of [...classicOgV12E.casino.blackjack.tables, ...classicOgV12E.casino.roulette.tables, ...classicOgV12E.casino.streetDice.tables]) {
      expect((table as { room?: string }).room).toBeUndefined();
    }
  });

  it('keeps every earlier game untouched, so slot RTP and poker are the same objects', () => {
    expect(casino.slots).toBe(classicOgV12E.casino.slots);
    expect(casino.poker).toBe(classicOgV12E.casino.poker);
    for (const table of classicOgV12E.casino.blackjack.tables) expect(blackjack(table.key)).toBe(table);
    for (const table of classicOgV12E.casino.roulette.tables) expect(roulette(table.key)).toBe(table);
    for (const table of classicOgV12E.casino.streetDice.tables) expect(dice(table.key)).toBe(table);
  });

  it('gives every venue an identity and a VIP room without changing its floor', () => {
    for (const [slug, venue] of Object.entries(casino.venues)) {
      const before = classicOgV12E.casino.venues[slug as keyof typeof classicOgV12E.casino.venues];
      expect(venue.name).toBe(before.name);
      expect(venue.kind).toBe(before.kind);
      expect(venue.identity?.tagline.length).toBeGreaterThan(0);
      expect(venue.vipRoom?.name.length).toBeGreaterThan(0);
    }
    expect(casino.venues['las-vegas'].vipRoom?.minTier).toBe('HIGH_ROLLER');
    expect(casino.venues['las-vegas'].vipRoom?.visitorMinBodyguards).toBeGreaterThan(0);
  });

  it('VIP tables copy the exact outcome rules of their floor table and only raise limits', () => {
    expect(blackjackRules(blackjack('SALON_BLACKJACK'))).toEqual(blackjackRules(blackjack('STREET_BLACKJACK')));
    expect(blackjackRules(blackjack('BLACK_ROOM_BLACKJACK'))).toEqual(blackjackRules(blackjack('EMPIRE_HIGH_LIMIT')));
    expect(roulette('SALON_ROULETTE').wheel).toBe(roulette('EURO_ROULETTE').wheel);
    expect(roulette('BLACK_ROOM_ROULETTE').wheel).toBe(roulette('EMPIRE_ROULETTE').wheel);
    expect(dice('PRIVATE_DICE').maxOddsMultiple).toBe(dice('BACK_ROOM_DICE').maxOddsMultiple);
    expect(blackjack('SALON_BLACKJACK').maxBetCents).toBeGreaterThan(blackjack('STREET_BLACKJACK').maxBetCents);
    expect(blackjack('BLACK_ROOM_BLACKJACK').maxBetCents).toBeGreaterThan(blackjack('EMPIRE_HIGH_LIMIT').maxBetCents);
    for (const table of [...casino.blackjack.tables, ...casino.roulette.tables, ...casino.streetDice.tables]) {
      const isVip = (table as { room?: string }).room === 'VIP';
      expect(isVip).toBe(['SALON_BLACKJACK', 'BLACK_ROOM_BLACKJACK', 'SALON_ROULETTE', 'BLACK_ROOM_ROULETTE', 'PRIVATE_DICE'].includes(table.key));
    }
  });

  it('a VIP wheel lands the same pocket and pays the same multiple as its floor wheel', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const bets = [
        { kind: 'STRAIGHT' as const, selection: '17', amountCents: 100_000n },
        { kind: 'RED' as const, selection: 'RED', amountCents: 100_000n },
      ];
      const floor = resolveRouletteSpin(roulette('EURO_ROULETTE'), bets, seededRng(seed));
      const vip = resolveRouletteSpin(roulette('SALON_ROULETTE'), bets, seededRng(seed));
      expect(vip.pocket).toBe(floor.pocket);
      expect(vip.returnCents).toBe(floor.returnCents);
    }
  });

  it('keeps tier ceilings inside the cage and the walk-in ceiling on the posted session limit', () => {
    expect(status.tiers[0]!.minTheoCents).toBe(0);
    expect(status.tiers[0]!.maxBankrollCents).toBe(casino.session.maxBankrollCents);
    for (let index = 1; index < status.tiers.length; index++) {
      expect(status.tiers[index]!.minTheoCents).toBeGreaterThan(status.tiers[index - 1]!.minTheoCents);
      expect(status.tiers[index]!.compRateBps).toBeGreaterThanOrEqual(status.tiers[index - 1]!.compRateBps);
      expect(status.tiers[index]!.maxBankrollCents).toBeGreaterThanOrEqual(status.tiers[index - 1]!.maxBankrollCents);
    }
    const top = status.tiers[status.tiers.length - 1]!;
    expect(top.compRateBps + (status.casinoFront?.compBonusBps ?? 0)).toBeLessThan(5_000);
  });
});

describe('1.2.0-E rated play', () => {
  it('rates by posted theo, never by result, and rates true odds at zero', () => {
    const line = rateCasinoWager(status, { wagerCents: 100_000n, edgeBps: streetDiceRatingEdgeBps(status, 'LINE'), theoBeforeCents: 0n });
    const odds = rateCasinoWager(status, { wagerCents: 500_000n, edgeBps: streetDiceRatingEdgeBps(status, 'ODDS'), theoBeforeCents: 0n });
    expect(casinoBasisToCents(line.theoBasis)).toBe(1_410n);
    expect(odds).toEqual({ theoBasis: 0n, compBasis: 0n });
  });

  it('uses each table\'s pinned edge', () => {
    expect(blackjackRatingEdgeBps(status, blackjack('STREET_BLACKJACK'))).toBe(status.ratingEdgeBps.blackjackStandsSoft17);
    expect(blackjackRatingEdgeBps(status, blackjack('EMPIRE_HIGH_LIMIT'))).toBe(status.ratingEdgeBps.blackjackHitsSoft17);
    expect(rouletteRatingEdgeBps(status, roulette('STREET_ROULETTE'))).toBe(status.ratingEdgeBps.rouletteAmerican);
    expect(rouletteRatingEdgeBps(status, roulette('EURO_ROULETTE'))).toBe(status.ratingEdgeBps.rouletteEuropean);
    const machine = casino.slots.machines[0]!;
    expect(slotRatingEdgeBps(machine, machine.minBetPerLineCents)).toBe(10_000 - effectiveSlotRtpBps(machine, machine.minBetPerLineCents));
  });

  it('keeps fractional theo in the basis so small wagers add up exactly', () => {
    let basis = 0n;
    for (let hand = 0; hand < 1_000; hand++) {
      basis += rateCasinoWager(status, { wagerCents: 1_000n, edgeBps: 50, theoBeforeCents: 0n }).theoBasis;
    }
    // 1,000 hands x $10 x 0.50% = $50.00 of theo, even though each hand is only 5 cents.
    expect(casinoBasisToCents(basis)).toBe(5_000n);
  });

  it('climbs the ladder at the pinned thresholds', () => {
    expect(casinoStatusTier(status, 0n).tier.key).toBe('WALK_IN');
    expect(casinoStatusTier(status, 24_999n).tier.key).toBe('WALK_IN');
    expect(casinoStatusTier(status, 25_000n).tier.key).toBe('REGULAR');
    expect(casinoStatusTier(status, 2_500_000n).tier.key).toBe('HIGH_ROLLER');
    const top = casinoStatusTier(status, 999_000_000n);
    expect(top.tier.key).toBe('WHALE');
    expect(top.next).toBeNull();
    expect(top.progressBps).toBe(10_000);
    expect(casinoStatusTier(status, 137_500n).progressBps).toBe(5_000);
  });

  it('pays comps as a share of theo at the tier held before the wager, always below theo', () => {
    const walkIn = rateCasinoWager(status, { wagerCents: 1_000_000n, edgeBps: 526, theoBeforeCents: 0n });
    expect(walkIn.compBasis).toBe(0n);
    const regular = rateCasinoWager(status, { wagerCents: 1_000_000n, edgeBps: 526, theoBeforeCents: 25_000n });
    expect(regular.compBasis * 10n).toBe(regular.theoBasis);
    const fronted = rateCasinoWager(status, { wagerCents: 1_000_000n, edgeBps: 526, theoBeforeCents: 999_000_000n, compBonusBps: 500 });
    expect(fronted.compBasis).toBeLessThan(fronted.theoBasis);
    expect(casinoCompRateBps(status, 0n, 1_000_000)).toBeLessThan(10_000);
  });

  it('rates poker rake one-for-one as house take', () => {
    expect(casinoBasisToCents(rateCasinoHouseTake(status, { takeCents: 500n, theoBeforeCents: 0n }).theoBasis)).toBe(500n);
  });

  it('raises the session ceiling with status only on rulesets that ship status', () => {
    expect(casinoMaxBankrollCents(casino, 0n)).toBe(casino.session.maxBankrollCents);
    expect(casinoMaxBankrollCents(casino, 999_000_000n)).toBe(status.tiers[status.tiers.length - 1]!.maxBankrollCents);
    expect(casinoMaxBankrollCents(classicOgV12E.casino, 999_000_000n)).toBe(classicOgV12E.casino.session.maxBankrollCents);
  });

  it('lets comps cover hotel nights only in casino cities on rulesets with status', () => {
    expect(casinoCompsCoverHotel(casino, 'las-vegas')).toBe(true);
    expect(casinoCompsCoverHotel(casino, 'nowhere')).toBe(false);
    expect(casinoCompsCoverHotel(classicOgV12E.casino, 'las-vegas')).toBe(false);
  });
});

describe('1.2.0-E VIP rooms', () => {
  const vegas = casino.venues['las-vegas'];
  const highRoller = 2_500_000n;

  it('admits by status, with respect required from visitors', () => {
    expect(casinoVipAccess(status, { venue: vegas, theoCents: 0n, frontLevel: 0, visiting: false, companions: 0 }).allowed).toBe(false);
    expect(casinoVipAccess(status, { venue: vegas, theoCents: highRoller, frontLevel: 0, visiting: false, companions: 0 })).toEqual({ allowed: true, via: 'STATUS', reason: null });
    const unescorted = casinoVipAccess(status, { venue: vegas, theoCents: highRoller, frontLevel: 0, visiting: true, companions: 1 });
    expect(unescorted.allowed).toBe(false);
    expect(unescorted.reason).toContain('2 bodyguards');
    expect(casinoVipAccess(status, { venue: vegas, theoCents: highRoller, frontLevel: 0, visiting: true, companions: 2 }).allowed).toBe(true);
  });

  it('opens the door to the owner of an operating Casino Front in that city', () => {
    expect(casinoVipAccess(status, { venue: vegas, theoCents: 0n, frontLevel: 1, visiting: true, companions: 0 })).toEqual({ allowed: true, via: 'FRONT', reason: null });
    expect(casinoVipAccess(status, { venue: vegas, theoCents: 0n, frontLevel: 0, visiting: true, companions: 0 }).reason).toContain('Casino Front');
  });

  it('has no VIP room on rulesets without status', () => {
    const before = classicOgV12E.casino.venues['las-vegas'];
    expect(casinoVipAccess(undefined, { venue: before, theoCents: highRoller, frontLevel: 5, visiting: false, companions: 9 }).allowed).toBe(false);
  });
});
