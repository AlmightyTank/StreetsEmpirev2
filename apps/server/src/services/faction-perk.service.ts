import {
  CASE_SCALE,
  WANTED_STAGES,
  cityLaw,
  coolCase,
  factionPerkOpen,
  factionTierName,
  loadRulesetForRound,
  racketRunStopCut,
  readRacketEffects,
  roadStopChances,
  shortSupplies,
  stageStartsAt,
  supplyCrashesAhead,
  wantedStage,
  workSupplyOrder,
  defaultWorkSupplyPolicy,
  FACTION_PERK_TIERS,
  type Ruleset,
} from '@streets/rules-engine';
import type { DistrictKey, FactionKey, FactionNudgeKind, FactionTier, LawOfficialRole, WantedStage } from '@streets/rulesets';
import type { FactionPerksDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { FactionService } from './faction.service.js';
import { OFFICIAL_TITLES } from './law-official.service.js';
import { ProductInventoryService } from './product-inventory.service.js';
import { crackdownPlan } from './turf-crackdown.service.js';
import { localsOnBlock } from './turf.service.js';

const HOUR_MS = 3_600_000;
/** The Outfit only talks about a city's rackets when at least this many crews run them. */
const RACKET_CREWS_TO_TALK = 3;
const MAX_LINES = 6;

/** What each faction's information and warnings are about. */
const TITLES: Readonly<Record<FactionKey, { information: string; warnings: string }>> = {
  KINGS: { information: 'Locals holding blocks where you work', warnings: 'Corners about to run dry, shields about to drop' },
  OUTFIT: { information: 'How many rackets run in each city', warnings: 'Where the crackdown lands, a day before the street hears' },
  ROAD_SAINTS: { information: 'The hottest roads out of town, at your Heat', warnings: 'A hot road ahead of a run on the road' },
  CARTEL_LINE: { information: 'Where Pip is short, and of what', warnings: 'A drought or Pip running out, up to a day ahead' },
  CIVIC_HANDSHAKE: { information: 'How close each official is to Internal Affairs', warnings: 'A Case a few points short of its next stage' },
};

const NUDGE_TITLES: Readonly<Record<FactionNudgeKind, (percent: number) => string>> = {
  CORNER_UPKEEP: (percent) => `Your corners burn ${percent}% less beer and product`,
  TOMMY_WEAPONS: (percent) => `Tommy's guns cost ${percent}% less`,
  BODYGUARD_TICKETS: (percent) => `Bodyguard tickets cost ${percent}% less`,
  PIP_PRODUCT: (percent) => `Pip's product costs ${percent}% less`,
  OFFICIAL_EXPOSURE: (percent) => `Officials' favors leave ${percent}% less exposure`,
};

const STAGE_NAMES: Readonly<Record<WantedStage, string>> = {
  QUIET: 'Quiet', NOTICED: 'Noticed', INVESTIGATION: 'Investigation', WARRANT: 'Warrant', FEDERAL: 'Federal',
};

function within(ms: number): string {
  const hours = Math.round(ms / HOUR_MS);
  return hours < 1 ? 'within the hour' : `in about ${hours} hour${hours === 1 ? '' : 's'}`;
}

function percent(chance: number): string {
  return `${Math.round(chance * 1000) / 10}%`;
}

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const districtName = (ruleset: Ruleset, city: string, district: string) =>
  ruleset.cities?.[city]?.districts?.[district as DistrictKey]?.name ?? ruleset.districts[district as DistrictKey]?.name ?? district;
const productName = (ruleset: Ruleset, key: string) => ruleset.products?.[key]?.name ?? (key === 'CRACK' ? 'Crack' : key);

interface PerkPlayer {
  id: string;
  heat: number;
  beer: number;
  racketEffects: unknown;
  cityId: string;
  citySlug: string;
  round: { id: string; startsAt: Date; endsAt: Date; rulesetId: string; rulesetVersion: string };
}

async function heldBlocks(db: Db, player: PerkPlayer) {
  return db.turf.findMany({
    where: { roundId: player.round.id, holderId: player.id },
    include: { city: { select: { slug: true } }, outpost: true },
  });
}

// --- The Kings ------------------------------------------------------------------------

async function kingsInformation(db: Db, ruleset: Ruleset, player: PerkPlayer, now: Date): Promise<string[]> {
  if (!ruleset.turf) return [];
  const held = await heldBlocks(db, player);
  const cityIds = [...new Set([player.cityId, ...held.map((row) => row.cityId)])];
  const rows = await db.turf.findMany({
    where: { roundId: player.round.id, cityId: { in: cityIds }, holderId: null },
    include: { city: { select: { slug: true } } },
  });
  const locals = rows
    .map((row) => ({ row, thugs: localsOnBlock(ruleset, { holderId: row.holderId, citySlug: row.city.slug, district: row.district as DistrictKey, localsThugs: row.localsThugs, localsAt: row.localsAt, localsReclaimAt: row.localsReclaimAt }, now) }))
    .filter(({ thugs }) => thugs > 0)
    .sort((a, b) => a.thugs - b.thugs);
  if (!locals.length) return ['No local crews hold a block where you work.'];
  return locals.slice(0, MAX_LINES).map(({ row, thugs }) =>
    `${districtName(ruleset, row.city.slug, row.district)}, ${cityName(ruleset, row.city.slug)}: ${thugs.toLocaleString('en-US')} locals`);
}

async function kingsWarnings(db: Db, ruleset: Ruleset, player: PerkPlayer, lead: number, now: Date): Promise<string[]> {
  const corner = ruleset.turf?.corner;
  if (!corner) return [];
  const leadMs = lead * HOUR_MS;
  const lines: string[] = [];
  const held = await heldBlocks(db, player);
  for (const row of held) {
    const left = row.shieldUntil ? row.shieldUntil.getTime() - now.getTime() : 0;
    if (left > 0 && left <= leadMs) {
      lines.push(`${districtName(ruleset, row.city.slug, row.district)}, ${cityName(ruleset, row.city.slug)} opens to pushes again ${within(left)}.`);
    }
  }
  // The Kings' own nudge already counts in how fast a corner burns.
  const cut = (await FactionService.nudge(db, player.id, ruleset, 'CORNER_UPKEEP'))?.percent ?? 0;
  const keep = 1 - cut / 100;
  const dry = (place: string, plural: boolean, thugs: number, beer: number, product: number) => {
    const beerRate = thugs * corner.beerPerThugPerHour * keep;
    const productRate = thugs * corner.productPerThugPerHour * keep;
    for (const [what, have, rate] of [['beer', beer, beerRate], ['product', product, productRate]] as const) {
      if (rate <= 0) continue;
      if (have <= 0) lines.push(`${place} ${plural ? 'are' : 'is'} out of ${what}: the crew will start walking.`);
      else if (have / rate * HOUR_MS <= leadMs) lines.push(`${place} run${plural ? '' : 's'} out of ${what} ${within(have / rate * HOUR_MS)}.`);
    }
  };
  const home = held.filter((row) => !row.outpost && row.cornerThugs > 0);
  if (home.length) {
    const policyRow = await db.workSupplyPolicy.findUnique({ where: { roundPlayerId_job: { roundPlayerId: player.id, job: 'CORNER' } } });
    const policy = policyRow
      ? { primary: policyRow.primary, fallback: policyRow.fallback, emergency: policyRow.emergency, strict: policyRow.strict }
      : defaultWorkSupplyPolicy();
    const inventory = await ProductInventoryService.read(db, player.id, ruleset);
    const product = workSupplyOrder(policy).reduce((sum, key) => sum + Math.max(0, inventory[key] ?? 0), 0);
    dry('Your home corners', true, home.reduce((sum, row) => sum + row.cornerThugs, 0), player.beer, product);
  }
  for (const row of held) {
    if (!row.outpost || row.cornerThugs <= 0) continue;
    const product = Object.values((row.outpost.products ?? {}) as Record<string, number>).reduce((sum, value) => sum + Math.max(0, value), 0);
    dry(`Your outpost in ${districtName(ruleset, row.city.slug, row.district)}, ${cityName(ruleset, row.city.slug)}`, false, row.cornerThugs, row.outpost.beer, product);
  }
  return lines;
}

// --- The Outfit -----------------------------------------------------------------------

async function outfitInformation(db: Db, ruleset: Ruleset, player: PerkPlayer, now: Date): Promise<string[]> {
  if (!ruleset.business) return [];
  const rows = await db.business.findMany({
    where: {
      roundId: player.round.id, racket: { not: null }, staff: { gt: 0 },
      turf: { holderId: { not: null } },
      OR: [{ racketShutUntil: null }, { racketShutUntil: { lte: now } }],
    },
    select: { turf: { select: { holderId: true, city: { select: { slug: true } } } } },
  });
  // Counts only, and only where enough crews run them that no one crew can be picked out.
  const byCity = new Map<string, { rackets: number; crews: Set<string> }>();
  for (const row of rows) {
    const entry = byCity.get(row.turf.city.slug) ?? { rackets: 0, crews: new Set<string>() };
    entry.rackets += 1;
    entry.crews.add(row.turf.holderId!);
    byCity.set(row.turf.city.slug, entry);
  }
  const lines = [...byCity.entries()]
    .filter(([, entry]) => entry.crews.size >= RACKET_CREWS_TO_TALK)
    .sort((a, b) => b[1].rackets - a[1].rackets)
    .slice(0, MAX_LINES)
    .map(([slug, entry]) => `${cityName(ruleset, slug)}: ${entry.rackets} rackets running across ${entry.crews.size} crews`);
  return lines.length ? lines : ['No city has enough crews running rackets for the Outfit to talk about.'];
}

async function outfitWarnings(db: Db, base: Ruleset, player: PerkPlayer, lead: number, now: Date): Promise<string[]> {
  const plan = crackdownPlan(player.round, base);
  if (!plan || now >= plan.sweepAt || now.getTime() < plan.warningAt.getTime() - lead * HOUR_MS) return [];
  const held = await heldBlocks(db, player);
  const yours = new Set([player.citySlug, ...held.map((row) => row.city.slug)]);
  if (!yours.has(plan.citySlug)) return ['The crackdown is coming, but not to anywhere you hold.'];
  const street = now < plan.warningAt ? ` The street hears ${within(plan.warningAt.getTime() - now.getTime())}.` : '';
  return [`The crackdown sweeps ${cityName(base, plan.citySlug)} ${within(plan.sweepAt.getTime() - now.getTime())}.${street}`];
}

// --- Road Saints MC -------------------------------------------------------------------

function roadSaintsInformation(base: Ruleset, player: PerkPlayer): string[] {
  const roads = (base.travel?.roads ?? []).filter((road) => road.from === player.citySlug || road.to === player.citySlug);
  if (!base.travel?.stops || !roads.length) return [];
  return roads
    .map((road) => {
      const other = road.from === player.citySlug ? road.to : road.from;
      const chance = roadStopChances(base, { route: [player.citySlug, other], cargoUnits: 0, escorts: 0, heat: player.heat })[0]?.chance ?? 0;
      return { road, other, chance };
    })
    .sort((a, b) => b.chance - a.chance)
    .slice(0, 3)
    .map(({ road, other, chance }) => `${road.name} to ${cityName(base, other)}: ${percent(chance)} stop chance empty, at your Heat`);
}

async function roadSaintsWarnings(db: Db, base: Ruleset, player: PerkPlayer, hot: number): Promise<string[]> {
  if (!base.travel?.stops) return [];
  const runs = await db.run.findMany({
    where: { roundPlayerId: player.id, status: 'ACTIVE' },
    include: { stops: { orderBy: { order: 'asc' } }, cargo: true },
  });
  const stopCut = racketRunStopCut(base, readRacketEffects(player.racketEffects));
  const lines: string[] = [];
  for (const run of runs) {
    const next = run.stops[run.roadChecks];
    if (!next) continue;
    const roads = roadStopChances(base, {
      route: next.route as string[],
      cargoUnits: run.cargo.reduce((sum, row) => sum + Math.max(0, row.quantity), 0),
      escorts: run.escortThugs,
      heat: player.heat,
      stopCut,
    });
    const chance = 1 - roads.reduce((clear, road) => clear * (1 - road.chance), 1);
    if (chance < hot) continue;
    const hottest = [...roads].sort((a, b) => b.chance - a.chance)[0];
    lines.push(`Your run's road into ${cityName(base, next.city)}${hottest ? ` (${hottest.road.name})` : ''} is hot: ${percent(chance)} stop chance with this trunk.`);
  }
  return lines;
}

// --- The Cartel Line ------------------------------------------------------------------

function cartelInformation(base: Ruleset, player: PerkPlayer, now: Date): string[] {
  const byCity = new Map<string, string[]>();
  for (const short of shortSupplies(base, player.round.id, now)) {
    const list = byCity.get(short.city) ?? [];
    list.push(`${short.supply === 'OUT' ? 'out of' : 'low on'} ${productName(base, short.product)}`);
    byCity.set(short.city, list);
  }
  if (!byCity.size) return ['Pip is stocked everywhere right now.'];
  return [...byCity.entries()].slice(0, MAX_LINES).map(([city, list]) => `${cityName(base, city)}: ${list.join(', ')}`);
}

function cartelWarnings(base: Ruleset, player: PerkPlayer, lead: number, now: Date): string[] {
  return supplyCrashesAhead(base, player.round.id, now, new Date(now.getTime() + lead * HOUR_MS))
    .slice(0, MAX_LINES)
    .map((crash) => `${cityName(base, crash.city)} runs out of ${productName(base, crash.product)} ${within(crash.at.getTime() - now.getTime())}${crash.kind === 'DROUGHT' && crash.endsAt ? `, for about ${Math.round((crash.endsAt.getTime() - crash.at.getTime()) / HOUR_MS)} hours` : ''}.`);
}

// --- Civic Handshake ------------------------------------------------------------------

async function civicInformation(db: Db, base: Ruleset, player: PerkPlayer, now: Date): Promise<string[]> {
  const rules = base.law?.officials;
  if (!rules) return [];
  const officials = await db.playerOfficial.findMany({ where: { roundPlayerId: player.id, status: 'ACTIVE' }, include: { city: { select: { name: true } } } });
  if (!officials.length) return ['You have nobody on the payroll.'];
  return officials.map((row) => {
    const title = `${OFFICIAL_TITLES[row.role as LawOfficialRole] ?? row.role}, ${row.city.name}`;
    if (row.iaOpenedAt && row.stingAt) return `${title}: under Internal Affairs. The sting lands ${within(row.stingAt.getTime() - now.getTime())}.`;
    return `${title}: ${Math.max(0, rules.exposure.line - row.exposure)} exposure left before Internal Affairs.`;
  });
}

async function civicWarnings(db: Db, base: Ruleset, player: PerkPlayer, leadPoints: number, now: Date): Promise<string[]> {
  const rules = base.law;
  if (!rules) return [];
  const cases = await db.playerCase.findMany({ where: { roundPlayerId: player.id, caseHundredths: { gt: 0 } }, include: { city: { select: { slug: true, name: true } } } });
  const lines: string[] = [];
  for (const row of cases) {
    const value = coolCase(row, now, rules, cityLaw(rules, row.city.slug).coolingSpeed);
    const next = WANTED_STAGES[WANTED_STAGES.indexOf(wantedStage(value, rules)) + 1];
    if (!next) continue;
    const gap = stageStartsAt(next, rules) - value;
    if (gap > 0 && gap <= leadPoints * CASE_SCALE) {
      const points = Math.ceil(gap / CASE_SCALE);
      lines.push(`Your Case in ${row.city.name} is ${points} point${points === 1 ? '' : 's'} from ${STAGE_NAMES[next]}.`);
    }
  }
  return lines;
}

/**
 * 1.4.0-D. What each faction tells the player, by their standing: its information from Known,
 * its early warnings from Trusted, and its nudge from Connected. Lines are worked out only for
 * the levels the player has opened. Everything reads the player's own state, the round's public
 * schedule, or counts no one crew can be picked out of; nothing names or reads another player.
 */
export const FactionPerkService = {
  async perks(db: Db, roundPlayerId: string, ruleset: Ruleset, now: Date = new Date()): Promise<Map<FactionKey, FactionPerksDto>> {
    const result = new Map<FactionKey, FactionPerksDto>();
    const perks = ruleset.factionPerks;
    if (!perks || !ruleset.factions || !ruleset.factionStanding) return result;
    const tiers = await FactionService.tiers(db, roundPlayerId, ruleset);
    const row = await db.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: { id: true, heat: true, beer: true, racketEffects: true, cityId: true, city: { select: { slug: true } }, round: { select: { id: true, startsAt: true, endsAt: true, rulesetId: true, rulesetVersion: true } } },
    });
    const player: PerkPlayer = { ...row, citySlug: row.city.slug };
    // The schedule-driven reads (markets, roads, the crackdown) use the round's own ruleset.
    const base = loadRulesetForRound(row.round);
    const warnings = perks.warnings;

    for (const key of Object.keys(ruleset.factions) as FactionKey[]) {
      const tier: FactionTier = tiers[key] ?? 'UNKNOWN';
      const informationOpen = factionPerkOpen(tier, 'INFORMATION');
      const warningsOpen = factionPerkOpen(tier, 'WARNINGS');
      const information = !informationOpen ? [] : await (async () => {
        switch (key) {
          case 'KINGS': return kingsInformation(db, ruleset, player, now);
          case 'OUTFIT': return outfitInformation(db, ruleset, player, now);
          case 'ROAD_SAINTS': return roadSaintsInformation(base, player);
          case 'CARTEL_LINE': return cartelInformation(base, player, now);
          case 'CIVIC_HANDSHAKE': return civicInformation(db, base, player, now);
        }
      })();
      const early = !warningsOpen ? [] : await (async () => {
        switch (key) {
          case 'KINGS': return kingsWarnings(db, ruleset, player, warnings.cornerLeadHours, now);
          case 'OUTFIT': return outfitWarnings(db, base, player, warnings.sweepLeadHours, now);
          case 'ROAD_SAINTS': return roadSaintsWarnings(db, base, player, warnings.hotRoadChance);
          case 'CARTEL_LINE': return cartelWarnings(base, player, warnings.supplyLeadHours, now);
          case 'CIVIC_HANDSHAKE': return civicWarnings(db, base, player, warnings.stageLeadPoints, now);
        }
      })();
      const nudge = perks.nudges[key];
      result.set(key, {
        information: { open: informationOpen, tierName: factionTierName(FACTION_PERK_TIERS.INFORMATION), title: TITLES[key].information, lines: information },
        warnings: { open: warningsOpen, tierName: factionTierName(FACTION_PERK_TIERS.WARNINGS), title: TITLES[key].warnings, lines: early },
        nudge: nudge ? {
          open: factionPerkOpen(tier, 'NUDGE'),
          tierName: factionTierName(FACTION_PERK_TIERS.NUDGE),
          title: NUDGE_TITLES[nudge.kind](nudge.percent),
          lines: [],
          percent: nudge.percent,
        } : null,
      });
    }
    return result;
  },
};
