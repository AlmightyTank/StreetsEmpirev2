import { describe, expect, it } from 'vitest';
import { evaluatePokerHand, type PokerCard } from '../calculations/poker.js';
import { choosePokerBotAction, createPokerDeck, dealPokerHoleCards, revealPokerStreet, settlePokerPots, shufflePokerDeck } from '../calculations/poker-table.js';

const c = (rank: number, suit: PokerCard['suit'] = 'S'): PokerCard => ({ rank, suit });
const hand = (...cards: PokerCard[]) => evaluatePokerHand(cards);

describe('Texas Hold’em table mechanics', () => {
  it('builds a unique 52-card deck and shuffles it with injected randomness', () => {
    const deck = createPokerDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => card.rank + card.suit)).size).toBe(52);
    let seed = 0;
    const shuffled = shufflePokerDeck(() => ((seed++ * 37) % 53) / 53);
    expect(shuffled).toHaveLength(52);
    expect(new Set(shuffled.map((card) => card.rank + card.suit)).size).toBe(52);
    expect(shuffled).not.toEqual(deck);
    expect(() => shufflePokerDeck(() => 1)).toThrow(RangeError);
  });

  it('deals clockwise from the dealer and reveals streets with burn cards', () => {
    const deck = createPokerDeck();
    const dealt = dealPokerHoleCards(deck, ['human', 'bot-a', 'bot-b'], 0);
    expect(dealt.holeCards['bot-a']).toEqual([deck[0], deck[3]]);
    expect(dealt.holeCards['bot-b']).toEqual([deck[1], deck[4]]);
    expect(dealt.holeCards.human).toEqual([deck[2], deck[5]]);
    const flop = revealPokerStreet(dealt.deck, [], 3);
    expect(flop.communityCards).toEqual(dealt.deck.slice(1, 4));
    const turn = revealPokerStreet(flop.deck, flop.communityCards, 1);
    const river = revealPokerStreet(turn.deck, turn.communityCards, 1);
    expect(river.communityCards).toHaveLength(5);
    expect(() => revealPokerStreet(river.deck, river.communityCards, 1)).toThrow(RangeError);
  });

  it('awards main and side pots only to seats eligible for each pot', () => {
    const awards = settlePokerPots(
      [
        { id: 'short', contribution: 10, folded: false },
        { id: 'mid', contribution: 20, folded: false },
        { id: 'deep', contribution: 20, folded: false },
      ],
      {
        short: hand(c(9), c(9, 'D'), c(9, 'H'), c(4), c(4, 'D')),
        mid: hand(c(14), c(14, 'D'), c(8), c(6, 'H'), c(3, 'D')),
        deep: hand(c(5), c(6, 'D'), c(7, 'H'), c(8, 'C'), c(9, 'D')),
      },
    );
    expect(awards).toEqual([
      { id: 'short', amount: 30 },
      { id: 'mid', amount: 0 },
      { id: 'deep', amount: 20 },
    ]);
  });

  it('splits tied pots and assigns odd chips deterministically', () => {
    const tie = hand(c(14), c(14, 'D'), c(9), c(7, 'H'), c(5, 'D'));
    const weaker = hand(c(13), c(13, 'D'), c(9), c(7, 'H'), c(5, 'D'));
    expect(settlePokerPots(
      [
        { id: 'one', contribution: 5, folded: false },
        { id: 'two', contribution: 5, folded: false },
        { id: 'three', contribution: 5, folded: false },
      ],
      { one: tie, two: tie, three: weaker },
      'two',
    )).toEqual([
      { id: 'one', amount: 7 },
      { id: 'two', amount: 8 },
      { id: 'three', amount: 0 },
    ]);
  });

  it('takes capped rake from flopped pots while leaving preflop pots untouched', () => {
    const winner = hand(c(14), c(14, 'D'), c(14, 'H'), c(9), c(9, 'D'));
    const loser = hand(c(13), c(13, 'D'), c(8), c(6, 'H'), c(3, 'D'));
    const seats = [{ id: 'a', contribution: 10_000, folded: false }, { id: 'b', contribution: 10_000, folded: false }];
    expect(settlePokerPots(seats, { a: winner, b: loser }, undefined, 500)).toEqual([{ id: 'a', amount: 19_500 }, { id: 'b', amount: 0 }]);
    expect(settlePokerPots(seats, { a: winner, b: loser })).toEqual([{ id: 'a', amount: 20_000 }, { id: 'b', amount: 0 }]);
  });

  it('keeps the bot policy on public board cards and makes sensible strong and weak calls', () => {
    const board = [c(10), c(11), c(12)];
    expect(choosePokerBotAction({
      holeCards: [c(13), c(14)], communityCards: board, amountToCall: 0, canRaise: true, rng: () => 0.5,
    })).toBe('RAISE');
    expect(choosePokerBotAction({
      holeCards: [c(2), c(7, 'D')], communityCards: [], amountToCall: 10, canRaise: true, rng: () => 0,
    })).toBe('FOLD');
  });

  it('weighs a postflop bet in cents against the pot instead of folding everything below a full house', () => {
    const board = [c(14, 'D'), c(9, 'C'), c(4, 'H')];
    const facing = { communityCards: board, amountToCall: 200, potCents: 450, canRaise: false, rng: () => 0.5 };
    expect(choosePokerBotAction({ ...facing, holeCards: [c(14), c(12, 'C')] })).toBe('CALL');
    expect(choosePokerBotAction({ ...facing, holeCards: [c(9), c(4)] })).toBe('CALL');
    expect(choosePokerBotAction({ ...facing, holeCards: [c(2), c(3, 'C')] })).toBe('FOLD');
    expect(choosePokerBotAction({ ...facing, holeCards: [c(13), c(12, 'C')] })).toBe('FOLD');
    // A tiny bet into a big pot is cheap enough to call with a weak pair.
    expect(choosePokerBotAction({ ...facing, holeCards: [c(2), c(2, 'C')], amountToCall: 50, potCents: 5_000 })).toBe('CALL');
  });
});
