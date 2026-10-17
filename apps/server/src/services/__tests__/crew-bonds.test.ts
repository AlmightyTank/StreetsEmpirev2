import { describe, expect, it, vi } from 'vitest';
import { classicOgV30G, classicOgV30H } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { assertMentorPair, crewBondMilestone, CrewBondService } from '../crew-bonds.service.js';

const at = new Date('2026-10-23T14:00:00Z');
const veteran = { id: 'm1', role: 'THUG' as const, serial: 1, status: 'AVAILABLE', experiencePoints: 125, loyaltyPoints: 30 };
const rookie = { id: 'r1', role: 'THUG' as const, serial: 2, status: 'AVAILABLE', experiencePoints: 15, loyaltyPoints: 4 };

describe('2.1.0-D Crew bonds', () => {
  it('requires a proven mentor and a newer member of the same role', () => {
    expect(() => assertMentorPair(veteran, rookie)).not.toThrow();
    for (const [mentor, student] of [
      [veteran, veteran],
      [{ ...veteran, role: 'WORKER' as const }, rookie],
      [{ ...veteran, experiencePoints: 10, loyaltyPoints: 1 }, rookie],
      [veteran, { ...rookie, loyaltyPoints: 25 }],
      [veteran, { ...rookie, experiencePoints: 125 }],
      [veteran, { ...rookie, status: 'RELEASED' }],
    ] as const) expect(() => assertMentorPair(mentor, student)).toThrow();
  });

  it('marks milestones with no bonuses and stops at five', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(crewBondMilestone)).toEqual([
      'New Connection', 'First Lesson', 'First Lesson',
      'Finding Their Rhythm', 'Finding Their Rhythm',
      'Trusted Partners', 'Trusted Partners',
    ]);
  });

  it('never consults member data on non-loyalty rounds', async () => {
    const prisma = { $transaction: vi.fn() } as never;
    await expect(CrewBondService.link(prisma, 'p1', classicOgV30G, { mentorId: 'm1', apprenticeId: 'r1' })).rejects.toMatchObject({ code: 'CREW_BONDS_DISABLED' });
    expect((prisma as { $transaction: ReturnType<typeof vi.fn> }).$transaction).not.toHaveBeenCalled();
    expect(classicOgV30H.crewRoster?.loyalty?.enabled).toBe(true);
  });

  it('only earns when the partner has a positive matching verified receipt after the link', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'b1', mentorId: 'm1', apprenticeId: 'r1', startedAt: new Date('2026-10-22T00:00:00Z') }]);
    const findUnique = vi.fn().mockResolvedValueOnce({ points: 2, at, source: 'DEFENSE_HELD' }).mockResolvedValueOnce(null);
    const create = vi.fn();
    const update = vi.fn();
    const db = {
      crewMentorBond: { findMany, update },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'b1', lessons: 0, endedAt: null }]),
      crewMember: { findFirst: vi.fn().mockResolvedValue({ id: 'r1' }) },
      crewLoyaltyEntry: { findUnique },
      crewBondMemory: { findUnique: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(0), create },
    } as unknown as Db;
    await CrewBondService.afterLoyaltyReceipt(db, { roundPlayerId: 'p1', memberId: 'm1', sourceKey: 'DEFENSE:war1', source: 'DEFENSE_HELD', at });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      roundPlayerId: 'p1', bondId: 'b1', sourceKey: 'DEFENSE:war1', source: 'DEFENSE_HELD',
    }) });
    expect(update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { lessons: { increment: 1 } } });
  });

  it('rejects different source, capped records, and events before bond creation', async () => {
    const linkAt = new Date('2026-10-22T00:00:00Z');
    for (const [record, locked, now, expectedLookups] of [
      [{ points: 0, source: 'JOB_COMPLETED', at }, { lessons: 0, endedAt: null }, at, 1],
      [{ points: 2, source: 'DEFENSE_HELD', at }, { lessons: 0, endedAt: null }, at, 1],
      [{ points: 2, source: 'JOB_COMPLETED', at: new Date('2026-10-21T10:00:00Z') }, { lessons: 0, endedAt: null }, at, 1],
      [{ points: 2, source: 'JOB_COMPLETED', at }, { lessons: 5, endedAt: null }, at, 0],
      [{ points: 2, source: 'JOB_COMPLETED', at }, { lessons: 0, endedAt: at }, at, 0],
      [{ points: 2, source: 'JOB_COMPLETED', at }, { lessons: 0, endedAt: null }, new Date('2026-10-21T00:00:00Z'), 0],
    ] as const) {
      const findUnique = vi.fn().mockResolvedValue(record);
      const create = vi.fn();
      const db = {
        crewMentorBond: { findMany: vi.fn().mockResolvedValue([{ id: 'b1', mentorId: 'm1', apprenticeId: 'r1', startedAt: linkAt }]) },
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'b1', ...locked }]),
        crewMember: { findFirst: vi.fn().mockResolvedValue({ id: 'r1' }) },
        crewLoyaltyEntry: { findUnique },
        crewBondMemory: { findUnique: vi.fn(), count: vi.fn(), create },
      } as unknown as Db;
      await CrewBondService.afterLoyaltyReceipt(db, {
        roundPlayerId: 'p1', memberId: 'm1', sourceKey: 'job1', source: 'JOB_COMPLETED', at: now,
      });
      expect(create).not.toHaveBeenCalled();
      expect(findUnique).toHaveBeenCalledTimes(expectedLookups);
    }
  });

  it('bounds repeated memories to one per UTC day with source dedupe', async () => {
    for (const [sourceSeen, daily] of [[true, 0], [false, 1]] as const) {
      const create = vi.fn();
      const db = {
        crewMentorBond: { findMany: vi.fn().mockResolvedValue([{ id: 'b1', mentorId: 'm1', apprenticeId: 'r1', startedAt: new Date('2026-10-22T00:00:00Z') }]) },
        $queryRaw: vi.fn().mockResolvedValue([{ id: 'b1', lessons: 0, endedAt: null }]),
        crewMember: { findFirst: vi.fn().mockResolvedValue({ id: 'r1' }) },
        crewLoyaltyEntry: { findUnique: vi.fn().mockResolvedValue({ points: 2, at, source: 'JOB_COMPLETED' }) },
        crewBondMemory: { findUnique: vi.fn().mockResolvedValue(sourceSeen ? { id: 'old' } : null), count: vi.fn().mockResolvedValue(daily), create },
      } as unknown as Db;
      await CrewBondService.afterLoyaltyReceipt(db, { roundPlayerId: 'p1', memberId: 'm1', sourceKey: 'job1', source: 'JOB_COMPLETED', at });
      expect(create).not.toHaveBeenCalled();
    }
  });

  it('keeps the memory DTO bounded and explicitly narrative', () => {
    const dto = CrewBondService.dto({
      id: 'b1', mentorId: 'm1', apprenticeId: 'r1', mentor: { role: 'THUG', serial: 1 },
      apprentice: { role: 'THUG', serial: 2 }, lessons: 3,
      startedAt: at, endedAt: null, memories: [{ source: 'JOB_COMPLETED', summary: 'Shared a verified operation', at }],
    });
    expect(dto).toMatchObject({ id: 'b1', mentorId: 'm1', apprenticeId: 'r1', maxLessons: 5, milestone: 'Finding Their Rhythm' });
    expect(dto.memories).toEqual([{ source: 'JOB_COMPLETED', label: 'Shared a verified operation', at: at.toISOString() }]);
    expect(Object.keys(dto).sort()).not.toEqual(expect.arrayContaining(['combatPower', 'incomeBonus', 'specialtyXP']));
  });
});
