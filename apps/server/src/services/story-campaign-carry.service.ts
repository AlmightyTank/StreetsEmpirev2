import type { PrismaClient } from '@prisma/client';
import type { Ruleset } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { syncDefinitions } from './handcrafted-quest.service.js';

const isCampaignKey = (key: string) => key.startsWith('ML_');

/**
 * Story campaign Slice J. Quest progress hangs off a ruleset version's quest definitions, so a
 * round moved to another ruleset would start The Missing Line over and pay its chapters again.
 * When a round changes ruleset, each crew's campaign rows (with their scene answers, receipts and
 * choices) move to the same chapter in the new ruleset. Other jobs start fresh, as before.
 */
export const StoryCampaignCarryService = {
  /** Write the target ruleset's definitions up front, outside the change's transaction. */
  async prepare(prisma: PrismaClient, to: Ruleset): Promise<void> {
    if (Object.keys(to.questDefinitions ?? {}).some(isCampaignKey)) await syncDefinitions(prisma, to);
  },

  /** Move the round's campaign rows from `from` to `to`; returns how many moved. */
  async carry(tx: Db, roundId: string, from: Ruleset | undefined, to: Ruleset): Promise<number> {
    if (!from) return 0;
    const keys = Object.keys(from.questDefinitions ?? {})
      .filter((key) => isCampaignKey(key) && Object.hasOwn(to.questDefinitions ?? {}, key));
    if (!keys.length) return 0;
    const rows = await tx.questDefinition.findMany({
      where: {
        OR: [
          { rulesetId: from.meta.id, rulesetVersion: from.meta.version, key: { in: keys } },
          { rulesetId: to.meta.id, rulesetVersion: to.meta.version, key: { in: keys } },
        ],
      },
      select: { id: true, key: true, rulesetId: true, rulesetVersion: true },
    });
    const idOf = (ruleset: Ruleset, key: string) => rows.find((row) =>
      row.key === key && row.rulesetId === ruleset.meta.id && row.rulesetVersion === ruleset.meta.version)?.id;

    let moved = 0;
    for (const key of keys) {
      const oldId = idOf(from, key);
      const newId = idOf(to, key);
      if (!oldId || !newId) continue;
      // A crew that already holds the chapter on the new ruleset (a round moved there and back) keeps that row.
      const holders = await tx.playerQuest.findMany({
        where: { questDefinitionId: newId, roundPlayer: { roundId } },
        select: { roundPlayerId: true },
      });
      const result = await tx.playerQuest.updateMany({
        where: {
          questDefinitionId: oldId,
          roundPlayer: { roundId },
          roundPlayerId: { notIn: holders.map((holder) => holder.roundPlayerId) },
        },
        data: { questDefinitionId: newId },
      });
      moved += result.count;
    }
    return moved;
  },
};
