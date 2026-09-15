import type { Prisma, PrismaClient } from '@prisma/client';
import type { AdminVoidBattleResultDto, BattleReportDto } from '@streets/shared';
import { lockRoundPlayer } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { fitThugs, toState } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { assertCorrectionState, correctionChanges, correctionSnapshot } from './admin-correction.shared.js';
import { writeRanks } from './combat.service.js';
import { HappinessService } from './happiness.service.js';
import { NetWorthService } from './net-worth.service.js';
import { PlayerStateService } from './player-state.service.js';
import { RankingService } from './ranking.service.js';

type Counts = Record<string, number>;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export const AdminBattleService = {
  /**
   * Reverse one battle after a confirmed bug or exploit. What the report says
   * moved goes back, limited to what the side that gained it still has. Wounds
   * from the battle that are still healing are taken back; healed or treated
   * wounds and spent medicine stay as they are. The attacker's turns come back
   * up to the ruleset cap. Protection and cooldown timers are left alone. The
   * battle stays visible, flagged, and stops counting for revenge, trophies,
   * repeat-target limits, stats and the raid feed.
   */
  async voidBattle(prisma: PrismaClient, actor: AuditActor, battleId: string, reason: string, now = new Date()): Promise<AdminVoidBattleResultDto> {
    const sides = await prisma.raidBattle.findUnique({ where: { id: battleId }, select: { attackerId: true, defenderId: true } });
    if (!sides) throw AppError.notFound('BATTLE_NOT_FOUND', 'That battle does not exist.');

    return prisma.$transaction(async (tx) => {
      // Same canonical lock order as combat, so a void never deadlocks a raid.
      for (const id of [sides.attackerId, sides.defenderId].sort()) await lockRoundPlayer(tx, id);
      const battle = await tx.raidBattle.findUniqueOrThrow({ where: { id: battleId } });
      if (battle.voidedAt) throw AppError.conflict('BATTLE_ALREADY_VOIDED', 'That battle has already been voided.');

      const priorAttacker = await tx.roundPlayer.findUniqueOrThrow({ where: { id: battle.attackerId }, include: { round: { select: { status: true } } } });
      const priorDefender = await tx.roundPlayer.findUniqueOrThrow({ where: { id: battle.defenderId } });
      if (priorAttacker.accountId === actor.id || priorDefender.accountId === actor.id) {
        throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin has to void a battle you were part of.');
      }
      if (priorAttacker.round.status !== 'ACTIVE' && priorAttacker.round.status !== 'REGISTRATION') {
        throw AppError.conflict('ROUND_FINISHED', 'That round has finished, so its standings are frozen.');
      }

      const settledAttacker = await PlayerStateService.settleInTransaction(tx, battle.attackerId, { now, markActive: false });
      const settledDefender = await PlayerStateService.settleInTransaction(tx, battle.defenderId, { now, markActive: false });
      const { ruleset } = settledAttacker;
      const attacker = settledAttacker.player;
      const defender = settledDefender.player;
      const report = battle.attackerReport as unknown as BattleReportDto;
      const kind = report.kind ?? (battle.kind === 'DRIVE_BY' ? 'DRIVE_BY' : 'RAID');
      const form = report.raidForm ?? { title: '' };

      const a = toState(attacker);
      const d = toState(defender);
      const beforeA = correctionSnapshot(a);
      const beforeD = correctionSnapshot(d);
      const shortA: Counts = {};
      const shortD: Counts = {};

      const injuries = await tx.combatInjury.findMany({ where: { battleId: battle.id } });
      const healing = (playerId: string) => injuries.filter((row) => row.roundPlayerId === playerId).reduce((sum, row) => sum + row.thugs, 0);
      a.woundedThugs = Math.max(0, a.woundedThugs - healing(attacker.id));
      d.woundedThugs = Math.max(0, d.woundedThugs - healing(defender.id));
      await tx.combatInjury.deleteMany({ where: { battleId: battle.id } });

      const giveBack = (field: 'crack' | 'lowRiders' | 'whores', amount: number) => {
        const back = Math.min(a[field], Math.max(0, amount));
        a[field] -= back;
        d[field] += back;
        if (amount > back) shortA[field] = amount - back;
      };

      if (kind === 'RAID') {
        const loot = BigInt(Math.max(0, report.cashChangeCents ?? 0));
        const back = a.cashCents < loot ? a.cashCents : loot;
        a.cashCents -= back;
        d.cashCents += back;
        if (loot > back) shortA.cashCents = Number(loot - back);
        giveBack('crack', report.crackChange ?? 0);
      } else if (kind === 'DRIVE_BY') {
        d.whores += report.driveBy?.whoresKilled ?? 0;
        a.lowRiders += report.driveBy?.lowRidersLost ?? 0;
        a.driveBysDone = Math.max(0, a.driveBysDone - 1);
      } else if (kind === 'DRUG_HOES') {
        a.crack += form.crackSpent ?? 0;
        d.crack += form.defenderCrackBurned ?? 0;
        d.condoms += form.defenderCondomsBurned ?? 0;
      } else if (kind === 'STEAL_RIDE') {
        giveBack('lowRiders', form.lowRidersStolen ?? 0);
      } else if (kind === 'LURE_CREW') {
        giveBack('whores', form.whoresLured ?? 0);
        const lured = form.thugsLured ?? 0;
        const back = Math.min(fitThugs(a), lured);
        a.thugs -= back;
        d.thugs += back;
        if (lured > back) shortA.thugs = lured - back;
        a.crack += form.crackSpent ?? 0;
        a.beer += form.beerSpent ?? 0;
      }

      const refund = Math.max(0, report.turnsSpent ?? 0);
      const turnsAfter = Math.max(a.turns, Math.min(ruleset.turns.cap, a.turns + refund));
      if (refund > turnsAfter - a.turns) shortA.turns = refund - (turnsAfter - a.turns);
      a.turns = turnsAfter;

      assertCorrectionState(a, ruleset, attacker.displayName);
      assertCorrectionState(d, ruleset, defender.displayName);

      const ranksBeforeA = await RankingService.ranksFor(tx, attacker);
      const ranksBeforeD = await RankingService.ranksFor(tx, defender);
      const worthA = NetWorthService.calculate(a, ruleset);
      const worthD = NetWorthService.calculate(d, ruleset);
      const happyA = HappinessService.recalculate({ ...a, thugs: fitThugs(a) }, ruleset);
      const happyD = HappinessService.recalculate({ ...d, thugs: fitThugs(d) }, ruleset);
      await tx.roundPlayer.update({
        where: { id: attacker.id },
        data: { cashCents: a.cashCents, turns: a.turns, whores: a.whores, thugs: a.thugs, woundedThugs: a.woundedThugs,
          crack: a.crack, beer: a.beer, lowRiders: a.lowRiders, driveBysDone: a.driveBysDone,
          whoreHappiness: happyA.whoreHappiness, thugHappiness: happyA.thugHappiness, netWorthCents: worthA },
      });
      await tx.roundPlayer.update({
        where: { id: defender.id },
        data: { cashCents: d.cashCents, whores: d.whores, thugs: d.thugs, woundedThugs: d.woundedThugs,
          crack: d.crack, condoms: d.condoms, lowRiders: d.lowRiders,
          whoreHappiness: happyD.whoreHappiness, thugHappiness: happyD.thugHappiness, netWorthCents: worthD },
      });
      const ranksAfterA = await RankingService.ranksFor(tx, { ...attacker, netWorthCents: worthA });
      const ranksAfterD = await RankingService.ranksFor(tx, { ...defender, netWorthCents: worthD });
      await writeRanks(tx, ruleset, now, [[attacker.id, priorAttacker, ranksBeforeA, ranksAfterA], [defender.id, priorDefender, ranksBeforeD, ranksAfterD]]);

      await tx.raidBattle.update({ where: { id: battle.id }, data: { voidedAt: now, voidedByUsername: actor.username, voidReason: reason } });

      const afterA = correctionSnapshot(a);
      const afterD = correctionSnapshot(d);
      const changesA = correctionChanges(beforeA, afterA);
      const changesD = correctionChanges(beforeD, afterD);
      await ActivityService.log(tx, attacker.id, 'BATTLE_VOIDED', json({ battleId: battle.id, kind, opponent: defender.displayName, reason, changes: changesA, shortfall: shortA }));
      await ActivityService.log(tx, defender.id, 'BATTLE_VOIDED', json({ battleId: battle.id, kind, opponent: attacker.displayName, reason, changes: changesD, shortfall: shortD }));
      await AdminAuditService.record(tx, actor, {
        action: 'battle.void',
        targetType: 'battle',
        targetId: battle.id,
        reason,
        before: { attacker: { roundPlayerId: attacker.id, ...beforeA }, defender: { roundPlayerId: defender.id, ...beforeD } },
        after: { kind, attacker: { roundPlayerId: attacker.id, ...afterA }, defender: { roundPlayerId: defender.id, ...afterD }, shortfall: { attacker: shortA, defender: shortD } },
      });

      return {
        battleId: battle.id,
        kind,
        attacker: { roundPlayerId: attacker.id, displayName: attacker.displayName, changes: changesA, shortfall: shortA },
        defender: { roundPlayerId: defender.id, displayName: defender.displayName, changes: changesD, shortfall: shortD },
      };
    }, { timeout: 15_000, maxWait: 10_000 });
  },
};
