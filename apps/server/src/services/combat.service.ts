import { randomInt, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient, Round, RoundPlayer } from '@prisma/client';
import { driveByMaxShooters, equipCombatSquad, loadRulesetForRound, simulateDriveBy, simulateRaid, type CombatCrew, type Ruleset } from '@streets/rules-engine';
import type { DriveByRules } from '@streets/rulesets';
import {
  combatReconSchema,
  combatTreatmentSchema,
  driveBySchema,
  raidSchema,
  type BattleReportDto,
  type CombatDriveByDto,
  type CombatIntelReportDto,
  type CombatPageDto,
  type CombatRecoveryDto,
  type CombatTreatmentDto,
  type CombatReconInputDto,
  type CombatReconResultDto,
  type CombatTreatmentInputDto,
  type DriveByInputDto,
  type RaidInputDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer } from '../utils/db.js';
import { fitThugs, toState } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { CombatRecoveryService } from './combat-recovery.service.js';
import { HappinessService } from './happiness.service.js';
import { assertPlayerState } from './invariant.service.js';
import { NetWorthService } from './net-worth.service.js';
import { PlayerStateService } from './player-state.service.js';
import { RankingService } from './ranking.service.js';

type CombatRules = NonNullable<Ruleset['combat']>;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value, (_, v: unknown) => typeof v === 'bigint' ? v.toString() : v));
const iso = (value: Date | null) => value?.toISOString() ?? null;
const reportStrength = (value: number) => Math.round(value * 10) / 10;

function modelFor(round: Round): { ruleset: Ruleset; model: CombatRules } {
  const ruleset = loadRulesetForRound(round);
  if (!ruleset.combat) throw AppError.conflict('COMBAT_DISABLED', 'Raids are not available in this older economy round. Join the current 0.2.0-D strategy round to use raids, recon and revenge.');
  return { ruleset, model: ruleset.combat };
}

function playable(round: Round, now: Date): void {
  if (round.status !== 'ACTIVE' || round.startsAt > now || round.endsAt <= now) {
    throw AppError.conflict('ROUND_NOT_PLAYABLE', 'This round is not currently open for raids.');
  }
}

function crew(player: RoundPlayer): CombatCrew {
  return {
    thugs: fitThugs(player),
    thugHappiness: player.thugHappiness,
    weapons: { PISTOL: player.pistols, SHOTGUN: player.shotguns, TEK9: player.tek9s, AK47: player.ak47s },
  };
}

/** Compare full deployed crews at full morale, preventing small-squad or beer-dumping bypasses. */
function strength(player: RoundPlayer, model: CombatRules): number {
  const fit = fitThugs(player);
  return equipCombatSquad({ ...crew(player), thugHappiness: 100 }, Math.min(fit, model.squadCap), model).strength;
}

export function combatProtectionUntil(player: Pick<RoundPlayer, 'createdAt' | 'raidProtectedUntil'>, model: CombatRules): Date {
  return new Date(Math.max(player.createdAt.getTime() + model.newcomerHours * 3_600_000, player.raidProtectedUntil?.getTime() ?? 0));
}

export function combatAttackerBlock(player: RoundPlayer, model: CombatRules, now: Date): string | null {
  if (combatProtectionUntil(player, model) > now) return 'You are protected. Wait until your protection ends before raiding.';
  if (player.raidCooldownUntil && player.raidCooldownUntil > now) return 'Your crew is regrouping after its last raid.';
  if (fitThugs(player) < 1) return 'Wait for a thug to recover before raiding.';
  if (player.turns < model.turnCost) return `You need ${model.turnCost} turns to raid.`;
  return null;
}

export function combatTargetBlock(attacker: RoundPlayer, defender: RoundPlayer, model: CombatRules, now: Date, retaliation = false): string | null {
  if (attacker.id === defender.id || attacker.accountId === defender.accountId) return 'You cannot raid yourself.';
  if (attacker.roundId !== defender.roundId) return 'Pick a player in your round.';
  if (attacker.cityId !== defender.cityId) return 'Pick a player in your city.';
  const retaliationRules = model.strategy?.retaliation;
  if (combatProtectionUntil(defender, model) > now && !(retaliation && retaliationRules?.bypassProtection)) return 'This player is protected.';
  if (defender.lastRaidedAt && defender.lastActiveAt <= defender.lastRaidedAt) return 'This player has not returned since the last raid.';
  if (strength(defender, model) < strength(attacker, model) * model.minimumTargetStrengthRatio && !(retaliation && retaliationRules?.bypassMinimumStrength)) return 'This crew is too weak for you to raid.';
  const hasExposedCash = defender.cashCents > BigInt(model.loot.protectedCashCents);
  const hasExposedCrack = (model.loot.exposedDrugPercent ?? 0) > 0 && (model.loot.perFitAttackerCrack ?? 0) > 0 && defender.crack > 0;
  if (!hasExposedCash && !hasExposedCrack) return 'This player has no exposed cash or crack to raid.';
  return null;
}

/**
 * Drive-bys keep their own clocks. Nothing about one sets the raid shield or
 * the raid cooldown, which is what lets a drive-by soften a crew for a raid.
 */
export function driveByAttackerBlock(player: RoundPlayer, model: CombatRules, rules: DriveByRules, now: Date): string | null {
  if (combatProtectionUntil(player, model) > now) return 'You are protected. Wait until your protection ends before a drive-by.';
  if (player.driveByCooldownUntil && player.driveByCooldownUntil > now) return 'Your cars are cooling off after the last drive-by.';
  if (player.lowRiders < 1) return 'You need a Low-Rider for a drive-by. Charlie sells them.';
  if (fitThugs(player) < 1) return 'Wait for a thug to recover before a drive-by.';
  if (player.turns < rules.turnCost) return `You need ${rules.turnCost} turns for a drive-by.`;
  return null;
}

export function driveByTargetBlock(attacker: RoundPlayer, defender: RoundPlayer, model: CombatRules, now: Date, retaliation = false): string | null {
  if (attacker.id === defender.id || attacker.accountId === defender.accountId) return 'You cannot hit your own block.';
  if (attacker.roundId !== defender.roundId) return 'Pick a player in your round.';
  if (attacker.cityId !== defender.cityId) return 'Pick a player in your city.';
  const retaliationRules = model.strategy?.retaliation;
  const bypassProtection = retaliation && retaliationRules?.bypassProtection;
  if (combatProtectionUntil(defender, model) > now && !bypassProtection) return 'This player is protected.';
  if (defender.driveByProtectedUntil && defender.driveByProtectedUntil > now && !bypassProtection) return 'Their block was shot up recently. Let it cool off.';
  // The same anti-drain rule as raids: an offline player is hit once, not every shield.
  if (defender.lastDrivenByAt && defender.lastActiveAt <= defender.lastDrivenByAt) return 'This player has not been back since the last drive-by.';
  if (strength(defender, model) < strength(attacker, model) * model.minimumTargetStrengthRatio && !(retaliation && retaliationRules?.bypassMinimumStrength)) return 'This crew is too weak for you to hit.';
  if (fitThugs(defender) < 1 && defender.whores < 1) return 'There is nobody on their block to hit.';
  return null;
}

function driveByDto(player: RoundPlayer, model: CombatRules, rules: DriveByRules, now: Date): CombatDriveByDto {
  return {
    blockedReason: driveByAttackerBlock(player, model, rules, now),
    cooldownUntil: player.driveByCooldownUntil && player.driveByCooldownUntil > now ? iso(player.driveByCooldownUntil) : null,
    lowRiders: player.lowRiders,
    maxShooters: driveByMaxShooters(fitThugs(player), player.lowRiders, model, rules),
    rules: {
      turnCost: rules.turnCost,
      thugsPerLowRider: rules.thugsPerLowRider,
      cooldownMinutes: rules.cooldownMinutes,
      protectionHours: rules.protectionHours,
      defenderFieldedPercent: Math.round(rules.defenderFieldedFraction * 100),
      minThugWoundPercent: rules.hit.thugWounds.minPercent,
      maxThugWoundPercent: rules.hit.thugWounds.maxPercent,
      minWhoreKillPercent: rules.hit.whoreKills.minPercent,
      maxWhoreKillPercent: rules.hit.whoreKills.maxPercent,
    },
  };
}

/** Both final worths must be written before either rank is read. */
async function writeRanks(
  tx: Prisma.TransactionClient,
  ruleset: Ruleset,
  now: Date,
  sides: ReadonlyArray<readonly [id: string, prior: RoundPlayer, before: Awaited<ReturnType<typeof RankingService.ranksFor>>, after: Awaited<ReturnType<typeof RankingService.ranksFor>>]>,
): Promise<void> {
  for (const [id, priorPlayer, before, after] of sides) {
    await tx.roundPlayer.update({ where: { id }, data: { ...after,
      ...(after.localRank !== priorPlayer.localRank ? { localRankSinceAt: now } : {}),
      ...(after.nationalRank !== priorPlayer.nationalRank ? { nationalRankSinceAt: now } : {}),
      ...(RankingService.isDailySnapshotStale(priorPlayer, now, ruleset) ? { dailyStartingLocalRank: before.localRank, dailyStartingNationalRank: before.nationalRank, dailyRankSnapshotAt: now } : {}),
    } });
  }
}



function cashBand(cashCents: bigint, model: CombatRules): CombatIntelReportDto['cashBand'] {
  const cash = Number(cashCents > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : cashCents);
  const floor = model.loot.protectedCashCents;
  if (cash <= floor) return { label: `$${(floor / 100).toLocaleString()} or less`, minCents: 0, maxCents: floor };
  if (cash <= 25_000_00) return { label: '$5k-$25k', minCents: floor + 1, maxCents: 25_000_00 };
  if (cash <= 100_000_00) return { label: '$25k-$100k', minCents: 25_000_01, maxCents: 100_000_00 };
  return { label: '$100k+', minCents: 100_000_01, maxCents: null };
}

function estimatedMaxLoot(cashCents: bigint, model: CombatRules): number {
  const exposed = cashCents > BigInt(model.loot.protectedCashCents) ? cashCents - BigInt(model.loot.protectedCashCents) : 0n;
  const cashCap = exposed * BigInt(model.loot.exposedCashPercent) / 100n;
  return Number(cashCap > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : cashCap);
}

function estimatedMaxCrackLoot(crack: number, model: CombatRules): number | null {
  const percent = model.loot.exposedDrugPercent ?? 0;
  const carry = model.loot.perFitAttackerCrack ?? 0;
  if (percent <= 0 || carry <= 0) return null;
  return Math.floor(crack * percent / 100);
}

async function consecutiveRepeatTargetHits(prisma: PrismaClient | Prisma.TransactionClient, attackerId: string, defenderId: string): Promise<number> {
  const rows = await prisma.raidBattle.findMany({
    // A drive-by takes nothing, so it neither counts as a repeat nor resets one.
    where: { attackerId, kind: 'RAID' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 10,
    select: { defenderId: true },
  });
  let repeats = 0;
  for (const row of rows) {
    if (row.defenderId !== defenderId) break;
    repeats++;
  }
  return repeats;
}

function intelReport(target: RoundPlayer, model: CombatRules, createdAt: Date, expiresAt: Date): CombatIntelReportDto {
  return {
    targetPublicPimpId: target.publicPimpId,
    displayName: target.displayName,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    fitThugs: fitThugs(target),
    woundedThugs: target.woundedThugs,
    strength: reportStrength(strength(target, model)),
    weapons: { PISTOL: target.pistols, SHOTGUN: target.shotguns, TEK9: target.tek9s, AK47: target.ak47s },
    cashBand: cashBand(target.cashCents, model),
    estimatedMaxLootCents: estimatedMaxLoot(target.cashCents, model),
    crack: model.loot.exposedDrugPercent ? target.crack : null,
    estimatedMaxCrackLoot: estimatedMaxCrackLoot(target.crack, model),
  };
}

async function retaliationTargets(prisma: PrismaClient | Prisma.TransactionClient, playerId: string, targetIds: string[], model: CombatRules, now: Date): Promise<Set<string>> {
  const revengeHours = model.strategy?.retaliation.revengeHours ?? 0;
  if (revengeHours <= 0 || targetIds.length === 0) return new Set();
  const since = new Date(now.getTime() - revengeHours * 3_600_000);
  const rows = await prisma.raidBattle.findMany({
    where: { defenderId: playerId, attackerId: { in: targetIds }, createdAt: { gte: since } },
    select: { attackerId: true },
  });
  return new Set(rows.map((row) => row.attackerId));
}

async function recoveryDto(prisma: PrismaClient, playerId: string, player: RoundPlayer, model: CombatRules): Promise<CombatRecoveryDto> {
  const next = await prisma.combatInjury.findFirst({
    where: { roundPlayerId: playerId },
    orderBy: [{ recoverAt: 'asc' }, { id: 'asc' }],
    select: { recoverAt: true },
  });
  const medicinePerThug = model.wounds.winnerFraction === 0 && model.wounds.loserFraction === 0 ? 0 : 1;
  return {
    fitThugs: fitThugs(player),
    woundedThugs: player.woundedThugs,
    nextRecoveryAt: iso(next?.recoverAt ?? null),
    medicinePerThug,
    maxTreatableThugs: medicinePerThug > 0 ? Math.min(player.woundedThugs, Math.floor(player.medicine / medicinePerThug)) : 0,
  };
}

export const CombatService = {
  async page(prisma: PrismaClient, playerId: string, after = 0, background = false): Promise<CombatPageDto> {
    const settled = await PlayerStateService.settle(prisma, playerId, { markActive: !background });
    const { player, round, ruleset } = settled;
    const now = new Date();
    const base = { roundId: round.id, serverTime: now.toISOString(), targets: [], nextTarget: null };
    if (!ruleset.combat) return { ...base, enabled: false, rules: null, blockedReason: 'Raids are not available in this older economy round. Join the current 0.2.0-D strategy round to use raids, recon and revenge.', protectedUntil: null, cooldownUntil: null, recovery: null };
    const model = ruleset.combat;
    let blockedReason = combatAttackerBlock(player, model, now);
    if (round.status !== 'ACTIVE' || round.startsAt > now || round.endsAt <= now) blockedReason = 'This round is not currently open for raids.';
    const targets = await prisma.roundPlayer.findMany({
      where: { roundId: round.id, cityId: player.cityId, id: { not: playerId }, publicPimpId: { gt: after } },
      orderBy: { publicPimpId: 'asc' }, take: 26,
    });
    const targetIds = targets.slice(0, 25).map((target) => target.id);
    const [revengeIds, intelRows] = await Promise.all([
      retaliationTargets(prisma, playerId, targetIds, model, now),
      model.strategy ? prisma.combatIntel.findMany({
        where: { observerId: playerId, targetId: { in: targetIds }, expiresAt: { gt: now } },
        select: { targetId: true, report: true },
      }) : Promise.resolve([]),
    ]);
    const intelByTarget = new Map(intelRows.map((row) => [row.targetId, row.report as unknown as CombatIntelReportDto]));
    const ownStrength = strength(player, model);
    return {
      ...base, enabled: true, blockedReason,
      protectedUntil: combatProtectionUntil(player, model) > now ? iso(combatProtectionUntil(player, model)) : null,
      cooldownUntil: player.raidCooldownUntil && player.raidCooldownUntil > now ? iso(player.raidCooldownUntil) : null,
      recovery: await recoveryDto(prisma, playerId, player, model),
      rules: { squadCap: model.squadCap, turnCost: model.turnCost, newcomerHours: model.newcomerHours,
        protectionHours: model.protectionHours, cooldownMinutes: model.cooldownMinutes,
        protectedCashCents: model.loot.protectedCashCents, lootPercent: model.loot.exposedCashPercent, perThugLootCents: model.loot.perFitAttackerCents,
        ...(model.loot.exposedDrugPercent && model.loot.perFitAttackerCrack ? { drugLootPercent: model.loot.exposedDrugPercent, perThugCrackLoot: model.loot.perFitAttackerCrack } : {}),
        ...(model.loot.weightedPercent ? {
          minLootPercent: model.loot.weightedPercent.minPercent,
          maxLootPercent: model.loot.weightedPercent.maxPercent,
          weightedLootExponent: model.loot.weightedPercent.exponent,
          repeatLootPenaltyPercent: model.loot.weightedPercent.repeatPenaltyPercent,
          repeatLootFloorPercent: model.loot.weightedPercent.repeatFloorPercent,
        } : {}),
        ...(model.strategy ? { reconTurnCost: model.strategy.intel.turnCost, intelExpiresMinutes: model.strategy.intel.expiresMinutes, retaliationHours: model.strategy.retaliation.revengeHours } : {}),
      },
      targets: targets.slice(0, 25).map((target) => ({
        publicPimpId: target.publicPimpId, displayName: target.displayName,
        netWorthCents: Number(NetWorthService.calculate(target, ruleset)),
        strength: strength(target, model) < ownStrength * (1 - model.strength.variance) ? 'Weaker' : strength(target, model) > ownStrength * (1 + model.strength.variance) ? 'Stronger' : 'Comparable',
        blockedReason: combatTargetBlock(player, target, model, now, revengeIds.has(target.id)),
        protectedUntil: combatProtectionUntil(target, model) > now ? iso(combatProtectionUntil(target, model)) : null,
        ...(model.strategy ? { revengeAvailable: revengeIds.has(target.id), intel: intelByTarget.get(target.id) ?? null } : {}),
        ...(model.driveBy ? { driveByBlockedReason: driveByTargetBlock(player, target, model, now, revengeIds.has(target.id)) } : {}),
      })),
      nextTarget: targets.length > 25 ? targets[24]!.publicPimpId : null,
      ...(model.driveBy ? { driveBy: driveByDto(player, model, model.driveBy, now) } : {}),
    };
  },

  async raid(prisma: PrismaClient, attackerId: string, rawInput: RaidInputDto): Promise<BattleReportDto> {
    const input = raidSchema.parse(rawInput);
    // Resolve only identity before locking. Eligibility and every mutable input are read again below.
    const target = await prisma.roundPlayer.findUnique({ where: { roundId_publicPimpId: { roundId: input.roundId, publicPimpId: input.targetPublicPimpId } }, select: { id: true } });
    if (!target) throw AppError.notFound('TARGET_NOT_FOUND', 'That target is not in this round.');
    if (target.id === attackerId) throw AppError.badRequest('INVALID_TARGET', 'You cannot raid yourself.');

    return prisma.$transaction(async (tx) => {
      // Canonical lock order prevents reciprocal raids from deadlocking.
      for (const id of [attackerId, target.id].sort()) await lockRoundPlayer(tx, id);
      const prior = await tx.raidBattle.findUnique({ where: { attackerId_actionId: { attackerId, actionId: input.actionId } } });
      if (prior) {
        if (prior.kind !== 'RAID' || prior.defenderId !== target.id || prior.attackingThugs !== input.attackingThugs) throw AppError.conflict('ACTION_ID_REUSED', 'That raid id belongs to a different target or squad.');
        return prior.attackerReport as unknown as BattleReportDto;
      }
      // Cross-action IDs are rejected even if the short-lived record has expired.
      const other = await tx.processedAction.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: attackerId, actionId: input.actionId } } });
      if (other) throw AppError.conflict('ACTION_ID_REUSED', 'That request id has already been used.');
      const original = await tx.roundPlayer.findUniqueOrThrow({ where: { id: attackerId }, include: { round: true } });
      if (original.roundId !== input.roundId) throw AppError.badRequest('INVALID_TARGET', 'Pick a player in your round.');
      const { ruleset, model } = modelFor(original.round);
      const now = new Date(); // Taken after the locks; waiting cannot bypass a new shield.
      playable(original.round, now);
      const originalDefender = await tx.roundPlayer.findUniqueOrThrow({ where: { id: target.id } });
      const a = await PlayerStateService.settleInTransaction(tx, attackerId, { now, markActive: true });
      const d = await PlayerStateService.settleInTransaction(tx, target.id, { now, markActive: false });
      const attacker = a.player;
      const defender = d.player;
      const retaliation = (await retaliationTargets(tx, attackerId, [target.id], model, now)).has(target.id);
      const blocked = combatAttackerBlock(attacker, model, now) ?? combatTargetBlock(attacker, defender, model, now, retaliation);
      if (blocked) throw AppError.conflict('RAID_BLOCKED', blocked);
      if (input.attackingThugs > Math.min(fitThugs(attacker), model.squadCap)) throw AppError.badRequest('INVALID_SQUAD', 'Your squad exceeds your fit crew or the raid limit.');
      const beforeA = await RankingService.ranksFor(tx, attacker);
      const beforeD = await RankingService.ranksFor(tx, defender);
      const repeatTargetHits = await consecutiveRepeatTargetHits(tx, attackerId, target.id);
      const result = simulateRaid({ attacker: crew(attacker), defender: crew(defender), attackingThugs: input.attackingThugs,
        attackerTurns: attacker.turns, defenderCashCents: defender.cashCents, defenderCrack: defender.crack, repeatTargetHits }, model, () => randomInt(0, 2 ** 32) / 2 ** 32);
      const nextA = { ...toState(attacker), woundedThugs: attacker.woundedThugs + result.wounds.attacker,
        turns: result.attackerTurnsAfter, cashCents: attacker.cashCents + result.lootCents, crack: attacker.crack + result.lootCrack };
      const nextD = { ...toState(defender), woundedThugs: defender.woundedThugs + result.wounds.defender,
        cashCents: result.defenderCashAfterCents, crack: result.defenderCrackAfter };
      assertPlayerState(nextA, ruleset);
      assertPlayerState(nextD, ruleset);
      const happinessA = HappinessService.recalculate({ ...nextA, thugs: fitThugs(nextA) }, ruleset);
      const happinessD = HappinessService.recalculate({ ...nextD, thugs: fitThugs(nextD) }, ruleset);
      const shield = new Date(now.getTime() + model.protectionHours * 3_600_000);
      const cooldown = new Date(now.getTime() + model.cooldownMinutes * 60_000);
      const recoverAt = new Date(now.getTime() + model.wounds.recoveryMinutes * 60_000);
      await tx.roundPlayer.update({ where: { id: attackerId }, data: { cashCents: nextA.cashCents, turns: nextA.turns,
        crack: nextA.crack, woundedThugs: nextA.woundedThugs, whoreHappiness: happinessA.whoreHappiness, thugHappiness: happinessA.thugHappiness,
        netWorthCents: NetWorthService.calculate(nextA, ruleset), raidCooldownUntil: cooldown } });
      await tx.roundPlayer.update({ where: { id: target.id }, data: { cashCents: nextD.cashCents, crack: nextD.crack, woundedThugs: nextD.woundedThugs,
        whoreHappiness: happinessD.whoreHappiness, thugHappiness: happinessD.thugHappiness,
        netWorthCents: NetWorthService.calculate(nextD, ruleset), raidProtectedUntil: shield, lastRaidedAt: now } });
      // Both final worths are in the transaction before either rank is calculated.
      const afterA = await RankingService.ranksFor(tx, { ...attacker, netWorthCents: NetWorthService.calculate(nextA, ruleset) });
      const afterD = await RankingService.ranksFor(tx, { ...defender, netWorthCents: NetWorthService.calculate(nextD, ruleset) });
      await writeRanks(tx, ruleset, now, [[attackerId, original, beforeA, afterA], [target.id, originalDefender, beforeD, afterD]]);
      const id = randomUUID();
      const makeReport = (isAttacker: boolean): BattleReportDto => {
        const own = isAttacker ? result.attacker : result.defender;
        const opponent = isAttacker ? defender : attacker;
        const ownWounds = isAttacker ? result.wounds.attacker : result.wounds.defender;
        const opponentWounds = isAttacker ? result.wounds.defender : result.wounds.attacker;
        return { id, kind: 'RAID', createdAt: now.toISOString(), modelVersion: model.version,
          role: isAttacker ? 'ATTACKER' : 'DEFENDER', won: isAttacker === (result.winner === 'ATTACKER'),
          opponent: { publicPimpId: opponent.publicPimpId, displayName: opponent.displayName },
          yourSquad: own.committed, opponentSquad: (isAttacker ? result.defender : result.attacker).committed,
          yourEquipment: own.equipment, yourStrength: reportStrength(isAttacker ? result.effectiveStrength.attacker : result.effectiveStrength.defender),
          opponentStrength: reportStrength(isAttacker ? result.effectiveStrength.defender : result.effectiveStrength.attacker),
          yourWounds: ownWounds, opponentWounds,
          woundedThugsAfter: isAttacker ? nextA.woundedThugs : nextD.woundedThugs,
          nextRecoveryAt: ownWounds > 0 ? recoverAt.toISOString() : null,
          cashChangeCents: Number(isAttacker ? result.lootCents : -result.lootCents),
          cashAfterCents: Number(isAttacker ? nextA.cashCents : nextD.cashCents),
          crackChange: isAttacker ? result.lootCrack : -result.lootCrack,
          crackAfter: isAttacker ? nextA.crack : nextD.crack,
          lootPercent: result.lootPercent,
          baseLootPercent: result.baseLootPercent,
          repeatTargetHits: result.repeatTargetHits,
          repeatLootMultiplierPercent: result.repeatLootMultiplierPercent,
          turnsSpent: isAttacker ? model.turnCost : 0, turnsAfter: isAttacker ? nextA.turns : nextD.turns,
          nationalRankBefore: (isAttacker ? beforeA : beforeD).nationalRank,
          nationalRankAfter: (isAttacker ? afterA : afterD).nationalRank,
          protectedUntil: isAttacker ? null : shield.toISOString(), cooldownUntil: isAttacker ? cooldown.toISOString() : iso(defender.raidCooldownUntil),
          retaliation: isAttacker ? retaliation : false,
        };
      };
      const attackerReport = makeReport(true);
      const defenderReport = makeReport(false);
      await tx.raidBattle.create({ data: { id, attackerId, defenderId: target.id, actionId: input.actionId,
        attackingThugs: input.attackingThugs, modelVersion: model.version,
        calculation: json({ result, input: { attacker: crew(attacker), defender: crew(defender), defenderCashCents: defender.cashCents, defenderCrack: defender.crack }, retaliation, rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version }),
        attackerReport: json(attackerReport), defenderReport: json(defenderReport), createdAt: now } });
      await CombatRecoveryService.add(tx, attackerId, id, result.wounds.attacker, recoverAt);
      await CombatRecoveryService.add(tx, target.id, id, result.wounds.defender, recoverAt);
      for (const [playerId, type, report] of [[attackerId, 'RAID_ATTACK', attackerReport], [target.id, 'RAID_DEFENSE', defenderReport]] as const) {
        await ActivityService.log(tx, playerId, type, json({ battleId: id, opponent: report.opponent.displayName, won: report.won, cashCents: report.cashChangeCents, crack: report.crackChange ?? 0, turns: report.turnsSpent, wounds: report.yourWounds }));
      }
      // Reserve the action namespace for the lifetime of this raid, including other action types.
      await tx.processedAction.create({ data: { roundPlayerId: attackerId, actionId: input.actionId, action: 'RAID', result: json(attackerReport), expiresAt: new Date('9999-12-31T00:00:00Z') } });
      return attackerReport;
    }, { timeout: 15_000, maxWait: 10_000 });
  },

  /**
   * A drive-by: the same two-player transaction as a raid, but it takes
   * nothing. It wounds the target's crew, kills some of their whores, and can
   * cost the shooter a car whose whole crew went down.
   */
  async driveBy(prisma: PrismaClient, attackerId: string, rawInput: DriveByInputDto): Promise<BattleReportDto> {
    const input = driveBySchema.parse(rawInput);
    const target = await prisma.roundPlayer.findUnique({ where: { roundId_publicPimpId: { roundId: input.roundId, publicPimpId: input.targetPublicPimpId } }, select: { id: true } });
    if (!target) throw AppError.notFound('TARGET_NOT_FOUND', 'That target is not in this round.');
    if (target.id === attackerId) throw AppError.badRequest('INVALID_TARGET', 'You cannot hit your own block.');

    return prisma.$transaction(async (tx) => {
      for (const id of [attackerId, target.id].sort()) await lockRoundPlayer(tx, id);
      const prior = await tx.raidBattle.findUnique({ where: { attackerId_actionId: { attackerId, actionId: input.actionId } } });
      if (prior) {
        if (prior.kind !== 'DRIVE_BY' || prior.defenderId !== target.id || prior.attackingThugs !== input.attackingThugs) throw AppError.conflict('ACTION_ID_REUSED', 'That drive-by id belongs to a different target or squad.');
        return prior.attackerReport as unknown as BattleReportDto;
      }
      const other = await tx.processedAction.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: attackerId, actionId: input.actionId } } });
      if (other) throw AppError.conflict('ACTION_ID_REUSED', 'That request id has already been used.');
      const original = await tx.roundPlayer.findUniqueOrThrow({ where: { id: attackerId }, include: { round: true } });
      if (original.roundId !== input.roundId) throw AppError.badRequest('INVALID_TARGET', 'Pick a player in your round.');
      const { ruleset, model } = modelFor(original.round);
      const rules = model.driveBy;
      if (!rules) throw AppError.conflict('DRIVE_BY_DISABLED', 'Drive-bys are not available in this round.');
      const now = new Date();
      playable(original.round, now);
      const originalDefender = await tx.roundPlayer.findUniqueOrThrow({ where: { id: target.id } });
      const attacker = (await PlayerStateService.settleInTransaction(tx, attackerId, { now, markActive: true })).player;
      const defender = (await PlayerStateService.settleInTransaction(tx, target.id, { now, markActive: false })).player;
      const retaliation = (await retaliationTargets(tx, attackerId, [target.id], model, now)).has(target.id);
      const blocked = driveByAttackerBlock(attacker, model, rules, now) ?? driveByTargetBlock(attacker, defender, model, now, retaliation);
      if (blocked) throw AppError.conflict('DRIVE_BY_BLOCKED', blocked);
      const seats = driveByMaxShooters(fitThugs(attacker), attacker.lowRiders, model, rules);
      if (input.attackingThugs > seats) throw AppError.badRequest('INVALID_SQUAD', `Your cars and fit crew can take ${seats} shooters.`);

      const beforeA = await RankingService.ranksFor(tx, attacker);
      const beforeD = await RankingService.ranksFor(tx, defender);
      const result = simulateDriveBy({ attacker: crew(attacker), defender: crew(defender), shooters: input.attackingThugs,
        lowRiders: attacker.lowRiders, attackerTurns: attacker.turns, defenderWhores: defender.whores }, model, rules, () => randomInt(0, 2 ** 32) / 2 ** 32);
      const nextA = { ...toState(attacker), woundedThugs: attacker.woundedThugs + result.wounds.attacker, turns: result.attackerTurnsAfter,
        lowRiders: result.lowRidersAfter, driveBysDone: attacker.driveBysDone + 1 };
      const nextD = { ...toState(defender), woundedThugs: defender.woundedThugs + result.wounds.defender, whores: result.defenderWhoresAfter };
      assertPlayerState(nextA, ruleset);
      assertPlayerState(nextD, ruleset);
      const happinessA = HappinessService.recalculate({ ...nextA, thugs: fitThugs(nextA) }, ruleset);
      const happinessD = HappinessService.recalculate({ ...nextD, thugs: fitThugs(nextD) }, ruleset);
      const shield = new Date(now.getTime() + rules.protectionHours * 3_600_000);
      const cooldown = new Date(now.getTime() + rules.cooldownMinutes * 60_000);
      const recoverAt = new Date(now.getTime() + model.wounds.recoveryMinutes * 60_000);
      await tx.roundPlayer.update({ where: { id: attackerId }, data: { turns: nextA.turns, woundedThugs: nextA.woundedThugs,
        lowRiders: nextA.lowRiders, driveBysDone: nextA.driveBysDone,
        whoreHappiness: happinessA.whoreHappiness, thugHappiness: happinessA.thugHappiness,
        netWorthCents: NetWorthService.calculate(nextA, ruleset), driveByCooldownUntil: cooldown } });
      await tx.roundPlayer.update({ where: { id: target.id }, data: { woundedThugs: nextD.woundedThugs, whores: nextD.whores,
        whoreHappiness: happinessD.whoreHappiness, thugHappiness: happinessD.thugHappiness,
        netWorthCents: NetWorthService.calculate(nextD, ruleset), driveByProtectedUntil: shield, lastDrivenByAt: now } });
      const afterA = await RankingService.ranksFor(tx, { ...attacker, netWorthCents: NetWorthService.calculate(nextA, ruleset) });
      const afterD = await RankingService.ranksFor(tx, { ...defender, netWorthCents: NetWorthService.calculate(nextD, ruleset) });
      await writeRanks(tx, ruleset, now, [[attackerId, original, beforeA, afterA], [target.id, originalDefender, beforeD, afterD]]);

      const id = randomUUID();
      const makeReport = (isAttacker: boolean): BattleReportDto => {
        const own = isAttacker ? result.attacker : result.defender;
        const opponent = isAttacker ? defender : attacker;
        const ownWounds = isAttacker ? result.wounds.attacker : result.wounds.defender;
        return { id, kind: 'DRIVE_BY', createdAt: now.toISOString(), modelVersion: model.version,
          role: isAttacker ? 'ATTACKER' : 'DEFENDER', won: isAttacker === (result.winner === 'ATTACKER'),
          opponent: { publicPimpId: opponent.publicPimpId, displayName: opponent.displayName },
          yourSquad: own.committed, opponentSquad: (isAttacker ? result.defender : result.attacker).committed,
          yourEquipment: own.equipment, yourStrength: reportStrength(isAttacker ? result.effectiveStrength.attacker : result.effectiveStrength.defender),
          opponentStrength: reportStrength(isAttacker ? result.effectiveStrength.defender : result.effectiveStrength.attacker),
          yourWounds: ownWounds, opponentWounds: isAttacker ? result.wounds.defender : result.wounds.attacker,
          woundedThugsAfter: isAttacker ? nextA.woundedThugs : nextD.woundedThugs,
          nextRecoveryAt: ownWounds > 0 ? recoverAt.toISOString() : null,
          cashChangeCents: 0,
          cashAfterCents: Number(isAttacker ? nextA.cashCents : nextD.cashCents),
          turnsSpent: isAttacker ? rules.turnCost : 0, turnsAfter: isAttacker ? nextA.turns : nextD.turns,
          nationalRankBefore: (isAttacker ? beforeA : beforeD).nationalRank,
          nationalRankAfter: (isAttacker ? afterA : afterD).nationalRank,
          protectedUntil: isAttacker ? null : shield.toISOString(),
          cooldownUntil: isAttacker ? cooldown.toISOString() : iso(defender.driveByCooldownUntil),
          retaliation: isAttacker ? retaliation : false,
          driveBy: isAttacker
            ? { whoresKilled: result.whoresKilled, carsSent: result.cars.length, lowRidersLost: result.lowRidersLost, lowRidersAfter: nextA.lowRiders }
            : { whoresKilled: result.whoresKilled, whoresAfter: nextD.whores },
        };
      };
      const attackerReport = makeReport(true);
      const defenderReport = makeReport(false);
      await tx.raidBattle.create({ data: { id, kind: 'DRIVE_BY', attackerId, defenderId: target.id, actionId: input.actionId,
        attackingThugs: input.attackingThugs, modelVersion: model.version,
        calculation: json({ result, input: { attacker: crew(attacker), defender: crew(defender), lowRiders: attacker.lowRiders, defenderWhores: defender.whores }, retaliation, rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version }),
        attackerReport: json(attackerReport), defenderReport: json(defenderReport), createdAt: now } });
      await CombatRecoveryService.add(tx, attackerId, id, result.wounds.attacker, recoverAt);
      await CombatRecoveryService.add(tx, target.id, id, result.wounds.defender, recoverAt);
      for (const [playerId, type, report] of [[attackerId, 'DRIVE_BY_ATTACK', attackerReport], [target.id, 'DRIVE_BY_DEFENSE', defenderReport]] as const) {
        await ActivityService.log(tx, playerId, type, json({ battleId: id, opponent: report.opponent.displayName, won: report.won,
          wounds: report.yourWounds, opponentWounds: report.opponentWounds, whoresKilled: result.whoresKilled,
          lowRidersLost: type === 'DRIVE_BY_ATTACK' ? result.lowRidersLost : 0, turns: report.turnsSpent }));
      }
      await tx.processedAction.create({ data: { roundPlayerId: attackerId, actionId: input.actionId, action: 'DRIVE_BY', result: json(attackerReport), expiresAt: new Date('9999-12-31T00:00:00Z') } });
      return attackerReport;
    }, { timeout: 15_000, maxWait: 10_000 });
  },

  async recon(prisma: PrismaClient, playerId: string, rawInput: CombatReconInputDto): Promise<CombatReconResultDto> {
    const input = combatReconSchema.parse(rawInput);
    const target = await prisma.roundPlayer.findUnique({
      where: { roundId_publicPimpId: { roundId: input.roundId, publicPimpId: input.targetPublicPimpId } },
      select: { id: true },
    });
    if (!target) throw AppError.notFound('TARGET_NOT_FOUND', 'That target is not in this round.');
    if (target.id === playerId) throw AppError.badRequest('INVALID_TARGET', 'You cannot recon yourself.');

    return prisma.$transaction(async (tx) => {
      for (const id of [playerId, target.id].sort()) await lockRoundPlayer(tx, id);
      const replay = await tx.processedAction.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } } });
      if (replay) {
        if (replay.action !== 'COMBAT_RECON') throw AppError.conflict('ACTION_ID_REUSED', 'That request id has already been used.');
        return replay.result as unknown as CombatReconResultDto;
      }

      const original = await tx.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, include: { round: true } });
      if (original.roundId !== input.roundId) throw AppError.badRequest('INVALID_TARGET', 'Pick a player in your round.');
      const { model } = modelFor(original.round);
      if (!model.strategy) throw AppError.conflict('STRATEGY_DISABLED', 'Recon is not available in this round.');
      const now = new Date();
      playable(original.round, now);
      const settled = await PlayerStateService.settleInTransaction(tx, playerId, { now, markActive: true });
      const targetSettled = await PlayerStateService.settleInTransaction(tx, target.id, { now, markActive: false });
      const observer = settled.player;
      const defender = targetSettled.player;
      if (observer.roundId !== defender.roundId) throw AppError.badRequest('INVALID_TARGET', 'Pick a player in your round.');
      if (observer.cityId !== defender.cityId) throw AppError.conflict('RECON_BLOCKED', 'You can only recon players in your city.');
      const turnCost = model.strategy.intel.turnCost;
      if (observer.turns < turnCost) throw AppError.conflict('NOT_ENOUGH_TURNS', `You need ${turnCost} turns to recon.`);

      const turnsAfter = observer.turns - turnCost;
      const expiresAt = new Date(now.getTime() + model.strategy.intel.expiresMinutes * 60_000);
      const report = intelReport(defender, model, now, expiresAt);
      const result: CombatReconResultDto = { intel: report, turnsSpent: turnCost, turnsAfter };

      await tx.roundPlayer.update({ where: { id: playerId }, data: { turns: turnsAfter, lastActiveAt: now } });
      await tx.combatIntel.upsert({
        where: { observerId_targetId: { observerId: playerId, targetId: target.id } },
        create: { observerId: playerId, targetId: target.id, report: json(report), expiresAt },
        update: { report: json(report), expiresAt },
      });
      await ActivityService.log(tx, playerId, 'COMBAT_RECON', json({ target: defender.displayName, targetPublicPimpId: defender.publicPimpId, turns: turnCost, expiresAt: expiresAt.toISOString() }));
      await tx.processedAction.create({ data: { roundPlayerId: playerId, actionId: input.actionId, action: 'COMBAT_RECON', result: json(result), expiresAt: new Date('9999-12-31T00:00:00Z') } });
      return result;
    }, { timeout: 15_000, maxWait: 10_000 });
  },

  async treat(prisma: PrismaClient, playerId: string, rawInput: CombatTreatmentInputDto): Promise<CombatTreatmentDto> {
    const input = combatTreatmentSchema.parse(rawInput);
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, playerId);
      const replay = await tx.processedAction.findUnique({ where: { roundPlayerId_actionId: { roundPlayerId: playerId, actionId: input.actionId } } });
      if (replay) {
        if (replay.action !== 'COMBAT_TREATMENT') throw AppError.conflict('ACTION_ID_REUSED', 'That request id has already been used.');
        return replay.result as unknown as CombatTreatmentDto;
      }
      const now = new Date();
      const settled = await PlayerStateService.settleInTransaction(tx, playerId, { now, markActive: true });
      if (settled.round.id !== input.roundId) throw AppError.badRequest('INVALID_TARGET', 'Pick your current round.');
      const model = settled.ruleset.combat;
      if (!model) throw AppError.conflict('COMBAT_DISABLED', 'Recovery is not available in this round.');
      playable(settled.round, now);
      const medicinePerThug = 1;
      const treatment = await CombatRecoveryService.treat(tx, playerId, input.thugs, settled.player.medicine, medicinePerThug);
      const next = { ...toState(settled.player), woundedThugs: treatment.woundedThugs, medicine: settled.player.medicine - treatment.medicineUsed };
      assertPlayerState(next, settled.ruleset);
      const happiness = HappinessService.recalculate({ ...next, thugs: fitThugs(next) }, settled.ruleset);
      await tx.roundPlayer.update({
        where: { id: playerId },
        data: {
          woundedThugs: next.woundedThugs,
          medicine: next.medicine,
          netWorthCents: NetWorthService.calculate(next, settled.ruleset),
          thugHappiness: happiness.thugHappiness,
          whoreHappiness: happiness.whoreHappiness,
        },
      });
      const result: CombatTreatmentDto = {
        treatedThugs: treatment.treatedThugs,
        medicineUsed: treatment.medicineUsed,
        woundedThugs: treatment.woundedThugs,
        nextRecoveryAt: iso(treatment.nextRecoveryAt),
      };
      await ActivityService.log(tx, playerId, 'COMBAT_TREATMENT', json(result));
      await tx.processedAction.create({ data: { roundPlayerId: playerId, actionId: input.actionId, action: 'COMBAT_TREATMENT', result: json(result), expiresAt: new Date('9999-12-31T00:00:00Z') } });
      return result;
    });
  },

  async reports(prisma: PrismaClient, playerId: string, before?: string): Promise<{ reports: BattleReportDto[]; nextBefore: string | null }> {
    const participation = { OR: [{ attackerId: playerId }, { defenderId: playerId }] };
    const cursor = before ? await prisma.raidBattle.findFirst({ where: { id: before, ...participation } }) : null;
    if (before && !cursor) throw AppError.notFound('REPORT_NOT_FOUND', 'That battle report is not available.');
    const rows = await prisma.raidBattle.findMany({
      where: { AND: [participation, ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] : [])] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 26,
    });
    return { reports: rows.slice(0, 25).map((row) => (row.attackerId === playerId ? row.attackerReport : row.defenderReport) as unknown as BattleReportDto),
      nextBefore: rows.length > 25 ? rows[24]!.id : null };
  },
};
