import { evaluatePokerHand, type PokerCard } from './poker.js';
import { dealPokerHoleCards, revealPokerStreet, settlePokerPots, shufflePokerDeck } from './poker-table.js';
import type { Rng } from '../rng.js';

export type PokerBetAction = 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN';
export interface PokerTableSeatInput { id: string; name: string; seatNo: number; stackCents: number; }
export interface PokerTableSeatState extends PokerTableSeatInput {
  hole: [PokerCard, PokerCard]; folded: boolean; contributionCents: number; streetBetCents: number;
}
export interface PokerTableHandState {
  deck: PokerCard[]; board: PokerCard[]; seats: PokerTableSeatState[];
  street: 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN';
  dealerSeatNo: number; smallBlindCents: number; bigBlindCents: number;
  currentBetCents: number; minRaiseCents: number; raiseCents: number; rakeBps: number; rakeCapCents: number; rakeCents: number;
  turnSeatId: string | null; actedSinceRaise: string[]; outcome: string | null; revealedCards: boolean;
}

const mod = (value: number, length: number) => (value + length) % length;
const pot = (state: PokerTableHandState) => state.seats.reduce((sum, seat) => sum + seat.contributionCents, 0);
const live = (state: PokerTableHandState) => state.seats.filter((seat) => !seat.folded);
const canAct = (seat: PokerTableSeatState) => !seat.folded && seat.stackCents > 0;
const seatIndex = (state: PokerTableHandState, id: string) => state.seats.findIndex((seat) => seat.id === id);

function postBlind(seat: PokerTableSeatState, amount: number) {
  const posted = Math.min(amount, seat.stackCents);
  seat.stackCents -= posted;
  seat.streetBetCents += posted;
  seat.contributionCents += posted;
}

export function createPokerTableHand(
  inputSeats: readonly PokerTableSeatInput[], dealerSeatNo: number | null,
  smallBlindCents: number, bigBlindCents: number, raiseCents: number, rng: Rng, rakeBps = 0, rakeCapCents = 0,
): PokerTableHandState {
  if (inputSeats.length < 2 || inputSeats.length > 6 || new Set(inputSeats.map((s) => s.id)).size !== inputSeats.length
      || inputSeats.some((s) => !s.id || !Number.isSafeInteger(s.stackCents) || s.stackCents <= 0 || !Number.isSafeInteger(s.seatNo) || s.seatNo < 1)) throw new RangeError('A multiplayer hand needs two to six funded, unique seats.');
  if (![smallBlindCents, bigBlindCents, raiseCents].every((v) => Number.isSafeInteger(v) && v > 0) || smallBlindCents > bigBlindCents) throw new RangeError('Poker blinds and raises must be positive whole cents.');
  if (!Number.isSafeInteger(rakeBps) || rakeBps < 0 || rakeBps > 10_000 || !Number.isSafeInteger(rakeCapCents) || rakeCapCents < 0) throw new RangeError('Poker rake rules are invalid.');
  const seats = [...inputSeats].sort((a, b) => a.seatNo - b.seatNo).map((s) => ({ ...s, hole: [{ rank: 2, suit: 'C' as const }, { rank: 2, suit: 'D' as const }] as [PokerCard, PokerCard], folded: false, contributionCents: 0, streetBetCents: 0 }));
  const button = seats.find((s) => s.seatNo === dealerSeatNo) ?? seats[0]!;
  const buttonIndex = seats.indexOf(button);
  const smallIndex = seats.length === 2 ? buttonIndex : mod(buttonIndex + 1, seats.length);
  const bigIndex = mod(smallIndex + 1, seats.length);
  const deck = shufflePokerDeck(rng);
  const dealt = dealPokerHoleCards(deck, seats.map((s) => s.id), buttonIndex);
  for (const seat of seats) seat.hole = [...dealt.holeCards[seat.id]!] as [PokerCard, PokerCard];
  postBlind(seats[smallIndex]!, smallBlindCents);
  postBlind(seats[bigIndex]!, bigBlindCents);
  const state: PokerTableHandState = {
    deck: [...dealt.deck], board: [], seats, street: 'PREFLOP', dealerSeatNo: button.seatNo,
    smallBlindCents, bigBlindCents, currentBetCents: Math.max(seats[smallIndex]!.streetBetCents, seats[bigIndex]!.streetBetCents),
    minRaiseCents: bigBlindCents, raiseCents, turnSeatId: seats[mod(bigIndex + 1, seats.length)]!.id,
    actedSinceRaise: [], outcome: null, revealedCards: false, rakeBps, rakeCapCents, rakeCents: 0,
  };
  normalize(state);
  return state;
}

function awardFold(state: PokerTableHandState) {
  const winner = live(state)[0]!;
  state.rakeCents = state.board.length >= 3 ? Math.min(state.rakeCapCents, Math.floor(pot(state) * state.rakeBps / 10_000)) : 0;
  winner.stackCents += pot(state) - state.rakeCents;
  state.outcome = `${winner.name} wins the pot; all opponents folded.` + (state.rakeCents ? ' House rake taken.' : '');
  state.street = 'SHOWDOWN';
  state.turnSeatId = null;
}

function showdown(state: PokerTableHandState) {
  const values = Object.fromEntries(live(state).map((seat) => [seat.id, evaluatePokerHand([...seat.hole, ...state.board])]));
  state.rakeCents = state.board.length >= 3 ? Math.min(state.rakeCapCents, Math.floor(pot(state) * state.rakeBps / 10_000)) : 0;
  const awards = settlePokerPots(state.seats.map((s) => ({ id: s.id, contribution: s.contributionCents, folded: s.folded })), values, undefined, state.rakeCents);
  for (const award of awards) state.seats.find((s) => s.id === award.id)!.stackCents += award.amount;
  const winners = awards.filter((a) => a.amount > 0).map((a) => state.seats.find((s) => s.id === a.id)!.name);
  state.outcome = (winners.length > 1 ? `Split pot: ${winners.join(', ')}.` : `${winners[0] ?? 'No player'} wins at showdown.`)
    + (state.rakeCents ? ' House rake taken.' : '');
  state.revealedCards = true;
  state.street = 'SHOWDOWN';
  state.turnSeatId = null;
}

function reveal(state: PokerTableHandState) {
  const count = state.street === 'PREFLOP' ? 3 : 1;
  const next = revealPokerStreet(state.deck, state.board, count as 1 | 3);
  state.deck = [...next.deck]; state.board = [...next.communityCards];
  state.street = state.board.length === 3 ? 'FLOP' : state.board.length === 4 ? 'TURN' : 'RIVER';
  state.currentBetCents = 0; state.minRaiseCents = state.bigBlindCents; state.actedSinceRaise = [];
  for (const seat of state.seats) seat.streetBetCents = 0;
}

function normalize(state: PokerTableHandState) {
  if (live(state).length === 1) { awardFold(state); return; }
  const able = live(state).filter(canAct);
  if (able.length === 0 || (able.length === 1 && able[0]!.streetBetCents >= state.currentBetCents)) {
    while (state.street !== 'RIVER' && state.street !== 'SHOWDOWN') reveal(state);
    showdown(state); return;
  }
  const pending = state.seats.filter((s) => canAct(s) && (s.streetBetCents < state.currentBetCents || !state.actedSinceRaise.includes(s.id)));
  if (pending.length === 0) {
    if (state.street === 'RIVER') { showdown(state); return; }
    reveal(state);
    const first = state.seats[mod(seatIndex(state, String(state.seats.find((s) => s.seatNo === state.dealerSeatNo)?.id)) + 1, state.seats.length)]!;
    state.turnSeatId = first.id;
    normalize(state);
    return;
  }
  const current = seatIndex(state, state.turnSeatId ?? '');
  state.turnSeatId = pending.some((s) => s.id === state.turnSeatId)
    ? state.turnSeatId
    : state.seats.find((s, i) => pending.some((p) => p.id === s.id) && i >= mod(current + 1, state.seats.length))?.id
      ?? pending[0]!.id;
}

export function applyPokerTableAction(state: PokerTableHandState, playerId: string, action: PokerBetAction): PokerTableHandState {
  if (state.street === 'SHOWDOWN' || state.turnSeatId === null) throw new Error('This hand is already settled.');
  if (state.turnSeatId !== playerId) throw new Error('It is not your turn.');
  const seat = state.seats.find((s) => s.id === playerId)!;
  const due = Math.max(0, state.currentBetCents - seat.streetBetCents);
  if (action === 'FOLD') seat.folded = true;
  else if (action === 'CHECK') { if (due) throw new Error('A bet is due; call or fold.'); }
  else if (action === 'CALL') {
    if (!due) throw new Error('There is no bet to call.');
    const amount = Math.min(due, seat.stackCents); seat.stackCents -= amount; seat.streetBetCents += amount; seat.contributionCents += amount;
  } else {
    const amount = action === 'ALL_IN' ? seat.stackCents : Math.min(seat.stackCents, due + state.raiseCents);
    const target = seat.streetBetCents + amount;
    if (action === 'RAISE' && (target <= state.currentBetCents || (target - state.currentBetCents < state.minRaiseCents && amount < seat.stackCents))) throw new Error('That raise is below the minimum or cannot cover the call.');
    if (action === 'ALL_IN' && !amount) throw new Error('There are no chips left to move.');
    if (action === 'ALL_IN' && target <= state.currentBetCents && due === 0) throw new Error('You already have the whole amount committed.');
    seat.stackCents -= amount; seat.streetBetCents += amount; seat.contributionCents += amount;
    if (target > state.currentBetCents) {
      const raiseBy = target - state.currentBetCents;
      if (raiseBy >= state.minRaiseCents) { state.minRaiseCents = raiseBy; state.actedSinceRaise = [playerId]; }
      else state.actedSinceRaise.push(playerId); // short all-in does not reopen raising, but prior bettors must still call.
      state.currentBetCents = target;
    } else state.actedSinceRaise.push(playerId);
  }
  if (action === 'FOLD' || action === 'CHECK' || action === 'CALL') state.actedSinceRaise.push(playerId);
  state.turnSeatId = null;
  const pending = state.seats.filter((s) => canAct(s) && (s.streetBetCents < state.currentBetCents || !state.actedSinceRaise.includes(s.id)));
  if (pending.length) {
    const from = seatIndex(state, playerId);
    state.turnSeatId = state.seats.find((s, i) => i > from && pending.some((p) => p.id === s.id))?.id ?? pending[0]!.id;
  }
  normalize(state);
  return state;
}

export function pokerTablePot(state: PokerTableHandState) { return pot(state); }
export function pokerTableAmountToCall(state: PokerTableHandState, playerId: string) {
  const seat = state.seats.find((s) => s.id === playerId);
  return seat ? Math.max(0, state.currentBetCents - seat.streetBetCents) : 0;
}
