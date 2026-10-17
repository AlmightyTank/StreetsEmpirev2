import type { Ruleset } from '@streets/rules-engine';
import type { CrewLoyaltyHistoryDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { CrewBondService } from './crew-bonds.service.js';

/** 2.1.0-B. Cosmetic/narrative reputation, never part of combat, wages or happiness. */
export const CREW_LOYALTY_CAP = 100;
export const CREW_LOYALTY_DAILY_CAP = 8;
export const CREW_LOYALTY_WEEKLY_CAP = 32;

export type CrewLoyaltySource = 'JOB_COMPLETED' | 'DEFENSE_HELD' | 'TRAVEL_COMPLETED' | 'DEALER_SHIFT';
const POINTS: Record<CrewLoyaltySource, number> = {
  JOB_COMPLETED: 2,
  DEFENSE_HELD: 4,
  TRAVEL_COMPLETED: 3,
  DEALER_SHIFT: 2,
};

/** Explicit ruleset opt-in keeps all already pinned rounds unchanged. */
export function crewLoyaltyEnabled(ruleset: Ruleset): boolean {
  return ruleset.crewRoster?.enabled === true && ruleset.crewRoster.loyalty?.enabled === true;
}

export function crewLoyaltyTier(points: number): { tier: string; nextMilestone: number | null } {
  if (points >= 100) return { tier: 'Legend', nextMilestone: null };
  if (points >= 75) return { tier: 'Veteran', nextMilestone: 100 };
  if (points >= 50) return { tier: 'Trusted', nextMilestone: 75 };
  if (points >= 25) return { tier: 'Proven', nextMilestone: 50 };
  return { tier: 'New Face', nextMilestone: 25 };
}

export function crewLoyaltyWindow(at: Date): { dayStart: Date; nextDay: Date; weekStart: Date; nextWeek: Date } {
  const dayStart = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const weekStart = new Date(dayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
  return {
    dayStart,
    nextDay: new Date(dayStart.getTime() + 86_400_000),
    weekStart,
    nextWeek: new Date(weekStart.getTime() + 7 * 86_400_000),
  };
}

export const CrewLoyaltyService = {
  /**
   * Called ONLY by verified server settlement handlers, in the same transaction.
   * A sourceKey identifies the actual settled action (not a UI request, time tick, or
   * assignment); one member earns at most once per source, even across retries.
   * The member row lock serializes daily/weekly/total cap checks across workers.
   */
  async award(tx: Db, input: {
    ruleset: Ruleset; roundPlayerId: string; memberId: string;
    source: CrewLoyaltySource; sourceKey: string; summary: string; at: Date;
  }): Promise<number> {
    if (!crewLoyaltyEnabled(input.ruleset)) return 0;
    if (!input.sourceKey || input.sourceKey.length > 160 || !Number.isFinite(input.at.getTime())) {
      throw new Error('Invalid crew loyalty source receipt');
    }
    const [member] = await tx.$queryRaw<Array<{ id: string; status: string; loyaltyPoints: number }>>`
      SELECT "id", "status", "loyaltyPoints" FROM "CrewMember"
      WHERE "id" = ${input.memberId} AND "roundPlayerId" = ${input.roundPlayerId}
      FOR UPDATE
    `;
    if (!member || member.status === 'RELEASED') return 0;
    const key = { memberId: member.id, sourceKey: input.sourceKey };
    const existing = await tx.crewLoyaltyEntry.findUnique({ where: { memberId_sourceKey: key }, select: { id: true } });
    if (existing) return 0;

    const { dayStart, nextDay, weekStart, nextWeek } = crewLoyaltyWindow(input.at);
    const [daily, weekly] = await Promise.all([
      tx.crewLoyaltyEntry.aggregate({
        where: { memberId: member.id, at: { gte: dayStart, lt: nextDay } }, _sum: { points: true },
      }),
      tx.crewLoyaltyEntry.aggregate({
        where: { memberId: member.id, at: { gte: weekStart, lt: nextWeek } }, _sum: { points: true },
      }),
    ]);
    const points = Math.max(0, Math.min(
      POINTS[input.source],
      CREW_LOYALTY_CAP - member.loyaltyPoints,
      CREW_LOYALTY_DAILY_CAP - (daily._sum.points ?? 0),
      CREW_LOYALTY_WEEKLY_CAP - (weekly._sum.points ?? 0),
    ));
    // Zero point entries consume the receipt too: retrying a capped settlement after
    // the cap window rolls over can never retroactively mint loyalty.
    await tx.crewLoyaltyEntry.create({
      data: {
        memberId: member.id, roundPlayerId: input.roundPlayerId,
        source: input.source, sourceKey: input.sourceKey,
        points,
        summary: points > 0 ? `${input.summary} · +${points} loyalty.` : `${input.summary} · loyalty cap reached.`,
        at: input.at,
      },
    });
    if (points > 0) {
      await tx.crewMember.update({ where: { id: member.id }, data: { loyaltyPoints: { increment: points } } });
      await CrewBondService.afterLoyaltyReceipt(tx, {
        roundPlayerId: input.roundPlayerId, memberId: member.id,
        sourceKey: input.sourceKey, source: input.source, at: input.at,
      });
    }
    return points;
  },

  history(rows: ReadonlyArray<{ source: string; points: number; summary: string; at: Date }>): CrewLoyaltyHistoryDto[] {
    return rows.map((row) => ({
      source: row.source as CrewLoyaltyHistoryDto['source'],
      points: row.points,
      label: row.summary,
      at: row.at.toISOString(),
    }));
  },
};
