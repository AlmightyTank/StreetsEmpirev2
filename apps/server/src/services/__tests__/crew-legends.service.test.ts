import { describe, expect, it, vi } from 'vitest';
import { classicOgV30H } from '@streets/rulesets';
import type { PrismaClient, Round } from '@prisma/client';
import type { Db } from '../../utils/db.js';
import {
  CREW_LEGEND_MEMENTO_KEY, CrewLegendService, eligibleCrewNicknames, selectedCrewNickname,
} from '../crew-legends.service.js';

function receipts(source: string, n: number, points = 2) {
  return Array.from({ length: n }, () => ({ source, points }));
}

describe('2.1.0-E earned nicknames and immutable memorials', () => {
  it('unlocks every catalog nickname from positive, server-verified receipts', () => {
    const proof = { loyaltyPoints: 50, receipts: [
      ...receipts('DEFENSE_HELD', 3), ...receipts('TRAVEL_COMPLETED', 3),
      ...receipts('DEALER_SHIFT', 3), ...receipts('JOB_COMPLETED', 5),
    ] };
    expect(eligibleCrewNicknames(proof).map((row) => row.key)).toEqual([
      'CORNER_KEEPER', 'ROAD_VETERAN', 'SHIFT_ANCHOR', 'STREET_REGULAR', 'TRUSTED_HAND',
    ]);
    expect(selectedCrewNickname({ ...proof, nicknameKey: 'ROAD_VETERAN' })?.label).toBe('Road Veteran');
    expect(selectedCrewNickname({ ...proof, nicknameKey: null })?.label).toBe('Corner Keeper');
    expect(eligibleCrewNicknames({ ...proof, suppressed: true })).toEqual([]);
  });

  it('does not unlock titles with cap receipts, mere reassignments or paid training', () => {
    expect(eligibleCrewNicknames({ loyaltyPoints: 24, receipts: [
      ...receipts('DEFENSE_HELD', 2), ...receipts('DEFENSE_HELD', 1, 0),
      ...receipts('TRAINED', 10), ...receipts('ASSIGNED', 10),
      ...receipts('JOB_COMPLETED', 5, 0),
    ] })).toEqual([]);
    expect(selectedCrewNickname({ loyaltyPoints: 50, nicknameKey: 'FRAUD', receipts: [] })?.key).toBe('TRUSTED_HAND');
  });

  it('never lets a player select a freeform or unearned nickname', async () => {
    const prisma = { $transaction: vi.fn() } as unknown as PrismaClient;
    await expect(CrewLegendService.select(prisma, 'player', { ...classicOgV30H, crewRoster: { ...classicOgV30H.crewRoster!, loyalty: { enabled: false } } }, {
      memberId: 'member', nicknameKey: 'CORNER_KEEPER',
    })).rejects.toMatchObject({ code: 'CREW_LEGENDS_DISABLED' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('freezes three final biographies, grants the cosmetic once and never recreates live members', async () => {
    const archive = vi.fn().mockResolvedValue({ count: 1 });
    const unlock = vi.fn().mockResolvedValue({ id: 'unlocked' });
    const members = Array.from({ length: 4 }, (_, index) => ({
      id: 'member-' + index, serial: index + 1, role: 'THUG' as const, status: 'AVAILABLE' as const,
      loyaltyPoints: 80 - index * 10, experiencePoints: 100 + index,
      joinedAt: new Date('2026-10-01'), nicknameKey: 'TRUSTED_HAND', loyaltyEntries: receipts('JOB_COMPLETED', 2),
    }));
    const db = {
      roundPlayer: { findMany: vi.fn().mockResolvedValue([{ id: 'player-1', accountId: 'account-1' }]) },
      crewMember: { findMany: vi.fn().mockResolvedValue(members.slice(0, 3)) },
      crewLegendArchive: { createMany: archive },
      accountCosmeticUnlock: { upsert: unlock },
    } as unknown as Db;
    const round = { id: 'round-1', name: 'First Round', rulesetId: classicOgV30H.meta.id, rulesetVersion: classicOgV30H.meta.version } as Round;
    const awarded = await CrewLegendService.snapshotAtClose(db, round, new Date('2026-10-23'));
    expect(awarded).toBe(3);
    expect(archive).toHaveBeenCalledTimes(3);
    expect(unlock).toHaveBeenCalledTimes(1);
    expect(unlock).toHaveBeenCalledWith(expect.objectContaining({
      where: { accountId_key: { accountId: 'account-1', key: CREW_LEGEND_MEMENTO_KEY } },
      update: {},
    }));
    const saved = archive.mock.calls[0]![0].data[0];
    expect(saved).toMatchObject({ sourceMemberId: 'member-0', nicknameLabel: 'Trusted Hand', accountId: 'account-1' });
    expect(Object.keys(saved)).not.toContain('memberId');
    expect(Object.keys(db)).not.toContain('crewMember.create');
  });

  it('projects only an account-owned, non-suppressed archive with historic strings', async () => {
    const findMany = vi.fn().mockResolvedValue([{
      id: 'legend-1', sourceRoundId: 'round-1', roundName: 'First Round',
      memberName: 'Ray Cole', nicknameLabel: 'Road Veteran', proof: '3 completed trips',
      trait: 'Streetwise', loyaltyPoints: 39, experiencePoints: 82, finalStatus: 'RELEASED',
      role: 'THUG', serial: 1, joinedAt: new Date('2026-10-01'), archivedAt: new Date('2026-10-23'),
    }]);
    const db = { crewLegendArchive: { findMany } } as unknown as PrismaClient;
    const result = await CrewLegendService.archive(db, 'account-1', 'round-1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { accountId: 'account-1', sourceRoundId: 'round-1', suppressedAt: null },
    }));
    expect(result[0]).toMatchObject({ nickname: 'Road Veteran', finalStatus: 'RELEASED', memberName: 'Ray Cole' });
    expect(result[0]!.artworkUrl).toBe('/assets/crew/legend-memento.svg');
  });
});
