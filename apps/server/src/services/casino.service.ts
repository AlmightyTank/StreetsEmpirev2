import { randomInt } from 'node:crypto';
import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import { loadRulesetForRound, resolveSlotSpin, slotTotalWagerCents, theoreticalSlotRtpBps, type Rng, type Ruleset } from '@streets/rules-engine';
import type { CasinoRules, CasinoSlotMachineRules } from '@streets/rulesets';
import type {
  CasinoCashierInput,
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
import { PlayerStateService } from './player-state.service.js';
import { refreshAwayWorth } from './run-settle.service.js';

type PlayerRow = RoundPlayer & {
  city: { id: string; slug: string; name: string };
  round: { rulesetId: string; rulesetVersion: string };
};

type SlotLedgerMetadata = {
  machineKey: string;
  machineName: string;
  betPerLineCents: number;
  activePaylineKeys: string[];
  wagerCents: number;
  payoutCents: number;
  payoutBps: number;
  grid: Array<Array<{ key: string; label: string; glyph: string }>>;
  winningLines: Array<{
    paylineKey: string;
    paylineName: string;
    symbolKey: string;
    symbolLabel: string;
    matchCount: number;
    payoutCents: number;
    positions: Array<{ reel: number; row: number }>;
  }>;
  jackpotContributionCents: number;
  jackpotAwardCents: number;
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
    payoutCents: meta.payoutCents,
    netCents: meta.payoutCents - meta.wagerCents,
    payoutBps: meta.payoutBps,
    grid: meta.grid,
    winningLines: meta.winningLines,
    jackpotContributionCents: meta.jackpotContributionCents,
    jackpotAwardCents: meta.jackpotAwardCents,
    bankrollAfterCents: Number(entry.sessionChipsAfterCents),
    createdAt: entry.createdAt.toISOString(),
  };
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
      recentLedger: [],
      totalCasinoValueCents: 0,
      limits: null,
    };
  }

  const casino = ruleset.casino;
  const cashLocation = await casinoCashLocation(db, ruleset, player, now);
  const currentCitySlug = cashLocation?.citySlug ?? null;
  const citySlugs = Object.keys(casino.venues);
  const slotRules = casino.slots?.machines ?? [];
  const [cities, wallets, openSession, ledger, jackpots] = await Promise.all([
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
    progressive: machine.progressive
      ? {
          poolCents: Number(jackpotByMachine.get(machine.key) ?? BigInt(machine.progressive.seedCents)),
          contributionBps: machine.progressive.contributionBps,
          eligibleBetPerLineCents: machine.progressive.eligibleBetPerLineCents,
          requiresAllPaylines: machine.progressive.requiresAllPaylines,
        }
      : null,
  }));

  const recentLedger: CasinoLedgerEntryDto[] = ledger.map((entry) => ({
    id: entry.id,
    kind: entry.kind as CasinoLedgerEntryDto['kind'],
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

  return {
    enabled: true,
    cashCents: Number(cashLocation?.cashCents ?? 0n),
    currentCitySlug,
    currentVenue,
    venues,
    openSession: open,
    slotMachines,
    recentLedger,
    totalCasinoValueCents: Number(walletTotal + sessionTotal),
    limits: {
      chipUnitCents: casino.chipUnitCents,
      cashierMinCents: casino.cashier.minExchangeCents,
      cashierMaxCents: casino.cashier.maxExchangeCents,
      sessionMinCents: casino.session.minBankrollCents,
      sessionMaxCents: casino.session.maxBankrollCents,
    },
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
      assertAmount(casino, amount, casino.session.minBankrollCents, casino.session.maxBankrollCents);
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

      const requestedLines = new Set(input.activePaylineKeys);
      const activePaylineKeys = machine.paylines
        .filter((line) => requestedLines.has(line.key))
        .map((line) => line.key);
      if (activePaylineKeys.length !== requestedLines.size || activePaylineKeys.length === 0) {
        throw AppError.badRequest('SLOT_PAYLINES', 'Select one or more valid paylines.', {
          activePaylineKeys: 'Choose paylines shown on this machine.',
        });
      }

      const replay = await tx.casinoLedgerEntry.findUnique({
        where: { roundPlayerId_actionId: { roundPlayerId, actionId: input.actionId } },
      });
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
          || !sameLines
        ) {
          throw AppError.conflict('ACTION_ID_REUSED', 'That action ID already belongs to a different slot spin.');
        }
        return { page: await pageInDb(tx, roundPlayerId, now), spin: saved };
      }

      const betPerLine = BigInt(input.betPerLineCents);
      const wager = slotTotalWagerCents(betPerLine, activePaylineKeys.length);
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
      if (session.bankrollCents < wager) {
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
      const bankrollAfter = session.bankrollCents - wager + payout;
      await tx.casinoSession.update({ where: { id: session.id }, data: { bankrollCents: bankrollAfter } });

      const wallet = await tx.casinoWallet.findUnique({
        where: { roundPlayerId_cityId: { roundPlayerId, cityId: city.id } },
      });
      const metadata: SlotLedgerMetadata = {
        machineKey: machine.key,
        machineName: machine.name,
        betPerLineCents: input.betPerLineCents,
        activePaylineKeys: [...math.activePaylineKeys],
        wagerCents: Number(math.totalWagerCents),
        payoutCents: Number(payout),
        payoutBps: math.payoutBps,
        grid: math.grid.map((row) => row.map(({ key, label, glyph }) => ({ key, label, glyph }))),
        winningLines: math.winningLines.map((win) => ({
          paylineKey: win.paylineKey,
          paylineName: win.paylineName,
          symbolKey: win.symbolKey,
          symbolLabel: win.symbolLabel,
          matchCount: win.matchCount,
          payoutCents: Number(win.payoutCents),
          positions: win.positions.map((position) => ({ ...position })),
        })),
        jackpotContributionCents: Number(math.jackpotContributionCents),
        jackpotAwardCents: Number(progressive.awardCents),
      };
      const ledger = await tx.casinoLedgerEntry.create({
        data: {
          roundPlayerId,
          cityId: city.id,
          sessionId: session.id,
          actionId: input.actionId,
          kind: 'SLOT_SPIN',
          sessionChipDeltaCents: payout - wager,
          walletChipsAfterCents: wallet?.chipsCents ?? 0n,
          sessionChipsAfterCents: bankrollAfter,
          metadata: metadata as unknown as Prisma.InputJsonValue,
        },
      });

      await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: true });
      return { page: await pageInDb(tx, roundPlayerId, now), spin: slotSpinDto(ledger) };
    });
  },

  closeSession(prisma: PrismaClient, roundPlayerId: string, sessionId: string, actionId: string): Promise<CasinoPageDto> {
    return mutate(prisma, roundPlayerId, actionId, async (tx, _player, _ruleset, casino, now) => {
      const session = await tx.casinoSession.findUnique({ where: { id: sessionId }, include: { city: true } });
      if (!session || session.roundPlayerId !== roundPlayerId) throw AppError.notFound('CASINO_SESSION_NOT_FOUND', 'That casino session is not yours.');
      if (session.status !== 'OPEN') throw AppError.conflict('CASINO_SESSION_CLOSED', 'That casino session is already closed.');

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
