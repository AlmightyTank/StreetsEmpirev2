import { ActivityType } from '@prisma/client';
import type { QuestDataObject, QuestDataValue, QuestDefinition, Ruleset, SecretTrigger } from '@streets/rulesets';
import type { Db } from '../utils/db.js';

/**
 * Slice A secret content foundation contract.
 *
 * - Per-round story state lives in PlayerQuest (one row per roundPlayer, keyed
 *   by questDefinitionId + attempt, revealed only after the trigger is met).
 * - Permanent account trophies live in AccountCosmeticUnlock (upsert by
 *   accountId + key, granted once via the normal quest claim path).
 * - No new model, no parallel scheduler: discovery reuses the existing
 *   quest sync flow (handcrafted-quest.service refreshAvailability) and the
 *   existing QUEST_CLAIM idempotency scope + COSMETIC_UNLOCK upsert.
 * - Spoiler privacy: no PlayerQuest row exists before reveal, so page(),
 *   quest board, feed, and achievement payloads cannot leak unrevealed keys.
 * - Versioning: sync only touches QuestDefinition rows pinned to
 *   ruleset.meta.id + ruleset.meta.version with isEnabled=true, so old
 *   pinned rulesets keep old behavior and disabling a definition stops
 *   future reveals without rewriting history.
 */

export interface SecretSyncOptions {
  /** Beta/test-defined secrets (secretContent.testOnly) only reveal when true. */
  readonly testMode?: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

/** Author kill switch + beta test gate. Disabled never reveals. */
export function isSecretContentEnabled(definition: QuestDefinition, opts?: SecretSyncOptions): boolean {
  const content = definition.availability.secretContent;
  if (!content) return true;
  if (content.disabled === true) return false;
  if (content.testOnly === true && opts?.testMode !== true) return false;
  return true;
}

/** Reward keys carried by a secret definition (for contract auditing). */
export function secretRewardKeys(definition: QuestDefinition): string[] {
  return definition.rewards
    .map((reward) => (typeof reward.key === 'string' && reward.key.trim().length > 0 ? reward.key : null))
    .filter((key): key is string => key !== null);
}

/**
 * Slice C. The encounter key that opened a secret's trail, when the trigger
 * names one (`where: {'encounter.key': '<key>'}` or the `randomEncounter.*`
 * alias). Null for state/turf/activity triggers with no encounter source.
 */
export function secretSourceEncounterKey(definition: QuestDefinition): string | null {
  const trigger = object(definition.availability.secretTrigger);
  if (!trigger) return null;
  const where = object(trigger.where);
  if (!where) return null;
  for (const path of ['encounter.key', 'randomEncounter.key']) {
    const value = where[path];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

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

/**
 * Slice C. Encounter payloads are stored under `encounter` by the
 * SCOUT/PRODUCE/TRAVEL pipelines but under `randomEncounter` by the generic
 * ActionService pipeline (STORE/TURF/COMBAT). Trigger authors always write
 * `encounter.*`; the matcher accepts either nesting so one authoring shape
 * works for every trigger source.
 */
function aliasPaths(path: string): string[] {
  if (path === 'encounter' || path.startsWith('encounter.')) {
    return [path, `randomEncounter${path.slice('encounter'.length)}`];
  }
  if (path === 'randomEncounter' || path.startsWith('randomEncounter.')) {
    return [path, `encounter${path.slice('randomEncounter'.length)}`];
  }
  return [path];
}

function matchesWhere(payload: QuestDataValue, where: QuestDataValue | undefined): boolean {
  const filter = object(where);
  if (!filter) return true;
  return Object.entries(filter).every(([path, expected]) =>
    aliasPaths(path).some((candidate) => sameJson(valueAt(payload, candidate), expected))
  );
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
  trigger: QuestDataObject | SecretTrigger,
  activities: readonly { type: string; payload: QuestDataValue }[],
): boolean {
  const row: QuestDataObject = trigger;
  const eventTypes = strings(row.eventTypes);
  if (!eventTypes.length) return false;
  const target = positiveTarget(row.target);
  if (target === null) return false;

  if (row.kind === 'ACTIVITY_COUNT') {
    const count = activities.filter((activity) =>
      eventTypes.includes(activity.type) && matchesWhere(activity.payload, row.where)
    ).length;
    return count >= target;
  }

  if (row.kind === 'ACTIVITY_OBJECT_SUM_AT_LEAST') {
    const field = typeof row.field === 'string' ? row.field : null;
    if (!field) return false;
    return activities.some((activity) => {
      if (!eventTypes.includes(activity.type) || !matchesWhere(activity.payload, row.where)) return false;
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
    // Ruleset-driven strings: drop anything the DB enum does not know so a
    // stale/typo'd eventType degrades to "trigger not met" instead of 500ing
    // the whole quest page (PrismaClientValidationError on type.in).
    const knownActivityTypes = new Set<string>(Object.values(ActivityType));
    const eventTypes = strings(trigger.eventTypes).filter((event): event is ActivityType =>
      knownActivityTypes.has(event),
    );
    if (!eventTypes.length) return false;
    const activities = await db.playerActivity.findMany({
      where: { roundPlayerId, type: { in: eventTypes } },
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
 * Concurrent syncs race safely: the PlayerQuest unique constraint
 * (roundPlayerId + questDefinitionId + attempt) wins and the loser is ignored.
 */
export async function syncSecretQuestAttempts(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  opts?: SecretSyncOptions,
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
    if (!isSecretContentEnabled(definition, opts)) continue;
    if (!await triggerSatisfied(db, roundPlayerId, definition)) continue;

    try {
      await db.playerQuest.create({
        data: {
          roundPlayerId,
          questDefinitionId: definitionRow.id,
          status: 'AVAILABLE',
        },
      });
    } catch (error) {
      // Lost a concurrent reveal race: the winner's row already exists.
      if (!isUniqueViolation(error)) throw error;
    }
    existingIds.add(definitionRow.id);
    revealed.push(definition.key);
  }

  return revealed;
}
