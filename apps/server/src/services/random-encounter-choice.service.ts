import type { Prisma, PrismaClient } from '@prisma/client';
import type { GameActionResult, RandomEncounterChoiceResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService } from './action.service.js';
import { applyRandomEncounterEffects, capRandomEncounterEffects } from './random-encounter.service.js';

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
  };
}

export const RandomEncounterChoiceService = {
  resolve(
    prisma: PrismaClient,
    roundPlayerId: string,
    encounterId: string,
    input: RandomEncounterChoiceInput,
  ): Promise<GameActionResult<RandomEncounterChoiceResult>> {
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

        if (encounter.expiresAt && encounter.expiresAt.getTime() <= Date.now()) {
          await tx.randomEncounter.update({ where: { id: encounter.id }, data: { status: 'EXPIRED' } });
          throw AppError.conflict('ENCOUNTER_EXPIRED', 'That street situation has cooled off.');
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
    });
  },
};
