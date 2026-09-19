import type { Prisma, PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { lockRoundPlayer } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { ActivityService } from './activity.service.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { PlayerStateService } from './player-state.service.js';
import { CRACK, ProductInventoryService } from './product-inventory.service.js';
import { RUN_INCLUDE, awayWorth, cargoOf } from './run-settle.service.js';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export interface AdminVoidConvoyResult {
  tailId: string;
  returned: { cashCents: number; cargo: Record<string, number>; lowRiders: number };
  shortfall: { cashCents: number; cargo: Record<string, number>; lowRiders: number };
}

/**
 * 0.5.0-E. Reverse one convoy hit after a confirmed bug or exploit, like a voided battle:
 * what the attacker took goes back, limited to what they still hold, into the run if it
 * is still out or home if it is back. Wounds and spent turns stay; the tail stays visible,
 * flagged.
 */
export const AdminConvoyService = {
  async voidTail(prisma: PrismaClient, actor: AuditActor, tailId: string, reason: string, now = new Date()): Promise<AdminVoidConvoyResult> {
    const sides = await prisma.convoyTail.findUnique({ where: { id: tailId }, select: { attackerId: true, ownerId: true } });
    if (!sides) throw AppError.notFound('TAIL_NOT_FOUND', 'That convoy hit does not exist.');
    return prisma.$transaction(async (tx) => {
      for (const id of [sides.attackerId, sides.ownerId].sort()) await lockRoundPlayer(tx, id);
      // Settling both lands the tail if it is due and hands the attacker their haul, so there is something to reverse.
      await PlayerStateService.settleInTransaction(tx, sides.ownerId, { now, markActive: false });
      await PlayerStateService.settleInTransaction(tx, sides.attackerId, { now, markActive: false });
      const tail = await tx.convoyTail.findUniqueOrThrow({ where: { id: tailId }, include: { attacker: { include: { round: true } }, owner: true } });
      if (tail.voidedAt) throw AppError.conflict('ALREADY_VOIDED', 'That convoy hit has already been voided.');
      if (tail.status !== 'LANDED') throw AppError.conflict('NOT_LANDED', 'Only a hit that landed can be voided.');
      if (tail.attacker.accountId === actor.id || tail.owner.accountId === actor.id) throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin has to void a hit you were part of.');
      const ruleset = loadRulesetForRound(tail.attacker.round);
      const result = tail.result as unknown as { loot: { cashCents: string; cargo: Record<string, number> }; lowRider: number };

      // Where the haul went: the attacking run's trunk if it is still out, else home.
      const fromRun = tail.source === 'RUN' && tail.attackerRunId ? await tx.run.findUnique({ where: { id: tail.attackerRunId }, include: RUN_INCLUDE }) : null;
      const attackerRun = fromRun?.status === 'ACTIVE' ? fromRun : null;
      const attacker = await tx.roundPlayer.findUniqueOrThrow({ where: { id: tail.attackerId } });
      const attackerProducts = attackerRun ? cargoOf(attackerRun) : { ...(await ProductInventoryService.read(tx, attacker.id, ruleset)), [CRACK]: attacker.crack };
      const attackerCash = attackerRun ? attackerRun.cashCents : attacker.cashCents;
      const attackerCars = attackerRun ? attackerRun.lowRiders - 1 : attacker.lowRiders;

      const loot = BigInt(result.loot.cashCents);
      const cash = attackerCash < loot ? attackerCash : loot;
      const cargo = Object.fromEntries(Object.entries(result.loot.cargo).map(([key, units]) => [key, Math.max(0, Math.min(units, attackerProducts[key] ?? 0))]));
      const cars = Math.max(0, Math.min(result.lowRider, attackerCars));
      const shortfall = {
        cashCents: Number(loot - cash),
        cargo: Object.fromEntries(Object.entries(result.loot.cargo).map(([key, units]) => [key, units - (cargo[key] ?? 0)]).filter(([, units]) => (units as number) > 0)),
        lowRiders: result.lowRider - cars,
      };

      // Out of the attacker's hands.
      if (attackerRun) {
        const held = cargoOf(attackerRun);
        for (const [key, units] of Object.entries(cargo)) {
          if (units <= 0) continue;
          held[key] = (held[key] ?? 0) - units;
          await tx.runCargo.update({ where: { runId_productKey: { runId: attackerRun.id, productKey: key } }, data: { quantity: held[key] } });
        }
        const next = { ...attackerRun, cashCents: attackerRun.cashCents - cash, lowRiders: attackerRun.lowRiders - cars };
        await tx.run.update({ where: { id: attackerRun.id }, data: { cashCents: next.cashCents, lowRiders: next.lowRiders } });
        await tx.roundPlayer.update({ where: { id: attacker.id }, data: { awayNetWorthCents: awayWorth(ruleset, next, held) } });
      } else {
        const rows = Object.fromEntries(Object.entries(cargo).filter(([key, units]) => key !== CRACK && units > 0).map(([key, units]) => [key, -units]));
        if (Object.keys(rows).length) await ProductInventoryService.adjust(tx, attacker.id, ruleset, rows);
        await tx.roundPlayer.update({ where: { id: attacker.id }, data: { cashCents: { decrement: cash }, crack: { decrement: cargo[CRACK] ?? 0 }, lowRiders: { decrement: cars } } });
      }

      // Back to the run it came from, or home if the run is back.
      const run = await tx.run.findUniqueOrThrow({ where: { id: tail.runId }, include: RUN_INCLUDE });
      if (run.status === 'ACTIVE') {
        const held = cargoOf(run);
        for (const [key, units] of Object.entries(cargo)) {
          if (units <= 0) continue;
          held[key] = (held[key] ?? 0) + units;
          await tx.runCargo.upsert({ where: { runId_productKey: { runId: run.id, productKey: key } }, create: { runId: run.id, productKey: key, quantity: units, startQuantity: 0 }, update: { quantity: { increment: units } } });
        }
        const next = { ...run, cashCents: run.cashCents + cash, lowRiders: run.lowRiders + cars };
        await tx.run.update({ where: { id: run.id }, data: { cashCents: next.cashCents, lowRiders: next.lowRiders } });
        await tx.roundPlayer.update({ where: { id: tail.ownerId }, data: { awayNetWorthCents: awayWorth(ruleset, next, held) } });
      } else {
        const rows = Object.fromEntries(Object.entries(cargo).filter(([key, units]) => key !== CRACK && units > 0));
        if (Object.keys(rows).length) await ProductInventoryService.adjust(tx, tail.ownerId, ruleset, rows);
        await tx.roundPlayer.update({ where: { id: tail.ownerId }, data: { cashCents: { increment: cash }, crack: { increment: cargo[CRACK] ?? 0 }, lowRiders: { increment: cars } } });
      }

      await tx.convoyTail.update({ where: { id: tail.id }, data: { voidedAt: now } });
      // Settle again so net worth and ranks follow the goods.
      await PlayerStateService.settleInTransaction(tx, tail.attackerId, { now, markActive: false });
      await PlayerStateService.settleInTransaction(tx, tail.ownerId, { now, markActive: false });

      const returned = { cashCents: Number(cash), cargo, lowRiders: cars };
      await ActivityService.log(tx, tail.attackerId, 'BATTLE_VOIDED', json({ tailId: tail.id, kind: 'CONVOY', opponent: tail.owner.displayName, reason, changes: { cashCents: -Number(cash), lowRiders: -cars, ...Object.fromEntries(Object.entries(cargo).map(([key, units]) => [key, -units])) }, shortfall }));
      await ActivityService.log(tx, tail.ownerId, 'BATTLE_VOIDED', json({ tailId: tail.id, kind: 'CONVOY', opponent: tail.attacker.displayName, reason, changes: { cashCents: Number(cash), lowRiders: cars, ...cargo }, shortfall: {} }));
      await AdminAuditService.record(tx, actor, {
        action: 'convoy.void',
        targetType: 'convoy',
        targetId: tail.id,
        reason,
        before: { attacker: tail.attackerId, owner: tail.ownerId, loot: result.loot, lowRider: result.lowRider },
        after: { returned, shortfall },
      });
      return { tailId: tail.id, returned, shortfall };
    }, { timeout: 15_000, maxWait: 10_000 });
  },
};
