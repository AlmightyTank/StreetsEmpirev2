import { describe, expect, it } from 'vitest';
import type { ActivityDto } from '@streets/shared';
import { gameEventToastFor } from '../GameEventToasts.js';

function activity(type: ActivityDto['type'], payload: Record<string, unknown>): ActivityDto {
  return {
    id: `${type}-1`,
    type,
    payload,
    createdAt: '2026-09-22T12:00:00.000Z',
  };
}

describe('gameEventToastFor', () => {
  it('alerts when a quest objective completes', () => {
    expect(gameEventToastFor(activity('QUEST_OBJECTIVE_COMPLETE', {
      questKey: 'FIRST_NIGHT_OUT',
      title: 'First Night Out',
      objective: 'Scout for 12 turns.',
    }), 'crack')).toMatchObject({
      title: 'Quest objective complete',
      tone: 'good',
      href: '/game/quests?tab=active#quest-FIRST_NIGHT_OUT',
    });
  });

  it('alerts when a quest is ready to turn in', () => {
    expect(gameEventToastFor(activity('QUEST_READY', {
      questKey: 'FIRST_NIGHT_OUT',
      title: 'First Night Out',
    }), 'crack')).toMatchObject({
      title: 'Quest ready to turn in',
      tone: 'good',
    });
  });

  it('turns newly unlocked follow-up quests into an available-work popup', () => {
    expect(gameEventToastFor(activity('QUEST_CLAIMED', {
      title: 'First Night Out',
      newlyAvailable: ['FRESH_FACES'],
    }), 'crack')).toMatchObject({
      title: 'New quest available',
      href: '/game/quests?tab=available',
    });
  });

  it('names special attacks against the player', () => {
    expect(gameEventToastFor(activity('RAID_DEFENSE', {
      kind: 'STEAL_RIDE',
      opponent: 'Rival',
      won: false,
      lowRidersStolen: 1,
      cashCents: 0,
    }), 'crack')).toMatchObject({
      title: 'Someone stole your ride',
      tone: 'bad',
    });
  });

  it('alerts on drive-by defense', () => {
    expect(gameEventToastFor(activity('DRIVE_BY_DEFENSE', {
      opponent: 'Rival',
      won: false,
      whoresKilled: 2,
    }), 'crack')).toMatchObject({
      title: 'Drive-by hit your block',
      tone: 'bad',
    });
  });

  it('alerts when a run returns', () => {
    expect(gameEventToastFor(activity('RUN_RETURNED', {
      cities: ['Chicago'],
      startCashCents: 100_00,
      cashCents: 1_250_00,
    }), 'crack')).toMatchObject({
      title: 'Run returned',
      tone: 'good',
      href: '/game/travel',
    });
  });

  it('alerts when an admin sends compensation', () => {
    expect(gameEventToastFor(activity('ADMIN_GRANT', {
      reason: 'Beta test make-good',
      granted: { cashCents: 500_00, turns: 5 },
    }), 'crack')).toMatchObject({
      title: 'Admin compensation received',
      tone: 'good',
    });
  });

  it('uses the turf defense result for held and lost blocks', () => {
    expect(gameEventToastFor(activity('TURF_PUSH_DEFENSE', {
      attacker: 'Rival',
      district: 'Downtown',
      held: true,
    }), 'crack')).toMatchObject({
      title: 'Block defended',
      tone: 'warn',
    });

    expect(gameEventToastFor(activity('TURF_PUSH_DEFENSE', {
      attacker: 'Rival',
      district: 'Downtown',
      held: false,
    }), 'crack')).toMatchObject({
      title: 'Block lost',
      tone: 'bad',
    });
  });

  it('stays quiet for routine player actions', () => {
    expect(gameEventToastFor(activity('STORE_BUY', { item: 'beer' }), 'crack')).toBeNull();
  });
});
