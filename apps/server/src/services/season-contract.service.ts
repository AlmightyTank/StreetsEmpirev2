import type { QuestDefinition, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { deckOrder, roundDeckSeed } from './contract-rotation.js';

export const SEASON_CONTRACT_SLOTS = 3;

function pool(ruleset: Ruleset, enabledKeys?: ReadonlySet<string>): QuestDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {})
    .filter((definition) =>
      definition.type === 'SEASON'
      && (!enabledKeys || enabledKeys.has(definition.key))
    );
}

export function isSeasonContractDefinition(definition: QuestDefinition | undefined): boolean {
  return definition?.type === 'SEASON';
}

/**
 * 1.4.0-B2 Season board. Each round deals three contracts from its own deck, spread
 * across categories, so a new game gets a different set. Every player in the round
 * shares the board.
 */
export function selectedSeasonContractKeys(
  ruleset: Ruleset,
  roundId: string,
  enabledKeys?: ReadonlySet<string>,
): string[] {
  const definitions = pool(ruleset, enabledKeys);
  const categoryOf = new Map(definitions.map((definition) => [definition.key, definition.category]));
  return deckOrder(
    definitions.map((definition) => definition.key),
    roundDeckSeed(ruleset, roundId) + ':season',
    0,
    SEASON_CONTRACT_SLOTS,
    (key) => categoryOf.get(key) ?? key,
  ).slice(0, SEASON_CONTRACT_SLOTS);
}

/**
 * Offer this round's season contracts once. They are ONCE attempts with no timer of
 * their own: the round ending closes them. Returns the keys offered for the first time.
 */
export async function syncSeasonContractAttempts(
  db: Db,
  roundPlayerId: string,
  ruleset: Ruleset,
): Promise<string[]> {
  const definitions = pool(ruleset);
  if (definitions.length === 0) return [];

  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { roundId: true },
  });
  if (!player) return [];

  const definitionRows = await db.questDefinition.findMany({
    where: {
      rulesetId: ruleset.meta.id,
      rulesetVersion: ruleset.meta.version,
      key: { in: definitions.map((definition) => definition.key) },
      isEnabled: true,
    },
    select: { id: true, key: true },
  });
  const enabledKeys = new Set(definitionRows.map((row) => row.key));
  const keys = selectedSeasonContractKeys(ruleset, player.roundId, enabledKeys);
  const existing = await db.playerQuest.findMany({
    where: { roundPlayerId, questDefinitionId: { in: definitionRows.map((row) => row.id) } },
    select: { questDefinitionId: true },
  });
  const offered = new Set(existing.map((row) => row.questDefinitionId));

  const created: string[] = [];
  for (const key of keys) {
    const definitionRow = definitionRows.find((row) => row.key === key);
    if (!definitionRow || offered.has(definitionRow.id)) continue;
    await db.playerQuest.create({
      data: { roundPlayerId, questDefinitionId: definitionRow.id, status: 'AVAILABLE' },
    });
    created.push(key);
  }
  return created;
}
