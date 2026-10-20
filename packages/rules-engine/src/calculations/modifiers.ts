/** Shared, deterministic passive-modifier resolution. */

export type ModifierCategory =
  | 'ECONOMY'
  | 'COMBAT'
  | 'COST'
  | 'HEAT'
  | 'RECOVERY'
  | 'VEHICLE'
  | 'LUCK';

export interface ModifierContribution {
  readonly effectId: string;
  readonly category: ModifierCategory;
  /** Percentage points. Cost reductions and penalties are negative. */
  readonly percent: number;
  readonly sourceId: string;
  readonly label: string;
}

export interface ModifierCategoryCap {
  readonly category: ModifierCategory;
  /** Maximum absolute percentage points in this category. */
  readonly maxPercent: number;
}

export interface ResolvedModifier extends ModifierContribution {
  readonly appliedPercent: number;
  readonly capped: boolean;
}

export interface ModifierResolution {
  readonly modifiers: readonly ResolvedModifier[];
  readonly totals: Readonly<Record<ModifierCategory, number>>;
}

const CATEGORIES: readonly ModifierCategory[] = ['ECONOMY', 'COMBAT', 'COST', 'HEAT', 'RECOVERY', 'VEHICLE', 'LUCK'];

/**
 * Resolve in input order. A category cap is shared by every source (skills,
 * territory, crew and items), and the last contribution is clipped rather
 * than making the result exceed the cap.
 */
export function resolveModifiers(
  contributions: readonly ModifierContribution[],
  caps: readonly ModifierCategoryCap[],
): ModifierResolution {
  const totals = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<ModifierCategory, number>;
  const resolved: ResolvedModifier[] = [];
  const capByCategory = new Map(caps.map((cap) => [cap.category, Math.max(0, cap.maxPercent)]));

  for (const contribution of contributions) {
    const cap = capByCategory.get(contribution.category);
    const requested = Number.isFinite(contribution.percent) ? contribution.percent : 0;
    const before = totals[contribution.category];
    const target = cap === undefined ? before + requested : Math.max(-cap, Math.min(cap, before + requested));
    const applied = target - before;
    totals[contribution.category] = target;
    resolved.push({ ...contribution, appliedPercent: applied, capped: applied !== requested });
  }

  return { modifiers: resolved, totals };
}
