import { describe, expect, it } from 'vitest';
import type { PlayerQuestDto, ProductStockDto, ProductsDto, QuestPageDto } from '@streets/shared';
import { productAccessRows, recipeIdentity, recipeLadderRows, recipeNumbers, splitRecipes } from './recipes.js';

const quest = (key: string, title: string) => ({ key, title, giverName: 'Pip' });
const pip = (purchaseUnlocked: boolean, unlockQuest: ReturnType<typeof quest> | null = null) => ({
  buyCents: 3_000, sellCents: 900, market: {} as never, stock: 10, cap: 10, perInterval: 10, intervalMinutes: 30, nextAt: null, maxBuy: 10,
  purchaseUnlocked, unlockName: purchaseUnlocked ? null : 'Counter Access', unlockDescription: null, unlockQuest,
});
const recipe = (perThugPerTurn: number, ingredientCentsPerUnit: number, heatPerUnit: number, identity?: string) => ({
  perThugPerTurn, ingredientCentsPerUnit, heatPerUnit, ...(identity ? { identity } : {}),
});
const locked = (step: number, questKey: string, title: string) => ({
  unlocked: false, unlockName: 'Recipe', unlockDescription: 'A job opens it.', unlockQuest: quest(questKey, title), step, steps: 5,
});

const catalog: ProductsDto = {
  enabled: true,
  economy: true,
  products: [
    { key: 'CRACK', name: 'Crack', blurb: '', quantity: 120, pip: null, recipe: recipe(0.5, 500, 0, 'The starter.') },
    { key: 'WEED', name: 'Weed', blurb: '', quantity: 0, pip: pip(true), recipe: recipe(0.6, 420, 0.01), recipeAccess: locked(3, 'PIP_GREEN_THUMB', 'Green Thumb') },
    { key: 'ECSTASY', name: 'Ecstasy', blurb: '', quantity: 4, pip: pip(false, quest('PIP_PARTY_FAVORS', 'Party Favors')), recipe: recipe(0.15, 1_700, 0.1), recipeAccess: locked(1, 'PIP_PARTY_FAVORS', 'Party Favors') },
    { key: 'METH', name: 'Meth', blurb: '', quantity: 0, pip: pip(true), recipe: recipe(0.4, 800, 0.05), recipeAccess: { ...locked(2, 'PIP_BULK_ORDER', 'Bulk Order'), unlocked: true } },
    { key: 'HEROIN', name: 'Heroin', blurb: '', quantity: 0, pip: pip(true), recipe: null },
  ] as ProductStockDto[],
};

describe('Quest Recipe Unlocks D: recipe presentation', () => {
  it('puts cookable recipes in catalog order and locked ones in ladder order', () => {
    const { open, locked: waiting } = splitRecipes(catalog);
    expect(open.map((product) => product.key)).toEqual(['CRACK', 'METH']);
    expect(waiting.map((row) => [row.product.key, row.step, row.quest?.key])).toEqual([
      ['ECSTASY', 1, 'PIP_PARTY_FAVORS'],
      ['WEED', 3, 'PIP_GREEN_THUMB'],
    ]);
  });

  it('offers only Crack in a round without a product economy', () => {
    expect(splitRecipes({ ...catalog, economy: false })).toEqual({ open: [], locked: [] });
    expect(productAccessRows({ ...catalog, economy: false })).toEqual([]);
  });

  it('reads a recipe in numbers and in words', () => {
    expect(recipeNumbers(recipe(0.15, 1_700, 0.1))).toBe('0.15 a thug a turn · $17.00 each · +0.1 Heat each');
    expect(recipeNumbers(recipe(0.5, 500, 0))).toBe('0.5 a thug a turn · $5.00 each · no Heat');
    expect(recipeIdentity(recipe(0.5, 500, 0, 'The starter.'))).toBe('The starter.');
    // An older round's recipe has no words of its own; its numbers speak for it.
    expect(recipeIdentity(recipe(0.06, 2_800, 0.15))).toBe('Slow to cook, costly, and draws real Heat.');
    expect(recipeIdentity(recipe(0.6, 420, 0.01))).toBe('Quick to cook, cheap, and draws a little Heat.');
  });

  it('keeps buying and cooking apart for every product', () => {
    const rows = Object.fromEntries(productAccessRows(catalog).map((row) => [row.key, row]));
    expect(rows.CRACK).toMatchObject({ quantity: 120, buy: { state: 'open' }, cook: { state: 'open' } });
    // Weed: Pip sells it, but the recipe waits on a job.
    expect(rows.WEED).toMatchObject({ buy: { state: 'open' }, cook: { state: 'locked', step: 3, quest: { key: 'PIP_GREEN_THUMB' } } });
    // Ecstasy: both locked, each by its own unlock.
    expect(rows.ECSTASY).toMatchObject({ buy: { state: 'locked', unlockName: 'Counter Access', quest: { key: 'PIP_PARTY_FAVORS' } }, cook: { state: 'locked', step: 1 } });
    expect(rows.METH).toMatchObject({ buy: { state: 'open' }, cook: { state: 'open' } });
    expect(rows.HEROIN).toMatchObject({ buy: { state: 'open' }, cook: { state: 'none' } });
  });

  it('shows each rung of the ladder with its job state and what a locked one waits on', () => {
    const job = (key: string, status: PlayerQuestDto['status'], requires: PlayerQuestDto['requires'] = []) =>
      ({ key, title: key.replace('PIP_', ''), status, requires }) as unknown as PlayerQuestDto;
    const page = {
      recipeLadder: [
        { step: 1, questKey: 'PIP_PARTY_FAVORS', product: 'ECSTASY', productName: 'Ecstasy', identity: 'Value.' },
        { step: 2, questKey: 'PIP_BULK_ORDER', product: 'METH', productName: 'Meth', identity: null },
        { step: 3, questKey: 'PIP_GREEN_THUMB', product: 'WEED', productName: 'Weed', identity: null },
      ],
      quests: [
        job('PIP_PARTY_FAVORS', 'COMPLETED'),
        job('PIP_BULK_ORDER', 'ACTIVE'),
        job('PIP_GREEN_THUMB', 'LOCKED', [{ label: 'Complete “Bulk Order”', questKey: 'PIP_BULK_ORDER' }]),
      ],
    } satisfies Pick<QuestPageDto, 'recipeLadder' | 'quests'>;
    expect(recipeLadderRows(page).map((row) => [row.productName, row.state, row.requires.length])).toEqual([
      ['Ecstasy', 'OPEN', 0],
      ['Meth', 'WORKING', 0],
      ['Weed', 'LOCKED', 1],
    ]);
    expect(recipeLadderRows({ quests: [] })).toEqual([]);
  });
});
