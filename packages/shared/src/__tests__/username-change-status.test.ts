import { describe, expect, it } from 'vitest';
import { USERNAME_CHANGE_COOLDOWN_DAYS, USERNAME_CHANGE_COOLDOWN_ROUNDS, usernameChangeStatus } from '../schemas/auth.js';

const DAY = 86_400_000;
const changed = new Date('2026-10-01T12:00:00.000Z');

describe('usernameChangeStatus', () => {
  it('lets a player who never changed their name change it now', () => {
    const status = usernameChangeStatus({ lastChangedAt: null, roundsStartedSince: 0, now: changed });
    expect(status).toMatchObject({ canChange: true, lastChangedAt: null, availableAt: null });
  });

  it('holds the name until 3 rounds start or 90 days pass', () => {
    const status = usernameChangeStatus({ lastChangedAt: changed, roundsStartedSince: 2, now: new Date(changed.getTime() + 30 * DAY) });
    expect(status.canChange).toBe(false);
    expect(status.availableAt).toBe(new Date(changed.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * DAY).toISOString());
    expect(status.roundsSinceChange).toBe(2);
  });

  it('opens up once the third new round starts, before the 90 days', () => {
    const status = usernameChangeStatus({ lastChangedAt: changed, roundsStartedSince: USERNAME_CHANGE_COOLDOWN_ROUNDS, now: new Date(changed.getTime() + 10 * DAY) });
    expect(status).toMatchObject({ canChange: true, availableAt: null });
  });

  it('opens up after 90 days even with no new rounds', () => {
    const now = new Date(changed.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * DAY);
    expect(usernameChangeStatus({ lastChangedAt: changed, roundsStartedSince: 0, now }).canChange).toBe(true);
    expect(usernameChangeStatus({ lastChangedAt: changed, roundsStartedSince: 0, now: new Date(now.getTime() - 1) }).canChange).toBe(false);
  });
});
