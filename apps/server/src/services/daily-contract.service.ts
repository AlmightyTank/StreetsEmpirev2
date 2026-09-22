import type { Prisma } from '@prisma/client';
import type { QuestDefinition, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { dailyBoundary } from './ranking.service.js';

export const DAILY_CONTRACT_SLOTS = 3;

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function pool(ruleset: Ruleset): QuestDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {})
    .filter((definition) => definition.type === 'DAILY' && definition.repeatability === 'DAILY');
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function dailyContractWindow(now: Date, ruleset: Ruleset): { startsAt: Date; endsAt: Date } {
  const startsAt = dailyBoundary(now, ruleset);
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000),
  };
}

/**
 * Daily selection is server-authoritative and deterministic for the ruleset
 * window. Every player in the same ruleset sees the same board that day.
 */
export function selectedDailyContractKeys(ruleset: Ruleset, now: Date): string[] {
  const { startsAt } = dailyContractWindow(now, ruleset);
  const seed = ruleset.meta.id + ':' + ruleset.meta.version + ':' + startsAt.toISOString();
  return pool(ruleset)
    .map((definition) => ({
      key: definition.key,
      order: hash32(seed + ':' + definition.key),
    }))
    .sort((left, right) => left.order - right.order || left.key.localeCompare(right.key))
    .slice(0, DAILY_CONTRACT_SLOTS)
    .map((entry) => entry.key);
}

/**
 * Materialize exactly today's selected daily attempts. Old open attempts expire
 * at the reset boundary. Completed attempts stay in history and a later
 * rotation creates a new PlayerQuest.attempt for the same definition.
 */
export async function syncDailyContractAttempts(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  now: Date,
): Promise<{ keys: string[]; resetAt: Date | null }> {
  const definitions = pool(ruleset);
  if (definitions.length === 0) return { keys: [], resetAt: null };

  const keys = selectedDailyContractKeys(ruleset, now);
  const { startsAt, endsAt } = dailyContractWindow(now, ruleset);
  const definitionRows = await db.questDefinition.findMany({
    where: {
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      key: { in: definitions.map((definition) => definition.key) },
      isEnabled: true,
    },
    select: { id: true, key: true },
  });
  const definitionIds = definitionRows.map((row) => row.id);

  await db.playerQuest.updateMany({
    where: {
      roundPlayerId,
      questDefinitionId: { in: definitionIds },
      status: { in: ['AVAILABLE', 'ACTIVE', 'READY_TO_TURN_IN'] },
      expiresAt: { lte: now },
    },
    data: { status: 'EXPIRED', isTracked: false },
  });

  const existing = await db.playerQuest.findMany({
    where: { roundPlayerId, questDefinitionId: { in: definitionIds } },
    select: {
      id: true,
      questDefinitionId: true,
      attempt: true,
      status: true,
      expiresAt: true,
    },
  });

  for (const key of keys) {
    const definitionRow = definitionRows.find((row) => row.key === key);
    if (!definitionRow) continue;

    const live = existing.find((row) =>
      row.questDefinitionId === definitionRow.id
      && row.expiresAt !== null
      && row.expiresAt.getTime() > now.getTime()
    );
    if (live) continue;

    const attempt = existing
      .filter((row) => row.questDefinitionId === definitionRow.id)
      .reduce((max, row) => Math.max(max, row.attempt), 0) + 1;

    const created = await db.playerQuest.create({
      data: {
        roundPlayerId,
        questDefinitionId: definitionRow.id,
        attempt,
        status: 'AVAILABLE',
        expiresAt: endsAt,
        rewardState: inputJson({
          dailyWindowStart: startsAt.toISOString(),
          dailyWindowEnd: endsAt.toISOString(),
        }),
      },
      select: {
        id: true,
        questDefinitionId: true,
        attempt: true,
        status: true,
        expiresAt: true,
      },
    });
    existing.push(created);
  }

  return { keys, resetAt: endsAt };
}
