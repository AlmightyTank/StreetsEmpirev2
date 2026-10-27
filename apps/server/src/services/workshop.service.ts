import type { Prisma, PrismaClient } from '@prisma/client';
import type { CraftingIngredientDto, CraftingRecipeDto, CraftingResultDto, CraftingWorkshopDto } from '@streets/shared';
import type { Ruleset } from '@streets/rules-engine';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns } from './action.service.js';
import { canFitAdditionalStack, StashService } from './stash.service.js';
import { generatorFuelPerTurn } from './generator.service.js';
import { recordHideoutEconomy } from './hideout-economy-telemetry.service.js';
import { COMPONENTS } from './scavenging.service.js';

type Recipe = Omit<CraftingRecipeDto, 'unlocked'>;
type PartLine = CraftingIngredientDto;

const CELL = { width: 1, height: 1 } as const;

function part(key: string, quantity: number): PartLine {
  const definition = COMPONENTS.find((row) => row.key === key);
  if (!definition) throw new Error(`Unknown workshop component ${key}`);
  return { key, name: definition.name, quantity };
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
  { key: 'PREMIUM_CONDOMS', name: 'Premium condoms', purpose: 'A higher-value trade item for the corner store.', kind: 'ASSEMBLE', ingredients: [{ key: 'PACKAGING', name: 'Packaging', quantity: 1 }, { key: 'SPECIALTY_CONTAINER', name: 'Specialty container', quantity: 1 }, { key: 'CLOTH', name: 'Cloth', quantity: 1 }], output: { key: 'CONDOM', name: 'Premium condoms', quantity: 2, footprint: CELL }, turns: 2, requiresPower: false, unlockLevel: 0 },
  { key: 'CORNER_WRAP', name: 'Corner wrap', purpose: 'A plain condom pack from common parts, when no specialty container is on the bench.', kind: 'ASSEMBLE', ingredients: [part('LABELS', 1), part('PACKAGING', 1), part('CLOTH', 1)], output: { key: 'CONDOM', name: 'Condoms', quantity: 1, footprint: CELL }, turns: 2, requiresPower: false, unlockLevel: 0 },
  { key: 'HOUSE_BREW', name: 'House Brew', purpose: 'A trade good that keeps the crew supplied.', kind: 'ASSEMBLE', ingredients: [{ key: 'BOTTLES', name: 'Bottles', quantity: 2 }, { key: 'LABELS', name: 'Labels', quantity: 1 }, { key: 'PACKAGING', name: 'Packaging', quantity: 1 }], output: { key: 'BEER', name: 'House Brew', quantity: 2, footprint: CELL }, turns: 3, requiresPower: true, unlockLevel: 1 },
  { key: 'CRATE_BREW', name: 'Crate brew', purpose: 'A rough beer batch from bottles, lumber, and fasteners when the labels run out.', kind: 'ASSEMBLE', ingredients: [part('BOTTLES', 1), part('LUMBER', 2), part('FASTENERS', 1)], output: { key: 'BEER', name: 'Beer', quantity: 1, footprint: CELL }, turns: 2, requiresPower: true, unlockLevel: 1 },
  { key: 'FIELD_FIRST_AID', name: 'Field first-aid kit', purpose: 'Medicine prepared for a risky outing.', kind: 'ASSEMBLE', ingredients: [{ key: 'BASIC_MEDICINE', name: 'Basic medicine', quantity: 1 }, { key: 'CLOTH', name: 'Cloth', quantity: 2 }, { key: 'PACKAGING', name: 'Packaging', quantity: 1 }], output: { key: 'MEDICINE', name: 'Field first-aid kit', quantity: 1, footprint: CELL }, turns: 2, requiresPower: false, unlockLevel: 1 },
  { key: 'RAG_DRESSING', name: 'Rag dressing', purpose: 'A field dressing from cloth and fasteners when basic medicine is short.', kind: 'ASSEMBLE', ingredients: [part('CLOTH', 3), part('FASTENERS', 1), part('PACKAGING', 1)], output: { key: 'MEDICINE', name: 'Rag dressing', quantity: 1, footprint: CELL }, turns: 2, requiresPower: false, unlockLevel: 1 },
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

const LEGACY_FIELDS: Record<string, 'condoms' | 'medicine' | 'beer' | 'ammo' | 'vehicleParts'> = {
  CONDOM: 'condoms', MEDICINE: 'medicine', BEER: 'beer', AMMO_BOX: 'ammo', PARTS_BOX: 'vehicleParts',
};

function skillFromXp(xp: number): number { return Math.min(100, Math.floor(Math.sqrt(Math.max(0, xp)) * 10)); }
function recipeDto(recipe: Recipe, level: number): CraftingRecipeDto { return { ...recipe, unlocked: level >= recipe.unlockLevel }; }
function balances(value: Prisma.JsonValue): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, quantity]) => typeof quantity === 'number' && quantity > 0)) as Record<string, number>;
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

export function craftingRecipes(): readonly Recipe[] { return RECIPES; }
export function workshopSkill(xp: number): number { return skillFromXp(xp); }
function availableRecipes(ruleset?: Ruleset): readonly Recipe[] {
  if (!ruleset?.retiredFeatures) return RECIPES;
  return RECIPES.filter((recipe) => !(recipe.key === 'AMMO_BUNDLE' && ruleset.retiredFeatures?.armory)
    && !(recipe.key === 'VEHICLE_REPAIR_KIT' && ruleset.retiredFeatures?.garage));
}

export const WorkshopService = {
  async page(prisma: PrismaClient, roundPlayerId: string, ruleset?: Ruleset): Promise<CraftingWorkshopDto> {
    const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { hideoutWorkshopLevel: true, workshopSkillXp: true, scavengedComponents: true } });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
    return { level: player.hideoutWorkshopLevel, skill: skillFromXp(player.workshopSkillXp), skillXp: player.workshopSkillXp, availableComponents: Object.entries(balances(player.scavengedComponents)).map(([key, quantity]) => ({ key, quantity })), recipes: availableRecipes(ruleset).map((recipe) => recipeDto(recipe, player.hideoutWorkshopLevel)) };
  },

  craft(prisma: PrismaClient, roundPlayerId: string, recipeKey: string, actionId?: string, ruleset?: Ruleset): Promise<import('@streets/shared').GameActionResult<CraftingResultDto>> {
    const recipe = availableRecipes(ruleset).find((candidate) => candidate.key === recipeKey);
    if (!recipe) return Promise.reject(AppError.badRequest('UNKNOWN_CRAFTING_RECIPE', 'That workshop recipe does not exist.'));
    return ActionService.run<CraftingResultDto>(prisma, roundPlayerId, {
      action: 'CRAFT', actionId,
      execute: async ({ tx, current, player }) => {
        if (current.hideoutWorkshopLevel < recipe.unlockLevel) throw new AppError(403, 'RECIPE_LOCKED', 'Upgrade the Workshop to unlock that recipe.');
        assertTurns(current.turns, recipe.turns);
        if (recipe.requiresPower) {
          const fuelNeeded = recipe.turns * generatorFuelPerTurn(current.generatorEfficiencyLevel ?? 0);
          if (!current.generatorPowered || (current.generatorFuel ?? 0) < fuelNeeded) throw AppError.badRequest('INSUFFICIENT_POWER', 'This recipe needs enough generator fuel for the full craft.');
        }
        const components = balances(player.scavengedComponents);
        const nextComponents = previewCraftComponents(components, recipe);
        if (!nextComponents) {
          const missing = recipe.ingredients.find((ingredient) => (components[ingredient.key] ?? 0) < ingredient.quantity);
          throw AppError.badRequest('MISSING_CRAFTING_COMPONENTS', `You need more ${missing?.name ?? 'parts'}.`);
        }
        const stash = await StashService.page(tx, roundPlayerId);
        if (recipe.kind === 'DISASSEMBLE') {
          const { added, removed } = componentStacksOpened(components, nextComponents);
          if (added > stash.totalCells - stash.usedCells + removed) throw AppError.conflict('STASH_FULL', 'There is no room in the stash for the parts this breaks into.');
        } else if (!canFitAdditionalStack(stash, recipe.output.key as Parameters<typeof canFitAdditionalStack>[1])) {
          throw AppError.conflict('STASH_FULL', 'There is no room in the stash for this crafted output.');
        }
        const gain = player.workshopLastRecipe === recipe.key ? 3 : 10;
        const skillXp = (player.workshopSkillXp ?? 0) + gain;
        const outputField = recipe.kind === 'ASSEMBLE' ? LEGACY_FIELDS[recipe.output.key] : undefined;
        if (recipe.kind === 'ASSEMBLE' && !outputField) throw AppError.conflict('INVALID_CRAFTING_OUTPUT', 'That recipe has no valid stash output.');
        const next = outputField
          ? { ...current, turns: current.turns - recipe.turns, [outputField]: Number(current[outputField] ?? 0) + recipe.output.quantity }
          : { ...current, turns: current.turns - recipe.turns };
         await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { scavengedComponents: nextComponents as Prisma.InputJsonValue, workshopSkillXp: skillXp, workshopLastRecipe: recipe.key } });
         for (const ingredient of recipe.ingredients) await recordHideoutEconomy(tx, roundPlayerId, 'COMPONENT_SPENT', { itemKey: ingredient.key, quantity: ingredient.quantity, payload: { source: 'CRAFT', recipeKey: recipe.key } });
         await recordHideoutEconomy(tx, roundPlayerId, 'RECIPE_COMPLETED', { itemKey: recipe.output.key, quantity: recipe.output.quantity, payload: { recipeKey: recipe.key, kind: recipe.kind, turns: recipe.turns, ...(recipe.partYields ? { partYields: recipe.partYields.map((line) => ({ key: line.key, name: line.name, quantity: line.quantity })) } : {}) } as Prisma.InputJsonValue });
          return { next, result: { recipe: recipeDto(recipe, current.hideoutWorkshopLevel), output: recipe.output, ...(recipe.partYields ? { partYields: recipe.partYields } : {}), availableComponents: Object.entries(nextComponents).map(([key, quantity]) => ({ key, quantity })), skill: skillFromXp(skillXp), skillXp } };
      },
    });
  },
};
