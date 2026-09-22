import type { ActivityType } from '@prisma/client';
import type { QuestDataObject, QuestDataValue, QuestDefinition, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';

type SecretStateField = 'heat' | 'whores' | 'netWorthCents';

function object(value: QuestDataValue | undefined): QuestDataObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as QuestDataObject
    : null;
}

function valueAt(root: QuestDataValue, path: string): QuestDataValue | undefined {
  let current: QuestDataValue | undefined = root;
  for (const part of path.split('.')) {
    const row = object(current);
    if (!row || !(part in row)) return undefined;
    current = row[part];
  }
  return current;
}

function sameJson(left: QuestDataValue | undefined, right: QuestDataValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function matchesWhere(payload: QuestDataValue, where: QuestDataValue | undefined): boolean {
  const filter = object(where);
  if (!filter) return true;
  return Object.entries(filter).every(([path, expected]) => sameJson(valueAt(payload, path), expected));
}

function strings(value: QuestDataValue | undefined): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function positiveTarget(value: QuestDataValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export function activityMatchesSecretTrigger(
  trigger: QuestDataObject,
  activities: readonly { type: string; payload: QuestDataValue }[],
): boolean {
  const eventTypes = strings(trigger.eventTypes);
  if (!eventTypes.length) return false;
  const target = positiveTarget(trigger.target);
  if (target === null) return false;

  if (trigger.kind === 'ACTIVITY_COUNT') {
    const count = activities.filter((activity) =>
      eventTypes.includes(activity.type) && matchesWhere(activity.payload, trigger.where)
    ).length;
    return count >= target;
  }

  if (trigger.kind === 'ACTIVITY_OBJECT_SUM_AT_LEAST') {
    const field = typeof trigger.field === 'string' ? trigger.field : null;
    if (!field) return false;
    return activities.some((activity) => {
      if (!eventTypes.includes(activity.type) || !matchesWhere(activity.payload, trigger.where)) return false;
      const raw = object(valueAt(activity.payload, field));
      if (!raw) return false;
      const sum = Object.values(raw).reduce(
        (total: number, value) => total + (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0),
        0,
      );
      return sum >= target;
    });
  }

  return false;
}

export function secretDefinitions(ruleset: Ruleset): QuestDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {}).filter((definition) => definition.type === 'SECRET');
}

async function triggerSatisfied(
  db: Db,
  roundPlayerId: string,
  definition: QuestDefinition,
): Promise<boolean> {
  const trigger = object(definition.availability.secretTrigger);
  if (!trigger || typeof trigger.kind !== 'string') return false;
  const target = positiveTarget(trigger.target);
  if (target === null) return false;

  if (trigger.kind === 'STATE_AT_LEAST') {
    const field = typeof trigger.field === 'string' ? trigger.field as SecretStateField : null;
    if (!field || !['heat', 'whores', 'netWorthCents'].includes(field)) return false;
    const player = await db.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: { heat: true, whores: true, netWorthCents: true },
    });
    if (!player) return false;
    const values: Record<SecretStateField, number> = {
      heat: player.heat,
      whores: player.whores,
      netWorthCents: Number(player.netWorthCents),
    };
    return values[field] >= target;
  }

  if (trigger.kind === 'TURF_COUNT_AT_LEAST') {
    return (await db.turf.count({ where: { holderId: roundPlayerId } })) >= target;
  }

  if (trigger.kind === 'ACTIVITY_COUNT' || trigger.kind === 'ACTIVITY_OBJECT_SUM_AT_LEAST') {
    const eventTypes = strings(trigger.eventTypes);
    if (!eventTypes.length) return false;
    const activities = await db.playerActivity.findMany({
      where: { roundPlayerId, type: { in: eventTypes as ActivityType[] } },
      select: { type: true, payload: true },
      orderBy: { createdAt: 'asc' },
    });
    return activityMatchesSecretTrigger(
      trigger,
      activities.map((activity) => ({
        type: activity.type,
        payload: activity.payload as unknown as QuestDataValue,
      })),
    );
  }

  return false;
}

/**
 * Reveal SECRET definitions exactly once. Before the trigger is met there is no
 * PlayerQuest row, which keeps titles/objectives out of the player-facing API.
 */
export async function syncSecretQuestAttempts(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
): Promise<string[]> {
  const definitions = secretDefinitions(ruleset);
  if (!definitions.length) return [];

  const definitionRows = await db.questDefinition.findMany({
    where: {
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      key: { in: definitions.map((definition) => definition.key) },
      isEnabled: true,
    },
    select: { id: true, key: true },
  });
  const existing = await db.playerQuest.findMany({
    where: {
      roundPlayerId,
      questDefinitionId: { in: definitionRows.map((row) => row.id) },
    },
    select: { questDefinitionId: true },
  });
  const existingIds = new Set(existing.map((row) => row.questDefinitionId));
  const revealed: string[] = [];

  for (const definitionRow of definitionRows) {
    if (existingIds.has(definitionRow.id)) continue;
    const definition = ruleset.questDefinitions?.[definitionRow.key];
    if (!definition || definition.type !== 'SECRET') continue;
    if (!await triggerSatisfied(db, roundPlayerId, definition)) continue;

    await db.playerQuest.create({
      data: {
        roundPlayerId,
        questDefinitionId: definitionRow.id,
        status: 'AVAILABLE',
      },
    });
    existingIds.add(definitionRow.id);
    revealed.push(definition.key);
  }

  return revealed;
}
