import { randomInt } from 'node:crypto';
import type { CasinoSession, CasinoStreetDiceRound, Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  loadRulesetForRound,
  rollStreetDice,
  streetDiceComeOut,
  streetDiceLineReturnCents,
  streetDiceOddsReturnCents,
  streetDicePointResult,
  streetDiceRatingEdgeBps,
  type Rng,
  type Ruleset,
} from '@streets/rules-engine';
import type { CasinoRules, CasinoStreetDiceTableRules } from '@streets/rulesets';
import type {
  CasinoStreetDiceOddsInput,
  CasinoStreetDiceRollInput,
  CasinoStreetDiceRoundDto,
  CasinoStreetDiceStartInput,
  CasinoStreetDiceStateDto,
} from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { bossPresence } from './boss-presence.service.js';
import { CasinoStatusService, assertCasinoRoomAccess, casinoTableAvailability } from './casino-status.service.js';
import { PlayerStateService } from './player-state.service.js';

type PlayerRow = RoundPlayer & {
  city: { id: string; slug: string; name: string };
  round: { rulesetId: string; rulesetVersion: string };
};

const secureDiceRng: Rng = () => randomInt(0x1_0000_0000) / 0x1_0000_0000;

function requireCasino(ruleset: Ruleset): CasinoRules {
  const casino = ruleset.casino;
  if (!casino?.enabled) throw AppError.conflict('CASINO_CLOSED', 'Casinos are not open in this round.');
  return casino;
}

function requireStreetDice(ruleset: Ruleset): NonNullable<CasinoRules['streetDice']> {
  const casino = requireCasino(ruleset);
  if (!casino.streetDice) throw AppError.conflict('STREET_DICE_CLOSED', 'Street Dice is not open in this round.');
  return casino.streetDice;
}

function tableFor(ruleset: Ruleset, tableKey: string): CasinoStreetDiceTableRules {
  const table = requireStreetDice(ruleset).tables.find((candidate) => candidate.key === tableKey);
  if (!table) throw AppError.notFound('STREET_DICE_TABLE_NOT_FOUND', 'That Street Dice table is not part of this round.');
  return table;
}

async function playerAndRules(
  db: Db | PrismaClient,
  roundPlayerId: string,
): Promise<{ player: PlayerRow; ruleset: Ruleset; casino: CasinoRules }> {
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    include: { city: true, round: true },
  });
  if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
  const ruleset = loadRulesetForRound(player.round);
  return { player, ruleset, casino: requireCasino(ruleset) };
}

async function bossCitySlug(
  db: Db | PrismaClient,
  ruleset: Ruleset,
  player: PlayerRow,
  now: Date,
): Promise<string | null> {
  const visiting = await bossPresence(db, ruleset, player.id, now);
  if (visiting) return visiting.city;
  if (player.movingUntil && player.movingUntil > now) return null;
  const [tripOut, runOut] = await Promise.all([
    db.bossTrip.count({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
    db.run.count({ where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true } }),
  ]);
  return tripOut + runOut > 0 ? null : player.city.slug;
}

function parseDice(value: Prisma.JsonValue): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [a, b] = value;
  if (
    typeof a !== 'number'
    || typeof b !== 'number'
    || !Number.isInteger(a)
    || !Number.isInteger(b)
    || a < 1
    || a > 6
    || b < 1
    || b > 6
  ) return null;
  return [a, b];
}

function diceJson(dice: [number, number]): Prisma.InputJsonValue {
  return [dice[0], dice[1]] as Prisma.InputJsonValue;
}

function roundDto(
  row: {
    id: string;
    tableKey: string;
    status: string;
    lineWagerCents: bigint;
    oddsWagerCents: bigint;
    point: number | null;
    lastDice: Prisma.JsonValue;
    lastOutcome: string | null;
    totalReturnCents: bigint;
    bankrollAfterCents: bigint;
    rollCount: number;
    createdAt: Date;
    settledAt: Date | null;
  },
  table: CasinoStreetDiceTableRules,
): CasinoStreetDiceRoundDto {
  const dice = parseDice(row.lastDice);
  const committed = row.lineWagerCents + row.oddsWagerCents;
  const maxOddsCents = Number(row.lineWagerCents) * table.maxOddsMultiple;
  const active = row.status === 'ACTIVE';
  const outcome = row.lastOutcome === 'WIN'
    || row.lastOutcome === 'LOSE'
    || row.lastOutcome === 'POINT'
    || row.lastOutcome === 'CONTINUE'
    ? row.lastOutcome
    : null;
  return {
    id: row.id,
    tableKey: table.key,
    tableName: table.name,
    status: active ? 'ACTIVE' : 'SETTLED',
    lineWagerCents: Number(row.lineWagerCents),
    oddsWagerCents: Number(row.oddsWagerCents),
    point: row.point,
    dice,
    total: dice ? dice[0] + dice[1] : null,
    outcome,
    totalReturnCents: Number(row.totalReturnCents),
    netCents: Number(row.totalReturnCents - committed),
    bankrollAfterCents: Number(row.bankrollAfterCents),
    rollCount: row.rollCount,
    canRoll: active && row.point !== null,
    canAddOdds: active && row.point !== null && Number(row.oddsWagerCents) < maxOddsCents,
    maxOddsCents,
    createdAt: row.createdAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
  };
}

function replayDto(value: Prisma.JsonValue): CasinoStreetDiceRoundDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw AppError.conflict('STREET_DICE_RECEIPT_INVALID', 'That saved Street Dice action could not be replayed safely.');
  }
  return value as unknown as CasinoStreetDiceRoundDto;
}

async function saveAction(
  tx: Db,
  roundPlayerId: string,
  diceRoundId: string,
  actionId: string,
  kind: string,
  response: CasinoStreetDiceRoundDto,
): Promise<void> {
  await tx.casinoStreetDiceAction.create({
    data: {
      roundPlayerId,
      diceRoundId,
      actionId,
      kind,
      response: response as unknown as Prisma.InputJsonValue,
    },
  });
}

async function walletAfter(tx: Db, roundPlayerId: string, cityId: string): Promise<bigint> {
  const wallet = await tx.casinoWallet.findUnique({
    where: { roundPlayerId_cityId: { roundPlayerId, cityId } },
  });
  return wallet?.chipsCents ?? 0n;
}

async function recordLedger(
  tx: Db,
  args: {
    roundPlayerId: string;
    cityId: string;
    sessionId: string;
    actionId: string;
    action: 'START' | 'ADD_ODDS' | 'ROLL';
    table: CasinoStreetDiceTableRules;
    round: CasinoStreetDiceRoundDto;
    sessionDeltaCents: bigint;
    bankrollAfterCents: bigint;
    walletAfterCents: bigint;
    chargeCents: bigint;
    creditedCents: bigint;
  },
): Promise<void> {
  await tx.casinoLedgerEntry.create({
    data: {
      roundPlayerId: args.roundPlayerId,
      cityId: args.cityId,
      sessionId: args.sessionId,
      actionId: args.actionId,
      kind: 'STREET_DICE',
      sessionChipDeltaCents: args.sessionDeltaCents,
      walletChipsAfterCents: args.walletAfterCents,
      sessionChipsAfterCents: args.bankrollAfterCents,
      metadata: {
        game: 'STREET_DICE',
        action: args.action,
        tableKey: args.table.key,
        tableName: args.table.name,
        diceRoundId: args.round.id,
        lineWagerCents: args.round.lineWagerCents,
        oddsWagerCents: args.round.oddsWagerCents,
        point: args.round.point,
        dice: args.round.dice,
        total: args.round.total,
        outcome: args.round.outcome,
        chargeCents: Number(args.chargeCents),
        creditedCents: Number(args.creditedCents),
        settled: args.round.status === 'SETTLED',
      } as Prisma.InputJsonValue,
    },
  });
}

async function requireStartSession(
  tx: Db,
  player: PlayerRow,
  ruleset: Ruleset,
  casino: CasinoRules,
  table: CasinoStreetDiceTableRules,
  now: Date,
) {
  const citySlug = await bossCitySlug(tx, ruleset, player, now);
  if (!citySlug) throw AppError.conflict('NOT_AT_CASINO', 'The boss has to be standing in a casino city to play Street Dice.');
  const venue = casino.venues[citySlug];
  if (!venue) throw AppError.conflict('NO_CASINO_HERE', 'There is no casino open where the boss is standing.');
  if (!table.venueKinds.includes(venue.kind)) {
    throw AppError.conflict('STREET_DICE_TABLE_NOT_HERE', 'That Street Dice table is not available in this casino.');
  }
  await assertCasinoRoomAccess(tx, ruleset, player, citySlug, table, now);
  const city = await tx.city.findUnique({ where: { slug: citySlug } });
  if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That casino city is not available.');
  const session = await tx.casinoSession.findFirst({
    where: { roundPlayerId: player.id, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
  if (!session) throw AppError.conflict('CASINO_SESSION_REQUIRED', 'Open a casino bankroll before playing Street Dice.');
  if (session.cityId !== city.id) {
    throw AppError.conflict('CASINO_SESSION_ELSEWHERE', 'Your open bankroll belongs to another casino. Close it before playing here.');
  }
  return { city, session };
}

function assertLineWager(table: CasinoStreetDiceTableRules, wagerCents: number): void {
  if (
    !Number.isSafeInteger(wagerCents)
    || wagerCents < table.minBetCents
    || wagerCents > table.maxBetCents
    || wagerCents % table.betStepCents !== 0
  ) {
    throw AppError.badRequest('STREET_DICE_WAGER', 'That line bet is outside this table\'s posted limits.', {
      wagerCents: 'Use one of this table\'s posted wager increments.',
    });
  }
}

async function stateInDb(
  db: Db | PrismaClient,
  roundPlayerId: string,
  now: Date,
): Promise<CasinoStreetDiceStateDto> {
  const { player, ruleset, casino } = await playerAndRules(db, roundPlayerId);
  if (!casino.streetDice) return { enabled: false, tables: [], activeRound: null, history: [] };
  const citySlug = await bossCitySlug(db, ruleset, player, now);
  const availability = await casinoTableAvailability(db, ruleset, player, citySlug, now);
  const tableAccess = await Promise.all(casino.streetDice.tables.map(availability));
  const [active, history] = await Promise.all([
    db.casinoStreetDiceRound.findFirst({
      where: { roundPlayerId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    }),
    db.casinoStreetDiceRound.findMany({
      where: { roundPlayerId, status: 'SETTLED' },
      orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
      take: 20,
    }),
  ]);
  const tableMap = new Map(casino.streetDice.tables.map((table) => [table.key, table]));
  const dtoFor = (row: NonNullable<typeof active>) => {
    const table = tableMap.get(row.tableKey);
    if (!table) throw AppError.conflict('STREET_DICE_TABLE_MISSING', 'A saved Street Dice round references a table that no longer exists.');
    return roundDto(row, table);
  };
  return {
    enabled: true,
    tables: casino.streetDice.tables.map((table, index) => ({
      key: table.key,
      name: table.name,
      blurb: table.blurb,
      minBetCents: table.minBetCents,
      maxBetCents: table.maxBetCents,
      betStepCents: table.betStepCents,
      maxOddsMultiple: table.maxOddsMultiple,
      ...tableAccess[index]!,
    })),
    activeRound: active ? dtoFor(active) : null,
    history: history.map((row) => dtoFor(row as NonNullable<typeof active>)),
  };
}

async function activeActionPrelude(
  prisma: PrismaClient,
  roundPlayerId: string,
  roundId: string,
  actionId: string,
  kind: 'ROLL' | 'ADD_ODDS',
): Promise<{
  now: Date;
  run: (tx: Db) => Promise<{
    row: CasinoStreetDiceRound;
    table: CasinoStreetDiceTableRules;
    session: CasinoSession;
    ruleset: Ruleset;
    replay: CasinoStreetDiceRoundDto | null;
  }>;
}> {
  await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
  const now = new Date();
  return {
    now,
    run: async (tx) => {
      const receipt = await tx.casinoStreetDiceAction.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId } },
      });
      if (receipt) {
        if (receipt.kind !== kind || receipt.diceRoundId !== roundId) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different Street Dice action.');
        }
        return {
          row: null as never,
          table: null as never,
          session: null as never,
          ruleset: null as never,
          replay: replayDto(receipt.response),
        };
      }
      const casinoReceipt = await tx.casinoLedgerEntry.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId } },
        select: { id: true },
      });
      if (casinoReceipt) {
        throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different casino action.');
      }
      const { ruleset } = await playerAndRules(tx, roundPlayerId);
      const row = await tx.casinoStreetDiceRound.findUnique({ where: { id: roundId } });
      if (!row || row.roundPlayerId !== roundPlayerId) {
        throw AppError.notFound('STREET_DICE_ROUND_NOT_FOUND', 'That Street Dice round is not yours.');
      }
      if (row.status !== 'ACTIVE') {
        throw AppError.conflict('STREET_DICE_ROUND_SETTLED', 'That Street Dice round is already settled.');
      }
      const table = tableFor(ruleset, row.tableKey);
      const session = await tx.casinoSession.findUnique({ where: { id: row.sessionId } });
      if (
        !session
        || session.roundPlayerId !== roundPlayerId
        || session.status !== 'OPEN'
        || session.cityId !== row.cityId
      ) {
        throw AppError.conflict('STREET_DICE_SESSION_CHANGED', 'The casino bankroll that owns this Street Dice point is no longer open.');
      }
      return { row, table, session, ruleset, replay: null };
    },
  };
}

export const StreetDiceService = {
  async state(prisma: PrismaClient, roundPlayerId: string): Promise<CasinoStreetDiceStateDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    return stateInDb(prisma, roundPlayerId, new Date());
  },

  async start(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: CasinoStreetDiceStartInput,
    rng: Rng = secureDiceRng,
  ): Promise<CasinoStreetDiceRoundDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);

      const replay = await tx.casinoStreetDiceAction.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
      });
      if (replay) {
        if (replay.kind !== 'START') {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to another Street Dice action.');
        }
        const saved = replayDto(replay.response);
        if (saved.tableKey !== input.tableKey || saved.lineWagerCents !== input.wagerCents) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different Street Dice start.');
        }
        return saved;
      }
      const casinoReceipt = await tx.casinoLedgerEntry.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
        select: { id: true },
      });
      if (casinoReceipt) {
        throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different casino action.');
      }

      const { player, ruleset, casino } = await playerAndRules(tx, roundPlayerId);
      const table = tableFor(ruleset, input.tableKey);
      assertLineWager(table, input.wagerCents);

      const [activeDice, activeBlackjack, activePoker, pokerSeat] = await Promise.all([
        tx.casinoStreetDiceRound.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoBlackjackHand.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoPokerHand.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoPokerSeat.findFirst({ where: { roundPlayerId, status: { in: ['WAITING', 'PLAYING'] }, table: { status: { in: ['WAITING', 'PLAYING'] } } }, select: { id: true } }),
      ]);
      if (activeDice) throw AppError.conflict('STREET_DICE_ACTIVE', 'Finish the current Street Dice point before starting another.');
      if (activeBlackjack) throw AppError.conflict('BLACKJACK_HAND_ACTIVE', 'Finish the current blackjack hand before playing Street Dice.');
      if (activePoker) throw AppError.conflict('POKER_HAND_ACTIVE', 'Finish the current Poker hand before playing Street Dice.');
      if (pokerSeat) throw AppError.conflict('POKER_TABLE_ACTIVE', 'Leave your multiplayer Poker table before playing Street Dice.');

      const { city, session } = await requireStartSession(tx, player, ruleset, casino, table, now);
      const wager = BigInt(input.wagerCents);
      if (session.bankrollCents < wager) {
        throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips in the open bankroll for that Street Dice line bet.');
      }

      const dice = rollStreetDice(rng);
      const total = dice[0] + dice[1];
      const comeOut = streetDiceComeOut(total);
      const settled = comeOut !== 'POINT';
      const point = comeOut === 'POINT' ? total : null;
      const returned = comeOut === 'WIN' ? streetDiceLineReturnCents(wager, true) : 0n;
      const bankrollAfter = session.bankrollCents - wager + returned;

      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankrollAfter } });
      if (casino.status) {
        await CasinoStatusService.rateWager(tx, ruleset, {
          roundPlayerId, cityId: city.id, wagerCents: wager, edgeBps: streetDiceRatingEdgeBps(casino.status, 'LINE'),
          play: { game: 'STREET_DICE', tableKey: table.key, room: table.room, actionId: input.actionId }, now,
        });
      }
      const row = await tx.casinoStreetDiceRound.create({
        data: {
          roundPlayerId,
          sessionId: session.id,
          cityId: city.id,
          tableKey: table.key,
          status: settled ? 'SETTLED' : 'ACTIVE',
          lineWagerCents: wager,
          oddsWagerCents: 0n,
          point,
          lastDice: diceJson(dice),
          lastOutcome: comeOut,
          rollCount: 1,
          totalReturnCents: returned,
          bankrollAfterCents: bankrollAfter,
          initialActionId: input.actionId,
          settledAt: settled ? now : null,
        },
      });
      const dto = roundDto(row, table);
      const wallet = await walletAfter(tx, roundPlayerId, city.id);
      await recordLedger(tx, {
        roundPlayerId,
        cityId: city.id,
        sessionId: session.id,
        actionId: input.actionId,
        action: 'START',
        table,
        round: dto,
        sessionDeltaCents: returned - wager,
        bankrollAfterCents: bankrollAfter,
        walletAfterCents: wallet,
        chargeCents: wager,
        creditedCents: returned,
      });
      if (settled) {
        await CasinoStatusService.recordResult(tx, ruleset, {
          roundPlayerId, cityId: city.id, play: { game: 'STREET_DICE', tableKey: table.key, room: table.room, actionId: input.actionId },
          stakeCents: wager, returnCents: returned, highlight: null, now,
        });
      }
      await saveAction(tx, roundPlayerId, row.id, input.actionId, 'START', dto);
      await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: true });
      return dto;
    });
  },

  async roll(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: CasinoStreetDiceRollInput,
    rng: Rng = secureDiceRng,
  ): Promise<CasinoStreetDiceRoundDto> {
    const prelude = await activeActionPrelude(prisma, roundPlayerId, input.roundId, input.actionId, 'ROLL');
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const loaded = await prelude.run(tx);
      if (loaded.replay) return loaded.replay;
      const { row, table, session } = loaded;
      if (row.point === null) throw AppError.conflict('STREET_DICE_NO_POINT', 'There is no point waiting for another roll.');

      const dice = rollStreetDice(rng);
      const total = dice[0] + dice[1];
      const result = streetDicePointResult(total, row.point);
      const settled = result !== 'CONTINUE';
      const won = result === 'WIN';
      const lineReturn = settled ? streetDiceLineReturnCents(row.lineWagerCents, won) : 0n;
      const oddsReturn = settled ? streetDiceOddsReturnCents(row.oddsWagerCents, row.point, won) : 0n;
      const credited = lineReturn + oddsReturn;
      const bankrollAfter = session.bankrollCents + credited;

      if (credited > 0n) {
        await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankrollAfter } });
      }
      const updated = await tx.casinoStreetDiceRound.update({
        where: { id: row.id },
        data: {
          status: settled ? 'SETTLED' : 'ACTIVE',
          lastDice: diceJson(dice),
          lastOutcome: result,
          rollCount: { increment: 1 },
          totalReturnCents: settled ? credited : row.totalReturnCents,
          bankrollAfterCents: bankrollAfter,
          settledAt: settled ? prelude.now : null,
        },
      });
      const dto = roundDto(updated, table);
      const wallet = await walletAfter(tx, roundPlayerId, row.cityId);
      await recordLedger(tx, {
        roundPlayerId,
        cityId: row.cityId,
        sessionId: session.id,
        actionId: input.actionId,
        action: 'ROLL',
        table,
        round: dto,
        sessionDeltaCents: credited,
        bankrollAfterCents: bankrollAfter,
        walletAfterCents: wallet,
        chargeCents: 0n,
        creditedCents: credited,
      });
      if (settled) {
        await CasinoStatusService.recordResult(tx, loaded.ruleset, {
          roundPlayerId, cityId: row.cityId, play: { game: 'STREET_DICE', tableKey: table.key, room: table.room, actionId: input.actionId },
          stakeCents: row.lineWagerCents + row.oddsWagerCents, returnCents: credited, highlight: won ? 'POINT_MADE' : null, now: prelude.now,
        });
      }
      await saveAction(tx, roundPlayerId, row.id, input.actionId, 'ROLL', dto);
      await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now: prelude.now, markActive: true });
      return dto;
    });
  },

  async addOdds(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: CasinoStreetDiceOddsInput,
  ): Promise<CasinoStreetDiceRoundDto> {
    const prelude = await activeActionPrelude(prisma, roundPlayerId, input.roundId, input.actionId, 'ADD_ODDS');
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const loaded = await prelude.run(tx);
      if (loaded.replay) return loaded.replay;
      const { row, table, session } = loaded;
      if (row.point === null) throw AppError.conflict('STREET_DICE_NO_POINT', 'Odds are only available after a point is set.');
      if (
        !Number.isSafeInteger(input.amountCents)
        || input.amountCents <= 0
        || input.amountCents % table.betStepCents !== 0
      ) {
        throw AppError.badRequest('STREET_DICE_ODDS', 'Use this table\'s posted chip increment for odds.');
      }

      const maxOdds = row.lineWagerCents * BigInt(table.maxOddsMultiple);
      const amount = BigInt(input.amountCents);
      if (row.oddsWagerCents + amount > maxOdds) {
        throw AppError.badRequest('STREET_DICE_ODDS_LIMIT', 'That would exceed this table\'s maximum true-odds backing.');
      }
      if (session.bankrollCents < amount) {
        throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips to back the point with those odds.');
      }

      const bankrollAfter = session.bankrollCents - amount;
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankrollAfter } });
      // True odds have no house edge: they count as action but add no theo.
      const status = loaded.ruleset.casino?.status;
      if (status) {
        await CasinoStatusService.rateWager(tx, loaded.ruleset, {
          roundPlayerId, cityId: row.cityId, wagerCents: amount, edgeBps: streetDiceRatingEdgeBps(status, 'ODDS'),
          play: { game: 'STREET_DICE', tableKey: table.key, room: table.room, actionId: input.actionId }, now: prelude.now,
        });
      }
      const updated = await tx.casinoStreetDiceRound.update({
        where: { id: row.id },
        data: {
          oddsWagerCents: { increment: amount },
          bankrollAfterCents: bankrollAfter,
        },
      });
      const dto = roundDto(updated, table);
      const wallet = await walletAfter(tx, roundPlayerId, row.cityId);
      await recordLedger(tx, {
        roundPlayerId,
        cityId: row.cityId,
        sessionId: session.id,
        actionId: input.actionId,
        action: 'ADD_ODDS',
        table,
        round: dto,
        sessionDeltaCents: -amount,
        bankrollAfterCents: bankrollAfter,
        walletAfterCents: wallet,
        chargeCents: amount,
        creditedCents: 0n,
      });
      await saveAction(tx, roundPlayerId, row.id, input.actionId, 'ADD_ODDS', dto);
      await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now: prelude.now, markActive: true });
      return dto;
    });
  },
};
