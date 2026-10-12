import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { AdminSupplyCorrectionResult } from '@streets/shared';
import { lockRoundPlayer } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { SupplyReconcileService, ledgerHolding } from './supply-reconcile.service.js';

/**
 * 1.6.0-I. An audited correction to stock in one warehouse or one dealer crew: staff set the
 * quantity they counted, with a reason. The ledger is moved to agree with it by a CORRECTED
 * movement (from what the ledger said, not from whatever the table held), so the place
 * reconciles afterwards even when the mismatch came from outside the ledger. Both figures go
 * to the audit log. Finished rounds are frozen: a
 * correction never changes a round that has ended. Nobody corrects their own player.
 */
export const AdminSupplyCorrectionService = {
  async adjust(
    prisma: PrismaClient,
    actor: AuditActor,
    roundPlayerId: string,
    input: { target: 'WAREHOUSE' | 'CREW'; targetId: string; productKey: string; quantity: number; reason: string },
    now = new Date(),
  ): Promise<AdminSupplyCorrectionResult> {
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const player = await tx.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        select: { id: true, accountId: true, displayName: true, round: { select: { id: true, status: true, rulesetId: true, rulesetVersion: true } } },
      });
      if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
      if (player.accountId === actor.id) throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin has to correct your own stock.');
      if (player.round.status !== 'ACTIVE' && player.round.status !== 'REGISTRATION') {
        throw AppError.conflict('ROUND_FINISHED', 'That round has finished, so its supply is frozen.');
      }
      const ruleset = loadRulesetForRound(player.round);
      if (!ruleset.supplyNetwork?.enabled) throw AppError.conflict('SUPPLY_DISABLED', 'This round has no supply network.');
      if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) throw AppError.badRequest('CORRECTION_INVALID', 'Set a whole number of units, 0 or more.');

      let before: number;
      let location: string;
      if (input.target === 'WAREHOUSE') {
        const warehouse = await tx.supplyWarehouse.findFirst({ where: { id: input.targetId, roundPlayerId } });
        if (!warehouse) throw AppError.notFound('WAREHOUSE_NOT_FOUND', 'That warehouse is not this player’s.');
        before = (await tx.supplyStock.findUnique({ where: { warehouseId_productKey: { warehouseId: warehouse.id, productKey: input.productKey } } }))?.quantity ?? 0;
        await tx.supplyStock.upsert({
          where: { warehouseId_productKey: { warehouseId: warehouse.id, productKey: input.productKey } },
          create: { warehouseId: warehouse.id, productKey: input.productKey, quantity: input.quantity },
          update: { quantity: input.quantity },
        });
        location = `warehouse:${warehouse.id}`;
      } else {
        const crew = await tx.dealerCrew.findFirst({ where: { id: input.targetId, roundPlayerId }, include: { inventory: true } });
        if (!crew) throw AppError.notFound('DEALER_CREW_NOT_FOUND', 'That crew is not this player’s.');
        if (crew.productKey && input.productKey !== crew.productKey && input.quantity > 0) {
          throw AppError.conflict('CREW_ONE_PRODUCT', 'A crew holds only the product it sells.');
        }
        const others = crew.inventory.filter((row) => row.productKey !== input.productKey).reduce((sum, row) => sum + row.quantity, 0);
        if (others + input.quantity > crew.capacityUnits) throw AppError.conflict('DEALER_CREW_FULL', `That crew holds at most ${crew.capacityUnits}.`);
        before = crew.inventory.find((row) => row.productKey === input.productKey)?.quantity ?? 0;
        await tx.dealerStock.upsert({
          where: { dealerCrewId_productKey: { dealerCrewId: crew.id, productKey: input.productKey } },
          create: { dealerCrewId: crew.id, productKey: input.productKey, quantity: input.quantity },
          update: { quantity: input.quantity },
        });
        location = `crew:${crew.id}`;
      }
      const delta = input.quantity - before;
      const ledgerBefore = await ledgerHolding(tx, roundPlayerId, location, input.productKey);
      const ledgerDelta = input.quantity - ledgerBefore;
      if (delta === 0 && ledgerDelta === 0) throw AppError.conflict('CORRECTION_UNCHANGED', `It already holds ${before}, and the ledger agrees.`);
      const requestKey = `admin:${randomUUID()}`;
      if (ledgerDelta !== 0) await tx.supplyMovement.create({
        data: {
          roundPlayerId, kind: 'CORRECTED', productKey: input.productKey, quantityDelta: ledgerDelta,
          fromLocation: location, toLocation: location,
          ...(input.target === 'WAREHOUSE' ? { warehouseId: input.targetId } : { dealerCrewId: input.targetId }),
          requestKey, metadata: { reason: input.reason, actor: actor.username }, createdAt: now,
        },
      });
      const audit = await AdminAuditService.record(tx, actor, {
        action: 'supply.stock-adjust',
        targetType: input.target === 'WAREHOUSE' ? 'supply-warehouse' : 'dealer-crew',
        targetId: input.targetId,
        reason: input.reason,
        before: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, product: input.productKey, quantity: before, ledger: ledgerBefore },
        after: { roundId: player.round.id, roundPlayerId, displayName: player.displayName, product: input.productKey, quantity: input.quantity, requestKey },
      });
      return { before, after: input.quantity, delta, auditId: audit?.id ?? null, problems: await SupplyReconcileService.player(tx, roundPlayerId) };
    });
  },
};
