import { Prisma } from '@prisma/client';
import { QUEST_STORY_SCENE_EVENT, type QuestDefinition, type QuestProgressMap, type Ruleset } from '@streets/rulesets';
import type { QuestStorySceneDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import type { Db } from '../utils/db.js';
import { createPlayerActivity } from './in-app-notification.service.js';
import { QuestProgressService } from './quest-progress.service.js';

/**
 * Story campaign Slice B. A scene is a short authored moment on an active quest card: the player
 * reads it and picks a response. The server records one response per attempt and scene, writes a
 * QUEST_STORY_SCENE activity, and emits the event that advances the objective naming the scene.
 * The client only names the quest, scene and response; it never supplies progress or payload.
 */

const ANSWERABLE = ['ACTIVE', 'READY_TO_TURN_IN'];

type SceneRow = {
  id: string;
  status: string;
  objectiveProgress: Prisma.JsonValue;
  questDefinition: { key: string };
};

export type SceneResponses = ReadonlyMap<string, ReadonlyMap<string, string>>;

function completedObjectives(value: Prisma.JsonValue): Set<string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return new Set();
  return new Set(Object.entries(value as unknown as QuestProgressMap).flatMap(([id, row]) => row?.completed === true ? [id] : []));
}

function sceneOpen(definition: QuestDefinition, sceneKey: string, row: SceneRow): boolean {
  const scene = definition.story?.scenes?.find((entry) => entry.key === sceneKey);
  if (!scene || !ANSWERABLE.includes(row.status)) return false;
  const done = completedObjectives(row.objectiveProgress);
  return (scene.after ?? []).every((id) => done.has(id));
}

/** Recorded responses for the rows whose quests have scenes, keyed by player quest then scene. One query, or none. */
export async function sceneResponsesFor(db: Db, rows: readonly SceneRow[], ruleset: Ruleset): Promise<SceneResponses> {
  const ids = rows
    .filter((row) => ruleset.questDefinitions?.[row.questDefinition.key]?.story?.scenes?.length)
    .map((row) => row.id);
  if (!ids.length) return new Map();
  const found = await db.questSceneResponse.findMany({
    where: { playerQuestId: { in: ids } },
    select: { playerQuestId: true, sceneKey: true, responseKey: true },
  });
  const byQuest = new Map<string, Map<string, string>>();
  for (const response of found) {
    const scenes = byQuest.get(response.playerQuestId) ?? new Map<string, string>();
    scenes.set(response.sceneKey, response.responseKey);
    byQuest.set(response.playerQuestId, scenes);
  }
  return byQuest;
}

export function storyScenesDto(
  definition: QuestDefinition | undefined,
  row: SceneRow,
  responses: ReadonlyMap<string, string> | undefined,
): QuestStorySceneDto[] | undefined {
  const scenes = definition?.story?.scenes;
  if (!definition || !scenes?.length) return undefined;
  return scenes.map((scene) => {
    const chosen = responses?.get(scene.key);
    const response = chosen ? scene.responses.find((entry) => entry.key === chosen) : undefined;
    return {
      key: scene.key,
      title: scene.title,
      prose: scene.prose,
      responses: scene.responses.map(({ key, label }) => ({ key, label })),
      available: !chosen && sceneOpen(definition, scene.key, row),
      response: response ? { key: response.key, label: response.label, outcome: response.outcome } : null,
    };
  });
}

/**
 * Record a scene response for the player's latest attempt at a quest, inside the caller's
 * transaction (which must already hold the round player's lock). Answering again with the same
 * response is a no-op; a different response is refused.
 */
export async function recordSceneResponse(
  tx: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  input: { questKey: string; sceneKey: string; responseKey: string },
  now: Date,
): Promise<{ recorded: boolean }> {
  const definition = ruleset.questDefinitions?.[input.questKey];
  const scene = definition?.story?.scenes?.find((entry) => entry.key === input.sceneKey);
  if (!definition || !scene) throw AppError.notFound('SCENE_NOT_FOUND', 'That scene is not part of this job.');
  if (!scene.responses.some((response) => response.key === input.responseKey)) {
    throw AppError.badRequest('SCENE_RESPONSE_INVALID', 'That response is not available in this scene.', { responseKey: 'Pick one of the responses.' });
  }

  const row = await tx.playerQuest.findFirst({
    where: {
      roundPlayerId,
      questDefinition: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, key: input.questKey, isEnabled: true },
    },
    include: { questDefinition: { select: { key: true } } },
    orderBy: { attempt: 'desc' },
  });
  if (!row) throw AppError.notFound('QUEST_NOT_FOUND', 'That job is not available in this round.');

  const existing = await tx.questSceneResponse.findUnique({
    where: { playerQuestId_sceneKey: { playerQuestId: row.id, sceneKey: input.sceneKey } },
  });
  if (existing) {
    if (existing.responseKey === input.responseKey) return { recorded: false };
    throw AppError.conflict('SCENE_ALREADY_ANSWERED', 'You already made your choice in this scene.');
  }
  if (!ANSWERABLE.includes(row.status)) throw AppError.conflict('QUEST_NOT_ACTIVE', 'Take the job before you play its scenes.');
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) throw AppError.conflict('QUEST_EXPIRED', 'That job has expired.');
  if (!sceneOpen(definition, input.sceneKey, row)) {
    throw AppError.conflict('SCENE_NOT_AVAILABLE', 'That scene opens once the work before it is done.');
  }

  await tx.questSceneResponse.create({
    data: { playerQuestId: row.id, sceneKey: input.sceneKey, responseKey: input.responseKey, createdAt: now },
  });
  const payload = {
    questKey: input.questKey, title: definition.title, attempt: row.attempt,
    sceneKey: input.sceneKey, sceneTitle: scene.title, responseKey: input.responseKey,
  };
  await createPlayerActivity(tx, roundPlayerId, QUEST_STORY_SCENE_EVENT, payload);
  // Keyed by attempt and scene, so the event can only ever be credited once.
  await QuestProgressService.emit(tx, roundPlayerId, {
    sourceKey: `quest-scene:${row.id}:${input.sceneKey}`,
    type: QUEST_STORY_SCENE_EVENT,
    payload,
    at: now,
  });
  return { recorded: true };
}
