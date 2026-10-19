import type { PrismaClient } from '@prisma/client';
import type { Db } from '../utils/db.js';

// Trial users may preview supporter-only convenience features. The monthly
// drop sweep separately requests paid-only accounts so trials never receive
// permanent rewards before their first invoice is paid.
const STRIPE_ACTIVE = ['active', 'trialing'];
const PLAY_ACTIVE = ['active', 'in_grace_period'];

/** Active billing entitlement across both Stripe and Google Play. */
export const ActiveSupporterService = {
  async accountIds(prisma: Db | PrismaClient, accountIds?: string[], now = new Date(), paidOnly = false): Promise<Set<string>> {
    const accountFilter = accountIds ? { in: accountIds } : undefined;
    const [stripe, play] = await Promise.all([
      prisma.supporterMembership.findMany({
        where: { status: { in: paidOnly ? ['active'] : STRIPE_ACTIVE }, ...(accountFilter ? { accountId: accountFilter } : {}) },
        select: { accountId: true },
      }),
      prisma.googlePlaySupporterSubscription.findMany({
        where: {
          ...(accountFilter ? { accountId: accountFilter } : {}),
          OR: [
            { status: { in: PLAY_ACTIVE } },
            { status: 'canceled', currentPeriodEnd: { gt: now } },
          ],
        },
        select: { accountId: true },
      }),
    ]);
    return new Set([...stripe, ...play].map((row) => row.accountId));
  },

  async has(prisma: PrismaClient, accountId: string, now = new Date(), paidOnly = false): Promise<boolean> {
    return (await ActiveSupporterService.accountIds(prisma, [accountId], now, paidOnly)).has(accountId);
  },

  /** Paid supporters only: the Drop discount never applies during a free trial. */
  async paid(db: Db | PrismaClient, accountId: string, now = new Date()): Promise<boolean> {
    return (await ActiveSupporterService.accountIds(db, [accountId], now, true)).has(accountId);
  },
};
