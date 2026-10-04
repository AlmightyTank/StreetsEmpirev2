import {
  streetPassCredWithBonus,
  streetPassLateJoinBonusPercent,
  type QuestType,
  type Ruleset,
  type StreetPassCredSources,
  type StreetPassRules,
} from '@streets/rulesets';
import type { StreetPassProgress } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { dailyContractWindow } from './daily-contract.service.js';
import { PlayerExperienceService } from './player-experience.service.js';

/**
 * Street Pass step 2: earning Street Cred. Every credit runs inside the
 * transaction of the thing that earned it (a job turn-in, a turn-spending
 * action), which already holds the player's lock, so Cred is earned exactly
 * once and only if that action commits.
 */

type QuestCredSource = Exclude<keyof StreetPassCredSources, 'perTurnSpent' | 'dailyTurnCap'>;

/** Which Cred rate a finished job or contract pays. */
export function credSourceForQuest(type: QuestType): QuestCredSource {
  switch (type) {
    case 'DAILY':
      return 'dailyContract';
    case 'WEEKLY':
      return 'weeklyContract';
    case 'CITY_CONTRACT':
    case 'EVENT':
    case 'ALLIANCE':
      return 'eventContract';
    default:
      // STORY, SIDE, SECRET and one-off CONTRACT jobs.
      return 'oneTimeJob';
  }
}

/**
 * The player's progress row, created on first use with the late-join bonus
 * fixed from when they joined relative to the round's start.
 */
async function progressFor(tx: Db, roundPlayerId: string, rules: StreetPassRules): Promise<StreetPassProgress> {
  const existing = await tx.streetPassProgress.findUnique({ where: { roundPlayerId } });
  if (existing) return existing;
  const player = await tx.roundPlayer.findUniqueOrThrow({
    where: { id: roundPlayerId },
    select: { createdAt: true, round: { select: { startsAt: true } } },
  });
  return tx.streetPassProgress.create({
    data: {
      roundPlayerId,
      passKey: rules.key,
      lateJoinBonusPercent: streetPassLateJoinBonusPercent(rules, player.round.startsAt, player.createdAt),
    },
  });
}

export const StreetPassCredService = {
  /** Cred and permanent XP for a finished job or contract. */
  async creditQuest(tx: Db, roundPlayerId: string, ruleset: Ruleset, questType: QuestType, sourceKey: string, now = new Date()): Promise<number> {
    const questXp = questType === 'DAILY' ? 75
      : questType === 'WEEKLY' ? 200
        : questType === 'CITY_CONTRACT' || questType === 'EVENT' || questType === 'ALLIANCE' ? 150
          : 100;
    await PlayerExperienceService.award(tx, {
      roundPlayerId,
      sourceKey,
      source: `QUEST_${questType}`,
      amount: questXp,
      awardedAt: now,
    });

    const rules = ruleset.streetPass;
    if (!rules) return 0;
    const base = rules.sources[credSourceForQuest(questType)];
    if (base <= 0) return 0;
    const progress = await progressFor(tx, roundPlayerId, rules);
    const earned = streetPassCredWithBonus(base, progress.lateJoinBonusPercent);
    await tx.streetPassProgress.update({ where: { id: progress.id }, data: { cred: { increment: earned } } });
    return earned;
  },

  /**
   * XP for turns spent on an action plus Street Cred, capped per daily window (the same
   * reset as daily contracts). The cap counts base Cred; the late-join bonus
   * is added on top. Returns the Cred added.
   */
  async creditTurns(tx: Db, roundPlayerId: string, ruleset: Ruleset, turnsSpent: number, now: Date, sourceKey: string): Promise<number> {
    if (turnsSpent > 0) {
      await PlayerExperienceService.award(tx, {
        roundPlayerId,
        sourceKey,
        source: 'TURN_SPEND',
        amount: turnsSpent,
        awardedAt: now,
      });
    }
    const rules = ruleset.streetPass;
    if (!rules || turnsSpent <= 0 || rules.sources.perTurnSpent <= 0) return 0;
    const progress = await progressFor(tx, roundPlayerId, rules);
    const window = dailyContractWindow(now, ruleset);
    const sameWindow = progress.turnCredWindowStartsAt?.getTime() === window.startsAt.getTime();
    const countedToday = sameWindow ? progress.turnCredInWindow : 0;
    const base = Math.max(0, Math.min(turnsSpent * rules.sources.perTurnSpent, rules.sources.dailyTurnCap - countedToday));
    if (base === 0 && sameWindow) return 0;
    const earned = streetPassCredWithBonus(base, progress.lateJoinBonusPercent);
    await tx.streetPassProgress.update({
      where: { id: progress.id },
      data: {
        cred: { increment: earned },
        turnCredWindowStartsAt: window.startsAt,
        turnCredInWindow: countedToday + base,
      },
    });
    return earned;
  },
};
