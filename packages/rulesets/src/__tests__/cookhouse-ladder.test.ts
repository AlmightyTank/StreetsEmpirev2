import { describe, expect, it } from 'vitest';
import { classicOgV17E } from '../classic-og-v1.7-e/index.js';
import { classicOgV17G } from '../classic-og-v1.7-g/index.js';
import { rulesets } from '../index.js';
import { questRequiredRecipes } from '../quest-definitions.js';
import type { QuestDefinition, QuestDefinitionCatalog, Ruleset } from '../types.js';

const quests: QuestDefinitionCatalog = classicOgV17G.questDefinitions;
const oldQuests: QuestDefinitionCatalog = classicOgV17E.questDefinitions;
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

describe('1.7.0-G Pip\'s Cookhouse Ladder', () => {
  it('ships as the newest ruleset on top of 1.7.0-E', () => {
    expect(classicOgV17G.meta).toEqual({ id: 'classic-og-v1.7-g', version: '1.7.0-G', name: 'Classic OG - Cookhouse Ladder' });
    expect(rulesets[classicOgV17G.meta.id]).toBe(classicOgV17G);
    expect(Object.values(rulesets).at(-1)).toBe(classicOgV17G);
  });

  it('starts a round with only Crack cookable and gates every other recipe', () => {
    const gates = recipeGates(classicOgV17G);
    expect([...gates.keys()].sort()).toEqual(['COCAINE', 'ECSTASY', 'HEROIN', 'METH', 'WEED']);
    expect(gates.has('CRACK')).toBe(false);
    const products: Ruleset['products'] = classicOgV17G.products;
    for (const product of gates.keys()) expect(products?.[product]?.economy?.production, product).toBeTruthy();
  });

  it('opens each recipe through exactly one Pip job, in ladder order', () => {
    const gates = recipeGates(classicOgV17G);
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
    const gates = recipeGates(classicOgV17G);
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
      if (ruleset === classicOgV17G) continue;
      expect(recipeGates(ruleset).size, ruleset.meta.id).toBe(0);
    }
    expect(oldQuests.PIP_BULK_ORDER!.objectives[0]!.params).toMatchObject({ where: { productType: 'METH' } });
    expect(oldQuests.PIP_PARTY_FAVORS!.objectives[0]!.params).toMatchObject({ where: { productType: 'ECSTASY' } });
  });

  it('changes nothing else from 1.7.0-E', () => {
    const { meta: _meta, products: _products, permanentUnlocks, questDefinitions: _quests, ...next } = classicOgV17G;
    const { meta: _baseMeta, products: _baseProducts, permanentUnlocks: baseUnlocks, questDefinitions: _baseQuests, ...base } = classicOgV17E;
    expect(next).toEqual(base);
    expect(permanentUnlocks).toMatchObject(baseUnlocks);
    const changed = Object.keys(quests).filter((key) => quests[key] !== oldQuests[key]);
    expect(changed.sort()).toEqual(['PIP_A_BETTER_CUT', 'PIP_BULK_ORDER', 'PIP_GREEN_THUMB', 'PIP_PARTY_FAVORS', 'PIP_RED_LEDGER']);
  });
});
