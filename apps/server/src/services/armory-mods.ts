import type { IndividualItemsRules, IndividualItemModCost } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';

export type ArmoryItemKind = 'GUN' | 'VEHICLE';
export interface ArmoryModEntry { key: string; tier: number }
export interface ModTransition {
  mods: ArmoryModEntry[];
  partsSpent: number;
  partsRefunded: number;
  cashSpentCents: number;
}

export function itemModRule(catalog: IndividualItemsRules, kind: ArmoryItemKind, model: string) {
  const rule = kind === 'GUN'
    ? catalog.guns[model as keyof typeof catalog.guns]
    : catalog.vehicles[model as keyof typeof catalog.vehicles];
  if (!rule) throw AppError.badRequest('INVALID_ARMORY_MODEL', 'That equipment model is not in this round.');
  return rule;
}

export function normalizeMods(value: unknown): ArmoryModEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    return typeof row.key === 'string' && Number.isInteger(row.tier) ? [{ key: row.key, tier: row.tier as number }] : [];
  });
}

export function validateModSet(mods: readonly ArmoryModEntry[], rule: ReturnType<typeof itemModRule>): ArmoryModEntry[] {
  if (mods.length > rule.slots) throw AppError.badRequest('ARMORY_MOD_SLOTS_FULL', `That item has room for ${rule.slots} modifications.`);
  const keys = new Set<string>();
  const slots = new Set<string>();
  for (const mod of mods) {
    const definition = rule.mods.find((entry) => entry.key === mod.key);
    if (!definition || !definition.tiers.some((entry) => entry.tier === mod.tier)) {
      throw AppError.badRequest('INVALID_ARMORY_MOD', 'That modification or tier is not available for this item.');
    }
    if (keys.has(mod.key) || slots.has(definition.slot)) {
      throw AppError.badRequest('ARMORY_MOD_SLOT_OCCUPIED', 'Each modification slot can hold one mod. Remove or replace the installed mod first.');
    }
    keys.add(mod.key);
    slots.add(definition.slot);
  }
  return [...mods].sort((a, b) => a.key.localeCompare(b.key));
}

export function transitionModSet(
  current: readonly ArmoryModEntry[],
  desired: readonly ArmoryModEntry[],
  rule: ReturnType<typeof itemModRule>,
  costs: IndividualItemsRules['modCosts'],
): ModTransition {
  const before = validateModSet(current, rule);
  const after = validateModSet(desired, rule);
  const beforeByKey = new Map(before.map((mod) => [mod.key, mod]));
  const afterByKey = new Map(after.map((mod) => [mod.key, mod]));
  const costFor = (mod: ArmoryModEntry): IndividualItemModCost => costs[rule.size][mod.tier as 1 | 2 | 3];
  let partsSpent = 0;
  let partsRefunded = 0;
  let cashSpentCents = 0;
  for (const mod of after) {
    const existing = beforeByKey.get(mod.key);
    if (existing?.tier === mod.tier) continue;
    const cost = costFor(mod);
    partsSpent += cost.parts;
    cashSpentCents += cost.cashCents;
  }
  for (const mod of before) {
    const replacement = afterByKey.get(mod.key);
    if (replacement?.tier === mod.tier) continue;
    partsRefunded += Math.floor(costFor(mod).parts / 2);
  }
  return { mods: after, partsSpent, partsRefunded, cashSpentCents };
}
