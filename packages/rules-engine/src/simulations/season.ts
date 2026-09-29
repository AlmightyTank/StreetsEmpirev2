import type { DistrictKey, Ruleset, WeaponKey } from '@streets/rulesets';
import { hashParts, seededRng, type Rng } from '../rng.js';
import { calculateProduce, calculateScout } from '../calculations/actions.js';
import { cityCounter, cityHeatRules, cityModifiers, rulesetForCity } from '../calculations/cities.js';
import { districtCapacities } from '../calculations/clients.js';
import { equipCombatSquad, simulateRaid, type CombatCrew } from '../calculations/combat.js';
import { convoyCombatModel, convoyLoot, convoyRules } from '../calculations/convoys.js';
import { calculateThugHappiness, calculateWhoreHappiness } from '../calculations/happiness.js';
import { addHeat, decayHeat, resolveBust, tripHeat } from '../calculations/heat.js';
import { calculateNetWorthCents } from '../calculations/net-worth.js';
import { productEconomy, productRecipes, type ProductRecipe } from '../calculations/product-economy.js';
import { relocationFeeCents, relocationRules } from '../calculations/relocation.js';
import { runCapacity } from '../calculations/runs.js';
import { cornerMinimumFor, cornerUpkeep, localsThugs, presenceAfter, turfHoldBonus, turfPushCombatModel, turfTax } from '../calculations/turf.js';
import { defaultWorkSupplyPolicy, planWorkSupply } from '../calculations/work-supply.js';
import { driveRiskRun } from './travel-risk.js';
import { roundRunPlans, type RoundRunPlan } from './travel-round.js';
import type { TravelTrade } from './travel.js';

/**
 * 1.0.0-D. A whole season, everyone at once.
 *
 * Every earlier balance model (0.4.0-E products, 0.5.0-F the road, 0.6.0-F turf,
 * 0.7 hideout and stores) asked one system's question with the rest held still.
 * This one puts a field of crews in one city for a whole season, each playing a
 * strategy, on an hourly clock, and lets them run into each other: raids land on
 * real neighbours, turf is fought over, runs get tailed, alliances back each
 * other up, and late joiners arrive into a round that is already moving.
 *
 * What is real: every action goes through the engine's own formulas, the same ones
 * the server calls. The street is `calculateScout` with a work-supply plan and the
 * hour's hidden client capacities; the stove is `calculateProduce`; fights are
 * `simulateRaid` with the round's combat model (turf through `turfPushCombatModel`,
 * convoys through `convoyCombatModel` and `convoyLoot`); Heat is `tripHeat`,
 * `decayHeat` and `resolveBust`; runs are the 0.5.0-F planner priced through the
 * 0.5.0-C road-risk model; net worth is `calculateNetWorthCents`.
 *
 * What is assumed: how people play. Sessions, targets, how much a policy spends and
 * the few things a single process cannot know (which runs pass your city, when a
 * weapon unlock is earned) live in `SEASON_WORLD`, in one place, so real round
 * data can replace them without touching the model.
 *
 * Left out, deliberately: quests and favors (small, one-off), reputation discounts,
 * drive-bys and special raids (variants of the raid that do not move net worth
 * much), and the round-end crackdown (it lands after the balance question is asked).
 */

export type SeasonStrategyKey =
  | 'street' | 'producer' | 'trader' | 'raider' | 'turf' | 'traveler'
  | 'convoy' | 'alliance' | 'hideout' | 'arbitrage' | 'mixed';

export interface SeasonStrategy {
  readonly key: SeasonStrategyKey;
  readonly name: string;
  readonly purpose: string;
  /** Works the street with whatever turns its own focus leaves. Single-system grinders do not. */
  readonly street: boolean;
  /** Cooks its own supply, and cooks for sale when that pays. */
  readonly produce: boolean;
  /** Which runs it makes. `counter` trades Pip's counters only: store arbitrage. */
  readonly runs: 'market' | 'counter' | 'any' | null;
  /** How it raids: as its main job, when the odds are good, or never. */
  readonly raids: 'primary' | 'opportunistic' | null;
  /** How it treats turf. */
  readonly turf: 'holder' | 'opportunistic' | null;
  readonly convoys: boolean;
  /** How it spends on the hideout. */
  readonly hideout: 'investor' | 'sensible' | null;
  /** Moves to the best city once it can afford to. */
  readonly moves: boolean;
  /** Joins an alliance and backs it up. */
  readonly alliance: boolean;
}

export const SEASON_STRATEGIES: readonly SeasonStrategy[] = [
  { key: 'street', name: 'Street-focused', purpose: 'Every turn on the street; buys supplies and guns, nothing else.', street: true, produce: false, runs: null, raids: null, turf: null, convoys: false, hideout: null, moves: false, alliance: false },
  { key: 'producer', name: 'Product producer', purpose: 'The street, and the stove for its own supply and anything that sells.', street: true, produce: true, runs: null, raids: null, turf: null, convoys: false, hideout: null, moves: false, alliance: false },
  { key: 'trader', name: 'Trader', purpose: 'Runs to the high markets back to back, a growing fleet, and nothing else.', street: false, produce: false, runs: 'market', raids: null, turf: null, convoys: false, hideout: null, moves: false, alliance: false },
  { key: 'raider', name: 'Raider', purpose: 'Buys muscle and guns and raids whoever pays best; the street funds it.', street: true, produce: false, runs: null, raids: 'primary', turf: null, convoys: false, hideout: null, moves: false, alliance: false },
  { key: 'turf', name: 'Turf holder', purpose: 'Claims and holds blocks, works its own corners, pushes rivals off.', street: true, produce: false, runs: null, raids: null, turf: 'holder', convoys: false, hideout: null, moves: false, alliance: false },
  { key: 'traveler', name: 'Traveler', purpose: 'Moves to the richest city, works it, and runs product when a run pays.', street: true, produce: false, runs: 'any', raids: null, turf: null, convoys: false, hideout: null, moves: true, alliance: false },
  { key: 'convoy', name: 'Convoy hunter', purpose: 'Tails other crews\' runs; the street between hits.', street: true, produce: false, runs: null, raids: null, turf: null, convoys: true, hideout: null, moves: false, alliance: false },
  { key: 'alliance', name: 'Alliance specialist', purpose: 'Plays inside an alliance: raids outsiders, backs up allied turf, shares targets.', street: true, produce: false, runs: null, raids: 'opportunistic', turf: 'opportunistic', convoys: false, hideout: 'sensible', moves: false, alliance: true },
  { key: 'hideout', name: 'Hideout investor', purpose: 'The street, and every spare dollar into hideout rooms.', street: true, produce: false, runs: null, raids: null, turf: null, convoys: false, hideout: 'investor', moves: false, alliance: false },
  { key: 'arbitrage', name: 'Store arbitrage', purpose: 'Buys on one Pip\'s counter and sells on another\'s, and nothing else.', street: false, produce: false, runs: 'counter', raids: null, turf: null, convoys: false, hideout: null, moves: false, alliance: false },
  { key: 'mixed', name: 'Mixed player', purpose: 'Does whatever pays today: street, stove, runs, a raid with good odds, a block, a room.', street: true, produce: true, runs: 'any', raids: 'opportunistic', turf: 'opportunistic', convoys: true, hideout: 'sensible', moves: false, alliance: false },
];

export interface SeasonAgentSpec {
  readonly name: string;
  readonly strategy: SeasonStrategyKey;
  /** Day of the season the crew joins, 0 for the opening. */
  readonly joinDay: number;
  readonly sessionsPerDay: number;
  /** Alliance name, when the crew plays in one. */
  readonly alliance?: string;
  /** Plays its strategy and nothing else: no street to fall back on. For "can you ignore X". */
  readonly pure?: boolean;
}

/**
 * The default field: every strategy twice, once played hard (four sessions a day)
 * and once casually (two), two alliances, and fresh crews joining on days 7, 14
 * and 21 to see whether the round has already closed on them.
 */
export const SEASON_ROSTER: readonly SeasonAgentSpec[] = [
  ...SEASON_STRATEGIES.flatMap((strategy) => [
    { name: `${strategy.name} (engaged)`, strategy: strategy.key, joinDay: 0, sessionsPerDay: 4, ...(strategy.key === 'alliance' ? { alliance: 'North' } : {}) },
    { name: `${strategy.name} (casual)`, strategy: strategy.key, joinDay: 0, sessionsPerDay: 2, ...(strategy.key === 'alliance' ? { alliance: 'South' } : {}) },
  ]),
  // Each alliance specialist brings friends: a turf holder and a mixed player each.
  { name: 'North turf wing', strategy: 'turf', joinDay: 0, sessionsPerDay: 3, alliance: 'North' },
  { name: 'North mixed wing', strategy: 'mixed', joinDay: 0, sessionsPerDay: 3, alliance: 'North' },
  { name: 'South raider wing', strategy: 'raider', joinDay: 0, sessionsPerDay: 3, alliance: 'South' },
  // Can a player ignore the economy entirely? A raider with no street at all.
  { name: 'Pure raider', strategy: 'raider', joinDay: 0, sessionsPerDay: 4, pure: true },
  // Late joiners play like the engaged crews, so their first week compares with the opening week.
  { name: 'Late mixed (day 7)', strategy: 'mixed', joinDay: 7, sessionsPerDay: 4 },
  { name: 'Late street (day 7)', strategy: 'street', joinDay: 7, sessionsPerDay: 4 },
  { name: 'Late mixed (day 14)', strategy: 'mixed', joinDay: 14, sessionsPerDay: 4 },
  { name: 'Late mixed (day 21)', strategy: 'mixed', joinDay: 21, sessionsPerDay: 4 },
];

/** Everything about people and the world a simulation has to assume. */
export const SEASON_WORLD = {
  days: 28,
  /** Turns spent per street trip; the recommended trip, rounded to whole hours of turns. */
  tripTurns: 24,
  /** Hours of the day sessions happen at, by sessions per day. Staggered per crew. */
  sessionHours: { 1: [20], 2: [9, 20], 3: [8, 14, 21], 4: [8, 12, 17, 22] } as Record<number, number[]>,
  /** A session is online this long: raids and tails are limited by cooldowns inside it. */
  sessionMinutes: 90,
  /** Supplies a crew keeps on hand, in trips' worth of use, on top of what happiness asks for. */
  supplyTrips: 3,
  /** A raider goes when its squad is this much stronger than the defence it expects. */
  raidEdge: { primary: 1.1, opportunistic: 1.5 },
  /** An opportunistic raid has to be worth this many street turns' take. */
  opportunisticLootTurns: 30,
  /** Days before each premium gun is unlocked by reputation, for those who chase it. */
  weaponUnlockDay: { SHOTGUN: 2, TEK9: 6, AK47: 12 } as Record<Exclude<WeaponKey, 'PISTOL'>, number>,
  /** Share of runs whose route passes within some hunter's reach and gets noticed (0.5.0-F assumed a tenth were tailed). */
  runsInReach: 0.2,
  /** Mixed play makes a run when it beats this many turns of street take. */
  runEdge: 1.2,
  /** Hideout rooms an investor buys, in order; sensible play buys only the first two. */
  hideoutOrder: ['BACK_OFFICE', 'SAFE_ROOM', 'WORKSHOP', 'LOOKOUTS'] as const,
  /** Spend on a room only while it leaves this many times its price in cash. */
  hideoutReserve: { investor: 1.2, sensible: 3 },
  /** Turf holders and mixed players push a rival block only with this much more strength than it shows. */
  pushEdge: 1.15,
  /** Share of fit thugs a crew stands on each corner it holds, as far as its guns go. */
  cornerShare: { holder: 0.3, opportunistic: 0.15 },
  /** Cash a crew keeps back for tomorrow's supplies, in cents per crew member. */
  cashReservePerCrew: 2_000,
} as const;

// --- state -----------------------------------------------------------------------------

type Weapons = Record<WeaponKey, number>;
const WEAPON_ITEMS: Record<WeaponKey, string> = { PISTOL: 'PISTOL', SHOTGUN: 'SHOTGUN', TEK9: 'TEK9', AK47: 'AK47' };
const CRACK = 'CRACK';

export type SeasonIncome =
  | 'street' | 'holdBonus' | 'turfTax' | 'backOffice' | 'productSales' | 'runs'
  | 'raids' | 'convoys';
export type SeasonCost =
  | 'supplies' | 'crew' | 'weapons' | 'cars' | 'ingredients' | 'hideout' | 'moving'
  | 'raided' | 'convoyed' | 'busts' | 'taxPaid';

interface Run {
  backAt: number;
  cashCents: number;
  cargo: Record<string, number>;
  escorts: number;
  lowRiders: number;
  /** Cash the run will bring home on top of `cashCents` when nobody hits it. */
  profitCents: number;
  launchedAt: number;
  owner: Agent;
  /** 0.5.0-E: one tail on a run at a time; a hit run has been found. */
  tailed: boolean;
  /** Whether its route passes within any hunter's reach at all, decided as it leaves. */
  findable: boolean;
}

interface Agent {
  spec: SeasonAgentSpec;
  strategy: SeasonStrategy;
  index: number;
  rng: Rng;
  joined: boolean;
  city: string;
  sessionHours: number[];

  cash: number;
  turns: number;
  payout: number;
  whores: number;
  thugs: number;
  wounds: Array<{ thugs: number; until: number }>;
  weapons: Weapons;
  condoms: number;
  beer: number;
  medicine: number;
  stash: Record<string, number>;
  lowRiders: number;
  heat: number;
  hideout: Record<'SAFE_ROOM' | 'LOOKOUTS' | 'WORKSHOP' | 'BACK_OFFICE' | 'GARAGE', number>;
  /** Thugs standing on corners; they carry pistols out of the home arsenal. */
  posted: number;
  presence: Partial<Record<DistrictKey, { turns: number; at: number }>>;
  run: Run | null;
  shelves: Map<string, { stock: number; cap: number; perHour: number }>;

  lastActive: number;
  raidProtectedUntil: number;
  raidCooldownUntil: number;
  lastRaidedAt: number;
  /** Rivals this crew may hit back at, until the hour given. */
  revenge: Map<Agent, number>;
  lastTarget: Agent | null;
  repeatHits: number;
  pushCooldown: Map<string, number>;
  movedAt: number | null;

  income: Record<SeasonIncome, number>;
  costs: Record<SeasonCost, number>;
  tally: {
    streetTurns: number; produceTurns: number; runTurns: number; raidTurns: number; turfTurns: number; convoyTurns: number; idleTurns: number;
    raids: number; raidWins: number; raided: number; raidedLost: number;
    pushes: number; pushWins: number; pushedAt: number; blocksLost: number; claims: number; blockHours: number;
    runs: number; runsHit: number; tails: number; tailWins: number; busts: number;
  };
  /** Net worth at the end of each day since joining. */
  daily: number[];
  /** What this crew's own street turns have been earning lately, cents a turn. */
  streetPerTurn: number;
}

interface Block {
  city: string;
  district: DistrictKey;
  holder: Agent | null;
  corner: number;
  locals: number;
  shieldUntil: number;
  upkeepAt: number;
  changes: number;
  /** Minted tax per payer today. */
  taxToday: Map<Agent, number>;
}

interface World {
  ruleset: Ruleset;
  roundId: string;
  hour: number;
  agents: Agent[];
  blocks: Block[];
  runs: Run[];
  rng: Rng;
  alliancePushes: { attempts: number; wins: number };
  soloPushes: { attempts: number; wins: number };
}

const EPOCH = Date.UTC(2026, 0, 5, 0, 0, 0);

function emptyIncome(): Record<SeasonIncome, number> {
  return { street: 0, holdBonus: 0, turfTax: 0, backOffice: 0, productSales: 0, runs: 0, raids: 0, convoys: 0 };
}
function emptyCosts(): Record<SeasonCost, number> {
  return { supplies: 0, crew: 0, weapons: 0, cars: 0, ingredients: 0, hideout: 0, moving: 0, raided: 0, convoyed: 0, busts: 0, taxPaid: 0 };
}

function woundedNow(agent: Agent, hour: number): number {
  return agent.wounds.reduce((sum, wound) => sum + (wound.until > hour ? wound.thugs : 0), 0);
}

/** Thugs at home and able to act: not wounded, not on a corner, not out escorting a run. */
function fitThugs(agent: Agent, hour: number): number {
  return Math.max(0, agent.thugs - woundedNow(agent, hour) - agent.posted - (agent.run?.escorts ?? 0));
}

function weaponsAtHome(agent: Agent): Weapons {
  // Corner crews carry pistols first; escorts theirs.
  const out = agent.posted + (agent.run?.escorts ?? 0);
  const weapons = { ...agent.weapons };
  let left = out;
  for (const key of ['PISTOL', 'SHOTGUN', 'TEK9', 'AK47'] as WeaponKey[]) {
    const taken = Math.min(weapons[key], left);
    weapons[key] -= taken;
    left -= taken;
  }
  return weapons;
}

function totalGuns(weapons: Weapons): number {
  return weapons.PISTOL + weapons.SHOTGUN + weapons.TEK9 + weapons.AK47;
}

function happiness(agent: Agent, ruleset: Ruleset, hour: number) {
  const fit = fitThugs(agent, hour);
  const weapons = weaponsAtHome(agent);
  const products = Object.fromEntries(Object.entries(agent.stash).filter(([key]) => key !== CRACK));
  return {
    whore: calculateWhoreHappiness({ whores: agent.whores, thugs: fit, condoms: agent.condoms, crack: agent.stash[CRACK] ?? 0, payoutPercent: agent.payout, products }, ruleset),
    thug: calculateThugHappiness({ thugs: fit, beer: agent.beer, pistols: weapons.PISTOL, shotguns: weapons.SHOTGUN, tek9s: weapons.TEK9, ak47s: weapons.AK47 }, ruleset),
  };
}

function productWorth(ruleset: Ruleset, key: string): number {
  if (key === CRACK) return ruleset.economy.netWorth.perCrackCents;
  return productEconomy(ruleset, key)?.netWorthCents ?? 0;
}

function netWorth(agent: Agent, ruleset: Ruleset): number {
  const base = calculateNetWorthCents({
    cashCents: BigInt(Math.max(0, Math.round(agent.cash + (agent.run?.cashCents ?? 0)))),
    whores: agent.whores, thugs: agent.thugs, lowRiders: agent.lowRiders,
    condoms: agent.condoms, beer: agent.beer, medicine: agent.medicine, crack: agent.stash[CRACK] ?? 0,
    pistols: agent.weapons.PISTOL, shotguns: agent.weapons.SHOTGUN, tek9s: agent.weapons.TEK9, ak47s: agent.weapons.AK47,
  } as never, ruleset);
  const products = Object.entries(agent.stash).reduce((sum, [key, units]) => sum + (key === CRACK ? 0 : units * productWorth(ruleset, key)), 0);
  const cargo = Object.entries(agent.run?.cargo ?? {}).reduce((sum, [key, units]) => sum + units * productWorth(ruleset, key), 0);
  return Number(base) + products + cargo;
}

// --- shops -----------------------------------------------------------------------------

function storeItem(ruleset: Ruleset, store: string, item: string) {
  return (ruleset.stores as Record<string, { items: Record<string, { buyCents: number; sellCents: number | null; field: string; restock?: { cap: number; perInterval: number; intervalMinutes: number } }> }>)[store]?.items[item];
}

function shelvesFor(ruleset: Ruleset): Map<string, { stock: number; cap: number; perHour: number }> {
  const shelves = new Map<string, { stock: number; cap: number; perHour: number }>();
  for (const [store, def] of Object.entries(ruleset.stores)) {
    for (const [key, item] of Object.entries(def.items)) {
      if (item.restock) shelves.set(`${store}:${key}`, { stock: item.restock.cap, cap: item.restock.cap, perHour: (item.restock.perInterval ?? item.restock.cap) * 60 / item.restock.intervalMinutes });
    }
  }
  for (const key of Object.keys(ruleset.products ?? {})) {
    const pip = productEconomy(ruleset, key)?.pip;
    if (pip) shelves.set(`PIP:${key}`, { stock: pip.restock.cap, cap: pip.restock.cap, perHour: pip.restock.perInterval * 60 / pip.restock.intervalMinutes });
  }
  return shelves;
}

/** Buy up to `quantity` from a shelf the agent can afford; returns units bought. */
function buy(agent: Agent, ruleset: Ruleset, store: string, item: string, quantity: number, cost: SeasonCost, keepCents = 0): number {
  if (quantity <= 0) return 0;
  const def = storeItem(ruleset, store, item);
  const price = def?.buyCents ?? productEconomy(ruleset, item)?.pip?.buyCents;
  if (!price) return 0;
  const shelf = agent.shelves.get(`${store}:${item}`);
  const affordable = Math.floor(Math.max(0, agent.cash - keepCents) / price);
  const units = Math.max(0, Math.min(quantity, affordable, shelf ? Math.floor(shelf.stock) : quantity));
  if (units <= 0) return 0;
  if (shelf) shelf.stock -= units;
  agent.cash -= units * price;
  agent.costs[cost] += units * price;
  return units;
}

function unlocked(agent: Agent, weapon: WeaponKey, day: number): boolean {
  if (weapon === 'PISTOL') return true;
  const chases = agent.strategy.raids !== null || agent.strategy.turf !== null || agent.strategy.convoys;
  return chases && day >= SEASON_WORLD.weaponUnlockDay[weapon];
}

/** Keep the crew supplied: happiness levels plus a few trips of use, and a gun per thug. */
function restock(world: World, agent: Agent): void {
  const { ruleset } = world;
  const trip = SEASON_WORLD.tripTurns * SEASON_WORLD.supplyTrips;
  const scouting = ruleset.scouting.consumption;
  const whore = ruleset.happiness.whore;
  const condomsWanted = Math.ceil(agent.whores * whore.condomsPerWhore + agent.whores * scouting.condomsPerWhorePerTurn * trip);
  agent.condoms += buy(agent, ruleset, 'CORNER', 'CONDOM', condomsWanted - agent.condoms, 'supplies');
  const beerWanted = Math.ceil(agent.thugs + agent.thugs * scouting.beerPerThugPerTurn * trip + agent.posted * 2);
  agent.beer += buy(agent, ruleset, 'CORNER', 'BEER', beerWanted - agent.beer, 'supplies');
  const medicineWanted = Math.ceil(agent.whores * 0.05);
  agent.medicine += buy(agent, ruleset, 'CORNER', 'MEDICINE', medicineWanted - agent.medicine, 'supplies');
  if (!agent.strategy.produce) {
    const crackWanted = Math.ceil(agent.whores * whore.crackPerWhore + agent.whores * scouting.crackPerWhorePerTurn * trip);
    agent.stash[CRACK] = (agent.stash[CRACK] ?? 0) + buy(agent, ruleset, 'PIP', 'CRACK', crackWanted - (agent.stash[CRACK] ?? 0), 'supplies');
  }
  // A gun for every thug, the best the crew has unlocked and can afford, pistols to fill.
  const day = Math.floor(world.hour / 24);
  const missing = agent.thugs - totalGuns(agent.weapons);
  if (missing > 0) {
    let left = missing;
    const reserve = SEASON_WORLD.cashReservePerCrew * (agent.whores + agent.thugs);
    for (const weapon of ['AK47', 'TEK9', 'SHOTGUN'] as WeaponKey[]) {
      if (left <= 0 || !unlocked(agent, weapon, day)) continue;
      const got = buy(agent, ruleset, 'TOMMY', WEAPON_ITEMS[weapon], left, 'weapons', reserve * 4);
      agent.weapons[weapon] += got;
      left -= got;
    }
    agent.weapons.PISTOL += buy(agent, ruleset, 'TOMMY', 'PISTOL', left, 'weapons');
  }
}

// --- the street ------------------------------------------------------------------------

function livingRuleset(world: World, agent: Agent): Ruleset {
  return rulesetForCity(world.ruleset, agent.city);
}

function capacitiesAt(world: World, hour: number): Record<DistrictKey, number> {
  return districtCapacities(world.roundId, new Date(EPOCH + hour * 3_600_000), world.ruleset);
}

function blockAt(world: World, city: string, district: DistrictKey): Block | undefined {
  return world.blocks.find((block) => block.city === city && block.district === district);
}

function allied(a: Agent, b: Agent): boolean {
  return a === b || (Boolean(a.spec.alliance) && a.spec.alliance === b.spec.alliance);
}

/** What a street turn in a district is worth to this crew on an average hour, before turf. */
function districtValue(world: World, agent: Agent, key: DistrictKey): number {
  const ruleset = world.ruleset;
  const def = ruleset.scouting.districts[key];
  const fit = fitThugs(agent, world.hour);
  const covered = Math.min(1, (Math.min(fit, totalGuns(weaponsAtHome(agent))) * def.protectionWhoresPerThug) / Math.max(1, agent.whores));
  const exposure = 1 - ruleset.scouting.exposure.maxTakePenalty * (1 - covered);
  const take = def.payMultiplier * exposure * Math.max(1, agent.whores) * ruleset.scouting.grossPerWhorePerTurnCents * (agent.payout / 100) * 0.3;
  // Recruits are worth their net worth while the crew is still small enough to find them.
  const growing = agent.whores < ruleset.scouting.recruitment.whoreSoftCap * 4 ? 1 : 0.25;
  const recruits = (def.whoresPerTurn * ruleset.economy.netWorth.perWhoreCents + def.thugsPerTurn * ruleset.economy.netWorth.perThugCents) * growing * 0.5;
  return take + recruits;
}

/** A district's value with the turf on it: the holder's bonus, or the tax a rival's block burns. */
function workedValue(world: World, agent: Agent, key: DistrictKey): number {
  const block = blockAt(world, agent.city, key);
  const value = districtValue(world, agent, key);
  if (block?.holder === agent) return value * turfHoldBonus(world.ruleset, key, true);
  if (block?.holder && !allied(block.holder, agent)) return value * (1 - (world.ruleset.turf?.districts[key]?.taxBurn ?? 0));
  return value;
}

/** The district a crew works: the best one with turf counted, or the block it is building presence on. */
function chooseDistrict(world: World, agent: Agent): DistrictKey {
  const keys = Object.keys(world.ruleset.scouting.districts) as DistrictKey[];
  const best = keys.reduce((a, b) => (workedValue(world, agent, b) > workedValue(world, agent, a) ? b : a));
  const target = turfTarget(world, agent);
  // Building presence on a block it wants costs a little take; a crew accepts that for a block worth holding.
  if (target && presenceNow(world, agent, target.district) < (world.ruleset.turf?.presence.turnsToClaim ?? 0)
    && workedValue(world, agent, target.district) >= workedValue(world, agent, best) * 0.8) return target.district;
  return best;
}

function streetTrip(world: World, agent: Agent, turns: number, district: DistrictKey): void {
  const ruleset = livingRuleset(world, agent);
  const hour = world.hour;
  const fit = fitThugs(agent, hour);
  const weapons = weaponsAtHome(agent);
  const mood = happiness(agent, ruleset, hour);
  const supply = ruleset.workSupply
    ? planWorkSupply({ job: district, workers: agent.whores, turns, policy: defaultWorkSupplyPolicy(), inventory: { ...agent.stash }, ruleset })
    : undefined;
  const player = {
    whores: agent.whores, thugs: fit, condoms: agent.condoms, crack: agent.stash[CRACK] ?? 0, beer: agent.beer, medicine: agent.medicine,
    pistols: weapons.PISTOL, shotguns: weapons.SHOTGUN, tek9s: weapons.TEK9, ak47s: weapons.AK47,
    whoreHappiness: mood.whore, thugHappiness: mood.thug,
  };
  const outcome = calculateScout({
    supply, heat: agent.heat, player, turns, ruleset, city: cityModifiers(ruleset, agent.city), district,
    clientCapacity: capacitiesAt(world, hour)[district], payoutPercent: agent.payout, rng: agent.rng,
  });
  let take = Number(outcome.pimpTakeCents);
  agent.income.street += take;

  // Turf: a bonus on your own block, a tax on someone else's.
  const block = blockAt(world, agent.city, district);
  if (block?.holder === agent) {
    const bonus = Math.max(0, Math.round(take * (turfHoldBonus(ruleset, district, true) - 1)));
    agent.income.holdBonus += bonus;
    take += bonus;
  } else if (block?.holder && !allied(block.holder, agent)) {
    const tax = turfTax(ruleset, district, take, block.taxToday.get(agent) ?? 0);
    take -= tax.burnCents;
    agent.costs.taxPaid += tax.burnCents;
    block.taxToday.set(agent, (block.taxToday.get(agent) ?? 0) + tax.mintCents);
    block.holder.cash += tax.mintCents;
    block.holder.income.turfTax += tax.mintCents;
  }
  const backOffice = Math.round(take * ((ruleset.hideout?.buffs.backOfficeTakeBonusPercentPerLevel ?? 0) * agent.hideout.BACK_OFFICE) / 100);
  agent.income.backOffice += backOffice;
  agent.cash += take + backOffice;
  // Recruits are part of what a street turn earns: count them at their net worth.
  const worth = ruleset.economy.netWorth;
  const earned = (take + backOffice + outcome.whoresRecruited * worth.perWhoreCents + outcome.thugsRecruited * worth.perThugCents) / turns;
  agent.streetPerTurn = agent.streetPerTurn === 0 ? earned : agent.streetPerTurn * 0.8 + earned * 0.2;

  agent.whores = Math.max(0, agent.whores + outcome.whoresRecruited - outcome.departures.whores - outcome.infections.lost);
  agent.thugs = Math.max(agent.posted + (agent.run?.escorts ?? 0), agent.thugs + outcome.thugsRecruited - outcome.departures.thugs);
  agent.condoms = Math.max(0, agent.condoms - outcome.consumption.condoms);
  agent.medicine = Math.max(0, agent.medicine - outcome.infections.medicineUsed);
  agent.beer = Math.max(0, agent.beer - outcome.consumption.beer);
  agent.stash[CRACK] = Math.max(0, (agent.stash[CRACK] ?? 0) - outcome.consumption.crack + outcome.crackFound);
  for (const [key, units] of Object.entries(supply?.consumed ?? {})) {
    if (key !== CRACK) agent.stash[key] = Math.max(0, (agent.stash[key] ?? 0) - units);
  }

  // Heat lands, and a hot crew can be busted on the way home.
  const heatRules = cityHeatRules(ruleset, agent.city);
  if (heatRules) {
    agent.heat = addHeat(agent.heat, tripHeat([supply]), heatRules);
    const bust = resolveBust({ heat: agent.heat, cashCents: BigInt(Math.max(0, Math.round(agent.cash))), products: { ...agent.stash }, ruleset, rng: agent.rng });
    if (bust.busted) {
      agent.tally.busts++;
      agent.cash -= Number(bust.fineCents);
      agent.costs.busts += Number(bust.fineCents);
      for (const [key, units] of Object.entries(bust.seized)) agent.stash[key] = Math.max(0, (agent.stash[key] ?? 0) - units);
      agent.heat = bust.heatAfter;
    }
  }

  // Presence builds toward a claim.
  if (ruleset.turf) {
    const prior = agent.presence[district];
    const decayed = prior ? presenceAfter(ruleset, prior.turns, hour - prior.at) : 0;
    agent.presence[district] = { turns: decayed + turns * ruleset.turf.presence.perScoutTurn, at: hour };
  }
  agent.tally.streetTurns += turns;
  agent.turns -= turns;
}

// --- the stove -------------------------------------------------------------------------

function bestRecipe(ruleset: Ruleset, agent: Agent): ProductRecipe | null {
  // Crack for the crew's own supply first: it saves Pip's price.
  const recipes = productRecipes(ruleset);
  const crack = recipes.find((recipe) => recipe.product === CRACK) ?? null;
  const need = Math.ceil(agent.whores * ruleset.happiness.whore.crackPerWhore + agent.whores * ruleset.scouting.consumption.crackPerWhorePerTurn * SEASON_WORLD.tripTurns * SEASON_WORLD.supplyTrips);
  if (crack && (agent.stash[CRACK] ?? 0) < need) return crack;
  // Past its own supply, only what sells above its ingredients somewhere the crew can sell it.
  let best: ProductRecipe | null = null;
  let bestMargin = 0;
  for (const recipe of recipes) {
    const sell = recipe.product === CRACK ? storeItem(ruleset, 'PIP', 'CRACK')?.sellCents ?? 0 : productEconomy(ruleset, recipe.product)?.pip?.sellCents ?? 0;
    const margin = (sell - recipe.ingredientCentsPerUnit) * recipe.perThugPerTurn;
    if (margin > bestMargin) { bestMargin = margin; best = recipe; }
  }
  return best;
}

function produce(world: World, agent: Agent, turns: number): void {
  const ruleset = livingRuleset(world, agent);
  const recipe = bestRecipe(ruleset, agent);
  if (!recipe || turns <= 0) return;
  const hour = world.hour;
  const fit = fitThugs(agent, hour);
  if (fit < 1) return;
  const weapons = weaponsAtHome(agent);
  const mood = happiness(agent, ruleset, hour);
  const district = ruleset.scouting.produceDistrict;
  const supply = ruleset.workSupply
    ? planWorkSupply({ job: district, workers: agent.whores, turns, policy: defaultWorkSupplyPolicy(), inventory: { ...agent.stash }, ruleset })
    : undefined;
  const player = {
    whores: agent.whores, thugs: fit, condoms: agent.condoms, crack: agent.stash[CRACK] ?? 0, beer: agent.beer, medicine: agent.medicine,
    pistols: weapons.PISTOL, shotguns: weapons.SHOTGUN, tek9s: weapons.TEK9, ak47s: weapons.AK47,
    whoreHappiness: mood.whore, thugHappiness: mood.thug,
  };
  const outcome = calculateProduce({
    player, turns, ruleset, city: cityModifiers(ruleset, agent.city), rng: agent.rng, cashCents: BigInt(Math.max(0, Math.round(agent.cash))),
    payoutPercent: agent.payout, clientCapacity: capacitiesAt(world, hour)[district], supply, heat: agent.heat, recipe,
  });
  const workshop = 1 + ((ruleset.hideout?.buffs.workshopCrackBonusPercentPerLevel ?? 0) * agent.hideout.WORKSHOP) / 100;
  const units = Math.floor(outcome.crackProduced * workshop);
  const take = Number(outcome.pimpTakeCents);
  agent.cash += take - Number(outcome.ingredientCents);
  agent.income.street += take;
  agent.costs.ingredients += Number(outcome.ingredientCents);
  agent.stash[recipe.product] = (agent.stash[recipe.product] ?? 0) + units;
  agent.whores = Math.max(0, agent.whores - outcome.departures.whores - outcome.infections.lost);
  agent.thugs = Math.max(agent.posted + (agent.run?.escorts ?? 0), agent.thugs - outcome.departures.thugs);
  agent.condoms = Math.max(0, agent.condoms - outcome.consumption.condoms);
  agent.beer = Math.max(0, agent.beer - outcome.consumption.beer);
  agent.medicine = Math.max(0, agent.medicine - outcome.infections.medicineUsed);
  agent.stash[CRACK] = Math.max(0, (agent.stash[CRACK] ?? 0) - outcome.consumption.crack);
  const heatRules = cityHeatRules(ruleset, agent.city);
  if (heatRules) agent.heat = addHeat(agent.heat, Math.round(units * recipe.heatPerUnit) + tripHeat([supply]), heatRules);
  agent.tally.produceTurns += turns;
  agent.turns -= turns;
}

/** Sell what the crew does not need at Pip's counter. */
function sellSurplus(world: World, agent: Agent): void {
  const ruleset = livingRuleset(world, agent);
  const keepCrack = Math.ceil(agent.whores * (ruleset.happiness.whore.crackPerWhore + ruleset.scouting.consumption.crackPerWhorePerTurn * SEASON_WORLD.tripTurns * SEASON_WORLD.supplyTrips * 2));
  for (const [key, units] of Object.entries(agent.stash)) {
    const keep = key === CRACK ? keepCrack : 0;
    const surplus = units - keep;
    if (surplus <= 0) continue;
    const sell = key === CRACK ? storeItem(ruleset, 'PIP', 'CRACK')?.sellCents ?? 0 : productEconomy(ruleset, key)?.pip?.sellCents ?? 0;
    // Only when it sells for more than it is worth held: otherwise it waits for a run or the crew.
    if (sell <= productWorth(ruleset, key)) continue;
    agent.stash[key] = keep;
    agent.cash += surplus * sell;
    agent.income.productSales += surplus * sell;
  }
}

// --- fights ----------------------------------------------------------------------------

function crewOf(agent: Agent, thugs: number, hour: number, ruleset: Ruleset): CombatCrew {
  const weapons = weaponsAtHome(agent);
  return { thugs, thugHappiness: happiness(agent, ruleset, hour).thug, weapons };
}

function strengthOf(agent: Agent, ruleset: Ruleset, hour: number, model: NonNullable<Ruleset['combat']>): number {
  const fit = fitThugs(agent, hour);
  if (fit <= 0) return 0;
  return equipCombatSquad(crewOf(agent, fit, hour, ruleset), Math.min(fit, model.squadCap), model).strength;
}

function lookoutsBoost(ruleset: Ruleset, agent: Agent) {
  const percent = (ruleset.hideout?.buffs.lookoutsDefenseBonusPercentPerLevel ?? 0) * agent.hideout.LOOKOUTS;
  return percent > 0 ? { strength: 1 + percent / 100, wounds: 1 } : undefined;
}

function protectedCash(ruleset: Ruleset, agent: Agent): number {
  return (ruleset.hideout?.buffs.safeRoomProtectedCashCentsPerLevel ?? 0) * agent.hideout.SAFE_ROOM;
}

/** Whether `attacker` may raid `defender` now, the way the server decides it. */
function canRaid(world: World, attacker: Agent, defender: Agent, model: NonNullable<Ruleset['combat']>): boolean {
  const hour = world.hour;
  if (allied(attacker, defender) || !defender.joined || attacker.city !== defender.city) return false;
  const revenge = (attacker.revenge.get(defender) ?? -1) > hour;
  if (defender.raidProtectedUntil > hour && !revenge) return false;
  if (defender.lastRaidedAt >= 0 && defender.lastActive <= defender.lastRaidedAt) return false;
  const ruleset = world.ruleset;
  if (!revenge && strengthOf(defender, ruleset, hour, model) < strengthOf(attacker, ruleset, hour, model) * model.minimumTargetStrengthRatio) return false;
  const exposedCash = defender.cash - protectedCash(ruleset, defender) > model.loot.protectedCashCents;
  return exposedCash || (defender.stash[CRACK] ?? 0) > 0;
}

function raid(world: World, attacker: Agent, defender: Agent): void {
  const ruleset = world.ruleset;
  const model = ruleset.combat!;
  const hour = world.hour;
  const squad = Math.min(fitThugs(attacker, hour), model.squadCap);
  const defenders = fitThugs(defender, hour);
  if (squad < 1) return;
  attacker.repeatHits = attacker.lastTarget === defender ? attacker.repeatHits + 1 : 0;
  attacker.lastTarget = defender;
  const exposed = Math.max(0, defender.cash - protectedCash(ruleset, defender));
  const result = simulateRaid({
    attacker: crewOf(attacker, fitThugs(attacker, hour), hour, ruleset),
    defender: crewOf(defender, defenders, hour, ruleset),
    defenderBoost: lookoutsBoost(ruleset, defender),
    attackingThugs: squad, attackerTurns: attacker.turns, defenderCashCents: BigInt(Math.round(exposed)),
    defenderCrack: defender.stash[CRACK] ?? 0, repeatTargetHits: attacker.repeatHits,
  }, model, attacker.rng);
  const loot = Number(result.lootCents);
  attacker.turns -= model.turnCost;
  attacker.tally.raidTurns += model.turnCost;
  attacker.tally.raids++;
  defender.tally.raided++;
  attacker.cash += loot;
  defender.cash -= loot;
  attacker.income.raids += loot;
  defender.costs.raided += loot;
  attacker.stash[CRACK] = (attacker.stash[CRACK] ?? 0) + result.lootCrack;
  defender.stash[CRACK] = Math.max(0, (defender.stash[CRACK] ?? 0) - result.lootCrack);
  const until = hour + Math.ceil(model.wounds.recoveryMinutes / 60);
  if (result.wounds.attacker > 0) attacker.wounds.push({ thugs: result.wounds.attacker, until });
  if (result.wounds.defender > 0) defender.wounds.push({ thugs: result.wounds.defender, until });
  attacker.raidCooldownUntil = hour + model.cooldownMinutes / 60;
  if (result.winner === 'ATTACKER') {
    attacker.tally.raidWins++;
    defender.tally.raidedLost++;
    defender.raidProtectedUntil = hour + model.protectionHours;
    defender.lastRaidedAt = hour;
  }
  const revengeHours = model.strategy?.retaliation?.revengeHours ?? 0;
  if (revengeHours > 0) {
    defender.revenge.set(attacker, hour + revengeHours);
    // 0.3.0: an alliance shares its members' revenge.
    if (defender.spec.alliance) for (const ally of world.agents) if (ally !== defender && allied(ally, defender)) ally.revenge.set(attacker, hour + revengeHours);
  }
}

/** Raids this session: the best-paying target the crew can beat, as often as cooldowns allow. */
function raidSession(world: World, agent: Agent): void {
  const ruleset = world.ruleset;
  const model = ruleset.combat;
  const mode = agent.strategy.raids;
  if (!model || !mode) return;
  const slots = Math.max(1, Math.floor(SEASON_WORLD.sessionMinutes / model.cooldownMinutes));
  for (let slot = 0; slot < slots; slot++) {
    if (agent.turns < model.turnCost || fitThugs(agent, world.hour) < 1) return;
    const mine = strengthOf(agent, ruleset, world.hour, model);
    const edge = SEASON_WORLD.raidEdge[mode];
    const streetTurnValue = agent.whores * ruleset.scouting.grossPerWhorePerTurnCents * 0.3;
    let best: Agent | null = null;
    let bestValue = 0;
    for (const target of world.agents) {
      if (target === agent || !canRaid(world, agent, target, model)) continue;
      const theirs = strengthOf(target, ruleset, world.hour, model) * model.strength.defenseMultiplier * (lookoutsBoost(ruleset, target)?.strength ?? 1);
      if (mine < theirs * edge) continue;
      const exposed = Math.max(0, target.cash - protectedCash(ruleset, target) - model.loot.protectedCashCents);
      const value = Math.min(exposed * 0.25, fitThugs(agent, world.hour) * model.loot.perFitAttackerCents);
      if (mode === 'opportunistic' && value < streetTurnValue * SEASON_WORLD.opportunisticLootTurns) continue;
      if (value > bestValue) { bestValue = value; best = target; }
    }
    if (!best) return;
    raid(world, agent, best);
  }
}

// --- turf ------------------------------------------------------------------------------

function blocksHeld(world: World, agent: Agent, city = agent.city): Block[] {
  return world.blocks.filter((block) => block.holder === agent && block.city === city);
}

function allianceBlocks(world: World, agent: Agent, city: string): number {
  if (!agent.spec.alliance) return blocksHeld(world, agent, city).length;
  return world.blocks.filter((block) => block.city === city && block.holder && allied(block.holder, agent)).length;
}

/** The block this crew is working toward: an empty block to claim, or a rival's to push. */
function turfTarget(world: World, agent: Agent): Block | null {
  const turf = world.ruleset.turf;
  const mode = agent.strategy.turf;
  if (!turf || !mode) return null;
  const want = mode === 'holder' ? turf.caps.blocksPerCrewHome : 1;
  if (blocksHeld(world, agent).length >= want) return null;
  if (agent.spec.alliance && allianceBlocks(world, agent, agent.city) >= turf.caps.blocksPerAllianceInCity) return null;
  const worth = (block: Block) => districtValue(world, agent, block.district) * turfHoldBonus(world.ruleset, block.district, true);
  const candidates = world.blocks.filter((block) => block.city === agent.city && block.holder !== agent && !(block.holder && allied(block.holder, agent)));
  // Where the crew would work anyway, with the bonus; empty blocks before a fight when close.
  candidates.sort((a, b) => worth(b) * (b.holder ? 0.9 : 1) - worth(a) * (a.holder ? 0.9 : 1));
  return candidates[0] ?? null;
}

function presenceNow(world: World, agent: Agent, district: DistrictKey): number {
  const row = agent.presence[district];
  return row ? presenceAfter(world.ruleset, row.turns, world.hour - row.at) : 0;
}

function turfFight(world: World, attackerThugs: number, attacker: Agent, defenderCrew: CombatCrew, defenderBoost?: { strength: number; wounds: number }) {
  const model = turfPushCombatModel(world.ruleset)!;
  const squad = Math.min(attackerThugs, model.squadCap);
  return simulateRaid({
    attacker: crewOf(attacker, attackerThugs, world.hour, world.ruleset),
    defender: defenderCrew,
    ...(defenderBoost ? { defenderBoost } : {}),
    attackingThugs: squad, attackerTurns: Math.max(model.turnCost, attacker.turns), defenderCashCents: 0n,
  }, model, attacker.rng);
}

function localsCrew(ruleset: Ruleset, locals: number): CombatCrew {
  const thugs = Math.floor(locals);
  const armed = Math.round(thugs * (ruleset.turf?.locals.armedShare ?? 0));
  return { thugs, thugHappiness: 100, weapons: { PISTOL: armed, SHOTGUN: 0, TEK9: 0, AK47: 0 } };
}

/** Thugs a crew wants standing on one of its corners. */
function desiredCorner(world: World, agent: Agent, district: DistrictKey): number {
  const mode = agent.strategy.turf;
  const minimum = cornerMinimumFor(world.ruleset, district, agent.thugs);
  if (!mode) return minimum;
  const home = fitThugs(agent, world.hour) + blocksHeld(world, agent).reduce((sum, block) => sum + block.corner, 0);
  return Math.max(minimum, Math.floor(home * SEASON_WORLD.cornerShare[mode]));
}

/** Top up corners that have thinned: walkouts, a lost fight, a growing crew. Each post costs its turns. */
function reinforce(world: World, agent: Agent): void {
  const turf = world.ruleset.turf;
  if (!turf) return;
  for (const block of blocksHeld(world, agent)) {
    const want = desiredCorner(world, agent, block.district) - block.corner;
    const armed = totalGuns(weaponsAtHome(agent));
    const send = Math.min(want, fitThugs(agent, world.hour) - 1, armed);
    if (send < Math.max(3, want * 0.25) || agent.turns < turf.corner.postTurnCost) continue;
    agent.turns -= turf.corner.postTurnCost;
    agent.tally.turfTurns += turf.corner.postTurnCost;
    block.corner += send;
    agent.posted += send;
  }
}

function turfSession(world: World, agent: Agent): void {
  const ruleset = world.ruleset;
  const turf = ruleset.turf;
  if (!turf || !agent.strategy.turf) return;
  reinforce(world, agent);
  const target = turfTarget(world, agent);
  if (!target) return;
  const hour = world.hour;
  const fit = fitThugs(agent, hour);
  const minimum = cornerMinimumFor(ruleset, target.district, agent.thugs);
  if (!target.holder) {
    if (presenceNow(world, agent, target.district) < turf.presence.turnsToClaim) return;
    if (fit < minimum || totalGuns(weaponsAtHome(agent)) < minimum || agent.turns < turf.corner.postTurnCost) return;
    const squad = Math.min(fit, totalGuns(weaponsAtHome(agent)), Math.max(minimum, Math.floor(target.locals) + 5, desiredCorner(world, agent, target.district)));
    agent.turns -= turf.corner.postTurnCost;
    agent.tally.turfTurns += turf.corner.postTurnCost;
    const result = turfFight(world, squad, agent, localsCrew(ruleset, target.locals));
    agent.tally.claims++;
    if (result.winner === 'ATTACKER') {
      target.holder = agent;
      target.corner = squad - result.wounds.attacker;
      target.upkeepAt = hour;
      target.changes++;
      agent.posted += target.corner;
    }
    if (result.wounds.attacker > 0) agent.wounds.push({ thugs: result.wounds.attacker, until: hour + 2 });
    return;
  }
  // A rival's block: push it when the squad is clearly stronger than the corner and whoever backs it up.
  if (target.shieldUntil > hour || (agent.pushCooldown.get(target.district) ?? -1) > hour) return;
  if (presenceNow(world, agent, target.district) < turf.presence.turnsToClaim) return;
  if (agent.turns < turf.push.turnCost || fit < minimum) return;
  const holder = target.holder;
  const model = turfPushCombatModel(ruleset)!;
  // Allies within the city may send backup, capped as a share of the corner.
  let backup = 0;
  let helpers = 0;
  for (const ally of world.agents) {
    if (ally === holder || !allied(ally, holder) || ally.city !== target.city || helpers >= turf.push.allies.maxHelpers) continue;
    if (ally.rng() >= turf.push.allies.chanceToShowUp) continue;
    backup += Math.min(fitThugs(ally, hour), Math.ceil(target.corner * turf.push.allies.maxShareOfDefender));
    helpers++;
  }
  // The holder, if online during the warning, answers with the crew at home. The attacker cannot see it coming.
  const online = (holder.spec.sessionsPerDay * SEASON_WORLD.sessionMinutes) / 1440;
  if (holder.rng() < online) backup += fitThugs(holder, hour);
  const visible = target.corner;
  const defenders = target.corner + backup;
  const defenderCrew = localsCrew(ruleset, 0);
  const corner: CombatCrew = { thugs: defenders, thugHappiness: happiness(holder, ruleset, hour).thug, weapons: { ...defenderCrew.weapons, PISTOL: defenders } };
  // The attacker sizes up the corner it can see.
  const seen: CombatCrew = { thugs: visible, thugHappiness: corner.thugHappiness, weapons: { ...corner.weapons, PISTOL: visible } };
  const mine = equipCombatSquad(crewOf(agent, fit, hour, ruleset), Math.min(fit, model.squadCap), model).strength;
  const theirs = visible > 0 ? equipCombatSquad(seen, Math.min(visible, model.squadCap), model).strength * model.strength.defenseMultiplier : 0;
  if (mine < theirs * SEASON_WORLD.pushEdge) return;
  agent.turns -= turf.push.turnCost;
  agent.tally.turfTurns += turf.push.turnCost;
  agent.tally.pushes++;
  holder.tally.pushedAt++;
  const counter = holder.spec.alliance ? world.alliancePushes : world.soloPushes;
  counter.attempts++;
  const result = turfFight(world, fit, agent, corner, lookoutsBoost(ruleset, holder));
  agent.pushCooldown.set(target.district, hour + turf.push.attackerCooldownHours);
  if (result.wounds.attacker > 0) agent.wounds.push({ thugs: result.wounds.attacker, until: hour + 2 });
  if (result.winner !== 'ATTACKER') return;
  counter.wins++;
  agent.tally.pushWins++;
  holder.tally.blocksLost++;
  // The corner crew comes home, some of it wounded; the winners take the corner.
  holder.posted = Math.max(0, holder.posted - target.corner);
  if (result.wounds.defender > 0) holder.wounds.push({ thugs: Math.min(target.corner, result.wounds.defender), until: hour + 2 });
  const posted = Math.max(minimum, Math.min(fit - result.wounds.attacker, desiredCorner(world, agent, target.district)));
  target.holder = agent;
  target.corner = posted;
  target.upkeepAt = hour;
  target.shieldUntil = hour + turf.push.shieldHours;
  target.changes++;
  agent.posted += posted;
}

/** Corner upkeep every hour: beer and product, and walkouts when they run out. */
function turfHour(world: World): void {
  const turf = world.ruleset.turf;
  if (!turf) return;
  for (const block of world.blocks) {
    if (!block.holder) {
      block.locals = Math.min(localsThugs(world.ruleset, { citySlug: block.city, district: block.district }), block.locals + turf.locals.regrowPerHour);
      continue;
    }
    const holder = block.holder;
    holder.tally.blockHours++;
    const need = cornerUpkeep(world.ruleset, block.corner, 1);
    const beer = Math.min(holder.beer, need.beer);
    holder.beer -= beer;
    let product = 0;
    for (const key of Object.keys(holder.stash)) {
      const take = Math.min(holder.stash[key]!, need.product - product);
      holder.stash[key]! -= take;
      product += take;
    }
    const short = 1 - Math.min(need.beer ? beer / need.beer : 1, need.product ? product / need.product : 1);
    if (short > 0) {
      const leaving = Math.min(block.corner, Math.ceil(block.corner * turf.corner.walkoutSharePerHour * short));
      block.corner -= leaving;
      holder.posted -= leaving;
      holder.thugs -= leaving;
      holder.weapons.PISTOL = Math.max(0, holder.weapons.PISTOL - leaving);
    }
    if (block.corner <= 0) {
      block.holder = null;
      block.corner = 0;
      block.locals = 0;
      block.changes++;
    }
  }
}

// --- the road --------------------------------------------------------------------------

function runPlans(world: World, agent: Agent): RoundRunPlan[] {
  const ruleset = world.ruleset;
  const trunk = runCapacity(ruleset, agent.lowRiders);
  if (trunk <= 0) return [];
  const plans = roundRunPlans(ruleset, { home: agent.city, trunk, cashCents: Math.max(0, agent.cash - SEASON_WORLD.cashReservePerCrew * (agent.whores + agent.thugs)), maxHours: 48 });
  if (agent.strategy.runs === 'counter') return plans.filter((plan) => plan.buyFrom === 'pip' && plan.sellTo === 'pip');
  if (agent.strategy.runs === 'market') return plans.filter((plan) => plan.buyFrom === 'market' || plan.sellTo === 'market');
  return plans;
}

function launchRun(world: World, agent: Agent, streetTurnValue: number): void {
  const ruleset = world.ruleset;
  const travel = ruleset.travel;
  if (!travel || agent.run || agent.lowRiders < 1) return;
  const plans = runPlans(world, agent).filter((plan) => plan.turns <= agent.turns);
  if (!plans.length) return;
  const best = plans.reduce((a, b) => (b.revenueCents - b.costCents) / b.turns > (a.revenueCents - a.costCents) / a.turns ? b : a);
  const profit = best.revenueCents - best.costCents;
  if (profit <= 0) return;
  // Street players only run when the run beats the turns it costs on the street.
  if (agent.strategy.street && profit < streetTurnValue * best.turns * SEASON_WORLD.runEdge) return;
  const escorts = Math.min(agent.lowRiders * ruleset.lowRiderThugCapacity, Math.floor(fitThugs(agent, world.hour) * (agent.strategy.street ? 0.2 : 1)));
  const living = { ...ruleset, round: { ...ruleset.round, startingCitySlug: agent.city } } as Ruleset;
  const trade: TravelTrade = {
    crew: agent.spec.name, product: best.product, buyCity: best.buyCity, buyFrom: best.buyFrom, sellCity: best.sellCity!, sellTo: best.sellTo!,
    units: best.units, limit: best.limit, costCents: best.costCents, revenueCents: best.revenueCents, profitCents: profit,
    driveHours: best.driveHours, turns: best.turns, profitPerTurnCents: profit / best.turns, streetShare: 0,
  };
  const carry = Math.ceil(best.costCents * 1.1);
  const outcome = driveRiskRun(living, trade, hashParts(world.roundId, agent.index, world.hour), carry, escorts);
  agent.cash -= carry;
  agent.turns -= best.turns;
  agent.tally.runTurns += best.turns;
  agent.tally.runs++;
  const run: Run = {
    backAt: world.hour + Math.ceil(best.driveHours * travel.gameMinutesPerDriveHour / 60),
    cashCents: carry, cargo: {}, escorts, lowRiders: agent.lowRiders, profitCents: outcome.profitCents, launchedAt: world.hour, owner: agent, tailed: false,
    findable: world.rng() < SEASON_WORLD.runsInReach,
  };
  // Half the drive with the purchase aboard, the rest with the sale's cash: what a tail finds.
  run.cargo[best.product] = best.units;
  agent.run = run;
  world.runs.push(run);
}

function runsHome(world: World): void {
  for (const run of [...world.runs]) {
    if (run.backAt > world.hour) continue;
    const agent = run.owner;
    const home = Math.max(0, run.cashCents + run.profitCents);
    agent.cash += home;
    agent.income.runs += home - run.cashCents;
    agent.run = null;
    world.runs.splice(world.runs.indexOf(run), 1);
  }
}

function convoySession(world: World, agent: Agent): void {
  const ruleset = world.ruleset;
  const rules = convoyRules(ruleset);
  const model = convoyCombatModel(ruleset);
  if (!agent.strategy.convoys || !rules || !model) return;
  const fit = fitThugs(agent, world.hour);
  if (fit < 5 || agent.turns < model.turnCost) return;
  const targets = world.runs.filter((run) => run.findable && !run.tailed && run.owner !== agent && !allied(run.owner, agent) && run.backAt > world.hour);
  if (!targets.length) return;
  const run = targets.reduce((a, b) => b.cashCents + b.profitCents > a.cashCents + a.profitCents ? b : a);
  const squad = Math.min(fit, model.squadCap);
  const escortWeapons = { PISTOL: run.escorts, SHOTGUN: 0, TEK9: 0, AK47: 0 };
  // Only a fight the squad clearly wins is worth the turns.
  const mine = equipCombatSquad(crewOf(agent, fit, world.hour, ruleset), squad, model).strength;
  const theirs = run.escorts > 0 ? equipCombatSquad({ thugs: run.escorts, thugHappiness: 80, weapons: escortWeapons }, Math.min(run.escorts, model.squadCap), model).strength * model.strength.defenseMultiplier : 0;
  if (mine < theirs * 1.2) return;
  agent.turns -= model.turnCost;
  agent.tally.convoyTurns += model.turnCost;
  agent.tally.tails++;
  run.tailed = true;
  const result = simulateRaid({
    attacker: crewOf(agent, fit, world.hour, ruleset), defender: { thugs: run.escorts, thugHappiness: 80, weapons: escortWeapons },
    attackingThugs: squad, attackerTurns: Math.max(model.turnCost, agent.turns + model.turnCost), defenderCashCents: 0n,
  }, model, agent.rng);
  if (result.wounds.attacker > 0) agent.wounds.push({ thugs: result.wounds.attacker, until: world.hour + 2 });
  if (result.winner !== 'ATTACKER') return;
  agent.tally.tailWins++;
  run.owner.tally.runsHit++;
  const onBoard = Math.max(0, run.cashCents + Math.max(0, run.profitCents) * 0.5);
  const loot = convoyLoot(ruleset, { runCashCents: BigInt(Math.round(onBoard)), cargo: run.cargo, fitAttackers: squad - result.wounds.attacker, rng: agent.rng });
  const cash = Number(loot.cashCents);
  const cargoValue = Object.entries(loot.cargo).reduce((sum, [key, units]) => sum + units * productWorth(ruleset, key), 0);
  run.cashCents -= cash;
  for (const [key, units] of Object.entries(loot.cargo)) {
    run.cargo[key] = Math.max(0, (run.cargo[key] ?? 0) - units);
    agent.stash[key] = (agent.stash[key] ?? 0) + units;
  }
  // Cargo lost is revenue the run will not make at its sale.
  const unitRevenue = run.cargo && Object.values(run.cargo).length ? run.profitCents / Math.max(1, Object.values(run.cargo).reduce((a, b) => a + b, 0) + Object.values(loot.cargo).reduce((a, b) => a + b, 0)) : 0;
  const lostRevenue = Object.values(loot.cargo).reduce((a, b) => a + b, 0) * Math.max(0, unitRevenue);
  run.profitCents -= lostRevenue;
  agent.cash += cash;
  agent.income.convoys += cash + cargoValue;
  run.owner.costs.convoyed += cash + lostRevenue;
}

// --- the hideout, cars, crew and moving --------------------------------------------------

function hideoutSession(world: World, agent: Agent): void {
  const rules = world.ruleset.hideout;
  const mode = agent.strategy.hideout;
  if (!rules || !mode) return;
  const order = mode === 'investor' ? SEASON_WORLD.hideoutOrder : SEASON_WORLD.hideoutOrder.slice(0, 2);
  const reserve = SEASON_WORLD.hideoutReserve[mode];
  for (const room of order) {
    const level = agent.hideout[room];
    const def = rules.rooms[room];
    if (level >= def.maxLevel) continue;
    const cost = def.costsCents[level]!;
    if (agent.cash < cost * (1 + reserve)) continue;
    agent.cash -= cost;
    agent.costs.hideout += cost;
    agent.hideout[room] = level + 1;
  }
  // A second bay for a crew that runs.
  const garage = rules.rooms.GARAGE;
  if (agent.strategy.runs && garage && agent.hideout.GARAGE < garage.maxLevel) {
    const cost = garage.costsCents[0]!;
    if (agent.cash > cost * 4) { agent.cash -= cost; agent.costs.hideout += cost; agent.hideout.GARAGE = 1; }
  }
}

function growCrew(world: World, agent: Agent): void {
  const ruleset = world.ruleset;
  // Muscle for crews that fight or hold: Tommy's thugs, so the whores stay covered too.
  const wantsMuscle = agent.strategy.raids === 'primary' || agent.strategy.turf === 'holder' || agent.strategy.convoys;
  const coverage = Math.ceil(agent.whores / ruleset.happiness.whore.whoresPerThug);
  const target = wantsMuscle ? Math.max(coverage, Math.ceil(agent.whores * 0.5)) : coverage;
  if (agent.thugs < target) {
    agent.thugs += buy(agent, ruleset, 'TOMMY', 'THUG', target - agent.thugs, 'crew', SEASON_WORLD.cashReservePerCrew * (agent.whores + agent.thugs));
  }
  // Cars for crews that run: as many as the cash allows, three at a time.
  if (agent.strategy.runs && !agent.run) {
    const want = agent.strategy.street ? 3 : 10;
    if (agent.lowRiders < want) {
      const price = storeItem(ruleset, 'CHARLIE', 'LOW_RIDER')?.buyCents ?? Infinity;
      // A runner's first car is the business; after that, cars only from spare cash.
      const spare = agent.lowRiders === 0 && !agent.strategy.street ? agent.cash - price * 0.5 : agent.cash - price * 4;
      if (spare > 0) agent.lowRiders += buy(agent, ruleset, 'CHARLIE', 'LOW_RIDER', Math.min(want - agent.lowRiders, Math.floor(spare / price)), 'cars');
    }
  }
}

/**
 * Travelers move once, as soon as they can pay, to the quietest city: the fewest rival
 * crews to raid it or tax its street, then the cheapest crack on Pip's counter.
 */
function maybeMove(world: World, agent: Agent): void {
  const rules = relocationRules(world.ruleset);
  if (!agent.strategy.moves || agent.movedAt !== null || !rules || !world.ruleset.cities) return;
  const crews = (city: string) => world.agents.filter((other) => other !== agent && other.joined && other.city === city).length;
  const crack = (city: string) => cityCounter(world.ruleset, city, CRACK)?.buyCents ?? Infinity;
  const scored = Object.keys(world.ruleset.cities).map((city) => ({ city, crews: crews(city), crack: crack(city), income: world.ruleset.cities![city]!.modifiers.income }));
  scored.sort((a, b) => a.crews - b.crews || b.income - a.income || a.crack - b.crack);
  const best = scored[0]!.city;
  if (best === agent.city) { agent.movedAt = world.hour; return; }
  const fee = Number(relocationFeeCents(BigInt(Math.round(netWorth(agent, world.ruleset))), rules));
  if (agent.cash < fee * 3 || agent.run) return;
  for (const block of blocksHeld(world, agent)) { agent.posted -= block.corner; block.holder = null; block.corner = 0; block.changes++; }
  agent.cash -= fee;
  agent.costs.moving += fee;
  agent.city = best;
  agent.movedAt = world.hour;
  agent.presence = {};
  // Downtime: the move eats this session.
  agent.tally.idleTurns += agent.turns;
  agent.turns = 0;
}

// --- a session -------------------------------------------------------------------------

/** A street turn's worth to this crew: what its own trips have been earning, or a first guess. */
function streetTurnValue(world: World, agent: Agent): number {
  if (agent.streetPerTurn > 0) return agent.streetPerTurn;
  const ruleset = world.ruleset;
  return Math.max(1, agent.whores) * ruleset.scouting.grossPerWhorePerTurnCents * 0.35 * (agent.payout / 100);
}

/** Crack the crew will burn before Pip's shelf could refill it, beyond what the shelf holds. */
function crackShortfall(world: World, agent: Agent): number {
  const ruleset = world.ruleset;
  const need = Math.ceil(agent.whores * ruleset.happiness.whore.crackPerWhore + agent.whores * ruleset.scouting.consumption.crackPerWhorePerTurn * SEASON_WORLD.tripTurns * SEASON_WORLD.supplyTrips);
  const shelf = Math.floor(agent.shelves.get(`PIP:${CRACK}`)?.stock ?? 0);
  return Math.max(0, need - (agent.stash[CRACK] ?? 0) - shelf);
}

function session(world: World, agent: Agent): void {
  agent.lastActive = world.hour;
  maybeMove(world, agent);
  if (agent.turns <= 0) return;
  sellSurplus(world, agent);
  restock(world, agent);
  growCrew(world, agent);
  hideoutSession(world, agent);

  const budget = agent.turns;
  // Fights first: they are limited by cooldowns, not turns.
  if (agent.strategy.raids && agent.raidCooldownUntil <= world.hour) raidSession(world, agent);
  turfSession(world, agent);
  convoySession(world, agent);
  if (agent.strategy.runs) launchRun(world, agent, streetTurnValue(world, agent));

  // The stove: a producer cooks its supply and anything that sells; everyone else only
  // when Pip's shelf cannot keep up, since a street turn is worth more than the saving.
  if (agent.strategy.produce && agent.turns > 0) {
    const fit = fitThugs(agent, world.hour);
    const perTurn = Math.max(0.1, fit * (world.ruleset.production.crack.perThugPerTurn ?? 0.5));
    const turns = agent.strategy.key === 'producer'
      ? Math.floor(budget * 0.35)
      : Math.ceil(crackShortfall(world, agent) / perTurn);
    if (turns > 0) produce(world, agent, Math.min(agent.turns, turns));
  }

  // The street takes every turn the crew's focus left, in whole trips. Single-system
  // grinders leave them: that is what grinding one system means.
  if (agent.strategy.street) {
    while (agent.turns >= 1 && agent.whores > 0) {
      const turns = Math.min(Math.floor(agent.turns), SEASON_WORLD.tripTurns);
      restock(world, agent);
      streetTrip(world, agent, turns, chooseDistrict(world, agent));
    }
  }
  sellSurplus(world, agent);
}

// --- the season ------------------------------------------------------------------------

export interface SeasonAgentSummary {
  readonly name: string;
  readonly strategy: SeasonStrategyKey;
  readonly strategyName: string;
  readonly joinDay: number;
  readonly sessionsPerDay: number;
  readonly alliance: string | null;
  readonly city: string;
  readonly netWorthCents: number;
  readonly cashCents: number;
  readonly whores: number;
  readonly thugs: number;
  readonly lowRiders: number;
  readonly hideoutLevels: number;
  readonly blocksHeld: number;
  readonly blockHours: number;
  readonly income: Readonly<Record<SeasonIncome, number>>;
  readonly costs: Readonly<Record<SeasonCost, number>>;
  readonly tally: Agent['tally'];
  /** Net worth at the end of each day since joining. */
  readonly daily: readonly number[];
}

export interface SeasonResult {
  readonly rulesetId: string;
  readonly seed: number;
  readonly days: number;
  readonly agents: readonly SeasonAgentSummary[];
  readonly turf: {
    /** Blocks held at the end, per holder. */
    readonly holders: Readonly<Record<string, number>>;
    /** Times any block changed hands. */
    readonly changes: number;
    /** Blocks that were ever held: the ones anyone fought over. */
    readonly contested: number;
    /** Most blocks any one alliance (or solo crew) held in the city at the end. */
    readonly maxBlocksPerGroup: number;
    readonly alliancePushes: { attempts: number; wins: number };
    readonly soloPushes: { attempts: number; wins: number };
  };
}

function makeAgent(world: World, spec: SeasonAgentSpec, index: number, seed: number): Agent {
  const ruleset = world.ruleset;
  const base = SEASON_STRATEGIES.find((row) => row.key === spec.strategy)!;
  const strategy: SeasonStrategy = spec.pure ? { ...base, street: false } : base;
  const start = ruleset.round.startingPlayer;
  const hours = SEASON_WORLD.sessionHours[spec.sessionsPerDay] ?? SEASON_WORLD.sessionHours[2]!;
  const offset = index % 2;
  return {
    spec, strategy, index, rng: seededRng(hashParts('season', seed, index, spec.name)), joined: false,
    city: ruleset.round.startingCitySlug, sessionHours: hours.map((hour) => (hour + offset) % 24),
    cash: start.cashCents, turns: start.turns, payout: ruleset.economy.payout.default,
    whores: start.whores, thugs: start.thugs, wounds: [],
    weapons: { PISTOL: start.pistols, SHOTGUN: start.shotguns, TEK9: start.tek9s, AK47: start.ak47s },
    condoms: start.condoms, beer: start.beer, medicine: start.medicine, stash: { [CRACK]: start.crack }, lowRiders: start.lowRiders,
    heat: 0, hideout: { SAFE_ROOM: 0, LOOKOUTS: 0, WORKSHOP: 0, BACK_OFFICE: 0, GARAGE: 0 }, posted: 0, presence: {}, run: null,
    shelves: shelvesFor(ruleset), lastActive: -1, raidProtectedUntil: -1, raidCooldownUntil: -1, lastRaidedAt: -1,
    revenge: new Map(), lastTarget: null, repeatHits: 0, pushCooldown: new Map(), movedAt: null,
    income: emptyIncome(), costs: emptyCosts(),
    tally: { streetTurns: 0, produceTurns: 0, runTurns: 0, raidTurns: 0, turfTurns: 0, convoyTurns: 0, idleTurns: 0, raids: 0, raidWins: 0, raided: 0, raidedLost: 0, pushes: 0, pushWins: 0, pushedAt: 0, blocksLost: 0, claims: 0, blockHours: 0, runs: 0, runsHit: 0, tails: 0, tailWins: 0, busts: 0 },
    daily: [], streetPerTurn: 0,
  };
}

/** One season. Deterministic for a ruleset, a seed and a roster. */
export function simulateSeason(ruleset: Ruleset, options: { seed?: number; days?: number; roster?: readonly SeasonAgentSpec[] } = {}): SeasonResult {
  const seed = options.seed ?? 1;
  const days = options.days ?? SEASON_WORLD.days;
  const roster = options.roster ?? SEASON_ROSTER;
  const world: World = {
    ruleset, roundId: `season-${seed}`, hour: 0, agents: [], blocks: [], runs: [], rng: seededRng(hashParts('season-world', seed)),
    alliancePushes: { attempts: 0, wins: 0 }, soloPushes: { attempts: 0, wins: 0 },
  };
  world.agents = roster.map((spec, index) => makeAgent(world, spec, index, seed));
  if (ruleset.turf) {
    for (const city of Object.keys(ruleset.cities ?? { [ruleset.round.startingCitySlug]: true })) {
      for (const district of Object.keys(ruleset.turf.districts) as DistrictKey[]) {
        world.blocks.push({ city, district, holder: null, corner: 0, locals: localsThugs(ruleset, { citySlug: city, district }), shieldUntil: -1, upkeepAt: 0, changes: 0, taxToday: new Map() });
      }
    }
  }
  const perHour = ruleset.turns.amountPerInterval * 60 / ruleset.turns.intervalMinutes;
  const heatIntervalsPerHour = 60 / ruleset.turns.intervalMinutes;

  for (let hour = 0; hour < days * 24; hour++) {
    world.hour = hour;
    const day = Math.floor(hour / 24);
    if (hour % 24 === 0) for (const block of world.blocks) block.taxToday.clear();
    for (const agent of world.agents) {
      if (!agent.joined && day >= agent.spec.joinDay) { agent.joined = true; agent.lastActive = hour; }
      if (!agent.joined) continue;
      const regenerated = agent.turns + perHour;
      if (regenerated > ruleset.turns.cap) agent.tally.idleTurns += regenerated - ruleset.turns.cap;
      agent.turns = Math.min(ruleset.turns.cap, regenerated);
      const heatRules = cityHeatRules(ruleset, agent.city);
      if (heatRules) agent.heat = decayHeat(agent.heat, heatIntervalsPerHour, heatRules);
      agent.wounds = agent.wounds.filter((wound) => wound.until > hour);
      for (const shelf of agent.shelves.values()) shelf.stock = Math.min(shelf.cap, shelf.stock + shelf.perHour);
    }
    runsHome(world);
    turfHour(world);
    // Everyone online this hour acts, in an order that changes hour to hour.
    const online = world.agents.filter((agent) => agent.joined && agent.sessionHours.includes(hour % 24));
    for (let i = online.length - 1; i > 0; i--) {
      const j = Math.floor(world.rng() * (i + 1));
      [online[i], online[j]] = [online[j]!, online[i]!];
    }
    for (const agent of online) session(world, agent);
    if (hour % 24 === 23) for (const agent of world.agents) if (agent.joined) agent.daily.push(netWorth(agent, ruleset));
  }

  const groups = new Map<string, number>();
  const holders: Record<string, number> = {};
  for (const block of world.blocks) {
    if (!block.holder) continue;
    holders[block.holder.spec.name] = (holders[block.holder.spec.name] ?? 0) + 1;
    const group = `${block.city}:${block.holder.spec.alliance ?? block.holder.spec.name}`;
    groups.set(group, (groups.get(group) ?? 0) + 1);
  }
  return {
    rulesetId: ruleset.meta.id,
    seed,
    days,
    agents: world.agents.map((agent) => ({
      name: agent.spec.name, strategy: agent.strategy.key, strategyName: agent.strategy.name, joinDay: agent.spec.joinDay,
      sessionsPerDay: agent.spec.sessionsPerDay, alliance: agent.spec.alliance ?? null, city: agent.city,
      netWorthCents: Math.round(netWorth(agent, ruleset)), cashCents: Math.round(agent.cash), whores: agent.whores, thugs: agent.thugs,
      lowRiders: agent.lowRiders, hideoutLevels: Object.values(agent.hideout).reduce((a, b) => a + b, 0),
      blocksHeld: world.blocks.filter((block) => block.holder === agent).length, blockHours: agent.tally.blockHours,
      income: agent.income, costs: agent.costs, tally: agent.tally, daily: agent.daily,
    })),
    turf: {
      holders,
      changes: world.blocks.reduce((sum, block) => sum + block.changes, 0),
      contested: world.blocks.filter((block) => block.changes > 0).length,
      maxBlocksPerGroup: Math.max(0, ...groups.values()),
      alliancePushes: world.alliancePushes,
      soloPushes: world.soloPushes,
    },
  };
}
