import type { Prisma, PrismaClient } from '@prisma/client';
import { MAX_CRAFT_BATCH, type CraftingFilterDto, type CraftingIngredientDto, type CraftingJobDto, type CraftingRecipeDto, type CraftingResultDto, type CraftingWorkshopDto, type CraftingCollectResultDto } from '@streets/shared';
import type { Ruleset } from '@streets/rules-engine';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns } from './action.service.js';
import { canFitAdditionalStack, StashService } from './stash.service.js';
import { generatorFuelPerTurn } from './generator.service.js';
import { recordHideoutEconomy } from './hideout-economy-telemetry.service.js';
import { COMPONENTS } from './scavenging.service.js';
import { randomUUID } from 'node:crypto';

type Recipe = Omit<CraftingRecipeDto, 'unlocked'>;
type PartLine = CraftingIngredientDto;

const CELL = { width: 1, height: 1 } as const;
const WATER_FILTER_KEY = 'WATER_FILTER';
/** One spent game turn represents one minute of workshop time. */
export const CRAFTING_TURN_MINUTES = 1;
/** A fresh filter. Crafts burn a percent of one filter and cannot pool two partials. */
export const FILTER_CAPACITY = 100;

function part(key: string, quantity: number): PartLine {
  const definition = COMPONENTS.find((row) => row.key === key);
  if (!definition) throw new Error(`Unknown workshop component ${key}`);
  return { key, name: definition.name, quantity };
}

function filterUse(percent: number): CraftingFilterDto {
  const { key, name } = part(WATER_FILTER_KEY, 1);
  return { key, name, percent };
}

function breakdown(input: {
  key: string;
  name: string;
  purpose: string;
  ingredient: readonly [string, number];
  yields: readonly (readonly [string, number])[];
  turns: number;
  requiresPower: boolean;
  unlockLevel: number;
}): Recipe {
  const partYields = input.yields.map(([key, quantity]) => part(key, quantity));
  const lead = partYields[0];
  if (!lead) throw new Error(`Break-down recipe ${input.key} returns no parts`);
  return {
    key: input.key,
    name: input.name,
    purpose: input.purpose,
    kind: 'DISASSEMBLE',
    ingredients: [part(input.ingredient[0], input.ingredient[1])],
    output: { key: lead.key, name: lead.name, quantity: lead.quantity, footprint: CELL },
    partYields,
    turns: input.turns,
    requiresPower: input.requiresPower,
    unlockLevel: input.unlockLevel,
  };
}

const RECIPES: readonly Recipe[] = [
  { key: 'PREMIUM_CONDOMS', name: 'Premium condoms', purpose: 'Each pack covers three uses instead of one, so the crew burns far fewer. About one shift in twenty a batch goes bad and the uses it covered leave the girls unprotected.', kind: 'ASSEMBLE', ingredients: [{ key: 'PACKAGING', name: 'Packaging', quantity: 1 }, { key: 'SPECIALTY_CONTAINER', name: 'Specialty container', quantity: 1 }, { key: 'CLOTH', name: 'Cloth', quantity: 1 }], output: { key: 'PREMIUM_CONDOM', name: 'Premium condoms', quantity: 1, footprint: CELL }, turns: 2, requiresPower: false, unlockLevel: 0 },
  { key: 'CORNER_WRAP', name: 'Corner wrap', purpose: 'A plain condom pack from common parts, when no specialty container is on the bench.', kind: 'ASSEMBLE', ingredients: [part('LABELS', 1), part('PACKAGING', 1), part('CLOTH', 1)], output: { key: 'CONDOM', name: 'Condoms', quantity: 1, footprint: CELL }, turns: 2, requiresPower: false, unlockLevel: 0 },
  { key: 'HOUSE_BREW', name: 'House Brew', purpose: 'Each bottle covers three beers instead of one, so the crew burns far fewer. About one shift in twenty a batch goes bad and part of the crew walks off sick. The batch takes time and burns part of one water filter.', kind: 'ASSEMBLE', ingredients: [{ key: 'BOTTLES', name: 'Bottles', quantity: 2 }, { key: 'LABELS', name: 'Labels', quantity: 1 }, { key: 'PACKAGING', name: 'Packaging', quantity: 1 }], output: { key: 'HOUSE_BREW', name: 'House Brew', quantity: 2, footprint: CELL }, filter: filterUse(30), turns: 3, requiresPower: true, unlockLevel: 1 },
  { key: 'CRATE_BREW', name: 'Crate brew', purpose: 'A rough beer batch from bottles, lumber, and fasteners. It takes time and burns part of one water filter.', kind: 'ASSEMBLE', ingredients: [part('BOTTLES', 1), part('LUMBER', 2), part('FASTENERS', 1)], output: { key: 'BEER', name: 'Beer', quantity: 1, footprint: CELL }, filter: filterUse(20), turns: 2, requiresPower: true, unlockLevel: 1 },
  { key: 'FIELD_FIRST_AID', name: 'Field first-aid kit', purpose: 'A prepared kit that treats two wounded thugs in the field.', kind: 'ASSEMBLE', ingredients: [{ key: 'BASIC_MEDICINE', name: 'Basic medicine', quantity: 1 }, { key: 'CLOTH', name: 'Cloth', quantity: 2 }, { key: 'PACKAGING', name: 'Packaging', quantity: 1 }], output: { key: 'FIELD_FIRST_AID', name: 'Field first-aid kit', quantity: 1, footprint: CELL }, turns: 2, requiresPower: false, unlockLevel: 1 },
  { key: 'RAG_DRESSING', name: 'Rag dressing', purpose: 'A cheap dressing that takes two pieces to treat one wounded thug.', kind: 'ASSEMBLE', ingredients: [part('CLOTH', 3), part('FASTENERS', 1), part('PACKAGING', 1)], output: { key: 'RAG_DRESSING', name: 'Rag dressing', quantity: 1, footprint: CELL }, turns: 2, requiresPower: false, unlockLevel: 1 },
  { key: 'AMMO_BUNDLE', name: 'Ammo bundle', purpose: 'Converts workshop materials into a limited bullet supply.', kind: 'ASSEMBLE', ingredients: [{ key: 'SCRAP_METAL', name: 'Scrap metal', quantity: 2 }, { key: 'WIRING', name: 'Wiring', quantity: 1 }], output: { key: 'AMMO_BOX', name: 'Ammo bundle', quantity: 20, footprint: CELL }, turns: 2, requiresPower: true, unlockLevel: 1 },
  { key: 'VEHICLE_REPAIR_KIT', name: 'Vehicle repair kit', purpose: 'Parts and tools for vehicle maintenance or a Garage upgrade.', kind: 'ASSEMBLE', ingredients: [{ key: 'SCRAP_METAL', name: 'Scrap metal', quantity: 2 }, { key: 'TOOL_KIT', name: 'Tool kit', quantity: 1 }, { key: 'WIRING', name: 'Wiring', quantity: 1 }], output: { key: 'PARTS_BOX', name: 'Vehicle repair kit', quantity: 1, footprint: CELL }, turns: 3, requiresPower: true, unlockLevel: 2 },
  // Yields stay under the spent part's book, and under what a Salvage Yard barter asks for that part.
  // Stripping is a way to turn the wrong part into cheaper ones.
  breakdown({ key: 'STRIP_MOTOR', name: 'Strip a motor', purpose: 'Break a motor assembly into scrap metal and wiring.', ingredient: ['MOTOR_ASSEMBLY', 1], yields: [['SCRAP_METAL', 2], ['WIRING', 1]], turns: 2, requiresPower: false, unlockLevel: 0 }),
  breakdown({ key: 'CRACK_RADIO', name: 'Crack a radio', purpose: 'Pull the wiring out of a radio.', ingredient: ['RADIO', 1], yields: [['WIRING', 1]], turns: 1, requiresPower: false, unlockLevel: 0 }),
  breakdown({ key: 'BREAK_CONTAINER', name: 'Break a container', purpose: 'Smash a specialty container for packaging and bottles.', ingredient: ['SPECIALTY_CONTAINER', 1], yields: [['PACKAGING', 2], ['BOTTLES', 1]], turns: 2, requiresPower: false, unlockLevel: 1 }),
  breakdown({ key: 'SALVAGE_REPAIR_SUPPLIES', name: 'Salvage repair supplies', purpose: 'Sort repair supplies back into cloth and a tool kit.', ingredient: ['REPAIR_SUPPLIES', 1], yields: [['CLOTH', 1], ['TOOL_KIT', 1]], turns: 2, requiresPower: false, unlockLevel: 1 }),
  breakdown({ key: 'PULL_PRECISION_PARTS', name: 'Pull precision parts', purpose: 'Turn precision parts into scrap metal and wiring. Most of the part is lost.', ingredient: ['PRECISION_PARTS', 1], yields: [['SCRAP_METAL', 2], ['WIRING', 2]], turns: 3, requiresPower: true, unlockLevel: 2 }),
  breakdown({ key: 'RENDER_MEDICAL_STOCK', name: 'Render medical stock', purpose: 'Break an advanced medical component into basic medicine and cloth.', ingredient: ['ADVANCED_MEDICAL', 1], yields: [['BASIC_MEDICINE', 1], ['CLOTH', 1]], turns: 2, requiresPower: false, unlockLevel: 2 }),
  breakdown({ key: 'DRAIN_FUEL_CELL', name: 'Drain a fuel cell', purpose: 'Empty a high-capacity fuel cell into fuel cans. Most of the charge is lost.', ingredient: ['HIGH_CAPACITY_FUEL_CELL', 1], yields: [['FUEL_CAN', 2]], turns: 3, requiresPower: true, unlockLevel: 3 }),
  breakdown({ key: 'STRIP_CIRCUITRY', name: 'Strip circuitry', purpose: 'Pull a radio and wiring out of specialist circuitry. The rest is scrap you cannot keep.', ingredient: ['SPECIALIST_CIRCUITRY', 1], yields: [['RADIO', 1], ['WIRING', 2]], turns: 3, requiresPower: true, unlockLevel: 3 }),
];

const LEGACY_FIELDS: Record<string, 'condoms' | 'premiumCondoms' | 'medicine' | 'fieldFirstAidKits' | 'ragDressings' | 'beer' | 'houseBrew' | 'ammo' | 'vehicleParts'> = {
  CONDOM: 'condoms', PREMIUM_CONDOM: 'premiumCondoms', MEDICINE: 'medicine', FIELD_FIRST_AID: 'fieldFirstAidKits', RAG_DRESSING: 'ragDressings', BEER: 'beer', HOUSE_BREW: 'houseBrew', AMMO_BOX: 'ammo', PARTS_BOX: 'vehicleParts',
};

/** Percents still on the filters the player holds. Values outside 1–100 are ignored. */
export function waterFilterLoads(value: Prisma.JsonValue | null | undefined): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((load): load is number => typeof load === 'number' && Number.isInteger(load) && load >= 1 && load <= FILTER_CAPACITY);
}

/**
 * The component count is how many filters exist. A longer list means filters were found or bought,
 * so the new ones are full. A shorter list means some were sold or posted, and the fullest go first
 * so a worn filter stays on the bench.
 */
export function reconcileWaterFilters(loads: readonly number[], count: number): number[] {
  const clean = loads.filter((load) => Number.isInteger(load) && load >= 1 && load <= FILTER_CAPACITY);
  const held = Math.max(0, Math.floor(count));
  if (clean.length === held) return [...clean];
  if (clean.length < held) return [...clean, ...Array.from({ length: held - clean.length }, () => FILTER_CAPACITY)];
  return [...clean].sort((left, right) => left - right).slice(0, held);
}

/**
 * Burns `percent` from the most worn filter that can cover it. Two partial filters never combine.
 * Returns null when no single filter has enough left. `destroyed` means that filter hit zero.
 */
export function spendWaterFilter(loads: readonly number[], percent: number): { loads: number[]; destroyed: boolean } | null {
  if (!Number.isInteger(percent) || percent < 1 || percent > FILTER_CAPACITY) return null;
  let bestIndex = -1;
  for (let index = 0; index < loads.length; index += 1) {
    const load = loads[index] ?? 0;
    if (load < percent) continue;
    if (bestIndex < 0 || load < (loads[bestIndex] ?? 0)) bestIndex = index;
  }
  if (bestIndex < 0) return null;
  const next = loads.slice();
  const left = (next[bestIndex] ?? 0) - percent;
  if (left <= 0) {
    next.splice(bestIndex, 1);
    return { loads: next, destroyed: true };
  }
  next[bestIndex] = left;
  return { loads: next, destroyed: false };
}

function skillFromXp(xp: number): number { return Math.min(100, Math.floor(Math.sqrt(Math.max(0, xp)) * 10)); }
function recipeDto(recipe: Recipe, level: number): CraftingRecipeDto { return { ...recipe, unlocked: level >= recipe.unlockLevel }; }
function balances(value: Prisma.JsonValue): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, quantity]) => typeof quantity === 'number' && quantity > 0)) as Record<string, number>;
}

type StoredJob = Omit<CraftingJobDto, 'status'>;
function storedJobs(value: Prisma.JsonValue | null | undefined): StoredJob[] {
  if (!Array.isArray(value)) return [];
  return value.filter((job) => Boolean(job && typeof job === 'object' && !Array.isArray(job)
    && typeof (job as Record<string, unknown>).id === 'string'
    && typeof (job as Record<string, unknown>).readyAt === 'string')) as unknown as StoredJob[];
}
function jobDto(job: StoredJob, level: number): CraftingJobDto {
  return { ...job, recipe: recipeDto(job.recipe as Recipe, level), status: new Date(job.readyAt) <= new Date() ? 'READY' : 'WORKING' };
}

/** Applies one craft to a component pile. Returns null when an ingredient is short. A stack that hits zero is removed. */
export function previewCraftComponents(components: Record<string, number>, recipe: Recipe): Record<string, number> | null {
  const next = { ...components };
  for (const ingredient of recipe.ingredients) {
    const have = next[ingredient.key] ?? 0;
    if (have < ingredient.quantity) return null;
    const left = have - ingredient.quantity;
    if (left > 0) next[ingredient.key] = left;
    else delete next[ingredient.key];
  }
  if (recipe.kind === 'DISASSEMBLE') {
    for (const line of recipe.partYields ?? []) next[line.key] = (next[line.key] ?? 0) + line.quantity;
  }
  return next;
}

/** How many component stacks a craft removes and opens. Each stack is one stash cell. */
export function componentStacksOpened(before: Record<string, number>, after: Record<string, number>): { removed: number; added: number } {
  const beforeKeys = new Set(Object.keys(before));
  const afterKeys = new Set(Object.keys(after));
  let removed = 0;
  let added = 0;
  for (const key of beforeKeys) if (!afterKeys.has(key)) removed += 1;
  for (const key of afterKeys) if (!beforeKeys.has(key)) added += 1;
  return { removed, added };
}

/** One craft of `batches` copies. Turns, ingredients, output, and filter wear all multiply. */
export function scaleCraftRecipe(recipe: Recipe, batches: number): Recipe {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((line) => ({ ...line, quantity: line.quantity * batches })),
    output: { ...recipe.output, quantity: recipe.output.quantity * batches },
    ...(recipe.partYields ? { partYields: recipe.partYields.map((line) => ({ ...line, quantity: line.quantity * batches })) } : {}),
    ...(recipe.filter ? { filter: { ...recipe.filter, percent: recipe.filter.percent * batches } } : {}),
    turns: recipe.turns * batches,
  };
}

function craftBatches(value: number | undefined): number {
  const batches = value ?? 1;
  if (!Number.isInteger(batches) || batches < 1 || batches > MAX_CRAFT_BATCH) {
    throw AppError.badRequest('INVALID_CRAFT_QUANTITY', `Make between 1 and ${MAX_CRAFT_BATCH} at a time.`);
  }
  return batches;
}

export function craftingRecipes(): readonly Recipe[] { return RECIPES; }
export function workshopSkill(xp: number): number { return skillFromXp(xp); }
function availableRecipes(ruleset?: Ruleset): readonly Recipe[] {
  if (!ruleset?.retiredFeatures) return RECIPES;
  return RECIPES.filter((recipe) => !(recipe.key === 'AMMO_BUNDLE' && ruleset.retiredFeatures?.armory)
    && !(recipe.key === 'VEHICLE_REPAIR_KIT' && ruleset.retiredFeatures?.garage));
}

export const WorkshopService = {
  async page(prisma: PrismaClient, roundPlayerId: string, ruleset?: Ruleset): Promise<CraftingWorkshopDto> {
    const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { hideoutWorkshopLevel: true, workshopSkillXp: true, scavengedComponents: true, waterFilters: true, workshopJobs: true } });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
    const components = balances(player.scavengedComponents);
    const waterFilters = reconcileWaterFilters(waterFilterLoads(player.waterFilters), components[WATER_FILTER_KEY] ?? 0);
    return { level: player.hideoutWorkshopLevel, skill: skillFromXp(player.workshopSkillXp), skillXp: player.workshopSkillXp, availableComponents: Object.entries(components).map(([key, quantity]) => ({ key, quantity })), waterFilters, recipes: availableRecipes(ruleset).map((recipe) => recipeDto(recipe, player.hideoutWorkshopLevel)), jobs: storedJobs(player.workshopJobs).map((job) => jobDto(job, player.hideoutWorkshopLevel)) };
  },

  craft(prisma: PrismaClient, roundPlayerId: string, recipeKey: string, actionId?: string, ruleset?: Ruleset, batches?: number): Promise<import('@streets/shared').GameActionResult<CraftingResultDto>> {
    const recipe = availableRecipes(ruleset).find((candidate) => candidate.key === recipeKey);
    if (!recipe) return Promise.reject(AppError.badRequest('UNKNOWN_CRAFTING_RECIPE', 'That workshop recipe does not exist.'));
    let count = 1;
    try { count = craftBatches(batches); } catch (error) { return Promise.reject(error); }
    const job = scaleCraftRecipe(recipe, count);
    return ActionService.run<CraftingResultDto>(prisma, roundPlayerId, {
      action: 'CRAFT', actionId,
       execute: async ({ tx, current, player, now }) => {
        if (current.hideoutWorkshopLevel < recipe.unlockLevel) throw new AppError(403, 'RECIPE_LOCKED', 'Upgrade the Workshop to unlock that recipe.');
        assertTurns(current.turns, job.turns);
        if (job.requiresPower) {
          const fuelNeeded = job.turns * generatorFuelPerTurn(current.generatorEfficiencyLevel ?? 0);
          if (!current.generatorPowered || (current.generatorFuel ?? 0) < fuelNeeded) throw AppError.badRequest('INSUFFICIENT_POWER', 'This recipe needs enough generator fuel for the full craft.');
        }
        const components = balances(player.scavengedComponents);
        const nextComponents = previewCraftComponents(components, job);
        if (!nextComponents) {
          const missing = job.ingredients.find((ingredient) => (components[ingredient.key] ?? 0) < ingredient.quantity);
          throw AppError.badRequest('MISSING_CRAFTING_COMPONENTS', `You need more ${missing?.name ?? 'parts'}.`);
        }
        let waterFilters = reconcileWaterFilters(waterFilterLoads(player.waterFilters), components[WATER_FILTER_KEY] ?? 0);
        if (job.filter) {
          if (job.filter.percent > FILTER_CAPACITY) {
            throw AppError.badRequest('WATER_FILTER_TOO_WORN', `One water filter holds ${FILTER_CAPACITY}%. Making ${count} needs ${job.filter.percent}%.`);
          }
          const spent = spendWaterFilter(waterFilters, job.filter.percent);
          if (!spent) {
            const fullest = waterFilters.reduce((best, load) => Math.max(best, load), 0);
            const detail = fullest > 0
              ? `Making ${count} needs ${job.filter.percent}% of one water filter. The fullest one has ${fullest}% left.`
              : `Making ${count} needs a water filter with at least ${job.filter.percent}% left.`;
            throw AppError.badRequest('WATER_FILTER_TOO_WORN', detail);
          }
          waterFilters = spent.loads;
          if (spent.destroyed) {
            const left = (nextComponents[WATER_FILTER_KEY] ?? 0) - 1;
            if (left > 0) nextComponents[WATER_FILTER_KEY] = left;
            else delete nextComponents[WATER_FILTER_KEY];
          }
        }
        const stash = await StashService.page(tx, roundPlayerId);
        if (job.kind === 'DISASSEMBLE') {
          const { added, removed } = componentStacksOpened(components, nextComponents);
          if (added > stash.totalCells - stash.usedCells + removed) throw AppError.conflict('STASH_FULL', 'There is no room in the stash for the parts this breaks into.');
        } else if (!canFitAdditionalStack(stash, job.output.key as Parameters<typeof canFitAdditionalStack>[1])) {
          throw AppError.conflict('STASH_FULL', 'There is no room in the stash for this crafted output.');
        }
        const gain = player.workshopLastRecipe === recipe.key ? 3 : 10;
        const skillXp = (player.workshopSkillXp ?? 0) + gain;
        const outputField = job.kind === 'ASSEMBLE' ? LEGACY_FIELDS[job.output.key] : undefined;
        if (job.kind === 'ASSEMBLE' && !outputField) throw AppError.conflict('INVALID_CRAFTING_OUTPUT', 'That recipe has no valid stash output.');
        const jobs = storedJobs(player.workshopJobs);
        const previousReady = jobs.reduce((latest, item) => Math.max(latest, new Date(item.readyAt).getTime()), 0);
        const startedAt = now;
        const readyAt = new Date(Math.max(startedAt.getTime(), previousReady) + job.turns * CRAFTING_TURN_MINUTES * 60_000);
        const stored: StoredJob = { id: randomUUID(), recipe: recipeDto(recipe, current.hideoutWorkshopLevel), output: job.output, ...(job.partYields ? { partYields: job.partYields } : {}), batches: count, startedAt: startedAt.toISOString(), readyAt: readyAt.toISOString() };
        const next = { ...current, turns: current.turns - job.turns };
         await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { scavengedComponents: nextComponents as Prisma.InputJsonValue, waterFilters: waterFilters as Prisma.InputJsonValue, workshopSkillXp: skillXp, workshopLastRecipe: recipe.key, workshopJobs: [...jobs, stored] as unknown as Prisma.InputJsonValue } });
         for (const ingredient of job.ingredients) await recordHideoutEconomy(tx, roundPlayerId, 'COMPONENT_SPENT', { itemKey: ingredient.key, quantity: ingredient.quantity, payload: { source: 'CRAFT', recipeKey: recipe.key, batches: count } });
         if (job.filter && (components[WATER_FILTER_KEY] ?? 0) > (nextComponents[WATER_FILTER_KEY] ?? 0)) {
           await recordHideoutEconomy(tx, roundPlayerId, 'COMPONENT_SPENT', { itemKey: job.filter.key, quantity: 1, payload: { source: 'CRAFT', recipeKey: recipe.key, filterPercent: job.filter.percent, batches: count } });
         }
           return { next, result: { recipe: recipeDto(recipe, current.hideoutWorkshopLevel), output: job.output, batches: count, ...(job.partYields ? { partYields: job.partYields } : {}), availableComponents: Object.entries(nextComponents).map(([key, quantity]) => ({ key, quantity })), waterFilters, skill: skillFromXp(skillXp), skillXp, job: jobDto(stored, current.hideoutWorkshopLevel) } };
      },
    });
  },

  collect(prisma: PrismaClient, roundPlayerId: string, jobId: string, actionId?: string): Promise<import('@streets/shared').GameActionResult<CraftingCollectResultDto>> {
    return ActionService.run<CraftingCollectResultDto>(prisma, roundPlayerId, { action: 'COLLECT_CRAFT', actionId,
      execute: async ({ tx, current, player, now }) => {
        const jobs = storedJobs(player.workshopJobs);
        const job = jobs.find((candidate) => candidate.id === jobId);
        if (!job) throw AppError.notFound('CRAFTING_JOB_NOT_FOUND', 'That crafting job is no longer waiting here.');
        if (new Date(job.readyAt) > new Date()) throw AppError.conflict('CRAFTING_NOT_READY', 'That craft is still being finished.');
        const components = balances(player.scavengedComponents);
        const nextComponents = { ...components };
        if (job.recipe.kind === 'DISASSEMBLE') {
          for (const line of job.partYields ?? []) nextComponents[line.key] = (nextComponents[line.key] ?? 0) + line.quantity;
        }
        const stash = await StashService.page(tx, roundPlayerId);
        if (job.recipe.kind === 'DISASSEMBLE') {
          const { added, removed } = componentStacksOpened(components, nextComponents);
          if (added > stash.totalCells - stash.usedCells + removed) throw AppError.conflict('STASH_FULL', 'There is no room in the stash for these crafted parts.');
        } else if (!canFitAdditionalStack(stash, job.output.key as Parameters<typeof canFitAdditionalStack>[1])) {
          throw AppError.conflict('STASH_FULL', 'There is no room in the stash for this crafted output.');
        }
        const outputField = job.recipe.kind === 'ASSEMBLE' ? LEGACY_FIELDS[job.output.key] : undefined;
        const next = outputField ? { ...current, [outputField]: Number(current[outputField] ?? 0) + job.output.quantity } : current;
        const remaining = jobs.filter((candidate) => candidate.id !== jobId);
        await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { scavengedComponents: nextComponents as Prisma.InputJsonValue, workshopJobs: remaining as unknown as Prisma.InputJsonValue } });
        return { next, result: { job: jobDto(job, player.hideoutWorkshopLevel), output: job.output, ...(job.partYields ? { partYields: job.partYields } : {}), availableComponents: Object.entries(nextComponents).map(([key, quantity]) => ({ key, quantity })), waterFilters: reconcileWaterFilters(waterFilterLoads(player.waterFilters), nextComponents[WATER_FILTER_KEY] ?? 0), skill: skillFromXp(player.workshopSkillXp), skillXp: player.workshopSkillXp } };
      },
    });
  },
};

