import { describe, expect, it } from 'vitest';
import type { ActivityDto } from '@streets/shared';
import { encounterAlertForActivity } from '../CinematicEncounterAlerts.js';

function activity(type: ActivityDto['type'], payload: Record<string, unknown>): ActivityDto {
  return { id: 'event-1', type, payload, createdAt: '2026-10-14T12:00:00.000Z' };
}

describe('cinematic encounter activity mapping', () => {
  it('maps an incoming drive-by with real opponent and report destination', () => {
    expect(encounterAlertForActivity(activity('DRIVE_BY_DEFENSE', {
      won: false, opponent: 'Rival', districtName: 'Old Depot',
    }))).toMatchObject({
      kind: 'driveby', outcome: 'defeat',
      title: 'Drive-by hit your block: Rival',
      opponent: 'Rival', location: 'Old Depot',
      href: '/game/activity',
    });
  });

  it('maps successful defenses into victory scenes', () => {
    expect(encounterAlertForActivity(activity('RAID_DEFENSE', {
      won: true, opponent: 'Rival',
    }))).toMatchObject({ kind: 'raid', outcome: 'victory' });
    expect(encounterAlertForActivity(activity('TURF_PUSH_DEFENSE', {
      held: true, district: 'Downtown',
    }))).toMatchObject({ kind: 'turf', outcome: 'victory', title: 'Downtown held' });
  });

  it('uses real battle descriptions for outgoing attacks', () => {
    const report = encounterAlertForActivity(activity('RAID_ATTACK', {
      won: false, opponent: 'Northside', move: 'Raid',
    }));
    expect(report).toMatchObject({ kind: 'raid', outcome: 'defeat', title: 'Your raid failed' });
    expect(report?.description).toContain('Northside');
  });

  it('distinguishes advance warning from completed fights', () => {
    expect(encounterAlertForActivity(activity('TURF_PUSH_INCOMING', {
      district: 'Riverside', landsAt: '2026-10-14T13:00:00.000Z',
    }))).toMatchObject({ kind: 'turf', outcome: 'incoming' });
    expect(encounterAlertForActivity(activity('CONVOY_TAILED', {
      city: 'Chicago',
    }))).toMatchObject({ kind: 'convoy', outcome: 'incoming' });
  });

  it('does not steal ordinary quest and production notifications', () => {
    expect(encounterAlertForActivity(activity('QUEST_READY', { title: 'The Big Deal' }))).toBeNull();
    expect(encounterAlertForActivity(activity('PRODUCE_CRACK', { amount: 20 }))).toBeNull();
  });
});
