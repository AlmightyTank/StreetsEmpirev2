import { rulesets, type Ruleset } from '@streets/rulesets';
import type { AdminRulesetOptionDto, AdminRulesetRowDto, AdminRulesetViewDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';

const option = (ruleset: Ruleset): AdminRulesetOptionDto => ({ id: ruleset.meta.id, version: ruleset.meta.version, name: ruleset.meta.name });

/**
 * Every leaf of a ruleset as a dotted path and a JSON value. Arrays of plain
 * values stay one row (a cost ladder reads better whole); arrays of objects
 * are split by index.
 */
export function flattenRuleset(value: unknown, path = ''): Map<string, string> {
  const rows = new Map<string, string>();
  const walk = (node: unknown, at: string) => {
    if (Array.isArray(node)) {
      if (node.every((item) => item === null || typeof item !== 'object')) {
        rows.set(at, JSON.stringify(node));
        return;
      }
      node.forEach((item, index) => walk(item, `${at}[${index}]`));
      return;
    }
    if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) walk(child, at ? `${at}.${key}` : key);
      return;
    }
    rows.set(at, JSON.stringify(node));
  };
  walk(value, path);
  return rows;
}

export const AdminRulesetService = {
  /** One ruleset's numbers, grouped by top-level section, optionally diffed against another. */
  view(rulesetId: string, compareToId?: string): AdminRulesetViewDto {
    const ruleset = rulesets[rulesetId];
    if (!ruleset) throw AppError.notFound('RULESET_NOT_FOUND', 'That ruleset does not exist.');
    const compareTo = compareToId ? rulesets[compareToId] : undefined;
    if (compareToId && !compareTo) throw AppError.notFound('RULESET_NOT_FOUND', 'The ruleset to compare against does not exist.');

    const { meta: _meta, ...body } = ruleset;
    const base = flattenRuleset(body);
    const other = compareTo ? flattenRuleset((({ meta: _otherMeta, ...rest }) => rest)(compareTo)) : null;
    const paths = [...new Set([...base.keys(), ...(other ? other.keys() : [])])].sort();

    const sections = new Map<string, AdminRulesetRowDto[]>();
    for (const path of paths) {
      const key = path.split(/[.[]/)[0]!;
      const value = base.get(path) ?? null;
      const compareValue = other ? other.get(path) ?? null : null;
      const row: AdminRulesetRowDto = { path, value, compareValue, changed: Boolean(other) && value !== compareValue };
      sections.set(key, [...(sections.get(key) ?? []), row]);
    }

    const grouped = [...sections.entries()].map(([key, rows]) => ({ key, rows, changed: rows.filter((row) => row.changed).length }));
    return {
      ruleset: option(ruleset),
      compareTo: compareTo ? option(compareTo) : null,
      rulesets: Object.values(rulesets).map(option).reverse(),
      sections: grouped,
      changedCount: grouped.reduce((total, section) => total + section.changed, 0),
    };
  },
};
