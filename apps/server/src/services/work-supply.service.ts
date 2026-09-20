import type { PrismaClient } from '@prisma/client';
import {
  CONVOY_JOB,
  CORNER_JOB,
  COOK_JOB,
  DEFENSE_JOB,
  PRODUCE_JOB,
  RAID_JOB,
  defaultWorkSupplyPolicy,
  happinessMultiplier,
  heatTakeMultiplier,
  loadRulesetForRound,
  productEconomy,
  productRecipes,
  planWorkSupply,
  productSliceEffects,
  workSupplyStatus,
  type Ruleset,
  type WorkSupplyPlan,
  type WorkSupplyPolicy,
  type WorkSupplyRole,
} from '@streets/rules-engine';
import { workSupplyPolicySchema, type WorkSupplyDto, type WorkSupplyPlanDto, type WorkSupplyPreviewDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { fitThugs } from './action.service.js';
import { PlayerStateService } from './player-state.service.js';
import { CRACK, ProductInventoryService, productKeys } from './product-inventory.service.js';

/**
 * Jobs a round has: every district, the Produce shift, (0.4.0-C) the thugs cooking, and
 * (0.4.0-E) the squad sent into a fight and the crew defending, (0.5.0-E) a run's
 * escorts, who burn from the run's trunk, and (0.6.0-B) corner crews. Fight jobs are opt-in:
 * with no saved policy they burn nothing.
 */
export function workSupplyJobs(ruleset: Ruleset): Array<{ key: string; name: string; role: WorkSupplyRole; optIn: boolean }> {
  return [
    ...Object.entries(ruleset.districts).map(([key, district]) => ({ key, name: district.name, role: 'hoes' as const, optIn: false })),
    { key: PRODUCE_JOB, name: 'Produce shift', role: 'hoes' as const, optIn: false },
    ...(ruleset.workSupply?.productPerThugPerTurn ? [{ key: COOK_JOB, name: 'Production thugs', role: 'thugs' as const, optIn: false }] : []),
    ...(ruleset.combatSupply ? [
      { key: RAID_JOB, name: 'Squads you send', role: 'fighters' as const, optIn: true },
      { key: DEFENSE_JOB, name: 'Crew defending your block', role: 'fighters' as const, optIn: true },
    ] : []),
    // 0.5.0-E: escorts burn from their own trunk when a run is hit.
    ...(ruleset.combatSupply && ruleset.travel?.convoys ? [{ key: CONVOY_JOB, name: 'Escorts on a run', role: 'fighters' as const, optIn: true }] : []),
    ...(ruleset.turf ? [{ key: CORNER_JOB, name: 'Corner crews', role: 'thugs' as const, optIn: false }] : []),
  ];
}

function requireWorkSupply(ruleset: Ruleset): void {
  if (!ruleset.workSupply || !ruleset.products) {
    throw AppError.conflict('WORK_SUPPLY_DISABLED', 'Supply choices are not part of this round.');
  }
}

async function loadPolicies(db: Db | PrismaClient, roundPlayerId: string): Promise<Map<string, WorkSupplyPolicy>> {
  const rows = await db.workSupplyPolicy.findMany({ where: { roundPlayerId } });
  return new Map(rows.map((row) => [row.job, { primary: row.primary, fallback: row.fallback, emergency: row.emergency, strict: row.strict }]));
}

export function toPlanDto(plan: WorkSupplyPlan, ruleset: Ruleset): WorkSupplyPlanDto {
  const name = (key: string | null) => (key ? ruleset.products?.[key]?.name ?? key : null);
  return {
    job: plan.job,
    role: plan.role,
    policy: plan.policy,
    need: plan.need,
    perTurn: plan.perTurn,
    takeMultiplier: plan.takeMultiplier,
    recruitmentMultiplier: plan.recruitmentMultiplier,
    departureMultiplier: plan.departureMultiplier,
    morale: plan.morale,
    woundMultiplier: plan.woundMultiplier,
    heat: plan.heat,
    switchesAtTurn: plan.switchesAtTurn,
    consumed: plan.consumed,
    slices: plan.slices.map((slice) => ({ ...slice, productName: name(slice.product) })),
  };
}

/**
 * 0.4.0-B. Per-job product policies, the plan a trip will follow, and applying
 * that plan's product use inside the action's locked transaction.
 */
export const WorkSupplyService = {
  /**
   * The plan for a trip, read in the caller's transaction. Crack comes from `crack`, the settled
   * column value less anything an earlier plan in the same action already burned.
   */
  async plan(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset, input: { job: string; role?: WorkSupplyRole; workers: number; turns: number; crack: number }): Promise<WorkSupplyPlan> {
    const [policies, inventory] = await Promise.all([
      loadPolicies(db, roundPlayerId),
      ProductInventoryService.read(db, roundPlayerId, ruleset),
    ]);
    return planWorkSupply({
      job: input.job,
      role: input.role,
      workers: input.workers,
      turns: input.turns,
      policy: policies.get(input.job) ?? defaultWorkSupplyPolicy(),
      inventory: { ...inventory, [CRACK]: input.crack },
      ruleset,
    });
  },

  /**
   * Take the plan's non-crack products out of stock. Crack is left to the
   * action's `next` state, which the pipeline writes to the crack column.
   */
  async consume(tx: Db, roundPlayerId: string, ruleset: Ruleset, plan: WorkSupplyPlan): Promise<void> {
    const changes = Object.fromEntries(Object.entries(plan.consumed).filter(([key]) => key !== CRACK).map(([key, units]) => [key, -units]));
    if (Object.keys(changes).length) await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, changes);
  },

  /** Everything the supply screen needs: jobs, policies, products and stock. */
  async overview(prisma: PrismaClient, roundPlayerId: string): Promise<WorkSupplyDto> {
    const player = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, include: { round: true } });
    const ruleset = loadRulesetForRound(player.round);
    if (!ruleset.workSupply || !ruleset.products) return { enabled: false, jobs: [], products: [] };
    const [policies, inventory] = await Promise.all([loadPolicies(prisma, roundPlayerId), ProductInventoryService.read(prisma, roundPlayerId, ruleset)]);
    // Crack is always Pip's Product and always cooks; the rest only once the round has a product economy.
    const economyOn = Boolean(ruleset.productEconomy);
    const cookable = new Set(productRecipes(ruleset).map((recipe) => recipe.product));
    return {
      enabled: true,
      products: productKeys(ruleset).map((key) => ({
        key, name: ruleset.products![key]!.name, quantity: inventory[key] ?? 0,
        pip: key === CRACK || (economyOn && Boolean(productEconomy(ruleset, key)?.pip)),
        cookable: key === CRACK || (economyOn && cookable.has(key)),
      })),
      jobs: workSupplyJobs(ruleset).map((job) => ({ ...job, policy: policies.get(job.key) ?? defaultWorkSupplyPolicy(), isDefault: !policies.has(job.key), active: !job.optIn || policies.has(job.key) })),
    };
  },

  async setPolicy(prisma: PrismaClient, roundPlayerId: string, rawInput: unknown): Promise<WorkSupplyDto> {
    const input = workSupplyPolicySchema.parse(rawInput);
    const player = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, include: { round: true } });
    const ruleset = loadRulesetForRound(player.round);
    requireWorkSupply(ruleset);
    if (!workSupplyJobs(ruleset).some((job) => job.key === input.job)) throw AppError.badRequest('UNKNOWN_JOB', 'That is not a job you can supply.');
    const known = productKeys(ruleset);
    for (const key of [input.primary, input.fallback, input.emergency]) {
      if (key && !known.includes(key)) throw AppError.badRequest('UNKNOWN_PRODUCT', 'That product is not part of this round.');
    }
    const data = { primary: input.primary, fallback: input.fallback ?? null, emergency: input.emergency ?? null, strict: input.strict ?? false };
    await prisma.workSupplyPolicy.upsert({
      where: { roundPlayerId_job: { roundPlayerId, job: input.job } },
      create: { roundPlayerId, job: input.job, ...data },
      update: data,
    });
    return WorkSupplyService.overview(prisma, roundPlayerId);
  },

  /** Forget a job's policy: districts go back to crack only, fight jobs stop burning anything. */
  async clearPolicy(prisma: PrismaClient, roundPlayerId: string, job: string): Promise<WorkSupplyDto> {
    const player = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, include: { round: true } });
    const ruleset = loadRulesetForRound(player.round);
    requireWorkSupply(ruleset);
    if (!workSupplyJobs(ruleset).some((candidate) => candidate.key === job)) throw AppError.badRequest('UNKNOWN_JOB', 'That is not a job you can supply.');
    await prisma.workSupplyPolicy.deleteMany({ where: { roundPlayerId, job } });
    return WorkSupplyService.overview(prisma, roundPlayerId);
  },

  /**
   * What a trip of `turns` would burn and pay, from settled state, before the
   * player clicks. It runs the same plan the action runs, so it matches the
   * result unless stock or crew change in between.
   */
  async preview(prisma: PrismaClient, roundPlayerId: string, job: string, turns: number): Promise<WorkSupplyPreviewDto> {
    const settled = await PlayerStateService.settle(prisma, roundPlayerId, { markActive: false });
    const inventory: Record<string, number> = { ...(await ProductInventoryService.read(prisma, roundPlayerId, settled.ruleset)), [CRACK]: settled.player.crack };
    const withStatus = (plan: WorkSupplyPlan, workers: number, available = inventory): WorkSupplyPreviewDto => {
      let estimatedLossCents: number | null = null;
      if (plan.role === 'hoes') {
        // What the girls would bring home at your cut, if the whole trip ran on the primary.
        const ruleset = settled.ruleset;
        const district = ruleset.scouting.districts[(job === PRODUCE_JOB ? ruleset.scouting.produceDistrict : job) as keyof typeof ruleset.scouting.districts];
        const full = productSliceEffects(ruleset, plan.policy.primary, 'hoes', job).takeMultiplier;
        const base = workers * ruleset.scouting.grossPerWhorePerTurnCents * turns
          * happinessMultiplier(settled.player.whoreHappiness, ruleset.scouting.minHappinessMultiplier)
          * (district?.payMultiplier ?? 1) * (job === PRODUCE_JOB ? ruleset.production.unsupervisedTakeMultiplier : 1)
          * heatTakeMultiplier(settled.player.heat, ruleset) * (100 - settled.player.payoutPercent) / 100;
        estimatedLossCents = Math.max(0, Math.round(base * (full - plan.takeMultiplier)));
      }
      return { ...toPlanDto(plan, settled.ruleset), status: { ...workSupplyStatus(plan, available, workers), estimatedLossCents } };
    };
    requireWorkSupply(settled.ruleset);
    const found = workSupplyJobs(settled.ruleset).find((candidate) => candidate.key === job);
    if (!found) throw AppError.badRequest('UNKNOWN_JOB', 'That is not a job you can supply.');
    // A fight burns once for the whole squad; the preview assumes your largest one.
    if (found.role === 'fighters') {
      const cap = settled.ruleset.combat?.squadCap ?? fitThugs(settled.player);
      const squad = Math.min(fitThugs(settled.player), cap);
      const plan = await WorkSupplyService.plan(prisma, roundPlayerId, settled.ruleset, { job, role: 'fighters', workers: squad, turns: 1, crack: settled.player.crack });
      return withStatus(plan, squad);
    }
    const workers = found.role === 'thugs' ? fitThugs(settled.player) : settled.player.whores;
    const crack = settled.player.crack;
    // Cooks are supplied after the girls' Produce shift, from what that shift leaves.
    if (job === COOK_JOB) {
      const shift = await WorkSupplyService.plan(prisma, roundPlayerId, settled.ruleset, { job: PRODUCE_JOB, workers: settled.player.whores, turns, crack });
      const left = Object.fromEntries(Object.entries(inventory).map(([key, quantity]) => [key, quantity - (shift.consumed[key] ?? 0)]));
      const cook = planWorkSupply({
        job, role: 'thugs', workers, turns, ruleset: settled.ruleset,
        policy: (await loadPolicies(prisma, roundPlayerId)).get(job) ?? defaultWorkSupplyPolicy(),
        inventory: left,
      });
      return withStatus(cook, workers, left);
    }
    const plan = await WorkSupplyService.plan(prisma, roundPlayerId, settled.ruleset, { job, role: found.role, workers, turns, crack });
    return withStatus(plan, workers);
  },
};
