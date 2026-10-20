import { randomInt } from 'node:crypto';
import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  loadRulesetForRound,
  poolAvailableShots,
  poolBreak,
  poolCanPress,
  poolPlayerShot,
  poolReturnCents,
  poolShotOdds,
  type PoolRackState,
  type PoolShotKind,
  type Rng,
  type Ruleset,
} from '@streets/rules-engine';
import type { CasinoPoolRules, CasinoPoolTableRules, CasinoRules } from '@streets/rulesets';
import type {
  CasinoPoolGameDto,
  CasinoPoolPressInput,
  CasinoPoolRackInput,
  CasinoPoolShotInput,
  CasinoPoolStateDto,
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

type GameRow = {
  id: string;
  roundPlayerId: string;
  sessionId: string;
  cityId: string;
  tableKey: string;
  status: string;
  wagerCents: bigint;
  committedWagerCents: bigint;
  pressed: boolean;
  rack: Prisma.JsonValue;
  totalReturnCents: bigint;
  bankrollAfterCents: bigint;
  createdAt: Date;
  settledAt: Date | null;
};

type PoolActionKind = 'RACK' | 'SHOT' | 'PRESS';

const securePoolRng: Rng = () => randomInt(0x1_0000_0000) / 0x1_0000_0000;

function requireCasino(ruleset: Ruleset): CasinoRules {
  const casino = ruleset.casino;
  if (!casino?.enabled) throw AppError.conflict('CASINO_CLOSED', 'Casinos are not open in this round.');
  return casino;
}

function requirePool(ruleset: Ruleset): CasinoPoolRules {
  const pool = requireCasino(ruleset).pool;
  if (!pool) throw AppError.conflict('POOL_CLOSED', 'Pool is not open in this round.');
  return pool;
}

function tableFor(ruleset: Ruleset, tableKey: string): CasinoPoolTableRules {
  const table = requirePool(ruleset).tables.find((candidate) => candidate.key === tableKey);
  if (!table) throw AppError.notFound('POOL_TABLE_NOT_FOUND', 'That pool table is not part of this round.');
  return table;
}

function isBallList(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((ball) => Number.isInteger(ball) && ball >= 1 && ball <= 15);
}

function parseRack(value: Prisma.JsonValue): PoolRackState {
  const rack = value as unknown as PoolRackState | null;
  if (
    !rack
    || typeof rack !== 'object'
    || !isBallList(rack.playerBalls)
    || !isBallList(rack.hustlerBalls)
    || !['ACTIVE', 'WON', 'LOST'].includes(rack.status)
    || typeof rack.ballInHand !== 'boolean'
    || typeof rack.hustlerVisits !== 'number'
    || !Array.isArray(rack.log)
  ) {
    throw AppError.conflict('POOL_STATE_INVALID', 'The saved pool rack could not be read safely.');
  }
  return rack;
}

function jsonRack(rack: PoolRackState): Prisma.InputJsonValue {
  return {
    playerBalls: [...rack.playerBalls],
    hustlerBalls: [...rack.hustlerBalls],
    status: rack.status,
    finish: rack.finish,
    ballInHand: rack.ballInHand,
    hustlerVisits: rack.hustlerVisits,
    log: rack.log.map((event) => ({ ...event, balls: [...event.balls] })),
  } as Prisma.InputJsonValue;
}

async function playerAndRules(db: Db | PrismaClient, roundPlayerId: string): Promise<{ player: PlayerRow; ruleset: Ruleset; casino: CasinoRules }> {
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    include: { city: true, round: true },
  });
  if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
  const ruleset = loadRulesetForRound(player.round);
  return { player, ruleset, casino: requireCasino(ruleset) };
}

async function bossCitySlug(db: Db | PrismaClient, ruleset: Ruleset, player: PlayerRow, now: Date): Promise<string | null> {
  const visiting = await bossPresence(db, ruleset, player.id, now);
  if (visiting) return visiting.city;
  if (player.movingUntil && player.movingUntil > now) return null;
  const [tripOut, runOut] = await Promise.all([
    db.bossTrip.count({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
    db.run.count({ where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true } }),
  ]);
  return tripOut + runOut > 0 ? null : player.city.slug;
}

async function requireTableSession(
  tx: Db,
  player: PlayerRow,
  ruleset: Ruleset,
  casino: CasinoRules,
  table: CasinoPoolTableRules,
  now: Date,
) {
  const citySlug = await bossCitySlug(tx, ruleset, player, now);
  if (!citySlug) throw AppError.conflict('NOT_AT_CASINO', 'The boss has to be standing in a casino city to play Pool.');
  const venue = casino.venues[citySlug];
  if (!venue) throw AppError.conflict('NO_CASINO_HERE', 'There is no casino open where the boss is standing.');
  if (!table.venueKinds.includes(venue.kind)) {
    throw AppError.conflict('POOL_TABLE_NOT_HERE', 'That pool table is not available in this casino.');
  }
  await assertCasinoRoomAccess(tx, ruleset, player, citySlug, table, now);
  const city = await tx.city.findUnique({ where: { slug: citySlug } });
  if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That casino city is not available.');
  const session = await tx.casinoSession.findFirst({
    where: { roundPlayerId: player.id, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
  if (!session) throw AppError.conflict('CASINO_SESSION_REQUIRED', 'Open a casino bankroll before playing Pool.');
  if (session.cityId !== city.id) {
    throw AppError.conflict('CASINO_SESSION_ELSEWHERE', 'Your open bankroll belongs to another casino. Close it before playing here.');
  }
  return { city, session };
}

function casinoEdge(ruleset: Ruleset): number {
  return ruleset.casino?.status?.ratingEdgeBps.pool ?? 0;
}

function assertWager(table: CasinoPoolTableRules, wagerCents: number): void {
  if (
    !Number.isSafeInteger(wagerCents)
    || wagerCents < table.minBetCents
    || wagerCents > table.maxBetCents
    || wagerCents % table.betStepCents !== 0
  ) {
    throw AppError.badRequest('POOL_WAGER', 'That stake is outside this table\'s posted limits.', {
      wagerCents: 'Use one of this table\'s posted stake increments.',
    });
  }
}

function gameDto(row: GameRow, rules: CasinoPoolRules, table: CasinoPoolTableRules): CasinoPoolGameDto {
  const rack = parseRack(row.rack);
  const totalWagerCents = Number(row.committedWagerCents);
  const totalReturnCents = Number(row.totalReturnCents);
  const bankrollAfterCents = Number(row.bankrollAfterCents);
  const active = rack.status === 'ACTIVE';
  return {
    id: row.id,
    tableKey: table.key,
    tableName: table.name,
    hustlerName: table.hustler.name,
    status: rack.status,
    finish: rack.finish,
    playerBalls: [...rack.playerBalls],
    hustlerBalls: [...rack.hustlerBalls],
    ballInHand: rack.ballInHand,
    pressed: row.pressed,
    canPress: active && poolCanPress(rack, row.pressed) && bankrollAfterCents >= Number(row.wagerCents),
    shots: poolAvailableShots(rack).map((shot) => ({ shot, ...poolShotOdds(rules, rack, shot) })),
    log: rack.log.map((event) => ({ ...event, balls: [...event.balls] })),
    wagerCents: Number(row.wagerCents),
    totalWagerCents,
    totalReturnCents,
    netCents: active ? -totalWagerCents : totalReturnCents - totalWagerCents,
    bankrollAfterCents,
    createdAt: row.createdAt.toISOString(),
    settledAt: row.settledAt?.toISOString() ?? null,
  };
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
    kind: PoolActionKind;
    table: CasinoPoolTableRules;
    game: CasinoPoolGameDto;
    chargeCents: bigint;
    creditedCents: bigint;
    bankrollAfterCents: bigint;
  },
): Promise<void> {
  await tx.casinoLedgerEntry.create({
    data: {
      roundPlayerId: args.roundPlayerId,
      cityId: args.cityId,
      sessionId: args.sessionId,
      actionId: args.actionId,
      kind: 'POOL',
      sessionChipDeltaCents: args.creditedCents - args.chargeCents,
      walletChipsAfterCents: await walletAfter(tx, args.roundPlayerId, args.cityId),
      sessionChipsAfterCents: args.bankrollAfterCents,
      metadata: {
        game: 'POOL',
        action: args.kind,
        gameId: args.game.id,
        tableKey: args.table.key,
        tableName: args.table.name,
        hustlerName: args.table.hustler.name,
        chargeCents: Number(args.chargeCents),
        creditedCents: Number(args.creditedCents),
        totalWagerCents: args.game.totalWagerCents,
        totalReturnCents: args.game.totalReturnCents,
        status: args.game.status,
        finish: args.game.finish,
      } as Prisma.InputJsonValue,
    },
  });
}

async function saveAction(tx: Db, roundPlayerId: string, gameId: string, actionId: string, kind: PoolActionKind, response: CasinoPoolGameDto) {
  await tx.casinoPoolAction.create({
    data: { roundPlayerId, gameId, actionId, kind, response: response as unknown as Prisma.InputJsonValue },
  });
}

function replayDto(value: Prisma.JsonValue): CasinoPoolGameDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw AppError.conflict('POOL_RECEIPT_INVALID', 'That saved pool action could not be replayed safely.');
  }
  return value as unknown as CasinoPoolGameDto;
}

async function assertActionIdFree(tx: Db, roundPlayerId: string, actionId: string): Promise<void> {
  const casinoReceipt = await tx.casinoLedgerEntry.findUnique({
    where: { roundPlayerId_actionId: { roundPlayerId, actionId } },
    select: { id: true },
  });
  if (casinoReceipt) throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different casino action.');
}

/** Other casino games refuse to start while a rack is on the table. */
export async function assertNoActivePoolGame(tx: Db, roundPlayerId: string, game: string): Promise<void> {
  const active = await tx.casinoPoolGame.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } });
  if (active) throw AppError.conflict('POOL_GAME_ACTIVE', `Finish the current pool rack before playing ${game}.`);
}

async function stateInDb(db: Db | PrismaClient, roundPlayerId: string, now: Date): Promise<CasinoPoolStateDto> {
  const { player, ruleset, casino } = await playerAndRules(db, roundPlayerId);
  const rules = casino.pool;
  if (!rules) return { enabled: false, tables: [], activeGame: null, history: [] };

  const citySlug = await bossCitySlug(db, ruleset, player, now);
  const availability = await casinoTableAvailability(db, ruleset, player, citySlug, now);
  const tableAccess = await Promise.all(rules.tables.map(availability));
  const [active, history] = await Promise.all([
    db.casinoPoolGame.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
    db.casinoPoolGame.findMany({
      where: { roundPlayerId, status: 'SETTLED' },
      orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
      take: 12,
    }),
  ]);

  const tableMap = new Map(rules.tables.map((table) => [table.key, table]));
  const dtoFor = (row: GameRow) => {
    const table = tableMap.get(row.tableKey);
    if (!table) throw AppError.conflict('POOL_TABLE_MISSING', 'A saved pool rack references a table that no longer exists.');
    return gameDto(row, rules, table);
  };

  return {
    enabled: true,
    tables: rules.tables.map((table, index) => ({
      key: table.key,
      name: table.name,
      blurb: table.blurb,
      minBetCents: table.minBetCents,
      maxBetCents: table.maxBetCents,
      betStepCents: table.betStepCents,
      hustlerName: table.hustler.name,
      hustlerBlurb: table.hustler.blurb,
      hustlerPotBps: table.hustler.potBps,
      winReturnBps: table.winReturnBps,
      breakAndRunReturnBps: table.breakAndRunReturnBps,
      goldenBreakReturnBps: table.goldenBreakReturnBps,
      ...tableAccess[index]!,
    })),
    activeGame: active ? dtoFor(active) : null,
    history: history.map(dtoFor),
  };
}

/**
 * Persist a rack after a rack/shot/press, settle it if it finished, and write the
 * ledger, rating and receipt. Shared by every pool action.
 */
async function commit(
  tx: Db,
  args: {
    ruleset: Ruleset;
    rules: CasinoPoolRules;
    table: CasinoPoolTableRules;
    row: GameRow;
    rack: PoolRackState;
    pressed: boolean;
    kind: PoolActionKind;
    actionId: string;
    chargeCents: bigint;
    bankrollBeforeCents: bigint;
    now: Date;
  },
): Promise<CasinoPoolGameDto> {
  const { row, rack, table, ruleset, now } = args;
  const roundPlayerId = row.roundPlayerId;
  const committed = row.committedWagerCents + (args.kind === 'RACK' ? 0n : args.chargeCents);
  const settled = rack.status !== 'ACTIVE';
  const creditedCents = settled ? poolReturnCents(committed, table, rack) : 0n;
  const bankrollAfter = args.bankrollBeforeCents - args.chargeCents + creditedCents;

  if (args.chargeCents > 0n || creditedCents > 0n) {
    await tx.casinoSession.update({ where: { id: row.sessionId }, data: { bankrollCents: bankrollAfter } });
  }
  const play = { game: 'POOL' as const, tableKey: table.key, room: table.room, actionId: args.actionId };
  await CasinoStatusService.rateWager(tx, ruleset, {
    roundPlayerId, cityId: row.cityId, wagerCents: args.chargeCents, edgeBps: casinoEdge(ruleset), play, now,
  });

  const updated = await tx.casinoPoolGame.update({
    where: { id: row.id },
    data: {
      status: settled ? 'SETTLED' : 'ACTIVE',
      rack: jsonRack(rack),
      pressed: args.pressed,
      committedWagerCents: committed,
      totalReturnCents: creditedCents,
      bankrollAfterCents: bankrollAfter,
      settledAt: settled ? now : null,
    },
  });
  const dto = gameDto(updated, args.rules, table);

  if (args.chargeCents > 0n || settled) {
    await recordLedger(tx, {
      roundPlayerId, cityId: row.cityId, sessionId: row.sessionId, actionId: args.actionId, kind: args.kind,
      table, game: dto, chargeCents: args.chargeCents, creditedCents, bankrollAfterCents: bankrollAfter,
    });
  }
  if (settled) {
    await CasinoStatusService.recordResult(tx, ruleset, {
      roundPlayerId, cityId: row.cityId, play, stakeCents: committed, returnCents: creditedCents, highlight: null, now,
    });
  }
  await saveAction(tx, roundPlayerId, row.id, args.actionId, args.kind, dto);
  await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: true });
  return dto;
}

async function mutateActiveGame(
  prisma: PrismaClient,
  roundPlayerId: string,
  input: { gameId: string; actionId: string },
  kind: 'SHOT' | 'PRESS',
  shot: PoolShotKind | null,
  rng: Rng,
): Promise<CasinoPoolGameDto> {
  await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await lockRoundPlayer(tx, roundPlayerId);

    const replay = await tx.casinoPoolAction.findUnique({
      where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
    });
    if (replay) {
      if (replay.kind !== kind || replay.gameId !== input.gameId) {
        throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different pool action.');
      }
      return replayDto(replay.response);
    }
    await assertActionIdFree(tx, roundPlayerId, input.actionId);

    const { ruleset } = await playerAndRules(tx, roundPlayerId);
    const rules = requirePool(ruleset);
    const row = await tx.casinoPoolGame.findUnique({ where: { id: input.gameId } });
    if (!row || row.roundPlayerId !== roundPlayerId) throw AppError.notFound('POOL_GAME_NOT_FOUND', 'That pool rack is not yours.');
    if (row.status !== 'ACTIVE') throw AppError.conflict('POOL_GAME_SETTLED', 'That pool rack is already over.');
    const table = tableFor(ruleset, row.tableKey);

    // Like blackjack, a rack already on the table stays playable if the boss leaves:
    // it is tied to the bankroll that started it, not to where the boss stands now.
    const session = await tx.casinoSession.findUnique({ where: { id: row.sessionId } });
    if (!session || session.roundPlayerId !== roundPlayerId || session.status !== 'OPEN' || session.cityId !== row.cityId) {
      throw AppError.conflict('POOL_SESSION_CHANGED', 'The casino bankroll that owns this pool rack is no longer open.');
    }

    const rack = parseRack(row.rack);
    let chargeCents = 0n;
    if (kind === 'PRESS') {
      if (!poolCanPress(rack, row.pressed)) {
        throw AppError.conflict('POOL_PRESS_NOT_ALLOWED', 'You can press once, on your shot, while the hustler is ahead and you do not have ball in hand.');
      }
      chargeCents = row.wagerCents;
      if (session.bankrollCents < chargeCents) {
        throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips to press this rack.');
      }
    } else {
      if (!shot || !poolAvailableShots(rack).includes(shot)) {
        throw AppError.conflict('POOL_SHOT_NOT_ALLOWED', 'That shot is not on right now.');
      }
      poolPlayerShot(rules, table, rack, shot, rng);
    }

    return commit(tx, {
      ruleset, rules, table, row, rack,
      pressed: row.pressed || kind === 'PRESS',
      kind, actionId: input.actionId, chargeCents, bankrollBeforeCents: session.bankrollCents, now,
    });
  });
}

export const PoolService = {
  async state(prisma: PrismaClient, roundPlayerId: string): Promise<CasinoPoolStateDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    return stateInDb(prisma, roundPlayerId, new Date());
  },

  async rack(prisma: PrismaClient, roundPlayerId: string, input: CasinoPoolRackInput, rng: Rng = securePoolRng): Promise<CasinoPoolGameDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);

      const replay = await tx.casinoPoolAction.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
      });
      if (replay) {
        const saved = replayDto(replay.response);
        if (replay.kind !== 'RACK' || saved.tableKey !== input.tableKey || saved.wagerCents !== input.wagerCents) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different pool action.');
        }
        return saved;
      }
      await assertActionIdFree(tx, roundPlayerId, input.actionId);

      const { player, ruleset, casino } = await playerAndRules(tx, roundPlayerId);
      const rules = requirePool(ruleset);
      const table = tableFor(ruleset, input.tableKey);
      assertWager(table, input.wagerCents);

      const [active, blackjack, poker, pokerSeat] = await Promise.all([
        tx.casinoPoolGame.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoBlackjackHand.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoPokerHand.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoPokerSeat.findFirst({ where: { roundPlayerId, status: { in: ['WAITING', 'PLAYING'] }, table: { status: { in: ['WAITING', 'PLAYING'] } } }, select: { id: true } }),
      ]);
      if (active) throw AppError.conflict('POOL_GAME_ACTIVE', 'Finish the current rack before racking another.');
      if (blackjack) throw AppError.conflict('BLACKJACK_HAND_ACTIVE', 'Finish the current blackjack hand before playing Pool.');
      if (poker) throw AppError.conflict('POKER_HAND_ACTIVE', 'Finish the current Poker hand before playing Pool.');
      if (pokerSeat) throw AppError.conflict('POKER_TABLE_ACTIVE', 'Leave your multiplayer Poker table before playing Pool.');

      const { city, session } = await requireTableSession(tx, player, ruleset, casino, table, now);
      const wager = BigInt(input.wagerCents);
      if (session.bankrollCents < wager) {
        throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips in the open bankroll for that stake.');
      }

      const rack = poolBreak(rules, table, rng);
      const row = await tx.casinoPoolGame.create({
        data: {
          roundPlayerId,
          sessionId: session.id,
          cityId: city.id,
          tableKey: table.key,
          status: 'ACTIVE',
          wagerCents: wager,
          committedWagerCents: wager,
          rack: jsonRack(rack),
          bankrollAfterCents: session.bankrollCents - wager,
          initialActionId: input.actionId,
        },
      });
      return commit(tx, {
        ruleset, rules, table, row, rack, pressed: false, kind: 'RACK', actionId: input.actionId,
        chargeCents: wager, bankrollBeforeCents: session.bankrollCents, now,
      });
    });
  },

  shoot(prisma: PrismaClient, roundPlayerId: string, input: CasinoPoolShotInput, rng: Rng = securePoolRng) {
    return mutateActiveGame(prisma, roundPlayerId, input, 'SHOT', input.shot, rng);
  },

  press(prisma: PrismaClient, roundPlayerId: string, input: CasinoPoolPressInput, rng: Rng = securePoolRng) {
    return mutateActiveGame(prisma, roundPlayerId, input, 'PRESS', null, rng);
  },
};
