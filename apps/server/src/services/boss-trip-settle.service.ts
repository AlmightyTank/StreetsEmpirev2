import type { BossTrip } from '@prisma/client';
import { lieutenantCutCents, loadRulesetForRound, tripRules, type Ruleset } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { totalAwayWorth } from './run-settle.service.js';

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;

export async function activeTrip(db: Db, roundPlayerId: string): Promise<BossTrip | null> {
  return db.bossTrip.findFirst({ where: { roundPlayerId, status: 'ACTIVE' } });
}

/**
 * Trips A. Settle a player's trip. Called under the player's lock, before anything reads
 * the player, like a run's settle: a trip whose flight home has landed is home, and its
 * bankroll is back in home cash. Net worth does not move, because the bankroll was
 * already counted as cash while the boss was away. Idempotent.
 */
export const BossTripSettleService = {
  async settle(tx: Db, roundPlayerId: string, now: Date): Promise<void> {
    const trip = await tx.bossTrip.findFirst({ where: { roundPlayerId, status: 'ACTIVE', returnsAt: { lte: now } } });
    if (!trip) return;
    const { round } = await tx.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: { round: { select: { rulesetId: true, rulesetVersion: true } } },
    });
    const ruleset = loadRulesetForRound(round);
    await tx.bossTrip.update({ where: { id: trip.id }, data: { status: 'RETURNED', returnedAt: trip.returnsAt } });
    const awayNetWorthCents = await totalAwayWorth(tx, roundPlayerId, ruleset);
    await tx.roundPlayer.update({
      where: { id: roundPlayerId },
      data: { cashCents: { increment: trip.bankrollCents }, awayNetWorthCents },
    });
    await ActivityService.log(tx, roundPlayerId, 'TRIP_RETURNED', {
      tripId: trip.id,
      city: trip.city,
      cityName: cityName(ruleset, trip.city),
      startBankrollCents: Number(trip.startBankrollCents),
      bankrollCents: Number(trip.bankrollCents),
      ticketCents: Number(trip.ticketCents),
      hotelCents: Number(trip.hotelCents),
      departedAt: trip.departedAt.toISOString(),
      returnedAt: trip.returnsAt.toISOString(),
    });
  },

  /**
   * Trips A. What the lieutenant skims off a Scout or Produce take while the boss is
   * away. Zero at home and on rounds without trips. Read after the trip has settled.
   */
  async lieutenantCut(tx: Db, roundPlayerId: string, ruleset: Ruleset, takeCents: bigint): Promise<bigint> {
    const rules = tripRules(ruleset);
    if (!rules || takeCents <= 0n) return 0n;
    const away = await tx.bossTrip.count({ where: { roundPlayerId, status: 'ACTIVE' } });
    return away > 0 ? lieutenantCutCents(rules, takeCents) : 0n;
  },
};
