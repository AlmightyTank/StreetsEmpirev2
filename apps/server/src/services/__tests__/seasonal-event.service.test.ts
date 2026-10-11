import { describe, expect, it } from 'vitest';
import { classicOgV18F, classicOgV18H } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import {
  isSeasonalEventDefinition,
  recordFirstClassSeasonalEventProgress,
  seasonalWindow,
  usesFirstClassSeasonalEvents,
} from '../seasonal-event.service.js';

describe('SeasonalEventService', () => {
  it('pins first-class seasonal ownership to 1.8.0-H and keeps the fixed UTC dates', () => {
    const definition = Object.values(classicOgV18H.questDefinitions ?? {}).find(isSeasonalEventDefinition)!;
    expect(usesFirstClassSeasonalEvents(classicOgV18F)).toBe(false);
    expect(usesFirstClassSeasonalEvents(classicOgV18H)).toBe(true);
    expect(definition.availability.seasonalEvent.eventKey).toBe('HALLOWEEN_2026');
    expect(seasonalWindow(definition)?.startsAt.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(seasonalWindow(definition)?.endsAt.toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });

  it('continues accepted progress after the UTC offer closes until its acceptance expiry', async () => {
    const updates: unknown[] = [];
    const receipts: unknown[] = [];
    const halloween = {
      id: 'participation-halloween',
      occurrenceId: 'occ-halloween',
      progress: {
        halloween_scouts: { current: 12, target: 13, completed: false },
        halloween_wins: { current: 3, target: 3, completed: true },
      },
      state: { expiresAt: '2026-11-05T00:00:00.000Z', bonusProgress: {} },
    };
    const db = {
      gameEventParticipation: {
        findFirst: async ({ where }: any) => where.occurrence.occurrenceKey === 'HALLOWEEN_2026' ? halloween : null,
        update: async (args: unknown) => { updates.push(args); },
      },
      $queryRaw: async () => [],
      gameEventProgressReceipt: {
        findUnique: async () => null,
        create: async (args: unknown) => { receipts.push(args); },
      },
      playerQuest: {
        findFirst: async () => ({ id: 'quest-halloween', status: 'ACTIVE' }),
        update: async (args: unknown) => { updates.push(args); },
      },
    } as unknown as Db;

    const result = await recordFirstClassSeasonalEventProgress(db, 'player-1', classicOgV18H, {
      sourceKey: 'activity:scout-after-close',
      event: { type: 'SCOUT', payload: {} },
      at: new Date('2026-11-04T12:00:00.000Z'),
    });

    expect(result).toMatchObject({ matched: 1, advanced: 1, duplicate: 0, readied: [{ key: 'HALLOWEEN_WITCHING_RUN', title: 'The Witching Run' }] });
    expect(receipts).toHaveLength(1);
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ where: { id: 'participation-halloween' }, data: { progress: { halloween_scouts: { current: 13, completed: true } } } });
    expect(updates[1]).toMatchObject({ where: { id: 'quest-halloween' }, data: { status: 'READY_TO_TURN_IN' } });
  });
});
