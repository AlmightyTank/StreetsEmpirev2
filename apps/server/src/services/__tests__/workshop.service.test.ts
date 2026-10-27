import { describe, expect, it } from 'vitest';
import { classicOgV26J } from '@streets/rulesets';
import { playerBoardPartBookCents } from '@streets/rules-engine';
import { salvagePrice } from '../salvage-yard.service.js';
import { componentStacksOpened, craftingRecipes, previewCraftComponents, workshopSkill } from '../workshop.service.js';

const STASH_OUTPUTS = new Set(['CONDOM', 'MEDICINE', 'BEER', 'AMMO_BOX', 'PARTS_BOX']);

function book(key: string): number {
  const cents = playerBoardPartBookCents(key, classicOgV26J);
  expect(cents, key).not.toBeNull();
  return cents!;
}

describe('hideout workshop crafting catalog', () => {
  it('publishes complete starter recipe metadata', () => {
    const recipes = craftingRecipes();
    expect(recipes).toHaveLength(16);
    expect(new Set(recipes.map((recipe) => recipe.key)).size).toBe(recipes.length);
    expect(recipes.every((recipe) => recipe.ingredients.length > 0 && recipe.turns > 0 && recipe.output.quantity > 0)).toBe(true);

    const brew = recipes.find((recipe) => recipe.key === 'HOUSE_BREW');
    expect(brew).toMatchObject({ kind: 'ASSEMBLE', turns: 3, requiresPower: true, unlockLevel: 1, output: { key: 'BEER', quantity: 2 } });
    expect(brew?.ingredients.map((ingredient) => ingredient.key)).toEqual(['BOTTLES', 'LABELS', 'PACKAGING']);

    const assembly = recipes.filter((recipe) => recipe.kind === 'ASSEMBLE');
    const breakdown = recipes.filter((recipe) => recipe.kind === 'DISASSEMBLE');
    expect(assembly.map((recipe) => recipe.key)).toEqual([
      'PREMIUM_CONDOMS', 'CORNER_WRAP', 'HOUSE_BREW', 'CRATE_BREW', 'FIELD_FIRST_AID', 'RAG_DRESSING', 'AMMO_BUNDLE', 'VEHICLE_REPAIR_KIT',
    ]);
    expect(breakdown.length).toBe(8);
    expect(assembly.every((recipe) => STASH_OUTPUTS.has(recipe.output.key) && recipe.partYields === undefined)).toBe(true);
  });

  it('breaks parts down into cheaper parts and does not refund a salvage-yard barter', () => {
    for (const recipe of craftingRecipes().filter((candidate) => candidate.kind === 'DISASSEMBLE')) {
      expect(recipe.partYields?.length).toBeGreaterThan(0);
      expect(recipe.output).toMatchObject({ key: recipe.partYields![0]!.key, quantity: recipe.partYields![0]!.quantity });
      expect(recipe.ingredients.every((ingredient) => !recipe.partYields!.some((line) => line.key === ingredient.key))).toBe(true);

      const spent = recipe.ingredients.reduce((sum, line) => sum + book(line.key) * line.quantity, 0);
      const returned = recipe.partYields!.reduce((sum, line) => sum + book(line.key) * line.quantity, 0);
      expect(returned, recipe.key).toBeLessThan(spent);

      const price = salvagePrice(recipe.ingredients[0]!.key, classicOgV26J);
      expect(price, recipe.key).not.toBeNull();
      if (price!.kind === 'BARTER') {
        const yields = new Map(recipe.partYields!.map((line) => [line.key, line.quantity]));
        expect(Object.entries(price!.components).some(([key, quantity]) => (yields.get(key) ?? 0) < quantity), recipe.key).toBe(true);
      } else {
        const yieldCash = recipe.partYields!.reduce((sum, line) => {
          const linePrice = salvagePrice(line.key);
          return sum + (linePrice?.kind === 'CASH' ? linePrice.cents * line.quantity : Number.POSITIVE_INFINITY);
        }, 0);
        expect(yieldCash, recipe.key).toBeLessThan(price!.cents * recipe.ingredients[0]!.quantity);
      }
    }
  });

  it('moves component stacks when a part is stripped', () => {
    const motor = craftingRecipes().find((recipe) => recipe.key === 'STRIP_MOTOR')!;
    expect(previewCraftComponents({ RADIO: 1 }, motor)).toBeNull();
    expect(previewCraftComponents({ MOTOR_ASSEMBLY: 1, WIRING: 1 }, motor)).toEqual({ SCRAP_METAL: 2, WIRING: 2 });
    const stripped = previewCraftComponents({ MOTOR_ASSEMBLY: 1 }, motor)!;
    expect(stripped).toEqual({ SCRAP_METAL: 2, WIRING: 1 });
    expect(componentStacksOpened({ MOTOR_ASSEMBLY: 1 }, stripped)).toEqual({ removed: 1, added: 2 });
    expect(componentStacksOpened({ MOTOR_ASSEMBLY: 1, SCRAP_METAL: 3, WIRING: 1 }, previewCraftComponents({ MOTOR_ASSEMBLY: 1, SCRAP_METAL: 3, WIRING: 1 }, motor)!)).toEqual({ removed: 1, added: 0 });

    const wrap = craftingRecipes().find((recipe) => recipe.key === 'CORNER_WRAP')!;
    expect(previewCraftComponents({ LABELS: 1, PACKAGING: 2, CLOTH: 1 }, wrap)).toEqual({ PACKAGING: 1 });
  });

  it('uses diminishing returns for repeated workshop recipes', () => {
    expect(workshopSkill(0)).toBe(0);
    expect(workshopSkill(1)).toBe(10);
    expect(workshopSkill(25)).toBe(50);
    expect(workshopSkill(100)).toBe(100);
    expect(workshopSkill(10_000)).toBe(100);
  });
});
