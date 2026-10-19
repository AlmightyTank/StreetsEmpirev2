import { describe, expect, it } from 'vitest';
import { buildAdvisor, recommendAdvisor, shouldDeferAdvisor } from '../advisor.service.js';
import type { AdvisorSignalSnapshot } from '@streets/shared';
import { advisorFixtures } from './advisor.fixtures.js';

const base: AdvisorSignalSnapshot = {
  cashCents: 5000,
  turns: 10,
  turnCap: 20,
  crewSize: 4,
  heat: null,
  heatMax: null,
  products: null,
  holdingsAvailable: false,
  quest: null,
  paused: false,
  rules: { heat: false, holdings: false, quests: false },
};

describe('Empire Advisor', () => {
  it('is deterministic and only emits the capped owner-facing cards', () => {
    const snapshot = { ...base, turns: 0, products: [{ key: 'beer', quantity: 0 }] };
    const one = recommendAdvisor(snapshot, '2.3.0-A');
    const two = recommendAdvisor(snapshot, '2.3.0-A');
    expect(one).toEqual(two);
    expect(one.length).toBeLessThanOrEqual(3);
    expect(one.every((card) => !('enemy' in card) && !('rival' in card))).toBe(true);
  });

  it('drops disabled systems and keeps a closed snapshot empty', () => {
    expect(buildAdvisor(base, '2.3.0-A').suggestions).toEqual([]);
    expect(recommendAdvisor({ ...base, heat: 100, heatMax: 100 }, '2.3.0-A')).toEqual([]);
  });

  it('makes paused turn guidance informational instead of actionable', () => {
    const [card] = recommendAdvisor({ ...base, turns: 0, paused: true }, '2.3.0-A');
    expect(card).toMatchObject({ ruleId: 'turns-empty', actionable: false, href: null });
  });

  it('keeps focus presets as filters without changing the owner snapshot', () => {
    const snapshot = { ...base, products: [{ key: 'beer', quantity: 0 }], holdingsAvailable: true, rules: { ...base.rules, holdings: true } };
    expect(recommendAdvisor(snapshot, '2.3.0-A', 'quests')).toEqual([]);
    expect(recommendAdvisor(snapshot, '2.3.0-A', 'money').map((card) => card.ruleId)).toEqual(['supply-shortfall', 'affordable-holding']);
    expect(recommendAdvisor(snapshot, '2.3.0-A', 'territory').map((card) => card.ruleId)).toEqual(['affordable-holding']);
  });

  it('defers the briefing while the guided tour is active', () => {
    expect(shouldDeferAdvisor(true)).toBe(true);
    expect(shouldDeferAdvisor(false)).toBe(false);
  });

  it('drops heat, holdings, and quest advice when the active ruleset removes them', () => {
    const snapshot: AdvisorSignalSnapshot = {
      ...base,
      heat: 100,
      heatMax: 100,
      holdingsAvailable: true,
      quest: { key: 'daily-1', status: 'READY_TO_TURN_IN' },
      rules: { heat: false, holdings: false, quests: false },
    };
    expect(recommendAdvisor(snapshot, 'drifted-ruleset')).toEqual([]);
  });

  it('keeps fixture cards safe, capped, and clearable by silence', () => {
    for (const snapshot of Object.values(advisorFixtures)) {
      const cards = recommendAdvisor(snapshot, '2.3.0-A');
      expect(cards.length).toBeLessThanOrEqual(3);
      expect(cards.every((card) => card.actionable || card.kind === 'info')).toBe(true);
      expect(recommendAdvisor(snapshot, '2.3.0-A', 'balanced', new Set(cards.map((card) => card.key)))).toEqual([]);
    }
  });
});
