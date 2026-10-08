import type { Ruleset, VehicleClassId } from '@streets/rulesets';
import { hashParts, seededRng, type Rng } from '../rng.js';
import { cityHeatRules, findRoutes } from '../calculations/cities.js';
import { convoyRules } from '../calculations/convoys.js';
import { bustChance } from '../calculations/heat.js';
import { resolveRoadStop, resolveRunTrouble } from '../calculations/road-risk.js';
import {
  markRunVehicles,
  noVehicleDamage,
  runCapacity,
  vehicleLoadoutSeats,
  vehicleRiskMultiplier,
  vehicleServiceCents,
  type VehicleCounts,
  type VehicleDamage,
} from '../calculations/runs.js';
import { runTravelSimulation } from './travel.js';

/**
 * 1.5.0-E. Vehicle classes through real runs. Each scenario is a run a player plans (a load,
 * the escorts it wants, the Heat it leaves at, how hunted the road is) on the best trade the
 * travel simulation finds. Every fleet that can carry and seat it is driven through the same
 * engine the server uses: road stops and town trouble at the fleet's route risk, convoy hits,
 * the vehicle damage those leave, and what the garage charges to fix it.
 *
 * A fleet's score is what the run clears after the garage bill, a stolen car, and the share of
 * each car's purchase that net worth never gives back, spread over a round of runs.
 */

export const VEHICLE_CLASSES: readonly VehicleClassId[] = ['LOW_RIDER', 'SEDAN', 'VAN'];
export const VEHICLE_SAMPLES = 2_000;
/** Runs a car is expected to make in a round, to spread what buying it costs. */
const RUNS_PER_ROUND = 20;
const MAX_MIXED = 8;

export interface VehicleScenario {
  readonly key: string;
  readonly name: string;
  readonly units: number;
  readonly escorts: number;
  /** Heat as a share of the ruleset's max. */
  readonly heatShare: number;
  readonly convoyHitChance: number;
  readonly convoyLossChance: number;
}

export const VEHICLE_SCENARIOS: readonly VehicleScenario[] = [
  { key: 'quiet', name: 'Small, quiet job', units: 450, escorts: 2, heatShare: 0.7, convoyHitChance: 0.05, convoyLossChance: 0.5 },
  { key: 'haul', name: 'Big haul', units: 3_300, escorts: 6, heatShare: 0.2, convoyHitChance: 0.15, convoyLossChance: 0.4 },
  { key: 'escorted', name: 'Escorted run', units: 1_200, escorts: 24, heatShare: 0.3, convoyHitChance: 0.35, convoyLossChance: 0.35 },
  { key: 'hot', name: 'Hot road', units: 1_500, escorts: 6, heatShare: 0.85, convoyHitChance: 0.1, convoyLossChance: 0.4 },
];

export interface FleetResult {
  fleet: VehicleCounts;
  label: string;
  vehicles: number;
  riskMultiplier: number;
  meanNetCents: number;
  meanServiceCents: number;
  meanCapitalCents: number;
  damagedPer100: number;
  disabledPer100: number;
  stolenPer100: number;
  troublePer100: number;
}

export interface ScenarioResult {
  scenario: VehicleScenario;
  marginPerUnitCents: number;
  route: { buyCity: string; sellCity: string };
  singles: FleetResult[];
  bestSingle: VehicleClassId;
  bestMixed: FleetResult;
}

export interface VehicleSimulation {
  rulesetId: string;
  scenarios: ScenarioResult[];
}

const label = (fleet: VehicleCounts) => VEHICLE_CLASSES.filter((key) => fleet[key] > 0).map((key) => `${fleet[key]} ${key === 'LOW_RIDER' ? 'LR' : key === 'SEDAN' ? 'Sedan' : 'Van'}`).join(' + ');
const total = (fleet: VehicleCounts) => fleet.LOW_RIDER + fleet.SEDAN + fleet.VAN;

function legRoute(ruleset: Ruleset, from: string, to: string): string[] {
  return from === to ? [from] : findRoutes(ruleset, from, to)[0]?.cities ?? [from, to];
}

/** The class's purchase price, and what net worth still counts it at. */
function classPrice(ruleset: Ruleset, classId: VehicleClassId): number {
  const listed = ruleset.vehicleCatalog?.classes.find((entry) => entry.id === classId)?.purchasePriceCents;
  return listed ?? ruleset.stores.CHARLIE?.items.LOW_RIDER?.buyCents ?? 0;
}

function capitalPerRun(ruleset: Ruleset, fleet: VehicleCounts): number {
  const value = ruleset.economy.netWorth.perLowRiderCents;
  return VEHICLE_CLASSES.reduce((sum, key) => sum + fleet[key] * Math.max(0, classPrice(ruleset, key) - value), 0) / RUNS_PER_ROUND;
}

/** What one run clears for this fleet, driven once. */
function driveOnce(ruleset: Ruleset, scenario: VehicleScenario, trade: { buyCity: string; sellCity: string; marginPerUnitCents: number }, fleet: VehicleCounts, rng: Rng) {
  const home = ruleset.round.startingCitySlug;
  const riskMultiplier = vehicleRiskMultiplier(ruleset, fleet);
  const heat = Math.round((ruleset.heat?.max ?? 100) * scenario.heatShare);
  const units = Math.min(scenario.units, runCapacity(ruleset, fleet));
  const cargo: Record<string, number> = {};
  let cash = 0n;
  let fines = 0n;
  let damage: VehicleDamage = noVehicleDamage();
  let loadout = { ...fleet };
  let stolenCents = 0;
  let stolen = 0;
  let trouble = false;
  const service = ruleset.vehicleCatalog?.service;

  const drive = (from: string, to: string) => {
    const route = legRoute(ruleset, from, to);
    if (route.length < 2) return;
    const stop = resolveRoadStop(ruleset, { route, cargo, cashCents: cash, escorts: scenario.escorts, heat, rng, riskMultiplier });
    if (!stop.stopped) return;
    for (const [key, seized] of Object.entries(stop.seized)) cargo[key] = Math.max(0, (cargo[key] ?? 0) - seized);
    fines += stop.fineCents;
  };

  drive(home, trade.buyCity);
  cargo.LOAD = units;
  drive(trade.buyCity, trade.sellCity);

  const town = { ...ruleset, heat: cityHeatRules(ruleset, trade.sellCity) };
  const roll = resolveRunTrouble({ heat, cashCents: cash, cargo, ruleset: town, bustChance: bustChance(heat, town), riskMultiplier, rng });
  if (roll.kind) {
    trouble = true;
    for (const [key, seized] of Object.entries(roll.seized)) cargo[key] = Math.max(0, (cargo[key] ?? 0) - seized);
    fines += roll.fineCents;
    if (service) damage = markRunVehicles(ruleset, loadout, damage, roll.kind === 'ARREST' ? 'disabled' : 'damaged', roll.kind === 'ARREST' ? service.disable.arrest : service.damage.bust);
  }

  if (rng() < scenario.convoyHitChance && rng() < scenario.convoyLossChance) {
    const loot = convoyRules(ruleset)?.loot;
    const share = loot ? (loot.cargoPercent.min + rng() * (loot.cargoPercent.max - loot.cargoPercent.min)) / 100 : 0.25;
    cargo.LOAD = Math.floor((cargo.LOAD ?? 0) * (1 - share));
    const escortDown = rng() < 0.5;
    if (escortDown && total(loadout) > 1 && rng() < (loot?.lowRiderChance ?? 0)) {
      if (service && loadout.LOW_RIDER === 0) {
        damage = markRunVehicles(ruleset, loadout, damage, 'disabled', 1);
      } else {
        const taken: VehicleClassId = loadout.LOW_RIDER > 0 ? 'LOW_RIDER' : loadout.SEDAN > 0 ? 'SEDAN' : 'VAN';
        loadout = { ...loadout, [taken]: loadout[taken] - 1 };
        stolenCents += classPrice(ruleset, taken);
        stolen += 1;
      }
    }
    if (service) damage = markRunVehicles(ruleset, loadout, damage, 'damaged', service.damage.convoyLoss);
  }

  const serviceCents = VEHICLE_CLASSES.reduce((sum, key) =>
    sum + Number(vehicleServiceCents(ruleset, key, 'REPAIR', damage.damaged[key]) ?? 0n) + Number(vehicleServiceCents(ruleset, key, 'RECOVER', damage.disabled[key]) ?? 0n), 0);
  const sold = cargo.LOAD ?? 0;
  const gross = sold * trade.marginPerUnitCents - Number(fines);
  return {
    netCents: gross - serviceCents - stolenCents,
    serviceCents,
    damaged: VEHICLE_CLASSES.reduce((sum, key) => sum + damage.damaged[key], 0),
    disabled: VEHICLE_CLASSES.reduce((sum, key) => sum + damage.disabled[key], 0),
    stolen,
    trouble,
  };
}

function scoreFleet(ruleset: Ruleset, scenario: VehicleScenario, trade: { buyCity: string; sellCity: string; marginPerUnitCents: number }, fleet: VehicleCounts, samples: number): FleetResult {
  // Paired draws: sample n is the same road, the same police and the same convoy for every
  // fleet and every ruleset, so a difference between fleets is the fleet's, not the dice's.
  let net = 0;
  let serviceCents = 0;
  let damaged = 0;
  let disabled = 0;
  let stolen = 0;
  let trouble = 0;
  for (let sample = 0; sample < samples; sample++) {
    const run = driveOnce(ruleset, scenario, trade, fleet, seededRng(hashParts('vehicles', scenario.key, sample)));
    net += run.netCents;
    serviceCents += run.serviceCents;
    damaged += run.damaged;
    disabled += run.disabled;
    stolen += run.stolen;
    trouble += run.trouble ? 1 : 0;
  }
  const capital = capitalPerRun(ruleset, fleet);
  return {
    fleet,
    label: label(fleet),
    vehicles: total(fleet),
    riskMultiplier: vehicleRiskMultiplier(ruleset, fleet),
    meanNetCents: net / samples - capital,
    meanServiceCents: serviceCents / samples,
    meanCapitalCents: capital,
    damagedPer100: (damaged / samples) * 100,
    disabledPer100: (disabled / samples) * 100,
    stolenPer100: (stolen / samples) * 100,
    troublePer100: (trouble / samples) * 100,
  };
}

/** Fewest of one class that carries the load and seats the escorts. */
export function singleClassFleet(ruleset: Ruleset, classId: VehicleClassId, scenario: VehicleScenario): VehicleCounts {
  const fleet: VehicleCounts = { LOW_RIDER: 0, SEDAN: 0, VAN: 0 };
  while (runCapacity(ruleset, fleet) < scenario.units || vehicleLoadoutSeats(ruleset, fleet) < scenario.escorts) fleet[classId] += 1;
  return fleet;
}

/** Every mix up to `MAX_MIXED` of each class that carries and seats the run, with no spare car. */
function mixedFleets(ruleset: Ruleset, scenario: VehicleScenario): VehicleCounts[] {
  const fleets: VehicleCounts[] = [];
  for (let lr = 0; lr <= MAX_MIXED; lr++) {
    for (let sedan = 0; sedan <= MAX_MIXED; sedan++) {
      for (let van = 0; van <= MAX_MIXED; van++) {
        const fleet = { LOW_RIDER: lr, SEDAN: sedan, VAN: van };
        const fits = (candidate: VehicleCounts) => runCapacity(ruleset, candidate) >= scenario.units && vehicleLoadoutSeats(ruleset, candidate) >= scenario.escorts;
        if (!total(fleet) || !fits(fleet)) continue;
        // No car the run could leave at home.
        if (VEHICLE_CLASSES.some((key) => fleet[key] > 0 && fits({ ...fleet, [key]: fleet[key] - 1 }))) continue;
        fleets.push(fleet);
      }
    }
  }
  return fleets;
}

export function runVehicleSimulation(ruleset: Ruleset, samples = VEHICLE_SAMPLES): VehicleSimulation {
  if (!ruleset.vehicleCatalog?.service) throw new Error(`${ruleset.meta.id} has no garage service.`);
  // The best trade a mid-round crew finds, so every scenario runs a route worth driving.
  const crew = runTravelSimulation(ruleset).find((summary) => summary.crew.name === 'Mid-round') ?? runTravelSimulation(ruleset)[0]!;
  const best = [...crew.trades].sort((a, b) => b.profitCents - a.profitCents)[0]!;
  const trade = { buyCity: best.buyCity, sellCity: best.sellCity, marginPerUnitCents: best.profitCents / Math.max(1, best.units) };
  const scenarios = VEHICLE_SCENARIOS.map((scenario): ScenarioResult => {
    const singles = VEHICLE_CLASSES.map((classId) => scoreFleet(ruleset, scenario, trade, singleClassFleet(ruleset, classId, scenario), samples));
    const winner = singles.reduce((top, entry) => (entry.meanNetCents > top.meanNetCents ? entry : top));
    const mixed = mixedFleets(ruleset, scenario).map((fleet) => scoreFleet(ruleset, scenario, trade, fleet, samples));
    const bestMixed = mixed.reduce((top, entry) => (entry.meanNetCents > top.meanNetCents ? entry : top), mixed[0]!);
    return {
      scenario,
      marginPerUnitCents: trade.marginPerUnitCents,
      route: { buyCity: trade.buyCity, sellCity: trade.sellCity },
      singles,
      bestSingle: VEHICLE_CLASSES.find((key) => winner.fleet[key] > 0)!,
      bestMixed,
    };
  });
  return { rulesetId: ruleset.meta.id, scenarios };
}

/** A class is a reasonable pick where its fleet clears at least this share of the best fleet's run. */
export const VEHICLE_REASONABLE_SHARE = 0.97;
/** No class is a must-have: the best fleet leads the next class by less than this share. */
export const VEHICLE_MAX_LEAD = 0.05;

/** How far each class's single-class fleet sits behind the scenario's best, as a share of it (0 = best). */
export function classGaps(entry: ScenarioResult): Record<VehicleClassId, number> {
  const best = Math.max(...entry.singles.map((fleet) => fleet.meanNetCents));
  return Object.fromEntries(VEHICLE_CLASSES.map((classId) => {
    const fleet = entry.singles.find((single) => single.fleet[classId] > 0)!;
    return [classId, best > 0 ? (best - fleet.meanNetCents) / best : 0];
  })) as Record<VehicleClassId, number>;
}

/**
 * The 1.5 release gate. On a route worth driving the trade dwarfs what cars cost, so classes
 * land close together; the gate asks for real choices, not an outright winner per class.
 * - Every class is a reasonable pick somewhere: within 3% of the best fleet in some scenario.
 * - No class is a must-have: in every scenario the best leads the next class by under 5%.
 * - The garage is a cost, not a tax: no reasonable fleet spends over 10% of its run on service.
 * - No class makes a run safe: every fleet still meets trouble on the hot road.
 * - Repairs < recovery < half a new car, and net worth never counts a car above its price.
 * - Road specialization stays small: its cap is under 50%.
 */
export function vehicleGate(ruleset: Ruleset, result: VehicleSimulation): string[] {
  const problems: string[] = [];
  for (const classId of VEHICLE_CLASSES) {
    const closest = Math.min(...result.scenarios.map((entry) => classGaps(entry)[classId]));
    if (closest > 1 - VEHICLE_REASONABLE_SHARE) {
      problems.push(`${classId} is never within ${Math.round((1 - VEHICLE_REASONABLE_SHARE) * 100)}% of the best fleet (closest ${(closest * 100).toFixed(1)}% behind).`);
    }
  }
  for (const entry of result.scenarios) {
    const gaps = classGaps(entry);
    const runnerUp = Math.min(...Object.values(gaps).filter((gap) => gap > 0));
    if (Number.isFinite(runnerUp) && runnerUp >= VEHICLE_MAX_LEAD) {
      problems.push(`${entry.scenario.name}: ${entry.bestSingle} leads every other class by ${(runnerUp * 100).toFixed(1)}%.`);
    }
    for (const fleet of entry.singles) {
      const classId = VEHICLE_CLASSES.find((key) => fleet.fleet[key] > 0)!;
      if (gaps[classId] > 1 - VEHICLE_REASONABLE_SHARE) continue;
      if (fleet.meanNetCents > 0 && fleet.meanServiceCents > fleet.meanNetCents * 0.1) {
        problems.push(`${entry.scenario.name}: ${fleet.label} spends ${Math.round((fleet.meanServiceCents / fleet.meanNetCents) * 100)}% of its run on the garage.`);
      }
    }
  }
  const hot = result.scenarios.find((entry) => entry.scenario.key === 'hot');
  for (const fleet of hot?.singles ?? []) {
    if (fleet.troublePer100 <= 0) problems.push(`${fleet.label} never meets trouble on the hot road.`);
  }
  const service = ruleset.vehicleCatalog!.service!;
  const value = ruleset.economy.netWorth.perLowRiderCents;
  for (const classId of VEHICLE_CLASSES) {
    const price = classPrice(ruleset, classId);
    if (!(service.repairCents[classId] < service.recoveryCents[classId] && service.recoveryCents[classId] < price / 2)) {
      problems.push(`${classId}: repair, recovery and price are out of order.`);
    }
    if (value > price) problems.push(`${classId}: net worth counts it above its price.`);
  }
  if ((service.specialization?.maxDiscountPercent ?? 0) >= 50) problems.push('Road specialization can take half or more off service.');
  return problems;
}

const money = (cents: number) => `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;

export function vehicleMarkdown(ruleset: Ruleset, result: VehicleSimulation): string {
  const lines = [
    `# Vehicles - ${ruleset.meta.version}`,
    '',
    `Every scenario runs ${result.scenarios[0]?.route.buyCity} → ${result.scenarios[0]?.route.sellCity}, the best mid-round trade, at ${money(result.scenarios[0]?.marginPerUnitCents ?? 0)} a unit. "Net" is per run, after fines, seizures, convoy loot, the garage, stolen cars and the unrecovered share of each car's price over ${RUNS_PER_ROUND} runs.`,
    '',
  ];
  for (const entry of result.scenarios) {
    const { scenario } = entry;
    lines.push(`## ${scenario.name}`, '', `${scenario.units.toLocaleString('en-US')} units, ${scenario.escorts} escorts, Heat at ${Math.round(scenario.heatShare * 100)}% of max, ${Math.round(scenario.convoyHitChance * 100)}% convoy hit chance.`, '');
    lines.push('| Fleet | Risk | Net / run | Behind best | Garage / run | Capital / run | Trouble / 100 | Damaged / 100 | Disabled / 100 | Stolen / 100 |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
    const gaps = classGaps(entry);
    const best = Math.max(...entry.singles.map((fleet) => fleet.meanNetCents));
    for (const fleet of [...entry.singles, entry.bestMixed]) {
      const mixed = fleet === entry.bestMixed;
      const classId = VEHICLE_CLASSES.find((key) => fleet.fleet[key] > 0)!;
      const gap = mixed ? (best - fleet.meanNetCents) / best : gaps[classId];
      const name = mixed ? `${fleet.label} (best mix)` : gap === 0 ? `**${fleet.label}**` : fleet.label;
      const behind = gap > 0 ? `${(gap * 100).toFixed(1)}%` : mixed && gap < 0 ? `+${(-gap * 100).toFixed(1)}%` : 'best';
      lines.push(`| ${name} | ${fleet.riskMultiplier.toFixed(2)} | ${money(fleet.meanNetCents)} | ${behind} | ${money(fleet.meanServiceCents)} | ${money(fleet.meanCapitalCents)} | ${fleet.troublePer100.toFixed(1)} | ${fleet.damagedPer100.toFixed(1)} | ${fleet.disabledPer100.toFixed(1)} | ${fleet.stolenPer100.toFixed(1)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
