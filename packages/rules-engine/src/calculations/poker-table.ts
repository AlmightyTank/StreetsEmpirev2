import { comparePokerHands, evaluatePokerHand, type PokerCard } from './poker.js';
import type { Rng } from '../rng.js';

const SUITS = ['C', 'D', 'H', 'S'] as const;

export function createPokerDeck(): PokerCard[] {
  return SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, index) => ({ rank: index + 2, suit })));
}

/** Fisher–Yates shuffle. Production callers must pass a cryptographically secure RNG. */
export function shufflePokerDeck(rng: Rng): PokerCard[] {
  const deck = createPokerDeck();
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    if (!Number.isInteger(j) || j < 0 || j > i) throw new RangeError('Poker RNG must return a value in [0, 1).');
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

export interface DealtPokerHand {
  /** Keep this full server-side map private; API DTOs should expose only the viewer's cards. */
  readonly holeCards: Readonly<Record<string, readonly [PokerCard, PokerCard]>>;
  readonly deck: readonly PokerCard[];
}

/** Deal two private cards clockwise, beginning left of the dealer button. */
export function dealPokerHoleCards(deck: readonly PokerCard[], seatIds: readonly string[], dealerIndex: number): DealtPokerHand {
  if (seatIds.length < 2 || seatIds.length > 10 || new Set(seatIds).size !== seatIds.length || seatIds.some((id) => !id)) {
    throw new RangeError('A Hold’em hand needs 2–10 uniquely identified seats.');
  }
  if (!Number.isInteger(dealerIndex) || dealerIndex < 0 || dealerIndex >= seatIds.length) {
    throw new RangeError('Dealer index must identify a seat.');
  }
  if (deck.length < seatIds.length * 2) throw new RangeError('Not enough cards to deal hole cards.');
  const cards: Record<string, PokerCard[]> = Object.fromEntries(seatIds.map((id) => [id, []]));
  let cursor = 0;
  for (let card = 0; card < 2; card += 1) {
    for (let offset = 1; offset <= seatIds.length; offset += 1) {
      const id = seatIds[(dealerIndex + offset) % seatIds.length]!;
      cards[id]!.push(deck[cursor++]!);
    }
  }
  return {
    holeCards: Object.fromEntries(Object.entries(cards).map(([id, hand]) => [id, [hand[0]!, hand[1]!]])),
    deck: deck.slice(cursor),
  };
}

export interface RevealedPokerStreet {
  readonly communityCards: readonly PokerCard[];
  readonly deck: readonly PokerCard[];
}

/** Burn one card and reveal the flop (3), turn (1), or river (1). */
export function revealPokerStreet(
  deck: readonly PokerCard[],
  communityCards: readonly PokerCard[],
  count: 1 | 3,
): RevealedPokerStreet {
  if ((communityCards.length === 0 && count !== 3)
    || (communityCards.length === 3 && count !== 1)
    || (communityCards.length === 4 && count !== 1)
    || communityCards.length >= 5) {
    throw new RangeError('Poker streets must be revealed in flop, turn, river order.');
  }
  if (deck.length < count + 1) throw new RangeError('Not enough cards to reveal the next street.');
  return { communityCards: [...communityCards, ...deck.slice(1, count + 1)], deck: deck.slice(count + 1) };
}

export interface PokerPotSeat {
  readonly id: string;
  readonly contribution: number;
  readonly folded: boolean;
}

export interface PokerPotAward {
  readonly id: string;
  readonly amount: number;
}

/** Split main and side pots by contribution level; ties receive deterministic odd chips. */
export function settlePokerPots(
  seats: readonly PokerPotSeat[],
  values: Readonly<Record<string, ReturnType<typeof evaluatePokerHand>>>,
  firstOddChipId?: string,
  rakeCents = 0,
): PokerPotAward[] {
  if (seats.some((seat) => !Number.isSafeInteger(seat.contribution) || seat.contribution < 0)) {
    throw new RangeError('Poker contributions must be non-negative whole chips.');
  }
  if (!Number.isSafeInteger(rakeCents) || rakeCents < 0 || rakeCents > seats.reduce((sum, seat) => sum + seat.contribution, 0)) throw new RangeError('Poker rake must be a valid amount no greater than the pot.');
  const levels = [...new Set(seats.map((seat) => seat.contribution).filter((amount) => amount > 0))].sort((a, b) => a - b);
  const awards = new Map(seats.map(({ id }) => [id, 0]));
  let previous = 0;
  let rakeRemaining = rakeCents;
  for (const level of levels) {
    const contributors = seats.filter((seat) => seat.contribution >= level);
    const gross = (level - previous) * contributors.length;
    const rake = Math.min(rakeRemaining, gross);
    const amount = gross - rake;
    rakeRemaining -= rake;
    previous = level;
    const eligible = contributors.filter((seat) => !seat.folded && values[seat.id]);
    if (eligible.length === 0) throw new Error('A poker pot has no eligible player.');
    const best = eligible.reduce((winner, seat) => comparePokerHands(values[seat.id]!, values[winner.id]!) > 0 ? seat : winner);
    const winners = eligible.filter((seat) => comparePokerHands(values[seat.id]!, values[best.id]!) === 0);
    const share = Math.floor(amount / winners.length);
    let odd = amount - share * winners.length;
    const ordered = firstOddChipId
      ? [...winners].sort((a, b) => Number(b.id === firstOddChipId) - Number(a.id === firstOddChipId))
      : winners;
    for (const winner of ordered) {
      awards.set(winner.id, awards.get(winner.id)! + share + (odd-- > 0 ? 1 : 0));
    }
  }
  return [...awards].map(([id, amount]) => ({ id, amount }));
}

export type PokerBotAction = 'FOLD' | 'CHECK' | 'CALL' | 'RAISE';

export interface PokerBotContext {
  /** The bot's two private cards. */
  readonly holeCards: readonly [PokerCard, PokerCard];
  /** Only public community cards; never pass opponents' private cards. */
  readonly communityCards: readonly PokerCard[];
  readonly amountToCall: number;
  readonly canRaise: boolean;
  readonly rng: Rng;
  /** Chips already in the pot before this decision. Call pressure follows pot odds. */
  readonly potCents?: number;
}

/**
 * Made-hand strength on the same 0–1 scale as the preflop estimate, so one set
 * of fold/raise thresholds works on every street: high card folds to a bet,
 * small pairs usually fold, big pairs usually call, two pair or better calls.
 */
function postflopStrength(holeCards: readonly PokerCard[], communityCards: readonly PokerCard[]): number {
  const [category = 0, top = 2] = evaluatePokerHand([...holeCards, ...communityCards]).score;
  if (category === 0) return 0.12 + top / 140;
  if (category === 1) return 0.4 + top / 60;
  if (category === 2) return 0.7 + top / 200;
  if (category === 3) return 0.8;
  return 0.85 + (category - 4) * 0.04;
}

/** Modest, intentionally legible bot policy. It has no access to opponents' hole cards. */
export function choosePokerBotAction(context: PokerBotContext): PokerBotAction {
  const { holeCards, communityCards, amountToCall, canRaise, rng, potCents } = context;
  if (!Number.isSafeInteger(amountToCall) || amountToCall < 0) throw new RangeError('Call amount must be non-negative whole chips.');
  if (potCents !== undefined && (!Number.isSafeInteger(potCents) || potCents < 0)) throw new RangeError('Pot must be non-negative whole chips.');
  if (amountToCall === 0 && !canRaise) return 'CHECK';
  const random = rng();
  if (random < 0 || random >= 1) throw new RangeError('Poker RNG must return a value in [0, 1).');

  let strength: number;
  if (communityCards.length >= 3) {
    strength = postflopStrength(holeCards, communityCards);
  } else {
    const ranks = holeCards.map((card) => card.rank).sort((x, y) => y - x);
    const a = ranks[0]!;
    const b = ranks[1]!;
    const pairBonus = a === b ? 0.32 + a / 100 : 0;
    const suitedBonus = holeCards[0].suit === holeCards[1].suit ? 0.07 : 0;
    const connectorBonus = a - b <= 2 ? 0.04 : 0;
    strength = (a + b) / 30 + pairBonus + suitedBonus + connectorBonus;
  }

  // The share of the final pot this call would pay for. Without a pot, assume a pot-sized bet.
  const pot = potCents ?? amountToCall * 2;
  const pressure = amountToCall > 0 ? Math.min(0.3, amountToCall / Math.max(1, pot + amountToCall)) : 0;
  if (amountToCall > 0 && strength + random * 0.18 < 0.34 + pressure) return 'FOLD';
  if (canRaise && strength + random * 0.22 > 0.75) return 'RAISE';
  return amountToCall === 0 ? 'CHECK' : 'CALL';
}
