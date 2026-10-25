import { describe, expect, it } from 'vitest';
import { applyQuestProgress, type QuestObjectiveDefinition } from '@streets/rulesets';
import { storeBasketSignals } from '../quest-progress.service.js';

const basket = {
  id: 'act1',
  type: 'STORE_BUY' as const,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  payload: {
    city: 'new-york-city', lineCount: 3, itemCount: 6, totalCents: 900, cashChangeCents: -300,
    lines: [
      { store: 'Tommy', storeKey: 'TOMMY', item: 'Pistol', itemKey: 'PISTOL', direction: 'buy', quantity: 2, totalCents: 1_000 },
      { store: 'Tommy', storeKey: 'TOMMY', item: 'Thug', itemKey: 'THUG', direction: 'buy', quantity: 1, totalCents: 200 },
      { store: 'Pip', storeKey: 'PIP', item: 'Product', itemKey: 'CRACK', product: 'CRACK', direction: 'sell', quantity: 3, totalCents: 300 },
    ],
  },
};

function total(objective: QuestObjectiveDefinition): number {
  let progress = {};
  for (const signal of storeBasketSignals(basket) ?? []) {
    progress = applyQuestProgress([objective], progress, { type: signal.type, payload: signal.payload }).progress;
  }
  return (progress as Record<string, { current: number }>)[objective.id]?.current ?? 0;
}

describe('store basket quest evidence', () => {
  it('splits a basket into one signal per line, typed by that line and keyed for idempotency', () => {
    const signals = storeBasketSignals(basket)!;
    expect(signals.map((signal) => [signal.sourceKey, signal.type])).toEqual([
      ['activity:act1:line:0', 'STORE_BUY'],
      ['activity:act1:line:1', 'STORE_BUY'],
      ['activity:act1:line:2', 'STORE_SELL'],
    ]);
    expect(signals[2]!.payload).toMatchObject({ city: 'new-york-city', storeKey: 'PIP', product: 'CRACK', quantity: 3 });
  });

  it('leaves single trades and other activities alone', () => {
    expect(storeBasketSignals({ ...basket, payload: { storeKey: 'PIP', direction: 'sell', quantity: 1 } })).toBeNull();
    expect(storeBasketSignals({ ...basket, type: 'SCOUT' as never })).toBeNull();
  });

  it('counts each line as the same trade made on its own', () => {
    const params = (eventTypes: string[], extra: Record<string, unknown>) => ({ eventTypes, ...extra }) as never;
    expect(total({ id: 'p', kind: 'EVENT_SUM', description: '', target: 99, params: params(['STORE_BUY'], { field: 'quantity', where: { storeKey: 'TOMMY', itemKey: 'PISTOL' } }) })).toBe(2);
    expect(total({ id: 't', kind: 'RECRUIT_CREW', description: '', target: 99, params: params(['STORE_BUY'], { crew: 'THUGS', itemKey: 'THUG' }) })).toBe(1);
    expect(total({ id: 's', kind: 'EVENT_SUM', description: '', target: 99, params: params(['STORE_SELL'], { field: 'quantity', where: { storeKey: 'PIP', product: 'CRACK' } }) })).toBe(3);
    // Sales totals count only the sale lines, not the whole mixed basket.
    expect(total({ id: 'c', kind: 'EVENT_SUM', description: '', target: 99_999, params: params(['STORE_SELL'], { field: 'totalCents' }) })).toBe(300);
    expect(total({ id: 'n', kind: 'EVENT_COUNT', description: '', target: 99, params: params(['STORE_BUY', 'STORE_SELL'], {}) })).toBe(3);
  });
});
