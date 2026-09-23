import type { Prisma } from '@prisma/client';
import type {
  QuestDefinition,
  QuestObjectiveProgress,
  Ruleset,
} from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { createPlayerActivity } from './in-app-notification.service.js';

export const WEEKLY_CONTRACT_SLOTS = 2;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function pool(ruleset: Ruleset, enabledKeys?: ReadonlySet<string>): QuestDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {})
    .filter((definition) =>
      definition.type === 'WEEKLY'
      && definition.repeatability === 'WEEKLY'
      && (!enabledKeys || enabledKeys.has(definition.key))
    );
}

function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Weekly contracts roll Monday at the same UTC hour used by the daily ranking
 * and contract boundary. Monday-before-reset still belongs to the prior week.
 */
export function weeklyContractWindow(now: Date, ruleset: Ruleset): { startsAt: Date; endsAt: Date } {
  const startsAt = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    ruleset.rankings.dailyResetHourUtc,
    0,
    0,
    0,
  ));
  if (startsAt.getTime() > now.getTime()) startsAt.setUTCDate(startsAt.getUTCDate() - 1);

  // JS: Sunday=0, Monday=1. Convert to days elapsed since Monday.
  const daysSinceMonday = (startsAt.getUTCDay() + 6) % 7;
  startsAt.setUTCDate(startsAt.getUTCDate() - daysSinceMonday);

  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + WEEK_MS),
  };
}

/**
 * The weekly board is shared and deterministic. Prefer different categories so
 * the two-slot board cannot become two versions of the same activity loop.
 */
export function selectedWeeklyContractKeys(ruleset: Ruleset, now: Date, enabledKeys?: ReadonlySet<string>): string[] {
  const { startsAt } = weeklyContractWindow(now, ruleset);
  const seed = ruleset.meta.id + ':' + ruleset.meta.version + ':' + startsAt.toISOString();
  const ordered = pool(ruleset, enabledKeys)
    .map((definition) => ({
      definition,
      order: hash32(seed + ':' + definition.key),
    }))
    .sort((left, right) => left.order - right.order || left.definition.key.localeCompare(right.definition.key));

  const picked: typeof ordered = [];
  for (const entry of ordered) {
    if (picked.length >= WEEKLY_CONTRACT_SLOTS) break;
    if (picked.some((selected) => selected.definition.category === entry.definition.category)) continue;
    picked.push(entry);
  }
  for (const entry of ordered) {
    if (picked.length >= WEEKLY_CONTRACT_SLOTS) break;
    if (!picked.includes(entry)) picked.push(entry);
  }
  return picked.map((entry) => entry.definition.key);
}

export interface TurfHoldSlice {
  startedAt: Date;
  endedAt: Date | null;
}

/** Combined whole hours held across every block, clipped to one accepted attempt. */
export function turfHoldHoursForSegments(
  segments: readonly TurfHoldSlice[],
  startsAt: Date,
  endsAt: Date,
): number {
  let milliseconds = 0;
  for (const segment of segments) {
    const start = Math.max(startsAt.getTime(), segment.startedAt.getTime());
    const end = Math.min(endsAt.getTime(), segment.endedAt?.getTime() ?? endsAt.getTime());
    if (end > start) milliseconds += end - start;
  }
  return Math.floor(milliseconds / HOUR_MS);
}

function progressMap(value: Prisma.JsonValue): Record<string, QuestObjectiveProgress> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, QuestObjectiveProgress> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    if (typeof row.current !== 'number' || typeof row.target !== 'number') continue;
    result[key] = {
      current: row.current,
      target: row.target,
      completed: row.completed === true,
      ...(Array.isArray(row.values)
        ? { values: row.values.filter((item): item is string => typeof item === 'string') }
        : {}),
    };
  }
  return result;
}

async function syncDerivedTurfProgress(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  definitionRows: readonly { id: string; key: string }[],
  now: Date,
): Promise<void> {
  const turfDefinitionIds = definitionRows
    .filter((row) => (ruleset.questDefinitions?.[row.key]?.objectives ?? [])
      .some((objective) => objective.kind === 'TURF_HOLD_HOURS'))
    .map((row) => row.id);
  if (!turfDefinitionIds.length) return;

  const attempts = await db.playerQuest.findMany({
    where: {
      roundPlayerId,
      questDefinitionId: { in: turfDefinitionIds },
      status: { in: ['ACTIVE', 'READY_TO_TURN_IN'] },
    },
    select: {
      id: true,
      questDefinitionId: true,
      status: true,
      acceptedAt: true,
      expiresAt: true,
      objectiveProgress: true,
    },
  });

  for (const attempt of attempts) {
    if (!attempt.acceptedAt) continue;
    const definitionRow = definitionRows.find((row) => row.id === attempt.questDefinitionId);
    const definition = definitionRow ? ruleset.questDefinitions?.[definitionRow.key] : undefined;
    if (!definition) continue;

    const asOf = new Date(Math.min(
      now.getTime(),
      attempt.expiresAt?.getTime() ?? now.getTime(),
    ));
    if (asOf.getTime() <= attempt.acceptedAt.getTime()) continue;

    const segments = await db.turfHoldSegment.findMany({
      where: {
        holderId: roundPlayerId,
        startedAt: { lt: asOf },
        OR: [{ endedAt: null }, { endedAt: { gt: attempt.acceptedAt } }],
      },
      select: { startedAt: true, endedAt: true },
    });
    const heldHours = turfHoldHoursForSegments(segments, attempt.acceptedAt, asOf);
    const prior = progressMap(attempt.objectiveProgress);
    const next = { ...prior };
    const newlyCompleted: string[] = [];

    for (const objective of definition.objectives.filter((item) => item.kind === 'TURF_HOLD_HOURS')) {
      const before = prior[objective.id];
      const current = Math.min(objective.target, heldHours);
      const completed = current >= objective.target;
      next[objective.id] = {
        current,
        target: objective.target,
        completed,
      };
      if (before?.completed !== true && completed) newlyCompleted.push(objective.id);
    }

    const completed = definition.objectives.every((objective) => next[objective.id]?.completed === true);
    const becameReady = attempt.status === 'ACTIVE' && completed;
    const becameUnready = attempt.status === 'READY_TO_TURN_IN' && !completed;
    const changed = JSON.stringify(prior) !== JSON.stringify(next) || becameReady || becameUnready;
    if (!changed) continue;

    await db.playerQuest.update({
      where: { id: attempt.id },
      data: {
        objectiveProgress: inputJson(next),
        ...(becameReady
          ? { status: 'READY_TO_TURN_IN', completedAt: now }
          : becameUnready
            ? { status: 'ACTIVE', completedAt: null }
            : {}),
      },
    });

    for (const objectiveId of newlyCompleted) {
      const objective = definition.objectives.find((item) => item.id === objectiveId)!;
      await createPlayerActivity(db, roundPlayerId, 'QUEST_OBJECTIVE_COMPLETE', inputJson({
        questKey: definition.key,
        title: definition.title,
        contactKey: definition.contactKey,
        objectiveId,
        objective: objective.description,
        bonus: false,
      }));
    }
    if (becameReady) {
      await createPlayerActivity(db, roundPlayerId, 'QUEST_READY', inputJson({
        questKey: definition.key,
        title: definition.title,
        contactKey: definition.contactKey,
      }));
    }
  }
}

/**
 * Materialize this week's selected attempts, expire the prior window, and
 * reconcile derived turf-hour progress from authoritative hold history.
 */
export async function syncWeeklyContractAttempts(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  now: Date,
): Promise<{ keys: string[]; resetAt: Date | null }> {
  const definitions = pool(ruleset);
  if (definitions.length === 0) return { keys: [], resetAt: null };

  const { startsAt, endsAt } = weeklyContractWindow(now, ruleset);
  const definitionRows = await db.questDefinition.findMany({
    where: {
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      key: { in: definitions.map((definition) => definition.key) },
      isEnabled: true,
    },
    select: { id: true, key: true },
  });
  const enabledKeys = new Set(definitionRows.map((row) => row.key));
  const keys = selectedWeeklyContractKeys(ruleset, now, enabledKeys);
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
          weeklyWindowStart: startsAt.toISOString(),
          weeklyWindowEnd: endsAt.toISOString(),
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

  await syncDerivedTurfProgress(db, roundPlayerId, ruleset, definitionRows, now);
  return { keys, resetAt: endsAt };
}
