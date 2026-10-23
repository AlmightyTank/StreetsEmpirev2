import type { QuestDefinition, Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { deckOrder, roundDeckSeed } from './contract-rotation.js';
import { dealSponsors, sponsorState } from './contract-sponsor.js';

export const SEASON_CONTRACT_SLOTS = 1;

/** A season contract already started or finished this round. A player only gets one. */
const SEASON_CONTRACT_UNDERWAY = new Set<string>(['ACTIVE', 'READY_TO_TURN_IN', 'COMPLETED']);

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
 * 1.4.0-B2 Season board. Each round deals one contract from its own deck, so a new
 * game gets a different goal. Every player in the round shares that one contract.
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
 * Offer this round's season contract once. It is an ONCE attempt with no timer of
 * its own: the round ending closes it. A contract already under way keeps the slot,
 * and any other season offer is pulled off the board. Returns the keys offered for
 * the first time.
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
  const selected = new Set(keys);
  const existing = await db.playerQuest.findMany({
    where: { roundPlayerId, questDefinitionId: { in: definitionRows.map((row) => row.id) } },
    select: { id: true, status: true, questDefinitionId: true },
  });
  const keyByDefinition = new Map(definitionRows.map((row) => [row.id, row.key]));
  const going = existing.some((row) => SEASON_CONTRACT_UNDERWAY.has(row.status));
  const offered = new Set(existing.map((row) => row.questDefinitionId));
  // 1.4.0-C: the contract's sponsor, chosen for this player's board.
  const sponsors = going ? [] : await dealSponsors(db, roundPlayerId, ruleset, keys.map((key) => ({
    definition: definitions.find((definition) => definition.key === key)!,
    window: player.roundId,
  })));

  const created: string[] = [];
  if (!going) {
    for (const key of keys) {
      const definitionRow = definitionRows.find((row) => row.key === key);
      if (!definitionRow || offered.has(definitionRow.id)) continue;
      await db.playerQuest.create({
        data: {
          roundPlayerId,
          questDefinitionId: definitionRow.id,
          status: 'AVAILABLE',
          ...(sponsors[keys.indexOf(key)] ? { rewardState: sponsorState(sponsors[keys.indexOf(key)]!) } : {}),
        },
      });
      created.push(key);
    }
  }

  for (const row of existing) {
    const key = keyByDefinition.get(row.questDefinitionId);
    const keep = !going && key !== undefined && selected.has(key);
    if (row.status === 'AVAILABLE' && !keep) {
      await db.playerQuest.update({ where: { id: row.id }, data: { status: 'LOCKED', isTracked: false } });
    } else if (row.status === 'LOCKED' && keep) {
      await db.playerQuest.update({ where: { id: row.id }, data: { status: 'AVAILABLE' } });
    }
  }
  return created;
}
