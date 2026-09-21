import type { PrismaClient, RoundPlayer } from '@prisma/client';
import type { Ruleset } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';

type TurfDb = Db | PrismaClient;
type RevengePlayer = Pick<RoundPlayer, 'id' | 'allianceId' | 'allianceJoinedAt'>;

export function turfRevengeHours(ruleset: Ruleset): number {
  return ruleset.combat?.strategy?.retaliation.revengeHours ?? 0;
}

export function turfRevengeUntil(ruleset: Ruleset, settledAt: Date | null): Date | null {
  const hours = turfRevengeHours(ruleset);
  return settledAt && hours > 0 ? new Date(settledAt.getTime() + hours * 3_600_000) : null;
}

/**
 * Losing turf opens the normal combat retaliation clock against the taker. Turf revenge
 * deliberately does not break a hold shield; it only waives the presence requirement once
 * the block can legally be pushed again.
 */
export async function turfRevengeByAttacker(
  db: TurfDb,
  player: RevengePlayer,
  roundId: string,
  ruleset: Ruleset,
  now: Date,
): Promise<Map<string, Date>> {
  const hours = turfRevengeHours(ruleset);
  if (hours <= 0) return new Map();
  const since = new Date(now.getTime() - hours * 3_600_000);
  const scopes: Array<Record<string, unknown>> = [{ defenderId: player.id }];
  if (player.allianceId && player.allianceJoinedAt) {
    scopes.push({
      defenderAllianceId: player.allianceId,
      settledAt: { gte: player.allianceJoinedAt > since ? player.allianceJoinedAt : since },
    });
  }
  const rows = await db.turfPush.findMany({
    where: {
      roundId,
      captured: true,
      status: 'LANDED',
      settledAt: { gte: since },
      OR: scopes,
    },
    select: { attackerId: true, settledAt: true },
    orderBy: { settledAt: 'desc' },
  });
  const byAttacker = new Map<string, Date>();
  for (const row of rows) {
    if (!row.settledAt || byAttacker.has(row.attackerId)) continue;
    const until = turfRevengeUntil(ruleset, row.settledAt);
    if (until && until > now) byAttacker.set(row.attackerId, until);
  }
  return byAttacker;
}

export async function hasTurfRevenge(
  db: TurfDb,
  player: RevengePlayer,
  roundId: string,
  targetId: string,
  ruleset: Ruleset,
  now: Date,
): Promise<Date | null> {
  return (await turfRevengeByAttacker(db, player, roundId, ruleset, now)).get(targetId) ?? null;
}
