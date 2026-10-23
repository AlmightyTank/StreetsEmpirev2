import type { PrismaClient } from '@prisma/client';
import { itemEvents } from './individual-item-history.js';
import { AppError } from '../utils/errors.js';

const MAX_INSPECTED_ROWS = 2_000;
const MAX_AUDIT_EVENTS = 250;

/** Bounded, read-only staff view of one player's individual guns, vehicles, and event trail. */
export const AdminArmoryService = {
  async player(prisma: PrismaClient, roundPlayerId: string) {
    const player = await prisma.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      select: { id: true, roundId: true, displayName: true, publicPimpId: true,
        round: { select: { id: true, name: true, rulesetId: true, rulesetVersion: true } } },
    });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player was not found.');
    const [guns, vehicles, summary] = await Promise.all([
      prisma.playerGun.findMany({ where: { roundPlayerId }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: MAX_INSPECTED_ROWS }),
      prisma.playerVehicle.findMany({ where: { roundPlayerId }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: MAX_INSPECTED_ROWS }),
      prisma.playerArmorySummary.findUnique({ where: { roundPlayerId } }),
    ]);
    const items = [
      ...guns.map((row) => ({ kind: 'GUN' as const, id: row.id, model: row.model, name: row.name, quantity: row.quantity,
        condition: row.condition, status: row.status, mods: row.mods, lookKey: row.lookKey, origin: row.origin,
        stats: row.stats, history: itemEvents(row.history), updatedAt: row.updatedAt.toISOString() })),
      ...vehicles.map((row) => ({ kind: 'VEHICLE' as const, id: row.id, model: row.model, name: row.name, quantity: row.quantity,
        condition: row.condition, status: row.status, mods: row.mods, lookKey: row.lookKey, origin: row.origin,
        stats: row.stats, history: itemEvents(row.history), updatedAt: row.updatedAt.toISOString() })),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const audit = items.flatMap((item) => item.history.map((event) => ({ itemId: item.id, kind: item.kind, model: item.model, name: item.name, ...event })))
      .sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_AUDIT_EVENTS);
    return {
      round: player.round,
      player: { roundPlayerId: player.id, displayName: player.displayName, publicPimpId: player.publicPimpId },
      summary: summary ? { guns: summary.gunCount, vehicles: summary.vehicleCount } : {
        guns: guns.reduce((sum, row) => sum + row.quantity, 0), vehicles: vehicles.reduce((sum, row) => sum + row.quantity, 0),
      },
      truncated: guns.length === MAX_INSPECTED_ROWS || vehicles.length === MAX_INSPECTED_ROWS,
      items,
      audit,
    };
  },
};
