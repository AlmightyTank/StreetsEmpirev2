import type { Prisma } from '@prisma/client';
import {
  addCase,
  CASE_SCALE,
  caseFromHeat,
  nextStage,
  stageRank,
  stageStartsAt,
  WANTED_STAGES,
  wantedStage,
  type Ruleset,
} from '@streets/rules-engine';
import type { WantedStage } from '@streets/rulesets';
import type { CaseSourceDto, LawPageDto, LawSummaryDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';

export type CaseSource = CaseSourceDto;

/**
 * Heat drawn in one city, to be turned into Case there. Exactly one of `cityId` or
 * `citySlug` names the city. `sourceKey` names the act, and is what keeps a retried
 * action or a re-run settle from adding evidence twice.
 */
export interface CaseHeat {
  cityId?: string;
  citySlug?: string;
  heat: number;
  source: CaseSource;
  sourceKey: string;
}

export interface CaseChange {
  cityId: string;
  before: number;
  after: number;
  stage: WantedStage;
  stageUp: boolean;
}

/** How many receipts the page shows. */
const RECEIPT_LIMIT = 30;

function points(hundredths: number): number {
  return hundredths / CASE_SCALE;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * 1.3.0-A. The Case: what each city's police have on a player.
 *
 * Heat itself is untouched. Every place that adds Heat also hands the Heat it drew to
 * `recordHeat`, which turns a share of it into Case in the city it was drawn in, with an
 * itemised receipt. A Case only rises in A; nothing reads it but the player's own page.
 * Callers hold the player's lock, as for any other write to the player.
 */
export const LawService = {
  async recordHeat(tx: Db, roundPlayerId: string, ruleset: Ruleset, gains: readonly CaseHeat[], now: Date = new Date()): Promise<CaseChange[]> {
    const rules = ruleset.law;
    if (!rules) return [];
    const changes: CaseChange[] = [];
    const cityIds = new Map<string, { id: string; slug: string; name: string }>();

    async function city(gain: CaseHeat) {
      const key = gain.cityId ?? `slug:${gain.citySlug}`;
      const known = cityIds.get(key);
      if (known) return known;
      const row = gain.cityId
        ? await tx.city.findUnique({ where: { id: gain.cityId }, select: { id: true, slug: true, name: true } })
        : gain.citySlug
          ? await tx.city.findUnique({ where: { slug: gain.citySlug }, select: { id: true, slug: true, name: true } })
          : null;
      if (row) cityIds.set(key, row);
      return row;
    }

    for (const gain of gains) {
      const delta = caseFromHeat(gain.heat, rules);
      if (delta <= 0) continue;
      const where = { roundPlayerId_sourceKey: { roundPlayerId, sourceKey: gain.sourceKey } };
      if (await tx.playerCaseReceipt.findUnique({ where, select: { id: true } })) continue;
      const place = await city(gain);
      if (!place) continue;

      const existing = await tx.playerCase.findUnique({ where: { roundPlayerId_cityId: { roundPlayerId, cityId: place.id } } });
      const before = existing?.caseHundredths ?? 0;
      const after = addCase(before, delta, rules);
      if (after === before) continue;
      const stage = wantedStage(after, rules);
      const previous = (existing?.stage as WantedStage | undefined) ?? 'QUIET';
      const stageUp = stageRank(stage) > stageRank(previous);

      await tx.playerCase.upsert({
        where: { roundPlayerId_cityId: { roundPlayerId, cityId: place.id } },
        create: { roundPlayerId, cityId: place.id, caseHundredths: after, stage, createdAt: now },
        update: { caseHundredths: after, stage },
      });
      await tx.playerCaseReceipt.create({
        data: {
          roundPlayerId, cityId: place.id, source: gain.source, sourceKey: gain.sourceKey,
          heat: gain.heat, deltaHundredths: after - before, caseAfterHundredths: after, stageAfter: stage, createdAt: now,
        },
      });
      if (stageUp) {
        await ActivityService.log(tx, roundPlayerId, 'CASE_STAGE_UP', json({
          citySlug: place.slug, cityName: place.name, stage, previousStage: previous, case: points(after),
        }));
      }
      changes.push({ cityId: place.id, before, after, stage, stageUp });
    }
    return changes;
  },

  /** The worst Case the player has anywhere, for the dashboard. Null on rounds without a law block. */
  async summary(db: Db, roundPlayerId: string, ruleset: Ruleset): Promise<LawSummaryDto | null> {
    const rules = ruleset.law;
    if (!rules) return null;
    const worst = await db.playerCase.findFirst({
      where: { roundPlayerId },
      include: { city: { select: { name: true } } },
      orderBy: [{ caseHundredths: 'desc' }, { updatedAt: 'desc' }],
    });
    if (!worst) return { stage: 'QUIET', case: 0, cityName: null };
    return { stage: wantedStage(worst.caseHundredths, rules), case: points(worst.caseHundredths), cityName: worst.city.name };
  },

  /** The player's own Case in every city, and the latest receipts. Null on rounds without a law block. */
  async page(db: Db, roundPlayerId: string, homeCityId: string, ruleset: Ruleset): Promise<LawPageDto | null> {
    const rules = ruleset.law;
    if (!rules) return null;
    const [cases, receipts] = await Promise.all([
      db.playerCase.findMany({
        where: { roundPlayerId },
        include: { city: { select: { slug: true, name: true } } },
        orderBy: [{ caseHundredths: 'desc' }, { updatedAt: 'desc' }],
      }),
      db.playerCaseReceipt.findMany({
        where: { roundPlayerId },
        include: { city: { select: { slug: true, name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECEIPT_LIMIT,
      }),
    ]);

    return {
      caseMax: rules.caseMax,
      heatToCase: rules.heatToCase,
      stages: WANTED_STAGES.map((stage) => ({ stage, startsAt: points(stageStartsAt(stage, rules)) })),
      cases: cases.map((row) => {
        const next = nextStage(row.caseHundredths, rules);
        return {
          citySlug: row.city.slug,
          cityName: row.city.name,
          isHome: row.cityId === homeCityId,
          case: points(row.caseHundredths),
          stage: wantedStage(row.caseHundredths, rules),
          next: next ? { stage: next.stage, startsAt: points(next.startsAt) } : null,
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
