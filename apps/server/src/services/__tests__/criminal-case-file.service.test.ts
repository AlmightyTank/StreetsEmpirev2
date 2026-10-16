import { describe, expect, it, vi } from 'vitest';
import { CriminalCaseFileService } from '../criminal-case-file.service.js';
import { LIVING_CASE_BLUEPRINTS, LIVING_STORIES_STARTER_CATALOG } from '@streets/rulesets';

vi.mock('@streets/rules-engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('@streets/rules-engine')>();
  return {
    ...original,
    loadRulesetForRound: () => ({
      meta: { id: 'test-pinned', version: '2.0.0-B' },
      livingStories: {
        STORY_AFTER_THE_SMOKE: { ...LIVING_STORIES_STARTER_CATALOG.STORY_AFTER_THE_SMOKE, enabled: true },
      },
    }),
  };
});

const baseNow = new Date('2026-10-16T12:00:00.000Z');
const at = (minutes: number) => new Date(baseNow.getTime() + minutes * 60_000);

function makeDb() {
  const state = {
    round: {
      id: 'round-1', rulesetId: 'test-pinned', rulesetVersion: '2.0.0-B',
      pausedAt: null as Date | null, pausedMinutesTotal: 0, status: 'ACTIVE',
    },
    player: { id: 'player-a', roundId: 'round-1', cityId: 'detroit' },
    memory: {
      id: 'memory-1', roundId: 'round-1', cityId: 'detroit',
      kind: 'war_win', visibility: 'involved-only', actors: ['player-a'],
      happenedAt: at(-1),
    },
    cases: [] as any[],
    evidence: [] as any[],
    activities: [] as any[],
  };
  const withEvidence = (row: any) => row && ({ ...row, evidence: state.evidence.filter((e) => e.caseId === row.id) });
  const db: any = {
    round: { findUnique: vi.fn(async () => state.round) },
    roundPlayer: { findUnique: vi.fn(async () => state.player) },
    cityMemoryEvent: { findUnique: vi.fn(async () => state.memory) },
    criminalCaseFile: {
      upsert: vi.fn(async ({ where, create }: any) => {
        let row = state.cases.find((entry) => entry.offerDedupeKey === where.offerDedupeKey);
        if (!row) {
          row = {
            id: 'case-1', status: 'AVAILABLE', acceptedAt: null, solvedAt: null,
            closedAt: null, chosenBranch: null, createdAt: baseNow, ...create,
          };
          state.cases.push(row);
        }
        return withEvidence(row);
      }),
      findMany: vi.fn(async ({ where }: any) => state.cases.filter((c) => c.ownerId === where.ownerId && c.roundId === where.roundId).map(withEvidence)),
      findFirst: vi.fn(async ({ where }: any) => withEvidence(state.cases.find((c) => c.id === where.id && c.ownerId === where.ownerId))),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.cases.find((entry) => entry.id === where.id);
        Object.assign(row, data); return withEvidence(row);
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const row = state.cases.find((entry) => entry.id === where.id);
        if (!row || !where.status.in.includes(row.status)) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      }),
    },
    criminalCaseEvidence: {
      create: vi.fn(async ({ data }: any) => {
        if (state.evidence.some((e) => e.caseId === data.caseId && (
          e.clueKey === data.clueKey || e.sourceKind === data.sourceKind || e.sourceReceiptId === data.sourceReceiptId
        ))) throw Object.assign(new Error('Duplicate evidence'), { code: 'P2002' });
        const evidence = { id: 'ev-' + (state.evidence.length + 1), recordedAt: at(1), ...data };
        state.evidence.push(evidence); return evidence;
      }),
    },
    playerActivity: { findUnique: vi.fn(async ({ where }: any) => state.activities.find((e) => e.id === where.id) ?? null) },
    $queryRaw: vi.fn(async (_query: any, id: string, ownerId: string) =>
      state.cases.some((row) => row.id === id && row.ownerId === ownerId) ? [{ id }] : []),
    $transaction: vi.fn(async (fn: any) => fn(db)),
  };
  async function offer() {
    return CriminalCaseFileService.offerFromCityMemory(db, {
      ownerId: 'player-a', storyKey: 'STORY_AFTER_THE_SMOKE', cityMemoryId: 'memory-1', now: baseNow,
    });
  }
  return { state, db, offer };
}

describe('Living Streets 2.0.0-B case file persistence', () => {
  it('offers once from a verified and actor-authorized CityMemory event', async () => {
    const { db, state, offer } = makeDb();
    const first = await offer(), second = await offer();
    expect(first?.status).toBe('AVAILABLE');
    expect(second?.id).toBe(first?.id);
    expect(state.cases).toHaveLength(1);
    expect(state.cases[0].rulesetVersion).toBe('2.0.0-B');
    expect(first?.cluesRequired).toBe(LIVING_CASE_BLUEPRINTS.CASE_THE_FIFTH_WITNESS.clues.length);
    expect(state.evidence).toHaveLength(0);
    expect(db.criminalCaseFile.upsert).toHaveBeenCalledTimes(2);
  });

  it('does not offer private events to nonactors, other cities, or old events', async () => {
    const { state, offer } = makeDb();
    state.memory.actors = ['player-b'];
    expect(await offer()).toBeNull();
    state.memory.actors = ['player-a'];
    state.memory.cityId = 'boston';
    expect(await offer()).toBeNull();
    state.memory.cityId = 'detroit';
    state.memory.happenedAt = at(-5);
    expect(await offer()).toBeNull();
    expect(state.cases).toHaveLength(0);
  });

  it('opens once, verifies each receipt in order, and safely closes only after solving', async () => {
    const { db, state, offer } = makeDb();
    await offer();
    await expect(CriminalCaseFileService.close(db, 'player-a', 'case-1', 'SEEK_TRUCE', at(1)))
      .rejects.toMatchObject({ code: 'CASE_UNSOLVED' });
    expect((await CriminalCaseFileService.activate(db, 'player-a', 'case-1', at(0))).status).toBe('ACTIVE');
    expect((await CriminalCaseFileService.activate(db, 'player-a', 'case-1', at(0))).status).toBe('ACTIVE');
    state.activities.push(
      { id: 'scout-1', roundPlayerId: 'player-a', type: 'SCOUT', createdAt: at(1) },
      { id: 'contact-1', roundPlayerId: 'player-a', type: 'QUEST_CLAIMED', createdAt: at(2) },
      { id: 'encounter-1', roundPlayerId: 'player-a', type: 'RANDOM_ENCOUNTER_CHOICE', createdAt: at(3) },
    );
    let result = await CriminalCaseFileService.recordVerifiedActivity(db, 'player-a', 'case-1', 'contact-1', at(2));
    expect(result.cluesFound).toBe(0);
    result = await CriminalCaseFileService.recordVerifiedActivity(db, 'player-a', 'case-1', 'scout-1', at(1));
    expect(result.cluesFound).toBe(1);
    result = await CriminalCaseFileService.recordVerifiedActivity(db, 'player-a', 'case-1', 'scout-1', at(2));
    expect(result.cluesFound).toBe(1);
    result = await CriminalCaseFileService.recordVerifiedActivity(db, 'player-a', 'case-1', 'contact-1', at(2));
    expect(result.cluesFound).toBe(2);
    result = await CriminalCaseFileService.recordVerifiedActivity(db, 'player-a', 'case-1', 'encounter-1', at(3));
    expect(result.status).toBe('SOLVED');
    expect(result.cluesFound).toBe(3);
    await expect(CriminalCaseFileService.close(db, 'player-a', 'case-1', 'FAKE', at(4)))
      .rejects.toMatchObject({ code: 'CASE_BRANCH_INVALID' });
    const completed = await CriminalCaseFileService.close(db, 'player-a', 'case-1', 'SEEK_TRUCE', at(4));
    expect(completed.status).toBe('CLOSED');
    expect(completed.chosenBranch).toBe('SEEK_TRUCE');
    expect((await CriminalCaseFileService.close(db, 'player-a', 'case-1', 'SEEK_TRUCE', at(4))).status).toBe('CLOSED');
    expect(state.evidence).toHaveLength(3);
  });

  it('rejects foreign IDs and ignores historical or other-player evidence', async () => {
    const { db, state, offer } = makeDb();
    await offer();
    await expect(CriminalCaseFileService.get(db, 'player-b', 'case-1')).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
    await expect(CriminalCaseFileService.activate(db, 'player-b', 'case-1')).rejects.toMatchObject({ code: 'CASE_NOT_FOUND' });
    await CriminalCaseFileService.activate(db, 'player-a', 'case-1', at(0));
    state.activities.push(
      { id: 'foreign', roundPlayerId: 'player-b', type: 'SCOUT', createdAt: at(1) },
      { id: 'historical', roundPlayerId: 'player-a', type: 'SCOUT', createdAt: at(-30) },
      { id: 'legit', roundPlayerId: 'player-a', type: 'SCOUT', createdAt: at(1) },
    );
    for (const id of ['foreign', 'historical', 'missing']) {
      expect((await CriminalCaseFileService.recordVerifiedActivity(db, 'player-a', 'case-1', id, at(1))).cluesFound).toBe(0);
    }
    expect((await CriminalCaseFileService.recordVerifiedActivity(db, 'player-a', 'case-1', 'legit', at(1))).cluesFound).toBe(1);
  });

  it('does not settle paused cases, persists expiry, and reads without writing', async () => {
    const { db, state, offer } = makeDb();
    await offer();
    state.round.pausedAt = at(1);
    await expect(CriminalCaseFileService.activate(db, 'player-a', 'case-1', at(30)))
      .rejects.toMatchObject({ code: 'CASE_ROUND_UNAVAILABLE' });
    const pausedView = await CriminalCaseFileService.page(db, 'round-1', 'player-a', at(2000));
    expect(pausedView.active).toHaveLength(1);
    state.round.pausedAt = null;
    const lapsed = await CriminalCaseFileService.page(db, 'round-1', 'player-a', at(2000));
    expect(lapsed.archived[0].status).toBe('EXPIRED');
    expect(state.cases[0].status).toBe('AVAILABLE'); // GET cannot write.
    const archived = await CriminalCaseFileService.activate(db, 'player-a', 'case-1', at(2000));
    expect(archived.status).toBe('EXPIRED');
    expect(state.cases[0].status).toBe('EXPIRED');
  });
});
