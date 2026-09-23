import type { Prisma } from '@prisma/client';
import type { QuestDefinition, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { weeklyContractWindow } from './weekly-contract.service.js';

export const ALLIANCE_CONTRACT_SLOTS = 4;

const ACTIVE_STATUSES = ['ACTIVE', 'READY_TO_TURN_IN'] as const;

export interface AllianceContractState {
  allianceId: string;
  allianceName: string;
  windowStart: string;
  windowEnd: string;
  acceptedAt: string;
  participantIds: string[];
}

interface AllianceContractOfferState {
  allianceId: string;
  windowStart: string;
  windowEnd: string;
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return [...new Set(value as string[])];
}

function pool(ruleset: Ruleset): QuestDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {}).filter(isAllianceContractDefinition);
}

export function isAllianceContractDefinition(definition: QuestDefinition | undefined): boolean {
  return Boolean(
    definition?.type === 'ALLIANCE'
    && definition.repeatability === 'WEEKLY'
    && definition.availability.allianceContract === true,
  );
}

export function allianceContractState(value: unknown): AllianceContractState | null {
  const outer = record(value);
  const raw = record(outer?.allianceContract);
  if (!raw) return null;
  const participantIds = strings(raw.participantIds);
  if (
    typeof raw.allianceId !== 'string'
    || typeof raw.allianceName !== 'string'
    || typeof raw.windowStart !== 'string'
    || typeof raw.windowEnd !== 'string'
    || typeof raw.acceptedAt !== 'string'
    || !participantIds
    || participantIds.length === 0
  ) return null;

  return {
    allianceId: raw.allianceId,
    allianceName: raw.allianceName,
    windowStart: raw.windowStart,
    windowEnd: raw.windowEnd,
    acceptedAt: raw.acceptedAt,
    participantIds,
  };
}

function allianceOfferState(value: unknown): AllianceContractOfferState | null {
  const outer = record(value);
  const raw = record(outer?.allianceOffer);
  if (
    !raw
    || typeof raw.allianceId !== 'string'
    || typeof raw.windowStart !== 'string'
    || typeof raw.windowEnd !== 'string'
  ) return null;
  return {
    allianceId: raw.allianceId,
    windowStart: raw.windowStart,
    windowEnd: raw.windowEnd,
  };
}

function sameWindow(state: AllianceContractState, allianceId: string, startsAt: Date): boolean {
  return state.allianceId === allianceId && state.windowStart === startsAt.toISOString();
}

/**
 * Materialize this week's four alliance slots for the requesting member.
 *
 * Once a slot has been accepted, its snapshotted roster is authoritative:
 * members who join later do not get inserted into an already-running contract.
 */
export async function syncAllianceContractAttempts(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  now = new Date(),
): Promise<string[]> {
  const definitions = pool(ruleset);
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
  if (!definitionRows.length) return [];

  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { allianceId: true },
  });
  if (!player?.allianceId) {
    await db.playerQuest.updateMany({
      where: {
        roundPlayerId,
        questDefinitionId: { in: definitionRows.map((row) => row.id) },
        status: { in: ['AVAILABLE', ...ACTIVE_STATUSES] },
      },
      data: { status: 'EXPIRED', isTracked: false },
    });
    return [];
  }

  const window = weeklyContractWindow(now, ruleset);
  const definitionIds = definitionRows.map((row) => row.id);

  await db.playerQuest.updateMany({
    where: {
      roundPlayerId,
      questDefinitionId: { in: definitionIds },
      status: { in: ['AVAILABLE', ...ACTIVE_STATUSES] },
      expiresAt: { not: null, lte: now },
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
      rewardState: true,
    },
  });

  // Definition rows are shared by every round pinned to this ruleset. We only
  // inspect live rows, then identify this alliance by the immutable state UUID.
  const liveShared = await db.playerQuest.findMany({
    where: {
      questDefinitionId: { in: definitionIds },
      status: { in: ['ACTIVE', 'READY_TO_TURN_IN', 'COMPLETED'] },
      expiresAt: { gt: now },
    },
    select: {
      questDefinitionId: true,
      rewardState: true,
    },
  });

  const created: string[] = [];
  for (const definitionRow of definitionRows) {
    const started = liveShared
      .map((row) => ({
        row,
        state: allianceContractState(row.rewardState),
      }))
      .find(({ row, state }) =>
        row.questDefinitionId === definitionRow.id
        && state
        && sameWindow(state, player.allianceId!, window.startsAt)
      );

    const liveOwn = existing
      .filter((row) =>
        row.questDefinitionId === definitionRow.id
        && row.expiresAt
        && row.expiresAt.getTime() > now.getTime()
      )
      .sort((left, right) => right.attempt - left.attempt)[0];

    if (started?.state) {
      // The acceptance transaction created every snapshotted participant row.
      // A later joiner intentionally sees no copy of the in-flight contract.
      if (!started.state.participantIds.includes(roundPlayerId) && liveOwn?.status === 'AVAILABLE') {
        await db.playerQuest.update({
          where: { id: liveOwn.id },
          data: { status: 'EXPIRED', isTracked: false },
        });
      }
      continue;
    }

    const offer = liveOwn ? allianceOfferState(liveOwn.rewardState) : null;
    if (
      liveOwn?.status === 'AVAILABLE'
      && offer?.allianceId === player.allianceId
      && offer.windowStart === window.startsAt.toISOString()
    ) continue;

    if (liveOwn && liveOwn.status === 'AVAILABLE') {
      await db.playerQuest.update({
        where: { id: liveOwn.id },
        data: { status: 'EXPIRED', isTracked: false },
      });
    }

    const attempt = existing
      .filter((row) => row.questDefinitionId === definitionRow.id)
      .reduce((max, row) => Math.max(max, row.attempt), 0) + 1;

    const createdRow = await db.playerQuest.create({
      data: {
        roundPlayerId,
        questDefinitionId: definitionRow.id,
        attempt,
        status: 'AVAILABLE',
        expiresAt: window.endsAt,
        rewardState: inputJson({
          allianceOffer: {
            allianceId: player.allianceId,
            windowStart: window.startsAt.toISOString(),
            windowEnd: window.endsAt.toISOString(),
          },
        }),
      },
      select: {
        id: true,
        questDefinitionId: true,
        attempt: true,
        status: true,
        expiresAt: true,
        rewardState: true,
      },
    });
    existing.push(createdRow);
    created.push(definitionRow.key);
  }

  return created;
}

/**
 * Start one alliance contract for every current member in a single locked
 * transaction. The roster is frozen for this attempt so late joins cannot
 * collect work completed before they arrived.
 */
export async function acceptAllianceContract(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  key: string,
  acceptedAt: Date,
  trackActor: boolean,
): Promise<AllianceContractState> {
  const definition = ruleset.questDefinitions?.[key];
  if (!isAllianceContractDefinition(definition)) {
    throw AppError.conflict('ALLIANCE_CONTRACT_INVALID', 'That is not an alliance contract.');
  }

  const definitionRow = await db.questDefinition.findFirst({
    where: {
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      key,
      isEnabled: true,
    },
    select: { id: true },
  });
  if (!definitionRow) {
    throw AppError.notFound('QUEST_NOT_FOUND', 'That alliance contract is not available in this round.');
  }

  const actor = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: {
      allianceId: true,
      alliance: { select: { id: true, name: true } },
    },
  });
  if (!actor?.allianceId || !actor.alliance) {
    throw AppError.conflict('ALLIANCE_REQUIRED', 'Join an alliance before starting an alliance contract.');
  }

  // Serialize starts for this alliance so two members cannot create competing
  // roster snapshots for the same board slot.
  await db.$queryRaw`SELECT id FROM "Alliance" WHERE id = ${actor.allianceId} FOR UPDATE`;

  const window = weeklyContractWindow(acceptedAt, ruleset);
  const liveRows = await db.playerQuest.findMany({
    where: {
      questDefinitionId: definitionRow.id,
      status: { in: ['ACTIVE', 'READY_TO_TURN_IN', 'COMPLETED'] },
      expiresAt: { gt: acceptedAt },
    },
    select: { rewardState: true },
  });
  const alreadyStarted = liveRows
    .map((row) => allianceContractState(row.rewardState))
    .find((state) => state && sameWindow(state, actor.allianceId!, window.startsAt));

  if (alreadyStarted) {
    if (alreadyStarted.participantIds.includes(roundPlayerId)) return alreadyStarted;
    throw AppError.conflict(
      'ALLIANCE_CONTRACT_ALREADY_STARTED',
      'Your alliance already started that contract before you joined this attempt.',
    );
  }

  const members = await db.roundPlayer.findMany({
    where: { allianceId: actor.allianceId },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const participantIds = members.map((member) => member.id);
  if (!participantIds.includes(roundPlayerId)) {
    throw AppError.conflict('ALLIANCE_CHANGED', 'Your alliance membership changed. Refresh the Jobs page.');
  }

  const state: AllianceContractState = {
    allianceId: actor.allianceId,
    allianceName: actor.alliance.name,
    windowStart: window.startsAt.toISOString(),
    windowEnd: window.endsAt.toISOString(),
    acceptedAt: acceptedAt.toISOString(),
    participantIds,
  };

  const rows = await db.playerQuest.findMany({
    where: {
      roundPlayerId: { in: participantIds },
      questDefinitionId: definitionRow.id,
    },
    select: {
      id: true,
      roundPlayerId: true,
      attempt: true,
      status: true,
      expiresAt: true,
    },
    orderBy: { attempt: 'desc' },
  });

  for (const participantId of participantIds) {
    const participantRows = rows.filter((row) => row.roundPlayerId === participantId);
    const live = participantRows.find((row) =>
      row.expiresAt !== null && row.expiresAt.getTime() > acceptedAt.getTime()
    );
    const data = {
      status: 'ACTIVE' as const,
      acceptedAt,
      completedAt: null,
      claimedAt: null,
      failedAt: null,
      objectiveProgress: inputJson({}),
      bonusProgress: inputJson({}),
      rewardState: inputJson({ allianceContract: state }),
      expiresAt: window.endsAt,
      isTracked: participantId === roundPlayerId && trackActor,
    };

    if (live) {
      await db.playerQuest.update({ where: { id: live.id }, data });
      continue;
    }

    const attempt = participantRows.reduce((max, row) => Math.max(max, row.attempt), 0) + 1;
    await db.playerQuest.create({
      data: {
        roundPlayerId: participantId,
        questDefinitionId: definitionRow.id,
        attempt,
        ...data,
      },
    });
  }

  return state;
}

/**
 * Expand one member's gameplay event to every still-current member of the
 * snapshotted alliance attempt. Alliance rows are intentionally excluded from
 * the normal actor-only candidate list in QuestProgressService.
 */
export async function allianceContractProgressCandidateIds(
  db: Db,
  roundPlayerId: string,
): Promise<string[]> {
  const actor = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { allianceId: true },
  });
  if (!actor?.allianceId) return [];

  const own = await db.playerQuest.findMany({
    where: {
      roundPlayerId,
      status: { in: [...ACTIVE_STATUSES] },
      questDefinition: { type: 'ALLIANCE' },
    },
    select: {
      questDefinitionId: true,
      rewardState: true,
    },
  });

  const ids = new Set<string>();
  for (const row of own) {
    const state = allianceContractState(row.rewardState);
    if (
      !state
      || state.allianceId !== actor.allianceId
      || !state.participantIds.includes(roundPlayerId)
    ) continue;

    const stillMembers = await db.roundPlayer.findMany({
      where: {
        id: { in: state.participantIds },
        allianceId: state.allianceId,
      },
      select: { id: true },
    });
    const memberIds = stillMembers.map((member) => member.id);
    if (!memberIds.length) continue;

    const mirrors = await db.playerQuest.findMany({
      where: {
        roundPlayerId: { in: memberIds },
        questDefinitionId: row.questDefinitionId,
        status: { in: [...ACTIVE_STATUSES] },
      },
      select: {
        id: true,
        rewardState: true,
      },
    });
    for (const mirror of mirrors) {
      const mirrorState = allianceContractState(mirror.rewardState);
      if (
        mirrorState
        && mirrorState.allianceId === state.allianceId
        && mirrorState.windowStart === state.windowStart
      ) ids.add(mirror.id);
    }
  }

  return [...ids].sort();
}

export async function assertAllianceContractClaim(
  db: Db,
  roundPlayerId: string,
  value: unknown,
): Promise<void> {
  const state = allianceContractState(value);
  if (!state || !state.participantIds.includes(roundPlayerId)) {
    throw AppError.conflict('ALLIANCE_CONTRACT_NOT_PARTICIPANT', 'You are not part of that alliance contract attempt.');
  }
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { allianceId: true },
  });
  if (player?.allianceId !== state.allianceId) {
    throw AppError.conflict(
      'ALLIANCE_CONTRACT_MEMBERSHIP',
      'You must still belong to the alliance that completed this contract to collect its reward.',
    );
  }
}
