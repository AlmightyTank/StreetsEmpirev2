import { describe, expect, it } from 'vitest';
import { dashboardAttentionState, dashboardDisclosureForHash, type DashboardAttentionInput } from '../dashboardAttention.js';

const baseline: DashboardAttentionInput = {
  heatTone: 'good', heatLocked: false, convoyKind: null,
  runWaiting: false, moving: false, woundedThugs: 0, unarmedThugs: 0,
  lowWhoreHappiness: false, lowThugHappiness: false, atTurnCap: false,
};

describe('Dashboard attention', () => {
  it('does not show crisis artwork for a clear operation or mundane reminders', () => {
    expect(dashboardAttentionState(baseline)).toEqual({ count: 0, critical: false });
    expect(dashboardAttentionState({ ...baseline, atTurnCap: true })).toEqual({ count: 1, critical: false });
    expect(dashboardAttentionState({
      ...baseline, heatTone: 'warn', lowWhoreHappiness: true, runWaiting: true,
    })).toEqual({ count: 3, critical: false });
  });

  it('treats a lockup as a visible warning even when heat tone has not updated', () => {
    expect(dashboardAttentionState({ ...baseline, heatLocked: true })).toEqual({ count: 1, critical: true });
  });

  it('counts simultaneous warnings and reserves emergency visuals for real threats', () => {
    expect(dashboardAttentionState({
      ...baseline, heatTone: 'bad', convoyKind: 'tailed', woundedThugs: 2,
      unarmedThugs: 1, atTurnCap: true,
    })).toEqual({ count: 5, critical: true });
    expect(dashboardAttentionState({ ...baseline, convoyKind: 'backup' })).toEqual({ count: 1, critical: false });
  });
});

describe('Dashboard deep-link routing', () => {
  it.each([
    ['#crew-health', 'happiness'],
    ['#crew-inventory', 'crew'],
    ['#heat', 'pressure'],
    ['#payout', 'pressure'],
    ['', null],
    ['#unknown', null],
  ] as const)('%s opens %s', (hash, group) => {
    expect(dashboardDisclosureForHash(hash)).toBe(group);
  });
});
