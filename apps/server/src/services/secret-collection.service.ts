import type { PrismaClient } from '@prisma/client';
import type {
  DiscoveredSecretDto,
  SecretClueDto,
  SecretCollectionDto,
  SecretFamilyDto,
  SecretTrophyDto,
} from '@streets/shared';
import type { QuestDefinition, QuestProgressMap, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { rewardLabel } from './reward-grant.service.js';
import {
  isSecretContentEnabled,
  secretDefinitions,
  secretSourceEncounterKey,
} from './secret-quest.service.js';

function progressMap(value: unknown): QuestProgressMap {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as QuestProgressMap)
    : {};
}

function contactNameFor(ruleset: Ruleset, definition: QuestDefinition): string | null {
  if (!definition.contactKey) return null;
  const contact = ruleset.contacts?.[definition.contactKey as keyof typeof ruleset.contacts];
  return (contact as { shortName?: string } | undefined)?.shortName ?? null;
}

function cluesFor(
  definition: QuestDefinition,
  saved: QuestProgressMap,
): { clues: SecretClueDto[]; found: number } {
  const milestones = definition.availability.secretContent?.clueMilestones;
  const wanted = milestones?.length
    ? definition.objectives.filter((objective) => milestones.includes(objective.id))
    : [...definition.objectives];
  const clues = wanted.map((objective): SecretClueDto => {
    const entry = saved[objective.id];
    return {
      id: objective.id,
      description: objective.description,
      current: entry?.current ?? 0,
      target: objective.target,
      completed: entry?.completed ?? false,
    };
  });
  return { clues, found: clues.filter((clue) => clue.completed).length };
}

/**
 * Hidden Streets Slice C. Secrets / Discoveries collection, derived entirely
 * from existing tables — no new model.
 *
 * - `inProgress`: revealed SECRET PlayerQuest rows for this round player.
 *   Unrevealed secrets have no row and can never appear here.
 * - `trophies`: account cosmetic unlocks whose source quest is a SECRET
 *   definition in this ruleset. Permanent across rounds.
 * - `families`: per-family aggregates. Only families with at least one
 *   discovery are listed; `undiscovered` is a count, never keys or titles.
 *
 * Reset behavior: a new round creates a new RoundPlayer, so `inProgress`
 * starts empty; `trophies` survive because they are account-scoped.
 */
export const SecretCollectionService = {
  async forPlayer(
    db: Db | PrismaClient,
    roundPlayerId: string,
    accountId: string,
    ruleset: Ruleset,
  ): Promise<SecretCollectionDto> {
    const definitions = secretDefinitions(ruleset);
    const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
    if (!definitions.length) return { inProgress: [], trophies: [], families: [] };

    const [definitionRows, questRows, unlockRows] = await Promise.all([
      db.questDefinition.findMany({
        where: {
          rulesetId: ruleset.meta.id,
          rulesetVersion: ruleset.meta.version,
          key: { in: definitions.map((definition) => definition.key) },
          isEnabled: true,
        },
        select: { id: true, key: true },
      }),
      db.playerQuest.findMany({
        where: { roundPlayerId },
        select: {
          questDefinitionId: true,
          status: true,
          objectiveProgress: true,
          claimedAt: true,
          createdAt: true,
          questDefinition: { select: { key: true, rulesetId: true, rulesetVersion: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.accountCosmeticUnlock.findMany({
        where: { accountId },
        select: { key: true, title: true, description: true, rarity: true, sourceQuestKey: true, awardedAt: true },
        orderBy: [{ awardedAt: 'asc' }, { key: 'asc' }],
      }),
    ]);

    const pinnedIds = new Set(definitionRows.map((row) => row.id));
    const inProgress: DiscoveredSecretDto[] = [];
    for (const row of questRows) {
      if (!pinnedIds.has(row.questDefinitionId)) continue;
      if (row.questDefinition.rulesetId !== ruleset.meta.id) continue;
      if (row.questDefinition.rulesetVersion !== ruleset.meta.version) continue;
      const definition = byKey.get(row.questDefinition.key);
      if (!definition) continue;
      const { clues, found } = cluesFor(definition, progressMap(row.objectiveProgress));
      const completed = row.status === 'COMPLETED';
      inProgress.push({
        questKey: definition.key,
        title: definition.title,
        description: definition.description,
        contactName: contactNameFor(ruleset, definition),
        status: row.status,
        family: definition.availability.secretContent?.family ?? 'UNSOLVED',
        discoveryTier: definition.availability.secretContent?.discoveryTier ?? 'HIDDEN',
        clues,
        cluesFound: found,
        cluesTotal: clues.length,
        completed,
        sourceEncounterKey: secretSourceEncounterKey(definition),
        rewardLabels: definition.rewards.map((reward) => rewardLabel(reward, ruleset)),
        claimed: row.claimedAt !== null,
      });
    }

    const trophies: SecretTrophyDto[] = [];
    for (const unlock of unlockRows) {
      const definition = byKey.get(unlock.sourceQuestKey);
      if (!definition) continue;
      trophies.push({
        key: unlock.key,
        title: unlock.title,
        description: unlock.description,
        rarity: unlock.rarity,
        sourceQuestKey: unlock.sourceQuestKey,
        family: definition.availability.secretContent?.family ?? null,
        earnedAt: unlock.awardedAt.toISOString(),
      });
    }

    const byFamily = new Map<string, { found: number; total: number; trophies: number }>();
    for (const secret of inProgress) {
      const entry = byFamily.get(secret.family) ?? { found: 0, total: 0, trophies: 0 };
      entry.found += 1;
      byFamily.set(secret.family, entry);
    }
    for (const definition of definitions) {
      if (!isSecretContentEnabled(definition)) continue;
      const family = definition.availability.secretContent?.family ?? 'UNSOLVED';
      if (!byFamily.has(family)) continue;
      byFamily.get(family)!.total += 1;
    }
    for (const trophy of trophies) {
      if (!trophy.family || !byFamily.has(trophy.family)) continue;
      byFamily.get(trophy.family)!.trophies += 1;
    }
    const families: SecretFamilyDto[] = [...byFamily.entries()].map(([family, entry]) => ({
      family,
      found: entry.found,
      undiscovered: Math.max(0, entry.total - entry.found),
      trophies: entry.trophies,
    }));

    return { inProgress, trophies, families };
  },
};
