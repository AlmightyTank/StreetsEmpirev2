import type { Prisma } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type {
  QuestDefinition,
  QuestObjectiveDefinition,
  QuestProgressMap,
  Ruleset,
} from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

interface CommunityEventConfig {
  startFraction: number;
  endFraction: number;
  contributionTarget: number;
  contributionLabel: string;
}

export interface CommunityEventState {
  roundId: string;
  windowStart: string;
  windowEnd: string;
  contributionObjectiveId: string;
  contributionTarget: number;
  contributionLabel: string;
}

export interface CommunityEventSnapshot {
  state: CommunityEventState;
  progress: QuestProgressMap;
  contributionCurrent: number;
  contributionTarget: number;
  contributionLabel: string;
  contributionFormat: 'NUMBER' | 'CURRENCY';
  sharedCompleted: boolean;
}

export interface CommunityEventReadinessTransition {
  id: string;
  key: string;
  title: string;
  contactKey: string | null;
}

type CommunityEventQuestRow = {
  id: string;
  roundPlayerId: string;
  questDefinitionId: string;
  objectiveProgress: Prisma.JsonValue;
  rewardState: Prisma.JsonValue;
  questDefinition: {
    key: string;
    title: string;
    contactKey: string | null;
    objectives: Prisma.JsonValue;
  };
};

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function progress(value: Prisma.JsonValue): QuestProgressMap {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as unknown as QuestProgressMap
    : {};
}

function objectives(value: Prisma.JsonValue): QuestObjectiveDefinition[] {
  return Array.isArray(value) ? value as unknown as QuestObjectiveDefinition[] : [];
}

function eventDefinitions(ruleset: Ruleset): QuestDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {}).filter(isCommunityEventDefinition);
}

function config(definition: QuestDefinition): CommunityEventConfig | null {
  const startFraction = definition.availability.roundStartFraction;
  const endFraction = definition.availability.roundEndFraction;
  const contributionTarget = definition.availability.personalContributionTarget;
  const contributionLabel = definition.availability.contributionLabel;
  if (
    typeof startFraction !== 'number'
    || typeof endFraction !== 'number'
    || typeof contributionTarget !== 'number'
    || typeof contributionLabel !== 'string'
    || startFraction < 0
    || endFraction > 1
    || endFraction <= startFraction
    || contributionTarget <= 0
    || definition.objectives.length !== 1
  ) return null;
  return { startFraction, endFraction, contributionTarget, contributionLabel };
}

export function isCommunityEventDefinition(definition: QuestDefinition | undefined): boolean {
  return Boolean(
    definition?.type === 'EVENT'
    && definition.repeatability === 'ONCE'
    && definition.availability.communityEvent === true,
  );
}

export function communityEventWindow(
  round: { startsAt: Date; endsAt: Date },
  definition: QuestDefinition,
): { startsAt: Date; endsAt: Date } | null {
  const parsed = config(definition);
  if (!parsed) return null;
  const durationMs = round.endsAt.getTime() - round.startsAt.getTime();
  if (durationMs <= 0) return null;
  return {
    startsAt: new Date(round.startsAt.getTime() + Math.floor(durationMs * parsed.startFraction)),
    endsAt: parsed.endFraction === 1
      ? new Date(round.endsAt)
      : new Date(round.startsAt.getTime() + Math.floor(durationMs * parsed.endFraction)),
  };
}

export function communityEventState(value: unknown): CommunityEventState | null {
  const outer = record(value);
  const raw = record(outer?.communityEvent);
  if (
    !raw
    || typeof raw.roundId !== 'string'
    || typeof raw.windowStart !== 'string'
    || typeof raw.windowEnd !== 'string'
    || typeof raw.contributionObjectiveId !== 'string'
    || typeof raw.contributionTarget !== 'number'
    || !Number.isFinite(raw.contributionTarget)
    || raw.contributionTarget <= 0
    || typeof raw.contributionLabel !== 'string'
  ) return null;
  return {
    roundId: raw.roundId,
    windowStart: raw.windowStart,
    windowEnd: raw.windowEnd,
    contributionObjectiveId: raw.contributionObjectiveId,
    contributionTarget: raw.contributionTarget,
    contributionLabel: raw.contributionLabel,
  };
}

function sameWindow(left: CommunityEventState | null, right: CommunityEventState): boolean {
  return Boolean(
    left
    && left.roundId === right.roundId
    && left.windowStart === right.windowStart
    && left.windowEnd === right.windowEnd,
  );
}

async function ensureCommunityEventDefinitions(db: Db, ruleset: Ruleset): Promise<void> {
  const definitions = eventDefinitions(ruleset);
  if (!definitions.length) return;
  const existing = await db.questDefinition.findMany({
    where: {
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      key: { in: definitions.map((definition) => definition.key) },
    },
    select: { key: true },
  });
  const known = new Set(existing.map((row) => row.key));
  for (const definition of definitions.filter((candidate) => !known.has(candidate.key))) {
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

async function syncLoadedPlayer(
  db: Db,
  roundPlayerId: string,
  round: {
    id: string;
    startsAt: Date;
    endsAt: Date;
  },
  ruleset: Ruleset,
  now: Date,
): Promise<void> {
  const definitions = eventDefinitions(ruleset);
  if (!definitions.length) return;
  await ensureCommunityEventDefinitions(db, ruleset);

  const definitionRows = await db.questDefinition.findMany({
    where: {
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      key: { in: definitions.map((definition) => definition.key) },
      isEnabled: true,
    },
    select: { id: true, key: true },
  });
  if (!definitionRows.length) return;

  const existing = await db.playerQuest.findMany({
    where: {
      roundPlayerId,
      questDefinitionId: { in: definitionRows.map((row) => row.id) },
    },
    select: {
      id: true,
      questDefinitionId: true,
      attempt: true,
      status: true,
      rewardState: true,
    },
  });

  for (const definitionRow of definitionRows) {
    const definition = ruleset.questDefinitions?.[definitionRow.key];
    if (!isCommunityEventDefinition(definition)) continue;
    const parsed = config(definition);
    const window = communityEventWindow(round, definition);
    if (!parsed || !window) continue;

    const matches = existing
      .filter((row) => row.questDefinitionId === definitionRow.id)
      .sort((left, right) => right.attempt - left.attempt);
    const current = matches[0];
    const state: CommunityEventState = {
      roundId: round.id,
      windowStart: window.startsAt.toISOString(),
      windowEnd: window.endsAt.toISOString(),
      contributionObjectiveId: definition.objectives[0]!.id,
      contributionTarget: parsed.contributionTarget,
      contributionLabel: parsed.contributionLabel,
    };

    if (now.getTime() >= window.endsAt.getTime()) {
      if (current && ['LOCKED', 'AVAILABLE', 'ACTIVE', 'READY_TO_TURN_IN'].includes(current.status)) {
        await db.playerQuest.update({
          where: { id: current.id },
          data: { status: 'EXPIRED', isTracked: false },
        });
      }
      continue;
    }
    if (now.getTime() < window.startsAt.getTime()) continue;

    if (current && sameWindow(communityEventState(current.rewardState), state)) {
      if (['LOCKED', 'AVAILABLE', 'EXPIRED'].includes(current.status)) {
        await db.playerQuest.update({
          where: { id: current.id },
          data: {
            status: 'ACTIVE',
            acceptedAt: now,
            completedAt: null,
            expiresAt: window.endsAt,
            rewardState: inputJson({ communityEvent: state }),
          },
        });
      }
      continue;
    }

    const created = await db.playerQuest.create({
      data: {
        roundPlayerId,
        questDefinitionId: definitionRow.id,
        attempt: matches.reduce((max, row) => Math.max(max, row.attempt), 0) + 1,
        status: 'ACTIVE',
        acceptedAt: now,
        expiresAt: window.endsAt,
        rewardState: inputJson({ communityEvent: state }),
      },
      select: {
        id: true,
        questDefinitionId: true,
        attempt: true,
        status: true,
        rewardState: true,
      },
    });
    existing.push(created);
  }
}

export async function syncCommunityEventAttempts(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  now = new Date(),
): Promise<void> {
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: {
      round: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
  });
  if (!player) return;
  await syncLoadedPlayer(db, roundPlayerId, player.round, ruleset, now);
}

/**
 * Activity emitters do not already have the pinned ruleset, so this small
 * wrapper resolves it before materializing the current event attempt.
 */
export async function syncCommunityEventAttemptsForPlayer(
  db: Db,
  roundPlayerId: string,
  now = new Date(),
): Promise<Ruleset | null> {
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: {
      round: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          rulesetId: true,
          rulesetVersion: true,
        },
      },
    },
  });
  if (!player) return null;
  const ruleset = loadRulesetForRound(player.round);
  if (!eventDefinitions(ruleset).length) return null;
  await syncLoadedPlayer(db, roundPlayerId, player.round, ruleset, now);
  return ruleset;
}

export async function communityEventSnapshot(
  db: Db,
  row: CommunityEventQuestRow,
): Promise<CommunityEventSnapshot | null> {
  const state = communityEventState(row.rewardState);
  if (!state) return null;
  const required = objectives(row.questDefinition.objectives);
  if (!required.length) return null;

  const participantRows = await db.playerQuest.findMany({
    where: {
      questDefinitionId: row.questDefinitionId,
      roundPlayer: { roundId: state.roundId },
    },
    select: {
      objectiveProgress: true,
      rewardState: true,
    },
  });
  const matching = participantRows.filter((candidate) =>
    sameWindow(communityEventState(candidate.rewardState), state)
  );

  const aggregate: Record<string, {
    current: number;
    target: number;
    completed: boolean;
    values?: string[];
  }> = {};
  for (const objective of required) {
    if (objective.kind === 'UNIQUE_VALUES') {
      const values = new Set<string>();
      for (const candidate of matching) {
        for (const value of progress(candidate.objectiveProgress)[objective.id]?.values ?? []) values.add(value);
      }
      const all = [...values];
      const current = Math.min(objective.target, all.length);
      aggregate[objective.id] = {
        current,
        target: objective.target,
        completed: current >= objective.target,
        values: all,
      };
      continue;
    }

    const total = matching.reduce(
      (sum, candidate) => sum + (progress(candidate.objectiveProgress)[objective.id]?.current ?? 0),
      0,
    );
    const current = Math.min(objective.target, total);
    aggregate[objective.id] = {
      current,
      target: objective.target,
      completed: current >= objective.target,
    };
  }

  const contributionObjective = required.find((objective) => objective.id === state.contributionObjectiveId);
  if (!contributionObjective) return null;
  const contributionCurrent = progress(row.objectiveProgress)[state.contributionObjectiveId]?.current ?? 0;

  return {
    state,
    progress: aggregate,
    contributionCurrent,
    contributionTarget: state.contributionTarget,
    contributionLabel: state.contributionLabel,
    contributionFormat: contributionObjective.params?.display === 'CURRENCY' ? 'CURRENCY' : 'NUMBER',
    sharedCompleted: required.every((objective) => aggregate[objective.id]?.completed === true),
  };
}

export async function refreshCommunityEventReadinessForPlayer(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  now = new Date(),
): Promise<{ readied: CommunityEventReadinessTransition[]; reopened: CommunityEventReadinessTransition[] }> {
  const rows = await db.playerQuest.findMany({
    where: {
      roundPlayerId,
      status: { in: ['ACTIVE', 'READY_TO_TURN_IN'] },
      questDefinition: {
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        type: 'EVENT',
      },
    },
    include: { questDefinition: true },
  });
  const readied: CommunityEventReadinessTransition[] = [];
  const reopened: CommunityEventReadinessTransition[] = [];

  for (const row of rows) {
    const definition = ruleset.questDefinitions?.[row.questDefinition.key];
    if (!isCommunityEventDefinition(definition)) continue;
    const state = communityEventState(row.rewardState);
    if (!state) continue;
    const endsAt = new Date(state.windowEnd);
    if (!Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= now.getTime()) continue;

    const snapshot = await communityEventSnapshot(db, row);
    if (!snapshot) continue;
    const eligible = snapshot.contributionCurrent >= snapshot.contributionTarget;
    const shouldBeReady = snapshot.sharedCompleted && eligible;
    const transition = {
      id: row.id,
      key: row.questDefinition.key,
      title: row.questDefinition.title,
      contactKey: row.questDefinition.contactKey,
    };

    if (shouldBeReady && row.status === 'ACTIVE') {
      await db.playerQuest.update({
        where: { id: row.id },
        data: { status: 'READY_TO_TURN_IN', completedAt: row.completedAt ?? now },
      });
      readied.push(transition);
    } else if (!shouldBeReady && row.status === 'READY_TO_TURN_IN') {
      await db.playerQuest.update({
        where: { id: row.id },
        data: { status: 'ACTIVE', completedAt: null },
      });
      reopened.push(transition);
    }
  }

  return { readied, reopened };
}

export async function assertCommunityEventClaim(
  db: Db,
  row: CommunityEventQuestRow,
): Promise<void> {
  const snapshot = await communityEventSnapshot(db, row);
  if (!snapshot?.sharedCompleted) {
    throw AppError.conflict('COMMUNITY_EVENT_INCOMPLETE', 'The community has not finished this event yet.');
  }
  if (snapshot.contributionCurrent < snapshot.contributionTarget) {
    throw AppError.conflict(
      'COMMUNITY_EVENT_PARTICIPATION_REQUIRED',
      'Contribute more to this event before collecting the community reward.',
    );
  }
}
