import type { Prisma, PrismaClient } from '@prisma/client';
import type { GameActionResult, RandomEncounterChoiceResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { applyRandomEncounterEffects, capRandomEncounterEffects } from './random-encounter.service.js';
import { EncounterGangService } from './encounter-gang.service.js';

const FIRST_CLASS_ENCOUNTER_ID_PREFIX = 'event_';

export interface RandomEncounterChoiceInput {
  choice: string;
  actionId?: string;
}

interface PendingChoice {
  key: string;
  label: string;
  text: string;
  effects?: {
    cashCents?: number;
    heat?: number;
    condoms?: number;
    medicine?: number;
    crack?: number;
    beer?: number;
    turns?: number;
    thugs?: number;
    woundedThugs?: number;
    whores?: number;
    lowRiders?: number;
  };
}

function object(value: Prisma.JsonValue | unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function choicesOf(choices: Prisma.JsonValue): PendingChoice[] {
  return Array.isArray(choices)
    ? choices.map((choice) => object(choice)).filter((choice): choice is Record<string, unknown> => Boolean(choice)).map((choice) => ({
        key: typeof choice.key === 'string' ? choice.key : '',
        label: typeof choice.label === 'string' ? choice.label : '',
        text: typeof choice.text === 'string' ? choice.text : '',
        effects: object(choice.effects) as PendingChoice['effects'],
      })).filter((choice) => choice.key && choice.label)
    : [];
}

function effectsOf(value: Prisma.JsonValue | unknown): PendingChoice['effects'] {
  const source = object(value);
  return {
    ...(typeof source?.cashCents === 'number' ? { cashCents: source.cashCents } : {}),
    ...(typeof source?.heat === 'number' ? { heat: source.heat } : {}),
    ...(typeof source?.condoms === 'number' ? { condoms: source.condoms } : {}),
    ...(typeof source?.medicine === 'number' ? { medicine: source.medicine } : {}),
    ...(typeof source?.crack === 'number' ? { crack: source.crack } : {}),
    ...(typeof source?.beer === 'number' ? { beer: source.beer } : {}),
    ...(typeof source?.turns === 'number' ? { turns: source.turns } : {}),
    ...(typeof source?.thugs === 'number' ? { thugs: source.thugs } : {}),
    ...(typeof source?.woundedThugs === 'number' ? { woundedThugs: source.woundedThugs } : {}),
    ...(typeof source?.whores === 'number' ? { whores: source.whores } : {}),
    ...(typeof source?.lowRiders === 'number' ? { lowRiders: source.lowRiders } : {}),
  };
}

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function resolveFirstClassEncounter(
  prisma: PrismaClient,
  roundPlayerId: string,
  encounterId: string,
  input: RandomEncounterChoiceInput,
): Promise<GameActionResult<RandomEncounterChoiceResult>> {
  const participationId = encounterId.slice(FIRST_CLASS_ENCOUNTER_ID_PREFIX.length);
  const requestedAt = new Date();
  const player = await prisma.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { round: { select: { pausedAt: true } } },
  });
  const current = await prisma.gameEventParticipation.findFirst({
    where: { id: participationId, roundPlayerId, status: 'OFFERED', occurrence: { definition: { is: { type: 'RANDOM_ENCOUNTER' } } } },
    select: { id: true, occurrence: { select: { id: true, endsAt: true } } },
  });
  if (current && !player?.round.pausedAt && current.occurrence.endsAt && current.occurrence.endsAt <= requestedAt) {
    await prisma.gameEventParticipation.updateMany({
      where: { id: participationId, roundPlayerId, status: 'OFFERED' },
      data: { status: 'EXPIRED', expiredAt: requestedAt },
    });
    await prisma.gameEventOccurrence.updateMany({
      where: { id: current.occurrence.id, status: 'ACTIVE' },
      data: { status: 'EXPIRED', expiredAt: requestedAt },
    });
    await prisma.gameEventHistory.createMany({
      data: [{ occurrenceId: current.occurrence.id, participationId, action: 'EXPIRED', dedupeKey: `encounter:${participationId}:expired`, happenedAt: requestedAt }],
      skipDuplicates: true,
    });
    throw AppError.conflict('ENCOUNTER_EXPIRED', 'That street situation has cooled off.');
  }

  return ActionService.run<RandomEncounterChoiceResult>(prisma, roundPlayerId, {
    action: 'RANDOM_ENCOUNTER_CHOICE',
    actionId: input.actionId,
    idempotencyScope: `RANDOM_ENCOUNTER_CHOICE:${encounterId}`,
    execute: async ({ tx, current: state, now, round }) => {
      const participation = await tx.gameEventParticipation.findFirst({
        where: { id: participationId, roundPlayerId, status: 'OFFERED', occurrence: { definition: { is: { type: 'RANDOM_ENCOUNTER' } } } },
        select: {
          id: true,
          progress: true,
          state: true,
          occurrence: { select: { id: true, endsAt: true, config: true, definition: { select: { key: true, title: true } } } },
        },
      });
      if (!participation) throw AppError.notFound('ENCOUNTER_NOT_FOUND', 'That street situation is no longer open.');
      if (!round.pausedAt && participation.occurrence.endsAt && participation.occurrence.endsAt <= now) {
        throw AppError.conflict('ENCOUNTER_EXPIRED', 'That street situation has cooled off.');
      }
      const savedState = object(participation.state) ?? {};
      const choice = choicesOf(inputJson(savedState.choices) as Prisma.JsonValue).find((candidate) => candidate.key === input.choice);
      if (!choice) throw AppError.badRequest('UNKNOWN_ENCOUNTER_CHOICE', 'Pick one of the listed responses.');
      const effects = capRandomEncounterEffects(effectsOf(choice.effects) ?? {}, state);
      const next = applyRandomEncounterEffects(state, effects);
      const settledState = { ...savedState, selectedChoice: choice.key, selectedAt: now.toISOString(), selectedEffects: effects };
      const result = {
        encounterId,
        encounterKey: String((object(participation.occurrence.config) ?? {}).entryKey ?? participation.occurrence.definition.key),
        title: participation.occurrence.definition.title,
        choice: choice.key,
        choiceLabel: choice.label,
        text: choice.text,
        cashCents: effects.cashCents ?? 0,
        effects,
      };
      await tx.gameEventParticipation.update({
        where: { id: participation.id },
        data: { status: 'CLAIMED', claimedAt: now, completedAt: now, progress: inputJson({ effects }), state: inputJson(settledState) },
      });
      await tx.gameEventOccurrence.update({ where: { id: participation.occurrence.id }, data: { status: 'COMPLETED', completedAt: now } });
      await tx.gameEventProgressReceipt.createMany({
        data: [{ participationId: participation.id, sourceKey: `choice:${choice.key}`, objectiveKey: 'CHOICE_SELECTED', payload: inputJson({ choice: choice.key, effects }), recordedAt: now }],
        skipDuplicates: true,
      });
      await tx.gameEventRewardClaim.createMany({
        data: [{ participationId: participation.id, rewardKey: choice.key, idempotencyKey: `encounter:${participation.id}:choice:${choice.key}`, reward: inputJson({ choice: choice.key, effects }), claimedAt: now }],
        skipDuplicates: true,
      });
      await tx.gameEventHistory.createMany({
        data: [
          { occurrenceId: participation.occurrence.id, participationId: participation.id, action: 'CHOICE_SELECTED', dedupeKey: `encounter:${participation.id}:choice`, payload: inputJson({ choice: choice.key }), happenedAt: now },
          { occurrenceId: participation.occurrence.id, participationId: participation.id, action: 'SETTLED', dedupeKey: `encounter:${participation.id}:settled`, payload: inputJson({ effects }), happenedAt: now },
        ],
        skipDuplicates: true,
      });
      await EncounterGangService.recordChoice(tx, roundPlayerId, result.encounterKey, choice.key, now);
      return { next, result };
    },
  }, requestedAt);
}

export const RandomEncounterChoiceService = {
  async resolve(
    prisma: PrismaClient,
    roundPlayerId: string,
    encounterId: string,
    input: RandomEncounterChoiceInput,
  ): Promise<GameActionResult<RandomEncounterChoiceResult>> {
    if (encounterId.startsWith(FIRST_CLASS_ENCOUNTER_ID_PREFIX)) {
      return resolveFirstClassEncounter(prisma, roundPlayerId, encounterId, input);
    }
    const requestedAt = new Date();
    const player = await prisma.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: { round: { select: { pausedAt: true } } },
    });
    if (!player?.round.pausedAt) {
      const expired = await prisma.randomEncounter.updateMany({
        where: {
          id: encounterId,
          roundPlayerId,
          status: 'PENDING',
          expiresAt: { lte: requestedAt },
        },
        data: { status: 'EXPIRED' },
      });
      if (expired.count > 0) {
        throw AppError.conflict('ENCOUNTER_EXPIRED', 'That street situation has cooled off.');
      }
    }

    return ActionService.run<RandomEncounterChoiceResult>(prisma, roundPlayerId, {
      action: 'RANDOM_ENCOUNTER_CHOICE',
      actionId: input.actionId,
      idempotencyScope: `RANDOM_ENCOUNTER_CHOICE:${encounterId}`,
      execute: async ({ tx, current }) => {
        const encounter = await tx.randomEncounter.findFirst({
          where: { id: encounterId, roundPlayerId, status: 'PENDING' },
        });

        if (!encounter) {
          throw AppError.notFound('ENCOUNTER_NOT_FOUND', 'That street situation is no longer open.');
        }

        const choice = choicesOf(encounter.choices).find((candidate) => candidate.key === input.choice);
        if (!choice) {
          throw AppError.badRequest('UNKNOWN_ENCOUNTER_CHOICE', 'Pick one of the listed responses.');
        }

        const effects = capRandomEncounterEffects(effectsOf(choice.effects) ?? {}, current);
        const next = applyRandomEncounterEffects(current, effects);

        await tx.randomEncounter.update({
          where: { id: encounter.id },
          data: {
            status: 'RESOLVED',
            selectedChoice: choice.key,
            resolvedAt: new Date(),
            effects,
            result: {
              choice: choice.key,
              choiceLabel: choice.label,
              text: choice.text,
              cashCents: effects.cashCents ?? 0,
              effects,
            },
          },
        });
        await EncounterGangService.recordChoice(tx, roundPlayerId, encounter.key, choice.key, new Date());

        return {
          next,
          result: {
            encounterId,
            encounterKey: encounter.key,
            title: encounter.title,
            choice: choice.key,
            choiceLabel: choice.label,
            text: choice.text,
            cashCents: effects.cashCents ?? 0,
            effects,
          },
        };
      },
    }, requestedAt);
  },
};
