import { describe, expect, it } from 'vitest';
import { activityMatchesSecretTrigger } from '../secret-quest.service.js';

describe('secret quest activity triggers', () => {
  it('reveals after repeated filtered activity', () => {
    const trigger = {
      kind: 'ACTIVITY_COUNT',
      eventTypes: ['RAID_ATTACK'],
      where: { won: false },
      target: 3,
    } as const;

    expect(activityMatchesSecretTrigger(trigger, [
      { type: 'RAID_ATTACK', payload: { won: false } },
      { type: 'RAID_ATTACK', payload: { won: true } },
      { type: 'RAID_ATTACK', payload: { won: false } },
    ])).toBe(false);

    expect(activityMatchesSecretTrigger(trigger, [
      { type: 'RAID_ATTACK', payload: { won: false } },
      { type: 'RAID_ATTACK', payload: { won: false } },
      { type: 'RAID_ATTACK', payload: { won: false } },
    ])).toBe(true);
  });

  it('detects one returned run carrying at least the configured total cargo', () => {
    const trigger = {
      kind: 'ACTIVITY_OBJECT_SUM_AT_LEAST',
      eventTypes: ['RUN_RETURNED'],
      field: 'cargoBack',
      target: 500,
    } as const;

    expect(activityMatchesSecretTrigger(trigger, [{
      type: 'RUN_RETURNED',
      payload: { cargoBack: { CRACK: 200, WEED: 299 } },
    }])).toBe(false);

    expect(activityMatchesSecretTrigger(trigger, [{
      type: 'RUN_RETURNED',
      payload: { cargoBack: { CRACK: 200, WEED: 300, METH: 25 } },
    }])).toBe(true);
  });

  it('matches an arrest without treating other road incidents as arrests', () => {
    const trigger = {
      kind: 'ACTIVITY_COUNT',
      eventTypes: ['RUN_INCIDENT'],
      where: { kind: 'ARREST' },
      target: 1,
    } as const;
    expect(activityMatchesSecretTrigger(trigger, [{ type: 'RUN_INCIDENT', payload: { kind: 'BUST' } }])).toBe(false);
    expect(activityMatchesSecretTrigger(trigger, [{ type: 'RUN_INCIDENT', payload: { kind: 'ARREST' } }])).toBe(true);
  });
});
