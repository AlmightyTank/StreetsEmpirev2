import { randomInt } from 'node:crypto';
import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  loadRulesetForRound,
  resolveRouletteSpin,
  rouletteRatingEdgeBps,
  rouletteSelectionPockets,
  type Rng,
  type RouletteBetKind,
  type Ruleset,
} from '@streets/rules-engine';
import type { CasinoRouletteTableRules, CasinoRules } from '@streets/rulesets';
import type {
  CasinoRouletteSpinDto,
  CasinoRouletteSpinInput,
  CasinoRouletteStateDto,
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

type RouletteLedgerMetadata = {
  game: 'ROULETTE';
  tableKey: string;
  tableName: string;
  wheel: 'AMERICAN' | 'EUROPEAN';
  pocket: string;
  color: 'RED' | 'BLACK' | 'GREEN';
  bets: Array<{
    kind: RouletteBetKind;
    selection: string;
    amountCents: number;
    won: boolean;
    returnCents: number;
  }>;
  wagerCents: number;
  returnCents: number;
};

const secureRouletteRng: Rng = () => randomInt(0x1_0000_0000) / 0x1_0000_0000;

function requireCasino(ruleset: Ruleset): CasinoRules {
  const casino = ruleset.casino;
  if (!casino?.enabled) throw AppError.conflict('CASINO_CLOSED', 'Casinos are not open in this round.');
  return casino;
}

function requireRoulette(ruleset: Ruleset): NonNullable<CasinoRules['roulette']> {
  const casino = requireCasino(ruleset);
  if (!casino.roulette) throw AppError.conflict('ROULETTE_CLOSED', 'Roulette is not open in this round.');
  return casino.roulette;
}

function tableFor(ruleset: Ruleset, tableKey: string): CasinoRouletteTableRules {
  const table = requireRoulette(ruleset).tables.find((candidate) => candidate.key === tableKey);
  if (!table) throw AppError.notFound('ROULETTE_TABLE_NOT_FOUND', 'That roulette table is not part of this round.');
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

async function requireTableSession(
  tx: Db,
  player: PlayerRow,
  ruleset: Ruleset,
  casino: CasinoRules,
  table: CasinoRouletteTableRules,
  now: Date,
) {
  const citySlug = await bossCitySlug(tx, ruleset, player, now);
  if (!citySlug) throw AppError.conflict('NOT_AT_CASINO', 'The boss has to be standing in a casino city to play Roulette.');
  const venue = casino.venues[citySlug];
  if (!venue) throw AppError.conflict('NO_CASINO_HERE', 'There is no casino open where the boss is standing.');
  if (!table.venueKinds.includes(venue.kind)) {
    throw AppError.conflict('ROULETTE_TABLE_NOT_HERE', 'That roulette table is not available in this casino.');
  }
  await assertCasinoRoomAccess(tx, ruleset, player, citySlug, table, now);
  const city = await tx.city.findUnique({ where: { slug: citySlug } });
  if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That casino city is not available.');
  const session = await tx.casinoSession.findFirst({
    where: { roundPlayerId: player.id, status: 'OPEN' },
    orderBy: { openedAt: 'desc' },
  });
  if (!session) throw AppError.conflict('CASINO_SESSION_REQUIRED', 'Open a casino bankroll before playing Roulette.');
  if (session.cityId !== city.id) {
    throw AppError.conflict('CASINO_SESSION_ELSEWHERE', 'Your open bankroll belongs to another casino. Close it before playing here.');
  }
  return { city, session };
}

function metadataToDto(
  entry: { actionId: string; sessionChipsAfterCents: bigint; createdAt: Date; metadata: Prisma.JsonValue },
): CasinoRouletteSpinDto {
  const meta = entry.metadata as unknown as Partial<RouletteLedgerMetadata>;
  if (
    meta.game !== 'ROULETTE'
    || typeof meta.tableKey !== 'string'
    || typeof meta.tableName !== 'string'
    || (meta.wheel !== 'AMERICAN' && meta.wheel !== 'EUROPEAN')
    || typeof meta.pocket !== 'string'
    || !Array.isArray(meta.bets)
    || typeof meta.wagerCents !== 'number'
    || typeof meta.returnCents !== 'number'
  ) {
    throw AppError.conflict('ROULETTE_RECEIPT_INVALID', 'That saved roulette spin could not be replayed safely.');
  }
  return {
    actionId: entry.actionId,
    tableKey: meta.tableKey,
    tableName: meta.tableName,
    wheel: meta.wheel,
    pocket: meta.pocket,
    color: meta.color === 'RED' || meta.color === 'BLACK' ? meta.color : 'GREEN',
    bets: meta.bets as CasinoRouletteSpinDto['bets'],
    wagerCents: meta.wagerCents,
    returnCents: meta.returnCents,
    netCents: meta.returnCents - meta.wagerCents,
    bankrollAfterCents: Number(entry.sessionChipsAfterCents),
    createdAt: entry.createdAt.toISOString(),
  };
}

function sameRequest(meta: CasinoRouletteSpinDto, input: CasinoRouletteSpinInput): boolean {
  if (meta.tableKey !== input.tableKey || meta.bets.length !== input.bets.length) return false;
  return meta.bets.every((bet, index) => {
    const requested = input.bets[index];
    return Boolean(
      requested
      && bet.kind === requested.kind
      && bet.selection === requested.selection
      && bet.amountCents === requested.amountCents
    );
  });
}

function validateBets(table: CasinoRouletteTableRules, input: CasinoRouletteSpinInput): void {
  let total = 0;
  const seen = new Set<string>();
  for (const bet of input.bets) {
    if (
      !Number.isSafeInteger(bet.amountCents)
      || bet.amountCents < table.minBetCents
      || bet.amountCents > table.maxBetCents
      || bet.amountCents % table.betStepCents !== 0
    ) {
      throw AppError.badRequest('ROULETTE_WAGER', 'A roulette bet is outside this table\'s posted limits.', {
        bets: 'Use the posted chip increments and per-position limits.',
      });
    }
    const key = bet.kind + ':' + bet.selection;
    if (seen.has(key)) {
      throw AppError.badRequest('ROULETTE_DUPLICATE_BET', 'Combine duplicate roulette positions into one wager.');
    }
    seen.add(key);
    try {
      rouletteSelectionPockets(bet.kind as RouletteBetKind, bet.selection, table.wheel);
    } catch {
      throw AppError.badRequest('ROULETTE_SELECTION', 'That roulette position is not valid for this wheel.');
    }
    total += bet.amountCents;
  }
  if (!Number.isSafeInteger(total) || total > table.maxTotalBetCents) {
    throw AppError.badRequest('ROULETTE_TOTAL_LIMIT', 'That roulette layout exceeds the table maximum.');
  }
}

async function stateInDb(
  db: Db | PrismaClient,
  roundPlayerId: string,
  now: Date,
): Promise<CasinoRouletteStateDto> {
  const { player, ruleset, casino } = await playerAndRules(db, roundPlayerId);
  if (!casino.roulette) return { enabled: false, tables: [], history: [] };
  const citySlug = await bossCitySlug(db, ruleset, player, now);
  const availability = await casinoTableAvailability(db, ruleset, player, citySlug, now);
  const tableAccess = await Promise.all(casino.roulette.tables.map(availability));
  const historyRows = await db.casinoLedgerEntry.findMany({
    where: { roundPlayerId, kind: 'ROULETTE' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 20,
  });
  return {
    enabled: true,
    tables: casino.roulette.tables.map((table, index) => ({
      key: table.key,
      name: table.name,
      blurb: table.blurb,
      wheel: table.wheel,
      minBetCents: table.minBetCents,
      maxBetCents: table.maxBetCents,
      betStepCents: table.betStepCents,
      maxTotalBetCents: table.maxTotalBetCents,
      ...tableAccess[index]!,
    })),
    history: historyRows.map(metadataToDto),
  };
}

export const RouletteService = {
  async state(prisma: PrismaClient, roundPlayerId: string): Promise<CasinoRouletteStateDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    return stateInDb(prisma, roundPlayerId, new Date());
  },

  async spin(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: CasinoRouletteSpinInput,
    rng: Rng = secureRouletteRng,
  ): Promise<CasinoRouletteSpinDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);

      const receipt = await tx.casinoLedgerEntry.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
      });
      if (receipt) {
        if (receipt.kind !== 'ROULETTE') {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different casino action.');
        }
        const saved = metadataToDto(receipt);
        if (!sameRequest(saved, input)) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different roulette layout.');
        }
        return saved;
      }

      const { player, ruleset, casino } = await playerAndRules(tx, roundPlayerId);
      const table = tableFor(ruleset, input.tableKey);
      validateBets(table, input);
      const { city, session } = await requireTableSession(tx, player, ruleset, casino, table, now);

      const [blackjack, dice, poker, pokerSeat] = await Promise.all([
        tx.casinoBlackjackHand.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoStreetDiceRound.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoPokerHand.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoPokerSeat.findFirst({ where: { roundPlayerId, status: { in: ['WAITING', 'PLAYING'] }, table: { status: { in: ['WAITING', 'PLAYING'] } } }, select: { id: true } }),
      ]);
      if (blackjack) throw AppError.conflict('BLACKJACK_HAND_ACTIVE', 'Finish the current blackjack hand before playing Roulette.');
      if (dice) throw AppError.conflict('STREET_DICE_ACTIVE', 'Finish the current Street Dice point before playing Roulette.');
      if (poker) throw AppError.conflict('POKER_HAND_ACTIVE', 'Finish the current Poker hand before playing Roulette.');
      if (pokerSeat) throw AppError.conflict('POKER_TABLE_ACTIVE', 'Leave your multiplayer Poker table before playing Roulette.');

      const math = resolveRouletteSpin(
        table,
        input.bets.map((bet) => ({
          kind: bet.kind as RouletteBetKind,
          selection: bet.selection,
          amountCents: BigInt(bet.amountCents),
        })),
        rng,
      );
      if (session.bankrollCents < math.wagerCents) {
        throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips in the open bankroll for that roulette layout.');
      }

      const bankrollAfter = session.bankrollCents - math.wagerCents + math.returnCents;
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankrollAfter } });
      if (casino.status) {
        await CasinoStatusService.rateWager(tx, ruleset, {
          roundPlayerId, cityId: city.id, wagerCents: math.wagerCents, edgeBps: rouletteRatingEdgeBps(casino.status, table), now,
        });
      }
      const wallet = await tx.casinoWallet.findUnique({
        where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } },
      });

      const metadata: RouletteLedgerMetadata = {
        game: 'ROULETTE',
        tableKey: table.key,
        tableName: table.name,
        wheel: table.wheel,
        pocket: math.pocket,
        color: math.color,
        bets: math.bets.map((bet) => ({
          kind: bet.kind,
          selection: bet.selection,
          amountCents: Number(bet.amountCents),
          won: bet.won,
          returnCents: Number(bet.returnCents),
        })),
        wagerCents: Number(math.wagerCents),
        returnCents: Number(math.returnCents),
      };
      const ledger = await tx.casinoLedgerEntry.create({
        data: {
          roundPlayerId,
          cityId: city.id,
          sessionId: session.id,
          actionId: input.actionId,
          kind: 'ROULETTE',
          sessionChipDeltaCents: math.netCents,
          walletChipsAfterCents: wallet?.chipsCents ?? 0n,
          sessionChipsAfterCents: bankrollAfter,
          metadata: metadata as unknown as Prisma.InputJsonValue,
        },
      });
      await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: true });
      return metadataToDto(ledger);
    });
  },
};
