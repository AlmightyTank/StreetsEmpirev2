import { describe, expect, it } from 'vitest';
import { appendItemEvent, historyScore, itemEvents, readFeaturedItem } from '../individual-item-history.js';

describe('individual item history', () => {
  it('keeps a validated, bounded event trail in chronological order', () => {
    let history: unknown = [];
    for (let index = 0; index < 105; index++) {
      history = appendItemEvent(history, { type: 'COMBAT', summary: `Fight ${index}`, at: new Date(index * 1000) });
    }
    const events = itemEvents(history);
    expect(events).toHaveLength(100);
    expect(events[0]?.summary).toBe('Fight 5');
    expect(events.at(-1)?.summary).toBe('Fight 104');
    expect(itemEvents([{ at: 'bad', type: 'HACKED', summary: 'bad event' }, null])).toEqual([]);
  });

  it('ranks notable named items from round history and safely reads saved profile snapshots', () => {
    expect(historyScore({ name: 'Widowmaker', stats: { fights: 18 }, history: [], mods: [{ key: 'SCOPE' }] }))
      .toBeGreaterThan(historyScore({ name: 'New Sedan', stats: { runs: 1 }, history: [], mods: [] }));
    expect(readFeaturedItem({ id: 'gun-1', kind: 'GUN', model: 'AK47', name: 'Widowmaker', lookKey: 'cartel-gold', condition: 72,
      mods: [{ key: 'SCOPE', tier: 2 }], stats: { fights: 18, unsafe: 'drop' }, history: [{ at: '2026-01-01T00:00:00.000Z', type: 'COMBAT', summary: 'Fight' }], roundName: 'Game#1' }))
      .toMatchObject({ id: 'gun-1', model: 'AK47', stats: { fights: 18 }, history: [{ summary: 'Fight' }] });
    expect(readFeaturedItem({ kind: 'GUN' })).toBeNull();
  });
});
