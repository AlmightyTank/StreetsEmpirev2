import type { PlayerOfficial, Prisma, PrismaClient } from '@prisma/client';
import {
  cityLaw,
  crossesIaLine,
  lawPriceCents,
  loadRulesetForRound,
  nudgedAmount,
  rulesetForCity,
  type Ruleset,
} from '@streets/rules-engine';
import type { LawOfficialRole } from '@streets/rulesets';
import type { GameActionResult, LawPageDto, OfficialDto, TipDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { LawService } from './law.service.js';
import { FactionService } from './faction.service.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const ROLES: readonly LawOfficialRole[] = ['CAPTAIN', 'DA', 'JUDGE', 'CUSTOMS'];

/** What each post is called. */
export const OFFICIAL_TITLES: Record<LawOfficialRole, string> = {
  CAPTAIN: 'Precinct Captain',
  DA: 'District Attorney',
  JUDGE: 'Judge',
  CUSTOMS: 'Customs Officer',
};

/** The exposure each kind of favor adds. */
export type OfficialFavor = 'captainWindow' | 'captainTip' | 'daQuash' | 'daSlowedPoint' | 'judgeServe' | 'customsFlight';

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** On the books, not caught or cut, and paid up: the only state in which an official helps. */
function working(official: PlayerOfficial, now: Date): boolean {
  return official.status === 'ACTIVE' && official.paidUntil > now;
}

async function cityName(db: Db, cityId: string): Promise<{ slug: string; name: string }> {
  return db.city.findUniqueOrThrow({ where: { id: cityId }, select: { slug: true, name: true } });
}

/**
 * 1.3.0-D. Corrupt officials and informants.
 *
 * An official works only while paid. Every favor adds exposure; the favor that crosses the
 * line opens an Internal Affairs file and warns the player, and an official still on the
 * books (paid or not) when the sting lands is stung: the post ends and the player's Case in
 * that city takes the sting's evidence. Cutting an official loose ends it cleanly. Nothing
 * here is random. Callers hold the player's lock.
 */
export const LawOfficialService = {
  /** The official holding a post in a city right now, if they are working. */
  async working(db: Db, roundPlayerId: string, cityId: string, role: LawOfficialRole, now: Date): Promise<PlayerOfficial | null> {
    const official = await db.playerOfficial.findUnique({ where: { roundPlayerId_cityId_role: { roundPlayerId, cityId, role } } });
    return official && working(official, now) ? official : null;
  },

  /** Record a favor: its exposure, and Internal Affairs if it crosses the line. */
  async favor(tx: Db, ruleset: Ruleset, official: PlayerOfficial, favor: OfficialFavor, now: Date, times = 1): Promise<void> {
    const rules = ruleset.law?.officials;
    if (!rules) return;
    const raw = Math.round(rules.exposure.perFavor[favor] * times);
    // 1.4.0-D: Connected with Civic Handshake, each favor leaves a little less of a trail.
    const nudge = await FactionService.nudge(tx, official.roundPlayerId, ruleset, 'OFFICIAL_EXPOSURE');
    const added = nudge ? nudgedAmount(raw, nudge.percent) : raw;
    if (nudge && raw > added) {
      await FactionService.logNudge(tx, official.roundPlayerId, nudge, 'OFFICIAL_EXPOSURE', `exposure:${official.id}:${favor}:${official.exposure}:${now.toISOString()}`, { exposure: raw - added }, now);
    }
    if (added <= 0) return;
    const opens = !official.iaOpenedAt && crossesIaLine(official.exposure, added, rules);
    const stingAt = new Date(now.getTime() + rules.exposure.iaWarningHours * HOUR_MS);
    await tx.playerOfficial.update({
      where: { id: official.id },
      data: { exposure: { increment: added }, ...(opens ? { iaOpenedAt: now, stingAt } : {}) },
    });
    if (opens) {
      const city = await cityName(tx, official.cityId);
      await ActivityService.log(tx, official.roundPlayerId, 'OFFICIAL_IA_OPENED', json({
        officialId: official.id, role: official.role, title: OFFICIAL_TITLES[official.role as LawOfficialRole],
        citySlug: city.slug, cityName: city.name, stingAt: stingAt.toISOString(),
      }));
    }
  },

  /** Land every sting that is due: an official still on the books when Internal Affairs moves. */
  async settleDue(tx: Db, roundPlayerId: string, ruleset: Ruleset, now: Date): Promise<boolean> {
    const rules = ruleset.law?.officials;
    if (!rules) return false;
    const due = await tx.playerOfficial.findMany({ where: { roundPlayerId, status: 'ACTIVE', stingAt: { lte: now } } });
    for (const official of due) {
      await tx.playerOfficial.update({ where: { id: official.id }, data: { status: 'STUNG', endedAt: official.stingAt! } });
      await LawService.record(tx, roundPlayerId, ruleset, [{
        cityId: official.cityId, points: rules.exposure.stingPoints, source: 'STING', sourceKey: `sting:${official.id}:${official.hiredAt.toISOString()}`,
      }], now);
      const city = await cityName(tx, official.cityId);
      await ActivityService.log(tx, roundPlayerId, 'OFFICIAL_STUNG', json({
        officialId: official.id, role: official.role, title: OFFICIAL_TITLES[official.role as LawOfficialRole],
        citySlug: city.slug, cityName: city.name, points: rules.exposure.stingPoints,
      }));
    }
    return due.length > 0;
  },

  /** Put an official on the payroll for a week, in any city. */
  hire(prisma: PrismaClient, roundPlayerId: string, input: { citySlug: string; role: LawOfficialRole; actionId?: string }): Promise<GameActionResult<{ officialId: string; weekCents: number; paidUntil: string }>> {
    return ActionService.run(prisma, roundPlayerId, {
      action: 'OFFICIAL_HIRE',
      actionId: input.actionId,
      execute: async ({ tx, current, player, ruleset, now }) => {
        const rules = ruleset.law?.officials;
        if (!rules) throw AppError.conflict('LAW_DISABLED', 'There is nobody to put on the payroll in this round.');
        if (!ruleset.cities?.[input.citySlug]) throw AppError.badRequest('UNKNOWN_CITY', 'That city is not on the map.', { citySlug: 'Pick a city.' });
        const city = await tx.city.findUnique({ where: { slug: input.citySlug }, select: { id: true, name: true, isEnabled: true } });
        if (!city?.isEnabled) throw AppError.badRequest('UNKNOWN_CITY', 'That city is not on the map.', { citySlug: 'Pick a city.' });
        const existing = await tx.playerOfficial.findUnique({ where: { roundPlayerId_cityId_role: { roundPlayerId, cityId: city.id, role: input.role } } });
        if (existing?.status === 'ACTIVE') {
          throw AppError.conflict('OFFICIAL_ON_PAYROLL', `You already have the ${city.name} ${OFFICIAL_TITLES[input.role]}. Pay another week instead.`);
        }
        if (existing?.endedAt && existing.endedAt.getTime() + rules.exposure.rehireCooldownHours * HOUR_MS > now.getTime()) {
          throw AppError.conflict('OFFICIAL_COOLDOWN', `Nobody in that office will take your money yet. Try again after ${new Date(existing.endedAt.getTime() + rules.exposure.rehireCooldownHours * HOUR_MS).toISOString()}.`);
        }
        const fee = lawPriceCents(player.netWorthCents, rules.roles[input.role]);
        if (fee > current.cashCents) throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot cover a week of them.');
        const paidUntil = new Date(now.getTime() + rules.weekDays * DAY_MS);
        const fresh = { status: 'ACTIVE', hiredAt: now, paidUntil, exposure: 0, iaOpenedAt: null, stingAt: null, quashReadyAt: null, endedAt: null, iaAlertedAt: null, stungAlertedAt: null };
        const official = await tx.playerOfficial.upsert({
          where: { roundPlayerId_cityId_role: { roundPlayerId, cityId: city.id, role: input.role } },
          create: { roundPlayerId, cityId: city.id, role: input.role, ...fresh },
          update: fresh,
        });
        return {
          next: { ...current, cashCents: current.cashCents - fee },
          result: { officialId: official.id, weekCents: Number(fee), paidUntil: paidUntil.toISOString() },
          ledger: [{ source: 'OFFICIALS', label: `${city.name} ${OFFICIAL_TITLES[input.role]}`, amountCents: -fee }],
          activity: { type: 'OFFICIAL_HIRED', payload: json({ officialId: official.id, role: input.role, title: OFFICIAL_TITLES[input.role], cityName: city.name, weekCents: Number(fee), paidUntil: paidUntil.toISOString(), renewed: false }) },
        };
      },
    });
  },

  /** Another week for an official already on the books, from whenever the last one ends. */
  payWeek(prisma: PrismaClient, roundPlayerId: string, officialId: string, actionId?: string): Promise<GameActionResult<{ officialId: string; weekCents: number; paidUntil: string }>> {
    return ActionService.run(prisma, roundPlayerId, {
      action: 'OFFICIAL_PAY',
      actionId,
      execute: async ({ tx, current, player, ruleset, now }) => {
        const rules = ruleset.law?.officials;
        if (!rules) throw AppError.conflict('LAW_DISABLED', 'There is nobody to pay in this round.');
        const official = await tx.playerOfficial.findFirst({ where: { id: officialId, roundPlayerId, status: 'ACTIVE' } });
        if (!official) throw AppError.notFound('OFFICIAL_NOT_FOUND', 'That official is not on your payroll.');
        const role = official.role as LawOfficialRole;
        const fee = lawPriceCents(player.netWorthCents, rules.roles[role]);
        if (fee > current.cashCents) throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot cover another week.');
        const from = official.paidUntil > now ? official.paidUntil : now;
        const paidUntil = new Date(from.getTime() + rules.weekDays * DAY_MS);
        await tx.playerOfficial.update({ where: { id: official.id }, data: { paidUntil } });
        const city = await cityName(tx, official.cityId);
        return {
          next: { ...current, cashCents: current.cashCents - fee },
          result: { officialId: official.id, weekCents: Number(fee), paidUntil: paidUntil.toISOString() },
          ledger: [{ source: 'OFFICIALS', label: `${city.name} ${OFFICIAL_TITLES[role]}`, amountCents: -fee }],
          activity: { type: 'OFFICIAL_HIRED', payload: json({ officialId: official.id, role, title: OFFICIAL_TITLES[role], cityName: city.name, weekCents: Number(fee), paidUntil: paidUntil.toISOString(), renewed: true }) },
        };
      },
    });
  },

  /** Let an official go. The week paid is lost, and so is any sting Internal Affairs had planned. */
  cut(prisma: PrismaClient, roundPlayerId: string, officialId: string, actionId?: string): Promise<GameActionResult<{ officialId: string }>> {
    return ActionService.run(prisma, roundPlayerId, {
      action: 'OFFICIAL_CUT',
      actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        if (!ruleset.law?.officials) throw AppError.conflict('LAW_DISABLED', 'There is nobody to cut loose in this round.');
        const official = await tx.playerOfficial.findFirst({ where: { id: officialId, roundPlayerId, status: 'ACTIVE' } });
        if (!official) throw AppError.notFound('OFFICIAL_NOT_FOUND', 'That official is not on your payroll.');
        await tx.playerOfficial.update({ where: { id: official.id }, data: { status: 'CUT', endedAt: now } });
        const city = await cityName(tx, official.cityId);
        return {
          next: current,
          result: { officialId: official.id },
          activity: { type: 'OFFICIAL_CUT', payload: json({ officialId: official.id, role: official.role, title: OFFICIAL_TITLES[official.role as LawOfficialRole], cityName: city.name, underInvestigation: Boolean(official.iaOpenedAt) }) },
        };
      },
    });
  },

  /** A District Attorney quashes a warrant in their city: no raid, and the Case drops as if answered. */
  quash(prisma: PrismaClient, roundPlayerId: string, warrantId: string, actionId?: string): Promise<GameActionResult<{ warrantId: string; cityName: string; quashReadyAt: string }>> {
    return ActionService.run(prisma, roundPlayerId, {
      action: 'WARRANT_QUASH',
      actionId,
      execute: async ({ tx, current, ruleset, now }) => {
        const rules = ruleset.law?.officials;
        const warrants = ruleset.law?.warrants;
        if (!rules || !warrants) throw AppError.conflict('LAW_DISABLED', 'There is nobody to quash anything in this round.');
        const warrant = await tx.playerWarrant.findFirst({
          where: { id: warrantId, roundPlayerId, status: { in: ['OPEN', 'WAITING'] } },
          include: { city: { select: { slug: true, name: true } } },
        });
        if (!warrant) throw AppError.notFound('WARRANT_NOT_OPEN', 'There is no open warrant like that against you.');
        const da = await LawOfficialService.working(tx, roundPlayerId, warrant.cityId, 'DA', now);
        if (!da) throw AppError.conflict('NO_DA', `You have no District Attorney working in ${warrant.city.name}.`);
        if (da.quashReadyAt && da.quashReadyAt > now) throw AppError.conflict('DA_USED', `Your ${warrant.city.name} DA cannot make another warrant disappear until ${da.quashReadyAt.toISOString()}.`);
        const quashReadyAt = new Date(now.getTime() + rules.roles.DA.quashEveryDays * DAY_MS);
        await tx.playerWarrant.update({ where: { id: warrant.id }, data: { status: 'QUASHED', resolvedAt: now, outcome: json({ target: warrant.target, quashedBy: 'DA' }) } });
        await tx.playerOfficial.update({ where: { id: da.id }, data: { quashReadyAt } });
        await LawOfficialService.favor(tx, ruleset, da, 'daQuash', now);
        return {
          next: current,
          result: { warrantId: warrant.id, cityName: warrant.city.name, quashReadyAt: quashReadyAt.toISOString() },
          activity: { type: 'WARRANT_QUASHED', payload: json({ warrantId: warrant.id, citySlug: warrant.city.slug, cityName: warrant.city.name, target: warrant.target }) },
          caseEvidence: [{ cityId: warrant.cityId, ceiling: warrants.caseAfterAnswered * 100, source: 'QUASH' }],
        };
      },
    });
  },

  /**
   * Buy a tip. SWEEP: the federal sweep's city and time, while it is still a secret. CITY: a
   * city's police lines, which the game only shows for the player's own home. Nothing is
   * charged when there is nothing to tell.
   */
  buyTip(prisma: PrismaClient, roundPlayerId: string, input: { kind: 'SWEEP' | 'CITY'; citySlug?: string; actionId?: string }): Promise<GameActionResult<TipDto>> {
    return ActionService.run(prisma, roundPlayerId, {
      action: 'INFORMANT_TIP',
      actionId: input.actionId,
      execute: async ({ tx, current, player, round, now }) => {
        const base = loadRulesetForRound(round);
        const informants = base.law?.informants;
        if (!informants) throw AppError.conflict('LAW_DISABLED', 'Nobody is selling tips in this round.');
        let payload: Record<string, unknown>;
        let cityId: string | null = null;
        let name: string | null = null;
        let fee: bigint;
        if (input.kind === 'SWEEP') {
          const sweep = await tx.turfCrackdown.findUnique({ where: { roundId: round.id }, include: { city: { select: { slug: true, name: true } } } });
          if (!sweep || sweep.sweptAt) throw AppError.conflict('NOTHING_TO_TELL', 'Nobody has heard of a federal sweep coming this round.');
          if (sweep.warningAt <= now) throw AppError.conflict('NOTHING_TO_TELL', `The sweep on ${sweep.city.name} is already public. Nobody will sell you news.`);
          fee = lawPriceCents(player.netWorthCents, informants.sweep);
          cityId = sweep.cityId;
          name = sweep.city.name;
          payload = { citySlug: sweep.city.slug, cityName: sweep.city.name, sweepAt: sweep.sweepAt.toISOString(), publicAt: sweep.warningAt.toISOString() };
        } else {
          const slug = input.citySlug;
          const rules = slug ? base.cities?.[slug] : undefined;
          if (!slug || !rules) throw AppError.badRequest('UNKNOWN_CITY', 'Name a city on the map.', { citySlug: 'Pick a city.' });
          const city = await tx.city.findUniqueOrThrow({ where: { slug }, select: { id: true, name: true } });
          if (city.id === player.cityId) throw AppError.conflict('NOTHING_TO_TELL', 'You already know how your own city’s police work.');
          if (await tx.playerTip.findFirst({ where: { roundPlayerId, kind: 'CITY', cityId: city.id }, select: { id: true } })) {
            throw AppError.conflict('NOTHING_TO_TELL', `You already bought the word on ${city.name}.`);
          }
          fee = lawPriceCents(player.netWorthCents, informants.city);
          const heat = rulesetForCity(base, slug).heat;
          cityId = city.id;
          name = city.name;
          payload = {
            citySlug: slug, cityName: city.name,
            dragStartsAt: rules.heat.dragStartsAt, bustStartsAt: rules.heat.bustStartsAt, arrestStartsAt: rules.heat.arrestStartsAt,
            bustSeverity: rules.heat.bustSeverity, policePressure: rules.policePressure,
            arrestLockMinutes: heat?.arrest?.downtimeMinutes ?? null,
            // 1.3.0-E: and how its police work a Case, before you have one there.
            ...(base.law?.cities ? { law: cityLaw(base.law, slug) } : {}),
          };
        }
        if (fee > current.cashCents) throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot pay the informant.');
        const tip = await tx.playerTip.create({ data: { roundPlayerId, kind: input.kind, cityId, payload: json(payload), createdAt: now } });
        const result: TipDto = { id: tip.id, kind: input.kind, cityName: name, payload, at: now.toISOString() };
        return {
          next: { ...current, cashCents: current.cashCents - fee },
          result,
          ledger: [{ source: 'INFORMANTS', label: input.kind === 'SWEEP' ? 'Tip: the federal sweep' : `Tip: ${name} police`, amountCents: -fee }],
          activity: { type: 'INFORMANT_TIP', payload: json({ kind: input.kind, cityName: name, feeCents: Number(fee), ...payload }) },
        };
      },
    });
  },

  /** Fill the law page's payroll and informants, and mark the warrants a DA can quash. */
  async decoratePage(db: Db, page: LawPageDto, roundPlayerId: string, now: Date = new Date()): Promise<LawPageDto> {
    const player = await db.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { netWorthCents: true, round: true } });
    const base = loadRulesetForRound(player.round);
    const rules = base.law?.officials;
    const informants = base.law?.informants;
    if (!rules && !informants) return page;
    const [officials, tips, cities] = await Promise.all([
      db.playerOfficial.findMany({ where: { roundPlayerId }, include: { city: { select: { slug: true, name: true } } }, orderBy: [{ status: 'asc' }, { hiredAt: 'desc' }] }),
      db.playerTip.findMany({ where: { roundPlayerId }, include: { city: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 20 }),
      db.city.findMany({ where: { isEnabled: true, slug: { in: Object.keys(base.cities ?? {}) } }, select: { id: true, slug: true, name: true }, orderBy: { sortOrder: 'asc' } }),
    ]);
    const quashCities = new Set(officials.filter((row) => row.role === 'DA' && working(row, now) && (!row.quashReadyAt || row.quashReadyAt <= now)).map((row) => row.cityId));
    const cityIds = new Map(cities.map((city) => [city.slug, city.id]));
    return {
      ...page,
      warrants: page.warrants.map((warrant) => ({
        ...warrant,
        quashable: (warrant.status === 'OPEN' || warrant.status === 'WAITING') && quashCities.has(cityIds.get(warrant.citySlug) ?? ''),
      })),
      payroll: rules ? {
        weekDays: rules.weekDays,
        exposureLine: rules.exposure.line,
        stingPoints: rules.exposure.stingPoints,
        roles: ROLES.map((role) => ({ role, weekCents: Number(lawPriceCents(player.netWorthCents, rules.roles[role])) })),
        cities: cities.map((city) => ({ slug: city.slug, name: city.name })),
        officials: officials
          .filter((row) => row.status === 'ACTIVE' || (row.endedAt && row.endedAt.getTime() > now.getTime() - 7 * DAY_MS))
          .map((row): OfficialDto => ({
            id: row.id,
            citySlug: row.city.slug,
            cityName: row.city.name,
            role: row.role as OfficialDto['role'],
            status: row.status === 'ACTIVE' ? (row.paidUntil > now ? 'ACTIVE' : 'LAPSED') : row.status as OfficialDto['status'],
            paidUntil: row.paidUntil.toISOString(),
            exposure: row.exposure,
            iaOpenedAt: row.iaOpenedAt?.toISOString() ?? null,
            stingAt: row.stingAt?.toISOString() ?? null,
            quashReadyAt: row.role === 'DA' ? row.quashReadyAt?.toISOString() ?? null : null,
            weekCents: Number(lawPriceCents(player.netWorthCents, rules.roles[row.role as LawOfficialRole])),
          })),
      } : null,
      informants: informants ? {
        sweepCents: Number(lawPriceCents(player.netWorthCents, informants.sweep)),
        cityCents: Number(lawPriceCents(player.netWorthCents, informants.city)),
        tips: tips.map((tip) => ({ id: tip.id, kind: tip.kind as TipDto['kind'], cityName: tip.city?.name ?? null, payload: tip.payload as Record<string, unknown>, at: tip.createdAt.toISOString() })),
      } : null,
    };
  },

  /** Every player with a sting due, for the background sweep. */
  async dueOwners(prisma: PrismaClient, now: Date, limit = 200): Promise<string[]> {
    const rows = await prisma.playerOfficial.findMany({
      where: { status: 'ACTIVE', stingAt: { lte: now }, roundPlayer: { round: { status: 'ACTIVE', endsAt: { gt: now } } } },
      select: { roundPlayerId: true },
      distinct: ['roundPlayerId'],
      orderBy: { stingAt: 'asc' },
      take: limit,
    });
    return rows.map((row) => row.roundPlayerId);
  },
};
