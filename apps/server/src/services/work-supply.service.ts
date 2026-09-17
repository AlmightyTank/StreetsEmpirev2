import type { PrismaClient } from '@prisma/client';
import {
  COOK_JOB,
  PRODUCE_JOB,
  defaultWorkSupplyPolicy,
  loadRulesetForRound,
  planWorkSupply,
  type Ruleset,
  type WorkSupplyPlan,
  type WorkSupplyPolicy,
  type WorkSupplyRole,
} from '@streets/rules-engine';
import { workSupplyPolicySchema, type WorkSupplyDto, type WorkSupplyPlanDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { fitThugs } from './action.service.js';
import { PlayerStateService } from './player-state.service.js';
import { CRACK, ProductInventoryService, productKeys } from './product-inventory.service.js';

/** Jobs a round has: every district, the Produce shift, and (0.4.0-C) the thugs cooking. */
export function workSupplyJobs(ruleset: Ruleset): Array<{ key: string; name: string; role: WorkSupplyRole }> {
  return [
    ...Object.entries(ruleset.districts).map(([key, district]) => ({ key, name: district.name, role: 'hoes' as const })),
    { key: PRODUCE_JOB, name: 'Produce Product shift', role: 'hoes' as const },
    ...(ruleset.workSupply?.productPerThugPerTurn ? [{ key: COOK_JOB, name: 'Production thugs', role: 'thugs' as const }] : []),
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
    return {
      enabled: true,
      products: productKeys(ruleset).map((key) => ({ key, name: ruleset.products![key]!.name, quantity: inventory[key] ?? 0 })),
      jobs: workSupplyJobs(ruleset).map((job) => ({ ...job, policy: policies.get(job.key) ?? defaultWorkSupplyPolicy(), isDefault: !policies.has(job.key) })),
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

  /**
   * What a trip of `turns` would burn and pay, from settled state, before the
   * player clicks. It runs the same plan the action runs, so it matches the
   * result unless stock or crew change in between.
   */
  async preview(prisma: PrismaClient, roundPlayerId: string, job: string, turns: number): Promise<WorkSupplyPlanDto> {
    const settled = await PlayerStateService.settle(prisma, roundPlayerId, { markActive: false });
    requireWorkSupply(settled.ruleset);
    const found = workSupplyJobs(settled.ruleset).find((candidate) => candidate.key === job);
    if (!found) throw AppError.badRequest('UNKNOWN_JOB', 'That is not a job you can supply.');
    const workers = found.role === 'thugs' ? fitThugs(settled.player) : settled.player.whores;
    const crack = settled.player.crack;
    // Cooks are supplied after the girls' Produce shift, from what that shift leaves.
    if (job === COOK_JOB) {
      const shift = await WorkSupplyService.plan(prisma, roundPlayerId, settled.ruleset, { job: PRODUCE_JOB, workers: settled.player.whores, turns, crack });
      const left = await ProductInventoryService.read(prisma, roundPlayerId, settled.ruleset);
      const cook = planWorkSupply({
        job, role: 'thugs', workers, turns, ruleset: settled.ruleset,
        policy: (await loadPolicies(prisma, roundPlayerId)).get(job) ?? defaultWorkSupplyPolicy(),
        inventory: Object.fromEntries(Object.entries({ ...left, [CRACK]: crack }).map(([key, quantity]) => [key, quantity - (shift.consumed[key] ?? 0)])),
      });
      return toPlanDto(cook, settled.ruleset);
    }
    const plan = await WorkSupplyService.plan(prisma, roundPlayerId, settled.ruleset, { job, role: found.role, workers, turns, crack });
    return toPlanDto(plan, settled.ruleset);
  },
};
