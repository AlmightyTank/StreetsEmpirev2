import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { AdminCrewReleaseService, canonicalCrewLoyalty, receiptProblems } from '../admin-crew-release.service.js';
import { CrewRosterService } from '../crew-roster.service.js';

vi.mock('@streets/rules-engine', () => ({
  loadRulesetForRound: () => ({ crewRoster: { enabled: true, loyalty: { enabled: true } } }),
}));

const actor = { id: 'staff-1', username: 'Moderator' };
const at = new Date('2026-10-22T11:00:00.000Z');

function setup(options: { status?: string; self?: boolean; actual?: number; stored?: number; nickname?: string | null } = {}) {
  const update = vi.fn().mockResolvedValue({ id: 'member-1' });
  const event = vi.fn().mockResolvedValue({ id: 'event-1' });
  const audit = vi.fn().mockResolvedValue({ id: 'audit-1' });
  const member = {
    id: 'member-1', loyaltyPoints: options.stored ?? 45,
    nicknameKey: options.nickname === undefined ? 'TRUSTED_HAND' : options.nickname, nicknameSuppressed: false,
  };
  const player = {
    id: 'player-1', roundId: 'round-1',
    accountId: options.self ? actor.id : 'player-account', displayName: 'Player',
    round: { id: 'round-1', status: options.status ?? 'ACTIVE', rulesetId: 'classic-og', rulesetVersion: '3.0-H' },
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    roundPlayer: { findUnique: vi.fn().mockResolvedValue(player) },
    crewMember: { findFirst: vi.fn().mockResolvedValue(member), update },
    crewLoyaltyEntry: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { points: options.actual ?? 50 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    crewMemberEvent: { create: event },
    crewRosterMigration: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    adminAuditLog: { create: audit },
  };
  const db = { $transaction: async (f: (client: typeof tx) => unknown) => f(tx) } as unknown as PrismaClient;
  return { db, tx, update, event, audit };
}

describe('2.1.0-G — admin correction provenance and fail-closed controls', () => {
  beforeEach(() => vi.restoreAllMocks());
  it('validates canonical earned totals and rejects arbitrary over-cap repairs', () => {
    expect(canonicalCrewLoyalty(0)).toBe(0);
    expect(canonicalCrewLoyalty(100)).toBe(100);
    for (const bad of [-1, 101, NaN, Infinity, 2.5, undefined]) {
      expect(() => canonicalCrewLoyalty(bad)).toThrow();
    }
  });
  it('detects off-ledger sources, daily and UTC Monday-week caps without bonuses', () => {
    const receipts = [
      { id: 'a', source: 'DEFENSE_HELD', points: 4, at },
      { id: 'b', source: 'DEFENSE_HELD', points: 4, at },
      { id: 'c', source: 'JOB_COMPLETED', points: 2, at },
      { id: 'd', source: 'TRAINED', points: 3, at },
      { id: 'e', source: 'JOB_COMPLETED', points: 0, at },
    ];
    expect(receiptProblems(receipts)).toEqual(expect.arrayContaining([
      expect.stringContaining('Daily cap exceeded'),
      expect.stringContaining('Invalid receipt d'),
    ]));
    expect(receiptProblems([receipts[0]!])).toEqual([]);
    const first = new Date('2026-12-28T00:00:00.000Z');
    expect(receiptProblems(Array.from({ length: 9 }, (_, i) => ({
      id: String(i), source: 'DEFENSE_HELD', points: 4,
      at: new Date(first.getTime() + Math.floor(i / 2) * 24 * 60 * 60_000),
    })))).toEqual(expect.arrayContaining([expect.stringContaining('Weekly cap exceeded')]));
  });
  it('repairs materialized totals from verified receipts, audits and resets stale names without touching cash', async () => {
    const { db, update, event, audit } = setup({ nickname: null });
    const result = await AdminCrewReleaseService.reconcile(db, actor, 'player-1', 'member-1',
      { reason: 'Correct numeric drift in materialized loyalty.', expectedPoints: 45 }, at);
    expect(result).toEqual({ memberId: 'member-1', before: 45, verified: 50, nicknameReset: false, auditId: 'audit-1' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { loyaltyPoints: 50 } });
    expect(event).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'ADMIN_CORRECTED', roundPlayerId: 'player-1' }) });
    expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'crew.loyalty-reconcile', reason: 'Correct numeric drift in materialized loyalty.' }) });
  });
  it('clears a catalog name if verified points no longer meet its threshold', async () => {
    const { db, update } = setup({ stored: 50, actual: 25 });
    const r = await AdminCrewReleaseService.reconcile(db, actor, 'player-1', 'member-1',
      { reason: 'Realign stored points to immutable receipts.', expectedPoints: 50 });
    expect(r.nicknameReset).toBe(true);
    expect(update).toHaveBeenCalledWith({ where: { id: 'member-1' }, data: { loyaltyPoints: 25, nicknameKey: null } });
  });
  it('rejects staff self-service, closed rounds, stale expected points, no-op or impossible receipts', async () => {
    for (const [opts, expected, input] of [
      [{ self: true }, 'ADMIN_SELF_ACTION', 45],
      [{ status: 'ENDED' }, 'ROUND_FINISHED', 45],
      [{ status: 'ARCHIVED' }, 'ROUND_FINISHED', 45],
      [{}, 'CREW_CORRECTION_STALE', 40],
      [{ actual: 45 }, 'CREW_CORRECTION_UNCHANGED', 45],
      [{ actual: 101 }, 'CREW_LEDGER_INVALID', 45],
    ] as const) {
      const { db, update, audit } = setup(opts);
      await expect(AdminCrewReleaseService.reconcile(db, actor, 'player-1', 'member-1',
        { reason: 'Investigate suspicious crew balance.', expectedPoints: input })).rejects.toMatchObject({ code: expected });
      expect(update).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    }
  });
  it('audits normal fail-closed roster reconciliation and does not touch player resources', async () => {
    const sync = vi.spyOn(CrewRosterService, 'sync').mockResolvedValue({ migrated: true, created: 2, moved: 0, released: 0 });
    const { db, audit } = setup();
    const result = await AdminCrewReleaseService.repairRoster(db, actor, 'player-1',
      'Recover a missing legacy roster migration.', at);
    expect(sync).toHaveBeenCalledWith(expect.any(Object), 'player-1', expect.objectContaining({ crewRoster: expect.any(Object) }), at);
    expect(audit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'crew.roster-repair' }) });
    expect(result.outcome?.created).toBe(2);
    sync.mockRestore();
  });
  it('rejects a legacy repair for an ended round or a staff-owned account', async () => {
    for (const [opts, code] of [[{ status: 'ENDED' }, 'ROUND_FINISHED'], [{ self: true }, 'ADMIN_SELF_ACTION']] as const) {
      const { db, audit } = setup(opts);
      await expect(AdminCrewReleaseService.repairRoster(db, actor, 'player-1', 'Inspect migration integrity.')).rejects.toMatchObject({ code });
      expect(audit).not.toHaveBeenCalled();
    }
  });
});
