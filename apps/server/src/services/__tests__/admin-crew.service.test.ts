import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AdminCrewService } from '../admin-crew.service.js';

vi.mock('@streets/rules-engine', () => ({
  loadRulesetForRound: () => ({ crewRoster: { enabled: true } }),
}));

const actor = { id: 'admin-1', username: 'Staff' };
const baseMember = { id: 'member-1', roundPlayerId: 'player-1', experiencePoints: 25, specialty: 'SCOUT', specialtyExperiencePoints: 20 };

function setup(status = 'ACTIVE') {
  const memberUpdate = vi.fn();
  const eventCreate = vi.fn();
  const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-1' });
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    roundPlayer: { findUnique: vi.fn().mockResolvedValue({ id: 'player-1', accountId: 'player-account', displayName: 'Player', round: { id: 'round-1', status } }) },
    crewMember: { findFirst: vi.fn().mockResolvedValue(baseMember), update: memberUpdate },
    crewMemberEvent: { create: eventCreate },
    adminAuditLog: { create: auditCreate },
  };
  const prisma = { $transaction: (callback: (db: typeof tx) => unknown) => callback(tx) };
  return { prisma: prisma as unknown as PrismaClient, tx, memberUpdate, eventCreate, auditCreate };
}

describe('1.7.0-F admin crew tools', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes a bounded career correction, member event and audit entry together', async () => {
    const { prisma, memberUpdate, eventCreate, auditCreate } = setup();
    const result = await AdminCrewService.correct(prisma, actor, 'player-1', 'member-1', {
      experiencePoints: 30, specialty: 'SCOUT', specialtyExperiencePoints: 25, reason: 'Restore missing completed work.',
    }, new Date('2026-10-10T00:00:00Z'));
    expect(memberUpdate).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { experiencePoints: 30, specialty: 'SCOUT', specialtyExperiencePoints: 25 } });
    expect(eventCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'ADMIN_CORRECTED', summary: expect.stringContaining('Restore missing completed work.') }) });
    expect(auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'crew.member-correct', reason: 'Restore missing completed work.' }) });
    expect(result).toMatchObject({ memberId: 'member-1', experiencePoints: 30, auditId: 'audit-1' });
  });

  it('freezes completed rounds before changing member records', async () => {
    const { prisma, memberUpdate, eventCreate } = setup('ENDED');
    await expect(AdminCrewService.correct(prisma, actor, 'player-1', 'member-1', {
      experiencePoints: 30, specialty: 'SCOUT', specialtyExperiencePoints: 25, reason: 'Restore missing completed work.',
    })).rejects.toMatchObject({ code: 'ROUND_FINISHED' });
    expect(memberUpdate).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it('rejects values outside the career cap before opening a transaction', async () => {
    const { prisma, tx } = setup();
    await expect(AdminCrewService.correct(prisma, actor, 'player-1', 'member-1', {
      experiencePoints: 1_000_001, specialty: 'SCOUT', specialtyExperiencePoints: 25, reason: 'Correct a bad value.',
    })).rejects.toMatchObject({ code: 'CREW_CORRECTION_INVALID' });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('includes active staffing-order counts in the roster health report', async () => {
    const prisma = {
      round: { findUnique: vi.fn().mockResolvedValue({ id: 'round-1', name: 'Round', status: 'ACTIVE', rulesetId: 'test-ruleset', rulesetVersion: '1.8.6-I' }) },
      roundPlayer: { count: vi.fn().mockResolvedValue(2) },
      crewRosterMigration: { count: vi.fn().mockResolvedValue(1) },
      crewMember: {
        count: vi.fn().mockResolvedValue(20),
        aggregate: vi.fn().mockResolvedValue({ _min: { experiencePoints: 0 }, _max: { experiencePoints: 50 }, _avg: { experiencePoints: 10 } }),
        groupBy: vi.fn()
          .mockResolvedValueOnce([{ role: 'THUG', _count: { _all: 12 } }])
          .mockResolvedValueOnce([{ specialty: 'GENERALIST', _count: { _all: 20 } }])
          .mockResolvedValueOnce([{ status: 'AVAILABLE', _count: { _all: 8 } }])
          .mockResolvedValueOnce([{ assignmentKind: 'RUNNER', _count: { _all: 2 } }]),
        findMany: vi.fn().mockResolvedValue([]),
      },
      crewJobPost: {
        count: vi.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(3),
        groupBy: vi.fn().mockResolvedValue([{ kind: 'RUNNER', _count: { _all: 2 } }, { kind: 'TURF', _count: { _all: 1 } }]),
      },
    } as unknown as PrismaClient;

    const report = await AdminCrewService.report(prisma, 'round-1', new Date('2026-10-11T00:00:00Z'));

    expect(report.staffingOrders).toEqual({
      total: 4,
      active: 3,
      byKind: [{ kind: 'RUNNER', count: 2 }, { kind: 'TURF', count: 1 }],
    });
  });
});
