import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import { loadRulesetForRound, type Ruleset } from '@streets/rules-engine';
import type { CasinoRules } from '@streets/rulesets';
import type {
  CasinoCashierInput,
  CasinoLedgerEntryDto,
  CasinoPageDto,
  CasinoSessionStartInput,
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
      recentLedger: [],
      totalCasinoValueCents: 0,
      limits: null,
    };
  }

  const casino = ruleset.casino;
  const cashLocation = await casinoCashLocation(db, ruleset, player, now);
  const currentCitySlug = cashLocation?.citySlug ?? null;
  const citySlugs = Object.keys(casino.venues);
  const [cities, wallets, openSession, ledger] = await Promise.all([
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
