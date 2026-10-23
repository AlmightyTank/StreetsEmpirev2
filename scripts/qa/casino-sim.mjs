import { classicOgV12E2 } from '@streets/rulesets';
import {
  blackjackDealerShouldHit,
  blackjackHandOutcome,
  blackjackHandValue,
  blackjackReturnCents,
  buildBlackjackShoe,
  comparePokerHands,
  evaluatePokerHand,
  horseRaceOrder,
  horseReturnCents,
  poolBreak,
  poolPlayerShot,
  poolReturnBps,
  resolveRouletteSpin,
  roulettePockets,
  seededRng,
  scratchPrizeMultiplier,
} from '@streets/rules-engine';

const samples = Number(process.env.CASINO_SIM_SAMPLES ?? 100_000);
if (!Number.isSafeInteger(samples) || samples < 1_000) throw new Error('CASINO_SIM_SAMPLES must be at least 1000.');
const failures = [];
const assertBand = (label, observed, expected, tolerance) => {
  if (Math.abs(observed - expected) > tolerance) failures.push(`${label}: observed ${(observed * 100).toFixed(2)}%, expected ${(expected * 100).toFixed(2)}% ± ${(tolerance * 100).toFixed(2)}pp`);
};

console.log(`Casino Monte Carlo: ${samples.toLocaleString('en-US')} seeded trials per game family`);

const rouletteVariants = [...new Map(classicOgV12E2.casino.roulette.tables.map((row) => [row.wheel, row])).values()];
for (const table of rouletteVariants) {
  const rng = seededRng(80_000 + roulettePockets(table.wheel).length);
  let returned = 0n;
  for (let i = 0; i < samples; i++) {
    returned += resolveRouletteSpin(table, [{ kind: 'RED', selection: 'RED', amountCents: 100n }], rng).returnCents;
  }
  const observed = Number(returned) / (samples * 100);
  const expected = 36 / roulettePockets(table.wheel).length;
  console.log(`Roulette ${table.wheel}: RTP ${(observed * 100).toFixed(2)}% (theoretical ${(expected * 100).toFixed(2)}%)`);
  assertBand(`Roulette ${table.wheel}`, observed, expected, 0.012);
}

{
  const rules = classicOgV12E2.casino.scratchCards;
  const rng = seededRng(80_021);
  let returned = 0;
  for (let i = 0; i < samples; i++) returned += scratchPrizeMultiplier(rules, rng);
  const observed = returned / samples;
  const totalWeight = rules.payoutTiers.reduce((sum, tier) => sum + tier.weight, 0);
  const expected = rules.payoutTiers.reduce((sum, tier) => sum + tier.multiplier * tier.weight, 0) / totalWeight;
  console.log(`Scratch Cards: RTP ${(observed * 100).toFixed(2)}% (theoretical ${(expected * 100).toFixed(2)}%)`);
  assertBand('Scratch Cards', observed, expected, 0.02);
}

{
  const rules = classicOgV12E2.casino.horseRacing;
  const rng = seededRng(80_022);
  const wager = 100n;
  for (const horse of rules.horses) {
    let returned = 0n;
    for (let i = 0; i < samples; i++) returned += horseReturnCents(wager, horse.returnBps, horseRaceOrder(rules, rng)[0] === horse.key);
    const observed = Number(returned) / (samples * Number(wager));
    const inverseTotal = rules.horses.reduce((sum, runner) => sum + 1 / runner.returnBps, 0);
    const expected = 1 / inverseTotal / 10_000;
    console.log(`Horse Racing ${horse.name}: RTP ${(observed * 100).toFixed(2)}% (theoretical ${(expected * 100).toFixed(2)}%)`);
    assertBand(`Horse Racing ${horse.name}`, observed, expected, 0.025);
  }
}

const blackjackVariants = [...new Map(classicOgV12E2.casino.blackjack.tables.map((row) => [
  `${row.decks}:${row.dealerHitsSoft17}:${row.blackjackPayout.numerator}/${row.blackjackPayout.denominator}`,
  row,
])).values()];
for (const table of blackjackVariants) {
  const handCount = Math.min(samples, 50_000);
  const rng = seededRng(81_000 + (table.dealerHitsSoft17 ? 17 : 0) + table.decks);
  const wager = BigInt(table.minBetCents);
  let returned = 0n;
  for (let i = 0; i < handCount; i++) {
    const shoe = buildBlackjackShoe(table.decks, rng);
    const player = [shoe.pop(), shoe.pop()];
    const dealer = [shoe.pop(), shoe.pop()];
    const naturalEligible = blackjackHandValue(player).blackjack;
    while (!blackjackHandValue(player).bust && blackjackHandValue(player).total < 17) player.push(shoe.pop());
    while (blackjackDealerShouldHit(dealer, table.dealerHitsSoft17)) dealer.push(shoe.pop());
    const outcome = blackjackHandOutcome(player, dealer, naturalEligible);
    returned += blackjackReturnCents(wager, outcome, table);
  }
  const observed = Number(returned) / (handCount * Number(wager));
  console.log(`Blackjack ${table.key} (hit below 17): RTP ${(observed * 100).toFixed(2)}% over ${handCount.toLocaleString('en-US')} hands`);
  if (observed < 0.72 || observed > 1.12) failures.push(`Blackjack ${table.key}: sanity band failed at ${(observed * 100).toFixed(2)}%`);
}

{
  const rng = seededRng(82_100);
  const deck = [];
  for (const suit of ['C', 'D', 'H', 'S']) for (let rank = 2; rank <= 14; rank++) deck.push({ rank, suit });
  let wins = 0;
  let losses = 0;
  let ties = 0;
  const handCount = Math.min(samples, 100_000);
  for (let trial = 0; trial < handCount; trial++) {
    const cards = [...deck];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    const board = cards.slice(4, 9);
    const first = evaluatePokerHand([...cards.slice(0, 2), ...board]);
    const second = evaluatePokerHand([...cards.slice(2, 4), ...board]);
    const result = comparePokerHands(first, second);
    if (result > 0) wins++;
    else if (result < 0) losses++;
    else ties++;
  }
  const observed = wins / (wins + losses);
  console.log(`Texas Hold’em random-vs-random equity: ${(observed * 100).toFixed(2)}% wins excluding ${ties.toLocaleString('en-US')} ties`);
  assertBand('Texas Hold’em equity', observed, 0.5, 0.012);
}

{
  // Near-optimal play (the value-iteration policy): Safety once the hustler is on
  // the 8, Power with ball in hand while behind, Steady otherwise. Must stay a loss.
  for (const table of classicOgV12E2.casino.pool.tables) {
    const rules = classicOgV12E2.casino.pool;
    const rng = seededRng(91_000 + table.minBetCents);
    let returnedBps = 0;
    for (let rack = 0; rack < samples; rack++) {
      const state = poolBreak(rules, table, rng);
      while (state.status === 'ACTIVE') {
        const shot = state.hustlerBalls.length === 0 && state.playerBalls.length >= 1 && !state.ballInHand
          ? 'SAFETY'
          : state.ballInHand && state.playerBalls.length >= 2 && state.playerBalls.length > state.hustlerBalls.length
            ? 'POWER'
            : 'STEADY';
        poolPlayerShot(rules, table, state, shot, rng);
      }
      returnedBps += poolReturnBps(table, state);
    }
    const observed = returnedBps / samples / 10_000;
    console.log(`Pool ${table.key} vs ${table.hustler.name}: RTP ${(observed * 100).toFixed(2)}% with near-optimal shots`);
    if (observed < 0.85 || observed > 0.975) failures.push(`Pool ${table.key}: RTP band failed at ${(observed * 100).toFixed(2)}%`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exitCode = 1;
} else console.log('Casino simulation gates passed.');
