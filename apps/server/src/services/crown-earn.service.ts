import type { PrismaClient } from '@prisma/client';
import { CROWN_EARN_RULES, dropDailyWindow, dropWeeklyWindow, type QuestType } from '@streets/rulesets';
import { EXPERIENCE_LEVEL_CROWNS, experienceCrownMilestones, experienceLevelFor, type DropEarnOpportunityDto } from '@streets/shared';
import { env } from '../config/env.js';
import type { Db } from '../utils/db.js';
import { CrownWalletService } from './crown-wallet.service.js';
import { DropSettingsService } from './drop-settings.service.js';
import type { sharedEntitlementRuntime } from './shared-entitlement-runtime.js';

type SharedRuntime = NonNullable<Awaited<ReturnType<typeof sharedEntitlementRuntime>>>;

/**
 * The Drop, Slice D: Crowns earned from play. Every award runs inside the
 * transaction of the thing that earned it (a contract turn-in, a check-in), so
 * it lands exactly once and only if that commits. Each award has a unique key
 * per account and window, and the round cap is enforced on the ledger.
 * Earned Crowns stay when the round ends; the cap resets with the next one.
 * Nothing that can be bought with Crowns ever pays Crowns.
 */

type EarnSource = 'daily-contract' | 'weekly-contract' | 'milestone' | 'event';

interface EarnInput {
  accountId: string;
  roundId: string;
  source: EarnSource;
  /** Unique per account and window, e.g. daily:<account>:<day>. */
  ref: string;
  crowns: number;
}

async function eventEarned(tx: Db, accountId: string, roundId: string): Promise<number> {
  const sum = await tx.crownLedgerEntry.aggregate({
    where: { accountId, roundId, kind: 'EARN', source: 'event' },
    _sum: { delta: true },
  });
  return sum._sum.delta ?? 0;
}

export const CrownEarnService = {
  /** Award up to `crowns`, clipped to what the round cap leaves. Returns what landed. */
  async award(tx: Db, input: EarnInput): Promise<number> {
    if (!env.drop.enabled || input.crowns <= 0) return 0;
    const settings = await DropSettingsService.get(tx);
    if (!settings.earningEnabled) return 0;
    const externalRef = `earn:${input.ref}`;
    if (await tx.crownLedgerEntry.findUnique({ where: { externalRef }, select: { id: true } })) return 0;
    const earned = await CrownWalletService.earnedInRound(tx, input.accountId, input.roundId);
    let crowns = Math.min(input.crowns, settings.roundEarnCap - earned);
    if (input.source === 'event') crowns = Math.min(crowns, CROWN_EARN_RULES.eventCap - await eventEarned(tx, input.accountId, input.roundId));
    if (crowns <= 0) return 0;
    const result = await CrownWalletService.apply(tx, {
      accountId: input.accountId,
      kind: 'EARN',
      delta: crowns,
      source: input.source,
      externalRef,
      roundId: input.roundId,
    });
    return result.applied ? crowns : 0;
  },

  /** A claimed daily, weekly or event contract. Called from the quest claim transaction. */
  async onQuestClaimed(tx: Db, roundPlayerId: string, questType: QuestType, sourceKey: string, now: Date): Promise<number> {
    if (!env.drop.enabled) return 0;
    const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { accountId: true, roundId: true } });
    if (!player) return 0;
    const { accountId, roundId } = player;
    switch (questType) {
      case 'DAILY':
        return CrownEarnService.award(tx, {
          accountId, roundId, source: 'daily-contract',
          ref: `daily:${accountId}:${dropDailyWindow(now).key}`, crowns: CROWN_EARN_RULES.dailyContract,
        });
      case 'WEEKLY':
        return CrownEarnService.award(tx, {
          accountId, roundId, source: 'weekly-contract',
          ref: `weekly:${accountId}:${dropWeeklyWindow(now).key}`, crowns: CROWN_EARN_RULES.weeklyContract,
        });
      case 'EVENT':
        return CrownEarnService.award(tx, {
          accountId, roundId, source: 'event',
          ref: `event:${accountId}:${roundId}:${sourceKey}`, crowns: CROWN_EARN_RULES.eventContract,
        });
      default:
        return 0;
    }
  },

  /** A login check-in landed: pay any check-in milestone the round has now reached. */
  async onCheckIn(tx: Db, roundPlayerId: string, now: Date): Promise<number> {
    if (!env.drop.enabled) return 0;
    const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { accountId: true, roundId: true } });
    if (!player) return 0;
    const days = await tx.roundLoginCheckIn.count({ where: { roundPlayerId, source: 'LOGIN' } });
    let total = 0;
    for (const milestone of CROWN_EARN_RULES.checkInMilestones) {
      if (days < milestone) continue;
      total += await CrownEarnService.award(tx, {
        accountId: player.accountId,
        roundId: player.roundId,
        source: 'milestone',
        ref: `milestone:${player.accountId}:${player.roundId}:${milestone}`,
        crowns: CROWN_EARN_RULES.milestone,
      });
    }
    void now;
    return total;
  },

  /**
   * Account level milestones. Each pays once per account, outside the round cap
   * (no roundId), from the XP award transaction. Every milestone up to `level`
   * is offered, so one missed while earning was off lands on the next level-up.
   */
  async onLevelReached(tx: Db, accountId: string, level: number): Promise<number> {
    if (!env.drop.enabled) return 0;
    const milestones = experienceCrownMilestones(0, level);
    if (!milestones.length) return 0;
    const settings = await DropSettingsService.get(tx);
    if (!settings.earningEnabled) return 0;
    let total = 0;
    for (const { level: milestone, crowns } of milestones) {
      const result = await CrownWalletService.apply(tx, {
        accountId,
        kind: 'EARN',
        delta: crowns,
        source: 'account-level',
        externalRef: `earn:account-level:${accountId}:${milestone}`,
        reason: `Reached account level ${milestone}`,
      });
      if (result.applied) total += crowns;
    }
    return total;
  },

  /** The wallet page's "how to earn more" list for this round. */
  async opportunities(prisma: PrismaClient, accountId: string, roundId: string | null, roundPlayerId: string | null, now = new Date(), shared?: SharedRuntime | null): Promise<DropEarnOpportunityDto[]> {
    if (!roundId) return [];
    const refs = [
      `earn:daily:${accountId}:${dropDailyWindow(now).key}`,
      `earn:weekly:${accountId}:${dropWeeklyWindow(now).key}`,
      ...CROWN_EARN_RULES.checkInMilestones.map((milestone) => `earn:milestone:${accountId}:${roundId}:${milestone}`),
    ];
    const [done, events, checkIns, account] = await Promise.all([
      shared
        ? shared.db.sharedCrownLedgerEntry.findMany({ where: { accountId: shared.accountId, environment: shared.environment, localAccountId: accountId, externalRef: { in: refs.map((ref) => `${shared.environment}:${ref}`) } }, select: { externalRef: true } })
        : prisma.crownLedgerEntry.findMany({ where: { externalRef: { in: refs } }, select: { externalRef: true } }),
      shared
        ? shared.db.sharedCrownLedgerEntry.aggregate({ where: { accountId: shared.accountId, environment: shared.environment, localAccountId: accountId, roundId, kind: 'EARN', source: 'event' }, _sum: { delta: true } })
        : prisma.crownLedgerEntry.aggregate({ where: { accountId, roundId, kind: 'EARN', source: 'event' }, _sum: { delta: true } }),
      roundPlayerId ? prisma.roundLoginCheckIn.count({ where: { roundPlayerId, source: 'LOGIN' } }) : Promise.resolve(0),
      prisma.account.findUnique({ where: { id: accountId }, select: { experiencePoints: true } }),
    ]);
    const level = experienceLevelFor(account?.experiencePoints ?? 0);
    const nextLevel = experienceCrownMilestones(level, level + EXPERIENCE_LEVEL_CROWNS.every)[0]!;
    const got = new Set(done.map((row) => shared ? row.externalRef.slice(shared.environment.length + 1) : row.externalRef));
    const eventCrowns = events._sum.delta ?? 0;
    return [
      { key: 'daily', label: 'Daily Crown contract', crowns: CROWN_EARN_RULES.dailyContract, done: got.has(refs[0]!), detail: 'Turn in any daily contract. Once per UTC day.' },
      { key: 'weekly', label: 'Weekly Crown contract', crowns: CROWN_EARN_RULES.weeklyContract, done: got.has(refs[1]!), detail: 'Turn in any weekly contract. Once per week, resets Monday UTC.' },
      ...CROWN_EARN_RULES.checkInMilestones.map((milestone, index) => ({
        key: `milestone-${milestone}`,
        label: `Round milestone: ${milestone} check-in days`,
        crowns: CROWN_EARN_RULES.milestone,
        done: got.has(refs[2 + index]!),
        detail: `Check in on ${milestone} different days this round (${Math.min(checkIns, milestone)}/${milestone}).`,
      })),
      {
        key: 'event', label: 'Event contracts', crowns: CROWN_EARN_RULES.eventContract, done: eventCrowns >= CROWN_EARN_RULES.eventCap,
        detail: `${CROWN_EARN_RULES.eventContract} per event contract, up to ${CROWN_EARN_RULES.eventCap} a round (${eventCrowns}/${CROWN_EARN_RULES.eventCap}).`,
      },
      {
        key: 'account-level', label: `Account level ${nextLevel.level}`, crowns: nextLevel.crowns, done: false,
        detail: `Reach account level ${nextLevel.level} (you are level ${level}). Pays once, on top of the round cap.`,
      },
    ];
  },
};
