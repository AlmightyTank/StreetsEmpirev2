import {
  dealerDemand,
  dealerExperienceShares,
  dealerPace,
  dealerPressure,
  dealerRules,
  dealerStreetPriceCents,
  settleDealerSales,
  type Ruleset,
} from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { LawService } from './law.service.js';
import { CrewRosterService } from './crew-roster.service.js';

/**
 * 1.6.0-F. Dealer sales, settled lazily under the player's lock before anything reads cash.
 * A working crew sells in whole intervals of server time since it was last settled, never
 * the client's: at most `maxBatchIntervals` at a pace, so experience earned in one batch
 * speeds the next. Each batch takes exactly what it sold out of the crew's stock, pays the
 * player after the dealers' cut and the hours' wages, and gives the dealers who sold it
 * their experience. A batch is keyed by its start, so settling again never sells twice.
 * Wages the sales and the cash cannot cover send the crew home: it pauses, unpaid hours
 * forgiven, until the player resumes it.
 */

const HOUR = 3_600_000;
const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const productName = (ruleset: Ruleset, key: string) => (key === 'CRACK'
  ? ruleset.stores.PIP.items.CRACK?.name ?? 'Crack'
  : ruleset.products?.[key]?.name ?? key);
const districtName = (ruleset: Ruleset, city: string, key: string) => ruleset.cities?.[city]?.districts?.[key as DistrictKey]?.name
  ?? ruleset.districts[key as DistrictKey]?.name ?? key;

export const DealerSalesSettleService = {
  /** Settle every working crew. Returns the cash left, or null when nothing moved. */
  async settle(tx: Db, roundPlayerId: string, ruleset: Ruleset, now: Date): Promise<bigint | null> {
    const rules = dealerRules(ruleset);
    const sales = rules?.sales;
    if (!rules || !sales) return null;
    const crews = await tx.dealerCrew.findMany({
      where: { roundPlayerId, status: 'ACTIVE' },
      include: { staff: { where: { releasedAt: null }, orderBy: { assignedAt: 'asc' } }, inventory: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!crews.length) return null;
    const interval = sales.intervalMinutes * 60_000;
    const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { cashCents: true } });
    let cash = player.cashCents;
    let moved = false;
    const lines: Array<{ source: string; label: string; amountCents: bigint; metadata: Record<string, string | number> }> = [];

    for (const crew of crews) {
      // A crew that has never been settled starts its clock now.
      if (!crew.salesSettledAt) {
        await tx.dealerCrew.update({ where: { id: crew.id }, data: { salesSettledAt: now, salesCarry: 0 } });
        continue;
      }
      let intervals = Math.floor((now.getTime() - crew.salesSettledAt.getTime()) / interval);
      if (intervals <= 0) continue;
      moved = true;
      const product = crew.productKey;
      const street = product ? dealerStreetPriceCents(ruleset, rules, crew.citySlug, product) ?? 0 : 0;
      const price = crew.priceCents ?? 0;
      const demand = product ? dealerDemand(ruleset, crew.citySlug, product) : 0;
      const pressure = dealerPressure(ruleset, crew.citySlug);
      const experience = crew.staff.map((row) => row.experiencePoints);
      let inventory = product ? crew.inventory.find((row) => row.productKey === product)?.quantity ?? 0 : 0;
      let at = crew.salesSettledAt;
      let carry = crew.salesCarry;
      let sold = 0;
      let net = 0n;
      let gross = 0n;
      let cut = 0n;
      let wages = 0n;
      let walkedOut = false;

      while (intervals > 0) {
        const count = Math.min(intervals, sales.maxBatchIntervals);
        const hours = count * interval / HOUR;
        const pace = dealerPace({ rules, demand, district: crew.districtKey as DistrictKey, dealers: experience, priceCents: price, streetPriceCents: street, pressure });
        const batch = settleDealerSales({ pace, priceCents: price, inventory, hours, carry });
        const batchNet = BigInt(batch.grossCents - batch.cutCents);
        const owed = BigInt(batch.operatingCents);
        // Wages come out of the takings first, then cash; what neither covers ends the shift.
        if (cash + batchNet < owed) {
          walkedOut = true;
          const paid = cash + batchNet > 0n ? cash + batchNet : 0n;
          wages += paid;
          cash = cash + batchNet - paid;
        } else {
          wages += owed;
          cash = cash + batchNet - owed;
        }
        if (batch.sold > 0 && product) {
          const batchKey = at.toISOString();
          await tx.dealerSale.create({
            data: { dealerCrewId: crew.id, productKey: product, batchKey, quantity: batch.sold, unitPriceCents: price, grossCents: BigInt(batch.grossCents), crewCutCents: BigInt(batch.cutCents), netCents: batchNet, createdAt: new Date(at.getTime() + count * interval) },
          });
          await tx.dealerStock.update({ where: { dealerCrewId_productKey: { dealerCrewId: crew.id, productKey: product } }, data: { quantity: { decrement: batch.sold } } });
          await tx.supplyMovement.create({
            data: {
              roundPlayerId, kind: 'SOLD', productKey: product, quantityDelta: batch.sold,
              fromLocation: `crew:${crew.id}`, toLocation: 'street', dealerCrewId: crew.id,
              requestKey: `dealer-sale:${crew.id}:${batchKey}`,
              metadata: { grossCents: batch.grossCents, cutCents: batch.cutCents, priceCents: price },
              createdAt: new Date(at.getTime() + count * interval),
            },
          });
          // Only dealers on the crew while it sold earn from it.
          const shares = dealerExperienceShares(batch.sold, crew.staff.length, sales.experiencePerUnit);
          for (const [index, staff] of crew.staff.entries()) {
            if (!shares[index]) continue;
            experience[index]! += shares[index]!;
            await tx.dealerStaff.update({ where: { id: staff.id }, data: { experiencePoints: { increment: shares[index]! } } });
            // 1.7.0-A: and the crew member who carries the career, in step.
            await CrewRosterService.addDealerExperience(tx, ruleset, staff.id, shares[index]!);
          }
          inventory -= batch.sold;
          sold += batch.sold;
          gross += BigInt(batch.grossCents);
          cut += BigInt(batch.cutCents);
          net += batchNet;
          if (ruleset.law?.evidence) {
            await LawService.record(tx, roundPlayerId, ruleset, [{ citySlug: crew.citySlug, cashCents: BigInt(batch.grossCents), source: 'CURRENCY_REPORT', sourceKey: `dealer-sale:${crew.id}:${batchKey}` }], new Date(at.getTime() + count * interval));
          }
        }
        at = new Date(at.getTime() + count * interval);
        carry = batch.carry;
        intervals -= count;
        if (walkedOut) break;
      }

      await tx.dealerCrew.update({
        where: { id: crew.id },
        data: walkedOut ? { salesSettledAt: at, salesCarry: carry, status: 'PAUSED' } : { salesSettledAt: at, salesCarry: carry },
      });
      const where = `${districtName(ruleset, crew.citySlug, crew.districtKey)}, ${cityName(ruleset, crew.citySlug)}`;
      if (sold > 0 && product) {
        lines.push({
          source: 'DEALER_SALES',
          label: `${where} · ${sold.toLocaleString('en-US')} ${productName(ruleset, product)} sold`,
          amountCents: net,
          metadata: { crewId: crew.id, units: sold, grossCents: Number(gross), cutCents: Number(cut) },
        });
      }
      if (wages > 0n) {
        lines.push({ source: 'DEALER_WAGES', label: `${where} · dealer wages${walkedOut ? ' (unpaid: the crew walked off)' : ''}`, amountCents: -wages, metadata: { crewId: crew.id } });
      }
    }

    if (!moved) return null;
    await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { cashCents: cash } });
    if (lines.length) await EconomyLedgerService.record(tx, roundPlayerId, lines, now);
    return cash;
  },
};
