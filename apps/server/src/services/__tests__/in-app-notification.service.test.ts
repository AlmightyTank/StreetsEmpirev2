import { describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import { shouldCreateInAppNotification } from '../in-app-notification.service.js';

const payload = (value: unknown) => value as Prisma.InputJsonValue;

describe('shouldCreateInAppNotification', () => {
  it('keeps toast-worthy defense and quest events', () => {
    expect(shouldCreateInAppNotification('RAID_DEFENSE', payload({ won: false }))).toBe(true);
    expect(shouldCreateInAppNotification('QUEST_READY', payload({ questKey: 'FIRST_NIGHT_OUT' }))).toBe(true);
  });

  it('only keeps quest claims that actually unlock new work', () => {
    expect(shouldCreateInAppNotification('QUEST_CLAIMED', payload({ newlyAvailable: ['NEXT_JOB'] }))).toBe(true);
    expect(shouldCreateInAppNotification('QUEST_CLAIMED', payload({ newlyAvailable: [] }))).toBe(false);
  });

  it('only keeps scout/produce police busts', () => {
    expect(shouldCreateInAppNotification('SCOUT', payload({ busted: true }))).toBe(true);
    expect(shouldCreateInAppNotification('SCOUT', payload({ busted: false }))).toBe(false);
    expect(shouldCreateInAppNotification('PRODUCE_CRACK', payload({ busted: true }))).toBe(true);
  });

  it('ignores ordinary activity that never becomes a toast', () => {
    expect(shouldCreateInAppNotification('STORE_BUY', payload({ item: 'beer' }))).toBe(false);
    expect(shouldCreateInAppNotification('WORK_STREETS', payload({ turns: 5 }))).toBe(false);
  });
});
