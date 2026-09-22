import type { Prisma, PrismaClient } from '@prisma/client';
import {
  type ContactKey,
  type QuestDefinition,
  type QuestObjectiveDefinition,
  type QuestProgressMap,
  type QuestRewardDefinition,
  type Ruleset,
} from '@streets/rulesets';
import { formatCentsExact } from '@streets/shared';
import type {
  GameActionResult,
  PlayerQuestDto,
  QuestClaimInput,
  QuestClaimResult,
  QuestContactDto,
  QuestObjectiveDto,
  QuestPageDto,
  QuestRewardDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { ActionService, type PlayerState } from './action.service.js';
import { QuestProgressService } from './quest-progress.service.js';
import { PermanentUnlockService } from './permanent-unlock.service.js';
import { FavorInventoryService } from './favor-inventory.service.js';
import { TimedFavorService } from './timed-favor.service.js';
import { SingleUseFavorService } from './single-use-favor.service.js';
import {
  DAILY_CONTRACT_SLOTS,
  dailyContractWindow,
  syncDailyContractAttempts,
} from './daily-contract.service.js';
import {
  WEEKLY_CONTRACT_SLOTS,
  syncWeeklyContractAttempts,
  weeklyContractWindow,
} from './weekly-contract.service.js';

const ACTIVE_LIMIT = 8;
const TRACKED_LIMIT = 3;
const CONTACT_MAX = 1000;
const CONTACT_TIERS = [
  { at: 0, name: 'Unknown' },
  { at: 25, name: 'Acquaintance' },
  { at: 75, name: 'Regular' },
  { at: 150, name: 'Trusted' },
  { at: 300, name: 'Partner' },
  { at: 500, name: 'Inner Circle' },
] as const;

type QuestRow = Prisma.PlayerQuestGetPayload<{ include: { questDefinition: true } }>;
type ContactTier = typeof CONTACT_TIERS[number];

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function definitions(ruleset: Ruleset): QuestDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {});
}

function isWindowRepeatable(repeatability: QuestDefinition['repeatability']): boolean {
  return repeatability === 'DAILY' || repeatability === 'WEEKLY';
}

function objectives(value: Prisma.JsonValue): QuestObjectiveDefinition[] {
  return Array.isArray(value) ? value as unknown as QuestObjectiveDefinition[] : [];
}

function rewards(value: Prisma.JsonValue): QuestRewardDefinition[] {
  return Array.isArray(value) ? value as unknown as QuestRewardDefinition[] : [];
}

function progress(value: Prisma.JsonValue): QuestProgressMap {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as unknown as QuestProgressMap
    : {};
}

function contactTier(points: number): { name: string; next: number | null } {
  let tier: ContactTier = CONTACT_TIERS[0]!;
  let next: number | null = null;
  for (let i = 0; i < CONTACT_TIERS.length; i += 1) {
    const candidate = CONTACT_TIERS[i]!;
    if (points >= candidate.at) {
      tier = candidate;
      next = CONTACT_TIERS[i + 1]?.at ?? null;
    }
  }
  return { name: tier.name, next };
}

function contactFor(ruleset: Ruleset, key: string | null | undefined) {
  if (!key || !ruleset.contacts || !(key in ruleset.contacts)) return undefined;
  return ruleset.contacts[key as ContactKey];
}

function rewardLabel(reward: QuestRewardDefinition, ruleset: Ruleset): string {
  const amount = reward.amount ?? 0;
  switch (reward.kind) {
    case 'CASH':
      return formatCentsExact(amount);
    case 'TURNS':
      return `${amount.toLocaleString('en-US')} turns`;
    case 'ITEM':
      return `${amount.toLocaleString('en-US')} ${reward.key ?? 'item'}`;
    case 'CONTACT_REP':
      return `+${amount} ${contactFor(ruleset, reward.key)?.shortName ?? reward.key ?? 'contact'} reputation`;
    case 'WEAPON_ACCESS':
      return `${reward.key ?? 'weapon'} purchasing access`;
    case 'PERMANENT_UNLOCK':
      return `${ruleset.permanentUnlocks?.[reward.key ?? '']?.name ?? reward.key ?? 'Permanent unlock'} unlocked`;
    case 'FAVOR_ITEM': {
      const name = ruleset.favors?.[reward.key ?? '']?.name ?? reward.key ?? 'Favor';
      return `${name} ×${amount.toLocaleString('en-US')}`;
    }
  }
}

function rewardDto(reward: QuestRewardDefinition, ruleset: Ruleset): QuestRewardDto {
  return {
    kind: reward.kind,
    key: reward.key ?? null,
    amount: reward.amount ?? null,
    label: rewardLabel(reward, ruleset),
  };
}

function objectiveDtos(row: QuestRow): QuestObjectiveDto[] {
  const requiredProgress = progress(row.objectiveProgress);
  const bonusProgress = progress(row.bonusProgress);
  const map = (objective: QuestObjectiveDefinition, bonus: boolean): QuestObjectiveDto => {
    const saved = (bonus ? bonusProgress : requiredProgress)[objective.id];
    return {
      id: objective.id,
      kind: objective.kind,
      description: objective.description,
      format: objective.params?.display === 'CURRENCY' ? 'CURRENCY' : 'NUMBER',
      current: saved?.current ?? 0,
      target: objective.target,
      completed: saved?.completed ?? false,
      bonus,
    };
  };
  return [
    ...objectives(row.questDefinition.objectives).map((objective) => map(objective, false)),
    ...objectives(row.questDefinition.bonusObjectives).map((objective) => map(objective, true)),
  ];
}

function questDto(row: QuestRow, ruleset: Ruleset): PlayerQuestDto {
  const contact = contactFor(ruleset, row.questDefinition.contactKey);
  return {
    key: row.questDefinition.key,
    attempt: row.attempt,
    title: row.questDefinition.title,
    description: row.questDefinition.description,
    contactKey: row.questDefinition.contactKey,
    contactName: contact?.shortName ?? null,
    type: row.questDefinition.type,
    category: row.questDefinition.category,
    difficulty: row.questDefinition.difficulty,
    status: row.status,
    isTracked: row.isTracked,
    objectives: objectiveDtos(row),
    rewards: rewards(row.questDefinition.rewards).map((reward) => rewardDto(reward, ruleset)),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

async function contactPoints(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<Record<string, number>> {
  const keys = Object.keys(ruleset.contacts ?? {});
  if (!keys.length) return {};
  const rows = await db.playerReputation.findMany({
    where: { roundPlayerId, trader: { in: keys } },
    select: { trader: true, points: true },
  });
  return Object.fromEntries(keys.map((key) => [key, rows.find((row) => row.trader === key)?.points ?? 0]));
}

async function addContactRep(db: Db, roundPlayerId: string, contact: string, amount: number): Promise<number> {
  const current = await db.playerReputation.findUnique({
    where: { roundPlayerId_trader: { roundPlayerId, trader: contact } },
    select: { points: true },
  });
  const points = Math.min(CONTACT_MAX, Math.max(0, (current?.points ?? 0) + amount));
  await db.playerReputation.upsert({
    where: { roundPlayerId_trader: { roundPlayerId, trader: contact } },
    create: { roundPlayerId, trader: contact, points },
    update: { points },
  });
  return points;
}

function prerequisitesMet(
  definition: QuestDefinition,
  completed: ReadonlySet<string>,
  reps: Readonly<Record<string, number>>,
): boolean {
  return definition.prerequisites.every((prerequisite) => {
    if (prerequisite.kind === 'QUEST_COMPLETED') {
      const key = prerequisite.params?.questKey;
      return typeof key === 'string' && completed.has(key);
    }
    if (prerequisite.kind === 'CONTACT_REP_AT_LEAST') {
      const key = prerequisite.params?.contactKey;
      const points = prerequisite.params?.points;
      return typeof key === 'string' && typeof points === 'number' && (reps[key] ?? 0) >= points;
    }
    return false;
  });
}

async function syncDefinitions(db: Db | PrismaClient, ruleset: Ruleset): Promise<void> {
  for (const definition of definitions(ruleset)) {
    await db.questDefinition.upsert({
      where: {
        rulesetId_rulesetVersion_key: {
          rulesetId: ruleset.meta.id,
          rulesetVersion: ruleset.meta.version,
          key: definition.key,
        },
      },
      create: {
        key: definition.key,
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        title: definition.title,
        description: definition.description,
        contactKey: definition.contactKey,
        type: definition.type,
        category: definition.category,
        difficulty: definition.difficulty,
        prerequisites: inputJson(definition.prerequisites),
        objectives: inputJson(definition.objectives),
        bonusObjectives: inputJson(definition.bonusObjectives),
        rewards: inputJson(definition.rewards),
        followUpKeys: inputJson(definition.followUpKeys),
        availability: inputJson(definition.availability),
        repeatability: definition.repeatability,
        expiresAfterMinutes: definition.expiresAfterMinutes,
      },
      update: {
        title: definition.title,
        description: definition.description,
        contactKey: definition.contactKey,
        type: definition.type,
        category: definition.category,
        difficulty: definition.difficulty,
        prerequisites: inputJson(definition.prerequisites),
        objectives: inputJson(definition.objectives),
        bonusObjectives: inputJson(definition.bonusObjectives),
        rewards: inputJson(definition.rewards),
        followUpKeys: inputJson(definition.followUpKeys),
        availability: inputJson(definition.availability),
        repeatability: definition.repeatability,
        expiresAfterMinutes: definition.expiresAfterMinutes,
        isEnabled: true,
      },
    });
  }
}

async function refreshAvailability(db: Db, roundPlayerId: string, ruleset: Ruleset, now = new Date()): Promise<string[]> {
  await db.playerQuest.updateMany({
    where: {
      roundPlayerId,
      status: { in: ['AVAILABLE', 'ACTIVE', 'READY_TO_TURN_IN'] },
      expiresAt: { not: null, lte: now },
    },
    data: { status: 'EXPIRED', isTracked: false },
  });

  const questDefinitions = await db.questDefinition.findMany({
    where: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, isEnabled: true },
  });
  const existing = await db.playerQuest.findMany({
    where: { roundPlayerId, questDefinitionId: { in: questDefinitions.map((definition) => definition.id) } },
    include: { questDefinition: true },
    orderBy: { attempt: 'desc' },
  });
  const completed = new Set(existing.filter((row) => row.status === 'COMPLETED').map((row) => row.questDefinition.key));
  const reps = await contactPoints(db, roundPlayerId, ruleset);
  const newlyAvailable: string[] = [];

  for (const definitionRow of questDefinitions) {
    const definition = (ruleset.questDefinitions ?? {})[definitionRow.key];
    if (!definition) continue;
    // Rotating definitions are materialized by their board services so each
    // reset can create a new PlayerQuest.attempt without disturbing ONCE jobs.
    if (
      (definition.type === 'DAILY' && definition.repeatability === 'DAILY')
      || (definition.type === 'WEEKLY' && definition.repeatability === 'WEEKLY')
    ) continue;
    const current = existing.find((row) => row.questDefinitionId === definitionRow.id);
    const available = prerequisitesMet(definition, completed, reps);
    if (!current) {
      await db.playerQuest.create({
        data: {
          roundPlayerId,
          questDefinitionId: definitionRow.id,
          status: available ? 'AVAILABLE' : 'LOCKED',
        },
      });
      if (available) newlyAvailable.push(definition.key);
    } else if (current.status === 'LOCKED' && available) {
      await db.playerQuest.update({ where: { id: current.id }, data: { status: 'AVAILABLE' } });
      newlyAvailable.push(definition.key);
    }
  }

  await syncDailyContractAttempts(db, roundPlayerId, ruleset, now);
  await syncWeeklyContractAttempts(db, roundPlayerId, ruleset, now);
  return newlyAvailable;
}

async function loadQuest(db: Db, roundPlayerId: string, ruleset: Ruleset, key: string): Promise<QuestRow> {
  const row = await db.playerQuest.findFirst({
    where: {
      roundPlayerId,
      questDefinition: {
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        key,
      },
    },
    include: { questDefinition: true },
    orderBy: { attempt: 'desc' },
  });
  if (!row) throw AppError.notFound('QUEST_NOT_FOUND', 'That job is not available in this round.');
  return row;
}

function applyStateReward(next: PlayerState, reward: QuestRewardDefinition): void {
  const amount = reward.amount ?? 0;
  if (reward.kind === 'CASH') {
    next.cashCents += BigInt(amount);
    return;
  }
  if (reward.kind === 'TURNS') {
    next.turns += amount;
    return;
  }
  if (reward.kind === 'ITEM') {
    const key = reward.key;
    const allowed = ['condoms', 'medicine', 'crack', 'beer', 'pistols', 'shotguns', 'tek9s', 'ak47s', 'lowRiders'] as const;
    if (!key || !allowed.includes(key as typeof allowed[number])) throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid item reward.');
    const field = key as typeof allowed[number];
    next[field] += amount;
    return;
  }
  if (reward.kind === 'WEAPON_ACCESS') {
    if (reward.key === 'SHOTGUN') next.shotgunUnlocked = true;
    else if (reward.key === 'TEK9') next.tek9Unlocked = true;
    else if (reward.key === 'AK47') next.ak47Unlocked = true;
    else throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid weapon reward.');
  }
}

export const HandcraftedQuestService = {
  async sync(prisma: PrismaClient, ruleset: Ruleset): Promise<void> {
    if (!ruleset.questDefinitions) return;
    await syncDefinitions(prisma, ruleset);
  },

  async page(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<QuestPageDto> {
    await syncDefinitions(prisma, ruleset);
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const now = new Date();
      await refreshAvailability(tx, roundPlayerId, ruleset, now);
      const dailyEnabled = definitions(ruleset).some(
        (definition) => definition.type === 'DAILY' && definition.repeatability === 'DAILY',
      );
      const dailyWindow = dailyEnabled ? dailyContractWindow(now, ruleset) : null;
      const weeklyEnabled = definitions(ruleset).some(
        (definition) => definition.type === 'WEEKLY' && definition.repeatability === 'WEEKLY',
      );
      const weeklyWindow = weeklyEnabled ? weeklyContractWindow(now, ruleset) : null;
      const rows = await tx.playerQuest.findMany({
        where: {
          roundPlayerId,
          questDefinition: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, isEnabled: true },
        },
        include: { questDefinition: true },
        orderBy: [{ createdAt: 'asc' }],
      });
      const reps = await contactPoints(tx, roundPlayerId, ruleset);
      const contacts = Object.values(ruleset.contacts ?? {}).map((contact): QuestContactDto => {
        const points = reps[contact.key] ?? 0;
        const tier = contactTier(points);
        return {
          ...contact,
          points,
          standing: tier.name,
          nextStandingAt: tier.next,
        };
      });
      const unlockRows = await tx.playerUnlock.findMany({
        where: { roundPlayerId },
        orderBy: { awardedAt: 'asc' },
      });
      const permanentUnlocks = unlockRows.flatMap((row) => {
        const definition = ruleset.permanentUnlocks?.[row.key];
        if (!definition) return [];
        return [{
          key: row.key,
          name: definition.name,
          description: definition.description,
          category: definition.category,
          sourceQuestKey: row.sourceQuestKey,
          awardedAt: row.awardedAt.toISOString(),
        }];
      });
      const favors = (await FavorInventoryService.list(tx, roundPlayerId, ruleset)).map((entry) => ({
        key: entry.key,
        name: entry.definition.name,
        description: entry.definition.description,
        contactKey: entry.definition.contactKey,
        activationKind: entry.definition.activation.kind,
        activatable: Boolean(entry.definition.effect),
        category: entry.definition.activation.category,
        durationMinutes: entry.definition.activation.kind === 'TIMED'
          ? entry.definition.activation.durationMinutes
          : null,
        quantity: entry.quantity,
        totalGranted: entry.totalGranted,
        lastSourceQuestKey: entry.lastSourceQuestKey,
      }));
      const activeFavors = await TimedFavorService.listActive(tx, roundPlayerId, ruleset, now);
      const armedFavors = await SingleUseFavorService.listArmed(tx, roundPlayerId, ruleset);
      return {
        // Sample immediately before the response object is built so browser clock
        // skew cannot decide when an active favor expires.
        serverTime: new Date().toISOString(),
        dailyContracts: {
          enabled: dailyEnabled,
          slots: dailyEnabled ? DAILY_CONTRACT_SLOTS : 0,
          resetAt: dailyWindow?.endsAt.toISOString() ?? null,
        },
        weeklyContracts: {
          enabled: weeklyEnabled,
          slots: weeklyEnabled ? WEEKLY_CONTRACT_SLOTS : 0,
          resetAt: weeklyWindow?.endsAt.toISOString() ?? null,
        },
        activeLimit: ACTIVE_LIMIT,
        trackedLimit: TRACKED_LIMIT,
        counts: {
          available: rows.filter((row) => row.status === 'AVAILABLE').length,
          active: rows.filter((row) => ['ACTIVE', 'READY_TO_TURN_IN'].includes(row.status)).length,
          ready: rows.filter((row) => row.status === 'READY_TO_TURN_IN').length,
          completed: rows.filter((row) => row.status === 'COMPLETED').length,
        },
        contacts,
        permanentUnlocks,
        activeFavors,
        armedFavors,
        favors,
        quests: rows.map((row) => questDto(row, ruleset)),
      };
    });
  },

  async accept(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, key: string): Promise<QuestPageDto> {
    await syncDefinitions(prisma, ruleset);
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      await refreshAvailability(tx, roundPlayerId, ruleset);
      const row = await loadQuest(tx, roundPlayerId, ruleset, key);
      if (row.status === 'ACTIVE' || row.status === 'READY_TO_TURN_IN') return;
      if (row.status !== 'AVAILABLE') throw AppError.conflict('QUEST_NOT_AVAILABLE', 'That job is not available yet.');
      const active = await tx.playerQuest.count({ where: { roundPlayerId, status: { in: ['ACTIVE', 'READY_TO_TURN_IN'] } } });
      if (active >= ACTIVE_LIMIT) throw AppError.conflict('QUEST_ACTIVE_LIMIT', `You can only have ${ACTIVE_LIMIT} active jobs at once.`);
      const tracked = await tx.playerQuest.count({ where: { roundPlayerId, isTracked: true } });
      const acceptedAt = new Date();
      if (row.expiresAt && row.expiresAt.getTime() <= acceptedAt.getTime()) {
        throw AppError.conflict('QUEST_EXPIRED', 'That contract expired at reset. Refresh the board for new work.');
      }
      await tx.playerQuest.update({
        where: { id: row.id },
        data: {
          status: 'ACTIVE',
          acceptedAt,
          completedAt: null,
          claimedAt: null,
          failedAt: null,
          objectiveProgress: {},
          bonusProgress: {},
          rewardState: isWindowRepeatable(row.questDefinition.repeatability) ? inputJson(row.rewardState) : {},
          expiresAt: isWindowRepeatable(row.questDefinition.repeatability)
            ? row.expiresAt
            : row.questDefinition.expiresAfterMinutes
              ? new Date(acceptedAt.getTime() + row.questDefinition.expiresAfterMinutes * 60_000)
              : null,
          isTracked: tracked < TRACKED_LIMIT,
        },
      });
      await QuestProgressService.emit(tx, roundPlayerId, {
        sourceKey: `quest-accept:${row.id}:${acceptedAt.getTime()}`,
        type: 'QUEST_ACCEPTED',
        payload: { questKey: key },
        at: acceptedAt,
      });
    });
    return this.page(prisma, roundPlayerId, ruleset);
  },

  async abandon(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, key: string): Promise<QuestPageDto> {
    await syncDefinitions(prisma, ruleset);
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      await refreshAvailability(tx, roundPlayerId, ruleset);
      const row = await loadQuest(tx, roundPlayerId, ruleset, key);
      if (!['ACTIVE', 'READY_TO_TURN_IN'].includes(row.status)) throw AppError.conflict('QUEST_NOT_ACTIVE', 'That job is not active.');
      await tx.questProgressReceipt.deleteMany({ where: { playerQuestId: row.id } });
      await tx.playerQuest.update({
        where: { id: row.id },
        data: {
          status: 'AVAILABLE',
          isTracked: false,
          acceptedAt: null,
          completedAt: null,
          expiresAt: isWindowRepeatable(row.questDefinition.repeatability) ? row.expiresAt : null,
          objectiveProgress: {},
          bonusProgress: {},
          rewardState: isWindowRepeatable(row.questDefinition.repeatability) ? row.rewardState : {},
        },
      });
    });
    return this.page(prisma, roundPlayerId, ruleset);
  },

  async track(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, key: string, tracked: boolean): Promise<QuestPageDto> {
    await syncDefinitions(prisma, ruleset);
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      await refreshAvailability(tx, roundPlayerId, ruleset);
      const row = await loadQuest(tx, roundPlayerId, ruleset, key);
      if (!['ACTIVE', 'READY_TO_TURN_IN'].includes(row.status)) throw AppError.conflict('QUEST_NOT_ACTIVE', 'Only active jobs can be tracked.');
      if (tracked && !row.isTracked) {
        const count = await tx.playerQuest.count({ where: { roundPlayerId, isTracked: true } });
        if (count >= TRACKED_LIMIT) throw AppError.conflict('QUEST_TRACK_LIMIT', `You can only track ${TRACKED_LIMIT} jobs at once.`);
      }
      await tx.playerQuest.update({ where: { id: row.id }, data: { isTracked: tracked } });
    });
    return this.page(prisma, roundPlayerId, ruleset);
  },

  async claim(
    prisma: PrismaClient,
    roundPlayerId: string,
    ruleset: Ruleset,
    key: string,
    input: QuestClaimInput,
  ): Promise<GameActionResult<QuestClaimResult>> {
    await syncDefinitions(prisma, ruleset);
    return ActionService.run<QuestClaimResult>(prisma, roundPlayerId, {
      action: 'QUEST_CLAIM',
      actionId: input.actionId,
      execute: async ({ tx, current, now }) => {
        const row = await loadQuest(tx, roundPlayerId, ruleset, key);
        if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
          throw AppError.conflict('QUEST_EXPIRED', 'That contract expired at reset. Refresh the board for new work.');
        }
        if (row.status !== 'READY_TO_TURN_IN') throw AppError.conflict('QUEST_NOT_READY', 'Finish the job before collecting payment.');

        const next: PlayerState = { ...current };
        const questRewards = rewards(row.questDefinition.rewards);
        for (const reward of questRewards) {
          if (reward.kind === 'CONTACT_REP') {
            if (!reward.key || !ruleset.contacts?.[reward.key as ContactKey]) {
              throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid contact reward.');
            }
            await addContactRep(tx, roundPlayerId, reward.key, reward.amount ?? 0);
          } else if (reward.kind === 'PERMANENT_UNLOCK') {
            if (!reward.key) throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid permanent unlock reward.');
            const unlock = await PermanentUnlockService.award(tx, roundPlayerId, ruleset, reward.key, key, now);
            if (unlock.effect.kind === 'WEAPON_ACCESS') {
              if (unlock.effect.weapon === 'SHOTGUN') next.shotgunUnlocked = true;
              else if (unlock.effect.weapon === 'TEK9') next.tek9Unlocked = true;
              else if (unlock.effect.weapon === 'AK47') next.ak47Unlocked = true;
            }
          } else if (reward.kind === 'FAVOR_ITEM') {
            if (!reward.key) throw AppError.conflict('QUEST_REWARD_INVALID', 'That quest has an invalid favor reward.');
            await FavorInventoryService.grant(tx, roundPlayerId, ruleset, reward.key, reward.amount ?? 0, key);
          } else {
            applyStateReward(next, reward);
          }
        }

        await tx.playerQuest.update({
          where: { id: row.id },
          data: { status: 'COMPLETED', claimedAt: now, isTracked: false },
        });
        const newlyAvailable = await refreshAvailability(tx, roundPlayerId, ruleset, now);
        const dtoRewards = questRewards.map((reward) => rewardDto(reward, ruleset));

        return {
          next,
          result: {
            questKey: key,
            title: row.questDefinition.title,
            rewards: dtoRewards,
            newlyAvailable,
          },
          activity: {
            type: 'QUEST_CLAIMED',
            payload: inputJson({
              questKey: key,
              title: row.questDefinition.title,
              contactKey: row.questDefinition.contactKey,
              rewards: dtoRewards.map((reward) => reward.label),
              newlyAvailable,
            }),
          },
        };
      },
    });
  },
};
