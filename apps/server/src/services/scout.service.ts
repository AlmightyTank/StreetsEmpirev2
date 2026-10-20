import type { PrismaClient } from '@prisma/client';
import { armedThugsForStreet, calculateScout, cityModifiers, districtCapacities, unarmedThugsForStreet, type Rng } from '@streets/rules-engine';
import type { District, DistrictKey, Ruleset } from '@streets/rulesets';
import type { DistrictDto, DistrictsDto, GameActionResult, ScoutResult } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns, fitThugs, workingWhores } from './action.service.js';
import { BossTripSettleService } from './boss-trip-settle.service.js';
import { HeatService } from './heat.service.js';
import { tripCaseEvidence } from './law.service.js';
import { hideoutBackOfficeBonusCents } from './hideout.service.js';
import { CRACK, ProductInventoryService, streetProductFinds, summarizeProductMovements } from './product-inventory.service.js';
import { TurfService } from './turf.service.js';
import { TimedFavorService } from './timed-favor.service.js';
import { toPlanDto, WorkSupplyService } from './work-supply.service.js';
import { encounterActivityPayload, RandomEncounterService } from './random-encounter.service.js';
import { PermanentUnlockService } from './permanent-unlock.service.js';
import { CrewRosterService } from './crew-roster.service.js';
import { CityConditionService } from './city-condition.service.js';

export interface Crew {
  whores: number;
  thugs: number;
  pistols?: number;
  shotguns?: number;
  tek9s?: number;
  ak47s?: number;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

function localDistrict(ruleset: Ruleset, citySlug: string | undefined, key: DistrictKey, district: District) {
  const local = citySlug ? ruleset.cities?.[citySlug]?.districts?.[key] : undefined;
  return {
    name: local?.name ?? district.name,
    blurb: local?.blurb,
  };
}

export function toDistrictDto(
  key: string,
  district: District,
  all: District[],
  ruleset: Ruleset,
  crew: Crew,
  citySlug?: string,
): DistrictDto {
  // Crew must already be the street crew (fit thugs + working whores).
  // Use ScoutService.districts for raw player rows; it strips posted/busy/etc.
  const armedThugs = armedThugsForStreet(crew, ruleset);
  const unarmedThugs = unarmedThugsForStreet(crew, ruleset);
  const covered = armedThugs * district.protectionWhoresPerThug;
  const exposed = crew.whores <= 0 ? 0 : Math.min(1, Math.max(0, 1 - covered / crew.whores));

  const local = localDistrict(ruleset, citySlug, key as DistrictKey, district);

  return {
    key,
    slug: district.slug,
    name: local.name,
    ...(local.blurb ? { blurb: local.blurb } : {}),
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

export function districtsFor(ruleset: Ruleset, crew: Crew, citySlug?: string, access: Awaited<ReturnType<typeof PermanentUnlockService.districtAccess>> = new Map()): DistrictsDto {
  const all = Object.values(ruleset.districts);
  return {
    districts: Object.entries(ruleset.districts).map(([key, district]) => {
      const dto = toDistrictDto(key, district, all, ruleset, crew, citySlug);
      const gate = access.get(key as DistrictKey);
      return gate ? { ...dto, districtAccess: {
        unlocked: gate.unlocked,
        unlockName: gate.unlock.name,
        unlockDescription: gate.unlock.description,
        unlockQuest: PermanentUnlockService.questFor(ruleset, gate.unlock.key),
      } } : dto;
    }),
  };
}

export interface ScoutInput {
  district: string;
  turns: number;
  crewMemberIds?: string[];
  actionId?: string;
}

export const ScoutService = {
  /** Section 25. What the player picks between, priced for the crew they run. */
  async districts(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, crew: Crew, citySlug?: string): Promise<DistrictsDto> {
    const access = await PermanentUnlockService.districtAccess(prisma, roundPlayerId, ruleset);
    // Preview must use the street crew: posted/busy/business/dealer thugs hold
    // corners or other jobs and never count as cover. Callers may pass the raw
    // RoundPlayer row (total thugs + home guns), which would otherwise show
    // posted armed guards as "unarmed not covering".
    const raw = crew as Crew & Partial<{ woundedThugs: number; busyThugs: number; postedThugs: number; businessThugs: number; dealerThugs: number; businessWhores: number }>;
    const hasAvailability =
      typeof raw.postedThugs === 'number' ||
      typeof raw.busyThugs === 'number' ||
      typeof raw.businessThugs === 'number' ||
      typeof raw.dealerThugs === 'number' ||
      typeof raw.woundedThugs === 'number' ||
      typeof raw.businessWhores === 'number';
    const active: Crew = hasAvailability
      ? {
          ...crew,
          thugs: fitThugs({
            thugs: raw.thugs,
            woundedThugs: raw.woundedThugs ?? 0,
            busyThugs: raw.busyThugs,
            postedThugs: raw.postedThugs,
            businessThugs: raw.businessThugs,
            dealerThugs: raw.dealerThugs,
          }),
          whores: workingWhores({ whores: raw.whores, businessWhores: raw.businessWhores }),
        }
      : crew;
    return districtsFor(ruleset, active, citySlug, access);
  },

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

      execute: async ({ tx, current, whoreHappiness, thugHappiness, player, ruleset, round, now, skills }) => {
        const found = findDistrict(ruleset, input.district);
        if (!found) {
          throw AppError.badRequest(
            'UNKNOWN_DISTRICT',
            'That is not a district you can scout.',
            { district: 'Pick one of the listed districts.' },
          );
        }

        await PermanentUnlockService.assertCanAccessDistrict(tx, roundPlayerId, ruleset, found.key);

        if (input.turns < ruleset.scouting.minTurns) {
          throw AppError.badRequest(
            'TURNS_TOO_LOW',
            `Scouting costs at least ${ruleset.scouting.minTurns} turn.`,
            { turns: 'Spend at least one turn.' },
          );
        }

        assertTurns(current.turns, input.turns);
        // 1.1.0-B: business staff are counted but never work the street or a shift.
        const active = { ...current, thugs: fitThugs(current), whores: workingWhores(current) };

        // Who is out on that block this hour. Derived from the round clock,
        // shared by everyone in the round, and never shown before you go.
        const capacities = districtCapacities(round.id, now, ruleset);

        // 0.4.0-B: which products this district burns, sliced across the trip.
        const supply = ruleset.workSupply
          ? await WorkSupplyService.plan(tx, roundPlayerId, ruleset, { job: found.key, workers: active.whores, turns: input.turns, crack: current.crack })
          : undefined;
        if (supply) await WorkSupplyService.consume(tx, roundPlayerId, ruleset, supply);

        const favorBonuses = await TimedFavorService.bonuses(tx, roundPlayerId, ruleset, now);
        const cityConditionBonuses = await CityConditionService.bonuses(tx, {
          round, cityId: player.cityId, ruleset, action: 'SCOUT', district: found.key, now,
        });
        await CrewRosterService.sync(tx, roundPlayerId, ruleset, now);
        const scoutCareerBonus = input.crewMemberIds
          ? await CrewRosterService.selectedSpecialtyBonusPercent(tx, roundPlayerId, ruleset, 'WORKER', 'SCOUT', input.crewMemberIds)
          : await CrewRosterService.specialtyBonusPercent(tx, roundPlayerId, ruleset, 'WORKER', 'SCOUT');
        const combinedRecruitmentPercent = favorBonuses.scoutRecruitmentPercent + cityConditionBonuses.recruitPercent;
        const scoutRuleset: Ruleset = favorBonuses.scoutIncomePercent > 0 || combinedRecruitmentPercent > 0
          ? {
              ...ruleset,
              scouting: {
                ...ruleset.scouting,
                grossPerWhorePerTurnCents: Math.max(
                  1,
                  Math.round(ruleset.scouting.grossPerWhorePerTurnCents * (100 + favorBonuses.scoutIncomePercent) / 100),
                ),
                districts: {
                  ...ruleset.scouting.districts,
                  [found.key]: {
                    ...ruleset.scouting.districts[found.key],
                    whoresPerTurn: ruleset.scouting.districts[found.key].whoresPerTurn
                      * (100 + combinedRecruitmentPercent) / 100,
                    thugsPerTurn: ruleset.scouting.districts[found.key].thugsPerTurn
                      * (100 + combinedRecruitmentPercent) / 100,
                  },
                },
              },
            }
          : ruleset;
        const effectiveScoutRuleset: Ruleset = scoutCareerBonus > 0 ? {
          ...scoutRuleset,
          scouting: { ...scoutRuleset.scouting, grossPerWhorePerTurnCents: Math.max(1, Math.round(scoutRuleset.scouting.grossPerWhorePerTurnCents * (100 + scoutCareerBonus) / 100)) },
        } : scoutRuleset;
        const outcome = calculateScout({
          supply,
          heat: current.heat,
          // Sweet Talker: the girls work as if a little happier.
          player: { ...active, whoreHappiness: Math.min(100, whoreHappiness + skills.percent('CREW_WORK_HAPPINESS')), thugHappiness },
          turns: input.turns,
          ruleset: effectiveScoutRuleset,
          city: cityModifiers(ruleset, player.city.slug),
          district: found.key,
          clientCapacity: capacities[found.key],
          payoutPercent: current.payoutPercent,
          rng,
        });
        const productsFound = streetProductFinds(
          ruleset,
          player.city.slug,
          outcome.crackFound,
          rng ?? Math.random,
        );
        const crackFound = productsFound.find((row) => row.key === CRACK)?.quantity ?? 0;
        const otherFound = Object.fromEntries(
          productsFound.filter((row) => row.key !== CRACK).map((row) => [row.key, row.quantity]),
        );
        if (Object.keys(otherFound).length) {
          await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, otherFound);
        }
        const turf = await TurfService.scoutEconomy(tx, {
          roundPlayerId,
          accountId: player.accountId,
          roundId: round.id,
          cityId: player.cityId,
          district: found.key,
          takeCents: Number(outcome.pimpTakeCents),
          ruleset,
          now,
        });
        // Hustle: the crew's take comes in a little larger.
        const crewIncomePercent = outcome.pimpTakeCents > 0n ? skills.percent('CREW_INCOME') : 0;
        const crewTakeCents = outcome.pimpTakeCents + outcome.pimpTakeCents * BigInt(Math.round(crewIncomePercent * 100)) / 10_000n;
        const turfTakeCents = crewTakeCents + BigInt(turf.holdBonusCents - turf.taxPaidCents);
        const hideoutBonusCents = hideoutBackOfficeBonusCents(turfTakeCents, ruleset, current);
        // Trips A: with the boss away, the lieutenant skims the take before it lands.
        const lieutenantCutCents = await BossTripSettleService.lieutenantCut(tx, roundPlayerId, ruleset, turfTakeCents + hideoutBonusCents, now);
        const pimpTakeCents = turfTakeCents + hideoutBonusCents - lieutenantCutCents;

        const worked = {
          ...current,
          turns: current.turns - input.turns,

          // Manual 3.1: this is where you make money for yourself.
          cashCents: current.cashCents + pimpTakeCents,

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
          crack: current.crack - outcome.consumption.crack + crackFound,
          beer: current.beer - outcome.consumption.beer,
        };

        // 0.4.0-C: the trip's Heat lands, and a hot crew can be busted on the way home.
        const trip = await HeatService.afterTrip(tx, roundPlayerId, ruleset, { startHeat: current.heat, plans: [supply], next: worked, rng, now });
        let next = trip.next;
        await TurfService.addPresence(tx, {
          roundPlayerId,
          roundId: round.id,
          cityId: player.cityId,
          district: found.key,
          turns: input.turns,
          ruleset,
          now,
        });
        const encounter = await RandomEncounterService.scout({
          tx,
          roundPlayerId,
          next,
          ruleset,
          district: found.key,
          turns: input.turns,
          now,
          rng,
        });
        next = encounter.next;

        const all = Object.values(ruleset.districts);

        const result: ScoutResult = {
          district: toDistrictDto(found.key, found.district, all, ruleset, active, player.city.slug),
          ...(ruleset.turf?.holding ? { turf } : {}),
          ...(supply ? { supply: toPlanDto(supply, ruleset) } : {}),
          ...(trip.heat ? { heat: trip.heat } : {}),

          whoresRecruited: outcome.whoresRecruited,
          thugsRecruited: outcome.thugsRecruited,

          grossEarnedCents: Number(outcome.grossCents),
          crewTakeCents: Number(outcome.crewTakeCents),
          cashEarnedCents: Number(pimpTakeCents),
          hideoutBonusCents: Number(hideoutBonusCents),
          ...(lieutenantCutCents > 0n ? { lieutenantCutCents: Number(lieutenantCutCents) } : {}),
          ...(favorBonuses.scoutIncomePercent > 0 ? { favorIncomePercent: favorBonuses.scoutIncomePercent } : {}),
          ...(favorBonuses.scoutRecruitmentPercent > 0 ? { favorRecruitmentPercent: favorBonuses.scoutRecruitmentPercent } : {}),
          ...(cityConditionBonuses.recruitPercent > 0 ? { cityConditionBonusPercent: cityConditionBonuses.recruitPercent } : {}),
          payoutPercent: current.payoutPercent,

          crackFound,
          ...(ruleset.productEconomy ? { productsFound } : {}),
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

          ...(encounter.encounter ? { encounter: encounter.encounter } : {}),

          turnsUsed: input.turns,
          turnsRemaining: next.turns,
        };

        const local = localDistrict(ruleset, player.city.slug, found.key, found.district);

        await CrewRosterService.awardCompletedWork(tx, { roundPlayerId, ruleset, role: 'WORKER', specialty: 'SCOUT', ...(input.crewMemberIds ? { memberIds: input.crewMemberIds } : {}), at: now, label: 'Scouting trip complete', sourceKey: `SCOUT:${input.actionId}` });
        return {
          next,
          result,
          activity: {
            type: 'SCOUT',
            payload: {
              district: local.name,
              districtKey: found.key,
              turns: input.turns,
              whores: outcome.whoresRecruited,
              thugs: outcome.thugsRecruited,
              cashCents: Number(pimpTakeCents),
              hideoutBonusCents: Number(hideoutBonusCents),
              ...(lieutenantCutCents > 0n ? { lieutenantCutCents: Number(lieutenantCutCents) } : {}),
              ...(favorBonuses.scoutIncomePercent > 0 ? { favorIncomePercent: favorBonuses.scoutIncomePercent } : {}),
              ...(favorBonuses.scoutRecruitmentPercent > 0 ? { favorRecruitmentPercent: favorBonuses.scoutRecruitmentPercent } : {}),
              crackFound,
              ...(ruleset.productEconomy ? {
                productsFound: productsFound.map((row) => ({ key: row.key, name: row.name, quantity: row.quantity })),
                productMovements: summarizeProductMovements(ruleset, {
                  found: productsFound,
                  consumed: [supply?.consumed],
                  seized: trip.heat?.seized,
                }).map((row) => ({
                  key: row.key,
                  name: row.name,
                  found: row.found,
                  produced: row.produced,
                  used: row.used,
                  seized: row.seized,
                  change: row.change,
                })),
              } : {}),
              whoresLeft: outcome.departures.whores,
              thugsLeft: outcome.departures.thugs,
              infected: outcome.infections.infected,
              lostToInfection: outcome.infections.lost,
              ...(trip.heat ? { heat: trip.heat.after, heatAdded: trip.heat.added, busted: trip.heat.busted, fineCents: trip.heat.fineCents } : {}),
              ...(encounter.encounter ? { encounter: encounterActivityPayload(encounter.encounter) } : {}),
            },
          },
          // 1.3.0-A/B: the Heat the trip drew, and any bust or arrest, build the Case at home.
          caseEvidence: tripCaseEvidence(trip.heat, 'SCOUT', ruleset),
        };
      },
    });
  },
};
