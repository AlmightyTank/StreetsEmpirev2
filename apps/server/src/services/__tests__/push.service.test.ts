import { describe, expect, it } from 'vitest';
import type { DiscordBattleEventDto } from '@streets/shared';
import { isAllowedPushEndpoint, pushFailureReason, pushMessageFor } from '../push.service.js';

const battle: DiscordBattleEventDto = {
  id: 'b1', kind: 'DRIVE_BY', roundName: 'Game #008',
  attackerName: 'AlmightyTank', attackerProfileUrl: 'https://example.invalid/game/players/1',
  defenderName: 'Rival', defenderProfileUrl: 'https://example.invalid/game/players/2',
  attackerWon: true, createdAt: '2026-09-16T00:00:00.000Z',
};

describe('isAllowedPushEndpoint', () => {
  it('accepts the push services browsers hand out', () => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/abc:def',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/QGx',
      'https://wns2-par02p.notify.windows.com/w/?token=abc',
    ]) expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(true);
  });

  it('refuses anything else the server would otherwise POST to', () => {
    for (const endpoint of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com:8443/fcm/send/abc',
      'https://user:pass@fcm.googleapis.com/fcm/send/abc',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evilpush.apple.com.example/x',
      'https://localhost/push',
      'https://169.254.169.254/latest/meta-data',
      'not a url',
    ]) expect(isAllowedPushEndpoint(endpoint), endpoint).toBe(false);
  });
});

describe('pushMessageFor', () => {
  it('names the attack and links to combat', () => {
    expect(pushMessageFor({ category: 'attacks', battle })).toMatchObject({
      title: 'Drive-by against you',
      body: 'AlmightyTank hit you and won.',
      tag: 'attack:b1',
    });
    expect(pushMessageFor({ category: 'attacks', battle: { ...battle, attackerWon: false } }).body).toBe('AlmightyTank hit you. Your crew held.');
    expect(pushMessageFor({ category: 'attacks', battle }).url).toMatch(/\/game\/combat$/);
  });

  it('keeps one turns and one rank alert on the device at a time', () => {
    const turns = pushMessageFor({ category: 'turns', reminder: { displayName: 'A', roundName: 'Game #008', turns: 144, cap: 144, url: 'https://example.invalid/game' } });
    expect(turns).toMatchObject({ title: 'Your turns are full', tag: 'turns', url: 'https://example.invalid/game' });
    expect(turns.body).toContain('144/144');

    const rank = { displayName: 'A', roundName: 'Game #008', rank: 2, leaderName: 'B', url: 'https://example.invalid/game/rankings' };
    expect(pushMessageFor({ category: 'rank', alert: { ...rank, kind: 'lost-first' } })).toMatchObject({ title: 'You lost national #1', body: "B took #1. You're #2 now.", tag: 'rank' });
    expect(pushMessageFor({ category: 'rank', alert: { ...rank, kind: 'out-of-top-10', rank: 11 } }).title).toBe('You fell out of the top 10');
  });

  it('words each round event, with the player rank when they played', () => {
    const event = { roundName: 'Game #009', status: 'ACTIVE', startsAt: '', endsAt: '', url: 'https://example.invalid/join', standings: [] };
    expect(pushMessageFor({ category: 'round', event: { ...event, type: 'opened' }, rank: null }).title).toBe('Game #009 is open');
    expect(pushMessageFor({ category: 'round', event: { ...event, type: 'ending-soon' }, rank: 3 }).body).toBe("Last day to climb. You're #3 nationally.");
    expect(pushMessageFor({ category: 'round', event: { ...event, type: 'ended' }, rank: 1 }).body).toBe('You finished #1 nationally.');
    expect(pushMessageFor({ category: 'round', event: { ...event, type: 'ended' }, rank: null }).body).toBe('See the final rankings.');
  });
});

describe('pushFailureReason', () => {
  const failed = (statusCode?: number, body?: string) => Object.assign(new Error('Received unexpected response code'), { statusCode, body });

  it('explains what the push service answered', () => {
    expect(pushFailureReason(failed(410))).toMatchObject({ status: 410, reason: expect.stringContaining('removed') });
    expect(pushFailureReason(failed(403)).reason).toContain('different server keys');
    expect(pushFailureReason(failed(401)).reason).toContain('VAPID_SUBJECT');
    expect(pushFailureReason(failed(502, 'upstream down')).reason).toBe('The push service answered 502: upstream down.');
  });

  it('blames the server settings when nothing was sent', () => {
    expect(pushFailureReason(new Error('No subject set in vapidDetails.subject')).reason)
      .toBe('The server could not send the alert (No subject set in vapidDetails.subject). Check the VAPID settings.');
    expect(pushFailureReason(new Error('Vapid public key should be 65 bytes long when decoded.'))).toEqual({
      status: null,
      reason: 'The server could not send the alert (Vapid public key should be 65 bytes long when decoded). Check the VAPID settings.',
    });
  });
});
