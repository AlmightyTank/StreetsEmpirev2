import type { Prisma } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { activeRoundEventTime, applyQuestProgress } from '@streets/rulesets';
import type {
  QuestDefinition,
  QuestObjectiveDefinition,
  QuestProgressMap,
  QuestProgressEvent,
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

function usesFirstClassCommunityEvents(ruleset: Ruleset): boolean {
  return ruleset.meta.eventSystem?.communityEvents === 'FIRST_CLASS';
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

export function isCommunityEventDefinition(
  definition: QuestDefinition | undefined,
): definition is QuestDefinition & { availability: QuestDefinition['availability'] & { communityEvent: true } } {
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

export function activeCommunityEventWindow(
  round: { startsAt: Date; endsAt: Date; pausedMinutesTotal: number },
  definition: QuestDefinition,
): { startsAt: Date; endsAt: Date } | null {
  const activeEndsAt = new Date(round.endsAt.getTime() - Math.max(0, round.pausedMinutesTotal) * 60_000);
  return communityEventWindow({ startsAt: round.startsAt, endsAt: activeEndsAt }, definition);
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
    pausedAt: Date | null;
    pausedMinutesTotal: number;
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

  // Historical pinned rulesets keep the original quest scheduler and writer.
  if (!usesFirstClassCommunityEvents(ruleset)) return;

  // First-class occurrence and participation records own the event calendar.
  // PlayerQuest remains a read adapter until the Events center replaces the
  // legacy quest card contract.
  await Promise.all(definitions.map(async (definition) => {
    const eventDefinition = await db.gameEventDefinition.upsert({
      where: {
        rulesetId_rulesetVersion_key: {
          rulesetId: ruleset.meta.id,
          rulesetVersion: ruleset.meta.version,
          key: definition.key,
        },
      },
      create: {
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        key: definition.key,
        type: 'COMMUNITY',
        scope: 'ROUND',
        title: definition.title,
        description: definition.description,
        schedule: inputJson({
          kind: 'ROUND_FRACTION',
          startFraction: definition.availability.roundStartFraction,
          endFraction: definition.availability.roundEndFraction,
        }),
        objectives: inputJson(definition.objectives),
        rewards: inputJson(definition.rewards),
        config: inputJson({
          personalContributionTarget: definition.availability.personalContributionTarget,
          contributionLabel: definition.availability.contributionLabel,
        }),
        sourceKind: 'QUEST_DEFINITION',
        sourceKey: definition.key,
      },
      update: {},
      select: { id: true },
    });
    const window = activeCommunityEventWindow(round, definition);
    if (!window) return null;
    const occurrence = await db.gameEventOccurrence.upsert({
      where: {
        definitionId_occurrenceKey: {
          definitionId: eventDefinition.id,
          occurrenceKey: round.id,
        },
      },
      create: {
        definitionId: eventDefinition.id,
        roundId: round.id,
        occurrenceKey: round.id,
        status: 'SCHEDULED',
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        schedule: inputJson({ kind: 'ROUND_FRACTION' }),
        config: inputJson({ objectives: definition.objectives, rewards: definition.rewards }),
      },
      update: {},
      select: { id: true, status: true, startsAt: true, endsAt: true },
    });
    const eventTime = activeRoundEventTime(round, now);
    const inWindow = eventTime >= window.startsAt && eventTime < window.endsAt;
    const expired = eventTime >= window.endsAt;
    if (inWindow && occurrence.status === 'SCHEDULED') {
      await db.gameEventOccurrence.update({
        where: { id: occurrence.id },
        data: { status: 'ACTIVE', activatedAt: now },
      });
      await db.gameEventHistory.createMany({
        data: [{ occurrenceId: occurrence.id, action: 'ACTIVATED', dedupeKey: `community:${occurrence.id}:activated`, happenedAt: now }],
        skipDuplicates: true,
      });
    } else if (expired && ['SCHEDULED', 'ACTIVE'].includes(occurrence.status)) {
      await db.gameEventOccurrence.update({
        where: { id: occurrence.id },
        data: { status: 'EXPIRED', expiredAt: now },
      });
      await db.gameEventHistory.createMany({
        data: [{ occurrenceId: occurrence.id, action: 'EXPIRED', dedupeKey: `community:${occurrence.id}:expired`, happenedAt: now }],
        skipDuplicates: true,
      });
    }
    const participation = await db.gameEventParticipation.upsert({
      where: { occurrenceId_roundPlayerId: { occurrenceId: occurrence.id, roundPlayerId } },
      create: {
        occurrenceId: occurrence.id,
        roundPlayerId,
        status: expired ? 'EXPIRED' : inWindow ? 'ACTIVE' : 'OFFERED',
        acceptedAt: inWindow ? now : null,
        expiredAt: expired ? now : null,
      },
      update: {},
      select: { id: true },
    });
    if (expired) {
      await db.gameEventParticipation.updateMany({
        where: { id: participation.id, status: { in: ['OFFERED', 'ACTIVE', 'COMPLETED'] } },
        data: { status: 'EXPIRED', expiredAt: now },
      });
    } else if (inWindow) {
      await db.gameEventParticipation.updateMany({
        where: { id: participation.id, status: 'OFFERED' },
        data: { status: 'ACTIVE', acceptedAt: now },
      });
    }
  }));

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
      objectiveProgress: true,
      claimedAt: true,
    },
  });

  const eventTime = activeRoundEventTime(round, now);

  for (const definitionRow of definitionRows) {
    const definition = ruleset.questDefinitions?.[definitionRow.key];
    if (!isCommunityEventDefinition(definition)) continue;
    const parsed = config(definition);
    const window = activeCommunityEventWindow(round, definition);
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

    if (eventTime.getTime() >= window.endsAt.getTime()) {
      if (current && ['LOCKED', 'AVAILABLE', 'ACTIVE', 'READY_TO_TURN_IN'].includes(current.status)) {
        await db.playerQuest.update({
          where: { id: current.id },
          data: { status: 'EXPIRED', isTracked: false },
        });
      }
      continue;
    }
    if (eventTime.getTime() < window.startsAt.getTime()) continue;

    if (current && sameWindow(communityEventState(current.rewardState), state)) {
      if (['LOCKED', 'AVAILABLE', 'EXPIRED'].includes(current.status)) {
        await db.playerQuest.update({
          where: { id: current.id },
          data: {
            status: 'ACTIVE',
            acceptedAt: now,
            completedAt: null,
            expiresAt: usesFirstClassCommunityEvents(ruleset) ? null : window.endsAt,
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
        expiresAt: usesFirstClassCommunityEvents(ruleset) ? null : window.endsAt,
        rewardState: inputJson({ communityEvent: state }),
      },
      select: {
        id: true,
        questDefinitionId: true,
        attempt: true,
        status: true,
        rewardState: true,
        objectiveProgress: true,
        claimedAt: true,
      },
    });
    existing.push(created);
  }

  // Keep the old quest card rows as a projection while event participation is
  // the durable record used for shared aggregation. This also carries any
  // progress and claims that existed before the event tables were populated.
  for (const definitionRow of definitionRows) {
    const current = existing
      .filter((row) => row.questDefinitionId === definitionRow.id)
      .sort((left, right) => right.attempt - left.attempt)[0];
    if (!current) continue;
    const definition = ruleset.questDefinitions?.[definitionRow.key];
    if (!isCommunityEventDefinition(definition)) continue;
    const occurrence = await db.gameEventOccurrence.findFirst({
      where: {
        roundId: round.id,
        occurrenceKey: round.id,
        definition: {
          rulesetId: ruleset.meta.id,
          rulesetVersion: ruleset.meta.version,
          key: definition.key,
        },
      },
      select: { id: true },
    });
    if (!occurrence) continue;
    const participationStatus = current.claimedAt || current.status === 'COMPLETED'
      ? 'CLAIMED'
      : current.status === 'EXPIRED' ? 'EXPIRED'
        : current.status === 'READY_TO_TURN_IN' ? 'COMPLETED'
          : 'ACTIVE';
    if (!usesFirstClassCommunityEvents(ruleset)) {
      await db.gameEventParticipation.updateMany({
        where: { occurrenceId: occurrence.id, roundPlayerId },
        data: {
          status: participationStatus,
          progress: inputJson(progress(current.objectiveProgress)),
          claimedAt: current.claimedAt,
          completedAt: current.status === 'READY_TO_TURN_IN' || current.status === 'COMPLETED' ? current.claimedAt ?? now : null,
        },
      });
    }
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
          pausedAt: true,
          pausedMinutesTotal: true,
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
          pausedAt: true,
          pausedMinutesTotal: true,
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

  const participantRows = await db.gameEventParticipation.findMany({
    where: {
      occurrence: {
        roundId: state.roundId,
        occurrenceKey: state.roundId,
        definition: {
          sourceKind: 'QUEST_DEFINITION',
          sourceKey: row.questDefinition.key,
        },
      },
    },
    select: {
      roundPlayerId: true,
      progress: true,
    },
  });
  if (participantRows.length === 0) {
    // Read compatibility for historical rounds, which remain on quest-owned
    // progress and are never moved to the new event writer.
    const legacyRows = await db.playerQuest.findMany({
      where: { questDefinitionId: row.questDefinitionId, roundPlayer: { roundId: state.roundId } },
      select: { roundPlayerId: true, objectiveProgress: true, rewardState: true },
    });
    const matching = legacyRows.filter((candidate) => sameWindow(communityEventState(candidate.rewardState), state));
    const legacyParticipants = matching.map((candidate) => ({
      roundPlayerId: candidate.roundPlayerId,
      progress: candidate.objectiveProgress,
    }));
    return communityEventSnapshotFromParticipants(row, state, required, legacyParticipants);
  }

  return communityEventSnapshotFromParticipants(row, state, required, participantRows);
}

/** One participation read for every community event on the board. Rows with no participants keep the legacy quest-owned fallback. */
export async function communityEventSnapshots(
  db: Db,
  rows: CommunityEventQuestRow[],
): Promise<Map<string, CommunityEventSnapshot>> {
  const snapshots = new Map<string, CommunityEventSnapshot>();
  const prepared: Array<{ row: CommunityEventQuestRow; state: CommunityEventState; required: QuestObjectiveDefinition[] }> = [];
  for (const row of rows) {
    const state = communityEventState(row.rewardState);
    const required = objectives(row.questDefinition.objectives);
    if (!state || !required.length) continue;
    prepared.push({ row, state, required });
  }
  if (!prepared.length) return snapshots;

  const participantRows = await db.gameEventParticipation.findMany({
    where: {
      occurrence: {
        roundId: { in: [...new Set(prepared.map((item) => item.state.roundId))] },
        definition: {
          sourceKind: 'QUEST_DEFINITION',
          sourceKey: { in: [...new Set(prepared.map((item) => item.row.questDefinition.key))] },
        },
      },
    },
    select: {
      roundPlayerId: true,
      progress: true,
      occurrence: {
        select: {
          roundId: true,
          occurrenceKey: true,
          definition: { select: { sourceKey: true } },
        },
      },
    },
  });

  for (const item of prepared) {
    const matches = participantRows.filter((participant) =>
      participant.occurrence.definition.sourceKey === item.row.questDefinition.key
      && participant.occurrence.roundId === item.state.roundId
      && participant.occurrence.occurrenceKey === item.state.roundId);
    if (matches.length === 0) {
      const legacy = await communityEventSnapshot(db, item.row);
      if (legacy) snapshots.set(item.row.id, legacy);
      continue;
    }
    const snapshot = communityEventSnapshotFromParticipants(
      item.row,
      item.state,
      item.required,
      matches.map((participant) => ({ roundPlayerId: participant.roundPlayerId, progress: participant.progress })),
    );
    if (snapshot) snapshots.set(item.row.id, snapshot);
  }
  return snapshots;
}

function communityEventSnapshotFromParticipants(
  row: CommunityEventQuestRow,
  state: CommunityEventState,
  required: QuestObjectiveDefinition[],
  participantRows: Array<{ roundPlayerId: string; progress: Prisma.JsonValue }>,
): CommunityEventSnapshot | null {

  const aggregate: Record<string, {
    current: number;
    target: number;
    completed: boolean;
    values?: string[];
  }> = {};
  for (const objective of required) {
    if (objective.kind === 'UNIQUE_VALUES') {
      const values = new Set<string>();
      for (const candidate of participantRows) {
        for (const value of progress(candidate.progress)[objective.id]?.values ?? []) values.add(value);
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

    const total = participantRows.reduce(
      (sum, candidate) => sum + (progress(candidate.progress)[objective.id]?.current ?? 0),
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
  const contributionCurrent = progress(
    participantRows.find((candidate) => candidate.roundPlayerId === row.roundPlayerId)?.progress ?? {},
  )[state.contributionObjectiveId]?.current ?? 0;

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

/** First-class, idempotent writer: one receipt and one participation row per player/action. */
export async function recordFirstClassCommunityEventProgress(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  signal: { sourceKey: string; event: QuestProgressEvent; at: Date },
): Promise<{ matched: number; advanced: number; duplicate: number }> {
  if (!usesFirstClassCommunityEvents(ruleset)) return { matched: 0, advanced: 0, duplicate: 0 };
  const definitions = eventDefinitions(ruleset);
  if (!definitions.length) return { matched: 0, advanced: 0, duplicate: 0 };
  let matched = 0;
  let advanced = 0;
  let duplicate = 0;
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { round: { select: { pausedAt: true, pausedMinutesTotal: true } } },
  });
  const eventTime = player ? activeRoundEventTime(player.round, signal.at) : signal.at;
  for (const definition of definitions) {
    const participation = await db.gameEventParticipation.findFirst({
      where: {
        roundPlayerId,
        status: 'ACTIVE',
        occurrence: {
          status: 'ACTIVE',
          definition: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, key: definition.key },
        },
      },
      include: { occurrence: { select: { id: true } } },
    });
    if (!participation) continue;
    const occurrence = await db.gameEventOccurrence.findUnique({
      where: { id: participation.occurrenceId },
      select: { startsAt: true, endsAt: true },
    });
    if (!occurrence?.startsAt || !occurrence.endsAt || eventTime < occurrence.startsAt || eventTime >= occurrence.endsAt) continue;
    await db.$queryRaw`SELECT id FROM "GameEventParticipation" WHERE id = ${participation.id} FOR UPDATE`;
    const prior = await db.gameEventProgressReceipt.findUnique({
      where: { participationId_sourceKey: { participationId: participation.id, sourceKey: signal.sourceKey } },
      select: { id: true },
    });
    if (prior) {
      duplicate += 1;
      continue;
    }
    const applied = applyQuestProgress(
      definition.objectives,
      progress(participation.progress),
      signal.event,
    );
    if (!applied.matched) continue;
    matched += 1;
    await db.gameEventProgressReceipt.create({
      data: {
        participationId: participation.id,
        sourceKey: signal.sourceKey,
        objectiveKey: Object.keys(applied.deltas).join(',') || null,
        payload: inputJson({ eventType: signal.event.type, deltas: applied.deltas }),
        recordedAt: signal.at,
      },
    });
    if (applied.changed) {
      await db.gameEventParticipation.update({
        where: { id: participation.id },
        data: { progress: inputJson(applied.progress) },
      });
      advanced += 1;
    }
  }
  return { matched, advanced, duplicate };
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
    const round = await db.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: { round: { select: { pausedAt: true, pausedMinutesTotal: true } } },
    });
    const eventTime = round ? activeRoundEventTime(round.round, now) : now;
    const endsAt = new Date(state.windowEnd);
    if (!Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= eventTime.getTime()) continue;

    const occurrence = await db.gameEventOccurrence.findFirst({
      where: {
        roundId: state.roundId,
        occurrenceKey: state.roundId,
        definition: { sourceKind: 'QUEST_DEFINITION', sourceKey: row.questDefinition.key },
      },
      select: { id: true },
    });
    if (occurrence && !usesFirstClassCommunityEvents(ruleset)) {
      await db.gameEventParticipation.updateMany({
        where: { occurrenceId: occurrence.id, roundPlayerId },
        data: { progress: inputJson(progress(row.objectiveProgress)) },
      });
    }

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
    if (occurrence && usesFirstClassCommunityEvents(ruleset)) {
      await db.gameEventParticipation.updateMany({
        where: { occurrenceId: occurrence.id, roundPlayerId },
        data: { status: shouldBeReady ? 'COMPLETED' : 'ACTIVE', completedAt: shouldBeReady ? now : null },
      });
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

export async function recordCommunityEventClaim(
  db: Db,
  row: CommunityEventQuestRow,
  rewards: unknown,
  now: Date,
): Promise<void> {
  const state = communityEventState(row.rewardState);
  if (!state) return;
  const occurrence = await db.gameEventOccurrence.findFirst({
    where: {
      roundId: state.roundId,
      occurrenceKey: state.roundId,
      definition: { sourceKind: 'QUEST_DEFINITION', sourceKey: row.questDefinition.key },
    },
    select: { id: true },
  });
  if (!occurrence) return;
  const participation = await db.gameEventParticipation.findUnique({
    where: { occurrenceId_roundPlayerId: { occurrenceId: occurrence.id, roundPlayerId: row.roundPlayerId } },
    select: { id: true },
  });
  if (!participation) return;
  await db.gameEventRewardClaim.createMany({
    data: [{
      participationId: participation.id,
      rewardKey: row.questDefinition.key,
      idempotencyKey: `community:${participation.id}:reward`,
      reward: inputJson(rewards),
      claimedAt: now,
    }],
    skipDuplicates: true,
  });
  await db.gameEventParticipation.update({
    where: { id: participation.id },
    data: { status: 'CLAIMED', claimedAt: now },
  });
  await db.gameEventHistory.createMany({
    data: [{
      occurrenceId: occurrence.id,
      participationId: participation.id,
      action: 'CLAIMED',
      dedupeKey: `community:${participation.id}:claimed`,
      payload: inputJson({ rewardKey: row.questDefinition.key }),
      happenedAt: now,
    }],
    skipDuplicates: true,
  });
}
