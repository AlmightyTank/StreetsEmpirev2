import type { PrismaClient } from '@prisma/client';
import { liveCounter, loadRulesetForRound, marketView, settlePush } from '@streets/rules-engine';
import type {
  AdminMarketsDto,
  AdminPlayerRefDto,
  AdminPlayerStoresDto,
  AdminRoundBattlesDto,
  AdminShipmentsDto,
  AdminSuspiciousDto,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ReputationService } from './reputation.service.js';
import { StockService } from './stock.service.js';

/**
 * 1.0.0-E. Read-only operator views of a round's economy and fights: what the
 * markets are charging, which money deserves a second look, what stock is on
 * its way, and every recent fight. Nothing here changes game state; voiding a
 * fight stays on the existing, audited void actions.
 */

const playerRef = { select: { id: true, displayName: true, publicPimpId: true, accountId: true } } as const;
type PlayerRow = { id: string; displayName: string; publicPimpId: number; accountId: string };
const ref = (row: PlayerRow): AdminPlayerRefDto => ({ id: row.id, displayName: row.displayName, publicPimpId: row.publicPimpId, accountId: row.accountId });

/** A single ledger line this large is always listed, whatever the player's size. */
const LARGE_LINE_CENTS = 1_000_000_00n;
/** A day's net cash flow above this share of net worth is a surge. */
const SURGE_SHARE = 0.5;

async function roundOrThrow(prisma: PrismaClient, roundId: string) {
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
  return round;
}

export const AdminEconomyService = {
  async markets(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminMarketsDto> {
    const round = await roundOrThrow(prisma, roundId);
    const ruleset = loadRulesetForRound(round);
    const rules = ruleset.travel?.market;
    const rows = await prisma.highMarket.findMany({ where: { roundId } });
    const push = new Map(rows.map((row) => [`${row.city}:${row.productKey}`, rules ? settlePush(row, rules, now) : 0]));
    const products = Object.keys(ruleset.products ?? { CRACK: true });
    return {
      roundId,
      generatedAt: now.toISOString(),
      cities: Object.entries(ruleset.cities ?? {}).map(([city, def]) => ({
        city,
        name: def.name,
        products: products.map((product) => {
          const pushed = push.get(`${city}:${product}`) ?? 0;
          const view = marketView(ruleset, round.id, city, product, pushed, now);
          const counter = liveCounter(ruleset, round.id, city, product, now);
          return {
            product,
            supply: view?.supply ?? null,
            event: view?.event ? String((view.event as { kind?: string; name?: string }).name ?? (view.event as { kind?: string }).kind ?? 'event') : null,
            baselineCents: view ? Math.round(view.baselineCents) : null,
            buyCents: view?.buyCents ?? null,
            sellCents: view?.sellCents ?? null,
            pushPercent: Math.round(pushed * 1000) / 10,
            pip: counter ? { buyCents: counter.buyCents, sellCents: counter.sellCents } : null,
          };
        }),
      })),
    };
  },

  async suspicious(prisma: PrismaClient, roundId: string, hours = 24, now = new Date()): Promise<AdminSuspiciousDto> {
    await roundOrThrow(prisma, roundId);
    const since = new Date(now.getTime() - hours * 3_600_000);
    const inRound = { roundPlayer: { roundId } };
    const [biggestIn, biggestOut, flows, grants, openFlags] = await Promise.all([
      prisma.economyLedgerEntry.findMany({ where: { ...inRound, createdAt: { gte: since }, amountCents: { gt: 0n } }, orderBy: { amountCents: 'desc' }, take: 15, include: { roundPlayer: playerRef } }),
      prisma.economyLedgerEntry.findMany({ where: { ...inRound, createdAt: { gte: since }, amountCents: { lt: 0n } }, orderBy: { amountCents: 'asc' }, take: 10, include: { roundPlayer: playerRef } }),
      prisma.economyLedgerEntry.groupBy({ by: ['roundPlayerId'], where: { ...inRound, createdAt: { gte: since } }, _sum: { amountCents: true } }),
      prisma.adminAuditLog.findMany({ where: { action: { startsWith: 'player.grant' }, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.exploitFlag.count({ where: { reviewedAt: null, OR: [{ roundId }, { roundId: null }] } }),
    ]);
    const lines = [...biggestIn, ...biggestOut]
      .filter((row) => row.amountCents >= LARGE_LINE_CENTS || row.amountCents <= -LARGE_LINE_CENTS || biggestIn.indexOf(row) < 10 || biggestOut.indexOf(row) < 5)
      .sort((a, b) => Number((b.amountCents < 0n ? -b.amountCents : b.amountCents) - (a.amountCents < 0n ? -a.amountCents : a.amountCents)));

    const gains = flows.filter((row) => (row._sum.amountCents ?? 0n) > 0n);
    const players = gains.length
      ? await prisma.roundPlayer.findMany({ where: { id: { in: gains.map((row) => row.roundPlayerId) } }, select: { ...playerRef.select, netWorthCents: true } })
      : [];
    const byId = new Map(players.map((row) => [row.id, row]));
    const surges = gains.flatMap((row) => {
      const player = byId.get(row.roundPlayerId);
      if (!player) return [];
      const net = Number(row._sum.amountCents ?? 0n);
      const worth = Number(player.netWorthCents);
      const share = worth > 0 ? net / worth : 1;
      return share >= SURGE_SHARE ? [{ player: ref(player), netCents: net, netWorthCents: worth, sharePercent: Math.round(share * 100) }] : [];
    }).sort((a, b) => b.sharePercent - a.sharePercent).slice(0, 25);

    return {
      roundId,
      windowHours: hours,
      largest: lines.map((row) => ({ id: row.id, player: ref(row.roundPlayer), source: row.source, label: row.label, amountCents: Number(row.amountCents), at: row.createdAt.toISOString() })),
      surges,
      grants: grants.map((row) => ({ id: row.id, actorUsername: row.actorUsername, targetId: row.targetId, reason: row.reason, at: row.createdAt.toISOString() })),
      openFlags,
    };
  },

  async shipments(prisma: PrismaClient, roundId: string, now = new Date()): Promise<AdminShipmentsDto> {
    await roundOrThrow(prisma, roundId);
    const inRound = { kind: 'SPECIAL_ORDER', roundPlayer: { roundId } };
    const [pending, delivered] = await Promise.all([
      prisma.scheduledAlert.findMany({ where: { ...inRound, dueAt: { gt: now } }, orderBy: { dueAt: 'asc' }, take: 100, include: { roundPlayer: playerRef } }),
      prisma.scheduledAlert.findMany({ where: { ...inRound, dueAt: { lte: now, gte: new Date(now.getTime() - 86_400_000) } }, orderBy: { dueAt: 'desc' }, take: 50, include: { roundPlayer: playerRef } }),
    ]);
    const label = (payload: unknown) => {
      const row = (payload ?? {}) as { store?: string; item?: string };
      return { store: row.store ?? '?', item: row.item ?? '?' };
    };
    return {
      roundId,
      pending: pending.map((row) => ({ player: ref(row.roundPlayer), ...label(row.payload), dueAt: row.dueAt.toISOString(), orderedAt: row.createdAt.toISOString() })),
      delivered: delivered.map((row) => ({ player: ref(row.roundPlayer), ...label(row.payload), dueAt: row.dueAt.toISOString(), deliveredAt: row.firedAt?.toISOString() ?? null })),
    };
  },

  /** One player's shelves as the store would settle them now. Read-only: nothing is written back. */
  async playerStores(prisma: PrismaClient, roundPlayerId: string, now = new Date()): Promise<AdminPlayerStoresDto> {
    const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, include: { round: true } });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
    const ruleset = loadRulesetForRound(player.round);
    const standings = await ReputationService.load(prisma as never, roundPlayerId, ruleset);
    const settled = StockService.settle(player as unknown as Record<string, unknown>, now, ruleset, standings);
    const [productShelves, cityShelves, orders] = await Promise.all([
      prisma.productShelf.findMany({ where: { roundPlayerId }, orderBy: { productKey: 'asc' } }),
      prisma.cityShelf.findMany({ where: { roundPlayerId }, orderBy: [{ city: 'asc' }, { productKey: 'asc' }] }),
      prisma.scheduledAlert.findMany({ where: { roundPlayerId, kind: 'SPECIAL_ORDER', dueAt: { gt: now } }, orderBy: { dueAt: 'asc' } }),
    ]);
    return {
      player: ref(player),
      shelves: Object.entries(settled.byField).map(([field, row]) => ({
        field, stock: row!.stock, cap: row!.cap, perInterval: row!.perInterval, intervalMinutes: row!.intervalMinutes,
        nextAt: row!.nextAt?.toISOString() ?? null,
        shipment: row!.shipment ? `${row!.shipment.status.toLowerCase()} · ${row!.shipment.quantity} due ${row!.shipment.arrivesAt.toISOString()}` : null,
      })),
      productShelves: productShelves.map((row) => ({ product: row.productKey, stock: row.stock, at: row.stockAt.toISOString() })),
      cityShelves: cityShelves.map((row) => ({ city: row.city, product: row.productKey, stock: row.stock, at: row.stockAt.toISOString() })),
      specialOrders: orders.map((row) => {
        const payload = (row.payload ?? {}) as { store?: string; item?: string };
        return { store: payload.store ?? '?', item: payload.item ?? '?', dueAt: row.dueAt.toISOString() };
      }),
    };
  },

  /** Recent fights across a round, newest first, with voids shown. */
  async battles(prisma: PrismaClient, roundId: string, options: { playerId?: string; limit?: number } = {}): Promise<AdminRoundBattlesDto> {
    await roundOrThrow(prisma, roundId);
    const limit = Math.min(options.limit ?? 50, 200);
    const involving = options.playerId ? { OR: [{ attackerId: options.playerId }, { defenderId: options.playerId }] } : {};
    const [battles, tails] = await Promise.all([
      prisma.raidBattle.findMany({
        where: { attacker: { roundId }, ...involving },
        orderBy: { createdAt: 'desc' }, take: limit,
        include: { attacker: playerRef, defender: playerRef },
      }),
      prisma.convoyTail.findMany({
        where: { attacker: { roundId }, ...(options.playerId ? { OR: [{ attackerId: options.playerId }, { ownerId: options.playerId }] } : {}) },
        orderBy: { startedAt: 'desc' }, take: 25,
        include: { attacker: { select: { displayName: true } }, owner: { select: { displayName: true } } },
      }),
    ]);
    return {
      roundId,
      battles: battles.map((row) => {
        const report = (row.attackerReport ?? {}) as { won?: boolean; cashChangeCents?: number };
        return {
          id: row.id, kind: row.kind, attacker: ref(row.attacker), defender: ref(row.defender),
          winner: typeof report.won === 'boolean' ? (report.won ? 'ATTACKER' as const : 'DEFENDER' as const) : null,
          lootCents: Math.max(0, report.cashChangeCents ?? 0), at: row.createdAt.toISOString(),
          voided: row.voidedAt ? { at: row.voidedAt.toISOString(), byUsername: row.voidedByUsername, reason: row.voidReason } : null,
        };
      }),
      tails: tails.map((row) => ({ id: row.id, attacker: row.attacker.displayName, owner: row.owner.displayName, status: row.status, startedAt: row.startedAt.toISOString(), voided: row.voidedAt !== null })),
    };
  },
};
