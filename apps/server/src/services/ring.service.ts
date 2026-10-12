import type { PrismaClient } from '@prisma/client';
import {
  RING_DESTROY_REWARD_CENTS,
  RING_DESTROY_TURN_COST,
  RING_FOUNDRY_CITY_SLUG,
  RING_SURFACED_NEWS_BODY,
  RING_SURFACED_NEWS_TITLE,
  isRingInvisible,
  ringInvisibilityUntil,
  ringSurfaceAt,
  type RingStateDto,
} from '@streets/shared';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { EasterEggService } from './easter-egg.service.js';
import { createPlayerActivity } from './in-app-notification.service.js';
import { NetWorthService } from './net-worth.service.js';

/**
 * Best-effort nudge for the Discord bot. Dynamically imported so unit tests
 * (which have no server env configured) never load the bot push config; the
 * bot's regular polling is the delivery fallback anyway.
 */
async function wakeNews(): Promise<void> {
  try {
    const { wakeDiscordBot } = await import('./discord-bot-push.service.js');
    wakeDiscordBot('news');
  } catch { /* polling fallback handles delivery */ }
}

/** Combat target veto while the bearer is invisible. Absolute: revenge does not bypass it. */
export function ringInvisibilityBlock(
  defender: { invisibleUntil?: Date | null },
  now: Date,
): string | null {
  if (isRingInvisible(defender.invisibleUntil ?? null, now)) {
    return 'This crew has vanished. You cannot find them.';
  }
  return null;
}

function toDto(
  status: 'HIDDEN' | 'SURFACED' | 'DESTROYED',
  viewerId: string,
  holder: { id: string; publicPimpId: number; displayName: string } | null,
  invisibleUntil: Date | null,
  surfacedAt: Date | null,
  now: Date,
): RingStateDto {
  const iHold = !!holder && holder.id === viewerId;
  const revealed = !!holder && status === 'SURFACED' && !isRingInvisible(invisibleUntil, now);
  return {
    status,
    iHold,
    holderPublicPimpId: revealed ? holder.publicPimpId : null,
    holderDisplayName: revealed ? holder.displayName : null,
    invisibleUntil: invisibleUntil && invisibleUntil.getTime() > now.getTime() ? invisibleUntil.toISOString() : null,
    destroyRewardCents: RING_DESTROY_REWARD_CENTS,
    destroyTurnCost: RING_DESTROY_TURN_COST,
    foundryCitySlug: RING_FOUNDRY_CITY_SLUG,
    surfacedAt: surfacedAt ? surfacedAt.toISOString() : null,
  };
}

export const RingService = {
  /** Read-only status for one viewer. Never surfaces the Ring by itself. */
  async status(prisma: PrismaClient, roundId: string, viewerId: string, now = new Date()): Promise<RingStateDto> {
    const state = await prisma.ringState.findUnique({
      where: { roundId },
      include: { holder: { select: { id: true, publicPimpId: true, displayName: true, invisibleUntil: true } } },
    });
    if (!state || !state.holder) {
      return {
        status: 'HIDDEN', iHold: false, holderPublicPimpId: null, holderDisplayName: null,
        invisibleUntil: null, destroyRewardCents: RING_DESTROY_REWARD_CENTS,
        destroyTurnCost: RING_DESTROY_TURN_COST, foundryCitySlug: RING_FOUNDRY_CITY_SLUG, surfacedAt: null,
      };
    }
    return toDto(state.status as 'SURFACED' | 'DESTROYED', viewerId, state.holder, state.holder.invisibleUntil ?? null, state.surfacedAt, now);
  },

  /**
   * Surfaces the Ring once the round is old enough. Lazy: called from combat
   * reads and the ring routes, so no cron is needed. Idempotent.
   */
  async maybeSurface(
    db: Db,
    roundId: string,
    now = new Date(),
    rng: () => number = Math.random,
  ): Promise<void> {
    const existing = await db.ringState.findUnique({ where: { roundId } });
    if (existing) return;
    const round = await db.round.findUnique({ where: { id: roundId } });
    if (!round || round.status !== 'ACTIVE') return;
    if (ringSurfaceAt(round.startsAt).getTime() > now.getTime()) return;
    const count = await db.roundPlayer.count({
      where: { roundId, account: { isActive: true } },
    });
    if (count < 1) return;
    const skip = Math.floor(rng() * count);
    const [holder] = await db.roundPlayer.findMany({
      where: { roundId, account: { isActive: true } },
      orderBy: { publicPimpId: 'asc' },
      skip,
      take: 1,
      select: { id: true, displayName: true },
    });
    if (!holder) return;
    const invisibleUntil = ringInvisibilityUntil(now);
    await db.ringState.create({
      data: { roundId, status: 'SURFACED', holderRoundPlayerId: holder.id, surfacedAt: now },
    });
    await db.roundPlayer.update({ where: { id: holder.id }, data: { invisibleUntil } });
    await db.gameNews.create({
      data: { roundId, title: RING_SURFACED_NEWS_TITLE, body: RING_SURFACED_NEWS_BODY, publishedAt: now },
    });
    await createPlayerActivity(db, holder.id, 'RING_SURFACED', {
      invisibleUntil: invisibleUntil.toISOString(),
    });
    await wakeNews();
  },

  /** Attacking breaks the spell: clear the attacker's invisibility. */
  async breakInvisibility(db: Db, attackerId: string, now: Date): Promise<void> {
    const attacker = await db.roundPlayer.findUnique({ where: { id: attackerId }, select: { invisibleUntil: true } });
    if (attacker?.invisibleUntil && attacker.invisibleUntil.getTime() > now.getTime()) {
      await db.roundPlayer.update({ where: { id: attackerId }, data: { invisibleUntil: null } });
    }
  },

  /**
   * Called when a raid is won. A revealed bearer loses the Ring to the winner,
   * who is named openly (no fresh invisibility).
   */
  async transferOnRaidWin(db: Db, roundId: string, attackerId: string, defenderId: string, now: Date): Promise<boolean> {
    const state = await db.ringState.findUnique({ where: { roundId } });
    if (!state || state.status !== 'SURFACED' || state.holderRoundPlayerId !== defenderId) return false;
    await db.ringState.update({ where: { roundId }, data: { holderRoundPlayerId: attackerId } });
    await db.roundPlayer.update({ where: { id: attackerId }, data: { invisibleUntil: null } });
    const [attacker, defender] = await Promise.all([
      db.roundPlayer.findUnique({ where: { id: attackerId }, select: { displayName: true, publicPimpId: true } }),
      db.roundPlayer.findUnique({ where: { id: defenderId }, select: { displayName: true, publicPimpId: true } }),
    ]);
    await createPlayerActivity(db, attackerId, 'RING_STOLEN', {
      role: 'TAKER', from: defender?.displayName ?? null, fromPublicPimpId: defender?.publicPimpId ?? null,
    });
    await createPlayerActivity(db, defenderId, 'RING_STOLEN', {
      role: 'LOSER', to: attacker?.displayName ?? null, toPublicPimpId: attacker?.publicPimpId ?? null,
    });
    return true;
  },

  /**
   * Throw the Ring into the old foundry. The bearer must be in Detroit, pay
   * the turn cost, and hold a live Ring. Pays cash plus the Ring-bearer title.
   */
  async destroy(db: Db, roundPlayerId: string, now = new Date()): Promise<{ rewardCents: number }> {
    const player = await db.roundPlayer.findUnique({
      where: { id: roundPlayerId },
      include: { city: { select: { slug: true, name: true } } },
    });
    if (!player) throw AppError.notFound('NOT_IN_ROUND', 'You have not entered this round.');
    const state = await db.ringState.findUnique({ where: { roundId: player.roundId } });
    if (!state || state.status !== 'SURFACED' || state.holderRoundPlayerId !== roundPlayerId) {
      throw AppError.badRequest('RING_NOT_HELD', 'You do not hold the Ring.');
    }
    if (player.city.slug !== RING_FOUNDRY_CITY_SLUG) {
      throw AppError.badRequest('RING_WRONG_CITY', `Carry the Ring to the old foundry in Detroit to destroy it. You are in ${player.city.name}.`);
    }
    if (player.turns < RING_DESTROY_TURN_COST) {
      throw AppError.badRequest('RING_NO_TURNS', `You need ${RING_DESTROY_TURN_COST} turns to destroy the Ring.`);
    }
    const rewardCents = RING_DESTROY_REWARD_CENTS;
    const cashCents = player.cashCents + BigInt(rewardCents);
    const turns = player.turns - RING_DESTROY_TURN_COST;
    const round = await db.round.findUnique({ where: { id: player.roundId } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);
    const productRows = await db.playerProduct.findMany({ where: { roundPlayerId } });
    const products: Record<string, number> = {};
    for (const row of productRows) products[row.productKey] = (products[row.productKey] ?? 0) + row.quantity;
    const netWorthCents = NetWorthService.calculate({ ...player, cashCents, products }, ruleset);
    await db.roundPlayer.update({
      where: { id: roundPlayerId },
      data: { cashCents, turns, netWorthCents, invisibleUntil: null },
    });
    await db.economyLedgerEntry.create({
      data: {
        roundPlayerId, source: 'RING_DESTROY', label: 'Ring destroyed',
        amountCents: rewardCents, createdAt: now,
      },
    });
    await db.ringState.update({ where: { roundId: player.roundId }, data: { status: 'DESTROYED', destroyedAt: now } });
    await EasterEggService.discover(db, { accountId: player.accountId, roundPlayerId, id: 'RING_BEARER', at: now });
    await createPlayerActivity(db, roundPlayerId, 'RING_DESTROYED', { rewardCents });
    await db.gameNews.create({
      data: {
        roundId: player.roundId,
        title: 'The Ring is destroyed',
        body: `${player.displayName} carried the Ring to the old foundry in Detroit and threw it in.`,
        publishedAt: now,
      },
    });
    await wakeNews();
    return { rewardCents };
  },

  /** Round close: whoever still holds a live Ring gets My Precious. */
  async grantMyPreciousAtClose(db: Db, roundId: string, now: Date): Promise<void> {
    const state = await db.ringState.findUnique({ where: { roundId } });
    if (!state || state.status !== 'SURFACED' || !state.holderRoundPlayerId) return;
    const holder = await db.roundPlayer.findUnique({
      where: { id: state.holderRoundPlayerId },
      select: { accountId: true },
    });
    if (!holder) return;
    await EasterEggService.discover(db, {
      accountId: holder.accountId, roundPlayerId: state.holderRoundPlayerId, id: 'MY_PRECIOUS', at: now,
    });
  },
};
