import type { Ruleset } from '@streets/rulesets';
import { happinessMultiplier } from '../rng.js';
import {
  airportCheckChance,
  awayHappinessPenalty,
  hotelCents,
  lodgingCents,
  tripRules,
} from '../calculations/trips.js';
import { simulateTravelRound, travelRoundStarts, travelRoundStrategies, travelRoundStyles, type TravelRoundStart, type TravelRoundStyle } from './travel-round.js';

/**
 * Trips E. Travelers against homebodies, over a whole round.
 *
 * The street is the 0.5.0-F round simulation's own (street only, from New York): its score,
 * and its worth per street turn. A traveler plays that same street and takes trips on top,
 * and pays for them in everything a trip costs:
 * - tickets, the hotel and bodyguards' lodging, out of home cash;
 * - the turns it takes to get out the door;
 * - the lieutenant's cut on every take while the boss is away, or laid up after a beating;
 * - the girls' happiness while the boss is away, which drags the take;
 * - airport security on a hot boss, both ways, and a hit on a boss in town.
 * What a trip pays is the one-off jobs that need one (Face to Face and Scope the Strip). The
 * casino will add a reason to go; until then a trip is a choice, and this checks it is not
 * a requirement: nobody who stays home is locked out of the top ranks.
 */

export interface TripPlan {
  readonly key: string;
  readonly name: string;
  readonly purpose: string;
  /** Trips over the round, each to `city`, staying `stayMinutes`. */
  readonly trips: number;
  readonly city: string;
  readonly stayMinutes: number;
  readonly bodyguards: number;
  /** Guns rented per bodyguard, if any: pistols. */
  readonly rentPistols: boolean;
  readonly bankrollCents: number;
}

export const tripPlans: readonly TripPlan[] = [
  { key: 'home', name: 'Stays home', purpose: 'Never leaves New York.', trips: 0, city: 'las-vegas', stayMinutes: 0, bodyguards: 0, rentPistols: false, bankrollCents: 0 },
  { key: 'jobs', name: 'Job trips', purpose: 'The three short flights the travel jobs need (Detroit twice, Las Vegas once), alone, nothing carried.', trips: 3, city: 'las-vegas', stayMinutes: 120, bodyguards: 0, rentPistols: false, bankrollCents: 0 },
  { key: 'weekly', name: 'Weekend in Vegas', purpose: 'Once a week, twelve hours in Las Vegas with six armed bodyguards and $25,000 to play with.', trips: 4, city: 'las-vegas', stayMinutes: 720, bodyguards: 6, rentPistols: true, bankrollCents: 2_500_000 },
  { key: 'daily', name: 'Daily flyer', purpose: 'Every day, six hours in Las Vegas, alone, $10,000 in the bankroll.', trips: 28, city: 'las-vegas', stayMinutes: 360, bodyguards: 0, rentPistols: false, bankrollCents: 1_000_000 },
];

/** What a single-player model cannot know about everyone else. Set for a busy round. */
export const TRIPS_ROUND_WORLD = {
  /** The chance a boss in town is hit on a given trip, alone. Hunters need a recon to spot them first. */
  hitChanceAlone: 0.2,
  /** Bodyguards make a boss a harder find and a harder fight: the chance a hit gets through. */
  hitThroughGuards: 0.3,
  /** The squad a hunter sends, for the loot cap. */
  hunterSquad: 10,
} as const;

/** The travel jobs' cash, collected once: Face to Face ($15,000) and Scope the Strip ($30,000). */
const JOB_REWARDS_CENTS = 1_500_000 + 3_000_000;

export interface TripsRoundSummary {
  readonly style: string;
  readonly start: string;
  readonly plan: string;
  readonly planName: string;
  readonly scoreCents: number;
  readonly homeScoreCents: number;
  /** Score against staying home, as a share: +0.01 is 1% ahead. */
  readonly edge: number;
  readonly costCents: number;
  readonly rewardCents: number;
  readonly awayHours: number;
}

function perTurnValue(ruleset: Ruleset, style: TravelRoundStyle, start: TravelRoundStart): { value: number; score: number; heat: number; cashShare: number } {
  const street = travelRoundStrategies.find((strategy) => strategy.key === 'street')!;
  const end = simulateTravelRound(ruleset, { style, start, strategy: street, home: 'new-york-city' });
  const begin = simulateTravelRound(ruleset, { style, start, strategy: street, home: 'new-york-city', days: 0 });
  const gained = Math.max(1, end.scoreCents - begin.scoreCents);
  const weight = ruleset.economy.netWorth.cashWeightPercent / 100;
  const cashShare = Math.min(1, Math.max(0, ((end.cashCents - start.cashCents) * weight) / gained));
  return { value: gained / Math.max(1, end.streetTurns), score: end.scoreCents, heat: end.averageHeat, cashShare };
}

/** Average points off happiness over a stay of `hours` away. */
function averagePenalty(ruleset: Ruleset, hours: number): number {
  const rules = tripRules(ruleset);
  if (!rules || hours <= 0) return 0;
  const steps = Math.max(1, Math.round(hours * 4));
  let sum = 0;
  for (let step = 0; step < steps; step++) {
    const at = new Date(((step + 0.5) / steps) * hours * 3_600_000);
    sum += awayHappinessPenalty(rules, new Date(0), at);
  }
  return sum / steps;
}

export function simulateTripsRound(ruleset: Ruleset, style: TravelRoundStyle, start: TravelRoundStart, plan: TripPlan): TripsRoundSummary {
  const rules = tripRules(ruleset);
  const base = perTurnValue(ruleset, style, start);
  const summary = (score: number, cost: number, reward: number, hours: number): TripsRoundSummary => ({
    style: style.name, start: start.name, plan: plan.key, planName: plan.name, scoreCents: Math.round(score), homeScoreCents: base.score,
    edge: (score - base.score) / base.score, costCents: Math.round(cost), rewardCents: Math.round(reward), awayHours: hours,
  });
  if (!rules || plan.trips === 0) return summary(base.score, 0, 0, 0);

  const weight = ruleset.economy.netWorth.cashWeightPercent / 100;
  const turnsPerHour = (style.sessionTurns * style.sessionsPerDay) / 24;
  const flightHours = (rules.flightMinutes * 2) / 60;
  const awayHours = flightHours + plan.stayMinutes / 60;
  const guards = rules.bodyguards ? plan.bodyguards : 0;
  const hunted = rules.hunted;
  const world = TRIPS_ROUND_WORLD;

  // Money out of home cash, each trip.
  const tickets = rules.ticketCents + (rules.bodyguards?.ticketCents ?? 0) * guards;
  const hotel = Number(hotelCents(rules, plan.city, plan.stayMinutes) + lodgingCents(rules, guards, plan.stayMinutes));
  const rent = plan.rentPistols && rules.bodyguards ? rules.bodyguards.gunRentCents.PISTOL * guards : 0;
  const airport = rules.airport;
  const airportLoss = airport
    ? 2 * airportCheckChance(airport, base.heat, guards) * (airport.seizePercent / 100) * plan.bankrollCents
    : 0;
  const hit = hunted ? (guards > 0 ? world.hitChanceAlone * world.hitThroughGuards : world.hitChanceAlone) : 0;
  const carry = (ruleset.travel?.convoys?.loot.cashPerAttackerCents ?? 0) * world.hunterSquad;
  const averagePercent = hunted ? (hunted.bankrollPercent.min + hunted.bankrollPercent.max) / 200 : 0;
  const robbed = hit * Math.min(plan.bankrollCents * averagePercent, carry);
  const cashCost = (tickets + hotel + rent + airportLoss + robbed) * weight;

  // Turns and takes lost to being away: the door, the lieutenant, the girls, and lying up after a beating.
  const layUpHours = hunted ? hit * (hunted.layUpMinutes / 60) : 0;
  const cutTurns = turnsPerHour * (awayHours + layUpHours);
  const lieutenant = cutTurns * base.value * base.cashShare * rules.lieutenantCut;
  const floor = ruleset.scouting.minHappinessMultiplier;
  const drag = 1 - happinessMultiplier(85 - averagePenalty(ruleset, awayHours), floor) / happinessMultiplier(85, floor);
  const girls = turnsPerHour * awayHours * base.value * drag;
  const door = rules.launchTurns * base.value;
  const perTrip = cashCost + lieutenant + girls + door;

  const cost = perTrip * plan.trips;
  const reward = JOB_REWARDS_CENTS * weight;
  return summary(base.score - cost + reward, cost, reward, awayHours * plan.trips);
}

export function runTripsRoundSimulation(ruleset: Ruleset): TripsRoundSummary[] {
  return travelRoundStyles.flatMap((style) => travelRoundStarts.flatMap((start) => tripPlans.map((plan) => simulateTripsRound(ruleset, style, start, plan))));
}

/** The largest edge any trip plan may hold over staying home: travel is never a requirement. */
export const TRIPS_MAX_EDGE = 0.02;
/** The job trips may not cost more than this share: doing them is never a trap. */
export const TRIPS_JOBS_FLOOR = -0.01;

export function tripsRoundGate(rows: readonly TripsRoundSummary[]): string[] {
  const problems: string[] = [];
  for (const row of rows) {
    const where = `${row.style} · ${row.start} · ${row.planName}`;
    if (row.edge > TRIPS_MAX_EDGE) problems.push(`${where} ends ${(row.edge * 100).toFixed(2)}% ahead of staying home: travel would be a requirement.`);
    if (row.plan === 'jobs' && row.edge < TRIPS_JOBS_FLOOR) problems.push(`${where} ends ${(row.edge * 100).toFixed(2)}% behind staying home: the job trips would be a trap.`);
  }
  return problems;
}

function money(cents: number): string {
  return `${cents < 0 ? '-' : ''}$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

export function tripsRoundMarkdown(ruleset: Ruleset, rows: readonly TripsRoundSummary[]): string {
  const problems = tripsRoundGate(rows);
  const world = TRIPS_ROUND_WORLD;
  const lines = [
    `## Trips: travelers against homebodies (${ruleset.meta.id})`,
    '',
    'The street is the 0.5.0-F round simulation’s street-only crew in New York. A traveler plays the same street and pays for every trip:'
      + ' tickets, hotel and lodging, the turns out the door, the lieutenant’s cut and the girls’ happiness while away, airport security, and a hit in town.'
      + ` Assumed: a boss alone in town is hit on ${Math.round(world.hitChanceAlone * 100)}% of trips, bodyguards let ${Math.round(world.hitThroughGuards * 100)}% of those through, and a hunter sends ${world.hunterSquad}.`
      + ' Every plan does the travel jobs on its first flights and collects their cash.',
    '',
    `Gate: no plan more than ${(TRIPS_MAX_EDGE * 100).toFixed(0)}% ahead of staying home, and the job trips no more than ${(-TRIPS_JOBS_FLOOR * 100).toFixed(0)}% behind.`,
    '',
    '| Style | Start | Plan | Hours away | Trip costs | Job cash | Score | Against home |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.style} | ${row.start} | ${row.planName} | ${row.awayHours.toFixed(1)} | ${money(row.costCents)} | ${money(row.rewardCents)} | ${money(row.scoreCents)} | ${row.plan === 'home' ? '-' : `${row.edge >= 0 ? '+' : ''}${(row.edge * 100).toFixed(2)}%`} |`),
    '',
    problems.length ? `**Gate failed:**\n${problems.map((line) => `- ${line}`).join('\n')}` : '**Gate passed.**',
    '',
  ];
  return lines.join('\n');
}
