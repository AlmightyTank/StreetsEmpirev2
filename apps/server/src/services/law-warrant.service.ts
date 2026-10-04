import type { PlayerWarrant, Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import {
  chooseWarrantTarget,
  evidenceTarget,
  lawyerUpCents,
  loadRulesetForRound,
  lossCapShare,
  policeLossRoom,
  retainerCents,
  rulesetForCity,
  type Ruleset,
  type WarrantTarget,
} from '@streets/rules-engine';
import type { GameActionResult, LawPageDto, WarrantDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { standingIn } from './boss-presence.service.js';
import { BusinessService } from './business.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { hideoutProductProtection, hideoutProtectedCashBonusCents } from './hideout.service.js';
import { LawService, seizedValueCents } from './law.service.js';
import { CRACK, ProductInventoryService } from './product-inventory.service.js';
import { refreshAwayWorth } from './run-settle.service.js';

const HOUR_MS = 3_600_000;
const OPEN_STATUSES = ['OPEN', 'WAITING'];

type PlayerWithCity = RoundPlayer & { city: { id: string; slug: string; name: string } };
type WarrantWithCity = PlayerWarrant & { city: { id: string; slug: string; name: string } };

/** Where a personal warrant finds the boss: at home, in town on a trip, or in town with a run. */
type Where = 'HOME' | 'TRIP' | 'RUN';

/** What serving a warrant would do, worked out before anything moves. */
export interface WarrantPlan {
  /** The target it will actually hit: a Hideout or business it can no longer reach falls back. */
  target: WarrantTarget;
  /** A personal warrant's place, or null when the boss is not in that city. */
  where: Where | null;
  businessId: string | null;
  businessName: string | null;
  /** Units of each product taken, crack included. */
  seized: Record<string, number>;
  /** Cash fined from home, the trip wallet or the run's wallet. */
  fineCents: bigint;
  registerFineCents: bigint;
  shutHours: number;
  lockMinutes: number;
  /** Net-worth value of everything taken. */
  lossCents: bigint;
  /** True when the day's cap made it take less. */
  capped: boolean;
  retained: boolean;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function scale(cents: bigint, share: number): bigint {
  return cents <= 0n || share <= 0 ? 0n : BigInt(Math.floor(Number(cents) * share));
}


function businessLabel(ruleset: Ruleset, business: { kind: string } | null): string | null {
  if (!business) return null;
  return ruleset.business?.catalog[business.kind as keyof NonNullable<Ruleset['business']>['catalog']]?.name ?? business.kind;
}

/** The player's racket business the police can hit in a city: running, staffed, still theirs. */
async function raidableBusiness(db: Db, roundPlayerId: string, cityId: string) {
  return db.business.findFirst({
    where: { staffOwnerId: roundPlayerId, level: { gt: 0 }, staff: { gt: 0 }, racket: { not: null }, turf: { cityId, holderId: roundPlayerId } },
    orderBy: [{ level: 'desc' }, { registerCents: 'desc' }, { id: 'asc' }],
    select: { id: true, kind: true },
  });
}

async function cityOf(db: Db, cityId: string) {
  return db.city.findUniqueOrThrow({ where: { id: cityId }, select: { id: true, slug: true, name: true } });
}

/**
 * 1.3.0-C. Warrants: drafted when a city's Case reaches the Warrant stage, served after the
 * warning window unless the player lawyers up. Every write happens under the player's lock.
 */
export const LawWarrantService = {
  /**
   * Draft a warrant in a city whose Case has reached the Warrant stage, unless one is open
   * there. It names the target the Case was mostly built against, among those reachable.
   */
  async draftIfDue(tx: Db, roundPlayerId: string, ruleset: Ruleset, cityId: string, now: Date): Promise<PlayerWarrant | null> {
    const rules = ruleset.law?.warrants;
    if (!rules) return null;
    if (await tx.playerWarrant.findFirst({ where: { roundPlayerId, cityId, status: { in: OPEN_STATUSES } }, select: { id: true } })) return null;
    const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { cityId: true } });
    const last = await tx.playerWarrant.findFirst({ where: { roundPlayerId, cityId }, orderBy: { draftedAt: 'desc' }, select: { draftedAt: true } });
    const receipts = await tx.playerCaseReceipt.findMany({
      where: { roundPlayerId, cityId, deltaHundredths: { gt: 0 }, ...(last ? { createdAt: { gte: last.draftedAt } } : {}) },
      select: { source: true, deltaHundredths: true },
    });
    const weights: Record<WarrantTarget, number> = { HIDEOUT: 0, BUSINESS: 0, PERSONAL: 0 };
    for (const receipt of receipts) {
      const target = evidenceTarget(receipt.source);
      if (target) weights[target] += receipt.deltaHundredths;
    }
    const business = await raidableBusiness(tx, roundPlayerId, cityId);
    const target = chooseWarrantTarget(weights, { hideout: player.cityId === cityId, business: Boolean(business) });
    const servesAt = new Date(now.getTime() + rules.warningHours * HOUR_MS);
    const warrant = await tx.playerWarrant.create({
      data: { roundPlayerId, cityId, target, businessId: target === 'BUSINESS' ? business!.id : null, draftedAt: now, servesAt },
    });
    const city = await cityOf(tx, cityId);
    await ActivityService.log(tx, roundPlayerId, 'WARRANT_DRAFTED', json({
      warrantId: warrant.id, citySlug: city.slug, cityName: city.name, target,
      businessName: target === 'BUSINESS' ? businessLabel(ruleset, business) : null, servesAt: servesAt.toISOString(),
    }));
    return warrant;
  },

  /**
   * Work out what serving a warrant would take, without moving anything. With `estimate`,
   * a personal warrant is priced as if the boss were home, so lawyering up has a price
   * before the boss shows up.
   */
  async plan(db: Db, player: PlayerWithCity, base: Ruleset, warrant: WarrantWithCity, now: Date, estimate = false): Promise<WarrantPlan> {
    const rules = base.law!.warrants!;
    const lawyer = base.law?.lawyer;
    const retained = Boolean(lawyer && player.lawyerRetainedUntil && player.lawyerRetainedUntil > now);
    const cut = retained ? lawyer!.retainer.seizureCut : 0;
    const home = warrant.cityId === player.cityId;

    let target = warrant.target as WarrantTarget;
    let business = target === 'BUSINESS' && warrant.businessId
      ? await db.business.findFirst({
        where: { id: warrant.businessId, staffOwnerId: player.id, level: { gt: 0 }, racket: { not: null }, turf: { holderId: player.id, cityId: warrant.cityId } },
        select: { id: true, kind: true, registerCents: true },
      })
      : null;
    // A Hideout that has moved away, or a business no longer the player's, cannot be raided.
    if (target === 'BUSINESS' && !business) target = home ? 'HIDEOUT' : 'PERSONAL';
    if (target === 'HIDEOUT' && !home) target = 'PERSONAL';
    if (target !== 'BUSINESS') business = null;

    const seized: Record<string, number> = {};
    let fineCents = 0n;
    let registerFineCents = 0n;
    let shutHours = 0;
    let lockMinutes = 0;
    let where: Where | null = null;
    const homeRuleset = rulesetForCity(base, player.city.slug);

    if (target === 'HIDEOUT') {
      const inventory = await ProductInventoryService.read(db, player.id, base);
      const exposed = hideoutProductProtection(homeRuleset, player, { ...inventory, [CRACK]: player.crack }).exposed;
      for (const [key, units] of Object.entries(exposed)) {
        const taken = Math.floor(Math.max(0, units) * rules.hideout.productSeizedFraction * (1 - cut));
        if (taken > 0) seized[key] = taken;
      }
      const protectedCash = BigInt((base.combat?.loot.protectedCashCents ?? 0) + hideoutProtectedCashBonusCents(homeRuleset, player));
      const exposedCash = player.cashCents > protectedCash ? player.cashCents - protectedCash : 0n;
      fineCents = scale(exposedCash, rules.hideout.cashFineFraction * (1 - cut));
    } else if (target === 'BUSINESS' && business) {
      registerFineCents = scale(business.registerCents, rules.business.registerFineFraction * (1 - cut));
      shutHours = rules.business.racketShutHours;
    } else {
      const standing = await standingIn(db, base, player, now);
      where = standing?.city === warrant.city.slug ? (standing.visiting ? await visitingVia(db, player.id) : 'HOME') : null;
      const priced = where ?? (estimate ? 'HOME' : null);
      const arrest = rulesetForCity(base, warrant.city.slug).heat?.arrest;
      const productShare = (arrest?.productSeizedFraction ?? rules.hideout.productSeizedFraction) * (1 - cut);
      const cashShare = (arrest?.cashFineFraction ?? rules.hideout.cashFineFraction) * (1 - cut);
      lockMinutes = Math.round((arrest?.downtimeMinutes ?? 0) * (1 - (retained ? lawyer!.retainer.downtimeCut : 0)));
      if (priced === 'HOME') {
        // An arrest, as Heat's own: nothing at home is protected from it.
        const inventory = await ProductInventoryService.read(db, player.id, base);
        for (const [key, units] of Object.entries({ ...inventory, [CRACK]: player.crack })) {
          const taken = Math.floor(Math.max(0, units) * productShare);
          if (taken > 0) seized[key] = taken;
        }
        fineCents = scale(player.cashCents, cashShare);
      } else if (priced === 'TRIP') {
        const trip = await db.bossTrip.findFirst({ where: { roundPlayerId: player.id, status: 'ACTIVE' }, select: { bankrollCents: true } });
        fineCents = scale(trip?.bankrollCents ?? 0n, cashShare);
      } else if (priced === 'RUN') {
        const run = await db.run.findFirst({ where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true }, select: { cashCents: true } });
        fineCents = scale(run?.cashCents ?? 0n, cashShare);
      }
    }

    // The day's cap: a warrant takes no more than what is left of today's room.
    const full = seizedValueCents(seized, base) + fineCents + registerFineCents;
    const day = new Date(now).toISOString().slice(0, 10);
    const room = policeLossRoom(player.netWorthCents, player.policeLossDay === day ? player.policeLossCents : 0n, rules);
    const share = lossCapShare(full, room);
    if (share < 1) {
      for (const key of Object.keys(seized)) {
        seized[key] = Math.floor(seized[key]! * share);
        if (seized[key] === 0) delete seized[key];
      }
      fineCents = scale(fineCents, share);
      registerFineCents = scale(registerFineCents, share);
    }
    const lossCents = seizedValueCents(seized, base) + fineCents + registerFineCents;

    return {
      target, where, businessId: business?.id ?? null, businessName: businessLabel(base, business),
      seized, fineCents, registerFineCents, shutHours, lockMinutes, lossCents, capped: share < 1, retained,
    };
  },

  /**
   * Serve every warrant that is due, and every personal warrant waiting on the boss. True if
   * any was served. Reads the round's own ruleset: a city's view of it would apply its Heat
   * severity twice.
   */
  async serveDue(tx: Db, roundPlayerId: string, now: Date): Promise<boolean> {
    const owner = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { round: { select: { rulesetId: true, rulesetVersion: true } } } });
    const ruleset = loadRulesetForRound(owner.round);
    if (!ruleset.law?.warrants) return false;
    const due = await tx.playerWarrant.findMany({
      where: { roundPlayerId, OR: [{ status: 'OPEN', servesAt: { lte: now } }, { status: 'WAITING' }] },
      include: { city: { select: { id: true, slug: true, name: true } } },
      orderBy: { servesAt: 'asc' },
    });
    let served = false;
    for (const warrant of due) {
      const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, include: { city: { select: { id: true, slug: true, name: true } } } });
      if (await LawWarrantService.serve(tx, player, ruleset, warrant, now)) served = true;
    }
    return served;
  },

  /** Serve one warrant. A personal warrant whose boss is not in that city waits instead. */
  async serve(tx: Db, player: PlayerWithCity, ruleset: Ruleset, warrant: WarrantWithCity, now: Date): Promise<boolean> {
    const rules = ruleset.law!.warrants!;
    const plan = await LawWarrantService.plan(tx, player, ruleset, warrant, now);
    if (plan.target === 'PERSONAL' && !plan.where) {
      if (warrant.status === 'OPEN') await tx.playerWarrant.update({ where: { id: warrant.id }, data: { status: 'WAITING', target: 'PERSONAL', businessId: null } });
      return false;
    }

    const nonCrack = Object.fromEntries(Object.entries(plan.seized).filter(([key]) => key !== CRACK).map(([key, units]) => [key, -units]));
    if (Object.keys(nonCrack).length) await ProductInventoryService.adjust(tx, player.id, ruleset, nonCrack);
    const crack = plan.seized[CRACK] ?? 0;
    const lockedUntil = plan.lockMinutes > 0 ? new Date(now.getTime() + plan.lockMinutes * 60_000) : null;
    const homeCashFine = plan.target === 'HIDEOUT' || plan.where === 'HOME' ? plan.fineCents : 0n;
    await tx.roundPlayer.update({
      where: { id: player.id },
      data: {
        ...(crack > 0 ? { crack: { decrement: crack } } : {}),
        ...(homeCashFine > 0n ? { cashCents: { decrement: homeCashFine } } : {}),
        ...(lockedUntil && (!player.lockedUntil || player.lockedUntil < lockedUntil) ? { lockedUntil } : {}),
      },
    });
    if (plan.where === 'TRIP' && plan.fineCents > 0n) {
      const trip = await tx.bossTrip.findFirstOrThrow({ where: { roundPlayerId: player.id, status: 'ACTIVE' }, select: { id: true } });
      await tx.bossTrip.update({ where: { id: trip.id }, data: { bankrollCents: { decrement: plan.fineCents } } });
    }
    if (plan.where === 'RUN' && plan.fineCents > 0n) {
      const run = await tx.run.findFirstOrThrow({ where: { roundPlayerId: player.id, status: 'ACTIVE', bossAboard: true }, select: { id: true } });
      await tx.run.update({ where: { id: run.id }, data: { cashCents: { decrement: plan.fineCents } } });
      await refreshAwayWorth(tx, player.id, ruleset);
    }
    let shutUntil: Date | null = null;
    if (plan.target === 'BUSINESS' && plan.businessId) {
      shutUntil = new Date(now.getTime() + plan.shutHours * HOUR_MS);
      await tx.business.update({
        where: { id: plan.businessId },
        data: { racketShutFrom: now, racketShutUntil: shutUntil, ...(plan.registerFineCents > 0n ? { registerCents: { decrement: plan.registerFineCents } } : {}) },
      });
      await BusinessService.refreshRacketEffects(tx, player.id, ruleset, now);
    }

    await LawService.notePoliceLoss(tx, player.id, ruleset, plan.lossCents, now);
    if (homeCashFine > 0n) {
      await EconomyLedgerService.record(tx, player.id, [{ source: 'WARRANT', label: `Warrant served · ${warrant.city.name}`, amountCents: -homeCashFine }], now);
    }
    const outcome = {
      target: plan.target, where: plan.where, businessName: plan.businessName,
      seized: plan.seized, fineCents: Number(plan.fineCents), registerFineCents: Number(plan.registerFineCents),
      shutUntil: shutUntil?.toISOString() ?? null, lockedUntil: lockedUntil?.toISOString() ?? null,
      capped: plan.capped, retained: plan.retained,
    };
    await tx.playerWarrant.update({
      where: { id: warrant.id },
      data: { status: 'SERVED', target: plan.target, businessId: plan.businessId, resolvedAt: now, outcome: json(outcome) },
    });
    await LawService.record(tx, player.id, ruleset, [{ cityId: warrant.cityId, ceiling: rules.caseAfterServed * 100, source: 'WARRANT', sourceKey: `warrant:${warrant.id}` }], now);
    await ActivityService.log(tx, player.id, 'WARRANT_SERVED', json({ warrantId: warrant.id, citySlug: warrant.city.slug, cityName: warrant.city.name, ...outcome }));
    return true;
  },

  /** Pay a lawyer during the warning window: the warrant becomes a fee, and the Case drops. */
  lawyerUp(prisma: PrismaClient, roundPlayerId: string, warrantId: string, actionId?: string): Promise<GameActionResult<{ warrantId: string; feeCents: number; cityName: string }>> {
    return ActionService.run(prisma, roundPlayerId, {
      action: 'LAWYER_UP',
      actionId,
      execute: async ({ tx, current, round, ruleset, now }) => {
        const lawyer = ruleset.law?.lawyer;
        if (!ruleset.law?.warrants || !lawyer) throw AppError.conflict('LAW_DISABLED', 'There are no warrants in this round.');
        const warrant = await tx.playerWarrant.findFirst({
          where: { id: warrantId, roundPlayerId, status: { in: OPEN_STATUSES } },
          include: { city: { select: { id: true, slug: true, name: true } } },
        });
        if (!warrant) throw AppError.notFound('WARRANT_NOT_OPEN', 'There is no open warrant like that against you.');
        const base = loadRulesetForRound(round);
        const self = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, include: { city: { select: { id: true, slug: true, name: true } } } });
        const plan = await LawWarrantService.plan(tx, { ...self, cashCents: current.cashCents, crack: current.crack }, base, warrant, now, true);
        const fee = lawyerUpCents(plan.lossCents, lawyer);
        if (fee > current.cashCents) throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot cover the lawyer.');
        await tx.playerWarrant.update({ where: { id: warrant.id }, data: { status: 'LAWYERED', resolvedAt: now, outcome: json({ target: plan.target, feeCents: Number(fee) }) } });
        return {
          next: { ...current, cashCents: current.cashCents - fee },
          result: { warrantId: warrant.id, feeCents: Number(fee), cityName: warrant.city.name },
          ledger: [{ source: 'LAWYER', label: `Lawyered up · ${warrant.city.name}`, amountCents: -fee }],
          activity: { type: 'WARRANT_LAWYERED', payload: json({ warrantId: warrant.id, citySlug: warrant.city.slug, cityName: warrant.city.name, target: plan.target, feeCents: Number(fee) }) },
          caseEvidence: [{ cityId: warrant.cityId, ceiling: ruleset.law.warrants.caseAfterAnswered * 100, source: 'LAWYER' }],
        };
      },
    });
  },

  /** Keep a lawyer on retainer for the ruleset's days, extending any retainer already running. */
  retain(prisma: PrismaClient, roundPlayerId: string, actionId?: string): Promise<GameActionResult<{ feeCents: number; retainedUntil: string }>> {
    return ActionService.run(prisma, roundPlayerId, {
      action: 'LAWYER_RETAIN',
      actionId,
      execute: async ({ tx, current, player, ruleset, now }) => {
        const lawyer = ruleset.law?.lawyer;
        if (!lawyer) throw AppError.conflict('LAW_DISABLED', 'There are no lawyers in this round.');
        const fee = retainerCents(player.netWorthCents, lawyer);
        if (fee > current.cashCents) throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot cover the retainer.');
        const from = player.lawyerRetainedUntil && player.lawyerRetainedUntil > now ? player.lawyerRetainedUntil : now;
        const until = new Date(from.getTime() + lawyer.retainer.days * 24 * HOUR_MS);
        await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { lawyerRetainedUntil: until } });
        return {
          next: { ...current, cashCents: current.cashCents - fee },
          result: { feeCents: Number(fee), retainedUntil: until.toISOString() },
          ledger: [{ source: 'LAWYER', label: 'Lawyer on retainer', amountCents: -fee }],
          activity: { type: 'LAWYER_RETAINED', payload: json({ feeCents: Number(fee), retainedUntil: until.toISOString(), days: lawyer.retainer.days }) },
        };
      },
    });
  },

  /** Fill the law page's warrants, lawyer and daily-loss blocks. Only the player's own. */
  async decoratePage(db: Db, page: LawPageDto, roundPlayerId: string, now: Date = new Date()): Promise<LawPageDto> {
    const player = await db.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, include: { city: { select: { id: true, slug: true, name: true } }, round: true } });
    const base = loadRulesetForRound(player.round);
    const rules = base.law?.warrants;
    if (!rules) return page;
    const [open, resolved] = await Promise.all([
      db.playerWarrant.findMany({
        where: { roundPlayerId, status: { in: OPEN_STATUSES } },
        include: { city: { select: { id: true, slug: true, name: true } }, business: { select: { kind: true } } },
        orderBy: { servesAt: 'asc' },
      }),
      db.playerWarrant.findMany({
        where: { roundPlayerId, status: { notIn: OPEN_STATUSES } },
        include: { city: { select: { id: true, slug: true, name: true } }, business: { select: { kind: true } } },
        orderBy: { resolvedAt: 'desc' },
        take: 5,
      }),
    ]);
    const lawyer = base.law?.lawyer;
    const warrants: WarrantDto[] = [];
    for (const warrant of open) {
      const plan = await LawWarrantService.plan(db, player, base, warrant, now, true);
      warrants.push({
        ...warrantDto(base, warrant),
        atRisk: {
          seized: plan.seized, fineCents: Number(plan.fineCents), registerFineCents: Number(plan.registerFineCents),
          shutHours: plan.shutHours, lockMinutes: plan.lockMinutes, capped: plan.capped,
        },
        lawyerUpCents: lawyer ? Number(lawyerUpCents(plan.lossCents, lawyer)) : null,
      });
    }
    for (const warrant of resolved) warrants.push(warrantDto(base, warrant));
    const day = now.toISOString().slice(0, 10);
    return {
      ...page,
      warrants,
      lawyer: lawyer ? {
        retainedUntil: player.lawyerRetainedUntil && player.lawyerRetainedUntil > now ? player.lawyerRetainedUntil.toISOString() : null,
        retainerCents: Number(retainerCents(player.netWorthCents, lawyer)),
        days: lawyer.retainer.days,
        seizureCut: lawyer.retainer.seizureCut,
        downtimeCut: lawyer.retainer.downtimeCut,
      } : null,
      dailyLoss: {
        capCents: Math.floor(Number(player.netWorthCents) * rules.dailyLossCapNetWorthShare),
        lostTodayCents: Number(player.policeLossDay === day ? player.policeLossCents : 0n),
      },
    };
  },

  /** Every player with a warrant due, for the background sweep. */
  async dueOwners(prisma: PrismaClient, now: Date, limit = 200): Promise<string[]> {
    const rows = await prisma.playerWarrant.findMany({
      where: { OR: [{ status: 'OPEN', servesAt: { lte: now } }, { status: 'WAITING' }] },
      select: { roundPlayerId: true },
      distinct: ['roundPlayerId'],
      take: limit,
    });
    return rows.map((row) => row.roundPlayerId);
  },
};

function warrantDto(ruleset: Ruleset, warrant: WarrantWithCity & { business: { kind: string } | null }): WarrantDto {
  const outcome = warrant.outcome as Record<string, unknown>;
  return {
    id: warrant.id,
    citySlug: warrant.city.slug,
    cityName: warrant.city.name,
    target: warrant.target as WarrantDto['target'],
    businessName: businessLabel(ruleset, warrant.business) ?? (typeof outcome.businessName === 'string' ? outcome.businessName : null),
    status: warrant.status as WarrantDto['status'],
    draftedAt: warrant.draftedAt.toISOString(),
    servesAt: warrant.servesAt.toISOString(),
    resolvedAt: warrant.resolvedAt?.toISOString() ?? null,
    atRisk: null,
    lawyerUpCents: null,
    outcome: warrant.resolvedAt ? outcome : null,
  };
}

/** How a visiting boss got there: a flight trip, or riding with a run. */
async function visitingVia(db: Db, roundPlayerId: string): Promise<Where> {
  const trip = await db.bossTrip.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, select: { id: true } });
  return trip ? 'TRIP' : 'RUN';
}
