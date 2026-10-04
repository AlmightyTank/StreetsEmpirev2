import { randomInt } from 'node:crypto';
import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  casinoCompsCoverHotel,
  checkExtend,
  effectiveSlotRtpBps,
  loadRulesetForRound,
  slotRatingEdgeBps,
  tripRules,
  resolveSlotSpin,
  rollSlotFreeSpinAward,
  slotTotalWagerCents,
  theoreticalSlotRtpBps,
  type Rng,
  type Ruleset,
} from '@streets/rules-engine';
import type { CasinoRules, CasinoSlotMachineRules } from '@streets/rulesets';
import type {
  CasinoCashierInput,
  CasinoCompHotelInput,
  CasinoLedgerEntryDto,
  CasinoPageDto,
  CasinoSessionStartInput,
  CasinoSlotSpinDto,
  CasinoSlotSpinInput,
  CasinoSlotSpinResponseDto,
  CasinoVenueDto,
} from '@streets/shared';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActivityService } from './activity.service.js';
import { bossPresence } from './boss-presence.service.js';
import { CasinoStatusService, casinoCompBalanceCents, casinoSessionMaxCents } from './casino-status.service.js';
import { PlayerStateService } from './player-state.service.js';
import { refreshAwayWorth } from './run-settle.service.js';
import { pokerCommittedCents } from './casino-poker-committed.js';

type PlayerRow = RoundPlayer & {
  city: { id: string; slug: string; name: string };
  round: { rulesetId: string; rulesetVersion: string; endsAt: Date };
};

type SlotLedgerMetadata = {
  machineKey: string;
  machineName: string;
  betPerLineCents: number;
  activePaylineKeys: string[];
  wagerCents: number;
  chargedWagerCents: number;
  isFreeSpin: boolean;
  payoutCents: number;
  payoutBps: number;
  grid: Array<Array<{ key: string; label: string; glyph: string }>>;
  reelStops: number[];
  winningLines: Array<{
    paylineKey: string;
    paylineName: string;
    symbolKey: string;
    symbolLabel: string;
    matchCount: number;
    payoutCents: number;
    positions: Array<{ reel: number; row: number }>;
  }>;
  nearMiss: {
    paylineKey: string;
    symbolKey: string;
    symbolLabel: string;
    reel: number;
  } | null;
  winTier: CasinoSlotSpinDto['winTier'];
  jackpotContributionCents: number;
  jackpotAwardCents: number;
  freeSpinsAwarded: number;
  freeSpinsRemainingAfter: number;
};

const secureCasinoRng: Rng = () => randomInt(0x1_0000_0000) / 0x1_0000_0000;

function slotSpinDto(
  entry: { actionId: string; sessionChipsAfterCents: bigint; createdAt: Date; metadata: Prisma.JsonValue },
): CasinoSlotSpinDto {
  const meta = entry.metadata as unknown as SlotLedgerMetadata;
  if (
    !meta
    || !Array.isArray(meta.grid)
    || meta.grid.length !== 3
    || !meta.grid.every((row) => Array.isArray(row))
    || !Array.isArray(meta.reelStops)
    || !Array.isArray(meta.activePaylineKeys)
    || !Array.isArray(meta.winningLines)
  ) {
    throw AppError.conflict('CASINO_RECEIPT_INVALID', 'That saved casino spin could not be replayed safely.');
  }
  return {
    actionId: entry.actionId,
    machineKey: meta.machineKey,
    machineName: meta.machineName,
    betPerLineCents: meta.betPerLineCents,
    activePaylineKeys: meta.activePaylineKeys,
    wagerCents: meta.wagerCents,
    chargedWagerCents: meta.chargedWagerCents,
    isFreeSpin: meta.isFreeSpin,
    payoutCents: meta.payoutCents,
    netCents: meta.payoutCents - meta.chargedWagerCents,
    payoutBps: meta.payoutBps,
    grid: meta.grid,
    reelStops: meta.reelStops,
    winningLines: meta.winningLines,
    nearMiss: meta.nearMiss,
    winTier: meta.winTier,
    jackpotContributionCents: meta.jackpotContributionCents,
    jackpotAwardCents: meta.jackpotAwardCents,
    freeSpinsAwarded: meta.freeSpinsAwarded,
    freeSpinsRemainingAfter: meta.freeSpinsRemainingAfter,
    bankrollAfterCents: Number(entry.sessionChipsAfterCents),
    createdAt: entry.createdAt.toISOString(),
  };
}

function slotWinTier(
  payoutCents: bigint,
  nominalWagerCents: bigint,
  jackpotAwardCents: bigint,
): CasinoSlotSpinDto['winTier'] {
  if (jackpotAwardCents > 0n) return 'JACKPOT';
  if (payoutCents <= 0n) return 'NONE';
  if (nominalWagerCents > 0n && payoutCents >= nominalWagerCents * 20n) return 'MEGA';
  if (nominalWagerCents > 0n && payoutCents >= nominalWagerCents * 5n) return 'BIG';
  return 'SMALL';
}

function ledgerDisplay(entry: {
  kind: string;
  cashDeltaCents: bigint;
  walletChipDeltaCents: bigint;
  sessionChipDeltaCents: bigint;
  metadata: Prisma.JsonValue;
}): CasinoLedgerEntryDto['display'] {
  const abs = (value: bigint) => Number(value < 0n ? -value : value);
  if (entry.kind === 'BUY_CHIPS') {
    return {
      title: 'Bought chips',
      detail: 'Cash moved into your casino chip wallet.',
      amountLabel: 'Exchanged',
      amountCents: abs(entry.cashDeltaCents),
      tone: 'neutral',
    };
  }
  if (entry.kind === 'REDEEM_CHIPS') {
    return {
      title: 'Cashed out chips',
      detail: 'Casino chips were redeemed back to cash.',
      amountLabel: 'Redeemed',
      amountCents: abs(entry.cashDeltaCents),
      tone: 'neutral',
    };
  }
  if (entry.kind === 'SESSION_OPEN') {
    return {
      title: 'Opened floor bankroll',
      detail: 'Chips moved from the city wallet onto the casino floor.',
      amountLabel: 'Bankroll',
      amountCents: abs(entry.sessionChipDeltaCents),
      tone: 'neutral',
    };
  }
  if (entry.kind === 'SESSION_CLOSE') {
    return {
      title: 'Closed floor bankroll',
      detail: 'Remaining floor chips returned to the city wallet.',
      amountLabel: 'Returned',
      amountCents: abs(entry.walletChipDeltaCents),
      tone: 'neutral',
    };
  }
  if (entry.kind === 'SLOT_SPIN') {
    const meta = entry.metadata as unknown as Partial<SlotLedgerMetadata>;
    const wager = typeof meta.wagerCents === 'number' ? meta.wagerCents : abs(entry.sessionChipDeltaCents);
    const charged = typeof meta.chargedWagerCents === 'number' ? meta.chargedWagerCents : wager;
    const payout = typeof meta.payoutCents === 'number'
      ? meta.payoutCents
      : Math.max(0, charged + Number(entry.sessionChipDeltaCents));
    const machine = typeof meta.machineName === 'string' ? meta.machineName : 'Slots';
    const wins = Array.isArray(meta.winningLines) ? meta.winningLines.length : 0;
    const jackpot = typeof meta.jackpotAwardCents === 'number' ? meta.jackpotAwardCents : 0;
    const freeAward = typeof meta.freeSpinsAwarded === 'number' ? meta.freeSpinsAwarded : 0;
    const isFree = meta.isFreeSpin === true;
    const net = Number(entry.sessionChipDeltaCents);
    return {
      title: jackpot > 0
        ? 'Jackpot on ' + machine
        : isFree ? 'Free spin on ' + machine : 'Spin on ' + machine,
      detail: (isFree ? 'Casino covered ' : 'Bet ') + formatLedgerMoney(wager)
        + ' · paid ' + formatLedgerMoney(payout)
        + (wins > 0 ? ' · ' + wins + ' winning line' + (wins === 1 ? '' : 's') : ' · no winning lines')
        + (freeAward > 0 ? ' · ' + freeAward + ' free spin' + (freeAward === 1 ? '' : 's') + ' awarded' : ''),
      amountLabel: net > 0 ? 'Won' : net < 0 ? 'Lost' : isFree ? 'No win' : 'Push',
      amountCents: Math.abs(net),
      tone: net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral',
    };
  }
  if (entry.kind === 'BLACKJACK') {
    const meta = entry.metadata as unknown as {
      action?: string;
      tableName?: string;
      chargeCents?: number;
      creditedCents?: number;
      totalWagerCents?: number;
      totalReturnCents?: number;
      settled?: boolean;
      outcomes?: Array<string | null>;
    };
    const action = typeof meta.action === 'string' ? meta.action : 'HAND';
    const tableName = typeof meta.tableName === 'string' ? meta.tableName : 'Blackjack';
    const charge = typeof meta.chargeCents === 'number' ? meta.chargeCents : 0;
    const credited = typeof meta.creditedCents === 'number' ? meta.creditedCents : 0;
    const net = Number(entry.sessionChipDeltaCents);
    const outcomes = Array.isArray(meta.outcomes) ? meta.outcomes.filter((value): value is string => typeof value === 'string') : [];
    const summary = outcomes.length ? ' · ' + outcomes.join(' / ').toLowerCase() : '';
    return {
      title: action === 'DEAL' ? 'Blackjack at ' + tableName : 'Blackjack · ' + action.toLowerCase(),
      detail: (charge > 0 ? 'Put up ' + formatLedgerMoney(charge) : 'No extra wager')
        + (credited > 0 ? ' · returned ' + formatLedgerMoney(credited) : '')
        + summary,
      amountLabel: net > 0 ? 'Won' : net < 0 ? 'Wagered' : meta.settled ? 'Push / loss' : 'No change',
      amountCents: Math.abs(net),
      tone: net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral',
    };
  }
  if (entry.kind === 'ROULETTE') {
    const meta = entry.metadata as unknown as {
      tableName?: string;
      pocket?: string;
      wagerCents?: number;
      returnCents?: number;
    };
    const tableName = typeof meta.tableName === 'string' ? meta.tableName : 'Roulette';
    const pocket = typeof meta.pocket === 'string' ? meta.pocket : '?';
    const wager = typeof meta.wagerCents === 'number' ? meta.wagerCents : 0;
    const returned = typeof meta.returnCents === 'number' ? meta.returnCents : 0;
    const net = Number(entry.sessionChipDeltaCents);
    return {
      title: 'Roulette at ' + tableName,
      detail: 'Pocket ' + pocket + ' · bet ' + formatLedgerMoney(wager) + ' · returned ' + formatLedgerMoney(returned),
      amountLabel: net > 0 ? 'Won' : net < 0 ? 'Lost' : 'Push',
      amountCents: Math.abs(net),
      tone: net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral',
    };
  }
  if (entry.kind === 'STREET_DICE') {
    const meta = entry.metadata as unknown as {
      action?: string;
      tableName?: string;
      point?: number | null;
      total?: number | null;
      outcome?: string | null;
      chargeCents?: number;
      creditedCents?: number;
    };
    const tableName = typeof meta.tableName === 'string' ? meta.tableName : 'Street Dice';
    const action = typeof meta.action === 'string' ? meta.action : 'ROLL';
    const charge = typeof meta.chargeCents === 'number' ? meta.chargeCents : 0;
    const credited = typeof meta.creditedCents === 'number' ? meta.creditedCents : 0;
    const net = Number(entry.sessionChipDeltaCents);
    const roll = typeof meta.total === 'number' ? ' · rolled ' + meta.total : '';
    const point = typeof meta.point === 'number' ? ' · point ' + meta.point : '';
    const outcome = typeof meta.outcome === 'string' ? ' · ' + meta.outcome.toLowerCase() : '';
    return {
      title: action === 'START' ? 'Street Dice at ' + tableName : action === 'ADD_ODDS' ? 'Street Dice · odds' : 'Street Dice · roll',
      detail: (charge > 0 ? 'Put up ' + formatLedgerMoney(charge) : 'No extra wager')
        + (credited > 0 ? ' · returned ' + formatLedgerMoney(credited) : '')
        + roll + point + outcome,
      amountLabel: net > 0 ? 'Won' : net < 0 ? 'Wagered' : 'No change',
      amountCents: Math.abs(net),
      tone: net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral',
    };
  }
  if (entry.kind === 'POKER_BUY_IN' || entry.kind === 'POKER_CASH_OUT') {
    const meta = entry.metadata as unknown as { action?: string; buyInCents?: number; returnCents?: number; outcome?: string };
    const buying = entry.kind === 'POKER_BUY_IN';
    const amount = buying ? meta.buyInCents ?? abs(entry.sessionChipDeltaCents) : meta.returnCents ?? abs(entry.sessionChipDeltaCents);
    const net = Number(entry.sessionChipDeltaCents);
    return {
      title: buying ? 'Poker buy-in' : 'Poker hand settled',
      detail: buying ? 'Sat down with ' + formatLedgerMoney(amount) : (typeof meta.outcome === 'string' ? meta.outcome + ' · ' : '') + 'returned ' + formatLedgerMoney(amount),
      amountLabel: buying ? 'In play' : net > 0 ? 'Returned' : 'Lost',
      amountCents: amount,
      tone: buying ? 'neutral' : net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral',
    };
  }
  if (entry.kind === 'POKER_TABLE_BUY_IN' || entry.kind === 'POKER_TABLE_REFUND') {
    const meta = entry.metadata as unknown as { buyInCents?: number; refundCents?: number };
    const buying = entry.kind === 'POKER_TABLE_BUY_IN';
    const amount = buying ? meta.buyInCents ?? abs(entry.sessionChipDeltaCents) : meta.refundCents ?? abs(entry.sessionChipDeltaCents);
    return {
      title: buying ? 'Poker table buy-in' : 'Poker table refund',
      detail: buying ? 'Escrowed ' + formatLedgerMoney(amount) + ' at the table' : 'Returned ' + formatLedgerMoney(amount) + ' to your bankroll',
      amountLabel: buying ? 'In play' : 'Refunded', amountCents: amount,
      tone: buying ? 'neutral' : 'positive',
    };
  }
  if (entry.kind === 'COMP_HOTEL') {
    const meta = entry.metadata as unknown as { compCents?: number; minutes?: number; cityName?: string };
    const minutes = typeof meta.minutes === 'number' ? meta.minutes : 0;
    const hours = minutes / 60;
    return {
      title: 'Comped hotel stay',
      detail: 'The house covered ' + (Number.isInteger(hours) ? hours : hours.toFixed(1)) + ' more hour' + (hours === 1 ? '' : 's')
        + (typeof meta.cityName === 'string' ? ' in ' + meta.cityName : '') + '. No chips or cash moved.',
      amountLabel: 'Comps used',
      amountCents: typeof meta.compCents === 'number' ? meta.compCents : 0,
      tone: 'neutral',
    };
  }
  return {
    title: 'Casino activity',
    detail: 'Casino balance updated.',
    amountLabel: 'Change',
    amountCents: Math.abs(Number(entry.sessionChipDeltaCents || entry.walletChipDeltaCents || entry.cashDeltaCents)),
    tone: 'neutral',
  };
}

function formatLedgerMoney(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function requireCasino(ruleset: Ruleset): CasinoRules {
  const casino = ruleset.casino;
  if (!casino?.enabled) throw AppError.conflict('CASINO_CLOSED', 'Casinos are not open in this round.');
  return casino;
}

function assertAmount(casino: CasinoRules, amount: bigint, min: number, max: number): void {
  if (amount < BigInt(min) || amount > BigInt(max)) {
    throw AppError.badRequest(
      'CASINO_AMOUNT',
      'That amount is outside this casino limit.',
      { amountCents: 'Pick an amount inside the posted limits.' },
    );
  }
  if (amount % BigInt(casino.chipUnitCents) !== 0n) {
    throw AppError.badRequest('CASINO_CHIP_UNIT', 'The cage deals in whole chips.', {
      amountCents: 'Use a whole-chip amount.',
    });
  }
}

type CasinoCashLocation =
  | { kind: 'HOME'; citySlug: string; cashCents: bigint; walletId: null }
  | { kind: 'TRIP'; citySlug: string; cashCents: bigint; walletId: string }
  | { kind: 'RUN'; citySlug: string; cashCents: bigint; walletId: string };

/**
 * The cash the boss can physically reach at the casino.
 *
 * At home that is RoundPlayer.cashCents. On a flight it is the trip bankroll,
 * and while riding a run it is the run wallet. This prevents protected home
 * cash from being teleported into destination chips.
 */
async function casinoCashLocation(
  db: Db | PrismaClient,
  ruleset: Ruleset,
  player: PlayerRow,
  now: Date,
): Promise<CasinoCashLocation | null> {
  const visiting = await bossPresence(db, ruleset, player.id, now);
  if (visiting?.via === 'trip' && visiting.tripId) {
    const trip = await db.bossTrip.findUnique({ where: { id: visiting.tripId } });
    if (!trip || trip.status !== 'ACTIVE') return null;
    return { kind: 'TRIP', citySlug: visiting.city, cashCents: trip.bankrollCents, walletId: trip.id };
  }
  if (visiting?.via === 'run') {
    const run = await db.run.findFirst({
      where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true },
      orderBy: [{ launchedAt: 'asc' }, { id: 'asc' }],
    });
    if (!run) return null;
    return { kind: 'RUN', citySlug: visiting.city, cashCents: run.cashCents, walletId: run.id };
  }

  if (player.movingUntil && player.movingUntil > now) return null;
  const [tripOut, bossRunOut] = await Promise.all([
    db.bossTrip.count({ where: { roundPlayerId: player.id, status: 'ACTIVE' } }),
    db.run.count({ where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true } }),
  ]);
  return tripOut + bossRunOut > 0
    ? null
    : { kind: 'HOME', citySlug: player.city.slug, cashCents: player.cashCents, walletId: null };
}

async function moveLocalCash(
  tx: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  location: CasinoCashLocation,
  deltaCents: bigint,
): Promise<void> {
  if (location.kind === 'HOME') {
    await tx.roundPlayer.update({
      where: { id: roundPlayerId },
      data: { cashCents: { increment: deltaCents } },
    });
    return;
  }

  if (location.kind === 'TRIP') {
    await tx.bossTrip.update({
      where: { id: location.walletId },
      data: { bankrollCents: { increment: deltaCents } },
    });
  } else {
    await tx.run.update({
      where: { id: location.walletId },
      data: { cashCents: { increment: deltaCents } },
    });
  }
  await refreshAwayWorth(tx, roundPlayerId, ruleset);
}

function venueDto(
  casino: CasinoRules,
  city: { id: string; slug: string; name: string },
  walletCents: bigint,
  currentCitySlug: string | null,
): CasinoVenueDto {
  const venue = casino.venues[city.slug]!;
  return {
    citySlug: city.slug,
    cityName: city.name,
    name: venue.name,
    blurb: venue.blurb,
    kind: venue.kind,
    walletChipsCents: Number(walletCents),
    here: currentCitySlug === city.slug,
    ...CasinoStatusService.venueExtras(casino, venue),
  };
}

async function pageInDb(db: Db | PrismaClient, roundPlayerId: string, now: Date): Promise<CasinoPageDto> {
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    include: { city: true, round: true },
  });
  if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');

  const ruleset = loadRulesetForRound(player.round);
  if (!ruleset.casino?.enabled) {
    return {
      enabled: false,
      cashCents: Number(player.cashCents),
      currentCitySlug: null,
      currentVenue: null,
      venues: [],
      openSession: null,
      slotMachines: [],
      freeSpinBonus: null,
      recentLedger: [],
      totalCasinoValueCents: 0,
      limits: null,
      status: null,
      host: null,
    };
  }

  const casino = ruleset.casino;
  const cashLocation = await casinoCashLocation(db, ruleset, player, now);
  const currentCitySlug = cashLocation?.citySlug ?? null;
  const citySlugs = Object.keys(casino.venues);
  const slotRules = casino.slots?.machines ?? [];
  const [cities, wallets, openSession, ledger, jackpots, freeSpinBonusRow, blackjackCommitted, streetDiceCommitted, pokerCommitted] = await Promise.all([
    db.city.findMany({ where: { slug: { in: citySlugs }, isEnabled: true }, orderBy: { sortOrder: 'asc' } }),
    db.casinoWallet.findMany({ where: { roundPlayerId }, include: { city: true } }),
    db.casinoSession.findFirst({
      where: { roundPlayerId, status: 'OPEN' },
      include: { city: true },
      orderBy: { openedAt: 'desc' },
    }),
    db.casinoLedgerEntry.findMany({
      where: { roundPlayerId },
      include: { city: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 25,
    }),
    db.casinoJackpot.findMany({
      where: { roundId: player.roundId, machineKey: { in: slotRules.map((machine) => machine.key) } },
    }),
    db.casinoFreeSpinBonus.findUnique({ where: { roundPlayerId } }),
    db.casinoBlackjackHand.aggregate({
      where: { roundPlayerId, status: 'ACTIVE' },
      _sum: { committedWagerCents: true },
    }),
    db.casinoStreetDiceRound.aggregate({
      where: { roundPlayerId, status: 'ACTIVE' },
      _sum: { lineWagerCents: true, oddsWagerCents: true },
    }),
    pokerCommittedCents(db, roundPlayerId),
  ]);

  const walletByCity = new Map(wallets.map((wallet) => [wallet.city.slug, wallet.chipsCents]));
  const venues = cities
    .filter((city) => casino.venues[city.slug] !== undefined)
    .map((city) => venueDto(casino, city, walletByCity.get(city.slug) ?? 0n, currentCitySlug));
  const currentVenue = currentCitySlug
    ? venues.find((venue) => venue.citySlug === currentCitySlug) ?? null
    : null;

  const open = openSession && casino.venues[openSession.city.slug]
    ? {
        id: openSession.id,
        citySlug: openSession.city.slug,
        cityName: openSession.city.name,
        venueName: casino.venues[openSession.city.slug]!.name,
        bankrollCents: Number(openSession.bankrollCents),
        openedAt: openSession.openedAt.toISOString(),
      }
    : null;

  const jackpotByMachine = new Map(jackpots.map((jackpot) => [jackpot.machineKey, jackpot.poolCents]));
  const slotMachines = slotRules.map((machine) => ({
    key: machine.key,
    name: machine.name,
    blurb: machine.blurb,
    reels: machine.reels,
    rows: machine.rows,
    paylines: machine.paylines.map((line) => ({ key: line.key, name: line.name, rows: [...line.rows] })),
    reelStrips: machine.reelStrips.map((strip) => strip.map((key) => {
      const symbol = machine.symbols.find((candidate) => candidate.key === key);
      if (!symbol) throw AppError.conflict('CASINO_RULESET_INVALID', 'A slot reel contains an unknown symbol.');
      return { key: symbol.key, label: symbol.label, glyph: symbol.glyph };
    })),
    paytable: machine.symbols.map((symbol) => ({
      symbolKey: symbol.key,
      symbolLabel: symbol.label,
      glyph: symbol.glyph,
      payouts: ([3, 4, 5] as const)
        .filter((matches) => matches <= machine.reels)
        .map((matches) => ({ matches, payoutBps: machine.linePayoutBps[symbol.key]?.[matches] ?? 0 }))
        .filter((entry) => entry.payoutBps > 0),
    })).filter((entry) => entry.payouts.length > 0),
    minBetPerLineCents: machine.minBetPerLineCents,
    maxBetPerLineCents: machine.maxBetPerLineCents,
    betStepCents: machine.betStepCents,
    maxTotalWagerCents: machine.maxBetPerLineCents * machine.paylines.length,
    availableHere: Boolean(currentVenue && machine.venueKinds.includes(currentVenue.kind)),
    baseRtpBps: theoreticalSlotRtpBps(machine, machine.minBetPerLineCents),
    effectiveRtpBps: effectiveSlotRtpBps(machine, machine.minBetPerLineCents),
    freeSpins: machine.freeSpins
      ? {
          triggerBps: machine.freeSpins.triggerBps,
          presentationLabel: machine.freeSpins.presentationLabel,
          possibleAwards: machine.freeSpins.awards.map((award) => award.spins),
        }
      : null,
    progressive: machine.progressive
      ? {
          poolCents: Number(jackpotByMachine.get(machine.key) ?? BigInt(machine.progressive.seedCents)),
          contributionBps: machine.progressive.contributionBps,
          eligibleBetPerLineCents: machine.progressive.eligibleBetPerLineCents,
          requiresAllPaylines: machine.progressive.requiresAllPaylines,
        }
      : null,
  }));

  const bonusMachine = freeSpinBonusRow
    ? slotRules.find((machine) => machine.key === freeSpinBonusRow.machineKey) ?? null
    : null;
  const bonusVenue = freeSpinBonusRow
    ? venues.find((venue) => venue.citySlug === freeSpinBonusRow.citySlug) ?? null
    : null;
  const freeSpinBonus = freeSpinBonusRow && bonusMachine
    ? {
        id: freeSpinBonusRow.id,
        machineKey: freeSpinBonusRow.machineKey,
        machineName: bonusMachine.name,
        citySlug: freeSpinBonusRow.citySlug,
        cityName: bonusVenue?.cityName ?? freeSpinBonusRow.citySlug,
        betPerLineCents: Number(freeSpinBonusRow.betPerLineCents),
        activePaylineKeys: Array.isArray(freeSpinBonusRow.activePaylineKeys)
          ? freeSpinBonusRow.activePaylineKeys.filter((key): key is string => typeof key === 'string')
          : [],
        awardedSpins: freeSpinBonusRow.awardedSpins,
        remainingSpins: freeSpinBonusRow.remainingSpins,
        totalWonCents: Number(freeSpinBonusRow.totalWonCents),
        presentationLabel: bonusMachine.freeSpins?.presentationLabel ?? 'FREE SPINS',
        awardedAt: freeSpinBonusRow.awardedAt.toISOString(),
      }
    : null;

  const recentLedger: CasinoLedgerEntryDto[] = ledger.map((entry) => ({
    id: entry.id,
    kind: entry.kind as CasinoLedgerEntryDto['kind'],
    display: ledgerDisplay(entry),
    citySlug: entry.city.slug,
    cityName: entry.city.name,
    venueName: casino.venues[entry.city.slug]?.name ?? entry.city.name,
    sessionId: entry.sessionId,
    cashDeltaCents: Number(entry.cashDeltaCents),
    walletChipDeltaCents: Number(entry.walletChipDeltaCents),
    sessionChipDeltaCents: Number(entry.sessionChipDeltaCents),
    walletChipsAfterCents: Number(entry.walletChipsAfterCents),
    sessionChipsAfterCents: Number(entry.sessionChipsAfterCents),
    createdAt: entry.createdAt.toISOString(),
  }));

  const walletTotal = wallets.reduce((sum, wallet) => sum + wallet.chipsCents, 0n);
  const sessionTotal = openSession?.bankrollCents ?? 0n;
  const blackjackCommittedTotal = blackjackCommitted._sum.committedWagerCents ?? 0n;
  const streetDiceCommittedTotal =
    (streetDiceCommitted._sum.lineWagerCents ?? 0n) + (streetDiceCommitted._sum.oddsWagerCents ?? 0n);
  const status = await CasinoStatusService.page(db, ruleset, player, currentCitySlug, now);

  return {
    enabled: true,
    cashCents: Number(cashLocation?.cashCents ?? 0n),
    currentCitySlug,
    currentVenue,
    venues,
    openSession: open,
    slotMachines,
    freeSpinBonus,
    recentLedger,
    totalCasinoValueCents: Number(walletTotal + sessionTotal + blackjackCommittedTotal + streetDiceCommittedTotal + pokerCommitted),
    limits: {
      chipUnitCents: casino.chipUnitCents,
      cashierMinCents: casino.cashier.minExchangeCents,
      cashierMaxCents: casino.cashier.maxExchangeCents,
      sessionMinCents: casino.session.minBankrollCents,
      sessionMaxCents: status?.maxBankrollCents ?? casino.session.maxBankrollCents,
    },
    status,
    host: ruleset.contacts?.ACE
      ? { name: ruleset.contacts.ACE.name, shortName: ruleset.contacts.ACE.shortName, role: ruleset.contacts.ACE.role, description: ruleset.contacts.ACE.description }
      : null,
  };
}

async function playerAndCasino(db: Db, roundPlayerId: string) {
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    include: { city: true, round: true },
  });
  if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player is not in this round.');
  const ruleset = loadRulesetForRound(player.round);
  return { player, ruleset, casino: requireCasino(ruleset) };
}

async function currentVenue(db: Db, ruleset: Ruleset, casino: CasinoRules, player: PlayerRow, now: Date) {
  const cashLocation = await casinoCashLocation(db, ruleset, player, now);
  if (!cashLocation) throw AppError.conflict('NOT_AT_CASINO', 'The boss is on the road or in the air. Get into town first.');
  const venue = casino.venues[cashLocation.citySlug];
  if (!venue) throw AppError.conflict('NO_CASINO_HERE', 'There is no casino open where the boss is standing.');
  const city = await db.city.findUnique({ where: { slug: cashLocation.citySlug } });
  if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That casino city is not available.');
  return { city, venue, cashLocation };
}

async function settleProgressive(
  tx: Db,
  roundId: string,
  machine: CasinoSlotMachineRules,
  contributionCents: bigint,
  triggered: boolean,
): Promise<{ awardCents: bigint; poolAfterCents: bigint }> {
  const progressive = machine.progressive;
  if (!progressive) return { awardCents: 0n, poolAfterCents: 0n };

  const row = await tx.casinoJackpot.upsert({
    where: { roundId_machineKey: { roundId, machineKey: machine.key } },
    update: {},
    create: { roundId, machineKey: machine.key, poolCents: BigInt(progressive.seedCents) },
  });

  await tx.$queryRaw`SELECT "id" FROM "CasinoJackpot" WHERE "id" = ${row.id} FOR UPDATE`;
  const locked = await tx.casinoJackpot.findUniqueOrThrow({ where: { id: row.id } });
  const fundedPool = locked.poolCents + contributionCents;
  const awardCents = triggered ? fundedPool : 0n;
  const poolAfterCents = triggered ? BigInt(progressive.seedCents) : fundedPool;

  await tx.casinoJackpot.update({ where: { id: row.id }, data: { poolCents: poolAfterCents } });
  return { awardCents, poolAfterCents };
}

async function mutate(
  prisma: PrismaClient,
  roundPlayerId: string,
  actionId: string,
  execute: (db: Db, player: PlayerRow, ruleset: Ruleset, casino: CasinoRules, now: Date) => Promise<void>,
): Promise<CasinoPageDto> {
  await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await lockRoundPlayer(tx, roundPlayerId);
    const blackjackReceipt = await tx.casinoBlackjackAction.findUnique({
      where: { roundPlayerId_actionId: { roundPlayerId, actionId } },
      select: { id: true },
    });
    if (blackjackReceipt) {
      throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a blackjack action.');
    }
    const replay = await tx.casinoLedgerEntry.findUnique({
      where: { roundPlayerId_actionId: { roundPlayerId, actionId } },
      select: { id: true },
    });
    if (replay) return pageInDb(tx, roundPlayerId, now);

    const { player, ruleset, casino } = await playerAndCasino(tx, roundPlayerId);
    await execute(tx, player, ruleset, casino, now);
    await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: true });
    return pageInDb(tx, roundPlayerId, now);
  });
}

export const CasinoService = {
  async page(prisma: PrismaClient, roundPlayerId: string): Promise<CasinoPageDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    return pageInDb(prisma, roundPlayerId, new Date());
  },

  buyChips(prisma: PrismaClient, roundPlayerId: string, input: CasinoCashierInput): Promise<CasinoPageDto> {
    return mutate(prisma, roundPlayerId, input.actionId, async (tx, player, ruleset, casino, now) => {
      const amount = BigInt(input.amountCents);
      assertAmount(casino, amount, casino.cashier.minExchangeCents, casino.cashier.maxExchangeCents);
      const { city, venue, cashLocation } = await currentVenue(tx, ruleset, casino, player, now);
      if (cashLocation.cashCents < amount) {
        throw AppError.conflict('NOT_ENOUGH_CASH', 'The boss does not have that much cash with them at this casino.');
      }

      const wallet = await tx.casinoWallet.upsert({
        where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } },
        update: { chipsCents: { increment: amount } },
        create: { roundPlayerId, cityId: city.id, chipsCents: amount },
      });
      await moveLocalCash(tx, roundPlayerId, ruleset, cashLocation, -amount);
      await tx.casinoLedgerEntry.create({
        data: {
          roundPlayerId, cityId: city.id, actionId: input.actionId, kind: 'BUY_CHIPS',
          cashDeltaCents: -amount, walletChipDeltaCents: amount, walletChipsAfterCents: wallet.chipsCents,
          metadata: { venue: venue.name, cashWallet: cashLocation.kind, cashWalletId: cashLocation.walletId } as Prisma.InputJsonValue,
        },
      });
      await ActivityService.log(tx, roundPlayerId, 'CASINO_BUY_CHIPS', {
        cityName: city.name, venueName: venue.name, amountCents: Number(amount),
      });
    });
  },

  redeemChips(prisma: PrismaClient, roundPlayerId: string, input: CasinoCashierInput): Promise<CasinoPageDto> {
    return mutate(prisma, roundPlayerId, input.actionId, async (tx, player, ruleset, casino, now) => {
      const amount = BigInt(input.amountCents);
      assertAmount(casino, amount, casino.cashier.minExchangeCents, casino.cashier.maxExchangeCents);
      const { city, venue, cashLocation } = await currentVenue(tx, ruleset, casino, player, now);
      if (cashLocation.kind === 'TRIP') {
        const carryOnCapCents = ruleset.travel?.trips?.carryOnCapCents;
        if (carryOnCapCents !== undefined && cashLocation.cashCents + amount > BigInt(carryOnCapCents)) {
          throw AppError.conflict('OVER_CARRY_ON', 'Redeeming that many chips would put the boss over the flight carry-on cash limit.');
        }
      }
      const wallet = await tx.casinoWallet.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } } });
      if (!wallet || wallet.chipsCents < amount) throw AppError.conflict('NOT_ENOUGH_CHIPS', 'You do not have that many chips at this cage.');

      const nextWallet = await tx.casinoWallet.update({ where: { id: wallet.id }, data: { chipsCents: { decrement: amount } } });
      await moveLocalCash(tx, roundPlayerId, ruleset, cashLocation, amount);
      await tx.casinoLedgerEntry.create({
        data: {
          roundPlayerId, cityId: city.id, actionId: input.actionId, kind: 'REDEEM_CHIPS',
          cashDeltaCents: amount, walletChipDeltaCents: -amount, walletChipsAfterCents: nextWallet.chipsCents,
          metadata: { venue: venue.name, cashWallet: cashLocation.kind, cashWalletId: cashLocation.walletId } as Prisma.InputJsonValue,
        },
      });
      await ActivityService.log(tx, roundPlayerId, 'CASINO_REDEEM_CHIPS', {
        cityName: city.name, venueName: venue.name, amountCents: Number(amount),
      });
    });
  },

  startSession(prisma: PrismaClient, roundPlayerId: string, input: CasinoSessionStartInput): Promise<CasinoPageDto> {
    return mutate(prisma, roundPlayerId, input.actionId, async (tx, player, ruleset, casino, now) => {
      const amount = BigInt(input.amountCents);
      // 1.2.0-E: status can raise the bankroll ceiling. It never changes a game.
      assertAmount(casino, amount, casino.session.minBankrollCents, await casinoSessionMaxCents(tx, casino, roundPlayerId));
      const alreadyOpen = await tx.casinoSession.findFirst({ where: { roundPlayerId, status: 'OPEN' } });
      if (alreadyOpen) throw AppError.conflict('CASINO_SESSION_OPEN', 'Cash out your current casino session before opening another.');

      const { city, venue } = await currentVenue(tx, ruleset, casino, player, now);
      const wallet = await tx.casinoWallet.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } } });
      if (!wallet || wallet.chipsCents < amount) throw AppError.conflict('NOT_ENOUGH_CHIPS', 'Buy more chips at this cage before opening that bankroll.');

      const nextWallet = await tx.casinoWallet.update({ where: { id: wallet.id }, data: { chipsCents: { decrement: amount } } });
      const session = await tx.casinoSession.create({ data: { roundPlayerId, cityId: city.id, bankrollCents: amount, openedAt: now } });
      await tx.casinoLedgerEntry.create({
        data: {
          roundPlayerId, cityId: city.id, sessionId: session.id, actionId: input.actionId, kind: 'SESSION_OPEN',
          walletChipDeltaCents: -amount, sessionChipDeltaCents: amount,
          walletChipsAfterCents: nextWallet.chipsCents, sessionChipsAfterCents: amount,
          metadata: { venue: venue.name } as Prisma.InputJsonValue,
        },
      });
      await ActivityService.log(tx, roundPlayerId, 'CASINO_SESSION_OPENED', {
        cityName: city.name, venueName: venue.name, bankrollCents: Number(amount), sessionId: session.id,
      });
    });
  },

  async spinSlot(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: CasinoSlotSpinInput,
    rng: Rng = secureCasinoRng,
  ): Promise<CasinoSlotSpinResponseDto> {
    await PlayerStateService.settle(prisma, roundPlayerId, { markActive: true });
    const now = new Date();

    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const { player, ruleset, casino } = await playerAndCasino(tx, roundPlayerId);
      const machine = casino.slots?.machines.find((candidate) => candidate.key === input.machineKey);
      if (!machine) throw AppError.notFound('SLOT_MACHINE_NOT_FOUND', 'That slot machine is not part of this round.');

      if (
        input.betPerLineCents < machine.minBetPerLineCents
        || input.betPerLineCents > machine.maxBetPerLineCents
        || input.betPerLineCents % machine.betStepCents !== 0
      ) {
        throw AppError.badRequest('SLOT_LINE_BET', 'That line bet is outside this machine\'s posted limits.', {
          betPerLineCents: 'Use one of the posted line-bet increments.',
        });
      }

      const useFreeSpin = input.useFreeSpin === true;
      const requestedLines = new Set(input.activePaylineKeys);
      const activePaylineKeys = machine.paylines
        .filter((line) => requestedLines.has(line.key))
        .map((line) => line.key);
      if (activePaylineKeys.length !== requestedLines.size || activePaylineKeys.length === 0) {
        throw AppError.badRequest('SLOT_PAYLINES', 'Select one or more valid paylines.', {
          activePaylineKeys: 'Choose paylines shown on this machine.',
        });
      }

      // Idempotent replay happens before live bonus validation. A retry of the
      // last free spin must still replay after that bundle was fully consumed.
      const replay = await tx.casinoLedgerEntry.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
      });
      if (!replay) {
        const blackjackReceipt = await tx.casinoBlackjackAction.findUnique({
          where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
          select: { id: true },
        });
        if (blackjackReceipt) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a blackjack action.');
        }
      }
      if (replay) {
        if (replay.kind !== 'SLOT_SPIN') {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different casino action.');
        }
        const saved = slotSpinDto(replay);
        const sameLines = saved.activePaylineKeys.length === activePaylineKeys.length
          && saved.activePaylineKeys.every((key, index) => key === activePaylineKeys[index]);
        if (
          saved.machineKey !== input.machineKey
          || saved.betPerLineCents !== input.betPerLineCents
          || saved.isFreeSpin !== useFreeSpin
          || !sameLines
        ) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different slot spin.');
        }
        return { page: await pageInDb(tx, roundPlayerId, now), spin: saved };
      }

      const betPerLine = BigInt(input.betPerLineCents);
      const nominalWager = slotTotalWagerCents(betPerLine, activePaylineKeys.length);
      const { city, venue } = await currentVenue(tx, ruleset, casino, player, now);
      if (!machine.venueKinds.includes(venue.kind)) {
        throw AppError.conflict('SLOT_NOT_HERE', 'That machine is not available at this casino.');
      }

      const session = await tx.casinoSession.findFirst({
        where: { roundPlayerId, status: 'OPEN' },
        include: { city: true },
        orderBy: { openedAt: 'desc' },
      });
      if (!session) throw AppError.conflict('CASINO_SESSION_REQUIRED', 'Open a casino bankroll before playing Slots.');
      if (session.cityId !== city.id) {
        throw AppError.conflict('CASINO_SESSION_ELSEWHERE', 'Your open bankroll belongs to another casino. Close it before playing here.');
      }
      const [blackjackHand, streetDiceRound, pokerHand, pokerSeat] = await Promise.all([
        tx.casinoBlackjackHand.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoStreetDiceRound.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoPokerHand.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } }),
        tx.casinoPokerSeat.findFirst({ where: { roundPlayerId, status: { in: ['WAITING', 'PLAYING'] }, table: { status: { in: ['WAITING', 'PLAYING'] } } }, select: { id: true } }),
      ]);
      if (blackjackHand) {
        throw AppError.conflict('BLACKJACK_HAND_ACTIVE', 'Finish the current blackjack hand before playing Slots.');
      }
      if (streetDiceRound) {
        throw AppError.conflict('STREET_DICE_ACTIVE', 'Finish the current Street Dice point before playing Slots.');
      }
      if (pokerHand) throw AppError.conflict('POKER_HAND_ACTIVE', 'Finish the current Poker hand before playing Slots.');
      if (pokerSeat) throw AppError.conflict('POKER_TABLE_ACTIVE', 'Leave your multiplayer Poker table before playing Slots.');

      const bonus = await tx.casinoFreeSpinBonus.findUnique({ where: { roundPlayerId } });
      if (useFreeSpin) {
        if (!bonus || bonus.remainingSpins <= 0) {
          throw AppError.conflict('NO_FREE_SPINS', 'There is no free spin waiting for this player.');
        }
        const bonusLines = Array.isArray(bonus.activePaylineKeys)
          ? bonus.activePaylineKeys.filter((key): key is string => typeof key === 'string')
          : [];
        const sameLines = bonusLines.length === activePaylineKeys.length
          && bonusLines.every((key, index) => key === activePaylineKeys[index]);
        if (
          bonus.machineKey !== machine.key
          || bonus.citySlug !== city.slug
          || bonus.betPerLineCents !== betPerLine
          || !sameLines
        ) {
          throw AppError.conflict(
            'FREE_SPIN_CONFIG_LOCKED',
            'Free spins use the same machine, city, line bet and paylines that earned them.',
          );
        }
      } else if (bonus?.remainingSpins) {
        throw AppError.conflict(
          'FREE_SPINS_PENDING',
          'Finish the awarded free spins before placing another paid slot wager.',
        );
      }

      const chargedWager = useFreeSpin ? 0n : nominalWager;
      if (!useFreeSpin && session.bankrollCents < nominalWager) {
        throw AppError.conflict('NOT_ENOUGH_BANKROLL', 'There are not enough chips in the open bankroll for that spin.');
      }

      const math = resolveSlotSpin(machine, betPerLine, activePaylineKeys, rng);
      const progressive = await settleProgressive(
        tx,
        player.roundId,
        machine,
        math.jackpotContributionCents,
        math.jackpotTriggered,
      );
      const payout = math.payoutCents + progressive.awardCents;
      const freeSpinsAwarded = useFreeSpin ? 0 : rollSlotFreeSpinAward(machine, rng);
      let freeSpinsRemainingAfter = 0;

      if (useFreeSpin) {
        const activeBonus = bonus!;
        freeSpinsRemainingAfter = activeBonus.remainingSpins - 1;
        if (freeSpinsRemainingAfter > 0) {
          await tx.casinoFreeSpinBonus.update({
            where: { id: activeBonus.id },
            data: {
              remainingSpins: freeSpinsRemainingAfter,
              totalWonCents: { increment: payout },
            },
          });
        } else {
          await tx.casinoFreeSpinBonus.delete({ where: { id: activeBonus.id } });
        }
      } else if (freeSpinsAwarded > 0) {
        freeSpinsRemainingAfter = freeSpinsAwarded;
        await tx.casinoFreeSpinBonus.create({
          data: {
            roundPlayerId,
            citySlug: city.slug,
            machineKey: machine.key,
            betPerLineCents: betPerLine,
            activePaylineKeys: [...activePaylineKeys] as Prisma.InputJsonValue,
            awardedSpins: freeSpinsAwarded,
            remainingSpins: freeSpinsAwarded,
            sourceActionId: input.actionId,
          },
        });
      }

      const bankrollAfter = session.bankrollCents - chargedWager + payout;
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankrollAfter } });
      // A free spin is comped by the house, so only paid spins are rated.
      const play = { game: 'SLOTS' as const, tableKey: machine.key, actionId: input.actionId };
      await CasinoStatusService.rateWager(tx, ruleset, {
        roundPlayerId, cityId: city.id, wagerCents: chargedWager, edgeBps: slotRatingEdgeBps(machine, input.betPerLineCents), play, now,
      });

      const wallet = await tx.casinoWallet.findUnique({
        where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } },
      });
      const metadata: SlotLedgerMetadata = {
        machineKey: machine.key,
        machineName: machine.name,
        betPerLineCents: input.betPerLineCents,
        activePaylineKeys: [...math.activePaylineKeys],
        wagerCents: Number(math.totalWagerCents),
        chargedWagerCents: Number(chargedWager),
        isFreeSpin: useFreeSpin,
        payoutCents: Number(payout),
        payoutBps: math.payoutBps,
        grid: math.grid.map((row) => row.map(({ key, label, glyph }) => ({ key, label, glyph }))),
        reelStops: [...math.reelStops],
        winningLines: math.winningLines.map((win) => ({
          paylineKey: win.paylineKey,
          paylineName: win.paylineName,
          symbolKey: win.symbolKey,
          symbolLabel: win.symbolLabel,
          matchCount: win.matchCount,
          payoutCents: Number(win.payoutCents),
          positions: win.positions.map((position) => ({ ...position })),
        })),
        nearMiss: math.nearMiss ? { ...math.nearMiss } : null,
        winTier: slotWinTier(payout, nominalWager, progressive.awardCents),
        jackpotContributionCents: Number(math.jackpotContributionCents),
        jackpotAwardCents: Number(progressive.awardCents),
        freeSpinsAwarded,
        freeSpinsRemainingAfter,
      };
      const ledger = await tx.casinoLedgerEntry.create({
        data: {
          roundPlayerId,
          cityId: city.id,
          sessionId: session.id,
          actionId: input.actionId,
          kind: 'SLOT_SPIN',
          sessionChipDeltaCents: payout - chargedWager,
          walletChipsAfterCents: wallet?.chipsCents ?? 0n,
          sessionChipsAfterCents: bankrollAfter,
          metadata: metadata as unknown as Prisma.InputJsonValue,
        },
      });
      await CasinoStatusService.recordResult(tx, ruleset, {
        roundPlayerId, cityId: city.id, play, stakeCents: chargedWager, returnCents: payout,
        highlight: metadata.winTier === 'JACKPOT' ? 'JACKPOT' : metadata.winTier === 'MEGA' ? 'MEGA_WIN' : metadata.winTier === 'BIG' ? 'BIG_WIN' : null,
        now,
      });

      await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: true });
      return { page: await pageInDb(tx, roundPlayerId, now), spin: slotSpinDto(ledger) };
    });
  },

  /**
   * 1.2.0-E. Boss Trips hook: the house comps more hotel time on the boss's trip to a
   * casino city. Comps are spent, never cashed: no chips, cash or bankroll move.
   */
  compHotel(prisma: PrismaClient, roundPlayerId: string, input: CasinoCompHotelInput): Promise<CasinoPageDto> {
    return mutate(prisma, roundPlayerId, input.actionId, async (tx, player, ruleset, casino, now) => {
      if (!casino.status?.comps.hotelExtensions) {
        throw AppError.conflict('COMPS_CLOSED', 'The casinos are not comping rooms this round.');
      }
      const rules = tripRules(ruleset);
      const trip = await tx.bossTrip.findFirst({ where: { roundPlayerId, status: 'ACTIVE' } });
      if (!rules || !trip) throw AppError.conflict('NO_TRIP', 'Comped rooms are for a boss on a trip.');
      if (!casinoCompsCoverHotel(casino, trip.city)) {
        throw AppError.conflict('NO_CASINO_HERE', 'There is no casino in that city to comp the room.');
      }
      const balance = await casinoCompBalanceCents(tx, roundPlayerId);
      const check = checkExtend(ruleset, { trip: { ...trip, bankrollCents: balance }, blocks: input.blocks, now, roundEndsAt: player.round.endsAt });
      if (check.code === 'NOT_ENOUGH_BANKROLL') {
        throw AppError.conflict('NOT_ENOUGH_COMPS', 'You have not earned enough comps for that many hotel blocks.');
      }
      if (check.blockedReason) {
        throw check.code === 'BAD_EXTENSION' || check.code === 'STAY_TOO_LONG' || check.code === 'TRIP_TOO_LONG'
          ? AppError.badRequest(check.code, check.blockedReason, { blocks: check.blockedReason })
          : AppError.conflict(check.code ?? 'TRIP_BLOCKED', check.blockedReason);
      }
      const city = await tx.city.findUnique({ where: { slug: trip.city } });
      if (!city) throw AppError.notFound('CITY_NOT_FOUND', 'That casino city is not available.');

      await tx.bossTrip.update({ where: { id: trip.id }, data: { stayUntil: check.stayUntil, returnsAt: check.returnsAt } });
      await tx.casinoRating.upsert({
        where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } },
        update: { compsSpentCents: { increment: check.hotelCents } },
        create: { roundPlayerId, cityId: city.id, compsSpentCents: check.hotelCents },
      });
      const wallet = await tx.casinoWallet.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } } });
      const minutes = input.blocks * rules.extendMinutes;
      const venue = casino.venues[trip.city]!;
      await tx.casinoLedgerEntry.create({
        data: {
          roundPlayerId, cityId: city.id, actionId: input.actionId, kind: 'COMP_HOTEL',
          walletChipsAfterCents: wallet?.chipsCents ?? 0n,
          metadata: {
            tripId: trip.id, blocks: input.blocks, minutes, compCents: Number(check.hotelCents),
            cityName: city.name, venue: venue.name, stayUntil: check.stayUntil.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      await ActivityService.log(tx, roundPlayerId, 'CASINO_COMP_HOTEL', {
        cityName: city.name, venueName: venue.name, compCents: Number(check.hotelCents), minutes, stayUntil: check.stayUntil.toISOString(),
      });
    });
  },

  closeSession(prisma: PrismaClient, roundPlayerId: string, sessionId: string, actionId: string): Promise<CasinoPageDto> {
    return mutate(prisma, roundPlayerId, actionId, async (tx, _player, _ruleset, casino, now) => {
      const session = await tx.casinoSession.findUnique({ where: { id: sessionId }, include: { city: true } });
      if (!session || session.roundPlayerId !== roundPlayerId) throw AppError.notFound('CASINO_SESSION_NOT_FOUND', 'That casino session is not yours.');
      if (session.status !== 'OPEN') throw AppError.conflict('CASINO_SESSION_CLOSED', 'That casino session is already closed.');
      const activeBlackjack = await tx.casinoBlackjackHand.findFirst({
        where: { roundPlayerId, sessionId: session.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (activeBlackjack) {
        throw AppError.conflict('BLACKJACK_HAND_ACTIVE', 'Finish the current blackjack hand before closing this casino session.');
      }
      const activeStreetDice = await tx.casinoStreetDiceRound.findFirst({
        where: { roundPlayerId, sessionId: session.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (activeStreetDice) {
        throw AppError.conflict('STREET_DICE_ACTIVE', 'Finish the current Street Dice point before closing this casino session.');
      }
      const activePoker = await tx.casinoPokerHand.findFirst({ where: { roundPlayerId, sessionId: session.id, status: 'ACTIVE' }, select: { id: true } });
      if (activePoker) throw AppError.conflict('POKER_HAND_ACTIVE', 'Finish the current Poker hand before closing this casino session.');
      const multiplayerSeat = await tx.casinoPokerSeat.findFirst({ where: { roundPlayerId, sessionId: session.id, status: { in: ['WAITING', 'PLAYING'] }, table: { status: { in: ['WAITING', 'PLAYING'] } } }, select: { id: true } });
      if (multiplayerSeat) throw AppError.conflict('POKER_TABLE_ACTIVE', 'Leave your multiplayer Poker table before closing this casino session.');

      const venue = casino.venues[session.city.slug];
      if (!venue) throw AppError.conflict('CASINO_CLOSED', 'That casino venue is not part of this round anymore.');
      const wallet = await tx.casinoWallet.upsert({
        where: { roundPlayerId_cityId: { roundPlayerId, cityId: session.cityId } },
        update: { chipsCents: { increment: session.bankrollCents } },
        create: { roundPlayerId, cityId: session.cityId, chipsCents: session.bankrollCents },
      });
      await tx.casinoSession.update({ where: { id: session.id }, data: { status: 'CLOSED', closedAt: now } });
      await tx.casinoLedgerEntry.create({
        data: {
          roundPlayerId, cityId: session.cityId, sessionId: session.id, actionId, kind: 'SESSION_CLOSE',
          walletChipDeltaCents: session.bankrollCents, sessionChipDeltaCents: -session.bankrollCents,
          walletChipsAfterCents: wallet.chipsCents, sessionChipsAfterCents: 0n,
          metadata: { venue: venue.name } as Prisma.InputJsonValue,
        },
      });
      await ActivityService.log(tx, roundPlayerId, 'CASINO_SESSION_CLOSED', {
        cityName: session.city.name, venueName: venue.name, bankrollCents: Number(session.bankrollCents), sessionId: session.id,
      });
    });
  },
};
