import type { PrismaClient } from '@prisma/client';
import { loadRulesetForRound, rulesetForCity } from '@streets/rules-engine';
import type { AdminTurfDto, AdminTurfHistoryDto, AdminTurfRepair } from '@streets/shared';
import { lockRound, lockRoundPlayer, type Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { ProductInventoryService } from './product-inventory.service.js';
import { cornerGunWorthCents, gunsFromTurf, localsReclaimAt, outpostBoxWorthCents, turfGunData } from './turf.service.js';
import { endTurfHold } from './turf-history.service.js';
import { recordTerritoryControlChange, territoryControlForCity } from './turf-territory.service.js';
import { TurfWarSettlementService } from './turf-war-settle.service.js';

/**
 * 1.0.0-E. Turf for operators: every block and what stands on it, who held it
 * when, and three repairs for state that has gone wrong, each audited with the
 * rows as they were:
 *
 * - release-block: the holder's corner comes home (thugs, guns, and an outpost
 *   box's contents) and the locals take the block back.
 * - sync-posted: a holder's posted thugs and posted/outpost net worth are
 *   recomputed from the corners and boxes they actually hold.
 * - settle-push: a push past its landing time that nobody's page has settled is
 *   landed now, exactly as the defender's next visit would land it.
 */

const playerRef = { select: { id: true, displayName: true, publicPimpId: true, accountId: true } } as const;
/** A pending push this long past landing is stuck, not merely waiting for a visitor. */
const OVERDUE_MS = 10 * 60_000;

async function lockBlock(tx: Db, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Turf" WHERE id = ${id} FOR UPDATE`;
}

export const AdminTurfService = {
  async overview(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminTurfDto> {
    const round = await prisma.round.findUnique({ where: { id: roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const blocks = await prisma.turf.findMany({
      where: { roundId },
      orderBy: [{ city: { sortOrder: 'asc' } }, { district: 'asc' }],
      include: {
        city: { select: { slug: true, name: true } },
        holder: playerRef,
        outpost: true,
        pushes: { where: { status: 'PENDING' }, orderBy: { landsAt: 'asc' }, include: { attacker: { select: { displayName: true } } } },
      },
    });
    const holders = await prisma.roundPlayer.findMany({
      where: { roundId, OR: [{ postedThugs: { gt: 0 } }, { turfHeld: { some: {} } }] },
      select: { ...playerRef.select, postedThugs: true },
    });
    const onCorners = new Map<string, number>();
    for (const block of blocks) if (block.holderId) onCorners.set(block.holderId, (onCorners.get(block.holderId) ?? 0) + block.cornerThugs);
    return {
      roundId,
      blocks: blocks.map((block) => ({
        id: block.id, city: block.city.name, district: block.district,
        holder: block.holder,
        cornerThugs: block.cornerThugs, guns: gunsFromTurf(block), localsThugs: block.localsThugs,
        heldSince: block.heldSince?.toISOString() ?? null, shieldUntil: block.shieldUntil?.toISOString() ?? null,
        upkeepAt: block.upkeepAt.toISOString(),
        outpost: block.outpost ? { cashCents: Number(block.outpost.cashCents), beer: block.outpost.beer, products: block.outpost.products as Record<string, number> } : null,
        pendingPushes: block.pushes.map((push) => ({
          id: push.id, attacker: push.attacker.displayName, squad: push.squad, landsAt: push.landsAt.toISOString(),
          overdue: push.landsAt.getTime() < now.getTime() - OVERDUE_MS,
        })),
      })),
      drift: holders
        .filter((player) => player.postedThugs !== (onCorners.get(player.id) ?? 0))
        .map((player) => ({ player: { id: player.id, displayName: player.displayName, publicPimpId: player.publicPimpId, accountId: player.accountId }, postedThugs: player.postedThugs, onCorners: onCorners.get(player.id) ?? 0 })),
    };
  },

  async history(prisma: PrismaClient, turfId: string): Promise<AdminTurfHistoryDto> {
    const block = await prisma.turf.findUnique({ where: { id: turfId }, include: { city: { select: { name: true } } } });
    if (!block) throw AppError.notFound('TURF_NOT_FOUND', 'That block does not exist.');
    const [segments, pushes] = await Promise.all([
      prisma.turfHoldSegment.findMany({ where: { turfId }, orderBy: { startedAt: 'desc' }, take: 100 }),
      prisma.turfPush.findMany({
        where: { turfId }, orderBy: { startedAt: 'desc' }, take: 50,
        include: { attacker: { select: { displayName: true } }, defender: { select: { displayName: true } } },
      }),
    ]);
    return {
      turfId, city: block.city.name, district: block.district,
      segments: segments.map((row) => ({ holderName: row.holderName, holderPublicPimpId: row.holderPublicPimpId, allianceTag: row.allianceTag, startedAt: row.startedAt.toISOString(), endedAt: row.endedAt?.toISOString() ?? null })),
      pushes: pushes.map((row) => ({ id: row.id, attacker: row.attacker.displayName, defender: row.defender.displayName, squad: row.squad, status: row.status, captured: row.captured, startedAt: row.startedAt.toISOString(), settledAt: row.settledAt?.toISOString() ?? null })),
    };
  },

  async repair(
    prisma: PrismaClient,
    actor: AuditActor,
    input: { action: AdminTurfRepair; turfId?: string | undefined; roundPlayerId?: string | undefined; pushId?: string | undefined; reason: string },
    now = new Date(),
  ): Promise<{ done: string }> {
    if (input.action === 'settle-push') {
      if (!input.pushId) throw AppError.badRequest('PUSH_REQUIRED', 'Pick the push to settle.');
      const before = await prisma.turfPush.findUnique({ where: { id: input.pushId } });
      if (!before) throw AppError.notFound('PUSH_NOT_FOUND', 'That push does not exist.');
      if (before.status !== 'PENDING') throw AppError.conflict('PUSH_SETTLED', 'That push has already landed.');
      if (before.landsAt.getTime() > now.getTime()) throw AppError.conflict('PUSH_NOT_DUE', 'That push has not reached its landing time. Pushes are never landed early.');
      await TurfWarSettlementService.land(prisma, before.id, now);
      const after = await prisma.turfPush.findUniqueOrThrow({ where: { id: before.id } });
      await AdminAuditService.record(prisma, actor, { action: 'turf.settle-push', targetType: 'turf-push', targetId: before.id, reason: input.reason, before, after });
      return { done: after.captured ? 'The push landed and took the block.' : 'The push landed and the block held.' };
    }

    if (input.action === 'sync-posted') {
      if (!input.roundPlayerId) throw AppError.badRequest('PLAYER_REQUIRED', 'Pick the player to re-sync.');
      return prisma.$transaction(async (tx) => {
        await lockRoundPlayer(tx, input.roundPlayerId!);
        const before = await tx.roundPlayer.findUnique({ where: { id: input.roundPlayerId! }, include: { round: true } });
        if (!before) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
        const ruleset = loadRulesetForRound(before.round);
        const [blocks, boxes] = await Promise.all([
          tx.turf.findMany({ where: { holderId: before.id } }),
          tx.turfOutpost.findMany({ where: { ownerId: before.id } }),
        ]);
        const postedThugs = Math.min(before.thugs, blocks.reduce((sum, block) => sum + block.cornerThugs, 0));
        const postedNetWorthCents = blocks.reduce((sum, block) => sum + cornerGunWorthCents(ruleset, gunsFromTurf(block)), 0n);
        const outpostNetWorthCents = boxes.reduce((sum, box) => sum + outpostBoxWorthCents(ruleset, { cashCents: box.cashCents, beer: box.beer, products: box.products as Record<string, number> }), 0n);
        const { round: _round, ...beforeRow } = before;
        void _round;
        const after = await tx.roundPlayer.update({ where: { id: before.id }, data: { postedThugs, postedNetWorthCents, outpostNetWorthCents } });
        await AdminAuditService.record(tx, actor, {
          action: 'turf.sync-posted', targetType: 'round-player', targetId: before.id, reason: input.reason,
          before: { postedThugs: beforeRow.postedThugs, postedNetWorthCents: beforeRow.postedNetWorthCents, outpostNetWorthCents: beforeRow.outpostNetWorthCents },
          after: { postedThugs: after.postedThugs, postedNetWorthCents: after.postedNetWorthCents, outpostNetWorthCents: after.outpostNetWorthCents },
        });
        return { done: `Posted thugs ${beforeRow.postedThugs} → ${postedThugs}.` };
      });
    }

    // release-block
    if (!input.turfId) throw AppError.badRequest('TURF_REQUIRED', 'Pick the block to release.');
    return prisma.$transaction(async (tx) => {
      const peek = await tx.turf.findUnique({ where: { id: input.turfId! }, select: { holderId: true, roundId: true } });
      if (!peek) throw AppError.notFound('TURF_NOT_FOUND', 'That block does not exist.');
      if (!peek.holderId) throw AppError.conflict('TURF_EMPTY', 'Nobody holds that block.');
      // The same lock order as a player's own action: the player, then the block.
      await lockRound(tx, peek.roundId);
      await lockRoundPlayer(tx, peek.holderId);
      await lockBlock(tx, input.turfId!);
      const before = await tx.turf.findUniqueOrThrow({ where: { id: input.turfId! }, include: { outpost: true, city: true, round: true } });
      if (before.holderId !== peek.holderId) throw AppError.conflict('TURF_CHANGED', 'That block changed hands a moment ago. Refresh and try again.');
      const holder = await tx.roundPlayer.findUniqueOrThrow({ where: { id: peek.holderId } });
      const ruleset = rulesetForCity(loadRulesetForRound(before.round), before.city.slug);
      const guns = gunsFromTurf(before);
      const controlBefore = await territoryControlForCity(tx, before.roundId, before.cityId, ruleset);

      // The box comes home too: cash, beer and product, rather than vanishing with the corner.
      let boxWorth = 0n;
      if (before.outpost) {
        const products = before.outpost.products as Record<string, number>;
        boxWorth = outpostBoxWorthCents(ruleset, { cashCents: before.outpost.cashCents, beer: before.outpost.beer, products });
        const other = Object.fromEntries(Object.entries(products).filter(([key, units]) => key !== 'CRACK' && units > 0));
        if (Object.keys(other).length) await ProductInventoryService.adjust(tx, holder.id, ruleset, other);
        await tx.roundPlayer.update({ where: { id: holder.id }, data: { cashCents: { increment: before.outpost.cashCents }, beer: { increment: before.outpost.beer }, crack: { increment: products.CRACK ?? 0 } } });
        await tx.turfOutpost.delete({ where: { id: before.outpost.id } });
      }
      const gunWorth = cornerGunWorthCents(ruleset, guns);
      await tx.roundPlayer.update({
        where: { id: holder.id },
        data: {
          postedThugs: Math.max(0, holder.postedThugs - before.cornerThugs),
          postedNetWorthCents: holder.postedNetWorthCents > gunWorth ? holder.postedNetWorthCents - gunWorth : 0n,
          outpostNetWorthCents: holder.outpostNetWorthCents > boxWorth ? holder.outpostNetWorthCents - boxWorth : 0n,
          pistols: { increment: guns.pistols }, shotguns: { increment: guns.shotguns }, tek9s: { increment: guns.tek9s }, ak47s: { increment: guns.ak47s },
        },
      });
      await endTurfHold(tx, before.id, now);
      const after = await tx.turf.update({
        where: { id: before.id },
        data: {
          holderId: null, cornerThugs: 0, ...turfGunData({ pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0 }), heldSince: null, shieldUntil: null,
          localsThugs: 0, localsAt: now, localsReclaimAt: localsReclaimAt(ruleset, now),
        },
      });
      await recordTerritoryControlChange(tx, { roundId: before.roundId, cityId: before.cityId, ruleset, before: controlBefore, at: now });
      const { round: _round, city: _city, ...row } = before;
      void _round; void _city;
      await AdminAuditService.record(tx, actor, { action: 'turf.release-block', targetType: 'turf', targetId: before.id, reason: input.reason, before: row, after });
      return { done: `${before.district} in ${before.city.name} released; ${before.cornerThugs} thugs and their guns went home to ${holder.displayName}.` };
    });
  },
};
