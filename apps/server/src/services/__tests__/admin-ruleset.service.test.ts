import { describe, expect, it } from 'vitest';
import { AdminRulesetService, flattenRuleset } from '../admin-ruleset.service.js';

describe('flattenRuleset', () => {
  it('keeps plain arrays whole and splits nested objects into dotted paths', () => {
    const rows = flattenRuleset({ turns: { cap: 144 }, costs: [1, 2, 3], stores: [{ key: 'CORNER' }], flag: false });
    expect(Object.fromEntries(rows)).toEqual({
      'turns.cap': '144',
      costs: '[1,2,3]',
      'stores[0].key': '"CORNER"',
      flag: 'false',
    });
  });
});

describe('AdminRulesetService.view', () => {
  it('groups by section and finds only the favours changed between 0.3.0-A and 0.3.0-B', () => {
    const view = AdminRulesetService.view('classic-og-v0.3-b', 'classic-og-v0.3-a');
    expect(view.ruleset.id).toBe('classic-og-v0.3-b');
    expect(view.compareTo?.id).toBe('classic-og-v0.3-a');
    expect(view.changedCount).toBeGreaterThan(0);
    expect(view.sections.filter((section) => section.changed > 0).map((section) => section.key)).toEqual(['quests']);
    expect(view.sections.map((section) => section.key)).toContain('turns');
    expect(view.sections.some((section) => section.key === 'meta')).toBe(false);
  });

  it('marks values that differ, including sections only one ruleset has', () => {
    const view = AdminRulesetService.view('classic-og-v0.3-a', 'classic-og-v0.2-h');
    expect(view.changedCount).toBeGreaterThan(0);
    const hideout = view.sections.find((section) => section.key === 'hideout');
    expect(hideout?.changed).toBeGreaterThan(0);
    expect(hideout?.rows.every((row) => row.compareValue === null)).toBe(true);
  });

  it('refuses unknown rulesets', () => {
    expect(() => AdminRulesetService.view('nope')).toThrow('That ruleset does not exist.');
    expect(() => AdminRulesetService.view('classic-og-v0.3-b', 'nope')).toThrow('The ruleset to compare against does not exist.');
  });
});
