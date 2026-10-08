import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  driveByMaxShooters,
  hashParts,
  loadRulesetForRound,
  productRecipes,
  rulesetForCity,
  seededRng,
  type Ruleset,
} from '@streets/rules-engine';
import type { NpcGangRules, SpecialRaidKind } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';
import { fitThugs } from './action.service.js';
import { CombatService, combatProtectionUntil } from './combat.service.js';
import { buildNpcGrudges, grudgesJson, openNpcGrudges, type NpcGrudge } from './npc-gang-memory.js';
import { ProductionService } from './production.service.js';
import { StoreService } from './store.service.js';

type DueNpcGang = Prisma.NpcGangGetPayload<{
  include: { roundPlayer: { include: { city: true; round: true } } };
}>;

type NpcGangCombatTarget = Prisma.RoundPlayerGetPayload<{
  select: {
    id: true;
    publicPimpId: true;
    displayName: true;
    createdAt: true;
    raidProtectedUntil: true;
    driveByProtectedUntil: true;
    lastRaidedAt: true;
    lastDrivenByAt: true;
    lastActiveAt: true;
    whores: true;
    thugs: true;
    woundedThugs: true;
    lowRiders: true;
    crack: true;
    condoms: true;
    whoreHappiness: true;
    thugHappiness: true;
    businessThugs: true;
    postedThugs: true;
  };
}>;

type NpcGangRestockPlan = {
  store: 'CORNER' | 'TOMMY' | 'CHARLIE' | 'PIP';
  item: string;
  quantity: number;
  reason: string;
};

type NpcGangIntent = 'RESTOCK' | 'PRODUCE' | 'RAID_PLAYER' | 'DRIVE_BY_PLAYER' | 'SPECIAL_RAID_PLAYER' | 'LAY_LOW';
type NpcGangOutcome = 'RESTOCKED' | 'PRODUCED' | 'RAIDED' | 'DROVE_BY' | 'SPECIAL_RAIDED' | 'LAY_LOW' | 'BLOCKED' | 'SKIPPED';
type NpcGangIntentCandidate = { intent: NpcGangIntent; weight: number };

const SPECIAL_RAID_KINDS = ['STEAL_RIDE', 'LURE_CREW', 'DRUG_HOES'] as const satisfies readonly SpecialRaidKind[];

const DEFAULT_NPC_GANG_RULES: NpcGangRules = {
  enabled: true,
  tickMinutes: 5,
  maxActionsPerTick: 6,
  maxPerCity: 4,
  retaliationHours: 24,
  revengeAggressionBoost: 20,
  revengeIntentBonus: 30,
};

function npcRules(ruleset: Ruleset): NpcGangRules {
  return { ...DEFAULT_NPC_GANG_RULES, ...ruleset.npcGangs };
}

function memoryObject(value: Prisma.JsonValue): Prisma.InputJsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Prisma.JsonObject) }
    : {};
}

function nextActionAt(now: Date, gang: Pick<DueNpcGang, 'ambition' | 'discipline'>, rules: NpcGangRules, outcome: NpcGangOutcome): Date {
  const tick = Math.max(1, rules.tickMinutes);
  const multiplier = outcome === 'DROVE_BY'
    ? 14
    : outcome === 'SPECIAL_RAIDED'
    ? 12
    : outcome === 'RAIDED'
    ? 10
    : outcome === 'PRODUCED'
    ? 6
    : outcome === 'RESTOCKED'
    ? 4
    : outcome === 'LAY_LOW'
      ? 3
      : outcome === 'SKIPPED'
        ? 6
        : 2;
  const ambitionNudge = outcome === 'PRODUCED' ? Math.round((100 - gang.ambition) / 25) : 0;
  const disciplineNudge = outcome === 'BLOCKED' ? Math.round(gang.discipline / 25) : 0;
  return new Date(now.getTime() + Math.max(tick, tick * multiplier + ambitionNudge + disciplineNudge) * 60_000);
}

function affordableQuantity(gang: DueNpcGang, ruleset: Ruleset, plan: NpcGangRestockPlan): number {
  const item = ruleset.stores[plan.store]?.items[plan.item];
  if (!item || item.buyCents <= 0) return 0;
  const cash = Number(gang.roundPlayer.cashCents > BigInt(Number.MAX_SAFE_INTEGER)
    ? BigInt(Number.MAX_SAFE_INTEGER)
    : gang.roundPlayer.cashCents);
  return Math.max(0, Math.min(plan.quantity, Math.floor(cash / item.buyCents)));
}

function restockPlans(gang: DueNpcGang, ruleset: Ruleset): NpcGangRestockPlan[] {
  const player = gang.roundPlayer;
  const fit = fitThugs(player);
  const plans: NpcGangRestockPlan[] = [];

  if (gang.aggression >= 75 && ruleset.combat?.driveBy && player.lowRiders < 1) {
    plans.push({ store: 'CHARLIE', item: 'LOW_RIDER', quantity: 1, reason: 'driveByRide' });
  }
  if (gang.aggression >= 45 && fit > 0 && player.pistols < Math.min(fit, 12)) {
    plans.push({ store: 'TOMMY', item: 'PISTOL', quantity: Math.min(6, Math.min(fit, 12) - player.pistols), reason: 'armCrew' });
  }
  if (player.woundedThugs > 0 && player.medicine < Math.min(player.woundedThugs, 10)) {
    plans.push({ store: 'CORNER', item: 'MEDICINE', quantity: Math.min(6, Math.min(player.woundedThugs, 10) - player.medicine), reason: 'treatWounded' });
  }
  if (gang.aggression >= 65 && ruleset.combat?.specialRaids?.LURE_CREW && player.beer < 5) {
    plans.push({ store: 'CORNER', item: 'BEER', quantity: 10 - player.beer, reason: 'lureCrewFuel' });
  }
  if (gang.aggression >= 65 && (ruleset.combat?.specialRaids?.DRUG_HOES || ruleset.combat?.specialRaids?.LURE_CREW) && player.crack < 5) {
    plans.push({ store: 'PIP', item: 'CRACK', quantity: 10 - player.crack, reason: 'specialRaidFuel' });
  }
  if (gang.ambition >= 45 && player.whores > 0 && player.condoms < Math.min(player.whores, 25)) {
    plans.push({ store: 'CORNER', item: 'CONDOM', quantity: Math.min(12, Math.min(player.whores, 25) - player.condoms), reason: 'escortSupplies' });
  }

  return plans
    .map((plan) => ({ ...plan, quantity: affordableQuantity(gang, ruleset, plan) }))
    .filter((plan) => plan.quantity > 0 && Boolean(ruleset.stores[plan.store]?.items[plan.item]));
}

function canRestock(gang: DueNpcGang, ruleset: Ruleset, now: Date): boolean {
  const player = gang.roundPlayer;
  return player.cashCents > 0n
    && (!player.lockedUntil || player.lockedUntil <= now)
    && (!player.movingUntil || player.movingUntil <= now)
    && restockPlans(gang, ruleset).length > 0;
}

function canRaid(gang: DueNpcGang, ruleset: Ruleset, now: Date): boolean {
  const model = ruleset.combat;
  if (!model) return false;
  const player = gang.roundPlayer;
  return gang.aggression >= 55
    && fitThugs(player) > 0
    && player.turns >= model.turnCost
    && (!player.lockedUntil || player.lockedUntil <= now)
    && (!player.movingUntil || player.movingUntil <= now)
    && (!player.raidCooldownUntil || player.raidCooldownUntil <= now)
    && combatProtectionUntil(player, model) <= now;
}

function canDriveBy(gang: DueNpcGang, ruleset: Ruleset, now: Date): boolean {
  const model = ruleset.combat;
  const rules = model?.driveBy;
  if (!model || !rules) return false;
  const player = gang.roundPlayer;
  return gang.aggression >= 80
    && driveByMaxShooters(fitThugs(player), player.lowRiders, model, rules) > 0
    && player.turns >= rules.turnCost
    && (!player.lockedUntil || player.lockedUntil <= now)
    && (!player.movingUntil || player.movingUntil <= now)
    && (!player.driveByCooldownUntil || player.driveByCooldownUntil <= now)
    && combatProtectionUntil(player, model) <= now;
}

function specialRaidTurnCost(ruleset: Ruleset, kind: SpecialRaidKind): number {
  const model = ruleset.combat;
  return model?.specialRaids?.[kind]?.turnCost ?? model?.turnCost ?? Number.MAX_SAFE_INTEGER;
}

function canPaySpecialRaid(gang: DueNpcGang, ruleset: Ruleset, kind: SpecialRaidKind, now: Date): boolean {
  const model = ruleset.combat;
  const player = gang.roundPlayer;
  if (!model || !model.specialRaids?.[kind]) return false;
  if (gang.aggression < 70) return false;
  if (fitThugs(player) < 1 || player.turns < specialRaidTurnCost(ruleset, kind)) return false;
  if (player.lockedUntil && player.lockedUntil > now) return false;
  if (player.movingUntil && player.movingUntil > now) return false;
  if (player.raidCooldownUntil && player.raidCooldownUntil > now) return false;
  if (combatProtectionUntil(player, model) > now) return false;
  if (kind === 'DRUG_HOES') return player.crack >= model.specialRaids.DRUG_HOES!.crackPerWhore;
  if (kind === 'LURE_CREW') {
    const rule = model.specialRaids.LURE_CREW!;
    return player.crack >= rule.crackPerWhore || player.beer >= rule.beerPerThug;
  }
  return true;
}

function availableSpecialRaidKinds(gang: DueNpcGang, ruleset: Ruleset, now: Date): SpecialRaidKind[] {
  return SPECIAL_RAID_KINDS
    .filter((kind) => canPaySpecialRaid(gang, ruleset, kind, now))
    .sort((left, right) => specialRaidScore(gang, right) - specialRaidScore(gang, left));
}

function specialRaidScore(gang: DueNpcGang, kind: SpecialRaidKind): number {
  if (kind === 'STEAL_RIDE') return gang.ambition + (gang.roundPlayer.lowRiders < 2 ? 25 : 0);
  if (kind === 'LURE_CREW') return gang.ambition + Math.round(gang.aggression / 2);
  return gang.aggression + Math.round(gang.ambition / 3);
}

function canProduce(gang: DueNpcGang, ruleset: Ruleset, now: Date): boolean {
  const player = gang.roundPlayer;
  const recipes = productRecipes(ruleset);
  return recipes.length > 0
    && player.cashCents > 0n
    && fitThugs(player) > 0
    && (!player.lockedUntil || player.lockedUntil <= now)
    && (!player.movingUntil || player.movingUntil <= now)
    && gang.ambition >= 30;
}

function archetypeBias(gang: DueNpcGang, intent: NpcGangIntent): number {
  const archetype = gang.archetype.toLowerCase();
  if (archetype.includes('stash') || archetype.includes('builder') || archetype.includes('cook')) {
    if (intent === 'PRODUCE') return 45;
    if (intent === 'RESTOCK') return 20;
    if (intent === 'RAID_PLAYER' || intent === 'DRIVE_BY_PLAYER') return -15;
  }
  if (archetype.includes('muscle') || archetype.includes('hitter') || archetype.includes('enforcer')) {
    if (intent === 'RAID_PLAYER') return 35;
    if (intent === 'SPECIAL_RAID_PLAYER') return 15;
    if (intent === 'RESTOCK') return 15;
  }
  if (archetype.includes('ride') || archetype.includes('driver') || archetype.includes('car')) {
    if (intent === 'DRIVE_BY_PLAYER') return 45;
    if (intent === 'SPECIAL_RAID_PLAYER') return 20;
    if (intent === 'RESTOCK') return 15;
  }
  if (archetype.includes('desperate') || archetype.includes('lure') || archetype.includes('locals')) {
    if (intent === 'SPECIAL_RAID_PLAYER') return 30;
    if (intent === 'RAID_PLAYER') return 15;
    if (intent === 'LAY_LOW') return -10;
  }
  if (archetype.includes('balanced')) {
    if (intent === 'RESTOCK' || intent === 'PRODUCE' || intent === 'RAID_PLAYER') return 10;
  }
  return 0;
}

function tierBias(gang: DueNpcGang, intent: NpcGangIntent): number {
  if (gang.tier === 'KINGPIN') return intent === 'LAY_LOW' ? -20 : 20;
  if (gang.tier === 'VETERAN') return intent === 'LAY_LOW' ? -10 : 12;
  if (gang.tier === 'STREET') return intent === 'LAY_LOW' ? -4 : 6;
  return intent === 'LAY_LOW' ? 8 : 0;
}

function intentWeight(gang: DueNpcGang, intent: NpcGangIntent): number {
  const raw = (() => {
    if (intent === 'RESTOCK') return 18 + Math.round(gang.discipline / 3) + Math.round(gang.ambition / 6);
    if (intent === 'PRODUCE') return 14 + Math.round(gang.ambition / 2) + Math.round(gang.discipline / 5);
    if (intent === 'RAID_PLAYER') return 10 + Math.round(gang.aggression / 2) + Math.round(gang.ambition / 8);
    if (intent === 'DRIVE_BY_PLAYER') return 6 + Math.round(gang.aggression * 0.7);
    if (intent === 'SPECIAL_RAID_PLAYER') return 8 + Math.round(gang.aggression / 2) + Math.round(gang.ambition / 4);
    return 8 + Math.round(gang.discipline / 3) + Math.max(0, 45 - gang.aggression);
  })();
  return Math.max(1, raw + archetypeBias(gang, intent) + tierBias(gang, intent));
}

function weightedChoice(candidates: readonly NpcGangIntentCandidate[], rng: () => number): NpcGangIntent {
  const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
  let roll = rng() * total;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) return candidate.intent;
  }
  return candidates[candidates.length - 1]?.intent ?? 'LAY_LOW';
}

/** Phase I. `revengeBonus` is the grudge pull toward hitting back; 0 when nobody valid is owed. */
function chooseIntent(gang: DueNpcGang, ruleset: Ruleset, now: Date, rng: () => number, revengeBonus = 0): NpcGangIntent {
  const candidates: NpcGangIntentCandidate[] = [];
  if (canRestock(gang, ruleset, now)) candidates.push({ intent: 'RESTOCK', weight: intentWeight(gang, 'RESTOCK') });
  if (canDriveBy(gang, ruleset, now)) candidates.push({ intent: 'DRIVE_BY_PLAYER', weight: intentWeight(gang, 'DRIVE_BY_PLAYER') + revengeBonus });
  if (availableSpecialRaidKinds(gang, ruleset, now).length) candidates.push({ intent: 'SPECIAL_RAID_PLAYER', weight: intentWeight(gang, 'SPECIAL_RAID_PLAYER') + revengeBonus });
  if (canRaid(gang, ruleset, now)) candidates.push({ intent: 'RAID_PLAYER', weight: intentWeight(gang, 'RAID_PLAYER') + revengeBonus });
  if (canProduce(gang, ruleset, now)) candidates.push({ intent: 'PRODUCE', weight: intentWeight(gang, 'PRODUCE') });
  if (!candidates.length) return 'LAY_LOW';

  const layLowWeight = Math.max(0, intentWeight(gang, 'LAY_LOW') - candidates.length * 12);
  if (layLowWeight > 0) candidates.push({ intent: 'LAY_LOW', weight: layLowWeight });
  return weightedChoice(candidates, rng);
}

function chooseProduct(ruleset: Ruleset): string {
  return productRecipes(ruleset)[0]?.product ?? 'CRACK';
}

function produceTurns(gang: DueNpcGang, ruleset: Ruleset): number {
  const minimum = ruleset.production.minTurns;
  const ambitionTurns = Math.max(minimum, Math.min(8, Math.ceil(gang.ambition / 12)));
  return Math.max(minimum, Math.min(gang.roundPlayer.turns || ambitionTurns, ambitionTurns));
}

function raidSquad(gang: DueNpcGang, ruleset: Ruleset): number {
  const model = ruleset.combat;
  if (!model) return 0;
  const fit = fitThugs(gang.roundPlayer);
  const pressure = Math.max(1, Math.ceil(fit * Math.min(0.6, gang.aggression / 180)));
  return Math.max(1, Math.min(fit, model.squadCap, pressure));
}

function driveBySquad(gang: DueNpcGang, ruleset: Ruleset): number {
  const model = ruleset.combat;
  const rules = model?.driveBy;
  if (!model || !rules) return 0;
  const seats = driveByMaxShooters(fitThugs(gang.roundPlayer), gang.roundPlayer.lowRiders, model, rules);
  const pressure = Math.max(1, Math.ceil(seats * Math.min(0.75, gang.aggression / 140)));
  return Math.max(1, Math.min(seats, pressure));
}

async function wasRecentlyNpcRaided(prisma: PrismaClient, targetId: string, now: Date, rules: NpcGangRules): Promise<boolean> {
  const since = new Date(now.getTime() - Math.max(1, rules.retaliationHours) * 3_600_000);
  const recent = await prisma.raidBattle.findMany({
    where: {
      defenderId: targetId,
      createdAt: { gte: since },
      voidedAt: null,
    },
    select: {
      attacker: {
        select: {
          npcGang: { select: { id: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return recent.some((battle) => Boolean(battle.attacker.npcGang));
}

function targetSupportsSpecialRaid(gang: DueNpcGang, target: NpcGangCombatTarget, ruleset: Ruleset, kind: SpecialRaidKind): boolean {
  const specialRaids = ruleset.combat?.specialRaids;
  if (!specialRaids?.[kind]) return false;
  if (kind === 'DRUG_HOES') return target.whores > 0 && (target.crack > 0 || target.condoms > 0);
  if (kind === 'STEAL_RIDE') return target.lowRiders > 0;
  const rule = specialRaids.LURE_CREW!;
  const canLureWhores = target.whoreHappiness < rule.happinessBelow && target.whores > 0 && gang.roundPlayer.crack >= rule.crackPerWhore;
  const reachableThugs = fitThugs(target) + target.businessThugs + target.postedThugs;
  const canLureThugs = target.thugHappiness < rule.happinessBelow && reachableThugs > 0 && gang.roundPlayer.beer >= rule.beerPerThug;
  return canLureWhores || canLureThugs;
}

const COMBAT_TARGET_SELECT = {
  id: true,
  publicPimpId: true,
  displayName: true,
  createdAt: true,
  raidProtectedUntil: true,
  driveByProtectedUntil: true,
  lastRaidedAt: true,
  lastDrivenByAt: true,
  lastActiveAt: true,
  whores: true,
  thugs: true,
  woundedThugs: true,
  lowRiders: true,
  crack: true,
  condoms: true,
  whoreHappiness: true,
  thugHappiness: true,
  businessThugs: true,
  postedThugs: true,
} satisfies Prisma.RoundPlayerSelect;

type NpcGangTargetMode = 'RAID' | 'DRIVE_BY';

/**
 * Phase I. Who this gang is owed payback by and can legally hit right now. When
 * non-empty the gang only looks at these crews this tick; ordinary targets wait.
 */
type NpcGangRevenge = { grudges: NpcGrudge[]; targets: NpcGangCombatTarget[] };

/** Live human crews in the gang's round and city. `ids` narrows to remembered attackers. */
async function cityTargets(prisma: PrismaClient, gang: DueNpcGang, ids?: readonly string[]): Promise<NpcGangCombatTarget[]> {
  return prisma.roundPlayer.findMany({
    where: {
      roundId: gang.roundPlayer.roundId,
      cityId: gang.roundPlayer.cityId,
      id: ids ? { in: [...ids], not: gang.roundPlayerId } : { not: gang.roundPlayerId },
      account: { isActive: true },
      npcGang: { is: null },
    },
    select: COMBAT_TARGET_SELECT,
    orderBy: [{ netWorthCents: 'desc' }, { cashCents: 'desc' }, { publicPimpId: 'asc' }],
    take: 20,
  });
}

/**
 * The shields every NPC hit respects, revenge included: newcomer and raid
 * protection, drive-by cool-off, and the "not back since the last hit" rule.
 * NPC payback never takes the player-side `bypassProtection` revenge pass.
 */
function targetOpen(gang: DueNpcGang, target: NpcGangCombatTarget, ruleset: Ruleset, now: Date, mode: NpcGangTargetMode, specialKind?: SpecialRaidKind): boolean {
  const model = ruleset.combat;
  if (!model) return false;
  if (combatProtectionUntil(target, model) > now) return false;
  if (mode === 'DRIVE_BY') {
    if (target.driveByProtectedUntil && target.driveByProtectedUntil > now) return false;
    if (target.lastDrivenByAt && target.lastActiveAt <= target.lastDrivenByAt) return false;
    if (fitThugs(target) < 1 && target.whores < 1) return false;
  } else if (target.lastRaidedAt && target.lastActiveAt <= target.lastRaidedAt) return false;
  return !specialKind || targetSupportsSpecialRaid(gang, target, ruleset, specialKind);
}

async function pickRaidTarget(prisma: PrismaClient, gang: DueNpcGang, ruleset: Ruleset, rules: NpcGangRules, now: Date, revenge: NpcGangRevenge, specialKind?: SpecialRaidKind, mode: NpcGangTargetMode = 'RAID'): Promise<NpcGangCombatTarget | null> {
  if (!ruleset.combat) return null;
  const candidates = revenge.targets.length ? revenge.targets : await cityTargets(prisma, gang);
  for (const target of candidates) {
    if (!targetOpen(gang, target, ruleset, now, mode, specialKind)) continue;
    if (await wasRecentlyNpcRaided(prisma, target.id, now, rules)) continue;
    return target;
  }
  return null;
}

async function pickSpecialRaidPlan(prisma: PrismaClient, gang: DueNpcGang, ruleset: Ruleset, rules: NpcGangRules, now: Date, revenge: NpcGangRevenge): Promise<{ kind: SpecialRaidKind; target: NpcGangCombatTarget } | null> {
  for (const kind of availableSpecialRaidKinds(gang, ruleset, now)) {
    const target = await pickRaidTarget(prisma, gang, ruleset, rules, now, revenge, kind);
    if (target) return { kind, target };
  }
  return null;
}

function storedBattleKind(battle: { kind: string; attackerReport: Prisma.JsonValue }): string {
  const report = battle.attackerReport;
  return report && typeof report === 'object' && !Array.isArray(report) && typeof report.kind === 'string' ? report.kind : battle.kind;
}

/** Phase I. Rebuilds the gang's grudges from the battles themselves, so lost memory heals itself. */
async function loadGrudges(prisma: PrismaClient, gang: DueNpcGang, rules: NpcGangRules, now: Date): Promise<NpcGrudge[]> {
  const since = new Date(now.getTime() - Math.max(1, rules.retaliationHours) * 3_600_000);
  const hits = await prisma.raidBattle.findMany({
    where: {
      defenderId: gang.roundPlayerId,
      createdAt: { gte: since },
      voidedAt: null,
      attacker: { npcGang: { is: null } },
    },
    select: {
      id: true,
      kind: true,
      attackerReport: true,
      attackerId: true,
      createdAt: true,
      attacker: { select: { publicPimpId: true, displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  if (!hits.length) return [];
  const paybacks = await prisma.raidBattle.findMany({
    where: {
      attackerId: gang.roundPlayerId,
      defenderId: { in: [...new Set(hits.map((hit) => hit.attackerId))] },
      createdAt: { gte: since },
      voidedAt: null,
    },
    select: { id: true, defenderId: true, createdAt: true },
  });
  return buildNpcGrudges(
    hits.map((hit) => ({
      id: hit.id,
      attackerId: hit.attackerId,
      publicPimpId: hit.attacker.publicPimpId,
      name: hit.attacker.displayName,
      kind: storedBattleKind(hit),
      createdAt: hit.createdAt,
    })),
    paybacks,
    rules.retaliationHours,
    now,
  );
}

/**
 * Open grudges whose attacker is still in town and hittable by at least one of
 * this gang's attack forms. The anti-dogpile window applies exactly as it does
 * to ordinary targets, so a crew another NPC already hit is left alone.
 */
async function revengeTargets(prisma: PrismaClient, gang: DueNpcGang, ruleset: Ruleset, rules: NpcGangRules, now: Date, grudges: readonly NpcGrudge[]): Promise<NpcGangCombatTarget[]> {
  const open = openNpcGrudges(grudges, now);
  if (!open.length || !ruleset.combat) return [];
  const rank = new Map(open.map((grudge, index) => [grudge.attackerId, index]));
  const rows = (await cityTargets(prisma, gang, open.map((grudge) => grudge.attackerId)))
    .sort((left, right) => (rank.get(left.id) ?? 0) - (rank.get(right.id) ?? 0));
  const valid: NpcGangCombatTarget[] = [];
  for (const target of rows) {
    if (!targetOpen(gang, target, ruleset, now, 'RAID') && !targetOpen(gang, target, ruleset, now, 'DRIVE_BY')) continue;
    if (await wasRecentlyNpcRaided(prisma, target.id, now, rules)) continue;
    valid.push(target);
  }
  return valid;
}

function settleGrudge(grudges: readonly NpcGrudge[], targetId: string, battleId: string, now: Date): NpcGrudge[] {
  return grudges.map((grudge) => grudge.attackerId === targetId && !grudge.settledAt
    ? { ...grudge, settledAt: now.toISOString(), settledBattleId: battleId }
    : grudge);
}

async function restock(prisma: PrismaClient, gang: DueNpcGang, ruleset: Ruleset, rules: NpcGangRules, now: Date): Promise<NpcGangOutcome | null> {
  let lastError: unknown;
  for (const plan of restockPlans(gang, ruleset)) {
    try {
      const actionId = `npc:${gang.id}:${randomUUID()}`;
      const result = await StoreService.trade(prisma, gang.roundPlayerId, {
        store: plan.store,
        item: plan.item,
        direction: 'buy',
        quantity: plan.quantity,
        actionId,
      });
      await recordOutcome(prisma, gang, now, {
        intent: 'RESTOCK',
        outcome: 'RESTOCKED',
        rules,
        detail: {
          actionId,
          reason: plan.reason,
          store: result.result.storeKey,
          item: result.result.itemName,
          itemKey: plan.item,
          quantity: result.result.quantity,
          totalCents: result.result.totalCents,
          cashChangeCents: result.result.cashChangeCents,
        },
      });
      return 'RESTOCKED';
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError && !canRaid(gang, ruleset, now) && !canProduce(gang, ruleset, now)) {
    await recordOutcome(prisma, gang, now, { intent: 'RESTOCK', outcome: 'BLOCKED', rules, error: lastError });
    return 'BLOCKED';
  }
  return null;
}

async function claimDueGang(prisma: PrismaClient, gangId: string, now: Date): Promise<boolean> {
  const claimed = await prisma.npcGang.updateMany({
    where: {
      id: gangId,
      nextActionAt: { lte: now },
      OR: [{ dormantUntil: null }, { dormantUntil: { lte: now } }],
    },
    data: { nextActionAt: new Date(now.getTime() + 15 * 60_000) },
  });
  return claimed.count === 1;
}

async function recordOutcome(
  prisma: PrismaClient,
  gang: DueNpcGang,
  now: Date,
  input: {
    intent: NpcGangIntent;
    outcome: NpcGangOutcome;
    rules: NpcGangRules;
    detail?: Prisma.InputJsonValue;
    error?: unknown;
    /** Phase I. Extra memory written after the standard fields, e.g. settled grudges. */
    memory?: Prisma.InputJsonObject;
  },
): Promise<void> {
  const error = input.error instanceof AppError
    ? { code: input.error.code, message: input.error.message }
    : input.error instanceof Error
      ? { code: 'ERROR', message: input.error.message }
      : undefined;
  await prisma.npcGang.update({
    where: { id: gang.id },
    data: {
      lastActionAt: now,
      nextActionAt: nextActionAt(now, gang, input.rules, input.outcome),
      memory: {
        ...memoryObject(gang.memory),
        lastIntent: input.intent,
        lastOutcome: input.outcome,
        lastActionAt: now.toISOString(),
        ...(input.detail !== undefined ? { lastDetail: input.detail } : {}),
        lastError: error ?? null,
        ...input.memory,
      },
    },
  });
}

/**
 * Phase I. A gang owed payback acts angrier: its aggression is lifted for gating
 * and weighting, and its attack moves only look at the crews it remembers.
 */
function angryGang(gang: DueNpcGang, rules: NpcGangRules): DueNpcGang {
  return { ...gang, aggression: Math.min(100, gang.aggression + Math.max(0, rules.revengeAggressionBoost)) };
}

function rememberGrudges(gang: DueNpcGang, grudges: readonly NpcGrudge[]): DueNpcGang {
  return { ...gang, memory: { ...(memoryObject(gang.memory) as Prisma.JsonObject), grudges: grudgesJson(grudges) } };
}

/** The memory written when a hit lands; a hit on a remembered crew settles that grudge. */
function hitMemory(revenge: NpcGangRevenge, target: NpcGangCombatTarget, battleId: string, kind: string, won: boolean, now: Date): { revenge: boolean; memory?: Prisma.InputJsonObject } {
  if (!revenge.targets.some((row) => row.id === target.id)) return { revenge: false };
  return {
    revenge: true,
    memory: {
      grudges: grudgesJson(settleGrudge(revenge.grudges, target.id, battleId, now)),
      lastRevenge: {
        battleId,
        kind,
        targetPublicPimpId: target.publicPimpId,
        targetName: target.displayName,
        won,
        at: now.toISOString(),
      },
    },
  };
}

type NpcGangRun = { outcome: NpcGangOutcome; revenge: boolean };

async function runGang(prisma: PrismaClient, due: DueNpcGang, now: Date): Promise<NpcGangRun> {
  const baseRuleset = loadRulesetForRound(due.roundPlayer.round);
  const livingRuleset = rulesetForCity(baseRuleset, due.roundPlayer.city.slug);
  const rules = npcRules(livingRuleset);
  if (!rules.enabled || due.roundPlayer.round.status !== 'ACTIVE') {
    await recordOutcome(prisma, due, now, { intent: 'LAY_LOW', outcome: 'SKIPPED', rules });
    return { outcome: 'SKIPPED', revenge: false };
  }

  const grudges = await loadGrudges(prisma, due, rules, now);
  const remembered = rememberGrudges(due, grudges);
  const revenge: NpcGangRevenge = { grudges, targets: await revengeTargets(prisma, remembered, livingRuleset, rules, now, grudges) };
  const gang = revenge.targets.length ? angryGang(remembered, rules) : remembered;
  const outcome = (value: NpcGangOutcome, hit?: { revenge: boolean }): NpcGangRun => ({ outcome: value, revenge: Boolean(hit?.revenge) });

  const intent = chooseIntent(gang, livingRuleset, now, seededRng(hashParts(gang.id, now.toISOString(), 'intent')), revenge.targets.length ? rules.revengeIntentBonus : 0);
  if (intent === 'LAY_LOW') {
    await recordOutcome(prisma, gang, now, { intent, outcome: 'LAY_LOW', rules });
    return outcome('LAY_LOW');
  }

  if (intent === 'RESTOCK') {
    const restocked = await restock(prisma, gang, livingRuleset, rules, now);
    if (restocked) return outcome(restocked);
  }

  if (intent === 'DRIVE_BY_PLAYER' || (intent === 'RESTOCK' && canDriveBy(gang, livingRuleset, now))) {
    const target = await pickRaidTarget(prisma, gang, livingRuleset, rules, now, revenge, undefined, 'DRIVE_BY');
    if (target) {
      try {
        const actionId = `npc:${gang.id}:${randomUUID()}`;
        const report = await CombatService.driveBy(prisma, gang.roundPlayerId, {
          roundId: gang.roundPlayer.roundId,
          targetPublicPimpId: target.publicPimpId,
          attackingThugs: driveBySquad(gang, livingRuleset),
          actionId,
        });
        const hit = hitMemory(revenge, target, report.id, 'DRIVE_BY', report.won, now);
        await recordOutcome(prisma, gang, now, {
          intent,
          outcome: 'DROVE_BY',
          rules,
          detail: {
            actionId,
            battleId: report.id,
            targetPublicPimpId: target.publicPimpId,
            targetName: target.displayName,
            won: report.won,
            wounds: report.yourWounds,
            turnsSpent: report.turnsSpent,
            driveBy: report.driveBy ?? null,
            revenge: hit.revenge,
            retaliation: report.retaliation ?? false,
          },
          memory: hit.memory,
        });
        return outcome('DROVE_BY', hit);
      } catch (error) {
        await recordOutcome(prisma, gang, now, { intent, outcome: 'BLOCKED', rules, error });
        return outcome('BLOCKED');
      }
    }
  }

  if (
    intent === 'SPECIAL_RAID_PLAYER'
    || intent === 'DRIVE_BY_PLAYER'
    || (intent === 'RESTOCK' && availableSpecialRaidKinds(gang, livingRuleset, now).length > 0)
  ) {
    const plan = await pickSpecialRaidPlan(prisma, gang, livingRuleset, rules, now, revenge);
    if (plan) {
      try {
        const actionId = `npc:${gang.id}:${randomUUID()}`;
        const report = await CombatService.specialRaid(prisma, gang.roundPlayerId, {
          roundId: gang.roundPlayer.roundId,
          targetPublicPimpId: plan.target.publicPimpId,
          attackingThugs: raidSquad(gang, livingRuleset),
          kind: plan.kind,
          actionId,
        });
        const hit = hitMemory(revenge, plan.target, report.id, plan.kind, report.won, now);
        await recordOutcome(prisma, gang, now, {
          intent: 'SPECIAL_RAID_PLAYER',
          outcome: 'SPECIAL_RAIDED',
          rules,
          detail: {
            actionId,
            battleId: report.id,
            kind: plan.kind,
            targetPublicPimpId: plan.target.publicPimpId,
            targetName: plan.target.displayName,
            won: report.won,
            crackChange: report.crackChange ?? 0,
            wounds: report.yourWounds,
            turnsSpent: report.turnsSpent,
            raidForm: report.raidForm ?? null,
            revenge: hit.revenge,
            retaliation: report.retaliation ?? false,
          },
          memory: hit.memory,
        });
        return outcome('SPECIAL_RAIDED', hit);
      } catch (error) {
        await recordOutcome(prisma, gang, now, { intent: 'SPECIAL_RAID_PLAYER', outcome: 'BLOCKED', rules, error });
        return outcome('BLOCKED');
      }
    }
  }

  if (
    intent === 'RAID_PLAYER'
    || ((intent === 'RESTOCK' || intent === 'SPECIAL_RAID_PLAYER' || intent === 'DRIVE_BY_PLAYER') && canRaid(gang, livingRuleset, now))
  ) {
    const target = await pickRaidTarget(prisma, gang, livingRuleset, rules, now, revenge);
    if (target) {
      try {
        const actionId = `npc:${gang.id}:${randomUUID()}`;
        const report = await CombatService.raid(prisma, gang.roundPlayerId, {
          roundId: gang.roundPlayer.roundId,
          targetPublicPimpId: target.publicPimpId,
          attackingThugs: raidSquad(gang, livingRuleset),
          actionId,
        });
        const hit = hitMemory(revenge, target, report.id, 'RAID', report.won, now);
        await recordOutcome(prisma, gang, now, {
          intent,
          outcome: 'RAIDED',
          rules,
          detail: {
            actionId,
            battleId: report.id,
            targetPublicPimpId: target.publicPimpId,
            targetName: target.displayName,
            won: report.won,
            cashChangeCents: report.cashChangeCents,
            crackChange: report.crackChange ?? 0,
            wounds: report.yourWounds,
            turnsSpent: report.turnsSpent,
            revenge: hit.revenge,
            retaliation: report.retaliation ?? false,
          },
          memory: hit.memory,
        });
        return outcome('RAIDED', hit);
      } catch (error) {
        await recordOutcome(prisma, gang, now, { intent, outcome: 'BLOCKED', rules, error });
        return outcome('BLOCKED');
      }
    }
    if (!canProduce(gang, livingRuleset, now)) {
      await recordOutcome(prisma, gang, now, { intent: 'LAY_LOW', outcome: 'LAY_LOW', rules });
      return outcome('LAY_LOW');
    }
  }

  try {
    const actionId = `npc:${gang.id}:${randomUUID()}`;
    const result = await ProductionService.produceCrack(prisma, gang.roundPlayerId, {
      turns: produceTurns(gang, livingRuleset),
      productType: chooseProduct(livingRuleset),
      actionId,
    }, seededRng(hashParts(gang.id, now.toISOString(), 'produce')));
    await recordOutcome(prisma, gang, now, {
      intent: 'PRODUCE',
      outcome: 'PRODUCED',
      rules,
      detail: {
        actionId,
        productType: result.result.productType,
        productProduced: result.result.productProduced,
        turnsUsed: result.result.turnsUsed,
      },
    });
    return outcome('PRODUCED');
  } catch (error) {
    await recordOutcome(prisma, gang, now, { intent, outcome: 'BLOCKED', rules, error });
    return outcome('BLOCKED');
  }
}

export const NpcGangService = {
  /**
   * Phase G: due NPC gangs choose weighted intents by archetype, traits and available moves.
   * Phase I: gangs remember the humans who hit them and lean toward payback inside the window.
   * The raid engine still owns combat legality, cooldowns and player alerts.
   */
  async sweep(prisma: PrismaClient, now = new Date()): Promise<{ checked: number; acted: number; restocked: number; produced: number; raided: number; droveBy: number; specialRaided: number; revenged: number; blocked: number }> {
    const due = await prisma.npcGang.findMany({
      where: {
        nextActionAt: { lte: now },
        OR: [{ dormantUntil: null }, { dormantUntil: { lte: now } }],
        roundPlayer: { account: { isActive: true } },
      },
      include: { roundPlayer: { include: { city: true, round: true } } },
      orderBy: [{ nextActionAt: 'asc' }, { id: 'asc' }],
      take: 25,
    });

    let acted = 0;
    let restocked = 0;
    let produced = 0;
    let raided = 0;
    let droveBy = 0;
    let specialRaided = 0;
    let revenged = 0;
    let blocked = 0;
    for (const gang of due) {
      const baseRuleset = loadRulesetForRound(gang.roundPlayer.round);
      const rules = npcRules(rulesetForCity(baseRuleset, gang.roundPlayer.city.slug));
      if (acted >= rules.maxActionsPerTick) break;
      if (!await claimDueGang(prisma, gang.id, now)) continue;
      const { outcome, revenge } = await runGang(prisma, gang, now);
      acted += outcome === 'SKIPPED' ? 0 : 1;
      if (revenge) revenged += 1;
      if (outcome === 'RESTOCKED') restocked += 1;
      if (outcome === 'PRODUCED') produced += 1;
      if (outcome === 'RAIDED') raided += 1;
      if (outcome === 'DROVE_BY') droveBy += 1;
      if (outcome === 'SPECIAL_RAIDED') specialRaided += 1;
      if (outcome === 'BLOCKED') blocked += 1;
    }

    return { checked: due.length, acted, restocked, produced, raided, droveBy, specialRaided, revenged, blocked };
  },
};
