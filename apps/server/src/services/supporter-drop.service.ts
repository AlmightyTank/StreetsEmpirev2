import { Prisma, type PrismaClient } from '@prisma/client';
import { SUPPORTER_MONTHLY_DROPS, supporterDropFor, supporterMonth } from '@streets/rulesets';
import type { AdminSupporterDropDto } from '@streets/shared';
import { SupporterService } from './supporter.service.js';

/** Shown as the actor on audit entries for drops given out at the start of a month. */
export const DROP_AUDIT_ACTOR = 'Monthly drop';
/** Subscription statuses that get the month's drop: supporting right now. */
const DROP_STATUSES = ['active', 'trialing'];

/**
 * Monthly supporter drops. A payment grants the drop for the month it lands in
 * (SupporterBillingService); this gives the current month's drop to everyone
 * already supporting when the month starts, so nobody waits for their renewal
 * date. It runs hourly and on demand from the admin tab, and does nothing for a
 * month without a drop or for supporters who already hold it.
 */
export const SupporterDropService = {
  async sweep(prisma: PrismaClient, now = new Date()): Promise<{ month: string; granted: number }> {
    const month = supporterMonth(now);
    const drop = supporterDropFor(month);
    if (!drop) return { month, granted: 0 };
    const members = await prisma.supporterMembership.findMany({
      where: { status: { in: DROP_STATUSES } },
      select: { accountId: true },
    });
    const ids = members.map((member) => member.accountId);
    if (!ids.length) return { month, granted: 0 };
    const holders = new Set((await prisma.accountCosmeticUnlock.findMany({
      where: { key: drop.key, accountId: { in: ids } },
      select: { accountId: true },
    })).map((row) => row.accountId));

    let granted = 0;
    for (const accountId of ids.filter((id) => !holders.has(id))) {
      try {
        const added = await prisma.$transaction(async (tx) => {
          const key = await SupporterService.grantDrop(tx, accountId, month, now);
          if (key) {
            await tx.adminAuditLog.create({
              data: {
                actorAccountId: null,
                actorUsername: DROP_AUDIT_ACTOR,
                action: 'account.grant-supporter',
                targetType: 'account',
                targetId: accountId,
                reason: `Supporter drop for ${month}`,
                after: { granted: [key] },
              },
            });
          }
          return key;
        });
        if (added) granted += 1;
      } catch (error) {
        // Another server or a payment granted it at the same moment.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    return { month, granted };
  },

  /** Every drop with how many accounts hold it, for the admin tab. */
  async summary(prisma: PrismaClient, now = new Date()): Promise<AdminSupporterDropDto[]> {
    const current = supporterMonth(now);
    const drops = Object.entries(SUPPORTER_MONTHLY_DROPS);
    const counts = await prisma.accountCosmeticUnlock.groupBy({
      by: ['key'],
      where: { key: { in: drops.map(([, drop]) => drop.key) } },
      _count: { _all: true },
    });
    const held = new Map(counts.map((row) => [row.key, row._count._all]));
    return drops.map(([month, drop]) => ({
      month,
      key: drop.key,
      name: drop.name,
      holders: held.get(drop.key) ?? 0,
      when: month < current ? 'past' : month === current ? 'current' : 'upcoming',
    }));
  },
};
