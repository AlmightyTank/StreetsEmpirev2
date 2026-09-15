import type { Prisma, PrismaClient } from '@prisma/client';
import { ADMIN_GRANT_CAPS, type AdminGrantInput, type AdminGrantItem, type AdminPlayerDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { fitThugs, toState } from './action.service.js';
import { ActivityService } from './activity.service.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { assertCorrectionState, correctionChanges, correctionSnapshot } from './admin-correction.shared.js';
import { AdminPlayerService } from './admin-player.service.js';
import { writeRanks } from './combat.service.js';
import { HappinessService } from './happiness.service.js';
import { NetWorthService } from './net-worth.service.js';
import { PlayerStateService } from './player-state.service.js';
import { RankingService } from './ranking.service.js';

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Weapons that need an earned unlock. A grant never skips the reputation ladder. */
const UNLOCK_FOR: Partial<Record<AdminGrantItem, 'shotgunUnlocked' | 'tek9Unlocked' | 'ak47Unlocked'>> = {
  shotguns: 'shotgunUnlocked',
  tek9s: 'tek9Unlocked',
  ak47s: 'ak47Unlocked',
};

export const AdminGrantService = {
  /**
   * Compensation after downtime or a bug. Every item is capped per grant, turns
   * never go past the ruleset cap, locked weapons are refused, and admins cannot
   * grant to their own player. Shows in the player's activity feed as an admin grant.
   */
  async grant(prisma: PrismaClient, actor: AuditActor, roundPlayerId: string, input: AdminGrantInput, now = new Date()): Promise<AdminPlayerDto> {
    const items = (Object.keys(ADMIN_GRANT_CAPS) as AdminGrantItem[])
      .map((item) => ({ item, amount: input[item] ?? 0, cap: ADMIN_GRANT_CAPS[item] }))
      .filter((row) => row.amount > 0);
    const turns = input.turns ?? 0;
    if (!items.length && turns <= 0) throw AppError.badRequest('NOTHING_TO_GRANT', 'Choose at least one thing to grant.');
    for (const row of items) {
      if (!Number.isSafeInteger(row.amount) || row.amount > row.cap) {
        throw AppError.badRequest('GRANT_OVER_CAP', `A grant can include at most ${row.cap} ${row.item}.`, { [row.item]: `At most ${row.cap} per grant.` });
      }
    }

    await prisma.$transaction(async (tx) => {
      const prior = await tx.roundPlayer.findUnique({ where: { id: roundPlayerId }, include: { round: { select: { status: true } } } });
      if (!prior) throw AppError.notFound('PLAYER_NOT_FOUND', 'That player does not exist.');
      if (prior.accountId === actor.id) throw AppError.conflict('ADMIN_SELF_ACTION', 'Another admin has to grant anything to your own player.');
      if (prior.round.status !== 'ACTIVE' && prior.round.status !== 'REGISTRATION') {
        throw AppError.conflict('ROUND_FINISHED', 'That round has finished, so its standings are frozen.');
      }

      const settled = await PlayerStateService.settleInTransaction(tx, roundPlayerId, { now, markActive: false });
      const { player, ruleset } = settled;
      if (turns > ruleset.turns.cap) {
        throw AppError.badRequest('GRANT_OVER_CAP', `A grant can include at most ${ruleset.turns.cap} turns.`, { turns: `At most ${ruleset.turns.cap}.` });
      }
      for (const row of items) {
        const unlock = UNLOCK_FOR[row.item];
        if (unlock && !player[unlock]) {
          throw AppError.badRequest('WEAPON_LOCKED', `${player.displayName} has not unlocked ${row.item} yet.`, { [row.item]: 'Not unlocked for this player.' });
        }
      }

      const next = toState(player);
      const before = correctionSnapshot(next);
      for (const row of items) {
        if (row.item === 'cashCents') next.cashCents += BigInt(row.amount);
        else (next as unknown as Record<string, number>)[row.item] = (next as unknown as Record<string, number>)[row.item]! + row.amount;
      }
      if (turns > 0) next.turns = Math.max(next.turns, Math.min(ruleset.turns.cap, next.turns + turns));
      assertCorrectionState(next, ruleset, player.displayName);

      const ranksBefore = await RankingService.ranksFor(tx, player);
      const worth = NetWorthService.calculate(next, ruleset);
      const happiness = HappinessService.recalculate({ ...next, thugs: fitThugs(next) }, ruleset);
      await tx.roundPlayer.update({
        where: { id: player.id },
        data: {
          cashCents: next.cashCents, turns: next.turns, whores: next.whores, thugs: next.thugs,
          condoms: next.condoms, medicine: next.medicine, crack: next.crack, beer: next.beer,
          pistols: next.pistols, shotguns: next.shotguns, tek9s: next.tek9s, ak47s: next.ak47s, lowRiders: next.lowRiders,
          whoreHappiness: happiness.whoreHappiness, thugHappiness: happiness.thugHappiness, netWorthCents: worth,
        },
      });
      const ranksAfter = await RankingService.ranksFor(tx, { ...player, netWorthCents: worth });
      await writeRanks(tx, ruleset, now, [[player.id, prior, ranksBefore, ranksAfter]]);

      const after = correctionSnapshot(next);
      const granted = correctionChanges(before, after);
      await ActivityService.log(tx, player.id, 'ADMIN_GRANT', json({ reason: input.reason, granted, turnsRequested: turns }));
      await AdminAuditService.record(tx, actor, {
        action: 'player.grant',
        targetType: 'player',
        targetId: player.id,
        reason: input.reason,
        before: { roundPlayerId: player.id, ...before },
        after: { roundPlayerId: player.id, ...after, granted },
      });
    }, { timeout: 15_000, maxWait: 10_000 });

    return AdminPlayerService.inspect(prisma, roundPlayerId);
  },
};
