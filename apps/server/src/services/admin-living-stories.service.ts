import type { AdminLivingStoryDraft, PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { activeRoundEventTime, defineLivingStoryCatalog, livingStoryCatalogForRuleset,
  LIVING_CASE_REWARD_CENTS } from '@streets/rulesets';
import type { LivingCaseKey, LivingStoryDefinition } from '@streets/rulesets';
import { loadRulesetForRound } from '@streets/rules-engine';
import { evaluateLivingStoryOffer } from './living-story-contract.service.js';
import { LIVING_STORY_LIMITS, offerQuotaReason } from './living-story-trigger.service.js';
import { AdminAuditService } from './admin-audit.service.js';
import type { AuditActor } from './admin-audit.service.js';

export interface StoryDraftInput {
  key: string;
  title: string;
  caseKey: LivingCaseKey;
  eventKinds: string[];
  audience: 'ACTORS' | 'CITY_PLAYERS';
  visibility: 'OWNER_ONLY' | 'PUBLIC_SUMMARY';
  expiresAfterActiveMinutes: number;
  rewardBudgetCents: number;
}
export interface StoryDiagnosticsInput {
  roundId: string; ownerId: string; memoryId: string; storyKey: string;
}

function draftSnapshot(row: {
  key: string; title: string; caseKey: string; eventKinds: unknown;
  audience: string; visibility: string; expiresAfterActiveMinutes: number;
  rewardBudgetCents: number; revision: number; enabled: boolean;
}) {
  return {
    key: row.key, title: row.title, caseKey: row.caseKey,
    eventKinds: row.eventKinds, audience: row.audience, visibility: row.visibility,
    expiresAfterActiveMinutes: row.expiresAfterActiveMinutes,
    rewardBudgetCents: row.rewardBudgetCents, revision: row.revision, enabled: row.enabled,
  };
}

async function roundAndCatalog(db: Db, roundId: string) {
  const round = await db.round.findUnique({ where: { id: roundId } });
  if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That season could not be found.');
  const ruleset = loadRulesetForRound(round);
  return { round, ruleset, catalog: livingStoryCatalogForRuleset(ruleset) };
}

export const AdminLivingStoriesService = {
  async overview(prisma: PrismaClient, roundId: string) {
    const { round, catalog } = await roundAndCatalog(prisma, roundId);
    const [recentSources, cases, drafts] = await Promise.all([
      prisma.cityMemoryEvent.findMany({
        where: { roundId }, orderBy: { happenedAt: 'desc' }, take: 30,
        select: { id: true, kind: true, cityId: true, visibility: true, happenedAt: true },
      }),
      prisma.criminalCaseFile.findMany({
        where: { roundId }, take: 500, orderBy: { createdAt: 'desc' },
        select: { status: true, rewardCents: true },
      }),
      prisma.adminLivingStoryDraft.findMany({ where: { baseRulesetId: round.rulesetId },
        orderBy: { updatedAt: 'desc' }, take: 50 }),
    ]);
    return {
      round: { id: round.id, status: round.status, paused: Boolean(round.pausedAt),
        rulesetId: round.rulesetId, rulesetVersion: round.rulesetVersion },
      catalog: Object.values(catalog).map((d) => ({
        key: d.key, title: d.title, caseKey: d.caseKey, audience: d.audience,
        eventKinds: [...d.trigger.eventKinds], sourceKind: d.trigger.sourceKind,
        visibility: d.visibility, enabled: d.enabled,
        expiresAfterActiveMinutes: d.expiresAfterActiveMinutes,
        rewardBudgetCents: d.rewardBudgetCents,
        weight: 1, // Catalog has no weighted selector: these are eligibility matches.
      })),
      limits: LIVING_STORY_LIMITS,
      recentSources: recentSources.map((s) => ({ ...s, happenedAt: s.happenedAt.toISOString() })),
      caseStats: {
        totalSampled: cases.length, truncated: cases.length === 500,
        byStatus: Object.fromEntries(['LOCKED', 'AVAILABLE', 'ACTIVE', 'SOLVED', 'CLOSED', 'EXPIRED']
          .map((status) => [status, cases.filter((c) => c.status === status).length])),
        rewardCentsSampled: cases.reduce((sum, c) => sum + c.rewardCents, 0),
      },
      drafts: drafts.map((d) => ({
        ...d, enabled: false, createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      })),
    };
  },

  /** Explain exactly why one persisted source can (or cannot) offer a case.
   * Does not create a source, case or payout. */
  async diagnose(db: Db, input: StoryDiagnosticsInput, now = new Date()) {
    const { round, ruleset } = await roundAndCatalog(db, input.roundId);
    const [player, memory] = await Promise.all([
      db.roundPlayer.findFirst({ where: { id: input.ownerId, roundId: round.id },
        select: { id: true, roundId: true, cityId: true } }),
      db.cityMemoryEvent.findFirst({ where: { id: input.memoryId, roundId: round.id } }),
    ]);
    if (!player || !memory) throw AppError.notFound('STORY_SOURCE_NOT_FOUND',
      'Choose an existing player and a saved source within this season.');
    const actors = Array.isArray(memory.actors)
      ? memory.actors.filter((id): id is string => typeof id === 'string') : [];
    const decision = evaluateLivingStoryOffer(ruleset, input.storyKey, {
      roundId: memory.roundId, cityId: memory.cityId, sourceKind: 'CITY_MEMORY',
      sourceId: memory.id, eventKind: memory.kind,
      visibility: memory.visibility === 'public' ? 'public' : 'involved-only',
      actorRoundPlayerIds: actors,
      happenedAtActive: memory.happenedAtActive ?? activeRoundEventTime(round, memory.happenedAt),
    }, { roundId: round.id, cityId: player.cityId, roundPlayerId: player.id,
      roundClock: round, now });
    const activeNow = activeRoundEventTime(round, now);
    const [owner, city, total, cooldown, existing] = await Promise.all([
      db.criminalCaseFile.count({ where: { roundId: round.id, ownerId: player.id } }),
      db.criminalCaseFile.count({ where: { roundId: round.id, cityId: player.cityId } }),
      db.criminalCaseFile.count({ where: { roundId: round.id } }),
      db.criminalCaseFile.count({ where: { roundId: round.id, ownerId: player.id,
        offeredAtActive: { gte: new Date(activeNow.getTime() - LIVING_STORY_LIMITS.cooldownActiveMinutes * 60_000) } } }),
      db.criminalCaseFile.findFirst({ where: { roundId: round.id, ownerId: player.id,
        sourceMemoryId: memory.id, storyKey: input.storyKey }, select: { id: true, status: true } }),
    ]);
    const counts = { owner, city, round: total, cooldown };
    const reason = round.status !== 'ACTIVE' ? 'ROUND_INACTIVE'
      : !decision.eligible ? decision.reason
        : existing ? 'ALREADY_OFFERED'
          : offerQuotaReason(counts) ?? 'ELIGIBLE';
    return {
      eligible: reason === 'ELIGIBLE',
      reason,
      savedSource: true,
      source: { id: memory.id, kind: memory.kind, visibility: memory.visibility,
        happenedAt: memory.happenedAt.toISOString() },
      counts, limits: LIVING_STORY_LIMITS,
      existingCase: existing ? { id: existing.id, status: existing.status } : null,
      expiresAtActive: decision.eligible ? decision.expiresAtActive.toISOString() : null,
      ruleset: { id: round.rulesetId, version: round.rulesetVersion },
    };
  },

  /**
   * Admin dry-run test trigger: use a synthetic source only in memory,
   * NEVER emit CityMemoryEvent or call tryOfferLivingStory. No reward possible.
   */
  async simulate(db: Db, input: { roundId: string; ownerId: string; storyKey: string;
    eventKind: string; publicSource: boolean; participant: boolean }, now = new Date()) {
    const { round, ruleset } = await roundAndCatalog(db, input.roundId);
    const player = await db.roundPlayer.findFirst({
      where: { id: input.ownerId, roundId: round.id },
      select: { id: true, cityId: true },
    });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'Use a player from the selected season.');
    const decision = evaluateLivingStoryOffer(ruleset, input.storyKey, {
      roundId: round.id, cityId: player.cityId,
      sourceKind: 'CITY_MEMORY', sourceId: 'qa-dry-run-only', eventKind: input.eventKind,
      visibility: input.publicSource ? 'public' : 'involved-only',
      actorRoundPlayerIds: input.participant ? [player.id] : [],
      happenedAtActive: activeRoundEventTime(round, now),
    }, { roundId: round.id, cityId: player.cityId, roundPlayerId: player.id,
      roundClock: round, now });
    return { dryRun: true, persisted: false, rewardGrantedCents: 0,
      contractEligible: round.status === 'ACTIVE' && decision.eligible,
      reason: round.status !== 'ACTIVE' ? 'ROUND_INACTIVE' : decision.eligible ? 'CONTRACT_MATCH'
        : decision.reason,
      note: 'Hypothetical contract match only. Quotas, source receipts and real-case creation are not executed.' };
  },

  async writeDraft(db: Db, actor: AuditActor, input: StoryDraftInput & {
    roundId: string; reason: string; expectedRevision?: number;
  }) {
    const { round, catalog } = await roundAndCatalog(db, input.roundId);
    if (catalog[input.key]) throw AppError.conflict('STORY_PINNED',
      'An active pinned story cannot be replaced by a QA draft. Use a new story key.');
    if (input.rewardBudgetCents > LIVING_CASE_REWARD_CENTS) throw AppError.badRequest('STORY_REWARD_CAP',
      'The preview budget exceeds the fixed per-case ceiling.');
    const proposed: LivingStoryDefinition = {
      key: input.key, title: input.title, caseKey: input.caseKey,
      trigger: { sourceKind: 'CITY_MEMORY', eventKinds: input.eventKinds },
      audience: input.audience, visibility: input.visibility,
      expiresAfterActiveMinutes: input.expiresAfterActiveMinutes,
      rewardBudgetCents: input.rewardBudgetCents, enabled: false,
    };
    defineLivingStoryCatalog({ [input.key]: proposed });
    const existing = await db.adminLivingStoryDraft.findUnique({
      where: { baseRulesetId_key: { baseRulesetId: round.rulesetId, key: input.key } },
    });
    if (existing && input.expectedRevision !== existing.revision) throw AppError.conflict('STORY_DRAFT_STALE',
      'This draft changed since you opened it. Reload before tuning.');
    if (!existing && input.expectedRevision !== undefined) throw AppError.conflict('STORY_DRAFT_STALE',
      'This draft no longer exists. Reload the authoring panel.');
    const data = {
      title: input.title, caseKey: input.caseKey, eventKinds: input.eventKinds,
      audience: input.audience, visibility: input.visibility,
      expiresAfterActiveMinutes: input.expiresAfterActiveMinutes,
      rewardBudgetCents: input.rewardBudgetCents,
      enabled: false, updatedByAccountId: actor.id,
    };
    let saved: AdminLivingStoryDraft;
    try {
      saved = existing
        ? await db.adminLivingStoryDraft.update({
          where: { id: existing.id, revision: existing.revision },
          data: { ...data, revision: { increment: 1 } },
        })
        : await db.adminLivingStoryDraft.create({
          data: { ...data, key: input.key, baseRulesetId: round.rulesetId,
            baseRulesetVersion: round.rulesetVersion, createdByAccountId: actor.id },
        });
    } catch (error) {
      // The read and guarded update may race a simultaneous admin save.
      // A unique create collision also means another admin just made this key.
      // Neither should surface as an INTERNAL_ERROR.
      if (error && typeof error === 'object' && 'code' in error
        && (error.code === 'P2025' || error.code === 'P2002')) {
        throw AppError.conflict('STORY_DRAFT_STALE',
          'This story draft changed during your save. Reload before trying again.');
      }
      throw error;
    }
    await AdminAuditService.record(db, actor, {
      action: existing ? 'living-story.draft-tune' : 'living-story.draft-create',
      targetType: 'living-story-draft', targetId: saved.id, reason: input.reason,
      before: existing ? draftSnapshot(existing) : null,
      after: { ...draftSnapshot(saved), baseRulesetId: saved.baseRulesetId,
        baseRulesetVersion: saved.baseRulesetVersion },
    });
    return { id: saved.id, key: saved.key, revision: saved.revision,
      baseRulesetId: saved.baseRulesetId, enabled: false };
  },
};
