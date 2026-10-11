import { describe, expect, it } from 'vitest';
import { classicOgV18E } from '../classic-og-v1.8-e/index.js';
import { classicOgV18F } from '../classic-og-v1.8-f/index.js';
import { classicOgV18H } from '../classic-og-v1.8-h/index.js';
import { classicOgV18I } from '../classic-og-v1.8-i/index.js';
import { classicOgV18J } from '../classic-og-v1.8-j/index.js';
import { classicOgV18K } from '../classic-og-v1.8-k/index.js';
import { classicOgV18L } from '../classic-og-v1.8-l/index.js';
import { classicOgV18M } from '../classic-og-v1.8-m/index.js';
import { classicOgV18G } from '../classic-og-v1.8-g/index.js';
import { rulesets } from '../index.js';
import { questRequiredRecipes } from '../quest-definitions.js';
import { advanceQuestObjective } from '../quest-progress.js';
import type { QuestDefinition, QuestDefinitionCatalog, Ruleset } from '../types.js';

const quests: QuestDefinitionCatalog = classicOgV18F.questDefinitions;
const oldQuests: QuestDefinitionCatalog = classicOgV18E.questDefinitions;
const LADDER = [
  ['PIP_PARTY_FAVORS', 'ECSTASY'],
  ['PIP_BULK_ORDER', 'METH'],
  ['PIP_GREEN_THUMB', 'WEED'],
  ['PIP_A_BETTER_CUT', 'COCAINE'],
  ['PIP_RED_LEDGER', 'HEROIN'],
] as const;

function recipeGates(ruleset: Ruleset): Map<string, string> {
  const gates = new Map<string, string>();
  for (const unlock of Object.values(ruleset.permanentUnlocks ?? {})) {
    if (unlock.effect.kind === 'PRODUCT_PRODUCTION_ACCESS') gates.set(unlock.effect.productKey, unlock.key);
  }
  return gates;
}

function grantingQuests(unlockKey: string): QuestDefinition[] {
  return Object.values(quests).filter((quest) =>
    quest.rewards.some((reward) => reward.kind === 'PERMANENT_UNLOCK' && reward.key === unlockKey));
}

/** Every quest a job needs finished first, directly or through its own prerequisites. */
function requiredQuests(quest: QuestDefinition, seen = new Set<string>()): Set<string> {
  for (const prerequisite of quest.prerequisites) {
    const key = prerequisite.params?.questKey;
    if (prerequisite.kind !== 'QUEST_COMPLETED' || typeof key !== 'string' || seen.has(key)) continue;
    seen.add(key);
    requiredQuests(quests[key]!, seen);
  }
  return seen;
}

describe('1.8.0-F Pip\'s Cookhouse Ladder', () => {
  it('ships as the newest ruleset on top of 1.8.0-E', () => {
    expect(classicOgV18F.meta).toEqual({ id: 'classic-og-v1.8-f', version: '1.8.0-F', name: 'Classic OG - Cookhouse Ladder' });
    expect(rulesets[classicOgV18F.meta.id]).toBe(classicOgV18F);
    expect(rulesets[classicOgV18H.meta.id]).toBe(classicOgV18H);
    expect(rulesets[classicOgV18I.meta.id]).toBe(classicOgV18I);
  });

  it('starts a round with only Crack cookable and gates every other recipe', () => {
    const gates = recipeGates(classicOgV18F);
    expect([...gates.keys()].sort()).toEqual(['COCAINE', 'ECSTASY', 'HEROIN', 'METH', 'WEED']);
    expect(gates.has('CRACK')).toBe(false);
    const products: Ruleset['products'] = classicOgV18F.products;
    for (const product of gates.keys()) expect(products?.[product]?.economy?.production, product).toBeTruthy();
  });

  it('opens each recipe through exactly one Pip job, in ladder order', () => {
    const gates = recipeGates(classicOgV18F);
    let previous = 'COOKHOUSE';
    for (const [questKey, product] of LADDER) {
      const granting = grantingQuests(gates.get(product)!);
      expect(granting.map((quest) => quest.key), product).toEqual([questKey]);
      const quest = quests[questKey]!;
      expect(quest.contactKey).toBe('PIP');
      expect(quest.repeatability).toBe('ONCE');
      expect(quest.prerequisites).toContainEqual({ kind: 'QUEST_COMPLETED', params: { questKey: previous } });
      previous = questKey;
    }
  });

  it('asks Pip rep 12 for the first rung, down from 25', () => {
    expect(oldQuests.PIP_PARTY_FAVORS!.prerequisites).toContainEqual({ kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'PIP', points: 25 } });
    expect(quests.PIP_PARTY_FAVORS!.prerequisites).toEqual([
      { kind: 'QUEST_COMPLETED', params: { questKey: 'COOKHOUSE' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'PIP', points: 12 } },
    ]);
  });

  it('keeps purchase access a separate reward on Party Favors and Bulk Order', () => {
    const unlocks = (key: string) => quests[key]!.rewards.flatMap((reward) => reward.kind === 'PERMANENT_UNLOCK' && reward.key ? [reward.key] : []);
    expect(unlocks('PIP_PARTY_FAVORS')).toEqual(['PRODUCT_ECSTASY_ACCESS', 'PRODUCT_ECSTASY_RECIPE']);
    expect(unlocks('PIP_BULK_ORDER')).toEqual(['PRODUCT_METH_ACCESS', 'PRODUCT_METH_RECIPE']);
    for (const key of ['PIP_GREEN_THUMB', 'PIP_A_BETTER_CUT', 'PIP_RED_LEDGER']) {
      expect(unlocks(key).every((unlock) => unlock.endsWith('_RECIPE')), key).toBe(true);
    }
  });

  it('pays no free stock, ingredients or crew on a ladder job', () => {
    for (const [questKey] of LADDER) {
      const kinds = quests[questKey]!.rewards.map((reward) => reward.kind);
      expect(kinds, questKey).not.toContain('ITEM');
      expect(kinds, questKey).not.toContain('PRODUCT');
    }
  });

  it('never asks a player to cook a product before its recipe can be open', () => {
    const gates = recipeGates(classicOgV18F);
    for (const quest of Object.values(quests)) {
      const needed = questRequiredRecipes(quest).filter((product) => gates.has(product));
      if (!needed.length) continue;
      // The daily board deals around locked recipes; every other kind of job must wait for the rung.
      if (quest.type === 'DAILY') continue;
      expect(quest.repeatability, quest.key).toBe('ONCE');
      const before = requiredQuests(quest);
      for (const product of needed) {
        const granting = grantingQuests(gates.get(product)!).map((row) => row.key);
        expect(granting.some((key) => before.has(key)), `${quest.key} cooks ${product}`).toBe(true);
      }
    }
  });

  it('leaves every earlier ruleset ungated', () => {
    for (const ruleset of Object.values(rulesets) as Ruleset[]) {
      if (ruleset === classicOgV18F || ruleset === classicOgV18G || ruleset === classicOgV18H || ruleset === classicOgV18I || ruleset === classicOgV18J || ruleset === classicOgV18K || ruleset === classicOgV18L || ruleset === classicOgV18M) continue;
      expect(recipeGates(ruleset).size, ruleset.meta.id).toBe(0);
    }
    expect(oldQuests.PIP_BULK_ORDER!.objectives[0]!.params).toMatchObject({ where: { productType: 'METH' } });
    expect(oldQuests.PIP_PARTY_FAVORS!.objectives[0]!.params).toMatchObject({ where: { productType: 'ECSTASY' } });
  });

  it('changes nothing else from 1.8.0-E', () => {
    const { meta: _meta, products: _products, permanentUnlocks, questDefinitions: _quests, ...next } = classicOgV18F;
    const { meta: _baseMeta, products: _baseProducts, permanentUnlocks: baseUnlocks, questDefinitions: _baseQuests, ...base } = classicOgV18E;
    expect(next).toEqual(base);
    expect(permanentUnlocks).toMatchObject(baseUnlocks);
    const changed = Object.keys(quests).filter((key) => quests[key] !== oldQuests[key]);
    expect(changed.sort()).toEqual(['PIP_A_BETTER_CUT', 'PIP_BULK_ORDER', 'PIP_GREEN_THUMB', 'PIP_PARTY_FAVORS', 'PIP_RED_LEDGER']);
  });
});

describe('1.8.0-M recipe balance', () => {
  it('ships as the newest ruleset on top of 1.8.0-L', () => {
    expect(classicOgV18M.meta).toMatchObject({ id: 'classic-og-v1.8-m', version: '1.8.0-M', name: 'Classic OG - Recipe Balance' });
    expect(rulesets[classicOgV18M.meta.id]).toBe(classicOgV18M);
    expect(Object.values(rulesets).at(-1)).toBe(classicOgV18M);
  });

  it('keeps the ladder, its gates and its unlocks from 1.8.0-F', () => {
    expect(recipeGates(classicOgV18M)).toEqual(recipeGates(classicOgV18F));
    expect(classicOgV18M.permanentUnlocks).toBe(classicOgV18L.permanentUnlocks);
  });

  it('changes only the five recipes and A Better Cut from 1.8.0-L', () => {
    const { meta: _meta, products, questDefinitions: next, ...rest } = classicOgV18M;
    const { meta: _baseMeta, products: baseProducts, questDefinitions: base, ...baseRest } = classicOgV18L;
    expect(rest).toEqual(baseRest);
    const changedProducts = Object.keys(products).filter((key) => products[key as keyof typeof products] !== baseProducts[key as keyof typeof baseProducts]);
    expect(changedProducts.sort()).toEqual(['COCAINE', 'CRACK', 'ECSTASY', 'HEROIN', 'METH', 'WEED']);
    for (const key of changedProducts) {
      // Only the recipe and its one-line identity (Slice D) change.
      const { economy, recipeIdentity, ...product } = products[key as keyof typeof products] as { economy?: { production: unknown }; recipeIdentity?: string };
      const { economy: baseEconomy, ...baseProduct } = baseProducts[key as keyof typeof baseProducts] as { economy?: { production: unknown } };
      expect(product, key).toEqual(baseProduct);
      expect(recipeIdentity, key).toBeTruthy();
      if (economy) expect({ ...economy, production: null }, key).toEqual({ ...baseEconomy, production: null });
    }
    const nextQuests: QuestDefinitionCatalog = next;
    const baseQuests: QuestDefinitionCatalog = base;
    expect(Object.keys(nextQuests).filter((key) => nextQuests[key] !== baseQuests[key])).toEqual(['PIP_A_BETTER_CUT']);
    expect(nextQuests.PIP_A_BETTER_CUT!.objectives.map((objective) => objective.id)).toEqual(['sell_meth', 'sell_ecstasy']);
    expect(nextQuests.PIP_A_BETTER_CUT!.rewards).toEqual(baseQuests.PIP_A_BETTER_CUT!.rewards);
  });
});

describe('Quest Recipe Unlocks E: the first rung is reachable on Crack alone', () => {
  const ruleset: Ruleset = classicOgV18M;
  const catalog: QuestDefinitionCatalog = ruleset.questDefinitions!;
  const pipRep = (quest: QuestDefinition) => quest.rewards.reduce((sum, reward) =>
    sum + (reward.kind === 'CONTACT_REP' && reward.key === 'PIP' ? reward.amount ?? 0 : 0), 0);
  /** A job a player with only Crack can finish: it cooks nothing else and sells nothing else by name. */
  const crackOnly = (quest: QuestDefinition) => quest.objectives.every((objective) => {
    const where = (objective.params?.where ?? {}) as Record<string, unknown>;
    const cooks = typeof where.productType === 'string' ? where.productType : null;
    const sells = typeof where.product === 'string' ? where.product : null;
    return (cooks === null || cooks === 'CRACK') && (sells === null || sells === 'CRACK');
  });

  it('leaves a player two Pip rep short after Cookhouse, which one Crack-only Pip daily covers', () => {
    const threshold = catalog.PIP_PARTY_FAVORS!.prerequisites.find((row) => row.kind === 'CONTACT_REP_AT_LEAST')!.params!.points as number;
    expect(threshold).toBe(12);
    // Pip rep starts at zero; Cookhouse is the tutorial's only Pip job.
    expect(pipRep(catalog.COOKHOUSE!)).toBe(10);
    const dailies = Object.values(catalog).filter((quest) => quest.type === 'DAILY' && quest.contactKey === 'PIP' && crackOnly(quest));
    expect(dailies.map((quest) => quest.key).sort()).toEqual(expect.arrayContaining(['DAILY_COOK_ORDER', 'DAILY_COUNTER_CASH', 'DAILY_CRACK_BATCH', 'DAILY_MOVE_PRODUCT']));
    for (const daily of dailies) expect(pipRep(catalog.COOKHOUSE!) + pipRep(daily), daily.key).toBeGreaterThanOrEqual(threshold);
    expect(questRequiredRecipes(catalog.PIP_PARTY_FAVORS!)).toEqual(['CRACK']);
  });
});

describe('Quest Recipe Unlocks E: objective progress from old and new events', () => {
  const catalog: QuestDefinitionCatalog = classicOgV18M.questDefinitions!;
  const objective = (quest: string, id: string) => catalog[quest]!.objectives.find((row) => row.id === id)!;

  it('counts a cook toward its own product only, and every cook toward an any-product job', () => {
    const ecstasyCook = { type: 'PRODUCE_CRACK', payload: { productType: 'ECSTASY', product: 30, crack: 0 } };
    const crackCook = { type: 'PRODUCE_CRACK', payload: { productType: 'CRACK', product: 40, crack: 40 } };
    expect(advanceQuestObjective(objective('PIP_BULK_ORDER', 'cook_ecstasy'), ecstasyCook).amount).toBe(30);
    expect(advanceQuestObjective(objective('PIP_BULK_ORDER', 'cook_ecstasy'), crackCook).matched).toBe(false);
    expect(advanceQuestObjective(objective('PIP_PARTY_FAVORS', 'cook_crack'), crackCook).amount).toBe(40);
    expect(advanceQuestObjective(objective('DAILY_COOK_ORDER', 'produce_product'), ecstasyCook).amount).toBe(30);
    expect(advanceQuestObjective(objective('DAILY_COOK_ORDER', 'produce_product'), crackCook).amount).toBe(40);
  });

  it('still counts an event written before products were named toward jobs that ask for no product', () => {
    // Before 0.4.0-D a cook carried no productType and a Pip sale no product key.
    const legacyCook = { type: 'PRODUCE_CRACK', payload: { product: 25, crack: 25 } };
    const legacySale = { type: 'STORE_SELL', payload: { storeKey: 'PIP', item: 'Product', itemKey: 'CRACK', quantity: 20, totalCents: 6_000 } };
    expect(advanceQuestObjective(objective('DAILY_COOK_ORDER', 'produce_product'), legacyCook).amount).toBe(25);
    expect(advanceQuestObjective(objective('DAILY_MOVE_PRODUCT', 'sell_product'), legacySale).amount).toBe(20);
    // A job that names a product needs the product on the event, so a legacy event cannot open a recipe.
    expect(advanceQuestObjective(objective('PIP_PARTY_FAVORS', 'cook_crack'), legacyCook).matched).toBe(false);
    expect(advanceQuestObjective(objective('PIP_PARTY_FAVORS', 'sell_crack'), legacySale).matched).toBe(false);
  });

  it('counts a Pip sale by its product key for the ladder', () => {
    const sale = { type: 'STORE_SELL', payload: { storeKey: 'PIP', item: 'Crack', itemKey: 'CRACK', product: 'CRACK', quantity: 100, totalCents: 30_000 } };
    expect(advanceQuestObjective(objective('PIP_PARTY_FAVORS', 'sell_crack'), sale).amount).toBe(100);
    expect(advanceQuestObjective(objective('PIP_A_BETTER_CUT', 'sell_ecstasy'), sale).matched).toBe(false);
  });
});
