import type { Prisma, PrismaClient } from '@prisma/client';
import {
  STATUE_ENCOUNTER_KEY,
  STATUE_STARE_SECONDS,
  easterEggForEncounterChoice,
  type GameActionResult,
  type RandomEncounterChoiceResult,
} from '@streets/shared';
import { HOLIDAY_ROAD_CHOICE_KEY, HOLIDAY_ROAD_COSMETIC_KEY, HOLIDAY_ROAD_ENCOUNTER_KEY, type Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { AvatarWearableService } from './avatar-wearable.service.js';
import { EasterEggService } from './easter-egg.service.js';
import { applyRandomEncounterEffects, capRandomEncounterEffects } from './random-encounter.service.js';
import { EncounterGangService } from './encounter-gang.service.js';
import { QuestCosmeticService } from './quest-cosmetic.service.js';

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

/**
 * Easter eggs hidden in encounter choices (ruleset 1.8.0-M). A stare at the
 * statue only counts if it was made soon after the statue appeared; a player
 * who comes back to it later blinked, and gets a different ending instead.
 */
async function encounterEasterEgg(
  tx: Db,
  roundPlayerId: string,
  encounterKey: string,
  choiceKey: string,
  offeredAt: Date,
  now: Date,
): Promise<Pick<RandomEncounterChoiceResult, 'easterEgg'> & { text?: string }> {
  const id = easterEggForEncounterChoice(encounterKey, choiceKey);
  if (!id) return {};
  if (encounterKey === STATUE_ENCOUNTER_KEY && choiceKey === 'dont-blink'
    && now.getTime() - offeredAt.getTime() > STATUE_STARE_SECONDS * 1_000) {
    return { text: 'You blinked. When you look again the alley is empty, and your watch is an hour slow.' };
  }
  const found = await EasterEggService.discoverForPlayer(tx, roundPlayerId, id, now);
  return found ? { easterEgg: { title: found.egg.title, description: found.egg.description, isNew: found.isNew } } : {};
}

/**
 * Only a stored, server-validated choice from the Holiday Road encounter grants
 * this permanent, account-level reward. Runs inside the idempotent action tx.
 */
async function holidayRoadReward(
  tx: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
  encounterKey: string,
  choiceKey: string,
  now: Date,
): Promise<{ title: string; description: string; isNew: boolean } | null> {
  if (encounterKey !== HOLIDAY_ROAD_ENCOUNTER_KEY || choiceKey !== HOLIDAY_ROAD_CHOICE_KEY
    || ruleset.cosmetics?.[HOLIDAY_ROAD_COSMETIC_KEY]?.kind !== 'ITEM_COLLECTION') return null;
  const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { accountId: true } });
  if (!player) return null;
  const existing = await tx.accountCosmeticUnlock.findUnique({
    where: { accountId_key: { accountId: player.accountId, key: HOLIDAY_ROAD_COSMETIC_KEY } },
    select: { key: true },
  });
  await QuestCosmeticService.award(
    tx, player.accountId, ruleset, HOLIDAY_ROAD_COSMETIC_KEY,
    `RANDOM_ENCOUNTER:${HOLIDAY_ROAD_ENCOUNTER_KEY}`, now,
  );
  // The Santa hat rides along, also for good; an account that had the Sedan before the hat existed gets it now.
  const hat = await AvatarWearableService.grant(tx, player.accountId, 'holiday-road-santa-hat', `RANDOM_ENCOUNTER:${HOLIDAY_ROAD_ENCOUNTER_KEY}`, now);
  if (existing && hat) {
    return {
      title: 'Santa Hat',
      description: 'The Perfect Christmas Tree has unlocked a Santa hat for your built avatar. Wear it in Account → Profile.',
      isNew: true,
    };
  }
  return existing ? null : {
    title: 'Holiday Road Sedan',
    description: 'The Perfect Christmas Tree has unlocked this legendary sedan cosmetic and a Santa hat for your built avatar, permanently. Equip the Sedan in your collection and the hat in Account → Profile.',
    isNew: true,
  };
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
    execute: async ({ tx, current: state, now, round, ruleset }) => {
      const participation = await tx.gameEventParticipation.findFirst({
        where: { id: participationId, roundPlayerId, status: 'OFFERED', occurrence: { definition: { is: { type: 'RANDOM_ENCOUNTER' } } } },
        select: {
          id: true,
          progress: true,
          state: true,
          createdAt: true,
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
      const encounterKey = String((object(participation.occurrence.config) ?? {}).entryKey ?? participation.occurrence.definition.key);
      const egg = await encounterEasterEgg(tx, roundPlayerId, encounterKey, choice.key, participation.createdAt, now);
      const holiday = await holidayRoadReward(tx, roundPlayerId, ruleset, encounterKey, choice.key, now);
      const result = {
        encounterId,
        encounterKey,
        title: participation.occurrence.definition.title,
        choice: choice.key,
        choiceLabel: choice.label,
        text: egg.text ?? choice.text,
        cashCents: effects.cashCents ?? 0,
        effects,
        ...(egg.easterEgg ? { easterEgg: egg.easterEgg } : holiday ? { easterEgg: holiday } : {}),
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
      await ActivityService.log(tx, roundPlayerId, 'RANDOM_ENCOUNTER_CHOICE', {
        encounterKey: result.encounterKey,
        title: result.title,
        choice: result.choice,
        choiceLabel: result.choiceLabel,
      });
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
      execute: async ({ tx, current, now, ruleset }) => {
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
        const egg = await encounterEasterEgg(tx, roundPlayerId, encounter.key, choice.key, encounter.createdAt, now);
        const holiday = await holidayRoadReward(tx, roundPlayerId, ruleset, encounter.key, choice.key, now);
        const text = egg.text ?? choice.text;

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
              text,
              cashCents: effects.cashCents ?? 0,
              effects,
            },
          },
        });
        await EncounterGangService.recordChoice(tx, roundPlayerId, encounter.key, choice.key, new Date());
        await ActivityService.log(tx, roundPlayerId, 'RANDOM_ENCOUNTER_CHOICE', {
          encounterKey: encounter.key,
          title: encounter.title,
          choice: choice.key,
          choiceLabel: choice.label,
        });

        return {
          next,
          result: {
            encounterId,
            encounterKey: encounter.key,
            title: encounter.title,
            choice: choice.key,
            choiceLabel: choice.label,
            text,
            cashCents: effects.cashCents ?? 0,
            effects,
            ...(egg.easterEgg ? { easterEgg: egg.easterEgg } : holiday ? { easterEgg: holiday } : {}),
          },
        };
      },
    }, requestedAt);
  },
};
