import { describe, expect, it } from 'vitest';
import { craftingRecipes, workshopSkill } from '../workshop.service.js';

describe('hideout workshop crafting catalog', () => {
  it('publishes complete starter recipe metadata', () => {
    const recipes = craftingRecipes();
    expect(recipes).toHaveLength(5);
    expect(recipes.every((recipe) => recipe.ingredients.length > 0 && recipe.turns > 0 && recipe.output.quantity > 0)).toBe(true);

    const brew = recipes.find((recipe) => recipe.key === 'HOUSE_BREW');
    expect(brew).toMatchObject({ turns: 3, requiresPower: true, unlockLevel: 1, output: { key: 'BEER', quantity: 2 } });
    expect(brew?.ingredients.map((ingredient) => ingredient.key)).toEqual(['BOTTLES', 'LABELS', 'PACKAGING']);
  });

  it('uses diminishing returns for repeated workshop recipes', () => {
    expect(workshopSkill(0)).toBe(0);
    expect(workshopSkill(1)).toBe(10);
    expect(workshopSkill(25)).toBe(50);
    expect(workshopSkill(100)).toBe(100);
    expect(workshopSkill(10_000)).toBe(100);
  });
});
