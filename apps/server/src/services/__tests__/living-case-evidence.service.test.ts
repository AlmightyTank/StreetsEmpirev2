import { describe, expect, it, vi } from 'vitest';
import { LIVING_CASE_BLUEPRINTS } from '@streets/rulesets';
import { recordLivingCaseActivity } from '../living-case-evidence.service.js';

const instant = new Date('2026-10-16T12:00:00.000Z');
const at = (m: number) => new Date(instant.getTime() + m * 60_000);
function makeFixture() {
  const round = {
    id: 'round-1', status: 'ACTIVE', pausedAt: null as Date | null,
    pausedMinutesTotal: 0, rulesetId: 'classic-og-v3.0-e', rulesetVersion: '3.0.0-E',
  };
  const blueprint = LIVING_CASE_BLUEPRINTS.CASE_THE_FIFTH_WITNESS;
  const cases: any[] = [
    { id: 'case-a', ownerId: 'player-a', roundId: 'round-1', status: 'ACTIVE',
      rulesetId: round.rulesetId, rulesetVersion: round.rulesetVersion,
      acceptedAt: instant, expiresAtActive: at(24 * 60), cluePlan: blueprint.clues },
    { id: 'case-b', ownerId: 'player-a', roundId: 'round-1', status: 'ACTIVE',
      rulesetId: round.rulesetId, rulesetVersion: round.rulesetVersion,
      acceptedAt: at(1), expiresAtActive: at(24 * 60), cluePlan: blueprint.clues },
  ];
  const evidence: any[] = [];
  const db: any = {
    roundPlayer: { findUnique: vi.fn(async ({ where }: any) =>
      where.id === 'player-a' ? { roundId: round.id, round } : null) },
    criminalCaseFile: {
      findMany: vi.fn(async ({ where, take }: any) => cases.filter((c) =>
        c.ownerId === where.ownerId && c.roundId === where.roundId && c.status === 'ACTIVE'
        && c.acceptedAt <= where.acceptedAt.lte
        && c.expiresAtActive > where.expiresAtActive.gt
      ).slice(0, take).map((c) => ({ id: c.id }))),
      findFirst: vi.fn(async ({ where }: any) => {
        const row = cases.find((c) => c.id === where.id && c.ownerId === where.ownerId && c.roundId === where.roundId);
        return row ? { ...row, evidence: evidence.filter((e) => e.caseId === row.id) } : null;
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(cases.find((c) => c.id === where.id), data)),
    },
    criminalCaseEvidence: {
      findUnique: vi.fn(async ({ where }: any) => evidence.find((e) => e.sourceReceiptId === where.sourceReceiptId) ?? null),
      create: vi.fn(async ({ data }: any) => {
        if (evidence.some((e) => e.sourceReceiptId === data.sourceReceiptId)) throw new Error('Duplicate receipt');
        const row = { id: 'e-' + evidence.length, ...data };
        evidence.push(row);
        return row;
      }),
    },
    $queryRaw: vi.fn(async () => [{ id: 'case-a' }]),
  };
  const receipt = (id: string, type: 'SCOUT' | 'INFORMANT_TIP' | 'COMBAT_RECON' | 'RUN_RETURNED' | 'RANDOM_ENCOUNTER_CHOICE' | 'QUEST_CLAIMED', minutes = 2) => ({
    id, roundPlayerId: 'player-a', type, createdAt: at(minutes),
  });
  return { round, cases, evidence, db, receipt };
}

describe('2.0.0-D server-owned case evidence', () => {
  it('collects Scout, paid informant tip and resolved encounter, in order', async () => {
    const f = makeFixture();
    expect(await recordLivingCaseActivity(f.db, f.receipt('early-encounter', 'RANDOM_ENCOUNTER_CHOICE'))).toBe(0);
    expect(await recordLivingCaseActivity(f.db, f.receipt('scout-1', 'SCOUT'))).toBe(1);
    expect(await recordLivingCaseActivity(f.db, f.receipt('claim-1', 'QUEST_CLAIMED', 3))).toBe(0);
    expect(await recordLivingCaseActivity(f.db, f.receipt('contact-1', 'INFORMANT_TIP', 3))).toBe(1);
    expect(await recordLivingCaseActivity(f.db, f.receipt('encounter-1', 'RANDOM_ENCOUNTER_CHOICE', 4))).toBe(1);
    expect(f.evidence.map((e) => e.sourceKind)).toEqual(['SCOUT', 'CONTACT', 'ENCOUNTER']);
    expect(f.cases[0]!.status).toBe('SOLVED');
    expect(f.cases[1]!.status).toBe('ACTIVE');
    expect(await recordLivingCaseActivity(f.db, f.receipt('encounter-1', 'RANDOM_ENCOUNTER_CHOICE', 4))).toBe(0);
  });

  it('supports turn-spending recon as an alternative to one-time informant purchases', async () => {
    const f = makeFixture();
    expect(await recordLivingCaseActivity(f.db, f.receipt('scout', 'SCOUT'))).toBe(1);
    expect(await recordLivingCaseActivity(f.db, f.receipt('recon', 'COMBAT_RECON', 3))).toBe(1);
    expect(f.evidence.map((e) => e.sourceKind)).toEqual(['SCOUT', 'CONTACT']);
    expect(await recordLivingCaseActivity(f.db, f.receipt('tip-after-recon', 'INFORMANT_TIP', 4))).toBe(0);
  });

  it('does not reuse a single receipt across two active cases', async () => {
    const f = makeFixture();
    expect(await recordLivingCaseActivity(f.db, f.receipt('scout-1', 'SCOUT', 2))).toBe(1);
    expect(await recordLivingCaseActivity(f.db, f.receipt('scout-1', 'SCOUT', 2))).toBe(0);
    expect(f.evidence).toHaveLength(1);
    expect(f.evidence[0].caseId).toBe('case-a');
    expect(await recordLivingCaseActivity(f.db, f.receipt('scout-2', 'SCOUT', 3))).toBe(1);
    expect(f.evidence[1].caseId).toBe('case-b');
  });

  it('never advances unaccepted, paused, expired, or mismatched-round cases', async () => {
    const f = makeFixture();
    f.cases[0].acceptedAt = at(20);
    expect(await recordLivingCaseActivity(f.db, f.receipt('past', 'SCOUT', 2))).toBe(1); // second accepted case
    f.evidence.splice(0);
    f.round.pausedAt = at(1);
    expect(await recordLivingCaseActivity(f.db, f.receipt('pause', 'SCOUT', 3))).toBe(0);
    f.round.pausedAt = null;
    f.cases[0].status = 'EXPIRED';
    f.cases[1].expiresAtActive = at(3);
    expect(await recordLivingCaseActivity(f.db, f.receipt('expired', 'INFORMANT_TIP', 3))).toBe(0);
    f.cases[1].expiresAtActive = at(24 * 60);
    f.cases[1].rulesetVersion = 'some-other-version';
    expect(await recordLivingCaseActivity(f.db, f.receipt('mismatch', 'INFORMANT_TIP', 3))).toBe(0);
  });

  it('does not accept another player, unsupported actions or claim-derived alerts', async () => {
    const f = makeFixture();
    expect(await recordLivingCaseActivity(f.db, { id: 'foreign', roundPlayerId: 'player-z', type: 'SCOUT', createdAt: at(2) })).toBe(0);
    expect(await recordLivingCaseActivity(f.db, f.receipt('quest', 'QUEST_CLAIMED'))).toBe(0);
    expect(await recordLivingCaseActivity(f.db, f.receipt('travel', 'RUN_RETURNED'))).toBe(0);
    expect(f.evidence).toHaveLength(0);
  });
});
