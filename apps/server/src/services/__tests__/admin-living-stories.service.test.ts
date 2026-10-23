import { describe, expect, it, vi } from 'vitest';
import { AdminLivingStoriesService } from '../admin-living-stories.service.js';
import { LIVING_STORY_LIMITS, offerQuotaReason } from '../living-story-trigger.service.js';

const now = new Date('2026-10-16T18:00:00.000Z');
const round = { id: 'r1', rulesetId: 'classic-og-v2.1-a', rulesetVersion: '2.1.0-A',
  status: 'ACTIVE', pausedAt: null as Date | null, pausedMinutesTotal: 0 };
function setup() {
  const player = { id: 'p1', roundId: 'r1', cityId: 'detroit' };
  const memory = {
    id: 'm1', roundId: 'r1', cityId: 'detroit', kind: 'war_win',
    visibility: 'involved-only', actors: ['p1'], happenedAt: now, happenedAtActive: now,
  };
  let existing: any = null;
  const drafted: any[] = [];
  const db: any = {
    round: { findUnique: vi.fn(async () => round) },
    roundPlayer: { findFirst: vi.fn(async () => player) },
    cityMemoryEvent: { findFirst: vi.fn(async () => memory) },
    criminalCaseFile: {
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => existing),
      create: vi.fn(), upsert: vi.fn(), update: vi.fn(),
    },
    adminLivingStoryDraft: {
      findUnique: vi.fn(async () => drafted[0] ?? null),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: 'draft1', revision: 1, ...data };
        drafted.push(row);
        return row;
      }),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(drafted[0], data, { revision: drafted[0].revision + 1 });
        return drafted[0];
      }),
    },
    adminAuditLog: { create: vi.fn(async ({ data }: any) => data) },
  };
  const actor = { id: 'admin1', username: 'admin' };
  return { db, player, memory, drafted, actor, setExisting: (x: unknown) => { existing = x; } };
}
describe('2.0.0-G quota explanations', () => {
  it('matches authoritative actor, city, round and cooldown boundaries', () => {
    const empty = { owner: 0, city: 0, round: 0, cooldown: 0 };
    expect(offerQuotaReason(empty)).toBeNull();
    expect(offerQuotaReason({ ...empty, owner: LIVING_STORY_LIMITS.maxPerOwnerRound })).toBe('OWNER_CAP');
    expect(offerQuotaReason({ ...empty, city: LIVING_STORY_LIMITS.maxPerCityRound })).toBe('CITY_CAP');
    expect(offerQuotaReason({ ...empty, round: LIVING_STORY_LIMITS.maxPerRound })).toBe('ROUND_CAP');
    expect(offerQuotaReason({ ...empty, cooldown: 1 })).toBe('COOLDOWN');
  });
  it('uses the real source and pinned ruleset without inserting a case', async () => {
    const f = setup();
    const result = await AdminLivingStoriesService.diagnose(f.db, {
      roundId: 'r1', ownerId: 'p1', memoryId: 'm1', storyKey: 'STORY_AFTER_THE_SMOKE',
    }, now);
    expect(result).toMatchObject({ eligible: true, reason: 'ELIGIBLE', savedSource: true });
    expect(result.expiresAtActive).toBeTruthy();
    expect(f.db.criminalCaseFile.create).not.toHaveBeenCalled();
    f.setExisting({ id: 'case1', status: 'CLOSED' });
    const replay = await AdminLivingStoriesService.diagnose(f.db, {
      roundId: 'r1', ownerId: 'p1', memoryId: 'm1', storyKey: 'STORY_AFTER_THE_SMOKE',
    }, now);
    expect(replay).toMatchObject({ eligible: false, reason: 'ALREADY_OFFERED',
      existingCase: { id: 'case1' } });
    f.memory.visibility = 'public';
    f.memory.actors = [];
    const blocked = await AdminLivingStoriesService.diagnose(f.db, {
      roundId: 'r1', ownerId: 'p1', memoryId: 'm1', storyKey: 'STORY_AFTER_THE_SMOKE',
    }, now);
    expect(blocked.reason).toBe('NOT_INVOLVED');
  });
  it('synthetic test triggers only return a dry-run verdict without game writes', async () => {
    const f = setup();
    const accepted = await AdminLivingStoriesService.simulate(f.db, {
      roundId: 'r1', ownerId: 'p1', storyKey: 'STORY_AFTER_THE_SMOKE', eventKind: 'war_win',
      publicSource: false, participant: true,
    }, now);
    expect(accepted).toMatchObject({ dryRun: true, persisted: false,
      rewardGrantedCents: 0, contractEligible: true });
    const denied = await AdminLivingStoriesService.simulate(f.db, {
      roundId: 'r1', ownerId: 'p1', storyKey: 'STORY_AFTER_THE_SMOKE', eventKind: 'takeover',
      publicSource: false, participant: false,
    }, now);
    expect(denied.contractEligible).toBe(false);
    expect(f.db.criminalCaseFile.create).not.toHaveBeenCalled();
    expect(f.db.criminalCaseFile.upsert).not.toHaveBeenCalled();
    expect(f.db.criminalCaseFile.update).not.toHaveBeenCalled();
  });
  it('stores disabled drafts, audits edits and blocks pinned story replacement', async () => {
    const f = setup();
    const draft = {
      roundId: 'r1', key: 'STORY_QA_NEW', title: 'A New Lead',
      caseKey: 'CASE_MISSING_LEDGER' as const, eventKinds: ['war_win'],
      audience: 'ACTORS' as const, visibility: 'OWNER_ONLY' as const,
      expiresAfterActiveMinutes: 60, rewardBudgetCents: 100,
      reason: 'Manual QA proposal',
    };
    const saved = await AdminLivingStoriesService.writeDraft(f.db, f.actor, draft);
    expect(saved).toMatchObject({ enabled: false, revision: 1 });
    expect(f.db.adminAuditLog.create).toHaveBeenCalledTimes(1);
    await expect(AdminLivingStoriesService.writeDraft(f.db, f.actor, {
      ...draft, expectedRevision: 99,
    })).rejects.toMatchObject({ code: 'STORY_DRAFT_STALE' });
    await expect(AdminLivingStoriesService.writeDraft(f.db, f.actor, {
      ...draft, key: 'STORY_AFTER_THE_SMOKE',
    })).rejects.toMatchObject({ code: 'STORY_PINNED' });
    const tuned = await AdminLivingStoriesService.writeDraft(f.db, f.actor, {
      ...draft, title: 'Revised Lead', eventKinds: ['takeover'], expectedRevision: 1,
    });
    expect(tuned.revision).toBe(2);
    const audit = f.db.adminAuditLog.create.mock.calls[1]![0]!.data;
    expect(audit.before).toMatchObject({
      title: 'A New Lead', eventKinds: ['war_win'], expiresAfterActiveMinutes: 60,
    });
    expect(audit.after).toMatchObject({
      title: 'Revised Lead', eventKinds: ['takeover'], revision: 2,
    });
    const race = Object.assign(new Error('stale'), { code: 'P2025' });
    f.db.adminLivingStoryDraft.update.mockRejectedValueOnce(race);
    await expect(AdminLivingStoriesService.writeDraft(f.db, f.actor, {
      ...draft, expectedRevision: 2,
    })).rejects.toMatchObject({ code: 'STORY_DRAFT_STALE', statusCode: 409 });
    expect(f.db.adminAuditLog.create).toHaveBeenCalledTimes(2);
    // Two concurrent creates of the same key also fail with a user-visible 409.
    f.db.adminLivingStoryDraft.findUnique.mockResolvedValueOnce(null);
    f.db.adminLivingStoryDraft.create.mockRejectedValueOnce(Object.assign(
      new Error('duplicate'), { code: 'P2002' },
    ));
    await expect(AdminLivingStoriesService.writeDraft(f.db, f.actor, draft))
      .rejects.toMatchObject({ code: 'STORY_DRAFT_STALE', statusCode: 409 });
  });
});
