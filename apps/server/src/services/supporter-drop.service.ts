import { Prisma, type PrismaClient } from '@prisma/client';
import { SUPPORTER_MONTHLY_DROPS, SUPPORTER_TENURE, supporterDropFor, supporterMonth, tenureTiersFor } from '@streets/rulesets';
import type { AdminSupporterDropDto } from '@streets/shared';
import { SupporterService } from './supporter.service.js';
import { ActiveSupporterService } from './active-supporter.service.js';

/** Shown as the actor on audit entries for drops given out at the start of a month. */
export const DROP_AUDIT_ACTOR = 'Monthly drop';
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
    const bundle = supporterDropFor(month);
    if (!bundle?.length) return { month, granted: 0 };
    const keys = bundle.map((item) => item.key);
    const ids = [...await ActiveSupporterService.accountIds(prisma, undefined, now)];
    if (!ids.length) return { month, granted: 0 };
    const tenureKeys = SUPPORTER_TENURE.map((tier) => tier.badge.key);
    const heldRows = await prisma.accountCosmeticUnlock.findMany({
      where: { key: { in: [...keys, ...tenureKeys] }, accountId: { in: ids } },
      select: { accountId: true, key: true },
    });
    const heldBy = new Map<string, Set<string>>();
    for (const row of heldRows) {
      const set = heldBy.get(row.accountId) ?? new Set<string>();
      set.add(row.key);
      heldBy.set(row.accountId, set);
    }
    const missing = (accountId: string) => keys.filter((key) => !heldBy.get(accountId)?.has(key));
    // Tenure earned from cumulative paid months but never granted (for example
    // supporters who crossed a tier before tenure shipped). Paid months are
    // counted here so the sweep only touches accounts that are actually owed a
    // badge; grantTenure rechecks inside the transaction.
    const paidMonths = new Map<string, Set<string>>();
    if (tenureKeys.length) {
      const payments = await prisma.supporterPayment.findMany({
        where: { accountId: { in: ids }, status: 'paid' },
        select: { accountId: true, amountCents: true, paidAt: true },
      });
      for (const payment of payments) {
        // Unlinked rows (account deleted) and undated rows count for nobody.
        if (payment.amountCents <= 0 || !payment.paidAt || !payment.accountId) continue;
        const set = paidMonths.get(payment.accountId) ?? new Set<string>();
        set.add(supporterMonth(payment.paidAt));
        paidMonths.set(payment.accountId, set);
      }
    }
    const missingTenure = (accountId: string) =>
      tenureTiersFor(paidMonths.get(accountId)?.size ?? 0)
        .map((badge) => badge.key)
        .filter((key) => !heldBy.get(accountId)?.has(key));

    let granted = 0;
    for (const accountId of ids.filter((id) => missing(id).length || missingTenure(id).length)) {
      try {
        const added = await prisma.$transaction(async (tx) => {
          const keysAdded = await SupporterService.grantDrops(tx, accountId, month, now);
          keysAdded.push(...await SupporterService.grantTenure(tx, accountId, now));
          if (keysAdded.length) {
            await tx.adminAuditLog.create({
              data: {
                actorAccountId: null,
                actorUsername: DROP_AUDIT_ACTOR,
                action: 'account.grant-supporter',
                targetType: 'account',
                targetId: accountId,
                reason: keysAdded.some((key) => tenureKeys.includes(key)) && !missing(accountId).length
                  ? 'Supporter tenure award'
                  : `Supporter drop for ${month}`,
                after: { granted: keysAdded },
              },
            });
          }
          return keysAdded;
        });
        if (added.length) granted += 1;
      } catch (error) {
        // Another server or a payment granted it at the same moment.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    return { month, granted };
  },

  /** Every drop bundle with how many accounts hold all of its items, for the admin tab. */
  async summary(prisma: PrismaClient, now = new Date()): Promise<AdminSupporterDropDto[]> {
    const current = supporterMonth(now);
    const bundles = Object.entries(SUPPORTER_MONTHLY_DROPS);
    const allKeys = bundles.flatMap(([, bundle]) => bundle.map((item) => item.key));
    const counts = allKeys.length
      ? await prisma.accountCosmeticUnlock.groupBy({
        by: ['key'],
        where: { key: { in: allKeys } },
        _count: { _all: true },
      })
      : [];
    const held = new Map(counts.map((row) => [row.key, row._count._all]));
    return bundles.map(([month, bundle]) => ({
      month,
      key: bundle[0]!.key,
      name: bundle.length > 1 ? `${bundle[0]!.name} +${bundle.length - 1}` : bundle[0]!.name,
      holders: Math.min(...bundle.map((item) => held.get(item.key) ?? 0)),
      when: month < current ? 'past' : month === current ? 'current' : 'upcoming',
    }));
  },
};
