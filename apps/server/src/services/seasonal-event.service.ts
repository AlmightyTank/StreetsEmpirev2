import type { Prisma } from '@prisma/client';
import { applyQuestProgress } from '@streets/rulesets';
import type { QuestDefinition, QuestProgressEvent, QuestProgressMap, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

type SeasonalDefinition = QuestDefinition & {
  availability: QuestDefinition['availability'] & {
    seasonalEvent: { eventKey: string; startsAt: string; endsAt: string };
  };
};

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function progress(value: unknown): QuestProgressMap {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as QuestProgressMap
    : {};
}

function seasonalDefinitions(ruleset: Ruleset): SeasonalDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {}).filter((definition): definition is SeasonalDefinition =>
    definition.type === 'EVENT' && Boolean(definition.availability.seasonalEvent),
  );
}

export function usesFirstClassSeasonalEvents(ruleset: Ruleset): boolean {
  return ruleset.meta.eventSystem?.seasonalEvents === 'FIRST_CLASS';
}

export function isSeasonalEventDefinition(definition: QuestDefinition | undefined): definition is SeasonalDefinition {
  return Boolean(definition?.type === 'EVENT' && definition.availability.seasonalEvent);
}

export function seasonalWindow(definition: SeasonalDefinition): { startsAt: Date; endsAt: Date } | null {
  const startsAt = new Date(definition.availability.seasonalEvent.startsAt);
  const endsAt = new Date(definition.availability.seasonalEvent.endsAt);
  return Number.isFinite(startsAt.getTime()) && Number.isFinite(endsAt.getTime()) && startsAt < endsAt
    ? { startsAt, endsAt }
    : null;
}

/** Creates the calendar occurrence and per-player offer. Accepted jobs keep their own 72h expiry. */
export async function syncSeasonalEventAttempts(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  now = new Date(),
): Promise<void> {
  if (!usesFirstClassSeasonalEvents(ruleset)) return;
  for (const definition of seasonalDefinitions(ruleset)) {
    const window = seasonalWindow(definition);
    if (!window) continue;
    const seasonal = definition.availability.seasonalEvent;
    const eventDefinition = await db.gameEventDefinition.upsert({
      where: { rulesetId_rulesetVersion_key: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, key: seasonal.eventKey } },
      create: {
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        key: seasonal.eventKey,
        type: 'SEASONAL',
        scope: 'PLAYER',
        title: definition.title,
        description: definition.description,
        schedule: inputJson({ kind: 'UTC_WINDOW', eventKey: seasonal.eventKey, startsAt: seasonal.startsAt, endsAt: seasonal.endsAt }),
        objectives: inputJson(definition.objectives),
        rewards: inputJson(definition.rewards),
        config: inputJson({ bonusObjectives: definition.bonusObjectives, expiresAfterMinutes: definition.expiresAfterMinutes }),
        sourceKind: 'QUEST_DEFINITION',
        sourceKey: definition.key,
      },
      update: {},
      select: { id: true },
    });
    const occurrenceKey = { definitionId: eventDefinition.id, occurrenceKey: seasonal.eventKey };
    const priorOccurrence = await db.gameEventOccurrence.findUnique({
      where: { definitionId_occurrenceKey: occurrenceKey },
      select: { id: true, status: true },
    });
    const occurrence = await db.gameEventOccurrence.upsert({
      where: { definitionId_occurrenceKey: occurrenceKey },
      create: {
        definitionId: eventDefinition.id,
        occurrenceKey: seasonal.eventKey,
        scopeKey: 'calendar',
        status: now >= window.startsAt && now < window.endsAt ? 'ACTIVE' : now >= window.endsAt ? 'EXPIRED' : 'SCHEDULED',
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        schedule: inputJson({ kind: 'UTC_WINDOW' }),
        config: inputJson({ objectives: definition.objectives, bonusObjectives: definition.bonusObjectives, rewards: definition.rewards }),
        ...(now >= window.startsAt && now < window.endsAt ? { activatedAt: now } : {}),
        ...(now >= window.endsAt ? { expiredAt: now } : {}),
      },
      update: {},
      select: { id: true },
    });
    const inWindow = now >= window.startsAt && now < window.endsAt;
    if ((priorOccurrence?.status === 'SCHEDULED' && inWindow) || (!priorOccurrence && inWindow)) {
      if (priorOccurrence) {
        await db.gameEventOccurrence.updateMany({ where: { id: occurrence.id, status: 'SCHEDULED' }, data: { status: 'ACTIVE', activatedAt: now } });
      }
      await db.gameEventHistory.createMany({
        data: [{ occurrenceId: occurrence.id, action: 'ACTIVATED', dedupeKey: `seasonal:${occurrence.id}:activated`, happenedAt: now }],
        skipDuplicates: true,
      });
    } else if ((priorOccurrence && ['SCHEDULED', 'ACTIVE'].includes(priorOccurrence.status) && now >= window.endsAt) || (!priorOccurrence && now >= window.endsAt)) {
      if (priorOccurrence) {
        await db.gameEventOccurrence.updateMany({ where: { id: occurrence.id, status: { in: ['SCHEDULED', 'ACTIVE'] } }, data: { status: 'EXPIRED', expiredAt: now } });
      }
      await db.gameEventHistory.createMany({
        data: [{ occurrenceId: occurrence.id, action: 'EXPIRED', dedupeKey: `seasonal:${occurrence.id}:expired`, happenedAt: now }],
        skipDuplicates: true,
      });
    }

    const questDefinition = await db.questDefinition.findUnique({
      where: { rulesetId_rulesetVersion_key: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, key: definition.key } },
      select: { id: true },
    });
    const quest = questDefinition ? await db.playerQuest.findFirst({
      where: { roundPlayerId, questDefinitionId: questDefinition.id },
      orderBy: { attempt: 'desc' },
      select: { id: true, status: true, acceptedAt: true, expiresAt: true, claimedAt: true, objectiveProgress: true, bonusProgress: true },
    }) : null;
    const expiredOffer = now >= window.endsAt && !quest?.acceptedAt;
    const lifecycleStatus = quest?.claimedAt || quest?.status === 'COMPLETED' ? 'CLAIMED'
      : quest?.status === 'EXPIRED' || (quest?.acceptedAt && quest.expiresAt && quest.expiresAt <= now) || expiredOffer ? 'EXPIRED'
        : quest?.acceptedAt ? quest.status === 'READY_TO_TURN_IN' ? 'COMPLETED' : 'ACTIVE'
          : 'OFFERED';
    const participation = await db.gameEventParticipation.upsert({
      where: { occurrenceId_roundPlayerId: { occurrenceId: occurrence.id, roundPlayerId } },
      create: {
        occurrenceId: occurrence.id,
        roundPlayerId,
        status: lifecycleStatus,
        progress: inputJson(progress(quest?.objectiveProgress)),
        state: inputJson({ questDefinitionKey: definition.key, acceptedAt: quest?.acceptedAt?.toISOString() ?? null, expiresAt: quest?.expiresAt?.toISOString() ?? null, bonusProgress: progress(quest?.bonusProgress) }),
        acceptedAt: quest?.acceptedAt ?? null,
        completedAt: lifecycleStatus === 'COMPLETED' ? now : null,
        claimedAt: quest?.claimedAt ?? null,
        expiredAt: lifecycleStatus === 'EXPIRED' ? now : null,
      },
      update: quest ? {
        ...(quest.acceptedAt ? { acceptedAt: quest.acceptedAt } : {}),
        ...(quest.claimedAt ? { claimedAt: quest.claimedAt, status: 'CLAIMED' as const } : {}),
        ...(quest.status === 'EXPIRED' || (quest.expiresAt && quest.expiresAt <= now)
          ? { status: 'EXPIRED' as const, expiredAt: now }
          : {}),
      } : {},
      select: { id: true },
    });
    if (lifecycleStatus === 'EXPIRED') {
      await db.gameEventHistory.createMany({
        data: [{ occurrenceId: occurrence.id, participationId: participation.id, action: 'EXPIRED', dedupeKey: `seasonal:${participation.id}:expired`, payload: inputJson({ eventKey: seasonal.eventKey }), happenedAt: now }],
        skipDuplicates: true,
      });
    }
    if (quest) {
      const priorReceipts = await db.gameEventProgressReceipt.count({ where: { participationId: participation.id } });
      if (priorReceipts === 0) {
        await db.gameEventParticipation.update({
          where: { id: participation.id },
          data: {
            status: lifecycleStatus,
            progress: inputJson(progress(quest.objectiveProgress)),
            state: inputJson({
              questDefinitionKey: definition.key,
              acceptedAt: quest.acceptedAt?.toISOString() ?? null,
              expiresAt: quest.expiresAt?.toISOString() ?? null,
              bonusProgress: progress(quest.bonusProgress),
            }),
            acceptedAt: quest.acceptedAt,
            claimedAt: quest.claimedAt,
            ...(lifecycleStatus === 'COMPLETED' ? { completedAt: now } : {}),
            ...(lifecycleStatus === 'EXPIRED' ? { expiredAt: now } : {}),
          },
        });
        const legacyReceipts = await db.questProgressReceipt.findMany({
          where: { playerQuestId: quest.id },
          select: { sourceKey: true, eventType: true, applied: true, createdAt: true },
        });
        if (legacyReceipts.length) {
          await db.gameEventProgressReceipt.createMany({
            data: legacyReceipts.map((receipt) => ({
              participationId: participation.id,
              sourceKey: receipt.sourceKey,
              payload: inputJson({ eventType: receipt.eventType, legacyApplied: receipt.applied }),
              recordedAt: receipt.createdAt,
            })),
            skipDuplicates: true,
          });
        }
      }
    }
    // Record an existing legacy claim as historical receipt only; it never invokes the reward grant.
    if (quest?.claimedAt) {
      await db.gameEventRewardClaim.createMany({
        data: [{
          participationId: participation.id,
          rewardKey: definition.key,
          idempotencyKey: `seasonal:${participation.id}:reward`,
          reward: inputJson(definition.rewards),
          claimedAt: quest.claimedAt,
        }],
        skipDuplicates: true,
      });
      await db.gameEventHistory.createMany({
        data: [{ occurrenceId: occurrence.id, participationId: participation.id, action: 'CLAIMED', dedupeKey: `seasonal:${participation.id}:claimed`, payload: inputJson({ eventKey: seasonal.eventKey, rewardKey: definition.key, migrated: true }), happenedAt: quest.claimedAt }],
        skipDuplicates: true,
      });
    }
  }
}

export async function acceptSeasonalEvent(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  key: string,
  acceptedAt: Date,
  expiresAt: Date | null,
): Promise<void> {
  if (!usesFirstClassSeasonalEvents(ruleset)) return;
  const definition = ruleset.questDefinitions?.[key];
  if (!isSeasonalEventDefinition(definition)) return;
  await syncSeasonalEventAttempts(db, roundPlayerId, ruleset, acceptedAt);
  const eventKey = definition.availability.seasonalEvent.eventKey;
  const participation = await db.gameEventParticipation.findFirst({
    where: { roundPlayerId, occurrence: { occurrenceKey: eventKey, definition: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version } } },
    select: { id: true, status: true },
  });
  if (!participation) throw AppError.conflict('QUEST_EVENT_CLOSED', 'That seasonal event is no longer available.');
  await db.gameEventParticipation.update({
    where: { id: participation.id },
    data: { status: 'ACTIVE', acceptedAt, state: inputJson({ questDefinitionKey: key, expiresAt: expiresAt?.toISOString() ?? null }) },
  });
  const occurrence = await db.gameEventParticipation.findUnique({ where: { id: participation.id }, select: { occurrenceId: true } });
  if (occurrence) {
    await db.gameEventHistory.createMany({
      data: [{ occurrenceId: occurrence.occurrenceId, participationId: participation.id, action: 'ACCEPTED', dedupeKey: `seasonal:${participation.id}:accepted`, payload: inputJson({ eventKey }), happenedAt: acceptedAt }],
      skipDuplicates: true,
    });
  }
}

export async function recordFirstClassSeasonalEventProgress(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  signal: { sourceKey: string; event: QuestProgressEvent; at: Date },
): Promise<{ matched: number; advanced: number; duplicate: number; readied: Array<{ key: string; title: string }> }> {
  if (!usesFirstClassSeasonalEvents(ruleset)) return { matched: 0, advanced: 0, duplicate: 0, readied: [] };
  let matched = 0;
  let advanced = 0;
  let duplicate = 0;
  const readied: Array<{ key: string; title: string }> = [];
  for (const definition of seasonalDefinitions(ruleset)) {
    const eventKey = definition.availability.seasonalEvent.eventKey;
    const participation = await db.gameEventParticipation.findFirst({
      where: { roundPlayerId, status: 'ACTIVE', occurrence: { occurrenceKey: eventKey, definition: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version } } },
      include: { occurrence: { select: { id: true } } },
    });
    if (!participation) continue;
    const state = participation.state && typeof participation.state === 'object' && !Array.isArray(participation.state)
      ? participation.state as Record<string, unknown>
      : {};
    const expiresAt = typeof state.expiresAt === 'string' ? new Date(state.expiresAt) : null;
    if (expiresAt && expiresAt <= signal.at) {
      await db.gameEventParticipation.update({ where: { id: participation.id }, data: { status: 'EXPIRED', expiredAt: signal.at } });
      continue;
    }
    await db.$queryRaw`SELECT id FROM "GameEventParticipation" WHERE id = ${participation.id} FOR UPDATE`;
    const prior = await db.gameEventProgressReceipt.findUnique({
      where: { participationId_sourceKey: { participationId: participation.id, sourceKey: signal.sourceKey } },
      select: { id: true },
    });
    if (prior) { duplicate += 1; continue; }
    const applied = applyQuestProgress(definition.objectives, progress(participation.progress), signal.event);
    const bonusBefore = progress(state.bonusProgress);
    const bonusApplied = applyQuestProgress(definition.bonusObjectives, bonusBefore, signal.event);
    if (!applied.matched && !bonusApplied.matched) continue;
    matched += 1;
    await db.gameEventProgressReceipt.create({ data: {
      participationId: participation.id,
      sourceKey: signal.sourceKey,
      objectiveKey: Object.keys(applied.deltas).join(',') || null,
      payload: inputJson({ eventType: signal.event.type, deltas: applied.deltas, bonusDeltas: bonusApplied.deltas }),
      recordedAt: signal.at,
    } });
    if (!applied.changed && !bonusApplied.changed) continue;
    const ready = definition.objectives.every((objective) => applied.progress[objective.id]?.completed);
    await db.gameEventParticipation.update({ where: { id: participation.id }, data: {
      progress: inputJson(applied.progress),
      state: inputJson({ ...state, bonusProgress: bonusApplied.progress }),
      ...(ready ? { status: 'COMPLETED', completedAt: signal.at } : {}),
    } });
    const quest = await db.playerQuest.findFirst({
      where: { roundPlayerId, questDefinition: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, key: definition.key } },
      orderBy: { attempt: 'desc' },
      select: { id: true, status: true },
    });
    if (quest) {
      await db.playerQuest.update({ where: { id: quest.id }, data: {
        objectiveProgress: inputJson(applied.progress),
        bonusProgress: inputJson(bonusApplied.progress),
        ...(ready ? { status: 'READY_TO_TURN_IN', completedAt: signal.at } : {}),
      } });
      if (ready && quest.status !== 'READY_TO_TURN_IN') readied.push({ key: definition.key, title: definition.title });
    }
    advanced += 1;
  }
  return { matched, advanced, duplicate, readied };
}

export async function assertSeasonalEventClaim(db: Db, roundPlayerId: string, ruleset: Ruleset, key: string): Promise<void> {
  if (!usesFirstClassSeasonalEvents(ruleset)) return;
  const definition = ruleset.questDefinitions?.[key];
  if (!isSeasonalEventDefinition(definition)) return;
  const participation = await db.gameEventParticipation.findFirst({
    where: { roundPlayerId, occurrence: { occurrenceKey: definition.availability.seasonalEvent.eventKey, definition: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version } } },
    select: { id: true, progress: true, status: true, state: true },
  });
  const expiry = participation?.state && typeof participation.state === 'object' && !Array.isArray(participation.state)
    ? (participation.state as Record<string, unknown>).expiresAt
    : null;
  if (!participation || participation.status === 'EXPIRED' || (typeof expiry === 'string' && new Date(expiry) <= new Date())) {
    throw AppError.conflict('QUEST_EXPIRED', 'That seasonal event has expired.');
  }
  if (!definition.objectives.every((objective) => progress(participation.progress)[objective.id]?.completed)) {
    throw AppError.conflict('QUEST_NOT_READY', 'Finish the event objectives before collecting its reward.');
  }
}

export async function recordSeasonalEventClaim(db: Db, roundPlayerId: string, ruleset: Ruleset, key: string, now: Date): Promise<void> {
  if (!usesFirstClassSeasonalEvents(ruleset)) return;
  const definition = ruleset.questDefinitions?.[key];
  if (!isSeasonalEventDefinition(definition)) return;
  const participation = await db.gameEventParticipation.findFirst({
    where: { roundPlayerId, occurrence: { occurrenceKey: definition.availability.seasonalEvent.eventKey, definition: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version } } },
    select: { id: true, occurrenceId: true },
  });
  if (!participation) return;
  await db.gameEventRewardClaim.createMany({
    data: [{ participationId: participation.id, rewardKey: key, idempotencyKey: `seasonal:${participation.id}:reward`, reward: inputJson(definition.rewards), claimedAt: now }],
    skipDuplicates: true,
  });
  await db.gameEventParticipation.update({ where: { id: participation.id }, data: { status: 'CLAIMED', claimedAt: now } });
  await db.gameEventHistory.createMany({
    data: [{ occurrenceId: participation.occurrenceId, participationId: participation.id, action: 'CLAIMED', dedupeKey: `seasonal:${participation.id}:claimed`, payload: inputJson({ eventKey: definition.availability.seasonalEvent.eventKey, rewardKey: key }), happenedAt: now }],
    skipDuplicates: true,
  });
}
