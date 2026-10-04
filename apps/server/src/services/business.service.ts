import type { PrismaClient } from '@prisma/client';
import {
  BUSINESS_JOB,
  bribeCentsPerPoint,
  businessIncomeCentsPerHour,
  decayHeat,
  isRacketKey,
  launderAllowance,
  launderDay,
  mergeRacketEffect,
  racketCashPerHour,
  racketHeatPerHour,
  racketRules,
  racketStrength,
  racketType,
  readRacketEffects,
  regenerateTurns,
  roundStochastic,
  runNetWorthCents,
  type RacketEffects,
  businessStaff,
  businessStaffDepartures,
  businessUpkeep,
  defaultWorkSupplyPolicy,
  staffingShare,
  loadRulesetForRound,
  registerCapCents,
  workSupplyOrder,
  type Rng,
  type Ruleset,
} from '@streets/rules-engine';
import type { BusinessKey, DistrictKey, RacketKey } from '@streets/rulesets';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { ProductInventoryService } from './product-inventory.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { blockFatigueNow } from './block-war-settle.service.js';

const HOUR_MS = 3_600_000;

export interface BusinessSettlement {
  beer: number;
  crack: number;
  thugs: number;
  whores: number;
  businessThugs: number;
  businessWhores: number;
  /** Staff who walked off an unhappy crew's businesses and left it. */
  staffDeparted: number;
  /** Staff auto-staffing sent in from the fit crew to replace them. */
  staffRefilled: number;
  /** Staff who came home because their crew no longer runs the block. */
  staffReturned: number;
  /** Uncollected register cash lost with a block the crew no longer runs. */
  registerLostCents: bigint;
  /** 1.1.0-C. Heat the crew's rackets drew, and washed off by laundering, this settle. */
  racketHeat: number;
  launderedHeat: number;
  launderedCents: bigint;
  /** Product sold over the counter, and what it put in the registers. */
  counterSold: Record<string, number>;
  counterCents: bigint;
}

/** A business's racket key, if it is one this ruleset knows. */
export function racketOf(ruleset: Ruleset, value: string | null | undefined): RacketKey | null {
  return isRacketKey(value) && racketType(ruleset, value) ? value : null;
}

/** Hours of [from, to) that fall inside [windowFrom, windowTo). */
function overlapHours(from: Date, to: Date, windowFrom: Date, windowTo: Date): number {
  const start = Math.max(from.getTime(), windowFrom.getTime());
  const end = Math.min(to.getTime(), windowTo.getTime());
  return Math.max(0, (end - start) / HOUR_MS);
}

/** Pip's base price for a unit of product, for counter sales. */
function pipSellCents(ruleset: Ruleset, product: string): number {
  return product === 'CRACK'
    ? ruleset.stores.PIP.items.CRACK?.sellCents ?? 0
    : ruleset.products?.[product]?.economy?.pip?.sellCents ?? 0;
}

function sameEffects(a: RacketEffects, b: RacketEffects): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<RacketKey>;
  for (const key of keys) if (Math.abs((a[key] ?? 0) - (b[key] ?? 0)) > 1e-9) return false;
  return true;
}

/** Building, staffing and collecting are on in this round. */
export function buildingOn(ruleset: Ruleset): boolean {
  return Boolean(ruleset.turf && ruleset.business?.building);
}

/** 1.1.0-E. Away businesses use the outpost box instead of home supply and cash. */
export function outpostBusinessesOn(ruleset: Ruleset): boolean {
  return Boolean(buildingOn(ruleset) && ruleset.business?.outposts && ruleset.turf?.outposts);
}

async function lockOutpost(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "TurfOutpost" WHERE id = ${id} FOR UPDATE`;
}

export function staffKind(ruleset: Ruleset, business: BusinessKey): 'THUGS' | 'WHORES' {
  return ruleset.business!.catalog[business].staff;
}

/** Staff as a change to the crew's business columns. Totals never move: staff are still the crew's. */
export function staffColumns(ruleset: Ruleset, business: BusinessKey, count: number): { businessThugs: number; businessWhores: number } {
  return staffKind(ruleset, business) === 'WHORES'
    ? { businessThugs: 0, businessWhores: count }
    : { businessThugs: count, businessWhores: 0 };
}

/**
 * Send another crew's staff home and burn their register. Used when a new holder takes
 * over a business whose old staff have not settled home yet. The staff were always in
 * the other crew's counts, so only their business columns move.
 */
export async function releaseForeignStaff(
  tx: Db,
  ruleset: Ruleset,
  row: { id: string; kind: string; staff: number; staffOwnerId: string | null },
  now: Date,
): Promise<void> {
  if (!row.staffOwnerId || row.staff <= 0) return;
  const columns = staffColumns(ruleset, row.kind as BusinessKey, row.staff);
  await tx.roundPlayer.update({
    where: { id: row.staffOwnerId },
    data: {
      businessThugs: { decrement: columns.businessThugs },
      businessWhores: { decrement: columns.businessWhores },
    },
  });
  await tx.business.update({ where: { id: row.id }, data: { staff: 0, staffOwnerId: null, registerCents: 0n, accruedAt: now, racket: null, racketSince: null } });
}

export const BusinessService = {
  /**
   * Staff the crew lost some other way (lured off in a raid): take them off its businesses,
   * the least-built business first. Only the Business rows change; the caller writes the
   * crew's own counts.
   */
  async loseStaff(
    tx: Db,
    roundPlayerId: string,
    ruleset: Ruleset,
    lost: { thugs: number; whores: number },
    now: Date,
  ): Promise<void> {
    if (!buildingOn(ruleset) || (lost.thugs <= 0 && lost.whores <= 0)) return;
    const rows = await tx.business.findMany({
      where: { staffOwnerId: roundPlayerId, staff: { gt: 0 } },
      orderBy: [{ level: 'asc' }, { lot: 'desc' }],
    });
    const remaining = { THUGS: Math.max(0, lost.thugs), WHORES: Math.max(0, lost.whores) };
    for (const row of rows) {
      const kind = staffKind(ruleset, row.kind as BusinessKey);
      const take = Math.min(row.staff, remaining[kind]);
      if (take <= 0) continue;
      remaining[kind] -= take;
      await tx.business.update({ where: { id: row.id }, data: { staff: row.staff - take, ...(row.staff - take === 0 ? { accruedAt: now } : {}) } });
    }
  },

  /**
   * 1.1.0-B. Settle a crew's businesses, lazily, on whole hours like corner upkeep:
   * - staff on a block the crew no longer holds at home come home, and the register is lost;
   * - an unhappy crew's staff walk off, out of the business and out of the crew;
   * - a fully staffed business burns beer and product from home under the BUSINESS supply
   *   job, and earns its front income into the register for the share of each hour it was
   *   supplied, up to the register's cap.
   * Staff never leave the crew's counts by working: they are marked in businessThugs and
   * businessWhores, which keep them off the street, out of fights and away from the stove.
   * The caller holds the player's lock.
   */
  async settlePlayer(tx: Db, roundPlayerId: string, ruleset: Ruleset, now = new Date(), rng: Rng = Math.random): Promise<BusinessSettlement | null> {
    if (!buildingOn(ruleset)) return null;
    const player = await tx.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: {
        cityId: true, thugs: true, whores: true, woundedThugs: true, busyThugs: true, postedThugs: true,
        businessThugs: true, businessWhores: true, beer: true, crack: true, thugHappiness: true, whoreHappiness: true,
        heat: true, netWorthCents: true, outpostNetWorthCents: true, turns: true, lastTurnCalculationAt: true,
        racketEffects: true, launderedDay: true, launderedHeatToday: true, launderedHeatRound: true,
      },
    });
    const rows = await tx.business.findMany({
      where: { staffOwnerId: roundPlayerId },
      include: {
        turf: {
          select: {
            id: true, holderId: true, cityId: true, district: true, city: { select: { slug: true } },
            fatigue: true, fatigueAt: true, capturedAts: true, siegedSince: true,
            warCutPlayerId: true, warCutShare: true, warCutUntil: true,
            outpost: { select: { id: true, ownerId: true } },
          },
        },
      },
      orderBy: [{ turfId: 'asc' }, { lot: 'asc' }],
    });
    // 1.1.0-D: a war on the block holds its fatigue where the fighting left it.
    const wars = rows.length
      ? await tx.blockWar.findMany({ where: { turfId: { in: [...new Set(rows.map((row) => row.turfId))] }, status: { not: 'ENDED' } } })
      : [];
    const warOn = new Map(wars.map((war) => [war.turfId, war]));
    const cuts: Array<{ playerId: string; cents: bigint; turfId: string }> = [];
    const storedEffects = readRacketEffects(player.racketEffects);
    if (!rows.length && player.businessThugs === 0 && player.businessWhores === 0) {
      // Nothing runs any more: a crew that lost its last business loses its rackets too.
      if (Object.keys(storedEffects).length) await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { racketEffects: {} } });
      return null;
    }

    let { thugs, whores, beer } = player;
    let staffDeparted = 0;
    let staffReturned = 0;
    let registerLostCents = 0n;

    const inventory = await ProductInventoryService.read(tx, roundPlayerId, ruleset);
    const productChanges: Record<string, number> = {};
    const policyRow = await tx.workSupplyPolicy.findUnique({ where: { roundPlayerId_job: { roundPlayerId, job: BUSINESS_JOB } } });
    const order = workSupplyOrder(policyRow
      ? { primary: policyRow.primary, fallback: policyRow.fallback, emergency: policyRow.emergency, strict: policyRow.strict }
      : defaultWorkSupplyPolicy());
    const takeHomeProduct = (need: number): number => {
      let used = 0;
      for (const key of order) {
        if (used >= need) break;
        const available = Math.max(0, inventory[key] ?? 0);
        const amount = Math.min(available, need - used);
        if (amount <= 0) continue;
        inventory[key] = available - amount;
        productChanges[key] = (productChanges[key] ?? 0) - amount;
        used += amount;
      }
      return used;
    };

    type OutpostState = { id: string; cashCents: bigint; beer: number; products: Record<string, number>; dirty: boolean };
    const outposts = new Map<string, OutpostState>();
    const outpostFor = async (row: (typeof rows)[number]): Promise<OutpostState | null> => {
      const link = row.turf.outpost;
      if (!link || link.ownerId !== roundPlayerId) return null;
      const cached = outposts.get(link.id);
      if (cached) return cached;
      await lockOutpost(tx, link.id);
      const fresh = await tx.turfOutpost.findUnique({ where: { id: link.id } });
      if (!fresh || fresh.ownerId !== roundPlayerId) return null;
      const state: OutpostState = {
        id: fresh.id,
        cashCents: fresh.cashCents,
        beer: fresh.beer,
        products: { ...(fresh.products as Record<string, number>) },
        dirty: false,
      };
      outposts.set(state.id, state);
      return state;
    };
    const takeOutpostProduct = (box: OutpostState, need: number): number => {
      let used = 0;
      for (const key of order) {
        if (used >= need) break;
        const available = Math.max(0, box.products[key] ?? 0);
        const amount = Math.min(available, need - used);
        if (amount <= 0) continue;
        box.products[key] = available - amount;
        box.dirty = true;
        used += amount;
      }
      return used;
    };

    // 1.1.0-C/E: Wash & fold cleans the books of the crew's other live rackets.
    const home = (row: (typeof rows)[number]) => row.turf.holderId === roundPlayerId && row.turf.cityId === player.cityId;
    const operates = (row: (typeof rows)[number]) =>
      row.turf.holderId === roundPlayerId &&
      (home(row) || (outpostBusinessesOn(ruleset) && row.turf.outpost?.ownerId === roundPlayerId));
    const strengthOf = (row: (typeof rows)[number], staff: number) =>
      racketStrength(ruleset, { level: row.level, staff, requiredStaff: businessStaff(ruleset, row.kind as BusinessKey, row.level) });
    let shield = 0;
    for (const row of rows) {
      const racket = racketOf(ruleset, row.racket);
      const effect = racket ? racketType(ruleset, racket)!.effect : null;
      if (effect?.kind === 'HEAT_SHIELD' && operates(row)) shield = Math.max(shield, effect.share * strengthOf(row, row.staff));
    }
    let racketHeat = 0;
    let counterCents = 0n;
    const counterSold: Record<string, number> = {};
    const launders: Array<{ id: string; heat: number }> = [];
    const registers = new Map<string, bigint>();
    const registerOutposts = new Map<string, OutpostState>();

    // What each row ends the settle with, so the crew's columns are rebuilt from the rows.
    const kept: Array<{ id: string; kind: 'THUGS' | 'WHORES'; staff: number; want: number; auto: boolean; racket: RacketKey | null; level: number; required: number }> = [];
    let staffRefilled = 0;

    for (const row of rows) {
      const business = row.kind as BusinessKey;
      const kind = staffKind(ruleset, business);
      // Before E, moving a business away still closes it. E keeps it only while the
      // crew owns the block and its outpost box.
      if (!operates(row)) {
        staffReturned += row.staff;
        registerLostCents += row.registerCents;
        await tx.business.update({ where: { id: row.id }, data: { staff: 0, staffOwnerId: null, registerCents: 0n, accruedAt: now, racket: null, racketSince: null } });
        continue;
      }
      const away = !home(row);
      const box = away ? await outpostFor(row) : null;
      if (away && !box) {
        staffReturned += row.staff;
        registerLostCents += row.registerCents;
        await tx.business.update({ where: { id: row.id }, data: { staff: 0, staffOwnerId: null, registerCents: 0n, accruedAt: now, racket: null, racketSince: null } });
        continue;
      }

      const required = businessStaff(ruleset, business, row.level);
      const want = Math.min(row.staffTarget, required);
      const racket = racketOf(ruleset, row.racket);
      const wholeHours = Math.floor((now.getTime() - row.accruedAt.getTime()) / HOUR_MS);
      if (wholeHours <= 0) {
        registers.set(row.id, row.registerCents);
        if (box) registerOutposts.set(row.id, box);
        kept.push({ id: row.id, kind, staff: row.staff, want, auto: row.autoStaff, racket, level: row.level, required });
        continue;
      }
      const advanceTo = new Date(row.accruedAt.getTime() + wholeHours * HOUR_MS);
      // It runs with whatever staff it has, and earns in proportion to them.
      const running = row.level > 0 && row.staff > 0;

      let register = row.registerCents;
      if (running) {
        const need = businessUpkeep(ruleset, row.staff, wholeHours);
        const beerUsed = box ? Math.min(box.beer, need.beer) : Math.min(beer, need.beer);
        if (box) {
          box.beer -= beerUsed;
          if (beerUsed > 0) box.dirty = true;
        } else {
          beer -= beerUsed;
        }
        const productUsed = box ? takeOutpostProduct(box, need.product) : takeHomeProduct(need.product);
        const beerShare = need.beer > 0 ? beerUsed / need.beer : 1;
        const productShare = need.product > 0 ? productUsed / need.product : 1;
        const suppliedShare = Math.max(0, Math.min(1, beerShare, productShare));
        const perHour = businessIncomeCentsPerHour(ruleset, {
          citySlug: row.turf.city.slug,
          district: row.turf.district as DistrictKey,
          business,
          level: row.level,
          // 1.1.0-D: a shot-up block earns less until its fatigue heals.
          fatigue: blockFatigueNow(ruleset, row.turf, warOn.get(row.turfId) ?? null, now).percent,
          away,
        });
        const staffed = staffingShare(row.staff, required);
        // A cash racket pays on top of the front, and the register holds both.
        const racketPerHour = racketCashPerHour(ruleset, racket, perHour);
        // Nobody spends money on a block under siege: those hours earn nothing.
        const sieged = row.turf.siegedSince ? overlapHours(row.accruedAt, advanceTo, row.turf.siegedSince, advanceTo) : 0;
        const earningHours = Math.max(0, wholeHours - sieged);
        let earned = BigInt(Math.floor((perHour + racketPerHour) * staffed * earningHours * suppliedShare));
        const cap = BigInt(registerCapCents(ruleset, perHour + racketPerHour));
        // After a war, the winning side's ally takes the promised cut of the truce's income.
        if (earned > 0n && row.turf.warCutPlayerId && row.turf.warCutUntil && row.turf.warCutShare > 0 && earningHours > 0) {
          const cutHours = overlapHours(row.accruedAt, advanceTo, row.accruedAt, row.turf.warCutUntil);
          const cut = BigInt(Math.floor(Number(earned) * Math.min(1, cutHours / earningHours) * row.turf.warCutShare));
          if (cut > 0n) {
            earned -= cut;
            cuts.push({ playerId: row.turf.warCutPlayerId, cents: cut, turfId: row.turfId });
          }
        }
        register = register + earned > cap ? cap : register + earned;

        if (racket && suppliedShare > 0) {
          const strength = strengthOf(row, row.staff);
          const effect = racketType(ruleset, racket)!.effect;
          racketHeat += racketHeatPerHour(ruleset, racket, strength, shield) * wholeHours * suppliedShare;
          if (effect.kind === 'LAUNDER') launders.push({ id: row.id, heat: effect.heatPerHour * strength * wholeHours * suppliedShare });
          if (effect.kind === 'COUNTER_SALES') {
            // Product goes over the counter at Pip's base price, as far as the register has room.
            let units = roundStochastic(effect.unitsPerHour * strength * wholeHours * suppliedShare, rng);
            for (const key of order) {
              if (units <= 0) break;
              const price = pipSellCents(ruleset, key);
              const available = Math.max(0, box ? (box.products[key] ?? 0) : (inventory[key] ?? 0));
              if (price <= 0 || available <= 0) continue;
              const room = cap - register;
              const sold = Math.min(units, available, Number(room / BigInt(price)));
              if (sold <= 0) continue;
              units -= sold;
              if (box) {
                box.products[key] = available - sold;
                box.dirty = true;
              } else {
                inventory[key] = available - sold;
                productChanges[key] = (productChanges[key] ?? 0) - sold;
              }
              counterSold[key] = (counterSold[key] ?? 0) + sold;
              const cents = BigInt(sold * price);
              register += cents;
              counterCents += cents;
            }
          }
        }
      }

      // Unhappy staff walk off over the same hours, out of the business and the crew.
      const happiness = kind === 'WHORES' ? player.whoreHappiness : player.thugHappiness;
      const departed = businessStaffDepartures(ruleset, row.staff, happiness, wholeHours, rng);
      if (departed > 0) {
        staffDeparted += departed;
        if (kind === 'WHORES') whores = Math.max(0, whores - departed);
        else thugs = Math.max(0, thugs - departed);
      }
      const staff = row.staff - departed;
      kept.push({ id: row.id, kind, staff, want, auto: row.autoStaff, racket, level: row.level, required });
      registers.set(row.id, register);
      if (box) registerOutposts.set(row.id, box);
      await tx.business.update({ where: { id: row.id }, data: { registerCents: register, accruedAt: advanceTo, staff } });
    }

    // 1.1.0-C: Heat. Racket Heat lands on a balance that has cooled to now, so the turn clock is
    // settled here first (the same regeneration the action would do), then laundering washes
    // what it can under the day's and the round's caps, paid out of its own register.
    let launderedHeat = 0;
    let launderedCents = 0n;
    const heatRules = ruleset.heat;
    const rackets = racketRules(ruleset);
    const heatData: { heat?: number; turns?: number; lastTurnCalculationAt?: Date; launderedDay?: string; launderedHeatToday?: number; launderedHeatRound?: number } = {};
    if (heatRules && rackets && (racketHeat > 0 || launders.length > 0)) {
      const regen = regenerateTurns({ turns: player.turns, lastTurnCalculationAt: player.lastTurnCalculationAt }, now, ruleset);
      let heat = Math.min(heatRules.max, decayHeat(player.heat, regen.intervalsProcessed, heatRules) + roundStochastic(racketHeat, rng));
      const today = launderDay(now);
      let usedToday = player.launderedDay === today ? player.launderedHeatToday : 0;
      let usedRound = player.launderedHeatRound;
      const price = BigInt(Math.max(1, Math.floor(Number(bribeCentsPerPoint(player.netWorthCents, heatRules)) * rackets.laundering.bribePriceShare)));
      for (const launder of launders) {
        const register = registers.get(launder.id) ?? 0n;
        const affordable = Number(register / price);
        const points = Math.min(Math.floor(launder.heat), launderAllowance(ruleset, { today: usedToday, round: usedRound }), heat, affordable);
        if (points <= 0) continue;
        const cost = price * BigInt(points);
        heat -= points;
        usedToday += points;
        usedRound += points;
        launderedHeat += points;
        launderedCents += cost;
        registers.set(launder.id, register - cost);
        await tx.business.update({ where: { id: launder.id }, data: { registerCents: register - cost } });
      }
      Object.assign(heatData, { heat, turns: regen.turns, lastTurnCalculationAt: regen.lastTurnCalculationAt });
      if (launderedHeat > 0) Object.assign(heatData, { launderedDay: today, launderedHeatToday: usedToday, launderedHeatRound: usedRound });
    }

    // E: away registers sweep into the outpost cash box. If the box is full, the
    // remainder stays in the register until a run makes room on a later settle.
    const outpostRules = ruleset.turf?.outposts;
    if (outpostRules) {
      for (const [businessId, box] of registerOutposts) {
        const register = registers.get(businessId) ?? 0n;
        const room = BigInt(outpostRules.cashCapCents) - box.cashCents;
        const moved = room > 0n && register > 0n ? (register < room ? register : room) : 0n;
        if (moved <= 0n) continue;
        box.cashCents += moved;
        box.dirty = true;
        registers.set(businessId, register - moved);
        await tx.business.update({ where: { id: businessId }, data: { registerCents: register - moved } });
        await EconomyLedgerService.record(tx, roundPlayerId, [{
          source: 'BUSINESS_INCOME',
          label: 'Business income · remote outpost',
          amountCents: moved,
          metadata: { businessId, outpostId: box.id },
        }], now);
      }
    }
    for (const box of outposts.values()) {
      if (!box.dirty) continue;
      await tx.turfOutpost.update({
        where: { id: box.id },
        data: { cashCents: box.cashCents, beer: box.beer, products: box.products },
      });
    }

    let businessThugs = kept.filter((entry) => entry.kind === 'THUGS').reduce((sum, entry) => sum + entry.staff, 0);
    let businessWhores = kept.filter((entry) => entry.kind === 'WHORES').reduce((sum, entry) => sum + entry.staff, 0);

    // Auto-staffing: replace anyone who walked off or was lured, from the fit crew (or the
    // girls working the street), up to each business's target, as far as the crew allows.
    let fitThugs = Math.max(0, thugs - player.woundedThugs - player.busyThugs - player.postedThugs - businessThugs);
    let freeGirls = Math.max(0, whores - businessWhores);
    for (const entry of kept) {
      if (!entry.auto || entry.staff >= entry.want) continue;
      const pool = entry.kind === 'WHORES' ? freeGirls : fitThugs;
      const add = Math.min(entry.want - entry.staff, pool);
      if (add <= 0) continue;
      entry.staff += add;
      staffRefilled += add;
      if (entry.kind === 'WHORES') { freeGirls -= add; businessWhores += add; } else { fitThugs -= add; businessThugs += add; }
      await tx.business.update({ where: { id: entry.id }, data: { staff: entry.staff } });
    }

    // Anything else that took the crew's people since (an admin change, a path that does not
    // know about businesses) cannot leave more staff than crew: shed the difference.
    const thugRoom = Math.max(0, thugs - player.woundedThugs - player.busyThugs - player.postedThugs);
    const shed = { thugs: Math.max(0, businessThugs - thugRoom), whores: Math.max(0, businessWhores - whores) };
    if (shed.thugs > 0 || shed.whores > 0) {
      await BusinessService.loseStaff(tx, roundPlayerId, ruleset, shed, now);
      businessThugs -= shed.thugs;
      businessWhores -= shed.whores;
    }

    // The crew's live rackets, as they stand after the settle, for every system that reads them.
    const effects = shed.thugs > 0 || shed.whores > 0
      ? await BusinessService.racketEffects(tx, roundPlayerId, ruleset)
      : kept.reduce<RacketEffects>((all, entry) => entry.racket
        ? mergeRacketEffect(all, entry.racket, racketStrength(ruleset, { level: entry.level, staff: entry.staff, requiredStaff: entry.required }))
        : all, {});
    const effectsChanged = !sameEffects(effects, storedEffects);

    // The winning side's truce-income cut keeps D's cash payout semantics. E changes
    // where an outpost ally fights from; it does not invent a second long-lived payout queue.
    for (const cut of cuts) {
      await tx.roundPlayer.update({ where: { id: cut.playerId }, data: { cashCents: { increment: cut.cents } } });
      await EconomyLedgerService.record(tx, cut.playerId, [{
        source: 'BLOCK_WAR_CUT',
        label: 'Block war · ally cut of business income',
        amountCents: cut.cents,
        metadata: { turfId: cut.turfId, from: roundPlayerId },
      }], now);
    }

    if (Object.keys(productChanges).length > 0) await ProductInventoryService.adjust(tx, roundPlayerId, ruleset, productChanges);
    let outpostNetWorthCents = player.outpostNetWorthCents;
    if (outposts.size > 0) {
      const boxes = await tx.turfOutpost.findMany({
        where: { ownerId: roundPlayerId },
        select: { cashCents: true, beer: true, products: true },
      });
      outpostNetWorthCents = boxes.reduce((sum, box) => sum + runNetWorthCents(ruleset, {
        cashCents: box.cashCents,
        lowRiders: 0,
        escortThugs: 0,
        beer: box.beer,
        cargo: box.products as Record<string, number>,
      }), 0n);
    }
    if (thugs !== player.thugs || whores !== player.whores || beer !== player.beer ||
        businessThugs !== player.businessThugs || businessWhores !== player.businessWhores ||
        outpostNetWorthCents !== player.outpostNetWorthCents ||
        effectsChanged || Object.keys(heatData).length > 0) {
      await tx.roundPlayer.update({
        where: { id: roundPlayerId },
        data: { thugs, whores, beer, businessThugs, businessWhores, outpostNetWorthCents, ...heatData, ...(effectsChanged ? { racketEffects: effects } : {}) },
      });
    }
    return {
      beer, crack: inventory.CRACK ?? player.crack, thugs, whores, businessThugs, businessWhores,
      staffDeparted, staffRefilled, staffReturned, registerLostCents,
      racketHeat, launderedHeat, launderedCents, counterSold, counterCents,
    };
  },

  /**
   * 1.1.0-C/E. The crew's live rackets read straight off running businesses it still holds.
   * E includes businesses backed by an owned outpost. The strongest one wins when two run the same racket.
   */
  async racketEffects(tx: Db, roundPlayerId: string, ruleset: Ruleset): Promise<RacketEffects> {
    if (!racketRules(ruleset)) return {};
    const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { cityId: true } });
    const rows = await tx.business.findMany({
      where: { staffOwnerId: roundPlayerId, staff: { gt: 0 }, level: { gt: 0 }, racket: { not: null }, turf: { holderId: roundPlayerId } },
      select: {
        kind: true, level: true, staff: true, racket: true,
        turf: { select: { cityId: true, outpost: { select: { ownerId: true } } } },
      },
    });
    let effects: RacketEffects = {};
    for (const row of rows) {
      const live = row.turf.cityId === player.cityId
        || (outpostBusinessesOn(ruleset) && row.turf.outpost?.ownerId === roundPlayerId);
      if (!live) continue;
      const racket = racketOf(ruleset, row.racket);
      if (!racket) continue;
      effects = mergeRacketEffect(effects, racket, racketStrength(ruleset, {
        level: row.level, staff: row.staff, requiredStaff: businessStaff(ruleset, row.kind as BusinessKey, row.level),
      }));
    }
    return effects;
  },

  /** Rebuild and store the crew's live rackets after an action changed its businesses. */
  async refreshRacketEffects(tx: Db, roundPlayerId: string, ruleset: Ruleset): Promise<RacketEffects> {
    const effects = await BusinessService.racketEffects(tx, roundPlayerId, ruleset);
    await tx.roundPlayer.update({ where: { id: roundPlayerId }, data: { racketEffects: effects } });
    return effects;
  },

  /** Settle in a transaction of its own, for read paths that do not run an action. */
  async settleFor(prisma: PrismaClient, roundPlayerId: string, now = new Date(), rng: Rng = Math.random): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const player = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { round: true } });
      if (!player) return;
      const ruleset = loadRulesetForRound(player.round);
      if (!buildingOn(ruleset)) return;
      await lockRoundPlayer(tx, roundPlayerId);
      await BusinessService.settlePlayer(tx, roundPlayerId, ruleset, now, rng);
    });
  },
};
