import { describe, expect, it } from 'vitest';
import { advanceQuestObjective, applyQuestProgress } from '../quest-progress.js';
import type { QuestObjectiveDefinition } from '../types.js';

const objective = (overrides: Partial<QuestObjectiveDefinition> = {}): QuestObjectiveDefinition => ({
  id: 'main',
  kind: 'EVENT_COUNT',
  description: 'Do the thing.',
  target: 3,
  params: { eventTypes: ['SCOUT'] },
  ...overrides,
} as QuestObjectiveDefinition);

describe('quest progress reducer', () => {
  it('counts only matching activity types and caps at target', () => {
    const def = objective();
    const miss = advanceQuestObjective(def, { type: 'STORE_BUY', payload: {} });
    expect(miss).toEqual({
      matched: false,
      amount: 0,
      progress: { current: 0, target: 3, completed: false },
    });

    const first = advanceQuestObjective(def, { type: 'SCOUT', payload: {} });
    const final = advanceQuestObjective(def, { type: 'SCOUT', payload: {} }, { current: 2, target: 3, completed: false });
    expect(first.amount).toBe(1);
    expect(final).toEqual({
      matched: true,
      amount: 1,
      progress: { current: 3, target: 3, completed: true },
    });
  });

  it('sums turns from existing activity payload conventions', () => {
    const def = objective({ kind: 'SPEND_TURNS', target: 12 });
    const a = advanceQuestObjective(def, { type: 'SCOUT', payload: { turns: 7 } });
    const b = advanceQuestObjective(def, { type: 'SCOUT', payload: { turnsUsed: 5 } }, a.progress);
    expect(b.progress).toEqual({ current: 12, target: 12, completed: true });
  });

  it('counts only positive cash earnings', () => {
    const def = objective({ kind: 'EARN_CASH', target: 10_000, params: { eventTypes: ['SCOUT', 'RAID_ATTACK'] } });
    expect(advanceQuestObjective(def, { type: 'RAID_ATTACK', payload: { cashCents: -500 } }).amount).toBe(0);
    expect(advanceQuestObjective(def, { type: 'SCOUT', payload: { cashCents: 4200 } }).amount).toBe(4200);
  });

  it('tracks recruited hoes, thugs, or both', () => {
    const event = { type: 'SCOUT', payload: { whores: 2, thugs: 3 } } as const;
    expect(advanceQuestObjective(objective({ kind: 'RECRUIT_CREW', target: 10, params: { eventTypes: ['SCOUT'], crew: 'ANY' } }), event).amount).toBe(5);
    expect(advanceQuestObjective(objective({ kind: 'RECRUIT_CREW', target: 10, params: { eventTypes: ['SCOUT'], crew: 'WHORES' } }), event).amount).toBe(2);
    expect(advanceQuestObjective(objective({ kind: 'RECRUIT_CREW', target: 10, params: { eventTypes: ['SCOUT'], crew: 'THUGS' } }), event).amount).toBe(3);
  });

  it('supports exact payload filters and dotted field sums', () => {
    const def = objective({
      kind: 'EVENT_SUM',
      target: 100,
      params: { eventTypes: ['PRODUCE_CRACK'], field: 'product', where: { productType: 'CRACK', 'meta.clean': true } },
    });
    const event = { type: 'PRODUCE_CRACK', payload: { productType: 'CRACK', product: 40, meta: { clean: true } } } as const;
    expect(advanceQuestObjective(def, event).amount).toBe(40);
    expect(advanceQuestObjective(def, { ...event, payload: { ...event.payload, productType: 'WEED' } }).amount).toBe(0);
  });

  it('counts wins only when the event payload says won=true', () => {
    const def = objective({ kind: 'WIN_EVENTS', target: 2, params: { eventTypes: ['RAID_ATTACK', 'DRIVE_BY_ATTACK'] } });
    expect(advanceQuestObjective(def, { type: 'RAID_ATTACK', payload: { won: false } }).amount).toBe(0);
    expect(advanceQuestObjective(def, { type: 'RAID_ATTACK', payload: { won: true } }).amount).toBe(1);
  });

  it('counts distinct string values across scalar and array payloads', () => {
    const def = objective({
      kind: 'UNIQUE_VALUES',
      target: 3,
      params: { eventTypes: ['RUN_RETURNED'], field: 'cities' },
    });

    const first = advanceQuestObjective(def, {
      type: 'RUN_RETURNED',
      payload: { cities: ['Detroit', 'Chicago'] },
    });
    expect(first).toEqual({
      matched: true,
      amount: 2,
      progress: {
        current: 2,
        target: 3,
        completed: false,
        values: ['Detroit', 'Chicago'],
      },
    });

    const duplicate = advanceQuestObjective(def, {
      type: 'RUN_RETURNED',
      payload: { cities: ['Chicago'] },
    }, first.progress);
    expect(duplicate.amount).toBe(0);
    expect(duplicate.progress.current).toBe(2);

    const final = advanceQuestObjective(def, {
      type: 'RUN_RETURNED',
      payload: { cities: ['Miami', 'Seattle'] },
    }, duplicate.progress);
    expect(final.amount).toBe(1);
    expect(final.progress).toEqual({
      current: 3,
      target: 3,
      completed: true,
      values: ['Detroit', 'Chicago', 'Miami', 'Seattle'],
    });
  });

  it('updates required progress as one immutable application', () => {
    const defs = [
      objective({ id: 'turns', kind: 'SPEND_TURNS', target: 12 }),
      objective({ id: 'recruits', kind: 'RECRUIT_CREW', target: 1 }),
    ];
    const result = applyQuestProgress(defs, undefined, {
      type: 'SCOUT',
      payload: { turns: 12, whores: 1, thugs: 0 },
    });
    expect(result.completed).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.deltas).toEqual({ turns: 12, recruits: 1 });
  });

  it('treats STATE_AT_LEAST as current state rather than cumulative progress', () => {
    const def = objective({ kind: 'STATE_AT_LEAST', target: 5, params: { field: 'thugs' } });
    const ready = advanceQuestObjective(def, { type: 'SCOUT', payload: {}, state: { thugs: 5 } });
    expect(ready).toEqual({
      matched: true,
      amount: 5,
      progress: { current: 5, target: 5, completed: true },
    });

    const dropped = advanceQuestObjective(
      def,
      { type: 'RAID_DEFENSE', payload: { won: false }, state: { thugs: 3 } },
      ready.progress,
    );
    expect(dropped).toEqual({
      matched: true,
      amount: -2,
      progress: { current: 3, target: 5, completed: false },
    });
  });

});
