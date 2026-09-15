import { describe, expect, it } from 'vitest';
import { availableRoundActions, slugifyRoundName, startDecision } from '../admin-round.service.js';

const round = (id: string, startsAt: string) => ({ id, name: `Round ${id}`, startsAt: new Date(startsAt) });

describe('availableRoundActions', () => {
  it('only offers moves the round lifecycle allows', () => {
    expect(availableRoundActions({ status: 'SCHEDULED' })).toEqual(['open-registration', 'start']);
    expect(availableRoundActions({ status: 'REGISTRATION' })).toEqual(['start', 'end-early']);
    expect(availableRoundActions({ status: 'ACTIVE' })).toEqual(['end-early']);
    expect(availableRoundActions({ status: 'ENDED' })).toEqual(['archive']);
    expect(availableRoundActions({ status: 'ARCHIVED' })).toEqual([]);
  });
});

describe('startDecision', () => {
  const next = round('next', '2026-10-01T00:00:00.000Z');

  it('starts freely when nothing else is live', () => {
    expect(startDecision(next, [], next.startsAt, false)).toEqual({ ok: true, supersedes: [] });
  });

  it('ignores the round being started', () => {
    expect(startDecision(next, [next], next.startsAt, false)).toEqual({ ok: true, supersedes: [] });
  });

  it('requires confirmation before handing off an older live round', () => {
    const live = [round('current', '2026-09-01T00:00:00.000Z')];
    expect(startDecision(next, live, next.startsAt, false)).toMatchObject({ ok: false, code: 'ROUND_HANDOFF_REQUIRED' });
    expect(startDecision(next, live, next.startsAt, true)).toEqual({ ok: true, supersedes: live });
  });

  it('refuses when a live round started at or after the new start, even with confirmation', () => {
    for (const startsAt of ['2026-10-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z']) {
      const live = [round('current', '2026-09-01T00:00:00.000Z'), round('newer', startsAt)];
      expect(startDecision(next, live, next.startsAt, true)).toMatchObject({ ok: false, code: 'ROUND_WOULD_BE_SUPERSEDED' });
    }
  });
});

describe('slugifyRoundName', () => {
  it('makes url-safe slugs from round names', () => {
    expect(slugifyRoundName('Game #010 - Admin Tools')).toBe('game-010-admin-tools');
    expect(slugifyRoundName('  ***  ')).toBe('');
  });
});
