import { describe, expect, it, vi } from 'vitest';
import { classicOgV30E, classicOgV30F, LIVING_CASE_BLUEPRINTS, LIVING_CASE_REWARD_CENTS,
  LIVING_CASE_ROUND_REWARD_MAX_CENTS, criminalCaseOutcome, validateLivingCaseOutcomes } from '@streets/rulesets';
import { CriminalCaseFileService } from '../criminal-case-file.service.js';

vi.mock('@streets/rules-engine', async (importOriginal) => {
  const module = await importOriginal<typeof import('@streets/rules-engine')>();
  return { ...module, loadRulesetForRound: (round: { rulesetId: string }) =>
    round.rulesetId === 'classic-og-v3.0-f' ? classicOgV30F : classicOgV30E };
});
const now = new Date('2026-10-16T13:00:00.000Z');
const branches = LIVING_CASE_BLUEPRINTS.CASE_THE_FIFTH_WITNESS.branchKeys;

function fixture(opts: { historical?: boolean; initialRewards?: number } = {}) {
  const ruleset = opts.historical ? classicOgV30E : classicOgV30F;
  const round = {
    id: 'round-1', status: 'ACTIVE', pausedAt: null as Date | null, pausedMinutesTotal: 0,
    rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
  };
  const player = { id: 'player-a', cashCents: 10_000n, netWorthCents: 20_000n };
  const row: any = {
    id: 'case-1', ownerId: player.id, roundId: round.id, cityId: 'detroit',
    rulesetId: round.rulesetId, rulesetVersion: round.rulesetVersion,
    caseKey: 'CASE_THE_FIFTH_WITNESS', storyKey: 'STORY_AFTER_THE_SMOKE',
    status: 'SOLVED', branchKeys: branches, chosenBranch: null, chosenAt: null,
    closedAt: null, acceptedAt: now, solvedAt: now, expiresAtActive: new Date(now.getTime()+100_000),
    createdAt: now, cluePlan: LIVING_CASE_BLUEPRINTS.CASE_THE_FIFTH_WITNESS.clues,
    evidence: [], rewardCents: 0, rewardClaimedAt: null,
  };
  const history: Array<{ rewardCents: number }> = Array.from({ length: opts.initialRewards ?? 0 },
    () => ({ rewardCents: LIVING_CASE_REWARD_CENTS }));
  const ledger: any[] = [];
  const db: any = {
    round: { findUnique: vi.fn(async () => round) },
    criminalCaseFile: {
      findFirst: vi.fn(async ({ where }: any) => where.id === row.id && where.ownerId === row.ownerId ? { ...row } : null),
      update: vi.fn(async ({ data }: any) => { Object.assign(row, data); return row; }),
      aggregate: vi.fn(async () => ({
        _sum: { rewardCents: history.reduce((total, entry) => total + entry.rewardCents, 0) },
      })),
    },
    roundPlayer: { update: vi.fn(async ({ data }: any) => {
      player.cashCents += data.cashCents.increment;
      player.netWorthCents += data.netWorthCents.increment;
    }) },
    economyLedgerEntry: { create: vi.fn(async ({ data }: any) => {
      ledger.push(data); history.push({ rewardCents: Number(data.amountCents) }); return data;
    }) },
    $queryRaw: vi.fn(async () => [{ id: row.id }]),
    $transaction: vi.fn(async (fn: any) => fn(db)),
  };
  return { db, player, row, round, ledger, history };
}

describe('2.0.0-E authored conclusion contracts', () => {
  it('has a non-punitive outcome for every offered branch', () => {
    expect(() => validateLivingCaseOutcomes()).not.toThrow();
    for (const blueprint of Object.values(LIVING_CASE_BLUEPRINTS)) for (const branch of blueprint.branchKeys) {
      expect(criminalCaseOutcome(blueprint.key, branch)).toMatchObject({ choiceCostCents: 0, key: branch });
    }
  });
  it('opt-in F can pay $25; pinned E definitions remain zero-reward', () => {
    expect(classicOgV30E.livingStories.STORY_AFTER_THE_SMOKE.rewardBudgetCents).toBe(0);
    expect(classicOgV30F.livingStories.STORY_AFTER_THE_SMOKE?.rewardBudgetCents).toBe(LIVING_CASE_REWARD_CENTS);
    expect(classicOgV30E.meta.id).not.toBe(classicOgV30F.meta.id);
  });
});

describe('2.0.0-E one-time case settlement', () => {
  it('pays once and repeats the same outcome without additional ledger lines', async () => {
    const f = fixture();
    const first = await CriminalCaseFileService.close(f.db, 'player-a', 'case-1', 'SEEK_TRUCE', now);
    expect(first.status).toBe('CLOSED');
    expect(first.outcome).toMatchObject({ title: 'A Fragile Peace', category: 'PEACE' });
    expect(first.rewardCents).toBe(LIVING_CASE_REWARD_CENTS);
    expect(first.rewardClaimedAt).toBe(now.toISOString());
    expect(first.choiceDetails).toHaveLength(2);
    expect(f.player.cashCents).toBe(12_500n);
    expect(f.player.netWorthCents).toBe(22_500n);
    expect(f.ledger).toHaveLength(1);
    expect(f.ledger[0].metadata).toEqual({ caseFileId: 'case-1', caseKey: 'CASE_THE_FIFTH_WITNESS' });
    const second = await CriminalCaseFileService.close(f.db, 'player-a', 'case-1', 'SEEK_TRUCE', now);
    expect(second.rewardCents).toBe(first.rewardCents);
    expect(f.ledger).toHaveLength(1);
    expect(f.db.roundPlayer.update).toHaveBeenCalledTimes(1);
    await expect(CriminalCaseFileService.close(f.db, 'player-a', 'case-1', 'REVEAL_INSTIGATOR', now))
      .rejects.toMatchObject({ code: 'CASE_ALREADY_CLOSED' });
    expect(f.ledger).toHaveLength(1);
  });
  it('older ruleset closes its story without a retroactive bonus', async () => {
    const f = fixture({ historical: true });
    const result = await CriminalCaseFileService.close(f.db, 'player-a', 'case-1', 'SEEK_TRUCE', now);
    expect(result.status).toBe('CLOSED');
    expect(result.rewardCents).toBe(0);
    expect(f.ledger).toHaveLength(0);
    expect(f.player.cashCents).toBe(10_000n);
  });
  it('blocks a fifth payout beyond the $100 per round ceiling', async () => {
    const f = fixture({ initialRewards: 4 });
    const result = await CriminalCaseFileService.close(f.db, 'player-a', 'case-1', 'SEEK_TRUCE', now);
    expect(result.rewardCents).toBe(0);
    expect(f.ledger).toHaveLength(0);
    expect(f.history.reduce((sum, item) => sum + item.rewardCents, 0)).toBe(LIVING_CASE_ROUND_REWARD_MAX_CENTS);
  });
  it('never pays for an incomplete, unowned, paused or invalid branch', async () => {
    const f = fixture();
    f.row.status = 'ACTIVE';
    await expect(CriminalCaseFileService.close(f.db, 'player-a', 'case-1', 'SEEK_TRUCE', now))
      .rejects.toMatchObject({ code: 'CASE_UNSOLVED' });
    f.row.status = 'SOLVED';
    await expect(CriminalCaseFileService.close(f.db, 'player-b', 'case-1', 'SEEK_TRUCE', now))
      .rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
    await expect(CriminalCaseFileService.close(f.db, 'player-a', 'case-1', 'FORGED', now))
      .rejects.toMatchObject({ code: 'CASE_BRANCH_INVALID' });
    f.round.pausedAt = now;
    await expect(CriminalCaseFileService.close(f.db, 'player-a', 'case-1', 'SEEK_TRUCE', now))
      .rejects.toMatchObject({ code: 'CASE_ROUND_UNAVAILABLE' });
    expect(f.ledger).toHaveLength(0);
  });
});
