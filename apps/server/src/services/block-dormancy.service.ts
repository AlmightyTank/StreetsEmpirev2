import {
  addFatigue,
  blockTier,
  blockWarsOn,
  dormantLevel,
  dormantTier,
  localsThugsWithBusinesses,
  tierHoldHours,
  type Ruleset,
} from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { accountsShareNetwork } from './admin-signals.service.js';
import { blockFatigueNow } from './block-war-settle.service.js';
import { localsReclaimAt } from './turf.service.js';

const HOUR_MS = 3_600_000;

/**
 * 1.1.0-D. A built block the locals take over goes dormant: after a grace period every
 * business loses a level every couple of days, the block drops a tier (a Foothold after a
 * few days), and the locals hold it harder for what is built there. Everything is worked
 * out from the block's hold history (who held it last, for how long, and when they left),
 * which every way of losing a block already records, so nothing has to be written when the
 * locals walk in. It is applied when someone claims the block.
 */
export interface Dormancy {
  /** When the locals took the block over: the old holder left, plus the vacant window. */
  since: Date;
  lastHolderId: string;
  /** How long the last holder held it, for the tier it had. */
  heldHours: number;
}

type DormancyDb = Pick<Db, 'turfHoldSegment'>;

export async function dormancyFor(db: DormancyDb, ruleset: Ruleset, turf: { id: string; holderId: string | null }): Promise<Dormancy | null> {
  if (!blockWarsOn(ruleset) || turf.holderId) return null;
  const segment = await db.turfHoldSegment.findFirst({ where: { turfId: turf.id, endedAt: { not: null } }, orderBy: { endedAt: 'desc' } });
  if (!segment?.endedAt) return null;
  return {
    since: localsReclaimAt(ruleset, segment.endedAt),
    lastHolderId: segment.holderId,
    heldHours: Math.max(0, (segment.endedAt.getTime() - segment.startedAt.getTime()) / HOUR_MS),
  };
}

/** Hours the locals have held it (0 while it is still vacant). */
export function dormantHours(dormancy: Dormancy, now: Date): number {
  return Math.max(0, (now.getTime() - dormancy.since.getTime()) / HOUR_MS);
}

/** A dormant business's level right now. */
export function dormantLevelNow(ruleset: Ruleset, level: number, dormancy: Dormancy | null, now: Date): number {
  return dormancy ? dormantLevel(ruleset, level, dormantHours(dormancy, now)) : level;
}

/** When the next level falls off a dormant block, or null if nothing is left to lose. */
export function nextLevelLossAt(ruleset: Ruleset, dormancy: Dormancy, levels: readonly number[], now: Date): Date | null {
  const locals = ruleset.business?.locals;
  if (!locals || !levels.some((level) => dormantLevelNow(ruleset, level, dormancy, now) > 0)) return null;
  const hours = dormantHours(dormancy, now);
  const decaying = Math.max(0, hours - locals.graceHours);
  const next = locals.graceHours + (Math.floor(decaying / locals.levelLossEveryHours) + 1) * locals.levelLossEveryHours;
  return new Date(dormancy.since.getTime() + next * HOUR_MS);
}

/** What the locals hold a block with, counting the levels built there. */
export function localsMaxWithBusinesses(ruleset: Ruleset, citySlug: string, district: DistrictKey, levels: readonly number[]): number {
  return localsThugsWithBusinesses(ruleset, { citySlug, district }, levels.reduce((sum, level) => sum + level, 0));
}

/**
 * A crew wins a dormant block off the locals: the businesses come back at their decayed
 * levels (nothing at all for an account linked to the last holder inside the grace period),
 * the block keeps the tier dormancy left it, and the claim fight adds its fatigue.
 */
export async function applyLocalsClaim(
  tx: Db,
  ruleset: Ruleset,
  turf: { id: string; holderId: string | null; fatigue: number; fatigueAt: Date; capturedAts: Date[] },
  claimer: { accountId: string },
  now: Date,
): Promise<{ heldSince: Date; fatigue: number; levelsReset: boolean } | null> {
  if (!blockWarsOn(ruleset) || !ruleset.business) return null;
  const dormancy = await dormancyFor(tx, ruleset, turf);
  const rows = await tx.business.findMany({ where: { turfId: turf.id }, orderBy: { lot: 'asc' } });
  let heldSince = now;
  let levelsReset = false;
  if (dormancy) {
    const hours = dormantHours(dormancy, now);
    const last = await tx.roundPlayer.findUnique({ where: { id: dormancy.lastHolderId }, select: { accountId: true } });
    levelsReset = Boolean(last && hours < ruleset.business.locals.graceHours
      && (last.accountId === claimer.accountId || await accountsShareNetwork(tx, last.accountId, claimer.accountId, now)));
    for (const row of rows) {
      const level = levelsReset ? 0 : dormantLevel(ruleset, row.level, hours);
      if (level !== row.level) await tx.business.update({ where: { id: row.id }, data: { level, ...(level === 0 ? { racket: null, racketSince: null } : {}) } });
    }
    const tierBefore = blockTier(ruleset, { heldHours: dormancy.heldHours, levels: rows.map((row) => row.level) });
    const tier = dormantTier(ruleset, tierBefore, hours);
    heldSince = new Date(now.getTime() - tierHoldHours(ruleset, tier) * HOUR_MS);
  }
  const fatigue = addFatigue(ruleset, blockFatigueNow(ruleset, turf, null, now).percent, ruleset.business.fatigue.onLocalsClaim);
  await tx.turf.update({ where: { id: turf.id }, data: { fatigue, fatigueAt: now, capturedAts: [...turf.capturedAts, now] } });
  return { heldSince, fatigue, levelsReset };
}
