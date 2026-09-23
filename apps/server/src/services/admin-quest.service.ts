import type { Prisma, PrismaClient } from '@prisma/client';
import type { QuestObjectiveDefinition, Ruleset } from '@streets/rulesets';
import type { AdminPlayerDto, AdminQuestContentDto } from '@streets/shared';
import { loadRulesetForRound } from '@streets/rules-engine';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { AdminPlayerService } from './admin-player.service.js';
import { cityContractObjectives, isDynamicCityContractDefinition } from './city-contract.service.js';
import {
  DAILY_CONTRACT_SLOTS,
  dailyContractWindow,
  selectedDailyContractKeys,
} from './daily-contract.service.js';
import { FavorContentService } from './favor-content.service.js';
import { syncDefinitions } from './handcrafted-quest.service.js';
import {
  WEEKLY_CONTRACT_SLOTS,
  selectedWeeklyContractKeys,
  weeklyContractWindow,
} from './weekly-contract.service.js';

const OPEN_QUEST_STATUSES = ['LOCKED', 'AVAILABLE', 'ACTIVE', 'READY_TO_TURN_IN'] as const;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function objectiveDefinitions(value: Prisma.JsonValue): QuestObjectiveDefinition[] {
  return Array.isArray(value) ? value as unknown as QuestObjectiveDefinition[] : [];
}

async function roundContext(prisma: PrismaClient, roundId: string) {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    select: { id: true, name: true, status: true, rulesetId: true, rulesetVersion: true },
  });
  if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
  return { round, ruleset: loadRulesetForRound(round) };
}

async function lockedPlayerContext(db: Db, actor: AuditActor, roundPlayerId: string) {
  await lockRoundPlayer(db, roundPlayerId);
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: {
      id: true,
      accountId: true,
      displayName: true,
      round: { select: { id: true, name: true, status: true, rulesetId: true, rulesetVersion: true } },
    },
  });
  if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
  if (player.accountId === actor.id) {
    throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin has to make support changes to your own player.');
  }
  if (player.round.status !== 'ACTIVE' && player.round.status !== 'REGISTRATION') {
    throw AppError.conflict('ROUND_FINISHED', 'That round has finished, so its quest state is frozen.');
  }
  return { player, ruleset: loadRulesetForRound(player.round) };
}

async function definitionFor(
  db: Db | PrismaClient,
  ruleset: Ruleset,
  key: string,
  enabledOnly = false,
) {
  const definition = ruleset.questDefinitions?.[key];
  if (!definition) throw AppError.notFound('QUEST_DEFINITION_NOT_FOUND', 'That quest is not part of this ruleset.');
  const row = await db.questDefinition.findUnique({
    where: {
      rulesetId_rulesetVersion_key: {
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        key,
      },
    },
  });
  if (!row) throw AppError.notFound('QUEST_DEFINITION_NOT_FOUND', 'That quest definition has not been published yet.');
  if (enabledOnly && !row.isEnabled) {
    throw AppError.conflict('QUEST_DISABLED', 'That quest is currently disabled.');
  }
  return { definition, row };
}

function generatedOfferState(definition: NonNullable<Ruleset['questDefinitions']>[string], ruleset: Ruleset, now: Date) {
  if (definition.type === 'DAILY' && definition.repeatability === 'DAILY') {
    const window = dailyContractWindow(now, ruleset);
    return {
      expiresAt: window.endsAt,
      rewardState: json({
        dailyWindowStart: window.startsAt.toISOString(),
        dailyWindowEnd: window.endsAt.toISOString(),
      }),
    };
  }
  if (definition.type === 'WEEKLY' && definition.repeatability === 'WEEKLY') {
    const window = weeklyContractWindow(now, ruleset);
    return {
      expiresAt: window.endsAt,
      rewardState: json({
        weeklyWindowStart: window.startsAt.toISOString(),
        weeklyWindowEnd: window.endsAt.toISOString(),
      }),
    };
  }
  return { expiresAt: null, rewardState: json({}) };
}

function grantSupported(definition: NonNullable<Ruleset['questDefinitions']>[string]): boolean {
  return definition.type !== 'ALLIANCE'
    && definition.type !== 'EVENT'
    && !isDynamicCityContractDefinition(definition);
}

export const AdminQuestService = {
  async content(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminQuestContentDto> {
    const { round, ruleset } = await roundContext(prisma, roundId);
    await syncDefinitions(prisma, ruleset);

    const rows = await prisma.questDefinition.findMany({
      where: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version },
      orderBy: [{ type: 'asc' }, { category: 'asc' }, { key: 'asc' }],
    });
    const ids = rows.map((row) => row.id);
    const attemptRows = ids.length
      ? await prisma.playerQuest.groupBy({
          by: ['questDefinitionId', 'status'],
          where: { questDefinitionId: { in: ids }, roundPlayer: { roundId } },
          _count: { _all: true },
        })
      : [];
    const counts = new Map<string, { attempts: number; open: number }>();
    for (const attempt of attemptRows) {
      const current = counts.get(attempt.questDefinitionId) ?? { attempts: 0, open: 0 };
      current.attempts += attempt._count._all;
      if (OPEN_QUEST_STATUSES.includes(attempt.status as typeof OPEN_QUEST_STATUSES[number])) {
        current.open += attempt._count._all;
      }
      counts.set(attempt.questDefinitionId, current);
    }

    const enabledKeys = new Set(rows.filter((row) => row.isEnabled).map((row) => row.key));
    const dailyWindow = dailyContractWindow(now, ruleset);
    const weeklyWindow = weeklyContractWindow(now, ruleset);
    const disabledFavors = await FavorContentService.disabledKeys(prisma, ruleset);

    return {
      now: now.toISOString(),
      round: {
        id: round.id,
        name: round.name,
        status: round.status,
        rulesetVersion: round.rulesetVersion,
      },
      rotations: {
        daily: {
          keys: selectedDailyContractKeys(ruleset, now, enabledKeys),
          resetAt: dailyWindow.endsAt.toISOString(),
          slots: DAILY_CONTRACT_SLOTS,
        },
        weekly: {
          keys: selectedWeeklyContractKeys(ruleset, now, enabledKeys),
          resetAt: weeklyWindow.endsAt.toISOString(),
          slots: WEEKLY_CONTRACT_SLOTS,
        },
      },
      quests: rows.map((row) => {
        const count = counts.get(row.id) ?? { attempts: 0, open: 0 };
        return {
          key: row.key,
          title: row.title,
          description: row.description,
          type: row.type,
          category: row.category,
          difficulty: row.difficulty,
          repeatability: row.repeatability,
          isEnabled: row.isEnabled,
          attempts: count.attempts,
          openAttempts: count.open,
        };
      }),
      favors: Object.values(ruleset.favors ?? {})
        .sort((left, right) => left.contactKey.localeCompare(right.contactKey) || left.key.localeCompare(right.key))
        .map((favor) => ({
          key: favor.key,
          name: favor.name,
          description: favor.description,
          contactKey: favor.contactKey,
          activationKind: favor.activation.kind,
          category: favor.activation.category,
          durationMinutes: favor.activation.kind === 'TIMED' ? favor.activation.durationMinutes : null,
          effectKind: favor.effect?.kind ?? null,
          isEnabled: !disabledFavors.has(favor.key),
        })),
    };
  },

  async setQuestEnabled(
    prisma: PrismaClient,
    actor: AuditActor,
    roundId: string,
    key: string,
    enabled: boolean,
    reason: string,
  ): Promise<AdminQuestContentDto> {
    const { ruleset } = await roundContext(prisma, roundId);
    await syncDefinitions(prisma, ruleset);

    await prisma.$transaction(async (tx) => {
      const { row } = await definitionFor(tx, ruleset, key);
      if (row.isEnabled === enabled) return;
      await tx.questDefinition.update({ where: { id: row.id }, data: { isEnabled: enabled } });
      await AdminAuditService.record(tx, actor, {
        action: enabled ? 'quest.enable' : 'quest.disable',
        targetType: 'quest-definition',
        targetId: row.id,
        reason,
        before: { roundId, key, isEnabled: row.isEnabled, rulesetVersion: ruleset.meta.version },
        after: { roundId, key, isEnabled: enabled, rulesetVersion: ruleset.meta.version },
      });
    });

    return this.content(prisma, roundId);
  },

  async setFavorEnabled(
    prisma: PrismaClient,
    actor: AuditActor,
    roundId: string,
    key: string,
    enabled: boolean,
    reason: string,
  ): Promise<AdminQuestContentDto> {
    const { ruleset } = await roundContext(prisma, roundId);
    const definition = ruleset.favors?.[key];
    if (!definition) throw AppError.notFound('FAVOR_NOT_FOUND', 'That favor is not part of this ruleset.');

    await prisma.$transaction(async (tx) => {
      const existing = await tx.favorContentSetting.findUnique({
        where: {
          rulesetId_rulesetVersion_key: {
            rulesetId: ruleset.meta.id,
            rulesetVersion: ruleset.meta.version,
            key,
          },
        },
      });
      const beforeEnabled = existing?.isEnabled ?? true;
      if (beforeEnabled === enabled) return;
      const row = await tx.favorContentSetting.upsert({
        where: {
          rulesetId_rulesetVersion_key: {
            rulesetId: ruleset.meta.id,
            rulesetVersion: ruleset.meta.version,
            key,
          },
        },
        create: {
          rulesetId: ruleset.meta.id,
          rulesetVersion: ruleset.meta.version,
          key,
          isEnabled: enabled,
        },
        update: { isEnabled: enabled },
      });
      await AdminAuditService.record(tx, actor, {
        action: enabled ? 'favor.enable' : 'favor.disable',
        targetType: 'favor-definition',
        targetId: row.id,
        reason,
        before: { roundId, key, name: definition.name, isEnabled: beforeEnabled, rulesetVersion: ruleset.meta.version },
        after: { roundId, key, name: definition.name, isEnabled: enabled, rulesetVersion: ruleset.meta.version },
      });
    });

    return this.content(prisma, roundId);
  },

  async grantQuest(
    prisma: PrismaClient,
    actor: AuditActor,
    roundPlayerId: string,
    key: string,
    reason: string,
    now = new Date(),
  ): Promise<AdminPlayerDto> {
    const player = await prisma.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: { round: { select: { rulesetId: true, rulesetVersion: true } } },
    });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
    const ruleset = loadRulesetForRound(player.round);
    await syncDefinitions(prisma, ruleset);

    await prisma.$transaction(async (tx) => {
      const context = await lockedPlayerContext(tx, actor, roundPlayerId);
      const { definition, row: definitionRow } = await definitionFor(tx, context.ruleset, key, true);
      if (!grantSupported(definition)) {
        throw AppError.conflict(
          'QUEST_SUPPORT_GRANT_UNSUPPORTED',
          'Alliance, community-event and generated city contracts must be materialized by their normal board so shared state stays authoritative.',
        );
      }

      const latest = await tx.playerQuest.findFirst({
        where: { roundPlayerId, questDefinitionId: definitionRow.id },
        orderBy: { attempt: 'desc' },
      });
      if (latest?.status === 'COMPLETED') {
        throw AppError.conflict('QUEST_ALREADY_COMPLETED', 'That quest was already completed. Re-granting it could duplicate its rewards.');
      }
      if (latest && ['AVAILABLE', 'ACTIVE', 'READY_TO_TURN_IN'].includes(latest.status)) {
        throw AppError.conflict('QUEST_ALREADY_GRANTED', 'That quest is already available or active for this player.');
      }

      const state = generatedOfferState(definition, context.ruleset, now);
      const nextAttempt = (latest?.attempt ?? 0) + (latest?.status === 'LOCKED' ? 0 : 1);
      const quest = latest?.status === 'LOCKED'
        ? await tx.playerQuest.update({
            where: { id: latest.id },
            data: {
              status: 'AVAILABLE',
              isTracked: false,
              objectiveProgress: json({}),
              bonusProgress: json({}),
              chosenBranch: null,
              rewardState: state.rewardState,
              acceptedAt: null,
              completedAt: null,
              claimedAt: null,
              failedAt: null,
              expiresAt: state.expiresAt,
            },
          })
        : await tx.playerQuest.create({
            data: {
              roundPlayerId,
              questDefinitionId: definitionRow.id,
              attempt: nextAttempt,
              status: 'AVAILABLE',
              rewardState: state.rewardState,
              expiresAt: state.expiresAt,
            },
          });

      await AdminAuditService.record(tx, actor, {
        action: 'quest.grant',
        targetType: 'player-quest',
        targetId: quest.id,
        reason,
        before: latest ? { id: latest.id, key, attempt: latest.attempt, status: latest.status } : null,
        after: { id: quest.id, roundPlayerId, key, attempt: quest.attempt, status: quest.status },
      });
    });

    return AdminPlayerService.inspect(prisma, roundPlayerId);
  },

  async resetQuest(
    prisma: PrismaClient,
    actor: AuditActor,
    roundPlayerId: string,
    playerQuestId: string,
    reason: string,
    now = new Date(),
  ): Promise<AdminPlayerDto> {
    await prisma.$transaction(async (tx) => {
      const { ruleset } = await lockedPlayerContext(tx, actor, roundPlayerId);
      const quest = await tx.playerQuest.findFirst({
        where: { id: playerQuestId, roundPlayerId },
        include: { questDefinition: true },
      });
      if (!quest) throw AppError.notFound('PLAYER_QUEST_NOT_FOUND', 'That quest attempt does not exist for this player.');
      if (!quest.questDefinition.isEnabled) throw AppError.conflict('QUEST_DISABLED', 'Enable that quest before resetting it.');
      if (quest.status === 'COMPLETED') {
        throw AppError.conflict('QUEST_ALREADY_COMPLETED', 'A claimed quest cannot be reset because that could duplicate its rewards.');
      }
      const definition = ruleset.questDefinitions?.[quest.questDefinition.key];
      if (!definition) throw AppError.conflict('QUEST_DEFINITION_MISSING', 'That quest is not available in this ruleset.');
      if (definition.type === 'ALLIANCE' || definition.type === 'EVENT') {
        throw AppError.conflict('QUEST_SUPPORT_RESET_UNSUPPORTED', 'Shared alliance and community-event attempts cannot be reset from one player.');
      }

      const preserveOffer = definition.repeatability === 'DAILY'
        || definition.repeatability === 'WEEKLY'
        || isDynamicCityContractDefinition(definition);
      if (preserveOffer && quest.expiresAt && quest.expiresAt.getTime() <= now.getTime()) {
        throw AppError.conflict('QUEST_EXPIRED', 'That generated contract window already ended. Grant or use the current rotation instead.');
      }

      const before = {
        status: quest.status,
        attempt: quest.attempt,
        objectiveProgress: quest.objectiveProgress,
        bonusProgress: quest.bonusProgress,
        chosenBranch: quest.chosenBranch,
      };
      await tx.questProgressReceipt.deleteMany({ where: { playerQuestId: quest.id } });
      const updated = await tx.playerQuest.update({
        where: { id: quest.id },
        data: {
          status: 'AVAILABLE',
          isTracked: false,
          objectiveProgress: json({}),
          bonusProgress: json({}),
          chosenBranch: null,
          ...(preserveOffer ? {} : { rewardState: json({}), expiresAt: null }),
          acceptedAt: null,
          completedAt: null,
          claimedAt: null,
          failedAt: null,
        },
      });
      await AdminAuditService.record(tx, actor, {
        action: 'quest.reset',
        targetType: 'player-quest',
        targetId: quest.id,
        reason,
        before: { roundPlayerId, key: quest.questDefinition.key, ...before },
        after: { roundPlayerId, key: quest.questDefinition.key, attempt: updated.attempt, status: updated.status },
      });
    });

    return AdminPlayerService.inspect(prisma, roundPlayerId);
  },

  async completeQuest(
    prisma: PrismaClient,
    actor: AuditActor,
    roundPlayerId: string,
    playerQuestId: string,
    reason: string,
    now = new Date(),
  ): Promise<AdminPlayerDto> {
    await prisma.$transaction(async (tx) => {
      const { ruleset } = await lockedPlayerContext(tx, actor, roundPlayerId);
      const quest = await tx.playerQuest.findFirst({
        where: { id: playerQuestId, roundPlayerId },
        include: { questDefinition: true },
      });
      if (!quest) throw AppError.notFound('PLAYER_QUEST_NOT_FOUND', 'That quest attempt does not exist for this player.');
      if (!quest.questDefinition.isEnabled) throw AppError.conflict('QUEST_DISABLED', 'Enable that quest before completing it for support.');
      if (quest.status === 'COMPLETED') {
        throw AppError.conflict('QUEST_ALREADY_COMPLETED', 'That quest has already paid out.');
      }
      const definition = ruleset.questDefinitions?.[quest.questDefinition.key];
      if (!definition) throw AppError.conflict('QUEST_DEFINITION_MISSING', 'That quest is not available in this ruleset.');
      if (definition.type === 'ALLIANCE' || definition.type === 'EVENT') {
        throw AppError.conflict(
          'QUEST_SUPPORT_COMPLETE_UNSUPPORTED',
          'Shared alliance and community-event completion stays server-authoritative and cannot be forced for one player.',
        );
      }

      const objectives = cityContractObjectives(quest.rewardState) ?? objectiveDefinitions(quest.questDefinition.objectives);
      const objectiveProgress = Object.fromEntries(objectives.map((objective) => [
        objective.id,
        { current: objective.target, target: objective.target, completed: true },
      ]));
      const before = {
        status: quest.status,
        objectiveProgress: quest.objectiveProgress,
        completedAt: quest.completedAt,
        expiresAt: quest.expiresAt,
      };
      const supportGrace = quest.expiresAt && quest.expiresAt.getTime() <= now.getTime()
        ? new Date(now.getTime() + 15 * 60_000)
        : quest.expiresAt;
      const updated = await tx.playerQuest.update({
        where: { id: quest.id },
        data: {
          status: 'READY_TO_TURN_IN',
          objectiveProgress: json(objectiveProgress),
          acceptedAt: quest.acceptedAt ?? now,
          completedAt: now,
          failedAt: null,
          expiresAt: supportGrace,
        },
      });
      await AdminAuditService.record(tx, actor, {
        action: 'quest.complete-support',
        targetType: 'player-quest',
        targetId: quest.id,
        reason,
        before: { roundPlayerId, key: quest.questDefinition.key, ...before },
        after: {
          roundPlayerId,
          key: quest.questDefinition.key,
          status: updated.status,
          completedAt: updated.completedAt,
          expiresAt: updated.expiresAt,
        },
      });
    });

    return AdminPlayerService.inspect(prisma, roundPlayerId);
  },

  async adjustFavor(
    prisma: PrismaClient,
    actor: AuditActor,
    roundPlayerId: string,
    key: string,
    delta: number,
    reason: string,
  ): Promise<AdminPlayerDto> {
    if (!Number.isSafeInteger(delta) || delta === 0) {
      throw AppError.badRequest('FAVOR_ADJUST_INVALID', 'Favor adjustment must be a non-zero whole number.');
    }

    await prisma.$transaction(async (tx) => {
      const { ruleset } = await lockedPlayerContext(tx, actor, roundPlayerId);
      const definition = ruleset.favors?.[key];
      if (!definition) throw AppError.notFound('FAVOR_NOT_FOUND', 'That favor is not part of this ruleset.');
      const current = await tx.playerFavor.findUnique({
        where: { roundPlayerId_key: { roundPlayerId, key } },
      });
      const beforeQuantity = current?.quantity ?? 0;
      const nextQuantity = beforeQuantity + delta;
      if (nextQuantity < 0) {
        throw AppError.conflict('FAVOR_ADJUST_TOO_LOW', `This player only has ${beforeQuantity} ${definition.name} favor${beforeQuantity === 1 ? '' : 's'} in inventory.`);
      }

      const row = current
        ? await tx.playerFavor.update({
            where: { id: current.id },
            data: {
              quantity: nextQuantity,
              ...(delta > 0 ? {
                totalGranted: { increment: delta },
                lastSourceQuestKey: 'ADMIN',
              } : {}),
            },
          })
        : await tx.playerFavor.create({
            data: {
              roundPlayerId,
              key,
              quantity: nextQuantity,
              totalGranted: Math.max(0, delta),
              lastSourceQuestKey: delta > 0 ? 'ADMIN' : null,
            },
          });

      await AdminAuditService.record(tx, actor, {
        action: delta > 0 ? 'favor.grant' : 'favor.remove',
        targetType: 'player-favor',
        targetId: row.id,
        reason,
        before: { roundPlayerId, key, name: definition.name, quantity: beforeQuantity },
        after: { roundPlayerId, key, name: definition.name, quantity: row.quantity, delta },
      });
    });

    return AdminPlayerService.inspect(prisma, roundPlayerId);
  },
};
