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
  /**
   * What the contribution changes. Contributions with the same target share
   * their category's cap; without one, the whole category shares it.
   */
  readonly target?: string;
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
  /** Applied percent per target (contributions without a target are keyed by category). */
  readonly targets: Readonly<Record<string, number>>;
}

const CATEGORIES: readonly ModifierCategory[] = ['ECONOMY', 'COMBAT', 'COST', 'HEAT', 'RECOVERY', 'VEHICLE', 'LUCK'];

/**
 * Resolve in input order. A cap is shared by every source (skills, territory,
 * crew and items) changing the same target, and the last contribution is
 * clipped rather than making the result exceed the cap.
 */
export function resolveModifiers(
  contributions: readonly ModifierContribution[],
  caps: readonly ModifierCategoryCap[],
): ModifierResolution {
  const totals = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<ModifierCategory, number>;
  const targets: Record<string, number> = {};
  const resolved: ResolvedModifier[] = [];
  const capByCategory = new Map(caps.map((cap) => [cap.category, Math.max(0, cap.maxPercent)]));

  for (const contribution of contributions) {
    const cap = capByCategory.get(contribution.category);
    const requested = Number.isFinite(contribution.percent) ? contribution.percent : 0;
    const key = contribution.target ?? contribution.category;
    const before = targets[key] ?? 0;
    const after = cap === undefined ? before + requested : Math.max(-cap, Math.min(cap, before + requested));
    const applied = after - before;
    targets[key] = after;
    totals[contribution.category] += applied;
    resolved.push({ ...contribution, appliedPercent: applied, capped: applied !== requested });
  }

  return { modifiers: resolved, totals, targets };
}
