import { describe, expect, it } from 'vitest';
import type { ActivityDto } from '@streets/shared';
import { gameEventToastFor, levelUpToastFor } from '../GameEventToasts.js';

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
      title: 'Objective done: First Night Out',
      tone: 'good',
      href: '/game/quests?tab=active&focus=FIRST_NIGHT_OUT#quest-FIRST_NIGHT_OUT',
    });
  });

  it('alerts when a quest is ready to turn in', () => {
    expect(gameEventToastFor(activity('QUEST_READY', {
      questKey: 'FIRST_NIGHT_OUT',
      title: 'First Night Out',
    }), 'crack')).toMatchObject({
      title: 'First Night Out is ready to turn in',
      tone: 'good',
    });
  });

  it('turns newly unlocked follow-up quests into an available-work popup', () => {
    expect(gameEventToastFor(activity('QUEST_CLAIMED', {
      title: 'First Night Out',
      newlyAvailable: ['FRESH_FACES'],
    }), 'crack')).toMatchObject({
      title: 'New quest available',
      href: '/game/quests?tab=available&focus=FRESH_FACES#quest-FRESH_FACES',
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
      title: 'Rival stole your ride',
      tone: 'bad',
    });
  });

  it('alerts on drive-by defense', () => {
    expect(gameEventToastFor(activity('DRIVE_BY_DEFENSE', {
      opponent: 'Rival',
      won: false,
      whoresKilled: 2,
    }), 'crack')).toMatchObject({
      title: 'Drive-by hit your block: Rival',
      tone: 'bad',
    });
  });

  it('alerts when a run returns', () => {
    expect(gameEventToastFor(activity('RUN_RETURNED', {
      cities: ['Chicago'],
      startCashCents: 100_00,
      cashCents: 1_250_00,
    }), 'crack')).toMatchObject({
      title: 'Run returned from Chicago',
      tone: 'good',
      href: '/game/travel',
    });
  });

  it('alerts when an admin sends compensation', () => {
    expect(gameEventToastFor(activity('ADMIN_GRANT', {
      reason: 'Beta test make-good',
      granted: { cashCents: 500_00, turns: 5 },
    }), 'crack')).toMatchObject({
      title: 'Admin make-good received',
      tone: 'good',
    });
  });

  it('uses the turf defense result for held and lost blocks', () => {
    expect(gameEventToastFor(activity('TURF_PUSH_DEFENSE', {
      attacker: 'Rival',
      district: 'Downtown',
      held: true,
    }), 'crack')).toMatchObject({
      title: 'Downtown held',
      tone: 'warn',
    });

    expect(gameEventToastFor(activity('TURF_PUSH_DEFENSE', {
      attacker: 'Rival',
      district: 'Downtown',
      held: false,
    }), 'crack')).toMatchObject({
      title: 'Downtown fell',
      tone: 'bad',
    });
  });

  it('uses actionable turf alert wording for incoming pushes and alliance calls', () => {
    expect(gameEventToastFor(activity('TURF_PUSH_INCOMING', {
      city: 'chicago',
      cityName: 'Chicago',
      district: 'downtown',
      districtName: 'Downtown',
      landsAt: '2026-09-22T13:00:00.000Z',
      squad: 12,
    }), 'crack')).toMatchObject({
      title: 'Lookouts spotted a push on Downtown, Chicago',
      detail: expect.stringContaining('Send backup or call your alliance.'),
      tone: 'bad',
      href: '/game/turf?city=chicago',
    });

    expect(gameEventToastFor(activity('ALLIANCE_CALL', {
      kind: 'turf',
      ally: 'Northside',
      city: 'detroit',
      cityName: 'Detroit',
      districtName: 'Corktown',
    }), 'crack')).toMatchObject({
      title: 'Alliance call: Corktown, Detroit under push',
      detail: expect.stringContaining('Northside needs bodies'),
      tone: 'warn',
      href: '/game/turf?city=detroit',
    });
  });

  it('routes survey announcements directly to the survey', () => {
    expect(gameEventToastFor(activity('GAME_ANNOUNCEMENT', {
      title: 'New survey: Store feedback',
      excerpt: '5 questions · reward for completion only.',
      href: '/game/surveys?tab=available&survey=survey-1',
    }), 'crack')).toMatchObject({
      title: 'New survey: Store feedback',
      href: '/game/surveys?tab=available&survey=survey-1',
      tone: 'info',
    });
  });

  it('stays quiet for routine player actions', () => {
    expect(gameEventToastFor(activity('STORE_BUY', { item: 'beer' }), 'crack')).toBeNull();
  });
});

describe('levelUpToastFor', () => {
  it('announces the level and title reward when a title milestone is crossed', () => {
    expect(levelUpToastFor(9, 10)).toMatchObject({
      title: 'Level 10 reached',
      detail: expect.stringContaining('Known Face'),
      tone: 'good',
      href: '/game/xp-progress',
    });
  });

  it('celebrates regular level gains without promising a title reward', () => {
    expect(levelUpToastFor(1, 2)).toMatchObject({
      title: 'Level 2 reached',
      detail: expect.not.stringContaining('New title unlocked'),
      tone: 'good',
      href: '/game/xp-progress',
    });
  });
});
