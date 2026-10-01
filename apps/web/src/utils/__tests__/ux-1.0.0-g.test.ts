import { describe, expect, it } from 'vitest';
import { confirmAction, useConfirm } from '../../stores/confirm.js';
import { buildIdFrom } from '../app-update.js';
import { formatAgo, formatCountdown, formatElapsed, formatWhen } from '../time.js';

const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);

describe('1.0.0-G new-version detection', () => {
  it('reads the hashed entry script out of a build', () => {
    const html = '<script type="module" crossorigin src="/assets/index-GvuTQaNP.js"></script><link rel="stylesheet" href="/assets/index-Cx1.css">';
    expect(buildIdFrom(html)).toBe('/assets/index-GvuTQaNP.js');
    expect(buildIdFrom('<script type="module" src="/src/main.tsx"></script>')).toBeNull();
  });
});

describe('1.0.0-G time formatting', () => {
  it('counts down with hours once there are hours', () => {
    expect(formatCountdown(258_000)).toBe('04:18');
    expect(formatCountdown(3_858_000)).toBe('1:04:18');
    expect(formatCountdown(-5)).toBe('00:00');
  });

  it('says how long ago, briefly', () => {
    expect(formatElapsed(NOW - 20_000, NOW)).toBe('just now');
    expect(formatElapsed(NOW - 12 * 60_000, NOW)).toBe('12m');
    expect(formatElapsed(NOW - 5 * 3_600_000, NOW)).toBe('5h');
    expect(formatElapsed(NOW - 3 * 86_400_000, NOW)).toBe('3d');
    expect(formatAgo(NOW - 12 * 60_000, NOW)).toBe('12m ago');
    expect(formatAgo(NOW, NOW)).toBe('just now');
  });

  it('never shows seconds, and survives a bad date', () => {
    const text = formatWhen('2026-09-27T13:05:23Z');
    expect(text).not.toMatch(/:23\b/);
    expect(text).toMatch(/05/);
    expect(formatWhen('not a date')).toBe('');
  });
});

describe('1.0.0-G confirmation dialog', () => {
  it('resolves with the answer and closes', async () => {
    const asked = confirmAction({ title: 'Delete?', confirmLabel: 'Delete', tone: 'danger' });
    expect(useConfirm.getState().pending?.title).toBe('Delete?');
    useConfirm.getState().answer(true);
    await expect(asked).resolves.toBe(true);
    expect(useConfirm.getState().pending).toBeNull();
  });

  it('a second question cancels the first', async () => {
    const first = confirmAction({ title: 'First?', confirmLabel: 'Yes' });
    const second = confirmAction({ title: 'Second?', confirmLabel: 'Yes' });
    await expect(first).resolves.toBe(false);
    useConfirm.getState().answer(false);
    await expect(second).resolves.toBe(false);
  });
});
