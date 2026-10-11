import { describe, expect, it, vi } from 'vitest';
import { classicOgV17C, classicOgV17E } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import { CrewRosterService } from '../crew-roster.service.js';

describe('1.7.0-C crew careers', () => {
  it('unlocks the job specialty with the completed job award and writes its history in the same transaction', async () => {
    const update = vi.fn();
    const create = vi.fn();
    const tx = {
      crewMember: {
        findMany: vi.fn().mockResolvedValue([{ id: 'member-1', specialty: 'GENERALIST', specialtyExperiencePoints: 15 }]),
        update,
      },
      crewMemberEvent: { create },
    } as unknown as Db;

    await CrewRosterService.awardCompletedWork(tx, {
      roundPlayerId: 'player-1', ruleset: classicOgV17C, role: 'WORKER', specialty: 'SCOUT', at: new Date('2026-01-01T00:00:00Z'), label: 'Scouting trip complete',
    });

    expect(update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { experiencePoints: { increment: 5 }, specialtyExperiencePoints: { increment: 5 }, specialty: 'SCOUT' } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kind: 'WORK_COMPLETED', summary: 'Scouting trip complete · +5 XP.' }) }));
  });

  it('uses the tier-two bonus and enforces the ruleset cap', async () => {
    const tx = { crewMember: { findMany: vi.fn().mockResolvedValue([{ specialtyExperiencePoints: 1_000 }]) } } as unknown as Db;
    await expect(CrewRosterService.specialtyBonusPercent(tx, 'player-1', classicOgV17C, 'THUG', 'ENFORCER')).resolves.toBe(5);
    expect(tx.crewMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'AVAILABLE', specialty: 'ENFORCER' }) }));
  });

  it('keeps the reserved service specialty from implying an effect before service categories exist', async () => {
    const findMany = vi.fn().mockResolvedValue([{ specialtyExperiencePoints: 1_000 }]);
    const tx = { crewMember: { findMany } } as unknown as Db;
    await expect(CrewRosterService.specialtyBonusPercent(tx, 'player-1', classicOgV17E, 'WORKER', 'SERVICE')).resolves.toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('validates selected specialists against live availability and applies their best bounded effect', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'enforcer-1', specialtyExperiencePoints: 20 },
      { id: 'enforcer-2', specialtyExperiencePoints: 100 },
    ]);
    const tx = { crewMember: { findMany } } as unknown as Db;
    await expect(CrewRosterService.selectedSpecialtyBonusPercent(tx, 'player-1', classicOgV17E, 'THUG', 'ENFORCER', ['enforcer-1', 'enforcer-2'])).resolves.toBe(5);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: ['enforcer-1', 'enforcer-2'] }, status: 'AVAILABLE', dealerStaffId: null }) }));

    findMany.mockResolvedValueOnce([{ id: 'enforcer-1', specialtyExperiencePoints: 20 }]);
    await expect(CrewRosterService.selectedSpecialtyBonusPercent(tx, 'player-1', classicOgV17E, 'THUG', 'ENFORCER', ['enforcer-1', 'stale-id'])).rejects.toMatchObject({ code: 'CREW_TEAM_UNAVAILABLE' });
    await expect(CrewRosterService.selectedSpecialtyBonusPercent(tx, 'player-1', classicOgV17C, 'THUG', 'ENFORCER', ['enforcer-1'])).rejects.toMatchObject({ code: 'TEAM_SELECTION_UNAVAILABLE' });
  });

  it('awards selected-team experience only to a selected eligible member', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'chosen', specialty: 'ENFORCER', specialtyExperiencePoints: 20 }]);
    const tx = { crewMember: { findMany, update: vi.fn() }, crewMemberEvent: { create: vi.fn() } } as unknown as Db;
    await CrewRosterService.awardCompletedWork(tx, {
      roundPlayerId: 'player-1', ruleset: classicOgV17E, role: 'THUG', specialty: 'ENFORCER', memberIds: ['chosen'], at: new Date('2026-01-01T00:00:00Z'), label: 'Raid completed',
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: ['chosen'] } }) }));
  });

  it('uses the best assigned Enforcer on a corner without stacking', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { specialtyExperiencePoints: 20 },
      { specialtyExperiencePoints: 100 },
    ]);
    const tx = { crewMember: { findMany } } as unknown as Db;
    await expect(CrewRosterService.assignedSpecialtyBonusPercent(tx, {
      roundPlayerId: 'player-1',
      ruleset: classicOgV17E,
      role: 'THUG',
      specialty: 'ENFORCER',
      assignmentKind: 'TURF',
      assignmentRef: 'turf-1',
    })).resolves.toBe(5);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'ASSIGNED', assignmentKind: 'TURF', assignmentRef: 'turf-1', specialty: 'ENFORCER' }),
    }));
  });

  it('awards corner defense experience to every named defender on the corner', async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: 'rookie', specialty: 'GENERALIST', specialtyExperiencePoints: 15 },
      { id: 'enforcer', specialty: 'ENFORCER', specialtyExperiencePoints: 100 },
    ]);
    const update = vi.fn();
    const createMany = vi.fn();
    const tx = { crewMember: { findMany, update }, crewMemberEvent: { createMany } } as unknown as Db;
    await expect(CrewRosterService.awardCornerDefense(tx, {
      roundPlayerId: 'player-1',
      ruleset: classicOgV17E,
      turfId: 'turf-1',
      at: new Date('2026-01-01T00:00:00Z'),
    })).resolves.toBe(2);
    expect(update).toHaveBeenCalledWith({ where: { id: 'rookie' }, data: { experiencePoints: { increment: 5 }, specialtyExperiencePoints: { increment: 5 }, specialty: 'ENFORCER' } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'enforcer' }, data: { experiencePoints: { increment: 5 }, specialtyExperiencePoints: { increment: 5 }, specialty: 'ENFORCER' } });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ memberId: 'rookie', kind: 'WORK_COMPLETED', assignmentKind: 'TURF', assignmentRef: 'turf-1', summary: 'Corner defense held · +5 XP.' }),
        expect.objectContaining({ memberId: 'enforcer', kind: 'WORK_COMPLETED', assignmentKind: 'TURF', assignmentRef: 'turf-1', summary: 'Corner defense held · +5 XP.' }),
      ]),
    }));
  });
});
