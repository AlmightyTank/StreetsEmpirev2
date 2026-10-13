import type { PrismaClient } from '@prisma/client';
import {
  SUPPORTER_COSMETICS,
  SUPPORTER_DROP_SOURCE,
  SUPPORTER_SOURCE,
  SUPPORTER_SOURCE_VERSION,
  SUPPORTER_TENURE_SOURCE,
  supporterDropFor,
  supporterMonth,
  tenureTiersFor,
} from '@streets/rulesets';
import type { Db } from '../utils/db.js';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';
}

/**
 * Supporter rewards are permanent account cosmetic unlocks. Granting is
 * idempotent and nothing here ever revokes them: a player keeps what they
 * were given after they stop supporting. Today an admin grants them; a
 * checkout hook can call `grant` the same way later.
 */
export const SupporterService = {
  /** Writes every supporter reward the account does not have yet and returns the keys it added. */
  async grant(db: Db, accountId: string, at = new Date()): Promise<string[]> {
    const keys = Object.keys(SUPPORTER_COSMETICS);
    const existing = await db.accountCosmeticUnlock.findMany({
      where: { accountId, key: { in: keys } },
      select: { key: true },
    });
    const have = new Set(existing.map((row) => row.key));
    const added: string[] = [];
    for (const cosmetic of Object.values(SUPPORTER_COSMETICS)) {
      if (have.has(cosmetic.key)) continue;
      await db.accountCosmeticUnlock.create({
        data: {
          accountId,
          key: cosmetic.key,
          kind: cosmetic.kind,
          title: cosmetic.name,
          description: cosmetic.description,
          rarity: cosmetic.rarity,
          styleKey: cosmetic.styleKey,
          sourceQuestKey: SUPPORTER_SOURCE,
          sourceRulesetId: SUPPORTER_SOURCE,
          sourceRulesetVersion: SUPPORTER_SOURCE_VERSION,
          awardedAt: at,
        },
      });
      added.push(cosmetic.key);
    }
    return added;
  },

  /**
   * Gives the account every item in a month's bundle it does not hold yet.
   * Returns the keys it added. A month with no bundle adds nothing.
   */
  async grantDrops(db: Db, accountId: string, month: string, at = new Date()): Promise<string[]> {
    const bundle = supporterDropFor(month);
    if (!bundle?.length) return [];
    const keys = bundle.map((item) => item.key);
    const held = new Set(
      (await db.accountCosmeticUnlock.findMany({ where: { accountId, key: { in: keys } }, select: { key: true } })).map(
        (row) => row.key,
      ),
    );
    const added: string[] = [];
    for (const item of bundle) {
      if (held.has(item.key)) continue;
      await db.accountCosmeticUnlock.create({
        data: {
          accountId,
          key: item.key,
          kind: item.kind,
          title: item.name,
          description: item.description,
          rarity: item.rarity,
          styleKey: item.styleKey ?? null,
          sourceQuestKey: SUPPORTER_SOURCE,
          sourceRulesetId: SUPPORTER_DROP_SOURCE,
          sourceRulesetVersion: month,
          awardedAt: at,
        },
      });
      added.push(item.key);
    }
    return added;
  },

  /**
   * Gives the account every tenure badge its cumulative paid months earned and
   * it does not hold yet. Counts distinct UTC months with a paid invoice above
   * 0, so free trials, coupons and refunded/disputed payments never move the
   * count, and cancelled months never reset it. Returns the keys it added.
   */
  async grantTenure(db: Db, accountId: string, at = new Date()): Promise<string[]> {
    const payments = await db.supporterPayment.findMany({
      where: { accountId, status: 'paid' },
      select: { amountCents: true, paidAt: true },
    });
    const months = new Set(
      payments
        .filter((payment) => payment.amountCents > 0 && payment.paidAt)
        .map((payment) => supporterMonth(payment.paidAt!)),
    );
    const earned = tenureTiersFor(months.size);
    if (!earned.length) return [];
    const keys = earned.map((badge) => badge.key);
    const held = new Set(
      (await db.accountCosmeticUnlock.findMany({ where: { accountId, key: { in: keys } }, select: { key: true } })).map(
        (row) => row.key,
      ),
    );
    const added: string[] = [];
    for (const badge of earned) {
      if (held.has(badge.key)) continue;
      await db.accountCosmeticUnlock.create({
        data: {
          accountId,
          key: badge.key,
          kind: badge.kind,
          title: badge.name,
          description: badge.description,
          rarity: badge.rarity,
          styleKey: badge.styleKey ?? null,
          sourceQuestKey: SUPPORTER_SOURCE,
          sourceRulesetId: SUPPORTER_TENURE_SOURCE,
          // The month the badge was earned, so it reads like a drop in lists.
          sourceRulesetVersion: supporterMonth(at),
          awardedAt: at,
        },
      });
      added.push(badge.key);
    }
    return added;
  },

  /**
   * Write one season-support stamp per account that paid for the season.
   * A payment counts when it is status paid, amountCents > 0, paidAt != null,
   * and paidAt falls inside the season window [start, end]. Idempotent:
   * existing (accountId, roundId) rows are skipped. Never deletes (a stamp is
   * a historical fact even if the payment is later refunded).
   */
  async stampSeason(
    db: Db | PrismaClient,
    roundId: string,
    windowStart: Date,
    windowEnd: Date,
    at: Date = new Date(),
  ): Promise<string[]> {
    const payments = await db.supporterPayment.findMany({
      where: { status: 'paid' },
      select: { accountId: true, amountCents: true, paidAt: true },
    });
    const eligible = new Set<string>();
    for (const p of payments) {
      if (!p.accountId || p.amountCents <= 0 || !p.paidAt) continue;
      if (p.paidAt < windowStart || p.paidAt > windowEnd) continue;
      eligible.add(p.accountId);
    }
    if (eligible.size === 0) return [];
    const existing = await db.supporterSeasonStamp.findMany({
      where: { roundId, accountId: { in: [...eligible] } },
      select: { accountId: true },
    });
    const have = new Set(existing.map((r) => r.accountId));
    const stamped: string[] = [];
    for (const accountId of eligible) {
      if (have.has(accountId)) continue;
      try {
        await db.supporterSeasonStamp.create({
          data: { accountId, roundId, awardedAt: at },
        });
        stamped.push(accountId);
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    return stamped;
  },

  /**
   * Batch-read season stamps: for each roundId the set of stamped accountIds.
   * One query per batch.
   */
  async seasonStamps(
    db: Db | PrismaClient,
    roundIds: string[],
  ): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    const ids = [...new Set(roundIds)];
    if (!ids.length) return out;
    const rows = await db.supporterSeasonStamp.findMany({
      where: { roundId: { in: ids } },
      select: { roundId: true, accountId: true },
    });
    for (const r of rows) {
      let set = out.get(r.roundId);
      if (!set) {
        set = new Set<string>();
        out.set(r.roundId, set);
      }
      set.add(r.accountId);
    }
    return out;
  },

  /** When the account was first given supporter rewards, or null if it never was. */
  async since(db: Db | PrismaClient, accountId: string): Promise<Date | null> {
    const first = await db.accountCosmeticUnlock.findFirst({
      where: { accountId, sourceQuestKey: SUPPORTER_SOURCE },
      orderBy: { awardedAt: 'asc' },
      select: { awardedAt: true },
    });
    return first?.awardedAt ?? null;
  },

  /**
   * Derived supporter marks for many accounts in one query: holding any
   * supporter reward makes an account a supporter, and the since-month is the
   * UTC month of their earliest supporter unlock. No amounts, statuses, or
   * payment details leak — just the public mark and its vintage.
   */
  async flags(
    db: Db | PrismaClient,
    accountIds: string[],
  ): Promise<Map<string, { isSupporter: boolean; supporterSince: string | null }>> {
    const ids = [...new Set(accountIds)];
    const out = new Map<string, { isSupporter: boolean; supporterSince: string | null }>();
    for (const id of ids) out.set(id, { isSupporter: false, supporterSince: null });
    if (!ids.length) return out;
    const rows = await db.accountCosmeticUnlock.findMany({
      where: { accountId: { in: ids }, sourceQuestKey: SUPPORTER_SOURCE },
      select: { accountId: true, awardedAt: true },
    });
    for (const row of rows) {
      const month = supporterMonth(row.awardedAt);
      const prev = out.get(row.accountId)!;
      if (!prev.isSupporter || (prev.supporterSince !== null && month < prev.supporterSince)) {
        out.set(row.accountId, { isSupporter: true, supporterSince: month });
      }
    }
    return out;
  },
};
