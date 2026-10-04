import type { Prisma } from '@prisma/client';
import {
  addStanding,
  factionTier,
  factionTierName,
  factionTierRank,
  nextFactionTier,
  type Ruleset,
} from '@streets/rules-engine';
import type { FactionKey, FactionTier } from '@streets/rulesets';
import type { FactionStandingDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';

/** Where a standing change came from. */
export type FactionStandingSource = 'JOB';

export interface FactionStandingChange {
  factionKey: FactionKey;
  factionName: string;
  before: number;
  after: number;
  tier: FactionTier;
  tierUp: boolean;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * 1.4.0-B. Seasonal faction standing.
 *
 * Every change goes through `grant`, which writes an itemised receipt keyed on the act that
 * caused it, so a retried claim never pays twice and the receipts always add up to the stored
 * standing. A tier rise logs FACTION_TIER_UP once. Callers hold the player's lock.
 */
export const FactionService = {
  async grant(
    tx: Db,
    roundPlayerId: string,
    ruleset: Ruleset,
    factionKey: FactionKey,
    amount: number,
    source: FactionStandingSource,
    sourceKey: string,
    now: Date = new Date(),
  ): Promise<FactionStandingChange | null> {
    const rules = ruleset.factionStanding;
    const faction = ruleset.factions?.[factionKey];
    if (!rules || !faction || amount === 0) return null;
    if (await tx.playerFactionReceipt.findUnique({ where: { roundPlayerId_sourceKey: { roundPlayerId, sourceKey } }, select: { id: true } })) return null;

    const existing = await tx.playerFactionStanding.findUnique({ where: { roundPlayerId_factionKey: { roundPlayerId, factionKey } } });
    const before = existing?.points ?? 0;
    const after = addStanding(before, amount, rules);
    if (after === before) return null;
    const tier = factionTier(after, rules);
    const tierUp = factionTierRank(tier) > factionTierRank(factionTier(before, rules));

    await tx.playerFactionStanding.upsert({
      where: { roundPlayerId_factionKey: { roundPlayerId, factionKey } },
      create: { roundPlayerId, factionKey, points: after, tier, createdAt: now },
      update: { points: after, tier },
    });
    await tx.playerFactionReceipt.create({
      data: { roundPlayerId, factionKey, source, sourceKey, delta: after - before, pointsAfter: after, tierAfter: tier, createdAt: now },
    });
    if (tierUp) {
      await ActivityService.log(tx, roundPlayerId, 'FACTION_TIER_UP', json({
        factionKey, factionName: faction.name, tier, tierName: factionTierName(tier), points: after,
      }));
    }
    return { factionKey, factionName: faction.name, before, after, tier, tierUp };
  },

  /** The player's standing with every faction in the round, Unknown where there is none yet. */
  async standings(db: Db, roundPlayerId: string, ruleset: Ruleset): Promise<Map<string, FactionStandingDto>> {
    const rules = ruleset.factionStanding;
    const result = new Map<string, FactionStandingDto>();
    if (!rules || !ruleset.factions) return result;
    const rows = await db.playerFactionStanding.findMany({ where: { roundPlayerId } });
    const points = new Map(rows.map((row) => [row.factionKey, row.points]));
    for (const key of Object.keys(ruleset.factions)) {
      const value = points.get(key) ?? 0;
      const tier = factionTier(value, rules);
      const next = nextFactionTier(value, rules);
      result.set(key, {
        points: value,
        tier,
        tierName: factionTierName(tier),
        next: next ? { tier: next.tier, tierName: factionTierName(next.tier), startsAt: next.startsAt } : null,
        max: rules.max,
      });
    }
    return result;
  },
};
