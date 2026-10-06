import type { Prisma } from '@prisma/client';
import {
  addStanding,
  factionNudge,
  factionTier,
  factionTierName,
  factionTierRank,
  innerCirclePreview,
  nextFactionTier,
  standingCap,
  type FactionNudge,
  type Ruleset,
} from '@streets/rules-engine';
import type { FactionKey, FactionNudgeKind, FactionTier } from '@streets/rulesets';
import type { FactionStandingDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';

/** Where a standing change came from. */
export type FactionStandingSource = 'JOB' | 'CONTRACT' | 'INTRODUCTION';

export interface FactionStandingChange {
  factionKey: FactionKey;
  factionName: string;
  before: number;
  after: number;
  tier: FactionTier;
  tierUp: boolean;
  /** 1.4.0-E. Rivals whose Inner Circle this change locked for the season. */
  locked: FactionKey[];
  /** 1.4.0-E. The rival whose Inner Circle held this one short of its own, if it did. */
  heldShortBy: FactionKey | null;
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

    // 1.4.0-E: a rival at Inner Circle holds this faction one point short of its own.
    const points = await FactionService.points(tx, roundPlayerId);
    const before = points[factionKey] ?? 0;
    const preview = innerCirclePreview(ruleset, points, factionKey, amount);
    const after = Math.min(standingCap(ruleset, points, factionKey), addStanding(before, amount, rules));
    if (after === before) return null;
    const tier = factionTier(after, rules);
    const tierUp = factionTierRank(tier) > factionTierRank(factionTier(before, rules));
    const locked = tier === 'INNER_CIRCLE' && tierUp ? preview.locks : [];
    const heldShortBy = after < addStanding(before, amount, rules) ? preview.lockedBy : null;

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
        ...(locked.length ? { lockedRivals: locked.map((rival) => ruleset.factions?.[rival]?.name ?? rival) } : {}),
      }));
    }
    return { factionKey, factionName: faction.name, before, after, tier, tierUp, locked, heldShortBy };
  },

  /** 1.4.0-E. The player's points with every faction they have any standing with. */
  async points(db: Db, roundPlayerId: string): Promise<Partial<Record<FactionKey, number>>> {
    const rows = await db.playerFactionStanding.findMany({ where: { roundPlayerId }, select: { factionKey: true, points: true } });
    return Object.fromEntries(rows.map((row) => [row.factionKey, row.points]));
  },

  /** The player's tier with every faction in the round; empty before standing exists. */
  async tiers(db: Db, roundPlayerId: string, ruleset: Ruleset): Promise<Partial<Record<FactionKey, FactionTier>>> {
    const rules = ruleset.factionStanding;
    if (!rules || !ruleset.factions) return {};
    const rows = await db.playerFactionStanding.findMany({ where: { roundPlayerId }, select: { factionKey: true, points: true } });
    return Object.fromEntries(Object.keys(ruleset.factions).map((key) => [
      key,
      factionTier(rows.find((row) => row.factionKey === key)?.points ?? 0, rules),
    ]));
  },

  /**
   * 1.4.0-D. The Connected nudge of a kind this player has right now, or null. Reads standing
   * only in a ruleset with perks, so older rounds never pay for the query.
   */
  async nudge(db: Db, roundPlayerId: string, ruleset: Ruleset, kind: FactionNudgeKind): Promise<FactionNudge | null> {
    if (!ruleset.factionPerks || !ruleset.factionStanding) return null;
    const owner = Object.entries(ruleset.factionPerks.nudges).find(([, nudge]) => nudge?.kind === kind)?.[0] as FactionKey | undefined;
    if (!owner) return null;
    const row = await db.playerFactionStanding.findUnique({ where: { roundPlayerId_factionKey: { roundPlayerId, factionKey: owner } }, select: { points: true } });
    return factionNudge(ruleset, { [owner]: factionTier(row?.points ?? 0, ruleset.factionStanding) }, kind);
  },

  /**
   * 1.4.0-D. Log a nudge where it took effect, keyed on the act, with what it saved. Nothing is
   * logged when it saved nothing, and a retried act never logs twice.
   */
  async logNudge(
    tx: Db,
    roundPlayerId: string,
    nudge: FactionNudge,
    kind: FactionNudgeKind,
    sourceKey: string,
    saved: Record<string, number>,
    now: Date = new Date(),
  ): Promise<void> {
    if (!Object.values(saved).some((value) => value > 0)) return;
    await tx.playerFactionPerkUse.createMany({
      data: [{ roundPlayerId, factionKey: nudge.factionKey, kind, sourceKey, percent: nudge.percent, saved: json(saved), createdAt: now }],
      skipDuplicates: true,
    });
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
