import type { Prisma, PrismaClient } from '@prisma/client';
import {
  hashParts,
  loadRulesetForRound,
  rulesetForCity,
  seededRng,
  simulateRaid,
  splitWounds,
  turfPushCombatModel,
} from '@streets/rules-engine';
import type { WeaponKey } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { lockRoundPlayer } from '../utils/db.js';
import { ActivityService } from './activity.service.js';
import { CombatRecoveryService } from './combat-recovery.service.js';
import {
  TurfService,
  addCornerGuns,
  cornerGunWorthCents,
  gunsFromTurf,
  releaseCornerGuns,
  subtractCornerGuns,
  turfGunData,
  type CornerGuns,
} from './turf.service.js';

type Weapons = Record<WeaponKey, number>;
type PushModel = NonNullable<ReturnType<typeof turfPushCombatModel>>;
interface CrewSnapshot { thugHappiness: number; weapons: Weapons; }
interface StoredPushResult {
  won: boolean;
  unopposed: boolean;
  stale: boolean;
  attackerWounds: number;
  defenderWounds: number;
  cornerWounds: number;
  ownerBackupWounds: number;
  allyBackup: number;
  defenders: { corner: number; ownerBackup: number; allyCommitted: number; allyShowed: number };
  attackerPostedThugs: number;
  attackerPostedGuns: CornerGuns;
  attackerReturnedGuns: CornerGuns;
  strength: { attacker: number; defender: number } | null;
  shieldUntil: string | null;
  recoverAt: string | null;
}

const EMPTY: CornerGuns = { pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 };
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const fromWeapons = (w: Weapons): CornerGuns => ({ pistols: w.PISTOL ?? 0, shotguns: w.SHOTGUN ?? 0, tek9s: w.TEK9 ?? 0, ak47s: w.AK47 ?? 0 });
const toWeapons = (g: CornerGuns): Weapons => ({ PISTOL: g.pistols, SHOTGUN: g.shotguns, TEK9: g.tek9s, AK47: g.ak47s });
const addWeapons = (a: Weapons, b: Weapons): Weapons => ({ PISTOL: a.PISTOL + b.PISTOL, SHOTGUN: a.SHOTGUN + b.SHOTGUN, TEK9: a.TEK9 + b.TEK9, AK47: a.AK47 + b.AK47 });
const crew = (value: Prisma.JsonValue) => value as unknown as CrewSnapshot;

function engagement(groups: Array<{ key: string; size: number }>, cap: number): Record<string, number> {
  const engaged: Record<string, number> = {};
  let left = cap;
  for (const group of groups) {
    const count = Math.min(Math.max(0, group.size), left);
    engaged[group.key] = count;
    left -= count;
    if (left <= 0) break;
  }
  return engaged;
}

function committedWeapons(snapshot: CrewSnapshot, count: number, model: PushModel): Weapons {
  const out: Weapons = { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 };
  let left = count;
  const keys = (Object.keys(model.weapons) as WeaponKey[])
    .sort((a, b) => model.weapons[b].power - model.weapons[a].power || a.localeCompare(b));
  for (const key of keys) {
    if (left <= 0) break;
    const take = Math.min(snapshot.weapons[key] ?? 0, left);
    out[key] = take;
    left -= take;
  }
  return out;
}

async function lockPush(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "TurfPush" WHERE id = ${id} FOR UPDATE`;
}
async function lockBlock(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Turf" WHERE id = ${id} FOR UPDATE`;
}

export const TurfWarSettlementService = {
  async settleDueFor(prisma: PrismaClient, playerId: string, now: Date = new Date()): Promise<number> {
    const due = await prisma.turfPush.findMany({
      where: {
        status: 'PENDING',
        landsAt: { lte: now },
        OR: [{ attackerId: playerId }, { defenderId: playerId }, { backups: { some: { playerId } } }],
      },
      select: { id: true },
      orderBy: { landsAt: 'asc' },
      take: 20,
    });
    for (const row of due) await TurfWarSettlementService.land(prisma, row.id, now);
    return due.length;
  },

  async sweep(prisma: PrismaClient, now: Date = new Date()): Promise<number> {
    const due = await prisma.turfPush.findMany({
      where: { status: 'PENDING', landsAt: { lte: now } },
      select: { id: true },
      orderBy: { landsAt: 'asc' },
      take: 200,
    });
    for (const row of due) await TurfWarSettlementService.land(prisma, row.id, now);
    return due.length;
  },

  async land(prisma: PrismaClient, pushId: string, now: Date = new Date()): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const candidate = await tx.turfPush.findUnique({
        where: { id: pushId },
        include: { round: true, turf: { include: { city: true } } },
      });
      if (!candidate || candidate.status !== 'PENDING' || candidate.landsAt > now) return false;

      // Keep the same lock order as defender actions: player first, then the push.
      await lockRoundPlayer(tx, candidate.defenderId);
      await lockPush(tx, pushId);
      const loaded = await tx.turfPush.findUnique({
        where: { id: pushId },
        include: { round: true, turf: { include: { city: true } } },
      });
      if (!loaded || loaded.status !== 'PENDING' || loaded.landsAt > now) return false;

      const base = loadRulesetForRound(loaded.round);
      const rules = base.turf;
      const model = turfPushCombatModel(base);
      if (!rules?.wars || !model) return false;
      const at = loaded.landsAt;

      await TurfService.settlePlayer(tx, loaded.defenderId, rulesetForCity(base, loaded.turf.city.slug), at);
      await lockBlock(tx, loaded.turfId);

      const [turf, defender, backups] = await Promise.all([
        tx.turf.findUniqueOrThrow({ where: { id: loaded.turfId }, include: { city: true } }),
        tx.roundPlayer.findUniqueOrThrow({ where: { id: loaded.defenderId } }),
        tx.turfPushBackup.findMany({ where: { pushId }, orderBy: { sentAt: 'asc' } }),
      ]);
      const attacker = crew(loaded.attackerCrew);
      const attackerGuns = fromWeapons(attacker.weapons);
      const ownerBackups = backups.filter((row) => row.kind === 'OWNER');
      const allyBackups = backups.filter((row) => row.kind === 'ALLY');

      const shownAllies: typeof allyBackups = [];
      let allyShown = 0;
      for (const backup of allyBackups) {
        const show = seededRng(hashParts(loaded.id, backup.playerId, 'turf-help'))() < rules.push.allies.chanceToShowUp;
        await tx.turfPushBackup.update({ where: { id: backup.id }, data: { showedUp: show } });
        if (show) { shownAllies.push(backup); allyShown += backup.thugs; }
      }
      for (const backup of ownerBackups) {
        await tx.turfPushBackup.update({ where: { id: backup.id }, data: { showedUp: true } });
      }

      const stillDefended = turf.holderId === loaded.defenderId;
      const stale = turf.holderId !== null && !stillDefended;
      let won = !stillDefended && !stale;
      let unopposed = won;
      let attackerWounds = 0;
      let defenderWounds = 0;
      let cornerWounds = 0;
      let ownerBackupWounds = 0;
      let strength: StoredPushResult['strength'] = null;
      let recoverAt: Date | null = null;
      const woundByBackup = new Map<string, number>();

      if (stillDefended) {
        const groups = [
          { key: 'corner', size: turf.cornerThugs, snapshot: { thugHappiness: defender.thugHappiness, weapons: toWeapons(gunsFromTurf(turf)) } },
          ...ownerBackups.map((backup) => ({ key: `owner:${backup.id}`, size: backup.thugs, snapshot: crew(backup.crew) })),
          ...shownAllies.map((backup) => ({ key: `ally:${backup.id}`, size: backup.thugs, snapshot: crew(backup.crew) })),
        ];
        // The combat model has a hard engagement cap. Corner thugs fill it first,
        // then owner backup, then allies in send order; only engaged groups can be wounded.
        const engaged = engagement(groups.map(({ key, size }) => ({ key, size })), model.squadCap);
        let defenderWeapons: Weapons = { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 };
        let defenderCount = 0;
        let moraleTotal = 0;
        for (const group of groups) {
          const count = engaged[group.key] ?? 0;
          if (count <= 0) continue;
          defenderCount += count;
          moraleTotal += count * group.snapshot.thugHappiness;
          defenderWeapons = addWeapons(defenderWeapons, committedWeapons(group.snapshot, count, model));
        }

        const fight = simulateRaid({
          attacker: { thugs: loaded.squad, thugHappiness: attacker.thugHappiness, weapons: attacker.weapons },
          defender: {
            thugs: defenderCount,
            thugHappiness: defenderCount > 0 ? Math.round(moraleTotal / defenderCount) : defender.thugHappiness,
            weapons: defenderWeapons,
          },
          attackingThugs: loaded.squad,
          attackerTurns: model.turnCost,
          defenderCashCents: 0n,
        }, model, seededRng(hashParts(loaded.id, 'turf-fight')));

        won = fight.winner === 'ATTACKER';
        unopposed = false;
        attackerWounds = fight.wounds.attacker;
        defenderWounds = fight.wounds.defender;
        strength = { attacker: Math.round(fight.effectiveStrength.attacker), defender: Math.round(fight.effectiveStrength.defender) };
        recoverAt = new Date(at.getTime() + model.wounds.recoveryMinutes * 60_000);

        const split = splitWounds(defenderWounds, engaged);
        cornerWounds = split.corner ?? 0;
        for (const backup of ownerBackups) woundByBackup.set(backup.id, split[`owner:${backup.id}`] ?? 0);
        for (const backup of shownAllies) woundByBackup.set(backup.id, split[`ally:${backup.id}`] ?? 0);
        ownerBackupWounds = ownerBackups.reduce((sum, backup) => sum + (woundByBackup.get(backup.id) ?? 0), 0);
      }

      const attackerReturnedGuns = won ? releaseCornerGuns(attackerGuns, attackerWounds) : attackerGuns;
      const attackerPostedGuns = won ? subtractCornerGuns(attackerGuns, attackerReturnedGuns) : { ...EMPTY };
      const attackerPostedThugs = won ? Math.max(0, loaded.squad - attackerWounds) : 0;

      const ownerBackupGuns = ownerBackups.reduce(
        (sum, backup) => addCornerGuns(sum, fromWeapons(crew(backup.crew).weapons)),
        { ...EMPTY },
      );
      const losingCornerGuns = won && stillDefended ? gunsFromTurf(turf) : { ...EMPTY };
      const defenderReturnedGuns = addCornerGuns(ownerBackupGuns, losingCornerGuns);
      const defenderReturnedWorth = cornerGunWorthCents(base, defenderReturnedGuns);
      const ownerBackupThugs = ownerBackups.reduce((sum, backup) => sum + backup.thugs, 0);

      if (ownerBackupThugs > 0 || (won && stillDefended)) {
        await tx.roundPlayer.update({
          where: { id: defender.id },
          data: {
            busyThugs: Math.max(0, defender.busyThugs - ownerBackupThugs),
            postedThugs: won && stillDefended ? Math.max(0, defender.postedThugs - turf.cornerThugs) : defender.postedThugs,
            pistols: defender.pistols + defenderReturnedGuns.pistols,
            shotguns: defender.shotguns + defenderReturnedGuns.shotguns,
            tek9s: defender.tek9s + defenderReturnedGuns.tek9s,
            ak47s: defender.ak47s + defenderReturnedGuns.ak47s,
            postedNetWorthCents: defender.postedNetWorthCents >= defenderReturnedWorth
              ? defender.postedNetWorthCents - defenderReturnedWorth
              : 0n,
          },
        });
      }

      const defenderPersistentWounds = ownerBackupWounds + (won && stillDefended ? cornerWounds : 0);
      if (recoverAt && defenderPersistentWounds > 0) {
        await CombatRecoveryService.add(tx, defender.id, null, defenderPersistentWounds, recoverAt);
      }

      for (const backup of ownerBackups) {
        await tx.turfPushBackup.update({
          where: { id: backup.id },
          data: { wounded: woundByBackup.get(backup.id) ?? 0, creditedAt: at },
        });
      }
      for (const backup of allyBackups) {
        await tx.turfPushBackup.update({
          where: { id: backup.id },
          data: { wounded: woundByBackup.get(backup.id) ?? 0 },
        });
      }

      const shieldUntil = won ? new Date(at.getTime() + rules.push.shieldHours * 3_600_000) : null;
      if (won) {
        await tx.turf.update({
          where: { id: turf.id },
          data: {
            holderId: loaded.attackerId,
            cornerThugs: attackerPostedThugs,
            ...turfGunData(attackerPostedGuns),
            heldSince: at,
            shieldUntil,
            upkeepAt: at,
            localsAt: at,
            localsReclaimAt: null,
          },
        });
      }

      const result: StoredPushResult = {
        won, unopposed, stale, attackerWounds, defenderWounds, cornerWounds, ownerBackupWounds,
        allyBackup: allyShown,
        defenders: {
          corner: stillDefended ? turf.cornerThugs : 0,
          ownerBackup: ownerBackups.reduce((sum, backup) => sum + backup.thugs, 0),
          allyCommitted: allyBackups.reduce((sum, backup) => sum + backup.thugs, 0),
          allyShowed: allyShown,
        },
        attackerPostedThugs, attackerPostedGuns, attackerReturnedGuns,
        strength, shieldUntil: shieldUntil?.toISOString() ?? null, recoverAt: recoverAt?.toISOString() ?? null,
      };
      await tx.turfPush.update({
        where: { id: loaded.id },
        data: { status: 'LANDED', settledAt: at, captured: won, result: json(result) },
      });
      await ActivityService.log(tx, defender.id, 'TURF_PUSH_DEFENSE', json({
        pushId: loaded.id, district: turf.district, held: !won, unopposed, stale,
        attackerWounds, defenderWounds, cornerWounds, ownerBackupWounds, allyBackup: allyShown, strength,
      }));
      return true;
    }, { timeout: 15_000, maxWait: 10_000 });
  },

  async credit(tx: Db, playerId: string, now: Date = new Date()): Promise<void> {
    const [pushes, backups] = await Promise.all([
      tx.turfPush.findMany({
        where: { attackerId: playerId, status: 'LANDED', attackerCreditedAt: null },
        orderBy: { settledAt: 'asc' },
      }),
      tx.turfPushBackup.findMany({
        where: { playerId, creditedAt: null, push: { status: 'LANDED' } },
        include: { push: { select: { result: true } } },
        orderBy: { sentAt: 'asc' },
      }),
    ]);
    if (!pushes.length && !backups.length) return;

    const player = await tx.roundPlayer.findUniqueOrThrow({ where: { id: playerId }, include: { round: true } });
    const ruleset = loadRulesetForRound(player.round);
    let busyThugs = player.busyThugs;
    let postedThugs = player.postedThugs;
    let postedNetWorthCents = player.postedNetWorthCents;
    let homeGuns: CornerGuns = { pistols: player.pistols, shotguns: player.shotguns, tek9s: player.tek9s, ak47s: player.ak47s };

    for (const push of pushes) {
      const result = push.result as unknown as StoredPushResult;
      busyThugs = Math.max(0, busyThugs - push.squad);
      postedThugs += result.attackerPostedThugs;
      homeGuns = addCornerGuns(homeGuns, result.attackerReturnedGuns);
      const returnedWorth = cornerGunWorthCents(ruleset, result.attackerReturnedGuns);
      postedNetWorthCents = postedNetWorthCents >= returnedWorth ? postedNetWorthCents - returnedWorth : 0n;
      if (result.recoverAt && result.attackerWounds > 0) {
        await CombatRecoveryService.add(tx, playerId, null, result.attackerWounds, new Date(result.recoverAt));
      }
      await tx.turfPush.update({ where: { id: push.id }, data: { attackerCreditedAt: now } });
      await ActivityService.log(tx, playerId, 'TURF_PUSH_ATTACK', json({
        pushId: push.id, won: result.won, unopposed: result.unopposed, stale: result.stale,
        wounds: result.attackerWounds, posted: result.attackerPostedThugs, strength: result.strength,
      }));
    }

    for (const backup of backups) {
      const guns = fromWeapons(crew(backup.crew).weapons);
      busyThugs = Math.max(0, busyThugs - backup.thugs);
      homeGuns = addCornerGuns(homeGuns, guns);
      const returnedWorth = cornerGunWorthCents(ruleset, guns);
      postedNetWorthCents = postedNetWorthCents >= returnedWorth ? postedNetWorthCents - returnedWorth : 0n;
      const result = backup.push.result as unknown as StoredPushResult | null;
      if (backup.showedUp && backup.wounded > 0 && result?.recoverAt) {
        await CombatRecoveryService.add(tx, playerId, null, backup.wounded, new Date(result.recoverAt));
      }
      await tx.turfPushBackup.update({ where: { id: backup.id }, data: { creditedAt: now } });
      await ActivityService.log(tx, playerId, 'TURF_PUSH_BACKUP', json({
        pushId: backup.pushId, kind: backup.kind, showedUp: backup.showedUp ?? false, wounds: backup.wounded,
      }));
    }

    await tx.roundPlayer.update({
      where: { id: playerId },
      data: { busyThugs, postedThugs, postedNetWorthCents, ...homeGuns },
    });
  },
};
