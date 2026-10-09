import { settlePropertyUpkeep, type Ruleset } from '@streets/rules-engine';
import type { SupplyPropertyRules } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { EconomyLedgerService } from './economy-ledger.service.js';

/**
 * 1.6.0-D. Property upkeep, settled lazily under the player's lock before anything reads
 * cash, like corner and business upkeep. Each period is paid in order, oldest first, for
 * as long as cash lasts; a property cash cannot cover stays behind until a later settle
 * finds the money. Nothing is taken from a property that is behind.
 */

export function propertyRules(ruleset: Ruleset): SupplyPropertyRules | undefined {
  return ruleset.supplyNetwork?.enabled ? ruleset.supplyNetwork.properties : undefined;
}

/** Upkeep fell due and is unpaid. A property paid through `now` exactly is due now. */
export function propertyBehind(paidThrough: Date | null, now: Date): boolean {
  return paidThrough !== null && paidThrough.getTime() <= now.getTime();
}

/** Cities where the player has a foothold: home, and every safehouse that is paid up. */
export async function supplyFootholds(db: Db, roundPlayerId: string, homeCitySlug: string, now: Date): Promise<Set<string>> {
  const safehouses = await db.supplySafehouse.findMany({ where: { roundPlayerId, isActive: true, paidThrough: { gt: now } }, select: { citySlug: true } });
  return new Set([homeCitySlug, ...safehouses.map((row) => row.citySlug)]);
}

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;

export const SupplyPropertySettleService = {
  /** Charge every period that has fallen due. Returns the cash left, or null when nothing was due. */
  async settleUpkeep(tx: Db, roundPlayerId: string, ruleset: Ruleset, now: Date): Promise<bigint | null> {
    const rules = propertyRules(ruleset);
    if (!rules) return null;
    const [warehouses, safehouses] = await Promise.all([
      tx.supplyWarehouse.findMany({ where: { roundPlayerId, isActive: true, kind: 'WAREHOUSE', paidThrough: { lte: now } }, select: { id: true, citySlug: true, upkeepCents: true, paidThrough: true } }),
      tx.supplySafehouse.findMany({ where: { roundPlayerId, isActive: true, paidThrough: { lte: now } }, select: { id: true, citySlug: true, upkeepCents: true, paidThrough: true } }),
    ]);
    const due = [
      ...warehouses.map((row) => ({ ...row, paidThrough: row.paidThrough!, kind: 'warehouse' as const })),
      ...safehouses.map((row) => ({ ...row, kind: 'safehouse' as const })),
    ].sort((a, b) => a.paidThrough.getTime() - b.paidThrough.getTime() || a.id.localeCompare(b.id));
    if (!due.length) return null;

    const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { cashCents: true } });
    let cash = player.cashCents;
    const lines: Array<{ source: string; label: string; amountCents: bigint; metadata: Record<string, string | number> }> = [];
    for (const row of due) {
      const paid = settlePropertyUpkeep({ paidThrough: row.paidThrough, now, upkeepCents: row.upkeepCents, periodHours: rules.upkeepPeriodHours, cashCents: cash });
      if (paid.periods === 0) continue;
      cash -= paid.chargeCents;
      if (row.kind === 'warehouse') await tx.supplyWarehouse.update({ where: { id: row.id }, data: { paidThrough: paid.paidThrough } });
      else await tx.supplySafehouse.update({ where: { id: row.id }, data: { paidThrough: paid.paidThrough } });
      lines.push({
        source: 'SUPPLY_UPKEEP',
        label: `${cityName(ruleset, row.citySlug)} ${row.kind} upkeep${paid.periods > 1 ? ` × ${paid.periods}` : ''}`,
        amountCents: -paid.chargeCents,
        metadata: { propertyId: row.id, kind: row.kind, citySlug: row.citySlug, periods: paid.periods },
      });
    }
    if (!lines.length) return null;
    await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { cashCents: cash } });
    await EconomyLedgerService.record(tx, roundPlayerId, lines, now);
    return cash;
  },
};
