import type { Prisma, PrismaClient } from '@prisma/client';
import type { LawAttentionSource } from '@streets/rulesets';
import {
  addCase,
  addLawPressure,
  CASE_SCALE,
  caseFromHeat,
  caseFromPoints,
  captainHeadsUp,
  cityCaseDelta,
  cityLaw,
  coolCase,
  coolingStartsAt,
  corruptionCostCents,
  currencyReports,
  daSlowed,
  federalTransfer,
  lawDay,
  lawWantedTier,
  nextStage,
  productNetWorthCents,
  stageRank,
  stageStartsAt,
  WANTED_STAGES,
  wantedStage,
  type LawPressureChange,
  type Ruleset,
} from '@streets/rules-engine';
import {
  lawCorruptionSchema,
  type CaseSourceDto,
  type GameActionResult,
  type LawDto,
  type LawPageDto,
  type LawSummaryDto,
  type TripHeatDto,
} from '@streets/shared';
import type { WantedStage } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';
import { ActionService, type PlayerState } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { HappinessService } from './happiness.service.js';
import { LawOfficialService } from './law-official.service.js';
import { LawWarrantService } from './law-warrant.service.js';
import { NetWorthService } from './net-worth.service.js';

export interface LawCorruptionResult {
  attention: number;
  costCents: number;
  attentionBefore: number;
  attentionAfter: number;
  evidence: number;
  wantedLevel: number;
  wantedName: string;
}

export type CaseSource = CaseSourceDto;

export interface CaseEvidence {
  cityId?: string;
  citySlug?: string;
  source: CaseSource;
  sourceKey: string;
  heat?: number;
  points?: number;
  cashCents?: bigint;
  ceiling?: number;
  floor?: number;
}

export type CaseHeat = CaseEvidence & { heat: number };

export interface CaseChange {
  cityId: string;
  before: number;
  after: number;
  stage: WantedStage;
  stageUp: boolean;
}

export function toLawDto(attention: number, evidence: number, netWorthCents: bigint, ruleset: Ruleset): LawDto | null {
  const rules = ruleset.law;
  if (!rules) return null;
  const tier = lawWantedTier(rules, attention);
  return {
    attention,
    evidence,
    maxAttention: rules.maxAttention,
    maxEvidence: rules.investigation.maxEvidence,
    decayPerInterval: rules.decayPerTurnInterval,
    intervalMinutes: ruleset.turns.intervalMinutes,
    wantedLevel: tier.level,
    wantedName: tier.name,
    wantedDescription: tier.description,
    evidenceStartsAt: rules.investigation.evidenceStartsAt,
    warrantStartsAt: rules.investigation.warrantStartsAt,
    informantStartsAt: rules.investigation.informantStartsAt,
    warrantRisk: evidence >= rules.investigation.warrantStartsAt,
    informantRisk: evidence >= rules.investigation.informantStartsAt,
    corruptionCentsPerAttention: Number(corruptionCostCents(1, netWorthCents, rules)),
    corruptionDailyCap: rules.corruption.dailyAttentionCap,
  };
}

export function seizedValueCents(seized: Readonly<Record<string, number>>, ruleset: Ruleset): bigint {
  const { CRACK: crack = 0, ...rest } = seized;
  return BigInt(Math.max(0, crack)) * BigInt(ruleset.economy.netWorth.perCrackCents) + productNetWorthCents(rest, ruleset);
}

export function tripCaseEvidence(
  heat: TripHeatDto | undefined,
  source: 'SCOUT' | 'PRODUCE',
  ruleset: Ruleset,
): Array<Omit<CaseEvidence, 'sourceKey'>> {
  if (!heat || !ruleset.law) return [];
  const evidence = ruleset.law.evidence;
  return [
    ...(heat.added > 0 ? [{ heat: heat.added, source }] : []),
    ...(evidence && heat.arrested ? [{ points: evidence.arrest, source: 'ARREST' as const }] : []),
    ...(evidence && heat.busted ? [{ points: evidence.bust, source: 'BUST' as const }] : []),
  ];
}

const PASSIVE = new Set<CaseSource>(['RACKETS', 'CRACKDOWN', 'LAUNDERING', 'COOLING', 'WARRANT', 'LAWYER', 'QUASH']);
const RECEIPT_LIMIT = 30;

function points(hundredths: number): number {
  return hundredths / CASE_SCALE;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export const LawService = {
  apply(
    ruleset: Ruleset,
    state: Pick<PlayerState, 'lawAttention' | 'lawEvidence'>,
    source: LawAttentionSource,
    units: number,
  ): { next: Pick<PlayerState, 'lawAttention' | 'lawEvidence'>; pressure?: LawPressureChange } {
    if (!ruleset.law || units <= 0) return { next: state };
    const pressure = addLawPressure(
      ruleset.law,
      { attention: state.lawAttention, evidence: state.lawEvidence },
      source,
      units,
    );

    return {
      next: { lawAttention: pressure.attentionAfter, lawEvidence: pressure.evidenceAfter },
      pressure,
    };
  },

  async corruption(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown): Promise<GameActionResult<LawCorruptionResult>> {
    const input = lawCorruptionSchema.parse(rawInput);
    return ActionService.run<LawCorruptionResult>(prisma, roundPlayerId, {
      action: 'LAW_CORRUPTION',
      actionId: input.actionId,
      execute: async ({ tx, current, ruleset }) => {
        const rules = ruleset.law;
        if (!rules) throw AppError.conflict('LAW_DISABLED', 'The law is not tracking this round.');
        if (current.lawAttention <= 0) throw AppError.badRequest('NO_LAW_ATTENTION', 'Nobody has an active file worth paying off.');
        if (input.attention > current.lawAttention) {
          throw AppError.badRequest('TOO_MUCH_ATTENTION', `You only have ${current.lawAttention} attention to clear.`, { attention: `At most ${current.lawAttention}.` });
        }
        if (input.attention > rules.corruption.dailyAttentionCap) {
          throw AppError.badRequest('CORRUPTION_CAP', `You can only bury ${rules.corruption.dailyAttentionCap} attention at a time.`, { attention: `At most ${rules.corruption.dailyAttentionCap}.` });
        }

        const products = await HappinessService.otherProducts(tx, roundPlayerId, ruleset);
        const costCents = corruptionCostCents(
          input.attention,
          NetWorthService.calculate({ ...current, products }, ruleset),
          rules,
        );

        if (costCents > current.cashCents) {
          throw AppError.badRequest('NOT_ENOUGH_CASH', 'You cannot cover that envelope.', { attention: 'Not enough cash.' });
        }

        const next = {
          ...current,
          cashCents: current.cashCents - costCents,
          lawAttention: current.lawAttention - input.attention,
        };
        const tier = lawWantedTier(rules, next.lawAttention);
        const result: LawCorruptionResult = {
          attention: input.attention,
          costCents: Number(costCents),
          attentionBefore: current.lawAttention,
          attentionAfter: next.lawAttention,
          evidence: next.lawEvidence,
          wantedLevel: tier.level,
          wantedName: tier.name,
        };

        return {
          next,
          result,
          activity: { type: 'LAW_CORRUPTION', payload: result },
        };
      },
    });
  },

  async record(tx: Db, roundPlayerId: string, ruleset: Ruleset, entries: readonly CaseEvidence[], now: Date = new Date()): Promise<CaseChange[]> {
    const rules = ruleset.law;
    if (!rules) return [];

    const changes: CaseChange[] = [];
    const cities = new Map<string, { id: string; slug: string; name: string }>();

    async function city(entry: CaseEvidence) {
      const key = entry.cityId ?? `slug:${entry.citySlug}`;
      const known = cities.get(key);
      if (known) return known;
      const row = entry.cityId
        ? await tx.city.findUnique({ where: { id: entry.cityId }, select: { id: true, slug: true, name: true } })
        : entry.citySlug
          ? await tx.city.findUnique({ where: { slug: entry.citySlug }, select: { id: true, slug: true, name: true } })
          : null;
      if (row) cities.set(key, row);
      return row;
    }

    for (const entry of entries) {
      const cash = entry.cashCents && entry.cashCents > 0n && rules.currencyReport ? entry.cashCents : 0n;
      const direct = caseFromHeat(entry.heat ?? 0, rules) + caseFromPoints(entry.points ?? 0);
      if (direct === 0 && cash === 0n && entry.ceiling === undefined && entry.floor === undefined) continue;
      if (
        await tx.playerCaseReceipt.findUnique({
          where: { roundPlayerId_sourceKey: { roundPlayerId, sourceKey: entry.sourceKey } },
          select: { id: true },
        })
      ) {
        continue;
      }

      const place = await city(entry);
      if (!place) continue;

      const existing = await tx.playerCase.findUnique({
        where: { roundPlayerId_cityId: { roundPlayerId, cityId: place.id } },
      });
      const clock = existing
        ? { caseHundredths: existing.caseHundredths, caseAt: existing.caseAt, lastEvidenceAt: existing.lastEvidenceAt }
        : { caseHundredths: 0, caseAt: now, lastEvidenceAt: null };
      const pace = cityLaw(rules, place.slug);
      const before = coolCase(clock, now, rules, pace.coolingSpeed);

      if (before < clock.caseHundredths) {
        const sourceKey = `cool:${place.id}:${clock.lastEvidenceAt?.toISOString() ?? 'start'}`;
        const cooled = before - clock.caseHundredths;
        const stageAfter = wantedStage(before, rules);
        await tx.playerCaseReceipt.upsert({
          where: { roundPlayerId_sourceKey: { roundPlayerId, sourceKey } },
          create: {
            roundPlayerId,
            cityId: place.id,
            source: 'COOLING',
            sourceKey,
            heat: 0,
            deltaHundredths: cooled,
            caseAfterHundredths: before,
            stageAfter,
            createdAt: now,
          },
          update: {
            deltaHundredths: { increment: cooled },
            caseAfterHundredths: before,
            stageAfter,
          },
        });
      }

      const day = lawDay(now);
      const dayCents = existing?.reportDay === day ? existing.reportCents : 0n;
      const reports = cash > 0n ? currencyReports(dayCents, cash, rules) : 0;
      let delta = cityCaseDelta(direct + caseFromPoints(reports * (rules.currencyReport?.points ?? 0)), pace);
      if (entry.floor !== undefined) delta = Math.max(delta, entry.floor - before);
      if (delta > 0 && rules.officials && entry.source !== 'STING' && entry.source !== 'FEDERAL') {
        const da = await LawOfficialService.working(tx, roundPlayerId, place.id, 'DA', now);
        const slowed = da ? daSlowed(delta, rules.officials.roles.DA.slowShare) : 0;
        if (da && slowed > 0) {
          delta -= slowed;
          await LawOfficialService.favor(tx, ruleset, da, 'daSlowedPoint', now, slowed / CASE_SCALE);
        }
      }
      if (entry.ceiling !== undefined) delta = Math.min(delta, entry.ceiling - before);

      const after = addCase(before, delta, rules);
      const stage = wantedStage(after, rules);
      const stageUp = stageRank(stage) > stageRank(wantedStage(before, rules));
      const active = delta > 0 && !PASSIVE.has(entry.source);

      await tx.playerCase.upsert({
        where: { roundPlayerId_cityId: { roundPlayerId, cityId: place.id } },
        create: {
          roundPlayerId,
          cityId: place.id,
          caseHundredths: after,
          stage,
          caseAt: now,
          createdAt: now,
          lastEvidenceAt: active ? now : null,
          ...(cash > 0n ? { reportDay: day, reportCents: cash } : {}),
        },
        update: {
          caseHundredths: after,
          stage,
          caseAt: now,
          ...(active ? { lastEvidenceAt: now } : {}),
          ...(cash > 0n ? { reportDay: day, reportCents: dayCents + cash } : {}),
        },
      });

      if (after === before) continue;

      await tx.playerCaseReceipt.create({
        data: {
          roundPlayerId,
          cityId: place.id,
          source: entry.source,
          sourceKey: entry.sourceKey,
          heat: entry.heat ?? 0,
          deltaHundredths: after - before,
          caseAfterHundredths: after,
          stageAfter: stage,
          stageUp,
          createdAt: now,
        },
      });

      if (stageUp) {
        await ActivityService.log(tx, roundPlayerId, 'CASE_STAGE_UP', json({
          citySlug: place.slug,
          cityName: place.name,
          stage,
          previousStage: wantedStage(before, rules),
          case: points(after),
        }));
      }

      if (rules.officials && captainHeadsUp(before, after, rules.officials.roles.CAPTAIN.headsUpPoints, rules)) {
        const captain = await LawOfficialService.working(tx, roundPlayerId, place.id, 'CAPTAIN', now);
        if (captain) {
          await ActivityService.log(tx, roundPlayerId, 'CAPTAIN_TIP', json({
            citySlug: place.slug,
            cityName: place.name,
            case: points(after),
            warrantAt: rules.stages.warrant,
          }));
          await LawOfficialService.favor(tx, ruleset, captain, 'captainTip', now);
        }
      }

      changes.push({ cityId: place.id, before, after, stage, stageUp });
      if (after > before && rules.warrants && stageRank(stage) >= stageRank('WARRANT')) {
        await LawWarrantService.draftIfDue(tx, roundPlayerId, ruleset, place.id, now, after);
      }
    }

    return changes;
  },

  async notePoliceLoss(tx: Db, roundPlayerId: string, ruleset: Ruleset, cents: bigint, now: Date = new Date()): Promise<void> {
    if (!ruleset.law?.warrants || cents <= 0n) return;
    const day = lawDay(now);
    const player = await tx.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: { policeLossDay: true, policeLossCents: true },
    });
    const today = player.policeLossDay === day ? player.policeLossCents : 0n;
    await tx.roundPlayer.update({
      where: { id: roundPlayerId },
      data: { policeLossDay: day, policeLossCents: today + cents },
    });
  },

  async caseIn(db: Db, roundPlayerId: string, ruleset: Ruleset, cityId: string, now: Date = new Date()): Promise<number> {
    const rules = ruleset.law;
    if (!rules) return 0;
    const row = await db.playerCase.findUnique({
      where: { roundPlayerId_cityId: { roundPlayerId, cityId } },
      include: { city: { select: { slug: true } } },
    });
    return row ? coolCase(row, now, rules, cityLaw(rules, row.city.slug).coolingSpeed) : 0;
  },

  async federalPreview(
    db: Db,
    roundPlayerId: string,
    ruleset: Ruleset,
    homeCityId: string,
    now: Date = new Date(),
  ): Promise<{ cityName: string; case: number; oldCityCase: number; arrivals: Record<string, number> } | null> {
    const rules = ruleset.law;
    if (!rules?.federal) return null;

    const leaving = await LawService.caseIn(db, roundPlayerId, ruleset, homeCityId, now);
    const preview = federalTransfer(leaving, 0, rules);
    if (!preview) return null;

    const [home, rows] = await Promise.all([
      db.city.findUniqueOrThrow({ where: { id: homeCityId }, select: { name: true } }),
      db.playerCase.findMany({ where: { roundPlayerId }, include: { city: { select: { slug: true } } } }),
    ]);

    const arrivals: Record<string, number> = {};
    for (const slug of Object.keys(ruleset.cities ?? {})) {
      const row = rows.find((candidate) => candidate.city.slug === slug);
      const there = row ? coolCase(row, now, rules, cityLaw(rules, slug).coolingSpeed) : 0;
      const transfer = federalTransfer(leaving, there, rules);
      arrivals[slug] = transfer ? points(transfer.arriving) : points(there);
    }

    return { cityName: home.name, case: points(leaving), oldCityCase: points(preview.leaving), arrivals };
  },

  async followRelocation(
    tx: Db,
    roundPlayerId: string,
    ruleset: Ruleset,
    move: { id: string; fromCity: string; toCityId: string },
    at: Date,
  ): Promise<void> {
    const rules = ruleset.law;
    if (!rules?.federal) return;

    const from = await tx.city.findUnique({ where: { slug: move.fromCity }, select: { id: true, name: true } });
    if (!from || from.id === move.toCityId) return;

    const leaving = await LawService.caseIn(tx, roundPlayerId, ruleset, from.id, at);
    const arriving = await LawService.caseIn(tx, roundPlayerId, ruleset, move.toCityId, at);
    const transfer = federalTransfer(leaving, arriving, rules);
    if (!transfer) return;

    await LawWarrantService.followRelocation(tx, roundPlayerId, ruleset, from.id, move.toCityId, transfer.arriving, at);
    await LawService.record(tx, roundPlayerId, ruleset, [
      { cityId: from.id, ceiling: transfer.leaving, source: 'FEDERAL', sourceKey: `federal-out:${move.id}` },
      { cityId: move.toCityId, floor: transfer.arriving, source: 'FEDERAL', sourceKey: `federal-in:${move.id}` },
    ], at);

    const to = await tx.city.findUniqueOrThrow({ where: { id: move.toCityId }, select: { name: true } });
    await ActivityService.log(tx, roundPlayerId, 'CASE_FOLLOWED', json({
      fromCityName: from.name,
      toCityName: to.name,
      case: points(transfer.arriving),
      oldCityCase: points(transfer.leaving),
    }));
  },

  recordHeat(tx: Db, roundPlayerId: string, ruleset: Ruleset, gains: readonly CaseHeat[], now: Date = new Date()): Promise<CaseChange[]> {
    return LawService.record(tx, roundPlayerId, ruleset, gains, now);
  },

  async summary(db: Db, roundPlayerId: string, ruleset: Ruleset, now: Date = new Date()): Promise<LawSummaryDto | null> {
    const rules = ruleset.law;
    if (!rules) return null;

    const rows = await db.playerCase.findMany({ where: { roundPlayerId }, include: { city: { select: { slug: true, name: true } } } });
    let worst: { hundredths: number; cityName: string } | null = null;
    for (const row of rows) {
      const hundredths = coolCase(row, now, rules, cityLaw(rules, row.city.slug).coolingSpeed);
      if (hundredths > 0 && (!worst || hundredths > worst.hundredths)) worst = { hundredths, cityName: row.city.name };
    }

    if (!worst) return { stage: 'QUIET', case: 0, cityName: null };
    return { stage: wantedStage(worst.hundredths, rules), case: points(worst.hundredths), cityName: worst.cityName };
  },

  async page(db: Db, roundPlayerId: string, homeCityId: string, ruleset: Ruleset, now: Date = new Date()): Promise<LawPageDto | null> {
    const rules = ruleset.law;
    if (!rules) return null;

    const [rows, receipts] = await Promise.all([
      db.playerCase.findMany({ where: { roundPlayerId }, include: { city: { select: { slug: true, name: true } } } }),
      db.playerCaseReceipt.findMany({
        where: { roundPlayerId },
        include: { city: { select: { slug: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECEIPT_LIMIT,
      }),
    ]);

    const cases = rows
      .map((row) => ({ row, hundredths: coolCase(row, now, rules, cityLaw(rules, row.city.slug).coolingSpeed) }))
      .sort((a, b) => b.hundredths - a.hundredths || b.row.updatedAt.getTime() - a.row.updatedAt.getTime());

    return {
      caseMax: rules.caseMax,
      heatToCase: rules.heatToCase,
      evidence: rules.evidence ? { ...rules.evidence } : null,
      currencyReport: rules.currencyReport ? { ...rules.currencyReport } : null,
      cooling: rules.cooling ? { ...rules.cooling } : null,
      laundering: rules.laundering ? { ...rules.laundering } : null,
      warrants: [],
      lawyer: null,
      dailyLoss: null,
      payroll: null,
      informants: null,
      stages: WANTED_STAGES.map((stage) => ({ stage, startsAt: points(stageStartsAt(stage, rules)) })),
      cases: cases.map(({ row, hundredths }) => {
        const next = nextStage(hundredths, rules);
        const starts = hundredths > 0 ? coolingStartsAt(row, rules) : null;
        const pace = rules.cities ? cityLaw(rules, row.city.slug) : null;
        return {
          citySlug: row.city.slug,
          cityName: row.city.name,
          isHome: row.cityId === homeCityId,
          case: points(hundredths),
          stage: wantedStage(hundredths, rules),
          next: next ? { stage: next.stage, startsAt: points(next.startsAt) } : null,
          cooling:
            starts && rules.cooling
              ? {
                  startsAt: starts.toISOString(),
                  perHour: rules.cooling.decayPerHour * (pace?.coolingSpeed ?? 1),
                }
              : null,
          law: pace
            ? {
                blurb: pace.blurb,
                caseSpeed: pace.caseSpeed,
                coolingSpeed: pace.coolingSpeed,
                warningHoursMultiplier: pace.warningHoursMultiplier,
              }
            : null,
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
      receipts: receipts.map((row) => ({
        id: row.id,
        citySlug: row.city.slug,
        cityName: row.city.name,
        source: row.source as CaseSource,
        heat: Math.round(row.heat * 100) / 100,
        added: points(row.deltaHundredths),
        caseAfter: points(row.caseAfterHundredths),
        stageAfter: row.stageAfter as WantedStage,
        at: row.createdAt.toISOString(),
      })),
    };
  },
};
