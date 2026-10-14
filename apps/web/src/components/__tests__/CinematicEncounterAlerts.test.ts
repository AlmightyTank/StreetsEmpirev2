import { describe, expect, it } from 'vitest';
import type { ActivityDto } from '@streets/shared';
import { appendEncounterAlertQueue, encounterAlertForActivity, type QueuedEncounterAlert } from '../CinematicEncounterAlerts.js';
import { isCinematicEncounterActivity } from '../encounterAlertPolicy.js';

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

  it('points outgoing raid and drive-by actions at the attacks console', () => {
    for (const type of ['RAID_ATTACK', 'DRIVE_BY_ATTACK'] as const) {
      expect(encounterAlertForActivity(activity(type, { won: true, opponent: 'Northside' }))?.href)
        .toBe('/game/console?view=attacks');
    }
  });

  it('never drops queued alerts when more than five arrive together or later', () => {
    const make = (id: number): QueuedEncounterAlert => ({
      id: 'attack-' + id, kind: 'raid', outcome: 'incoming', title: 'Incoming',
      description: 'Crew spotted',
    });
    const first = appendEncounterAlertQueue([], Array.from({ length: 8 }, (_, index) => make(index)));
    expect(first).toHaveLength(8);
    const afterDismiss = first.slice(1);
    const later = appendEncounterAlertQueue(afterDismiss, [make(8), make(9), make(8)]);
    expect(later).toHaveLength(9);
    expect(later.map((item) => item.id)).toEqual([
      'attack-1', 'attack-2', 'attack-3', 'attack-4', 'attack-5',
      'attack-6', 'attack-7', 'attack-8', 'attack-9',
    ]);
  });

  it('assigns cinematic events exclusively to the cinematic lane', () => {
    expect(isCinematicEncounterActivity('RAID_DEFENSE')).toBe(true);
    expect(isCinematicEncounterActivity('DRIVE_BY_ATTACK')).toBe(true);
    expect(isCinematicEncounterActivity('TURF_PUSH_INCOMING')).toBe(true);
    expect(isCinematicEncounterActivity('CONVOY_DEFENSE')).toBe(true);
    expect(isCinematicEncounterActivity('QUEST_READY')).toBe(false);
    expect(isCinematicEncounterActivity('ADMIN_GRANT')).toBe(false);
  });

  it('does not steal ordinary quest and production notifications', () => {
    expect(encounterAlertForActivity(activity('QUEST_READY', { title: 'The Big Deal' }))).toBeNull();
    expect(encounterAlertForActivity(activity('PRODUCE_CRACK', { amount: 20 }))).toBeNull();
  });
});
