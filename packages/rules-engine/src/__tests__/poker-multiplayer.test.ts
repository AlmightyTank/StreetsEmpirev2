import { describe, expect, it } from 'vitest';
import { applyPokerTableAction, createPokerTableHand, pokerTableAmountToCall, pokerTablePot, type PokerBetAction } from '../calculations/poker-multiplayer.js';
import { seededRng } from '../rng.js';

const rng = () => 0;
const headsUp = (stacks = [1_000, 1_000]) => createPokerTableHand([
  { id: 'a', name: 'A', seatNo: 1, stackCents: stacks[0]! },
  { id: 'b', name: 'B', seatNo: 2, stackCents: stacks[1]! },
], 1, 50, 100, 200, rng);

describe('multiplayer Hold’em hand flow', () => {
  it('posts heads-up blinds and enforces turn order', () => {
    const state = headsUp();
    expect(state.turnSeatId).toBe('a');
    expect(pokerTablePot(state)).toBe(150);
    expect(pokerTableAmountToCall(state, 'a')).toBe(50);
    expect(() => applyPokerTableAction(state, 'b', 'CHECK')).toThrow('not your turn');
  });

  it('moves through betting streets only after everyone acts', () => {
    const state = headsUp();
    applyPokerTableAction(state, 'a', 'CALL');
    expect(state.turnSeatId).toBe('b');
    applyPokerTableAction(state, 'b', 'CHECK');
    expect(state.street).toBe('FLOP');
    expect(state.board).toHaveLength(3);
    expect(state.turnSeatId).toBe('b');
  });

  it('awards the pot immediately when everyone else folds', () => {
    const state = headsUp();
    applyPokerTableAction(state, 'a', 'FOLD');
    expect(state.street).toBe('SHOWDOWN');
    expect(state.outcome).toContain('B wins');
    expect(state.seats.find((seat) => seat.id === 'b')?.stackCents).toBe(1_050);
  });

  it('runs out the board and settles short all-ins without losing chips', () => {
    const state = headsUp([75, 1_000]);
    applyPokerTableAction(state, 'a', 'ALL_IN');
    expect(state.street).toBe('SHOWDOWN');
    expect(state.board).toHaveLength(5);
    expect(state.seats.reduce((sum, seat) => sum + seat.stackCents, 0)).toBe(1_075);
  });

  it('splits main and side pots by each all-in player’s eligible contribution', () => {
    const state = createPokerTableHand([
      { id: 'a', name: 'A', seatNo: 1, stackCents: 300 },
      { id: 'b', name: 'B', seatNo: 2, stackCents: 80 },
      { id: 'c', name: 'C', seatNo: 3, stackCents: 200 },
    ], 1, 50, 100, 200, rng);
    applyPokerTableAction(state, 'a', 'ALL_IN');
    applyPokerTableAction(state, 'b', 'ALL_IN');
    applyPokerTableAction(state, 'c', 'ALL_IN');
    expect(state.street).toBe('SHOWDOWN');
    expect(state.board).toHaveLength(5);
    expect(state.seats.reduce((sum, seat) => sum + seat.stackCents, 0)).toBe(580);
    expect(state.seats.some((seat) => seat.stackCents === 0)).toBe(true);
  });

  it('supports checks through the river and a showdown', () => {
    const state = headsUp();
    applyPokerTableAction(state, 'a', 'CALL'); applyPokerTableAction(state, 'b', 'CHECK');
    for (let street = 0; street < 3; street += 1) {
      applyPokerTableAction(state, 'b', 'CHECK');
      applyPokerTableAction(state, 'a', 'CHECK');
    }
    expect(state.street).toBe('SHOWDOWN');
    expect(state.board).toHaveLength(5);
    expect(state.seats.reduce((sum, seat) => sum + seat.stackCents, 0)).toBe(2_000);
  });

  it('charges capped rake only after a flop, and records it on showdown', () => {
    const preflop = createPokerTableHand([
      { id: 'a', name: 'A', seatNo: 1, stackCents: 1_000 },
      { id: 'b', name: 'B', seatNo: 2, stackCents: 1_000 },
    ], 1, 50, 100, 200, rng, 500, 500);
    applyPokerTableAction(preflop, 'a', 'FOLD');
    expect(preflop.rakeCents).toBe(0);

    const postflopFold = createPokerTableHand([
      { id: 'a', name: 'A', seatNo: 1, stackCents: 1_000 },
      { id: 'b', name: 'B', seatNo: 2, stackCents: 1_000 },
    ], 1, 50, 100, 200, rng, 500, 500);
    applyPokerTableAction(postflopFold, 'a', 'CALL');
    applyPokerTableAction(postflopFold, 'b', 'CHECK');
    applyPokerTableAction(postflopFold, 'b', 'FOLD');
    expect(postflopFold.rakeCents).toBe(10);

    const flopped = createPokerTableHand([
      { id: 'a', name: 'A', seatNo: 1, stackCents: 10_000 },
      { id: 'b', name: 'B', seatNo: 2, stackCents: 10_000 },
    ], 1, 50, 100, 200, rng, 500, 500);
    applyPokerTableAction(flopped, 'a', 'ALL_IN');
    applyPokerTableAction(flopped, 'b', 'CALL');
    expect(flopped.rakeCents).toBe(500);
    expect(flopped.seats.reduce((sum, seat) => sum + seat.stackCents, 0)).toBe(19_500);
  });

  it('always reaches a settled hand and never creates or loses chips across random legal play', () => {
    const actions: PokerBetAction[] = ['FOLD', 'CHECK', 'CALL', 'RAISE', 'ALL_IN'];
    for (let seed = 1; seed <= 1_500; seed += 1) {
      const random = seededRng(seed);
      const players = 2 + Math.floor(random() * 5);
      const seats = Array.from({ length: players }, (_, index) => ({
        id: 'p' + index, name: 'P' + index, seatNo: index + 1, stackCents: [30, 120, 1_000, 5_000][Math.floor(random() * 4)]!,
      }));
      const chips = seats.reduce((sum, seat) => sum + seat.stackCents, 0);
      let state = createPokerTableHand(seats, 1 + Math.floor(random() * players), 50, 100, 200, random, 500, 500);
      for (let step = 0; state.street !== 'SHOWDOWN'; step += 1) {
        expect(step).toBeLessThan(200);
        const actor = state.turnSeatId;
        expect(actor).not.toBeNull();
        const legal = actions.filter((action) => {
          try { applyPokerTableAction(structuredClone(state), actor!, action); return true; } catch { return false; }
        });
        expect(legal.length).toBeGreaterThan(0);
        const passive = legal.find((action) => action === 'CHECK' || action === 'CALL');
        state = applyPokerTableAction(state, actor!, passive && random() < 0.6 ? passive : legal[Math.floor(random() * legal.length)]!);
      }
      expect(state.seats.every((seat) => seat.stackCents >= 0)).toBe(true);
      expect(state.seats.reduce((sum, seat) => sum + seat.stackCents, 0) + state.rakeCents).toBe(chips);
    }
  }, 15_000);
});
