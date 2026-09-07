import type { PrismaClient } from '@prisma/client';
import { calculateWork, clampFatigue, type Rng } from '@streets/rules-engine';
import type { GameActionResult, WorkResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns } from './action.service.js';
import { findDistrict, toDistrictDto } from './scout.service.js';

export interface WorkInput {
  district: string;
  turns: number;
  actionId?: string;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export const WorkService = {
  /**
   * Work the Streets. The only action that makes money.
   *
   * Turns, a crew and a block. The girls earn, you take your cut, and everyone
   * comes home tired - how much of that tiredness sticks depends on whether
   * their share was worth the night.
   */
  work(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: WorkInput,
    rng?: Rng,
  ): Promise<GameActionResult<WorkResult>> {
    return ActionService.run<WorkResult>(prisma, roundPlayerId, {
      action: 'WORK_STREETS',
      actionId: input.actionId,

      execute: ({ current, whoreHappiness, thugHappiness, player, ruleset }) => {
        const found = findDistrict(ruleset, input.district);
        if (!found) {
          throw AppError.badRequest(
            'UNKNOWN_DISTRICT',
            'That is not a district you can work.',
            { district: 'Pick one of the listed districts.' },
          );
        }

        if (input.turns < ruleset.work.minTurns) {
          throw AppError.badRequest(
            'TURNS_TOO_LOW',
            `Working the streets costs at least ${ruleset.work.minTurns} turn.`,
            { turns: 'Spend at least one turn.' },
          );
        }

        if (current.whores <= 0) {
          throw AppError.badRequest(
            'NO_WHORES',
            'You have nobody to put to work. Scout a district first.',
          );
        }

        assertTurns(current.turns, input.turns);

        const outcome = calculateWork({
          player: { ...current, whoreHappiness, thugHappiness },
          turns: input.turns,
          ruleset,
          city: player.city,
          district: found.key,
          payoutPercent: current.payoutPercent,
          rng,
        });

        const next = {
          ...current,
          turns: current.turns - input.turns,
          streetWorkTurns: Math.min(2_147_483_647, current.streetWorkTurns + input.turns),
          cashCents: current.cashCents + outcome.pimpTakeCents,

          whores: Math.max(0, current.whores - outcome.departures.whores),
          thugs: Math.max(0, current.thugs - outcome.departures.thugs),

          condoms: current.condoms - outcome.consumption.condoms,
          crack: current.crack - outcome.consumption.crack + outcome.crackFound,
          beer: current.beer - outcome.consumption.beer,

          whoreFatigue: clampFatigue(
            current.whoreFatigue + outcome.fatigue.whore.change,
            ruleset,
          ),
          thugFatigue: clampFatigue(
            current.thugFatigue + outcome.fatigue.thug.change,
            ruleset,
          ),
        };

        const all = Object.values(ruleset.districts);

        const result: WorkResult = {
          district: toDistrictDto(found.key, found.district, all, ruleset, current),
          grossEarnedCents: Number(outcome.grossCents),
          crewTakeCents: Number(outcome.crewTakeCents),
          cashEarnedCents: Number(outcome.pimpTakeCents),
          payoutPercent: current.payoutPercent,

          crackFound: outcome.crackFound,

          condomsUsed: outcome.consumption.condoms,
          crackUsed: outcome.consumption.crack,
          beerUsed: outcome.consumption.beer,
          condomsMissing: outcome.shortages.condoms,
          beerMissing: outcome.shortages.beer,

          whoresLeft: outcome.departures.whores,
          thugsLeft: outcome.departures.thugs,

          exposedFraction: round2(outcome.exposure.exposed),
          coveredWhores: outcome.exposure.covered,

          whoreFatigueChange: next.whoreFatigue - current.whoreFatigue,
          thugFatigueChange: next.thugFatigue - current.thugFatigue,
          reliefRatio: round2(outcome.fatigue.whore.reliefRatio),

          turnsUsed: input.turns,
          turnsRemaining: next.turns,
        };

        return {
          next,
          result,
          activity: {
            type: 'WORK_STREETS',
            payload: {
              district: found.district.name,
              turns: input.turns,
              cashCents: Number(outcome.pimpTakeCents),
              crewTakeCents: Number(outcome.crewTakeCents),
              crackFound: outcome.crackFound,
              whoresLeft: outcome.departures.whores,
              thugsLeft: outcome.departures.thugs,
              whoreFatigueChange: round2(outcome.fatigue.whore.change),
            },
          },
        };
      },
    });
  },
};
