import type { BossTrip, Prisma, PrismaClient } from '@prisma/client';
import {
  bossHitLootCents,
  convoyCombatModel,
  hashParts,
  huntedRules,
  lieutenantCutCents,
  loadRulesetForRound,
  seededRng,
  simulateRaid,
  tripPosition,
  tripRules,
  type Ruleset,
} from '@streets/rules-engine';
import type { Db } from '../utils/db.js';
import type { WeaponKey } from '@streets/rulesets';
import { ActivityService } from './activity.service.js';
import { CombatRecoveryService } from './combat-recovery.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { totalAwayWorth } from './run-settle.service.js';

const cityName = (ruleset: Ruleset, slug: string) => ruleset.cities?.[slug]?.name ?? slug;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Trips C. Stored on a settled hit: what happened, for both sides. */
export interface BossHitOutcome {
  escaped: boolean;
  /** Trips D. The bodyguards held the hit off. */
  held?: boolean;
  squad: number;
  /** Trips D. Bodyguards standing when it landed. */
  defenders?: number;
  cashCents: string;
  laidUpUntil: string | null;
  attackerWounds?: number;
  defenderWounds?: number;
  recoverAt?: string | null;
}

/** Trips D. A squad as it set out after a boss. */
export interface BossHitCrew {
  thugHappiness: number;
  weapons: Record<WeaponKey, number>;
}

const NO_GUNS: Record<WeaponKey, number> = { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 };
export function rentedGunsOf(trip: Pick<BossTrip, 'rentedGuns'>): Record<WeaponKey, number> {
  const raw = (trip.rentedGuns ?? {}) as Partial<Record<WeaponKey, number>>;
  return { PISTOL: raw.PISTOL ?? 0, SHOTGUN: raw.SHOTGUN ?? 0, TEK9: raw.TEK9 ?? 0, AK47: raw.AK47 ?? 0 };
}

export async function activeTrip(db: Db, roundPlayerId: string): Promise<BossTrip | null> {
  return db.bossTrip.findFirst({ where: { roundPlayerId, status: 'ACTIVE' } });
}

/** Trips C. The later of two lay-up times. */
function laterOf(a: Date | null, b: Date): Date {
  return a && a.getTime() > b.getTime() ? a : b;
}

/**
 * Trips C. Land every hit on a trip whose window has closed, in order, under the owner's
 * lock. A boss still in town when it lands is beaten: part of the bankroll goes, the stay
 * ends and the boss flies home, laid up. A boss who has already left got away. Returns the
 * trip as it stands after.
 */
async function landHits(tx: Db, ownerId: string, ruleset: Ruleset, loaded: BossTrip, now: Date): Promise<BossTrip> {
  const hunted = huntedRules(ruleset);
  const due = await tx.bossHit.findMany({
    where: { tripId: loaded.id, status: 'PENDING', landsAt: { lte: now } },
    include: { attacker: { select: { displayName: true } } },
    orderBy: { landsAt: 'asc' },
  });
  let trip = loaded;
  for (const hit of due) {
    const at = hit.landsAt;
    if (!hunted || tripPosition(trip, at).phase !== 'town') {
      const outcome: BossHitOutcome = { escaped: true, squad: hit.squad, cashCents: '0', laidUpUntil: null };
      await tx.bossHit.update({ where: { id: hit.id }, data: { status: 'ESCAPED', settledAt: now, result: json(outcome) } });
      await ActivityService.log(tx, ownerId, 'BOSS_HIT_DEFENSE', json({ hitId: hit.id, attacker: hit.attacker.displayName, cityName: cityName(ruleset, trip.city), escaped: true }));
      continue;
    }
    const rng = seededRng(hashParts(hit.id, 'boss-hit'));
    const owner = await tx.roundPlayer.findUniqueOrThrow({ where: { id: ownerId }, select: { laidUpUntil: true, thugHappiness: true } });
    // Trips D: standing bodyguards fight, with whatever they rented in town.
    const defenders = Math.max(0, trip.bodyguards - trip.woundedBodyguards);
    const model = convoyCombatModel(ruleset);
    let attackerWounds = 0;
    let defenderWounds = 0;
    let recoverAt: Date | null = null;
    if (defenders > 0 && model) {
      const crew = (hit.attackerCrew as unknown as BossHitCrew | null) ?? { thugHappiness: 50, weapons: NO_GUNS };
      const fight = simulateRaid({
        attacker: { thugs: hit.squad, thugHappiness: crew.thugHappiness, weapons: crew.weapons },
        defender: { thugs: defenders, thugHappiness: owner.thugHappiness, weapons: rentedGunsOf(trip) },
        attackingThugs: Math.min(hit.squad, model.squadCap),
        attackerTurns: model.turnCost,
        defenderCashCents: 0n,
      }, model, rng);
      attackerWounds = Math.min(hit.squad, fight.wounds.attacker);
      defenderWounds = Math.min(defenders, fight.wounds.defender);
      recoverAt = new Date(at.getTime() + model.wounds.recoveryMinutes * 60_000);
      if (fight.winner !== 'ATTACKER') {
        trip = await tx.bossTrip.update({ where: { id: trip.id }, data: { lastHitAt: at, woundedBodyguards: trip.woundedBodyguards + defenderWounds } });
        const outcome: BossHitOutcome = {
          escaped: false, held: true, squad: hit.squad, defenders, cashCents: '0', laidUpUntil: null,
          attackerWounds, defenderWounds, recoverAt: recoverAt.toISOString(),
        };
        await tx.bossHit.update({ where: { id: hit.id }, data: { status: 'LANDED', settledAt: now, result: json(outcome) } });
        await ActivityService.log(tx, ownerId, 'BOSS_HIT_DEFENSE', json({
          hitId: hit.id, attacker: hit.attacker.displayName, cityName: cityName(ruleset, trip.city), escaped: false, held: true, wounds: defenderWounds,
        }));
        continue;
      }
    }
    // Nobody left standing between the squad and the boss: the hit lands.
    const loot = bossHitLootCents(ruleset, { bankrollCents: trip.bankrollCents, fitAttackers: hit.squad - attackerWounds, rng });
    const flight = trip.arrivesAt.getTime() - trip.departedAt.getTime();
    const laidUpUntil = laterOf(owner.laidUpUntil, new Date(at.getTime() + hunted.layUpMinutes * 60_000));
    trip = await tx.bossTrip.update({
      where: { id: trip.id },
      data: {
        bankrollCents: trip.bankrollCents - loot.cashCents,
        lastHitAt: at,
        woundedBodyguards: trip.woundedBodyguards + defenderWounds,
        // The stay is over: the boss is on the next flight home.
        stayUntil: at,
        returnsAt: new Date(at.getTime() + flight),
      },
    });
    await tx.roundPlayer.update({ where: { id: ownerId }, data: { laidUpUntil, awayNetWorthCents: await totalAwayWorth(tx, ownerId, ruleset) } });
    const outcome: BossHitOutcome = {
      escaped: false, held: false, squad: hit.squad, defenders, cashCents: loot.cashCents.toString(), laidUpUntil: laidUpUntil.toISOString(),
      attackerWounds, defenderWounds, recoverAt: recoverAt?.toISOString() ?? null,
    };
    await tx.bossHit.update({ where: { id: hit.id }, data: { status: 'LANDED', settledAt: now, result: json(outcome) } });
    if (loot.cashCents > 0n) {
      await EconomyLedgerService.record(tx, ownerId, [{
        source: 'BOSS_HIT_DEFENSE',
        label: `Robbed in ${cityName(ruleset, trip.city)} · ${hit.attacker.displayName}`,
        amountCents: -loot.cashCents,
        metadata: { hitId: hit.id },
      }], at);
    }
    await ActivityService.log(tx, ownerId, 'BOSS_HIT_DEFENSE', json({
      hitId: hit.id, attacker: hit.attacker.displayName, cityName: cityName(ruleset, trip.city), escaped: false,
      cashCents: -Number(loot.cashCents), laidUpUntil: laidUpUntil.toISOString(),
    }));
  }
  return trip;
}

/**
 * Trips A. Settle a player's trip. Called under the player's lock, before anything reads
 * the player, like a run's settle: hits whose window has closed land first (Trips C), then
 * a trip whose flight home has landed is home, and its bankroll is back in home cash. Net
 * worth does not move on the way home, because the bankroll was already counted as cash
 * while the boss was away. Idempotent.
 */
export const BossTripSettleService = {
  async settle(tx: Db, roundPlayerId: string, now: Date): Promise<void> {
    const active = await activeTrip(tx, roundPlayerId);
    if (!active) return;
    const { round } = await tx.roundPlayer.findUniqueOrThrow({
      where: { id: roundPlayerId },
      select: { round: { select: { rulesetId: true, rulesetVersion: true } } },
    });
    const ruleset = loadRulesetForRound(round);
    const trip = await landHits(tx, roundPlayerId, ruleset, active, now);
    if (trip.returnsAt.getTime() > now.getTime()) return;
    await tx.bossTrip.update({ where: { id: trip.id }, data: { status: 'RETURNED', returnedAt: trip.returnsAt } });
    const awayNetWorthCents = await totalAwayWorth(tx, roundPlayerId, ruleset);
    // Trips D: the bodyguards come home with the boss; the rented guns stay with Tommy's people.
    await tx.roundPlayer.update({
      where: { id: roundPlayerId },
      data: { cashCents: { increment: trip.bankrollCents }, thugs: { increment: trip.bodyguards }, awayNetWorthCents },
    });
    const recovery = ruleset.combat?.wounds.recoveryMinutes ?? 0;
    if (trip.woundedBodyguards > 0 && trip.lastHitAt) {
      const recoverAt = new Date(trip.lastHitAt.getTime() + recovery * 60_000);
      if (recoverAt > trip.returnsAt) await CombatRecoveryService.add(tx, roundPlayerId, null, trip.woundedBodyguards, recoverAt);
    }
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
      ...(trip.bodyguards > 0 ? { bodyguards: trip.bodyguards, woundedBodyguards: trip.woundedBodyguards, gunRentCents: Number(trip.gunRentCents) } : {}),
    });
  },

  /**
   * Trips C. Deliver what came back from hits this player started: the squad home and the
   * cash it took. Called under their lock, before they are read, like a convoy's credit.
   */
  async credit(tx: Db, playerId: string, now: Date): Promise<void> {
    const hits = await tx.bossHit.findMany({
      where: { attackerId: playerId, status: { in: ['LANDED', 'ESCAPED'] }, attackerCreditedAt: null },
      include: { owner: { select: { displayName: true } } },
    });
    if (!hits.length) return;
    const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, include: { round: true } });
    const ruleset = loadRulesetForRound(player.round);
    let busy = player.busyThugs;
    let cash = 0n;
    for (const hit of hits) {
      const outcome = hit.result as unknown as BossHitOutcome;
      const taken = BigInt(outcome.cashCents);
      busy = Math.max(0, busy - hit.squad);
      cash += taken;
      // Trips D: the squad brings home the wounds the bodyguards gave it.
      if ((outcome.attackerWounds ?? 0) > 0) {
        await CombatRecoveryService.add(tx, playerId, null, outcome.attackerWounds!, outcome.recoverAt ? new Date(outcome.recoverAt) : now);
      }
      if (taken > 0n) {
        await EconomyLedgerService.record(tx, playerId, [{
          source: 'BOSS_HIT_ATTACK',
          label: `Robbed ${hit.owner.displayName}`,
          amountCents: taken,
          metadata: { hitId: hit.id },
        }], hit.settledAt ?? now);
      }
      await tx.bossHit.update({ where: { id: hit.id }, data: { attackerCreditedAt: now } });
      await ActivityService.log(tx, playerId, 'BOSS_HIT_ATTACK', json({
        hitId: hit.id, owner: hit.owner.displayName, cityName: cityName(ruleset, hit.city), escaped: outcome.escaped, held: outcome.held ?? false,
        cashCents: Number(taken), wounds: outcome.attackerWounds ?? 0,
      }));
    }
    await tx.roundPlayer.update({ where: { id: playerId }, data: { busyThugs: busy, cashCents: { increment: cash } } });
  },

  /**
   * Trips A. What the lieutenant skims off a Scout or Produce take while the boss is
   * away (or, from C, laid up). Zero at home and on rounds without trips. Read after the
   * trip has settled.
   */
  async lieutenantCut(tx: Db, roundPlayerId: string, ruleset: Ruleset, takeCents: bigint, now: Date): Promise<bigint> {
    const rules = tripRules(ruleset);
    if (!rules || takeCents <= 0n) return 0n;
    return (await bossAway(tx, roundPlayerId, now)) ? lieutenantCutCents(rules, takeCents) : 0n;
  },
};

/** Trips B. The run the boss is riding with, if one is out. */
export async function bossRun(db: Db | PrismaClient, roundPlayerId: string) {
  return db.run.findFirst({ where: { roundPlayerId, status: 'ACTIVE', bossAboard: true }, select: { id: true, stops: { orderBy: { order: 'asc' }, select: { city: true } } } });
}

/**
 * Trips A/B/C. The boss is not running home: away on a flight trip, riding with a run, or
 * (with `now`) laid up after a beating.
 */
export async function bossAway(db: Db | PrismaClient, roundPlayerId: string, now?: Date): Promise<boolean> {
  const [trips, runs, player] = await Promise.all([
    db.bossTrip.count({ where: { roundPlayerId, status: 'ACTIVE' } }),
    db.run.count({ where: { roundPlayerId, status: 'ACTIVE', bossAboard: true } }),
    now ? db.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { laidUpUntil: true } }) : null,
  ]);
  return trips + runs > 0 || Boolean(now && player?.laidUpUntil && player.laidUpUntil.getTime() > now.getTime());
}
