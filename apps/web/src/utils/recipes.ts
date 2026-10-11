import { formatCentsExact, formatNumber, type PlayerQuestDto, type ProductStockDto, type ProductsDto, type QuestLinkDto, type QuestPageDto, type QuestRequirementDto } from '@streets/shared';

/**
 * Quest Recipe Unlocks D. How recipes and product permissions read on Produce and at Pip's
 * counter. Buying a product from Pip and cooking it are separate permissions, so they are
 * worked out (and shown) separately.
 */

type Recipe = NonNullable<ProductStockDto['recipe']>;

/** "0.5 a thug a turn · $5.00 each · no Heat". */
export function recipeNumbers(recipe: Recipe): string {
  const heat = recipe.heatPerUnit > 0 ? `+${formatNumber(recipe.heatPerUnit)} Heat each` : 'no Heat';
  return `${formatNumber(recipe.perThugPerTurn)} a thug a turn · ${formatCentsExact(recipe.ingredientCentsPerUnit)} each · ${heat}`;
}

/**
 * The recipe's identity in a line. The ruleset's own words where it has them; otherwise a
 * reading of the numbers, so an older round still says what a cook is like.
 */
export function recipeIdentity(recipe: Recipe): string {
  if (recipe.identity) return recipe.identity;
  const pace = recipe.perThugPerTurn >= 0.5 ? 'Quick to cook' : recipe.perThugPerTurn >= 0.2 ? 'Steady to cook' : 'Slow to cook';
  const cost = recipe.ingredientCentsPerUnit >= 2_000 ? 'costly' : recipe.ingredientCentsPerUnit >= 1_000 ? 'pricey' : 'cheap';
  const heat = recipe.heatPerUnit >= 0.1 ? 'draws real Heat' : recipe.heatPerUnit > 0 ? 'draws a little Heat' : 'draws no Heat';
  return `${pace}, ${cost}, and ${heat}.`;
}

export interface LockedRecipe {
  product: ProductStockDto;
  recipe: Recipe;
  quest: QuestLinkDto | null;
  unlockName: string;
  unlockDescription: string;
  /** The recipe's rung on the ladder, from 1, and the ladder's length, when the round has one. */
  step: number | null;
  steps: number | null;
}

/** Recipes the player can cook now, in catalog order, and the ones still locked, in ladder order. */
export function splitRecipes(catalog: ProductsDto | null): { open: ProductStockDto[]; locked: LockedRecipe[] } {
  if (!catalog?.economy) return { open: [], locked: [] };
  const cookable = catalog.products.filter((product) => product.recipe);
  const open = cookable.filter((product) => product.recipeAccess?.unlocked !== false);
  const locked = cookable
    .filter((product) => product.recipeAccess?.unlocked === false)
    .map((product): LockedRecipe => ({
      product,
      recipe: product.recipe!,
      quest: product.recipeAccess!.unlockQuest,
      unlockName: product.recipeAccess!.unlockName,
      unlockDescription: product.recipeAccess!.unlockDescription,
      step: product.recipeAccess!.step ?? null,
      steps: product.recipeAccess!.steps ?? null,
    }))
    .sort((left, right) => (left.step ?? Infinity) - (right.step ?? Infinity) || left.product.name.localeCompare(right.product.name));
  return { open, locked };
}

export type AccessState =
  | { state: 'open' }
  | { state: 'locked'; unlockName: string; quest: QuestLinkDto | null; step?: number | null }
  /** Pip does not deal it, or the round has no recipe for it. */
  | { state: 'none' };

export interface ProductAccessRow {
  key: string;
  name: string;
  quantity: number;
  buy: AccessState;
  cook: AccessState;
}

/**
 * One row per product: what you hold, whether Pip sells it to you, and whether you can cook
 * it. Crack is bought as Pip's Product on the shelf beside these, so buying it is always open.
 */
export function productAccessRows(catalog: ProductsDto | null): ProductAccessRow[] {
  if (!catalog?.economy) return [];
  return catalog.products.map((product) => {
    const pip = product.pip;
    const buy: AccessState = product.key === 'CRACK'
      ? { state: 'open' }
      : !pip
        ? { state: 'none' }
        : pip.purchaseUnlocked
          ? { state: 'open' }
          : { state: 'locked', unlockName: pip.unlockName ?? `${product.name} purchases`, quest: pip.unlockQuest ?? null };
    const cook: AccessState = !product.recipe
      ? { state: 'none' }
      : product.recipeAccess?.unlocked === false
        ? { state: 'locked', unlockName: product.recipeAccess.unlockName, quest: product.recipeAccess.unlockQuest, step: product.recipeAccess.step ?? null }
        : { state: 'open' };
    return { key: product.key, name: product.name, quantity: product.quantity, buy, cook };
  });
}

export interface RecipeLadderRow {
  step: number;
  product: string;
  productName: string;
  identity: string | null;
  questKey: string;
  questTitle: string;
  /** OPEN: the recipe is yours. WORKING: its job is taken. READY: collect it. AVAILABLE: the job is on the board. LOCKED: waiting on `requires`. */
  state: 'OPEN' | 'READY' | 'WORKING' | 'AVAILABLE' | 'LOCKED';
  requires: QuestRequirementDto[];
}

/** Quest Recipe Unlocks D. The recipe ladder with each rung's job state, for the progression desk. */
export function recipeLadderRows(page: Pick<QuestPageDto, 'recipeLadder' | 'quests'> | null): RecipeLadderRow[] {
  if (!page?.recipeLadder?.length) return [];
  const byKey = new Map<string, PlayerQuestDto>(page.quests.map((quest) => [quest.key, quest]));
  return page.recipeLadder.map((rung) => {
    const quest = byKey.get(rung.questKey);
    const status = quest?.status ?? 'LOCKED';
    const state: RecipeLadderRow['state'] = status === 'COMPLETED' ? 'OPEN'
      : status === 'READY_TO_TURN_IN' ? 'READY'
        : status === 'ACTIVE' ? 'WORKING'
          : status === 'AVAILABLE' ? 'AVAILABLE'
            : 'LOCKED';
    return {
      step: rung.step,
      product: rung.product,
      productName: rung.productName,
      identity: rung.identity,
      questKey: rung.questKey,
      questTitle: quest?.title ?? rung.questKey,
      state,
      requires: state === 'LOCKED' ? quest?.requires ?? [] : [],
    };
  });
}
