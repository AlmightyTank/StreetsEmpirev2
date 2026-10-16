import type { Db } from '../utils/db.js';
import { activeRoundEventTime, livingStoryCatalogForRuleset } from '@streets/rulesets';
import { loadRulesetForRound } from '@streets/rules-engine';
import { evaluateLivingStoryOffer } from './living-story-contract.service.js';
import { CriminalCaseFileService } from './criminal-case-file.service.js';

export const LIVING_STORY_LIMITS = {
  maxPerOwnerRound: 4, maxPerCityRound: 100, maxPerRound: 350,
  cooldownActiveMinutes: 360, autoActorsPerEvent: 1,
} as const;
export const LIVING_STORY_MEMORY_KINDS = [
  'war_win', 'operation_complete', 'npc_gang_migration', 'takeover', 'city_condition_follow_up',
] as const;

/** Must run inside the caller's transaction. Only DB-owned source IDs are used. */
export async function tryOfferLivingStory(db: Db, input: {
  ownerId: string; memoryId: string; storyKey: string; now: Date;
}): Promise<boolean> {
  const [player, memory] = await Promise.all([
    db.roundPlayer.findUnique({ where: { id: input.ownerId }, select: { id: true, roundId: true, cityId: true } }),
    db.cityMemoryEvent.findUnique({ where: { id: input.memoryId } }),
  ]);
  if (!player || !memory || player.roundId !== memory.roundId || player.cityId !== memory.cityId) return false;
  const round = await db.round.findUnique({ where: { id: player.roundId } });
  if (!round || round.status !== 'ACTIVE' || round.pausedAt || memory.happenedAt > input.now) return false;
  const ruleset = loadRulesetForRound(round);
  const def = livingStoryCatalogForRuleset(ruleset)[input.storyKey];
  if (!def?.enabled || def.trigger.sourceKind !== 'CITY_MEMORY'
    || !def.trigger.eventKinds.includes(memory.kind)) return false;
  const actors = Array.isArray(memory.actors) ? memory.actors.filter((id): id is string => typeof id === 'string') : [];
  const check = evaluateLivingStoryOffer(ruleset, def.key, {
    roundId: memory.roundId, cityId: memory.cityId, sourceKind: 'CITY_MEMORY',
    sourceId: memory.id, eventKind: memory.kind,
    visibility: memory.visibility === 'public' ? 'public' : 'involved-only',
    actorRoundPlayerIds: actors,
    happenedAtActive: memory.happenedAtActive ?? activeRoundEventTime(round, memory.happenedAt),
  }, { roundId: round.id, cityId: player.cityId, roundPlayerId: player.id, roundClock: round, now: input.now });
  if (!check.eligible) return false;
  // Serializes quota checks and case insertion across the round, including
  // simultaneous opt-ins. Retried sources reuse the same case dedupe key.
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'living-stories:' + round.id}))`;
  const existing = await db.criminalCaseFile.findUnique({
    where: { offerDedupeKey: check.dedupeKey }, select: { id: true },
  });
  if (existing) return true;
  const activeNow = activeRoundEventTime(round, input.now);
  const [ownerCount, cityCount, roundCount, cooldownCount] = await Promise.all([
    db.criminalCaseFile.count({ where: { ownerId: player.id, roundId: round.id } }),
    db.criminalCaseFile.count({ where: { roundId: round.id, cityId: player.cityId } }),
    db.criminalCaseFile.count({ where: { roundId: round.id } }),
    db.criminalCaseFile.count({ where: { ownerId: player.id, roundId: round.id,
      offeredAtActive: { gte: new Date(activeNow.getTime() - LIVING_STORY_LIMITS.cooldownActiveMinutes * 60_000) } } }),
  ]);
  if (ownerCount >= LIVING_STORY_LIMITS.maxPerOwnerRound
    || cityCount >= LIVING_STORY_LIMITS.maxPerCityRound
    || roundCount >= LIVING_STORY_LIMITS.maxPerRound
    || cooldownCount > 0) return false;
  return (await CriminalCaseFileService.offerFromCityMemory(db, input)) !== null;
}

/** Only actors get automatic invitations. Public sources require opt-in. */
export async function inviteFromSettledMemory(
  db: Db, memory: { id: string; roundId: string; kind: string; actors: unknown; happenedAt: Date }, now: Date,
): Promise<number> {
  if (!(LIVING_STORY_MEMORY_KINDS as readonly string[]).includes(memory.kind)) return 0;
  const round = await db.round.findUnique({ where: { id: memory.roundId } });
  if (!round || round.status !== 'ACTIVE' || round.pausedAt) return 0;
  const defs = Object.values(livingStoryCatalogForRuleset(loadRulesetForRound(round))).filter((def) =>
    def.enabled && def.audience === 'ACTORS' && def.trigger.sourceKind === 'CITY_MEMORY'
      && def.trigger.eventKinds.includes(memory.kind));
  if (!defs.length) return 0;
  const actors = Array.isArray(memory.actors) ? [...new Set(memory.actors.filter((x): x is string => typeof x === 'string'))] : [];
  let offered = 0;
  for (const ownerId of actors.slice(0, LIVING_STORY_LIMITS.autoActorsPerEvent)) {
    for (const def of defs) {
      if (await tryOfferLivingStory(db, { ownerId, memoryId: memory.id, storyKey: def.key, now })) offered++;
    }
  }
  return offered;
}

/** Read-only city opportunities; no case rows are created by GET. */
export async function listPublicStoryOpportunities(
  db: Db, input: { roundId: string; ownerId: string; cityId: string; now: Date },
) {
  const round = await db.round.findUnique({ where: { id: input.roundId } });
  if (!round || round.status !== 'ACTIVE' || round.pausedAt) return [];
  const ruleset = loadRulesetForRound(round);
  const defs = Object.values(livingStoryCatalogForRuleset(ruleset)).filter((def) =>
    def.enabled && def.audience === 'CITY_PLAYERS' && def.trigger.sourceKind === 'CITY_MEMORY');
  if (!defs.length) return [];
  const rows = await db.cityMemoryEvent.findMany({
    where: { roundId: round.id, cityId: input.cityId, visibility: 'public',
      happenedAt: { gte: new Date(input.now.getTime() - 24 * 3_600_000) } },
    select: { id: true, roundId: true, cityId: true, kind: true, actors: true,
      happenedAt: true, happenedAtActive: true }, orderBy: { happenedAt: 'desc' }, take: 40,
  });
  const opportunities: Array<{ memoryId: string; storyKey: string; caseKey: string; title: string; expiresAtActive: string }> = [];
  for (const memory of rows) for (const def of defs) {
    const decision = evaluateLivingStoryOffer(ruleset, def.key, {
      roundId: memory.roundId, cityId: memory.cityId, sourceKind: 'CITY_MEMORY',
      sourceId: memory.id, eventKind: memory.kind, visibility: 'public',
      actorRoundPlayerIds: Array.isArray(memory.actors) ? memory.actors.filter((x): x is string => typeof x === 'string') : [],
      happenedAtActive: memory.happenedAtActive ?? activeRoundEventTime(round, memory.happenedAt),
    }, { roundId: round.id, cityId: input.cityId, roundPlayerId: input.ownerId, roundClock: round, now: input.now });
    if (decision.eligible) opportunities.push({
      memoryId: memory.id, storyKey: def.key, caseKey: def.caseKey,
      title: def.title, expiresAtActive: decision.expiresAtActive.toISOString(),
    });
  }
  return opportunities;
}

/** Called from a player-authenticated POST inside a transaction. */
export async function optInPublicStory(
  db: Db, input: { roundId: string; ownerId: string; cityId: string; memoryId: string; now: Date },
): Promise<boolean> {
  const memory = await db.cityMemoryEvent.findUnique({ where: { id: input.memoryId } });
  if (!memory || memory.roundId !== input.roundId || memory.cityId !== input.cityId || memory.visibility !== 'public') return false;
  const round = await db.round.findUnique({ where: { id: input.roundId } });
  if (!round || round.status !== 'ACTIVE' || round.pausedAt) return false;
  for (const def of Object.values(livingStoryCatalogForRuleset(loadRulesetForRound(round)))) {
    if (def.enabled && def.audience === 'CITY_PLAYERS' && def.trigger.sourceKind === 'CITY_MEMORY'
      && def.trigger.eventKinds.includes(memory.kind)) {
      return tryOfferLivingStory(db, { ownerId: input.ownerId, memoryId: memory.id, storyKey: def.key, now: input.now });
    }
  }
  return false;
}
