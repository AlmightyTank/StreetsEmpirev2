import type { Prisma, PrismaClient } from '@prisma/client';
import type { CraftingRecipeDto, CraftingResultDto, CraftingWorkshopDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns } from './action.service.js';
import { canFitAdditionalStack, StashService } from './stash.service.js';
import { generatorFuelPerTurn } from './generator.service.js';
import { recordHideoutEconomy } from './hideout-economy-telemetry.service.js';

type Recipe = Omit<CraftingRecipeDto, 'unlocked'>;

const RECIPES: readonly Recipe[] = [
  { key: 'PREMIUM_CONDOMS', name: 'Premium condoms', purpose: 'A higher-value trade item for the corner store.', ingredients: [{ key: 'PACKAGING', name: 'Packaging', quantity: 1 }, { key: 'SPECIALTY_CONTAINER', name: 'Specialty container', quantity: 1 }, { key: 'CLOTH', name: 'Cloth', quantity: 1 }], output: { key: 'CONDOM', name: 'Premium condoms', quantity: 2, footprint: { width: 1, height: 1 } }, turns: 2, requiresPower: false, unlockLevel: 0 },
  { key: 'HOUSE_BREW', name: 'House Brew', purpose: 'A trade good that keeps the crew supplied.', ingredients: [{ key: 'BOTTLES', name: 'Bottles', quantity: 2 }, { key: 'LABELS', name: 'Labels', quantity: 1 }, { key: 'PACKAGING', name: 'Packaging', quantity: 1 }], output: { key: 'BEER', name: 'House Brew', quantity: 2, footprint: { width: 1, height: 1 } }, turns: 3, requiresPower: true, unlockLevel: 1 },
  { key: 'FIELD_FIRST_AID', name: 'Field first-aid kit', purpose: 'Medicine prepared for a risky outing.', ingredients: [{ key: 'BASIC_MEDICINE', name: 'Basic medicine', quantity: 1 }, { key: 'CLOTH', name: 'Cloth', quantity: 2 }, { key: 'PACKAGING', name: 'Packaging', quantity: 1 }], output: { key: 'MEDICINE', name: 'Field first-aid kit', quantity: 1, footprint: { width: 1, height: 1 } }, turns: 2, requiresPower: false, unlockLevel: 1 },
  { key: 'AMMO_BUNDLE', name: 'Ammo bundle', purpose: 'Converts workshop materials into a limited bullet supply.', ingredients: [{ key: 'SCRAP_METAL', name: 'Scrap metal', quantity: 2 }, { key: 'WIRING', name: 'Wiring', quantity: 1 }], output: { key: 'AMMO_BOX', name: 'Ammo bundle', quantity: 20, footprint: { width: 1, height: 1 } }, turns: 2, requiresPower: true, unlockLevel: 1 },
  { key: 'VEHICLE_REPAIR_KIT', name: 'Vehicle repair kit', purpose: 'Parts and tools for vehicle maintenance or a Garage upgrade.', ingredients: [{ key: 'SCRAP_METAL', name: 'Scrap metal', quantity: 2 }, { key: 'TOOL_KIT', name: 'Tool kit', quantity: 1 }, { key: 'WIRING', name: 'Wiring', quantity: 1 }], output: { key: 'PARTS_BOX', name: 'Vehicle repair kit', quantity: 1, footprint: { width: 1, height: 1 } }, turns: 3, requiresPower: true, unlockLevel: 2 },
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

export function craftingRecipes(): readonly Recipe[] { return RECIPES; }
export function workshopSkill(xp: number): number { return skillFromXp(xp); }

export const WorkshopService = {
  async page(prisma: PrismaClient, roundPlayerId: string): Promise<CraftingWorkshopDto> {
    const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { hideoutWorkshopLevel: true, workshopSkillXp: true, scavengedComponents: true } });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Player not found.');
    return { level: player.hideoutWorkshopLevel, skill: skillFromXp(player.workshopSkillXp), skillXp: player.workshopSkillXp, availableComponents: Object.entries(balances(player.scavengedComponents)).map(([key, quantity]) => ({ key, quantity })), recipes: RECIPES.map((recipe) => recipeDto(recipe, player.hideoutWorkshopLevel)) };
  },

  craft(prisma: PrismaClient, roundPlayerId: string, recipeKey: string, actionId?: string): Promise<import('@streets/shared').GameActionResult<CraftingResultDto>> {
    const recipe = RECIPES.find((candidate) => candidate.key === recipeKey);
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
        const stash = await StashService.page(tx, roundPlayerId);
        if (!canFitAdditionalStack(stash, recipe.output.key as Parameters<typeof canFitAdditionalStack>[1])) throw AppError.conflict('STASH_FULL', 'There is no room in the stash for this crafted output.');
        const components = balances(player.scavengedComponents);
        for (const ingredient of recipe.ingredients) if ((components[ingredient.key] ?? 0) < ingredient.quantity) throw AppError.badRequest('MISSING_CRAFTING_COMPONENTS', `You need more ${ingredient.name}.`);
        for (const ingredient of recipe.ingredients) components[ingredient.key] = (components[ingredient.key] ?? 0) - ingredient.quantity;
        const gain = player.workshopLastRecipe === recipe.key ? 3 : 10;
        const skillXp = (player.workshopSkillXp ?? 0) + gain;
        const outputField = LEGACY_FIELDS[recipe.output.key];
        if (!outputField) throw AppError.conflict('INVALID_CRAFTING_OUTPUT', 'That recipe has no valid stash output.');
        const next = { ...current, turns: current.turns - recipe.turns, [outputField]: Number(current[outputField] ?? 0) + recipe.output.quantity };
         await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { scavengedComponents: components as Prisma.InputJsonValue, workshopSkillXp: skillXp, workshopLastRecipe: recipe.key } });
         for (const ingredient of recipe.ingredients) await recordHideoutEconomy(tx, roundPlayerId, 'COMPONENT_SPENT', { itemKey: ingredient.key, quantity: ingredient.quantity, payload: { source: 'CRAFT', recipeKey: recipe.key } });
         await recordHideoutEconomy(tx, roundPlayerId, 'RECIPE_COMPLETED', { itemKey: recipe.output.key, quantity: recipe.output.quantity, payload: { recipeKey: recipe.key, turns: recipe.turns } });
          return { next, result: { recipe: recipeDto(recipe, current.hideoutWorkshopLevel), output: recipe.output, availableComponents: Object.entries(components).map(([key, quantity]) => ({ key, quantity })), skill: skillFromXp(skillXp), skillXp } };
      },
    });
  },
};
