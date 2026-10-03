import type { CasinoBlackjackTableRules } from '@streets/rulesets';
import type { Rng } from '../rng.js';

export type BlackjackSuit = 'S' | 'H' | 'D' | 'C';
export type BlackjackRank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
export type BlackjackCard = `${BlackjackRank}${BlackjackSuit}`;

export interface BlackjackHandValue {
  total: number;
  soft: boolean;
  blackjack: boolean;
  bust: boolean;
}

export type BlackjackOutcome = 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE' | 'BUST';

const SUITS: readonly BlackjackSuit[] = ['S', 'H', 'D', 'C'];
const RANKS: readonly BlackjackRank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function normalizedRng(rng: Rng): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.9999999999999999, Math.max(0, value));
}

export function buildBlackjackShoe(decks: number, rng: Rng): BlackjackCard[] {
  if (!Number.isInteger(decks) || decks <= 0 || decks > 8) throw new Error('Blackjack shoe must use 1-8 decks.');
  const cards: BlackjackCard[] = [];
  for (let deck = 0; deck < decks; deck++) {
    for (const suit of SUITS) for (const rank of RANKS) cards.push(`${rank}${suit}` as BlackjackCard);
  }
  for (let index = cards.length - 1; index > 0; index--) {
    const swap = Math.floor(normalizedRng(rng) * (index + 1));
    [cards[index], cards[swap]] = [cards[swap]!, cards[index]!];
  }
  return cards;
}

export function blackjackRank(card: BlackjackCard): BlackjackRank {
  return card.slice(0, -1) as BlackjackRank;
}

export function blackjackCardLabel(card: BlackjackCard): string {
  const suit = card.at(-1);
  const glyph = suit === 'S' ? '♠' : suit === 'H' ? '♥' : suit === 'D' ? '♦' : '♣';
  return blackjackRank(card) + glyph;
}

export function blackjackHandValue(cards: readonly BlackjackCard[]): BlackjackHandValue {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    const rank = blackjackRank(card);
    if (rank === 'A') {
      total += 11;
      aces += 1;
    } else if (rank === 'K' || rank === 'Q' || rank === 'J') {
      total += 10;
    } else {
      total += Number(rank);
    }
  }
  let softAces = aces;
  while (total > 21 && softAces > 0) {
    total -= 10;
    softAces -= 1;
  }
  return {
    total,
    soft: softAces > 0,
    blackjack: cards.length === 2 && total === 21,
    bust: total > 21,
  };
}

export function blackjackCanSplit(cards: readonly BlackjackCard[]): boolean {
  if (cards.length !== 2) return false;
  return blackjackRank(cards[0]!) === blackjackRank(cards[1]!);
}

export function blackjackDealerShouldHit(cards: readonly BlackjackCard[], dealerHitsSoft17: boolean): boolean {
  const value = blackjackHandValue(cards);
  if (value.bust) return false;
  if (value.total < 17) return true;
  return value.total === 17 && value.soft && dealerHitsSoft17;
}

export function blackjackHandOutcome(
  playerCards: readonly BlackjackCard[],
  dealerCards: readonly BlackjackCard[],
  naturalEligible: boolean,
): BlackjackOutcome {
  const player = blackjackHandValue(playerCards);
  const dealer = blackjackHandValue(dealerCards);
  if (player.bust) return 'BUST';
  if (naturalEligible && player.blackjack && !dealer.blackjack) return 'BLACKJACK';
  if (dealer.blackjack && !(naturalEligible && player.blackjack)) return 'LOSE';
  if (dealer.bust) return 'WIN';
  if (player.total > dealer.total) return 'WIN';
  if (player.total < dealer.total) return 'LOSE';
  return 'PUSH';
}

/**
 * Total chips returned for one resolved hand, including the original wager.
 * BLACKJACK returns 5:2 for a 3:2 table, WIN 2:1, PUSH 1:1, losses zero.
 */
export function blackjackReturnCents(
  wagerCents: bigint,
  outcome: BlackjackOutcome,
  table: CasinoBlackjackTableRules,
): bigint {
  if (wagerCents < 0n) throw new Error('Blackjack wager cannot be negative.');
  if (outcome === 'PUSH') return wagerCents;
  if (outcome === 'WIN') return wagerCents * 2n;
  if (outcome === 'BLACKJACK') {
    return wagerCents + (wagerCents * BigInt(table.blackjackPayout.numerator)) / BigInt(table.blackjackPayout.denominator);
  }
  return 0n;
}
