import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { CasinoPokerHand, Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  choosePokerBotAction, comparePokerHands, dealPokerHoleCards, evaluatePokerHand,
  revealPokerStreet, settlePokerPots, shufflePokerDeck, type PokerCard, type Rng,
} from '@streets/rules-engine';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { CasinoPokerActionInput, CasinoPokerHandDto, CasinoPokerResponseDto, CasinoPokerStartInput, CasinoPokerStateDto, CasinoPokerTableCreateInput, CasinoPokerTableJoinInput } from '@streets/shared';
import type { CasinoPokerTablePlayInput, CasinoPokerTableStartInput, CasinoPokerTableViewDto } from '@streets/shared';
import { applyPokerTableAction, createPokerTableHand, pokerTableAmountToCall, pokerTablePot, type PokerTableHandState } from '@streets/rules-engine';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { CasinoStatusService } from './casino-status.service.js';
import { bossPresence } from './boss-presence.service.js';

const TABLE_KEY = 'SOLO_HOLDEM';
const FALLBACK_POKER_RULES = { minBuyInCents: 1_000, maxBuyInCents: 100_000, bigBlindCents: 100, raiseCents: 200, rakeBps: 500, rakeCapCents: 500, venueKinds: ['FULL_CASINO', 'PRIVATE_CLUB', 'UNDERGROUND', 'NIGHTLIFE'] as const };
const secureRng: Rng = () => randomInt(0x1_0000_0000) / 0x1_0000_0000;
/** How long a multiplayer seat may sit on its turn before another player in the hand can skip it. */
export const POKER_TURN_TIMEOUT_MS = 60_000;

type PokerSeat = {
  id: string; name: string; human: boolean; hole: [PokerCard, PokerCard]; folded: boolean;
  stack: number; contribution: number; streetBet: number;
};
type PokerState = {
  deck: PokerCard[]; board: PokerCard[]; seats: PokerSeat[];
  street: 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN' | 'COMPLETE';
  currentBet: number; outcome: string | null; revealedBots: boolean; rakeBps: number; rakeCapCents: number; rakeCents: number;
  /** Seat holding the button when this hand was dealt; old saved hands default to the player. */
  dealerId?: string;
};
type PlayerRow = RoundPlayer & { city: { id: string; slug: string; name: string }; round: { rulesetId: string; rulesetVersion: string } };

function parseState(value: Prisma.JsonValue): PokerState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw AppError.conflict('POKER_STATE_INVALID', 'That saved poker hand cannot be resumed safely.');
  const state = value as unknown as PokerState;
  if (!Array.isArray(state.seats) || state.seats.length !== 3 || !Array.isArray(state.deck) || !Array.isArray(state.board)) {
    throw AppError.conflict('POKER_STATE_INVALID', 'That saved poker hand cannot be resumed safely.');
  }
  state.rakeBps ??= FALLBACK_POKER_RULES.rakeBps;
  state.rakeCapCents ??= FALLBACK_POKER_RULES.rakeCapCents;
  state.rakeCents ??= 0;
  return state;
}

function pot(state: PokerState): number { return state.seats.reduce((total, seat) => total + seat.contribution, 0); }

function inviteHash(code: string) { return createHash('sha256').update(code.toUpperCase()).digest('hex'); }
async function tableDto(db: Db | PrismaClient, row: any, playerId: string) {
  const city = await db.city.findUnique({ where: { id: row.cityId }, select: { slug: true, name: true } });
  return { id: row.id, name: row.name, visibility: row.visibility, citySlug: city?.slug ?? '', cityName: city?.name ?? 'Casino', buyInCents: Number(row.buyInCents), maxPlayers: row.maxPlayers, status: row.status as 'WAITING' | 'PLAYING' | 'CLOSED',
    seats: row.seats.filter((s: any) => s.status !== 'LEFT').map((s: any) => ({ displayName: s.roundPlayer.displayName, seatNo: s.seatNo, isYou: s.roundPlayerId === playerId, stackCents: Number(s.stackCents) })) };
}

function parseTableState(value: Prisma.JsonValue): PokerTableHandState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw AppError.conflict('POKER_STATE_INVALID', 'That saved table hand cannot be resumed safely.');
  const state = value as unknown as PokerTableHandState;
  if (!Array.isArray(state.seats) || state.seats.length < 2 || !Array.isArray(state.deck) || !Array.isArray(state.board)) throw AppError.conflict('POKER_STATE_INVALID', 'That saved table hand cannot be resumed safely.');
  return state;
}

async function tableViewInDb(db: Db | PrismaClient, tableId: string, playerId: string): Promise<CasinoPokerTableViewDto> {
  const row = await db.casinoPokerTable.findUnique({ where: { id: tableId }, include: { seats: { where: { status: { in: ['WAITING', 'PLAYING'] } }, include: { roundPlayer: { select: { displayName: true } } }, orderBy: { seatNo: 'asc' } }, hands: { orderBy: { handNo: 'desc' }, take: 1 } } });
  if (!row) throw AppError.notFound('POKER_TABLE_NOT_FOUND', 'That Poker table could not be found.');
  const member = row.seats.some((seat) => seat.roundPlayerId === playerId);
  if (row.visibility === 'PRIVATE' && !member) throw AppError.notFound('POKER_TABLE_NOT_FOUND', 'That Poker table could not be found.');
  const base = await tableDto(db, row, playerId);
  const handRow = row.hands[0];
  if (!handRow) return { ...base, hand: null };
  // A seated player without chips sits the hand out, so the viewer may not be in it.
  const hand = parseTableState(handRow.state);
  const map = new Map(row.seats.map((seat) => [seat.roundPlayerId, seat.roundPlayer]));
  const live = handRow.status === 'ACTIVE' && hand.turnSeatId !== null;
  return { ...base, hand: {
    id: handRow.id, handNo: handRow.handNo, street: hand.street, board: hand.board,
    potCents: pokerTablePot(hand), rakeCents: hand.rakeCents, turnSeatNo: hand.turnSeatId ? hand.seats.find((seat) => seat.id === hand.turnSeatId)?.seatNo ?? null : null,
    myTurn: hand.turnSeatId === playerId, amountToCallCents: pokerTableAmountToCall(hand, playerId), outcome: hand.outcome,
    turnExpiresAt: live ? new Date(handRow.updatedAt.getTime() + POKER_TURN_TIMEOUT_MS).toISOString() : null,
    seats: hand.seats.map((seat) => ({
      displayName: map.get(seat.id)?.displayName ?? seat.name, seatNo: seat.seatNo, isYou: seat.id === playerId,
      stackCents: seat.stackCents, contributionCents: seat.contributionCents, streetBetCents: seat.streetBetCents,
      folded: seat.folded, allIn: seat.stackCents === 0,
      cards: seat.id === playerId || (hand.revealedCards && !seat.folded) ? seat.hole : [],
      handName: hand.revealedCards && !seat.folded && hand.board.length === 5 ? handName([...seat.hole, ...hand.board]) : null,
    })),
  } };
}

function handName(cards: readonly PokerCard[]): string {
  const names: Record<string, string> = {
    HIGH_CARD: 'High card', PAIR: 'One pair', TWO_PAIR: 'Two pair', THREE_OF_A_KIND: 'Three of a kind',
    STRAIGHT: 'Straight', FLUSH: 'Flush', FULL_HOUSE: 'Full house', FOUR_OF_A_KIND: 'Four of a kind', STRAIGHT_FLUSH: 'Straight flush',
  };
  return names[evaluatePokerHand(cards).category] ?? 'Poker hand';
}

function dto(row: Pick<CasinoPokerHand, 'id' | 'status' | 'state' | 'buyInCents' | 'bankrollAfterCents' | 'createdAt' | 'settledAt'>): CasinoPokerHandDto {
  const state = parseState(row.state);
  const human = state.seats.find((seat) => seat.human)!;
  const revealed = state.revealedBots;
  return {
    id: row.id,
    status: row.status === 'ACTIVE' ? 'ACTIVE' : 'SETTLED',
    street: state.street,
    board: state.board,
    seats: state.seats.map((seat) => ({
      id: seat.id, name: seat.name, isHuman: seat.human,
      cards: seat.human || revealed ? seat.hole : [], folded: seat.folded,
      contributionCents: seat.contribution, stackCents: seat.stack,
      handName: revealed && !seat.folded && state.board.length >= 3 ? handName([...seat.hole, ...state.board]) : null,
    })),
    potCents: pot(state),
    amountToCallCents: Math.max(0, state.currentBet - human.streetBet),
    buyInCents: Number(row.buyInCents), bankrollAfterCents: Number(row.bankrollAfterCents),
    outcome: state.outcome, rakeCents: state.rakeCents, createdAt: row.createdAt.toISOString(), settledAt: row.settledAt?.toISOString() ?? null,
  };
}

async function playerAndCasino(db: Db | PrismaClient, id: string) {
  const player = await db.roundPlayer.findUnique({ where: { id }, include: { city: true, round: true } }) as PlayerRow | null;
  if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
  const ruleset = loadRulesetForRound(player.round);
  const casino = ruleset.casino;
  if (!casino?.enabled) throw AppError.conflict('CASINO_CLOSED', 'Casinos are not open in this round.');
  return { player, ruleset, casino };
}

async function bossCitySlug(db: Db | PrismaClient, ruleset: ReturnType<typeof loadRulesetForRound>, player: PlayerRow, now: Date): Promise<string | null> {
  const visiting = await bossPresence(db, ruleset, player.id, now);
  if (visiting) return visiting.city;
  if (player.movingUntil && player.movingUntil > now) return null;
  const [trips, runs] = await Promise.all([
    db.bossTrip.count({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
    db.run.count({ where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true } }),
  ]);
  return trips + runs > 0 ? null : player.city.slug;
}

/** Multiplayer tables follow the same rule as every other game: the boss must be standing in a Poker room. */
async function requirePokerRoom(db: Db, ruleset: ReturnType<typeof loadRulesetForRound>, casino: NonNullable<ReturnType<typeof loadRulesetForRound>['casino']>, player: PlayerRow, now: Date) {
  const citySlug = await bossCitySlug(db, ruleset, player, now);
  if (!citySlug) throw AppError.conflict('NOT_AT_CASINO', 'The boss has to be standing in a casino city to play Poker.');
  const venue = casino.venues[citySlug];
  if (!venue) throw AppError.conflict('NO_CASINO_HERE', 'There is no casino open where the boss is standing.');
  if (!casino.poker?.venueKinds.includes(venue.kind)) throw AppError.conflict('POKER_TABLE_NOT_HERE', 'This Poker table is not available in that casino.');
  const city = await db.city.findUnique({ where: { slug: citySlug } });
  if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That casino city is not available.');
  return city;
}

/** Persist a multiplayer hand after one action and return the acting player's table view. */
async function saveTableHand(tx: Db, tableId: string, handId: string, state: PokerTableHandState, playerId: string, actionId: string, kind: string) {
  const settled = state.street === 'SHOWDOWN';
  const seatRows = await tx.casinoPokerSeat.findMany({ where: { tableId, status: 'PLAYING' } });
  await Promise.all(seatRows.map((seat) => {
    const next = state.seats.find((s) => s.id === seat.roundPlayerId);
    return next ? tx.casinoPokerSeat.update({ where: { id: seat.id }, data: { stackCents: BigInt(next.stackCents), ...(settled ? { status: 'WAITING' } : {}) } }) : Promise.resolve();
  }));
  const updated = await tx.casinoPokerTableHand.update({ where: { id: handId }, data: { status: settled ? 'SETTLED' : 'ACTIVE', state: state as unknown as Prisma.InputJsonValue, outcome: state.outcome, settledAt: settled ? new Date() : null } });
  if (settled) await tx.casinoPokerTable.update({ where: { id: tableId }, data: { status: 'WAITING' } });
  const result = { table: await tableViewInDb(tx, tableId, playerId) };
  await tx.casinoPokerTableAction.create({ data: { roundPlayerId: playerId, handId: updated.id, actionId, kind, response: result as unknown as Prisma.InputJsonValue } });
  return result;
}

async function response(tx: Db, playerId: string, hand: CasinoPokerHand): Promise<CasinoPokerResponseDto> {
  const state = await stateInDb(tx, playerId);
  return { poker: state, hand: dto(hand) };
}

async function stateInDb(db: Db | PrismaClient, playerId: string): Promise<CasinoPokerStateDto> {
  const { casino } = await playerAndCasino(db, playerId);
  const [active, history, tables] = await Promise.all([
    db.casinoPokerHand.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
    db.casinoPokerHand.findMany({ where: { roundPlayerId: playerId, status: 'SETTLED' }, orderBy: [{ settledAt: 'desc' }, { id: 'desc' }], take: 20 }),
    db.casinoPokerTable.findMany({ where: { roundId: (await playerAndCasino(db, playerId)).player.roundId, OR: [{ status: 'WAITING', visibility: 'PUBLIC' }, { seats: { some: { roundPlayerId: playerId, status: { in: ['WAITING', 'PLAYING'] } } } }] }, include: { seats: { where: { status: { in: ['WAITING', 'PLAYING'] } }, include: { roundPlayer: { select: { displayName: true } } }, orderBy: { seatNo: 'asc' } }, }, orderBy: { createdAt: 'desc' }, take: 40 }),
  ]);
  const poker = casino.poker;
  const rules = poker ?? FALLBACK_POKER_RULES;
  return { enabled: Boolean(poker), minBuyInCents: rules.minBuyInCents, maxBuyInCents: rules.maxBuyInCents,
    smallBlindCents: Math.max(1, Math.floor(rules.bigBlindCents / 2)), bigBlindCents: rules.bigBlindCents,
    raiseCents: rules.raiseCents, rakeBps: rules.rakeBps, rakeCapCents: rules.rakeCapCents,
    activeHand: active ? dto(active) : null, history: history.map(dto), tables: await Promise.all(tables.map((row) => tableDto(db, row, playerId))) };
}

function distribute(state: PokerState, winners: string[], text: string, street: 'SHOWDOWN' | 'COMPLETE' = 'SHOWDOWN', rakeCents = 0): void {
  const value = pot(state) - rakeCents;
  state.rakeCents = rakeCents;
  const share = Math.floor(value / winners.length);
  let remainder = value - share * winners.length;
  for (const id of winners) {
    const seat = state.seats.find((item) => item.id === id)!;
    seat.stack += share + (remainder-- > 0 ? 1 : 0);
  }
  state.street = street;
  state.outcome = text + (rakeCents ? ' House rake taken.' : '');
}

function settleByFold(state: PokerState): void {
  const winners = state.seats.filter((seat) => !seat.folded);
  const rake = state.board.length >= 3 ? Math.min(state.rakeCapCents, Math.floor(pot(state) * state.rakeBps / 10_000)) : 0;
  if (state.seats.find((seat) => seat.human)!.folded) {
    const bots = winners.filter((seat) => !seat.human);
    const bestBot = bots.reduce((best, seat) => {
      const score = (item: PokerSeat) => {
        const a = Math.max(item.hole[0].rank, item.hole[1].rank);
        const b = Math.min(item.hole[0].rank, item.hole[1].rank);
        return [a === b ? 1 : 0, a + b, a];
      };
      const left = score(seat); const right = score(best);
      return left[0]! > right[0]! || (left[0] === right[0] && (left[1]! > right[1]! || (left[1] === right[1] && left[2]! > right[2]!))) ? seat : best;
    });
    if (bestBot) distribute(state, [bestBot.id], bestBot.name + ' wins after you fold.', 'COMPLETE', rake);
  } else if (winners.length === 1) {
    distribute(state, [winners[0]!.id], winners[0]!.human ? 'Both opponents folded. You take the pot.' : winners[0]!.name + ' takes the pot.', 'COMPLETE', rake);
  }
}

/** Calculate the clockwise solo table action order for the button and street. */
export function soloPokerActionOrder(
  seatIds: readonly string[],
  dealerId: string | undefined,
  street: 'PREFLOP' | 'POSTFLOP',
): string[] {
  if (seatIds.length === 0) return [];
  const dealerIndex = Math.max(0, seatIds.indexOf(dealerId ?? 'player'));
  // In a three-seat hand, preflop action starts with the button; later streets
  // start with the first seat clockwise from it.
  const firstIndex = (dealerIndex + (street === 'PREFLOP' ? 0 : 1)) % seatIds.length;
  return Array.from({ length: seatIds.length }, (_, offset) => seatIds[(firstIndex + offset) % seatIds.length]!);
}

function actionOrder(state: PokerState): string[] {
  return soloPokerActionOrder(
    state.seats.map((seat) => seat.id),
    state.dealerId,
    state.street === 'PREFLOP' ? 'PREFLOP' : 'POSTFLOP',
  );
}

function botResponses(state: PokerState, rng: Rng, order: readonly string[]): void {
  for (const id of order) {
    const bot = state.seats.find((seat) => seat.id === id);
    if (!bot || bot.human || bot.folded) continue;
    const due = Math.max(0, state.currentBet - bot.streetBet);
    const action = choosePokerBotAction({ holeCards: bot.hole, communityCards: state.board, amountToCall: due, canRaise: false, rng, potCents: pot(state) });
    if (action === 'FOLD') bot.folded = true;
    else { const amount = Math.min(due, bot.stack); bot.stack -= amount; bot.contribution += amount; bot.streetBet += amount; }
    settleByFold(state);
    if (state.street === 'SHOWDOWN' || state.street === 'COMPLETE') return;
  }
}

function revealNext(state: PokerState): void {
  if (state.street === 'PREFLOP') {
    const revealed = revealPokerStreet(state.deck, state.board, 3); state.deck = [...revealed.deck]; state.board = [...revealed.communityCards]; state.street = 'FLOP';
  } else if (state.street === 'FLOP') {
    const revealed = revealPokerStreet(state.deck, state.board, 1); state.deck = [...revealed.deck]; state.board = [...revealed.communityCards]; state.street = 'TURN';
  } else if (state.street === 'TURN') {
    const revealed = revealPokerStreet(state.deck, state.board, 1); state.deck = [...revealed.deck]; state.board = [...revealed.communityCards]; state.street = 'RIVER';
  } else {
    const live = state.seats.filter((seat) => !seat.folded);
    const values = Object.fromEntries(live.map((seat) => [seat.id, evaluatePokerHand([...seat.hole, ...state.board])]));
    const winners = live.filter((seat) => comparePokerHands(values[seat.id]!, values[live[0]!.id]!) >= 0)
      .filter((seat) => live.every((other) => comparePokerHands(values[seat.id]!, values[other.id]!) >= 0));
    state.rakeCents = state.board.length >= 3 ? Math.min(state.rakeCapCents, Math.floor(pot(state) * state.rakeBps / 10_000)) : 0;
    const awards = settlePokerPots(state.seats.map((seat) => ({ id: seat.id, contribution: seat.contribution, folded: seat.folded })), values, undefined, state.rakeCents);
    for (const award of awards) state.seats.find((seat) => seat.id === award.id)!.stack += award.amount;
    state.street = 'SHOWDOWN';
    state.revealedBots = true;
    state.outcome = (winners.some((seat) => seat.human)
      ? winners.length > 1 ? 'You split the pot.' : 'You win at showdown.'
      : 'The bots win at showdown.') + (state.rakeCents ? ' House rake taken.' : '');
    return;
  }
  state.currentBet = 0;
  for (const seat of state.seats) seat.streetBet = 0;
}

function handSettled(state: PokerState): boolean {
  return state.street === 'SHOWDOWN' || state.street === 'COMPLETE';
}

function act(state: PokerState, action: CasinoPokerActionInput['action'], rng: Rng, raiseSize: number): void {
  const human = state.seats.find((seat) => seat.human)!;
  if (state.street === 'SHOWDOWN' || state.street === 'COMPLETE') throw AppError.conflict('POKER_HAND_SETTLED', 'That poker hand is already settled.');
  const order = actionOrder(state);
  const humanOrderIndex = order.indexOf(human.id);
  // Resolve the bots who act before the player first. If the player raises,
  // those bots get another response after the players behind the button.
  botResponses(state, rng, order.slice(0, humanOrderIndex));
  // The bots may have settled the hand; read the street again rather than the narrowed one.
  if (handSettled(state)) return;
  const previousBet = state.currentBet;
  const due = Math.max(0, state.currentBet - human.streetBet);
  if (action === 'FOLD') {
    human.folded = true; settleByFold(state); return;
  }
  if (action === 'CHECK' && due !== 0) throw AppError.conflict('POKER_BET_DUE', 'Call the current bet or fold.');
  if (action === 'CALL' && due === 0) throw AppError.conflict('POKER_CALL_INVALID', 'There is no call to make.');
  if (action === 'RAISE' && human.stack < due + raiseSize) throw AppError.conflict('POKER_RAISE_INVALID', 'Your stack is too short for that raise.');
  if (action === 'CALL' || (action === 'CHECK' && due > 0)) {
    const amount = Math.min(due, human.stack);
    human.stack -= amount; human.contribution += amount; human.streetBet += amount;
  } else if (action === 'RAISE') {
    const added = due + raiseSize; human.stack -= added; human.contribution += added; human.streetBet += added; state.currentBet = human.streetBet;
  } else if (action === 'ALL_IN') {
    const added = human.stack; human.stack = 0; human.contribution += added; human.streetBet += added;
    state.currentBet = Math.max(state.currentBet, human.streetBet);
  }
  botResponses(state, rng, order.slice(humanOrderIndex + 1));
  if (state.currentBet > previousBet) botResponses(state, rng, order.slice(0, humanOrderIndex));
  let streetAfterBots = state.street as PokerState['street'];
  if (streetAfterBots !== 'SHOWDOWN' && streetAfterBots !== 'COMPLETE') {
    const playersAbleToBet = state.seats.filter((seat) => !seat.folded && seat.stack > 0).length;
    if (playersAbleToBet <= 1) {
      while (streetAfterBots !== 'SHOWDOWN' && streetAfterBots !== 'COMPLETE') { revealNext(state); streetAfterBots = state.street as PokerState['street']; }
    } else revealNext(state);
  }
}

export const CasinoPokerService = {
  state(db: PrismaClient, playerId: string) { return stateInDb(db, playerId); },

  async createTable(prisma: PrismaClient, playerId: string, input: CasinoPokerTableCreateInput) {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      const { player, ruleset, casino } = await playerAndCasino(tx, playerId);
      const previous = await tx.casinoPokerTable.findUnique({ where: { creatorRoundPlayerId_createActionId: { creatorRoundPlayerId: playerId, createActionId: input.actionId }, }, include: { seats: { where: { status: 'WAITING' }, include: { roundPlayer: { select: { displayName: true } } } } } });
      if (previous) return { table: await tableDto(tx, previous, playerId) };
      if (!casino.poker) throw AppError.conflict('POKER_CLOSED', 'Poker is not enabled in this round.');
      if (input.buyInCents < casino.poker.minBuyInCents || input.buyInCents > casino.poker.maxBuyInCents || input.buyInCents % 100) throw AppError.badRequest('POKER_BUY_IN', 'Choose a whole-dollar buy-in within the Poker limits.');
      if (await tx.casinoPokerSeat.findFirst({ where: { roundPlayerId: playerId, status: { in: ['WAITING', 'PLAYING'] }, table: { status: { in: ['WAITING', 'PLAYING'] } } } })) throw AppError.conflict('POKER_ALREADY_SEATED', 'Leave your current multiplayer table first.');
      if (await tx.casinoPokerHand.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' } })) throw AppError.conflict('POKER_HAND_ACTIVE', 'Finish your solo Poker hand first.');
      const [blackjack, dice] = await Promise.all([
        tx.casinoBlackjackHand.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoStreetDiceRound.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, select: { id: true } }),
      ]);
      if (blackjack || dice) throw AppError.conflict('CASINO_GAME_ACTIVE', 'Finish your active casino game before opening a Poker table.');
      const room = await requirePokerRoom(tx, ruleset, casino, player, new Date());
      const session = await tx.casinoSession.findFirst({ where: { roundPlayerId: playerId, status: 'OPEN', cityId: room.id }, orderBy: { openedAt: 'desc' } });
      if (!session || session.bankrollCents < BigInt(input.buyInCents)) throw AppError.conflict('CASINO_SESSION_REQUIRED', 'Open a sufficiently funded casino bankroll in your current city.');
      const code = input.visibility === 'PRIVATE' ? randomBytes(5).toString('hex').toUpperCase() : null;
      const table = await tx.casinoPokerTable.create({ data: { roundId: player.roundId, cityId: session.cityId, name: input.name, visibility: input.visibility, inviteCodeHash: code ? inviteHash(code) : null, creatorRoundPlayerId: playerId, createActionId: input.actionId, maxPlayers: input.maxPlayers, buyInCents: BigInt(input.buyInCents) } });
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: { decrement: BigInt(input.buyInCents) } } });
      await tx.casinoPokerSeat.create({ data: { tableId: table.id, roundPlayerId: playerId, sessionId: session.id, actionId: input.actionId, seatNo: 1, stackCents: BigInt(input.buyInCents) } });
      const wallet = await tx.casinoWallet.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId: playerId, cityId: session.cityId } } });
      await tx.casinoLedgerEntry.create({ data: { roundPlayerId: playerId, cityId: session.cityId, sessionId: session.id, actionId: input.actionId, kind: 'POKER_TABLE_BUY_IN', sessionChipDeltaCents: -BigInt(input.buyInCents), walletChipsAfterCents: wallet?.chipsCents ?? 0n, sessionChipsAfterCents: session.bankrollCents - BigInt(input.buyInCents), metadata: { tableId: table.id, buyInCents: input.buyInCents } as Prisma.InputJsonValue } });
      await CasinoStatusService.recordPlay(tx, ruleset, { roundPlayerId: playerId, cityId: session.cityId, wagerCents: BigInt(input.buyInCents), play: { game: 'POKER', tableKey: 'TABLE_HOLDEM', actionId: input.actionId }, now: new Date() });
      const withSeats = await tx.casinoPokerTable.findUniqueOrThrow({ where: { id: table.id }, include: { seats: { where: { status: 'WAITING' }, include: { roundPlayer: { select: { displayName: true } } } } } });
      return { table: await tableDto(tx, withSeats, playerId), ...(code ? { inviteCode: code } : {}) };
    });
  },

  async joinTable(prisma: PrismaClient, playerId: string, tableId: string, input: CasinoPokerTableJoinInput) {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      const { player, ruleset, casino } = await playerAndCasino(tx, playerId);
      const priorSeat = await tx.casinoPokerSeat.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } }, include: { table: { include: { seats: { where: { status: 'WAITING' }, include: { roundPlayer: { select: { displayName: true } } } } } } } });
      if (priorSeat) return { table: await tableDto(tx, priorSeat.table, playerId) };
      if (await tx.casinoPokerSeat.findFirst({ where: { roundPlayerId: playerId, status: { in: ['WAITING', 'PLAYING'] }, table: { status: { in: ['WAITING', 'PLAYING'] } } } })) throw AppError.conflict('POKER_ALREADY_SEATED', 'Leave your current multiplayer table first.');
      const [activePoker, blackjack, dice] = await Promise.all([
        tx.casinoPokerHand.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoBlackjackHand.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoStreetDiceRound.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, select: { id: true } }),
      ]);
      if (activePoker || blackjack || dice) throw AppError.conflict('CASINO_GAME_ACTIVE', 'Finish your active casino game before joining a Poker table.');
      await tx.$queryRaw`SELECT id FROM "CasinoPokerTable" WHERE id = ${tableId} FOR UPDATE`;
      const table = await tx.casinoPokerTable.findUnique({ where: { id: tableId }, include: { seats: { where: { status: 'WAITING' }, include: { roundPlayer: { select: { displayName: true } } }, orderBy: { seatNo: 'asc' } } } });
      if (!table || table.roundId !== player.roundId || table.status !== 'WAITING') throw AppError.notFound('POKER_TABLE_NOT_FOUND', 'That Poker table is no longer available.');
      if (table.visibility === 'PRIVATE' && (!input.inviteCode || inviteHash(input.inviteCode) !== table.inviteCodeHash)) throw AppError.conflict('POKER_INVITE_INVALID', 'That private table invite code is invalid.');
      if (table.seats.length >= table.maxPlayers) throw AppError.conflict('POKER_TABLE_FULL', 'That Poker table is full.');
      const room = await requirePokerRoom(tx, ruleset, casino, player, new Date());
      if (room.id !== table.cityId) throw AppError.conflict('POKER_TABLE_CITY', 'Travel to the table’s city before joining.');
      const session = await tx.casinoSession.findFirst({ where: { roundPlayerId: playerId, status: 'OPEN', cityId: table.cityId }, orderBy: { openedAt: 'desc' } });
      if (!session || session.bankrollCents < table.buyInCents) throw AppError.conflict('CASINO_SESSION_REQUIRED', 'Open a sufficiently funded casino bankroll in this city.');
      const allSeats = await tx.casinoPokerSeat.findMany({ where: { tableId }, select: { seatNo: true } });
      const occupied = new Set(allSeats.map((seat) => seat.seatNo));
      let seatNo = 1; while (occupied.has(seatNo)) seatNo++;
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: { decrement: table.buyInCents } } });
      await tx.casinoPokerSeat.create({ data: { tableId, roundPlayerId: playerId, sessionId: session.id, actionId: input.actionId, seatNo, stackCents: table.buyInCents } });
      const wallet = await tx.casinoWallet.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId: playerId, cityId: table.cityId } } });
      await tx.casinoLedgerEntry.create({ data: { roundPlayerId: playerId, cityId: table.cityId, sessionId: session.id, actionId: input.actionId, kind: 'POKER_TABLE_BUY_IN', sessionChipDeltaCents: -table.buyInCents, walletChipsAfterCents: wallet?.chipsCents ?? 0n, sessionChipsAfterCents: session.bankrollCents - table.buyInCents, metadata: { tableId, buyInCents: Number(table.buyInCents) } as Prisma.InputJsonValue } });
      await CasinoStatusService.recordPlay(tx, ruleset, { roundPlayerId: playerId, cityId: table.cityId, wagerCents: table.buyInCents, play: { game: 'POKER', tableKey: 'TABLE_HOLDEM', actionId: input.actionId }, now: new Date() });
      const joined = await tx.casinoPokerTable.findUniqueOrThrow({ where: { id: tableId }, include: { seats: { where: { status: 'WAITING' }, include: { roundPlayer: { select: { displayName: true } } }, orderBy: { seatNo: 'asc' } } } });
      return { table: await tableDto(tx, joined, playerId) };
    });
  },

  table(db: PrismaClient, playerId: string, tableId: string) { return tableViewInDb(db, tableId, playerId); },

  async startTableHand(prisma: PrismaClient, playerId: string, tableId: string, input: CasinoPokerTableStartInput, rng: Rng = secureRng) {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      await tx.$queryRaw`SELECT id FROM "CasinoPokerTable" WHERE id = ${tableId} FOR UPDATE`;
      const replay = await tx.casinoPokerTableAction.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } } });
      if (replay) {
        if (replay.kind !== 'START') throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another Poker action.');
        return replay.response as unknown as { table: CasinoPokerTableViewDto };
      }
      if (await tx.casinoLedgerEntry.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } }, select: { id: true } })) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another casino action.');
      const { casino } = await playerAndCasino(tx, playerId);
      const rules = casino.poker;
      if (!rules) throw AppError.conflict('POKER_CLOSED', 'Poker is not enabled in this round.');
      const table = await tx.casinoPokerTable.findUnique({ where: { id: tableId }, include: { seats: { where: { status: 'WAITING' }, include: { roundPlayer: { select: { displayName: true } } }, orderBy: { seatNo: 'asc' } } } });
      if (!table || table.status !== 'WAITING' || !table.seats.some((seat) => seat.roundPlayerId === playerId)) throw AppError.conflict('POKER_TABLE_UNAVAILABLE', 'Join an open Poker table before starting a hand.');
      const funded = table.seats.filter((seat) => seat.stackCents > 0n);
      if (funded.length < 2) throw AppError.conflict('POKER_NEEDS_PLAYERS', 'At least two players with chips are needed to deal.');
      const dealerSeatNo = table.dealerSeatNo == null
        ? funded[0]!.seatNo
        : funded.find((seat) => seat.seatNo > table.dealerSeatNo!)?.seatNo ?? funded[0]!.seatNo;
      const state = createPokerTableHand(funded.map((seat) => ({ id: seat.roundPlayerId, name: seat.roundPlayer.displayName, seatNo: seat.seatNo, stackCents: Number(seat.stackCents) })), dealerSeatNo, Math.max(1, Math.floor(rules.bigBlindCents / 2)), rules.bigBlindCents, rules.raiseCents, rng, rules.rakeBps, rules.rakeCapCents);
      const handNo = await tx.casinoPokerTableHand.count({ where: { tableId } }) + 1;
      const hand = await tx.casinoPokerTableHand.create({ data: { tableId, handNo, status: state.street === 'SHOWDOWN' ? 'SETTLED' : 'ACTIVE', state: state as unknown as Prisma.InputJsonValue, outcome: state.outcome, settledAt: state.street === 'SHOWDOWN' ? new Date() : null } });
      await Promise.all(funded.map((seat) => tx.casinoPokerSeat.update({ where: { id: seat.id }, data: { status: state.street === 'SHOWDOWN' ? 'WAITING' : 'PLAYING', stackCents: BigInt(state.seats.find((s) => s.id === seat.roundPlayerId)!.stackCents) } })));
      await tx.casinoPokerTable.update({ where: { id: tableId }, data: { status: state.street === 'SHOWDOWN' ? 'WAITING' : 'PLAYING', dealerSeatNo } });
      const result = { table: await tableViewInDb(tx, tableId, playerId) };
      if (state.street === 'SHOWDOWN') await tx.casinoPokerSeat.updateMany({ where: { tableId, status: 'PLAYING' }, data: { status: 'WAITING' } });
      await tx.casinoPokerTableAction.create({ data: { roundPlayerId: playerId, handId: hand.id, actionId: input.actionId, kind: 'START', response: result as unknown as Prisma.InputJsonValue } });
      return result;
    });
  },

  async playTableAction(prisma: PrismaClient, playerId: string, tableId: string, input: CasinoPokerTablePlayInput, rng: Rng = secureRng) {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      await tx.$queryRaw`SELECT id FROM "CasinoPokerTable" WHERE id = ${tableId} FOR UPDATE`;
      const replay = await tx.casinoPokerTableAction.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } } });
      if (replay) {
        if (replay.kind !== input.action) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another Poker action.');
        return replay.response as unknown as { table: CasinoPokerTableViewDto };
      }
      if (await tx.casinoLedgerEntry.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } }, select: { id: true } })) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another casino action.');
      const table = await tx.casinoPokerTable.findUnique({ where: { id: tableId } });
      if (!table || table.status !== 'PLAYING') throw AppError.conflict('POKER_TABLE_NOT_PLAYING', 'That table has no active hand.');
      const hand = await tx.casinoPokerTableHand.findFirst({ where: { tableId, status: 'ACTIVE' }, orderBy: { handNo: 'desc' } });
      if (!hand) throw AppError.conflict('POKER_HAND_NOT_FOUND', 'There is no active hand at that table.');
      const state = parseTableState(hand.state);
      try { applyPokerTableAction(state, playerId, input.action); }
      catch (error) { throw AppError.conflict('POKER_ACTION_INVALID', error instanceof Error ? error.message : 'That Poker action is not legal.'); }
      return saveTableHand(tx, tableId, hand.id, state, playerId, input.actionId, input.action);
    });
  },

  /**
   * Skip a seat that has sat on its turn past POKER_TURN_TIMEOUT_MS: it checks
   * when nothing is owed and folds otherwise. Without this one idle player
   * would freeze the table and every escrowed buy-in at it.
   */
  async timeoutTableTurn(prisma: PrismaClient, playerId: string, tableId: string, actionId: string, now: Date = new Date()) {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      await tx.$queryRaw`SELECT id FROM "CasinoPokerTable" WHERE id = ${tableId} FOR UPDATE`;
      const replay = await tx.casinoPokerTableAction.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId } } });
      if (replay) {
        if (replay.kind !== 'TIMEOUT') throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another Poker action.');
        return replay.response as unknown as { table: CasinoPokerTableViewDto };
      }
      if (await tx.casinoLedgerEntry.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId } }, select: { id: true } })) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another casino action.');
      const table = await tx.casinoPokerTable.findUnique({ where: { id: tableId } });
      if (!table || table.status !== 'PLAYING') throw AppError.conflict('POKER_TABLE_NOT_PLAYING', 'That table has no active hand.');
      const hand = await tx.casinoPokerTableHand.findFirst({ where: { tableId, status: 'ACTIVE' }, orderBy: { handNo: 'desc' } });
      if (!hand) throw AppError.conflict('POKER_HAND_NOT_FOUND', 'There is no active hand at that table.');
      const state = parseTableState(hand.state);
      if (!state.seats.some((seat) => seat.id === playerId)) throw AppError.conflict('POKER_NOT_IN_HAND', 'Only players dealt into this hand can skip an idle turn.');
      const idle = state.turnSeatId;
      if (!idle) throw AppError.conflict('POKER_HAND_NOT_FOUND', 'There is no turn waiting at that table.');
      if (idle === playerId) throw AppError.conflict('POKER_YOUR_TURN', 'It is your turn. Act instead of skipping it.');
      if (now.getTime() < hand.updatedAt.getTime() + POKER_TURN_TIMEOUT_MS) throw AppError.conflict('POKER_TURN_NOT_EXPIRED', 'That player still has time to act.');
      applyPokerTableAction(state, idle, pokerTableAmountToCall(state, idle) > 0 ? 'FOLD' : 'CHECK');
      return saveTableHand(tx, tableId, hand.id, state, playerId, actionId, 'TIMEOUT');
    });
  },

  async leaveTable(prisma: PrismaClient, playerId: string, tableId: string, actionId: string) {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      await tx.$queryRaw`SELECT id FROM "CasinoPokerTable" WHERE id = ${tableId} FOR UPDATE`;
      const seat = await tx.casinoPokerSeat.findFirst({ where: { tableId, roundPlayerId: playerId, status: 'WAITING' }, include: { table: true } });
      if (!seat && await tx.casinoPokerSeat.findFirst({ where: { tableId, roundPlayerId: playerId, status: 'LEFT' }, select: { id: true } })) return { ok: true as const };
      if (!seat || seat.status !== 'WAITING' || seat.table.status !== 'WAITING') throw AppError.conflict('POKER_TABLE_ACTIVE', 'You can leave only while the table is waiting.');
      const session = await tx.casinoSession.findUnique({ where: { id: seat.sessionId } });
      if (!session || session.status !== 'OPEN') throw AppError.conflict('CASINO_SESSION_CLOSED', 'Your casino session is closed; contact support before leaving this table.');
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: { increment: seat.stackCents } } });
      await tx.casinoPokerSeat.update({ where: { id: seat.id }, data: { status: 'LEFT', leftAt: new Date() } });
      const wallet = await tx.casinoWallet.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId: playerId, cityId: seat.table.cityId } } });
      await tx.casinoLedgerEntry.create({ data: { roundPlayerId: playerId, cityId: seat.table.cityId, sessionId: session.id, actionId, kind: 'POKER_TABLE_REFUND', sessionChipDeltaCents: seat.stackCents, walletChipsAfterCents: wallet?.chipsCents ?? 0n, sessionChipsAfterCents: session.bankrollCents + seat.stackCents, metadata: { tableId, seatId: seat.id, refundCents: Number(seat.stackCents) } as Prisma.InputJsonValue } });
      const remaining = await tx.casinoPokerSeat.findMany({ where: { tableId, status: 'WAITING' }, orderBy: { joinedAt: 'asc' } });
      if (remaining.length === 0) await tx.casinoPokerTable.update({ where: { id: tableId }, data: { status: 'CLOSED' } });
      else if (seat.table.creatorRoundPlayerId === playerId) await tx.casinoPokerTable.update({ where: { id: tableId }, data: { creatorRoundPlayerId: remaining[0]!.roundPlayerId } });
      return { ok: true as const };
    });
  },

  async start(prisma: PrismaClient, playerId: string, input: CasinoPokerStartInput, rng: Rng = secureRng): Promise<CasinoPokerResponseDto> {
    if (!Number.isSafeInteger(input.buyInCents) || input.buyInCents <= 0) throw AppError.badRequest('POKER_BUY_IN', 'Enter a valid buy-in amount.');
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      const replay = await tx.casinoPokerAction.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } } });
      if (replay) {
        if (replay.kind !== 'START') throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another Poker action.');
        const saved = replay.response as unknown as CasinoPokerResponseDto;
        if (saved.hand.buyInCents !== input.buyInCents) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different Poker hand.');
        return saved;
      }
      const casinoReceipt = await tx.casinoLedgerEntry.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } }, select: { id: true } });
      if (casinoReceipt) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another casino action.');
      const { player, ruleset, casino } = await playerAndCasino(tx, playerId);
      const pokerRules = casino.poker;
      if (!pokerRules) throw AppError.conflict('POKER_CLOSED', 'Poker is not enabled in this round.');
      if (input.buyInCents < pokerRules.minBuyInCents || input.buyInCents > pokerRules.maxBuyInCents || input.buyInCents % 100 !== 0) {
        throw AppError.badRequest('POKER_BUY_IN', `Choose a buy-in from ${pokerRules.minBuyInCents / 100} to ${pokerRules.maxBuyInCents / 100} dollars in whole dollars.`);
      }
      const existing = await tx.casinoPokerHand.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' } });
      if (existing) throw AppError.conflict('POKER_HAND_ACTIVE', 'Finish your active Poker hand before dealing another.');
      const tableSeat = await tx.casinoPokerSeat.findFirst({ where: { roundPlayerId: playerId, status: { in: ['WAITING', 'PLAYING'] }, table: { status: { in: ['WAITING', 'PLAYING'] } } }, select: { id: true } });
      if (tableSeat) throw AppError.conflict('POKER_TABLE_ACTIVE', 'Leave your multiplayer Poker table before starting a solo hand.');
      const otherActive = await Promise.all([
        tx.casinoBlackjackHand.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoStreetDiceRound.findFirst({ where: { roundPlayerId: playerId, status: 'ACTIVE' }, select: { id: true } }),
      ]);
      if (otherActive.some(Boolean)) throw AppError.conflict('CASINO_GAME_ACTIVE', 'Finish your active casino game before starting Poker.');
      const citySlug = await bossCitySlug(tx, ruleset, player, new Date());
      if (!citySlug) throw AppError.conflict('NOT_AT_CASINO', 'The boss has to be standing in a casino city to play Poker.');
      const venue = casino.venues[citySlug];
      if (!venue) throw AppError.conflict('NO_CASINO_HERE', 'There is no casino open where the boss is standing.');
      if (!pokerRules.venueKinds.includes(venue.kind)) throw AppError.conflict('POKER_TABLE_NOT_HERE', 'This Poker table is not available in that casino.');
      const city = await tx.city.findUnique({ where: { slug: citySlug } });
      if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That casino city is not available.');
      const session = await tx.casinoSession.findFirst({ where: { roundPlayerId: playerId, status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
      if (!session || session.cityId !== city.id) throw AppError.conflict('CASINO_SESSION_REQUIRED', 'Open a casino bankroll in this city before playing Poker.');
      const buyIn = BigInt(input.buyInCents);
      if (session.bankrollCents < buyIn) throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough casino chips for that Poker buy-in.');
      const bankroll = session.bankrollCents - buyIn;
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankroll } });
      // The button moves one seat per solo hand, so the player posts the small
      // blind and the big blind in turn just like Mack and Rico.
      const seatIds = ['player', 'bot-1', 'bot-2'] as const;
      const handsPlayed = await tx.casinoPokerHand.count({ where: { roundPlayerId: playerId } });
      const dealerIndex = (seatIds.length - (handsPlayed % seatIds.length)) % seatIds.length;
      const blinds: Record<string, number> = {
        [seatIds[(dealerIndex + 1) % seatIds.length]!]: Math.floor(pokerRules.bigBlindCents / 2),
        [seatIds[(dealerIndex + 2) % seatIds.length]!]: pokerRules.bigBlindCents,
      };
      const deck = shufflePokerDeck(rng);
      const dealt = dealPokerHoleCards(deck, seatIds, dealerIndex);
      const seat = (id: (typeof seatIds)[number], name: string, human: boolean): PokerSeat => {
        const blind = blinds[id] ?? 0;
        return { id, name, human, hole: [...dealt.holeCards[id]!] as [PokerCard, PokerCard], folded: false, stack: input.buyInCents - blind, contribution: blind, streetBet: blind };
      };
      const state: PokerState = {
        deck: [...dealt.deck], board: [], street: 'PREFLOP', currentBet: pokerRules.bigBlindCents, outcome: null, revealedBots: false,
        rakeBps: pokerRules.rakeBps, rakeCapCents: pokerRules.rakeCapCents, rakeCents: 0,
        dealerId: seatIds[dealerIndex],
        seats: [seat('player', player.displayName, true), seat('bot-1', 'Mack', false), seat('bot-2', 'Rico', false)],
      };
      const row = await tx.casinoPokerHand.create({ data: {
        roundPlayerId: playerId, sessionId: session.id, cityId: city.id, tableKey: TABLE_KEY, status: 'ACTIVE',
        buyInCents: buyIn, state: state as unknown as Prisma.InputJsonValue, bankrollAfterCents: bankroll, initialActionId: input.actionId,
      } });
      const result = await response(tx, playerId, row);
      await tx.casinoPokerAction.create({ data: { roundPlayerId: playerId, handId: row.id, actionId: input.actionId, kind: 'START', response: result as unknown as Prisma.InputJsonValue } });
      const wallet = await tx.casinoWallet.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId: playerId, cityId: city.id } } });
      await tx.casinoLedgerEntry.create({ data: { roundPlayerId: playerId, cityId: city.id, sessionId: session.id, actionId: input.actionId, kind: 'POKER_BUY_IN', sessionChipDeltaCents: -buyIn, walletChipsAfterCents: wallet?.chipsCents ?? 0n, sessionChipsAfterCents: bankroll, metadata: { game: 'POKER', action: 'BUY_IN', handId: row.id, buyInCents: input.buyInCents } as Prisma.InputJsonValue } });
      await CasinoStatusService.recordPlay(tx, ruleset, { roundPlayerId: playerId, cityId: city.id, wagerCents: buyIn, play: { game: 'POKER', tableKey: TABLE_KEY, actionId: input.actionId }, now: new Date() });
      return result;
    });
  },

  async action(prisma: PrismaClient, playerId: string, input: CasinoPokerActionInput, rng: Rng = secureRng): Promise<CasinoPokerResponseDto> {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      const replay = await tx.casinoPokerAction.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } } });
      if (replay) {
        if (replay.kind !== input.action) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another Poker action.');
        return replay.response as unknown as CasinoPokerResponseDto;
      }
      const casinoReceipt = await tx.casinoLedgerEntry.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } }, select: { id: true } });
      if (casinoReceipt) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another casino action.');
      const { ruleset, casino } = await playerAndCasino(tx, playerId);
      const pokerRules = casino.poker;
      if (!pokerRules) throw AppError.conflict('POKER_CLOSED', 'Poker is not enabled in this round.');
      const row = await tx.casinoPokerHand.findFirst({ where: { id: input.handId, roundPlayerId: playerId } });
      if (!row) throw AppError.notFound('POKER_HAND_NOT_FOUND', 'That Poker hand could not be found.');
      if (row.status !== 'ACTIVE') throw AppError.conflict('POKER_HAND_SETTLED', 'That Poker hand is already settled.');
      const state = parseState(row.state);
      act(state, input.action, rng, pokerRules.raiseCents);
      const settled = state.street === 'SHOWDOWN' || state.street === 'COMPLETE';
      let bankroll = row.bankrollAfterCents;
      if (settled) {
        const humanStack = BigInt(state.seats.find((seat) => seat.human)!.stack);
        const session = await tx.casinoSession.findUnique({ where: { id: row.sessionId } });
        if (!session || session.status !== 'OPEN') throw AppError.conflict('CASINO_SESSION_CLOSED', 'The casino session for this Poker hand is no longer open.');
        bankroll = session.bankrollCents + humanStack;
        await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankroll } });
        // 1.2.0-E: the house's real take from the pot is rated one-for-one.
        await CasinoStatusService.rateHouseTake(tx, ruleset, { roundPlayerId: playerId, cityId: row.cityId, takeCents: BigInt(state.rakeCents), now: new Date() });
        const wallet = await tx.casinoWallet.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId: playerId, cityId: row.cityId } } });
        await tx.casinoLedgerEntry.create({ data: { roundPlayerId: playerId, cityId: row.cityId, sessionId: row.sessionId, actionId: input.actionId, kind: 'POKER_CASH_OUT', sessionChipDeltaCents: humanStack, walletChipsAfterCents: wallet?.chipsCents ?? 0n, sessionChipsAfterCents: bankroll, metadata: { game: 'POKER', action: 'CASH_OUT', handId: row.id, returnCents: Number(humanStack), rakeCents: state.rakeCents, outcome: state.outcome } as Prisma.InputJsonValue } });
        await CasinoStatusService.recordResult(tx, ruleset, {
          roundPlayerId: playerId, cityId: row.cityId, play: { game: 'POKER', tableKey: TABLE_KEY, actionId: input.actionId },
          stakeCents: row.buyInCents, returnCents: humanStack,
          highlight: state.street === 'SHOWDOWN' && humanStack > row.buyInCents ? 'SHOWDOWN_WIN' : null, now: new Date(),
        });
      }
      const updated = await tx.casinoPokerHand.update({ where: { id: row.id }, data: { status: settled ? 'SETTLED' : 'ACTIVE', state: state as unknown as Prisma.InputJsonValue, bankrollAfterCents: bankroll, settledAt: settled ? new Date() : null } });
      const result = await response(tx, playerId, updated);
      await tx.casinoPokerAction.create({ data: { roundPlayerId: playerId, handId: row.id, actionId: input.actionId, kind: input.action, response: result as unknown as Prisma.InputJsonValue } });
      return result;
    });
  },
};
