import type { PrismaClient } from '@prisma/client';
import { armedThugsForStreet, calculateScout, districtCapacities, unarmedThugsForStreet, type Rng } from '@streets/rules-engine';
import type { District, DistrictKey, Ruleset } from '@streets/rulesets';
import type { DistrictDto, DistrictsDto, GameActionResult, ScoutResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs } from './action.service.js';

export interface Crew {
  whores: number;
  thugs: number;
  pistols?: number;
  shotguns?: number;
  tek9s?: number;
  ak47s?: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function toDistrictDto(
  key: string,
  district: District,
  all: District[],
  ruleset: Ruleset,
  crew: Crew,
): DistrictDto {
  const armedThugs = armedThugsForStreet(crew, ruleset);
  const unarmedThugs = unarmedThugsForStreet(crew, ruleset);
  const covered = armedThugs * district.protectionWhoresPerThug;
  const exposed = crew.whores <= 0 ? 0 : Math.min(1, Math.max(0, 1 - covered / crew.whores));

  return {
    key,
    slug: district.slug,
    name: district.name,
    protectionWhoresPerThug: district.protectionWhoresPerThug,
    /** Girls this crew could cover on this block. */
    coveredWhores: covered,
    exposedFraction: round2(exposed),
    armedThugs,
    unarmedThugs,
    requiresArmedThugs: !!ruleset.scouting.requiresArmedThugs,
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

  return {
    districts: Object.entries(ruleset.districts).map(([key, district]) =>
      toDistrictDto(key, district, all, ruleset, crew),
    ),
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
   * Manual 3.1. Where you make money for yourself, and pick up whores and
   * thugs while you are there.
   *
   * The girls work the block, you work the room. Both halves of the trip come
   * out of the same turns, and the district decides how the trade lands.
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

      execute: ({ current, whoreHappiness, thugHappiness, player, ruleset, round, now }) => {
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
        const active = { ...current, thugs: fitThugs(current) };

        // Who is out on that block this hour. Derived from the round clock,
        // shared by everyone in the round, and never shown before you go.
        const capacities = districtCapacities(round.id, now, ruleset);

        const outcome = calculateScout({
          player: { ...active, whoreHappiness, thugHappiness },
          turns: input.turns,
          ruleset,
          city: player.city,
          district: found.key,
          clientCapacity: capacities[found.key],
          payoutPercent: current.payoutPercent,
          rng,
        });

        const next = {
          ...current,
          turns: current.turns - input.turns,

          // Manual 3.1: this is where you make money for yourself.
          cashCents: current.cashCents + outcome.pimpTakeCents,

          // The clerk's favour: a trip counts only if nobody went out short.
          cleanShiftStreak:
            outcome.shortages.condoms > 0 ? 0 : current.cleanShiftStreak + 1,

          whores: Math.max(
            0,
            current.whores +
              outcome.whoresRecruited -
              outcome.departures.whores -
              outcome.infections.lost,
          ),
          thugs: Math.max(
            0,
            current.thugs + outcome.thugsRecruited - outcome.departures.thugs,
          ),

          condoms: current.condoms - outcome.consumption.condoms,
          medicine: current.medicine - outcome.infections.medicineUsed,
          crack: current.crack - outcome.consumption.crack + outcome.crackFound,
          beer: current.beer - outcome.consumption.beer,
        };

        const all = Object.values(ruleset.districts);

        const result: ScoutResult = {
          district: toDistrictDto(found.key, found.district, all, ruleset, active),

          whoresRecruited: outcome.whoresRecruited,
          thugsRecruited: outcome.thugsRecruited,

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

          infected: outcome.infections.infected,
          treated: outcome.infections.treated,
          medicineUsed: outcome.infections.medicineUsed,
          lostToInfection: outcome.infections.lost,

          exposedFraction: round2(outcome.exposure.exposed),
          coveredWhores: outcome.exposure.covered,
          armedThugs: armedThugsForStreet(active, ruleset),
          unarmedThugs: unarmedThugsForStreet(active, ruleset),

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
              cashCents: Number(outcome.pimpTakeCents),
              crackFound: outcome.crackFound,
              whoresLeft: outcome.departures.whores,
              thugsLeft: outcome.departures.thugs,
              infected: outcome.infections.infected,
              lostToInfection: outcome.infections.lost,
            },
          },
        };
      },
    });
  },
};
