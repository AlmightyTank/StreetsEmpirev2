import { DEFAULT_RULESET_ID, rulesets, type Ruleset } from '@streets/rulesets';

export class RulesetNotFoundError extends Error {
  constructor(public readonly rulesetId: string) {
    super(`Unknown ruleset "${rulesetId}".`);
    this.name = 'RulesetNotFoundError';
  }
}

export class RulesetVersionMismatchError extends Error {
  constructor(
    public readonly rulesetId: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `Ruleset "${rulesetId}" is version ${actual}, but ${expected} was requested.`,
    );
    this.name = 'RulesetVersionMismatchError';
  }
}

export function isKnownRulesetId(id: string): boolean {
  return Object.hasOwn(rulesets, id);
}

export function listRulesets(): Ruleset[] {
  return Object.values(rulesets);
}

/**
 * Resolve a ruleset by id, optionally asserting the version a round was
 * created against. A round that pins a version the code no longer ships must
 * fail loudly rather than quietly play by different numbers.
 */
export function loadRuleset(rulesetId: string, rulesetVersion?: string): Ruleset {
  const ruleset = Object.hasOwn(rulesets, rulesetId) ? rulesets[rulesetId] : undefined;
  if (!ruleset) throw new RulesetNotFoundError(rulesetId);

  if (rulesetVersion && ruleset.meta.version !== rulesetVersion) {
    throw new RulesetVersionMismatchError(
      rulesetId,
      rulesetVersion,
      ruleset.meta.version,
    );
  }

  return ruleset;
}

export interface RulesetBearer {
  rulesetId: string;
  rulesetVersion: string;
}

/** Convenience for the common case: load the ruleset a Round was created with. */
export function loadRulesetForRound(round: RulesetBearer): Ruleset {
  return loadRuleset(round.rulesetId, round.rulesetVersion);
}

export { DEFAULT_RULESET_ID };
