/** Server agnostic Texas Hold'em card evaluation primitives. */
export type PokerSuit = 'C' | 'D' | 'H' | 'S';
export interface PokerCard { readonly rank: number; readonly suit: PokerSuit }

export type PokerHandCategory =
  | 'HIGH_CARD' | 'PAIR' | 'TWO_PAIR' | 'THREE_OF_A_KIND'
  | 'STRAIGHT' | 'FLUSH' | 'FULL_HOUSE' | 'FOUR_OF_A_KIND' | 'STRAIGHT_FLUSH';

export interface PokerHandValue {
  readonly category: PokerHandCategory;
  /** Category first, then kickers in comparison order. */
  readonly score: readonly number[];
}

const categoryRank: Record<PokerHandCategory, number> = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, THREE_OF_A_KIND: 3,
  STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, FOUR_OF_A_KIND: 7, STRAIGHT_FLUSH: 8,
};

function straightHigh(ranks: readonly number[]): number | null {
  const unique = [...new Set(ranks)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1); // ace-low wheel
  for (let i = 0; i <= unique.length - 5; i += 1) {
    if (unique[i]! - unique[i + 4]! === 4) return unique[i]!;
  }
  return null;
}

function descendingCounts(ranks: readonly number[]): Array<[number, number]> {
  const counts = new Map<number, number>();
  for (const rank of ranks) counts.set(rank, (counts.get(rank) ?? 0) + 1);
  return [...counts].map(([rank, count]) => [count, rank] as [number, number]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
}

/** Evaluate the best five-card hand from 5–7 cards, including all tie breakers. */
export function evaluatePokerHand(cards: readonly PokerCard[]): PokerHandValue {
  if (cards.length < 5 || cards.length > 7) throw new RangeError('Hold’em evaluation needs 5–7 cards.');
  if (cards.some(({ rank }) => !Number.isInteger(rank) || rank < 2 || rank > 14)) throw new RangeError('Card ranks must be 2–14.');
  const ranks = cards.map((card) => card.rank);
  const groups = descendingCounts(ranks);
  const flushSuit = (['C', 'D', 'H', 'S'] as const).find((suit) => cards.filter((card) => card.suit === suit).length >= 5);
  const flushRanks = flushSuit ? cards.filter((card) => card.suit === flushSuit).map((card) => card.rank) : [];
  const straightFlush = flushSuit ? straightHigh(flushRanks) : null;
  let category: PokerHandCategory;
  let kickers: number[];
  if (straightFlush) { category = 'STRAIGHT_FLUSH'; kickers = [straightFlush]; }
  else if (groups[0]?.[0] === 4) { category = 'FOUR_OF_A_KIND'; kickers = [groups[0][1], ...ranks.filter((r) => r !== groups[0]![1]).sort((a, b) => b - a).slice(0, 1)]; }
  else if (groups[0]?.[0] === 3 && groups.some(([count]) => count === 2)) { category = 'FULL_HOUSE'; kickers = [groups[0][1], Math.max(...groups.filter(([count, rank]) => count >= 2 && rank !== groups[0]![1]).map(([, rank]) => rank))]; }
  else if (flushSuit) { category = 'FLUSH'; kickers = flushRanks.sort((a, b) => b - a).slice(0, 5); }
  else {
    const straight = straightHigh(ranks);
    if (straight) { category = 'STRAIGHT'; kickers = [straight]; }
    else if (groups[0]?.[0] === 3) { category = 'THREE_OF_A_KIND'; kickers = [groups[0][1], ...groups.filter(([count]) => count === 1).map(([, rank]) => rank).sort((a, b) => b - a).slice(0, 2)]; }
    else {
      const pairs = groups.filter(([count]) => count === 2).map(([, rank]) => rank);
      if (pairs.length >= 2) { category = 'TWO_PAIR'; kickers = [pairs[0]!, pairs[1]!, ...ranks.filter((r) => r !== pairs[0] && r !== pairs[1]).sort((a, b) => b - a).slice(0, 1)]; }
      else if (pairs.length === 1) { category = 'PAIR'; kickers = [pairs[0]!, ...groups.filter(([count]) => count === 1).map(([, rank]) => rank).sort((a, b) => b - a).slice(0, 3)]; }
      else { category = 'HIGH_CARD'; kickers = [...new Set(ranks)].sort((a, b) => b - a).slice(0, 5); }
    }
  }
  return { category, score: [categoryRank[category], ...kickers] };
}

/** Positive means a wins; zero means the hands tie. */
export function comparePokerHands(a: PokerHandValue, b: PokerHandValue): number {
  for (let i = 0; i < Math.max(a.score.length, b.score.length); i += 1) {
    const delta = (a.score[i] ?? 0) - (b.score[i] ?? 0);
    if (delta) return delta;
  }
  return 0;
}
