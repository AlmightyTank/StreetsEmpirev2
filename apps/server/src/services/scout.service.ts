import type { PrismaClient } from '@prisma/client';
import {
  calculateScout,
  expectedRecruitsPerTurn,
  recruitmentMultiplier,
  type Rng,
} from '@streets/rules-engine';
import type { District, DistrictKey, Ruleset } from '@streets/rulesets';
import type { DistrictDto, DistrictsDto, GameActionResult, ScoutResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns } from './action.service.js';

/**
 * Bands a value against the spread of the ruleset's own districts, so the
 * guidance shown to players stays honest if the numbers are retuned and does
 * not hard-code a threshold anywhere.
 */
function band(value: number, all: number[]): 'low' | 'medium' | 'high' {
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (max === min) return 'medium';

  const position = (value - min) / (max - min);
  if (position < 1 / 3) return 'low';
  if (position < 2 / 3) return 'medium';
  return 'high';
}

export interface Crew {
  whores: number;
  thugs: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function toDistrictDto(
  key: string,
  district: District,
  all: District[],
  ruleset: Ruleset,
  crew: Crew,
): DistrictDto {
  const expected = expectedRecruitsPerTurn(district, crew, ruleset);

  const covered = crew.thugs * district.protectionWhoresPerThug;
  const exposed = crew.whores <= 0 ? 0 : Math.min(1, Math.max(0, 1 - covered / crew.whores));

  return {
    key,
    slug: district.slug,
    name: district.name,
    recruiting: band(
      district.whoresPerTurn,
      all.map((d) => d.whoresPerTurn),
    ),
    money: band(
      district.payMultiplier,
      all.map((d) => d.payMultiplier),
    ),
    expectedWhoresPerTurn: round2(expected.whores),
    expectedThugsPerTurn: round2(expected.thugs),
    protectionWhoresPerThug: district.protectionWhoresPerThug,
    /** Girls this crew could cover on this block. */
    coveredWhores: covered,
    exposedFraction: round2(exposed),
  };
}

export function findDistrict(
  ruleset: Ruleset,
  key: string,
): { key: DistrictKey; district: District } | null {
  const districts: Record<string, District> = ruleset.districts;
  const normalized = key.trim().toUpperCase();

  const district = Object.hasOwn(districts, normalized) ? districts[normalized] : undefined;

  return district ? { key: normalized as DistrictKey, district } : null;
}

export function districtsFor(ruleset: Ruleset, crew: Crew): DistrictsDto {
  const all = Object.values(ruleset.districts);
  const caps = ruleset.scouting.recruitment;

  return {
    districts: Object.entries(ruleset.districts).map(([key, district]) =>
      toDistrictDto(key, district, all, ruleset, crew),
    ),
    recruitment: {
      whores: recruitmentMultiplier(crew.whores, caps.whoreSoftCap),
      thugs: recruitmentMultiplier(crew.thugs, caps.thugSoftCap),
    },
  };
}

export interface ScoutInput {
  district: string;
  turns: number;
  actionId?: string;
}

export const ScoutService = {
  /** Section 25. What the player picks between, priced for the crew they run. */
  districts: districtsFor,

  /**
   * Section 26. Turns spent looking for people.
   *
   * Nobody is working, so nothing is earned, nothing is consumed and nobody
   * comes home tired. Money is what Work the Streets is for.
   */
  scout(
    prisma: PrismaClient,
    roundPlayerId: string,
    input: ScoutInput,
    rng?: Rng,
  ): Promise<GameActionResult<ScoutResult>> {
    return ActionService.run<ScoutResult>(prisma, roundPlayerId, {
      action: 'SCOUT',
      actionId: input.actionId,

      execute: ({ current, whoreHappiness, thugHappiness, player, ruleset }) => {
        const found = findDistrict(ruleset, input.district);
        if (!found) {
          throw AppError.badRequest(
            'UNKNOWN_DISTRICT',
            'That is not a district you can scout.',
            { district: 'Pick one of the listed districts.' },
          );
        }

        if (input.turns < ruleset.scouting.minTurns) {
          throw AppError.badRequest(
            'TURNS_TOO_LOW',
            `Scouting costs at least ${ruleset.scouting.minTurns} turn.`,
            { turns: 'Spend at least one turn.' },
          );
        }

        assertTurns(current.turns, input.turns);

        const outcome = calculateScout({
          player: { ...current, whoreHappiness, thugHappiness },
          turns: input.turns,
          ruleset,
          city: player.city,
          district: found.key,
          rng,
        });

        const next = {
          ...current,
          turns: current.turns - input.turns,
          whores: current.whores + outcome.whoresRecruited,
          thugs: current.thugs + outcome.thugsRecruited,
        };

        const all = Object.values(ruleset.districts);

        const result: ScoutResult = {
          district: toDistrictDto(found.key, found.district, all, ruleset, current),
          whoresRecruited: outcome.whoresRecruited,
          thugsRecruited: outcome.thugsRecruited,
          recruitmentMultipliers: {
            whores: round2(outcome.recruitmentMultipliers.whores),
            thugs: round2(outcome.recruitmentMultipliers.thugs),
          },
          turnsUsed: input.turns,
          turnsRemaining: next.turns,
        };

        return {
          next,
          result,
          activity: {
            type: 'SCOUT',
            payload: {
              district: found.district.name,
              turns: input.turns,
              whores: outcome.whoresRecruited,
              thugs: outcome.thugsRecruited,
            },
          },
        };
      },
    });
  },
};
