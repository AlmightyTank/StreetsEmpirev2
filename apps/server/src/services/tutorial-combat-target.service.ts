import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient, RoundPlayer } from '@prisma/client';
import { startingStock, type Ruleset } from '@streets/rules-engine';
import { normalizeUsername } from '@streets/shared';
import { lockAccount } from '../utils/db.js';
import { HappinessService } from './happiness.service.js';
import { NetWorthService } from './net-worth.service.js';

const PASSWORD_MARKER = 'internal:tutorial-raid-target:no-login';
const DISPLAY_NAME = 'Practice Crew';

type QuestDb = PrismaClient | Prisma.TransactionClient;

function identity(ownerId: string) {
  const suffix = createHash('sha256').update(ownerId).digest('hex').slice(0, 14);
  const username = `tut-${suffix}`;
  return {
    username,
    usernameNormalized: normalizeUsername(username),
    email: `tutorial-raid-${ownerId}@streets.local`,
  };
}

async function questActive(db: QuestDb, ownerId: string): Promise<boolean> {
  // The practice mark is strictly one-shot. The onboarding tour can advance
  // without creating a visible PlayerQuest row, so use the round activity
  // ledger as the source of truth instead of depending on TOUR_RAID state.
  const alreadyRaided = await db.playerActivity.findFirst({
    where: { roundPlayerId: ownerId, type: 'RAID_ATTACK' },
    select: { id: true },
  });
  return !alreadyRaided;
}

function isMarkedAccount(ownerId: string, account: { username: string; usernameNormalized: string; email: string; passwordHash: string; isActive: boolean }): boolean {
  const expected = identity(ownerId);
  return account.username === expected.username
    && account.usernameNormalized === expected.usernameNormalized
    && account.email === expected.email
    && account.passwordHash === PASSWORD_MARKER
    && !account.isActive;
}

export const TutorialCombatTargetService = {
  questActive,

  async ensure(prisma: PrismaClient, owner: RoundPlayer, ruleset: Ruleset, now: Date): Promise<RoundPlayer | null> {
    if (!ruleset.combat || !await questActive(prisma, owner.id)) return null;
    const model = ruleset.combat;
    const accountIdentity = identity(owner.id);

    return prisma.$transaction(async (tx) => {
      if (!await questActive(tx, owner.id)) return null;
      const account = await tx.account.upsert({
        where: { email: accountIdentity.email },
        update: {},
        create: { ...accountIdentity, passwordHash: PASSWORD_MARKER, isActive: false },
      });
      await lockAccount(tx, account.id);
      if (!isMarkedAccount(owner.id, account)) {
        throw new Error(`Tutorial raid account identity collision for ${owner.id}.`);
      }

      const existing = await tx.roundPlayer.findUnique({
        where: { roundId_accountId: { roundId: owner.roundId, accountId: account.id } },
      });
      const publicPimpId = existing?.publicPimpId ?? (await tx.round.update({
        where: { id: owner.roundId },
        data: { nextPublicPimpId: { increment: 1 } },
        select: { nextPublicPimpId: true },
      })).nextPublicPimpId - 1;

       const thugs = 0;
      const state = {
        cashCents: BigInt(model.loot.protectedCashCents + Math.max(100_000, model.loot.perFitAttackerCents * thugs)),
        turns: ruleset.round.startingPlayer.turns,
         whores: 0,
        thugs,
        woundedThugs: 0,
        condoms: 0,
        medicine: 0,
        crack: 0,
        beer: 0,
         pistols: 0,
         shotguns: 0,
         tek9s: 0,
         ak47s: 0,
        lowRiders: 0,
        payoutPercent: 50,
      };
      const happiness = HappinessService.recalculate(state, ruleset);
      const netWorthCents = NetWorthService.calculate(state, ruleset);
      const createdAt = new Date(now.getTime() - (model.newcomerHours + 1) * 3_600_000);
      const data = {
        displayName: DISPLAY_NAME,
        cityId: owner.cityId,
        ...state,
        ...startingStock(ruleset, now),
        publicPimpId,
        lastTurnCalculationAt: now,
        lastActiveAt: now,
        lastAwayBonusAt: null,
        raidProtectedUntil: null,
        raidCooldownUntil: null,
        lastRaidedAt: null,
        driveByCooldownUntil: null,
        driveByProtectedUntil: null,
        lastDrivenByAt: null,
        lockedUntil: null,
        movingUntil: null,
        invisibleUntil: null,
        allianceId: null,
        whoreHappiness: happiness.whoreHappiness,
        thugHappiness: happiness.thugHappiness,
        netWorthCents,
        createdAt,
      };

      return tx.roundPlayer.upsert({
        where: { roundId_accountId: { roundId: owner.roundId, accountId: account.id } },
        update: data,
        create: { ...data, roundId: owner.roundId, accountId: account.id },
      });
    });
  },

  async resolve(prisma: QuestDb, ownerId: string, roundId: string, publicPimpId: number): Promise<{ id: string; tutorial: boolean } | null> {
    const expected = identity(ownerId);
    const target = await prisma.roundPlayer.findFirst({
      where: {
        roundId,
        publicPimpId,
        OR: [{ account: { isActive: true } }, { account: { email: expected.email } }],
      },
      select: { id: true, account: { select: { username: true, usernameNormalized: true, email: true, passwordHash: true, isActive: true } } },
    });
    if (!target) return null;
    if (target.account.isActive) return { id: target.id, tutorial: false };
    return isMarkedAccount(ownerId, target.account) ? { id: target.id, tutorial: true } : null;
  },
};
