import type { PrismaClient } from '@prisma/client';
import { SUPPORTER_COSMETICS, SUPPORTER_SOURCE, SUPPORTER_TENURE } from '@streets/rulesets';
import {
  SIGNATURE_CARD_FRAME_KEY,
  type AdminSupporterDto,
  type AdminSupporterGrantResultDto,
  type AdminSupporterGrantRowDto,
  type AdminSupportersDto,
  normalizeUsername,
} from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { AdminAccountService } from './admin-account.service.js';
import type { AuditActor } from './admin-audit.service.js';
import { membershipDto } from './supporter-billing.service.js';
import { SupporterDropService } from './supporter-drop.service.js';

const REWARD_KEYS: readonly string[] = Object.keys(SUPPORTER_COSMETICS);
const TENURE_KEYS: readonly string[] = SUPPORTER_TENURE.map((tier) => tier.badge.key);
/** How many of the newest supporter payments the tab shows. */
const RECENT_PAYMENTS = 25;

/** Reward keys each account already holds, from any source, as SupporterService.grant counts them. */
async function heldRewards(prisma: PrismaClient, accountIds: string[]): Promise<Map<string, Set<string>>> {
  const rows = accountIds.length
    ? await prisma.accountCosmeticUnlock.findMany({
      where: { accountId: { in: accountIds }, key: { in: [...REWARD_KEYS] } },
      select: { accountId: true, key: true },
    })
    : [];
  const held = new Map<string, Set<string>>();
  for (const row of rows) {
    const keys = held.get(row.accountId) ?? new Set<string>();
    keys.add(row.key);
    held.set(row.accountId, keys);
  }
  return held;
}

function missingFrom(held: Set<string> | undefined): string[] {
  return REWARD_KEYS.filter((key) => !held?.has(key));
}

/** Runs the audited grant for each row that has something to add. A failure stays on its own row. */
async function commit(
  prisma: PrismaClient,
  actor: AuditActor,
  rows: AdminSupporterGrantRowDto[],
  reason: string,
): Promise<number> {
  let granted = 0;
  for (const row of rows) {
    if (!row.accountId || (row.status !== 'new' && row.status !== 'missing-rewards')) continue;
    try {
      row.rewardKeys = await AdminAccountService.grantSupporterRewards(prisma, actor, row.accountId, reason);
      granted += 1;
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      row.rewardKeys = [];
      row.error = error.message;
    }
  }
  return granted;
}

/**
 * Admin → Supporters. Supporter rewards are permanent account cosmetic unlocks
 * (see SupporterService), so a supporter is any account holding one. Every
 * grant goes through the same audited account action as the account page.
 */
export const AdminSupporterService = {
  async list(prisma: PrismaClient): Promise<AdminSupportersDto> {
    const [unlocks, memberships, payments, drops] = await Promise.all([
      prisma.accountCosmeticUnlock.findMany({
        where: { sourceQuestKey: SUPPORTER_SOURCE },
        select: { accountId: true, awardedAt: true },
        orderBy: { awardedAt: 'asc' },
      }),
      prisma.supporterMembership.findMany(),
      prisma.supporterPayment.findMany({
        orderBy: { paidAt: 'desc' },
        take: RECENT_PAYMENTS,
        include: { account: { select: { username: true } } },
      }),
      SupporterDropService.summary(prisma),
    ]);
    const since = new Map<string, Date>();
    for (const unlock of unlocks) if (!since.has(unlock.accountId)) since.set(unlock.accountId, unlock.awardedAt);
    const membershipBy = new Map(memberships.map((membership) => [membership.accountId, membership]));
    // A subscriber still waiting on a first payment has no rewards yet, but belongs on the roster.
    const ids = [...new Set([...since.keys(), ...membershipBy.keys()])];
    const [accounts, profiles, held, listedCount] = await Promise.all([
      ids.length
        ? prisma.account.findMany({ where: { id: { in: ids } }, select: { id: true, username: true, isActive: true, lastLoginAt: true } })
        : [],
      ids.length
        ? prisma.accountProfile.findMany({ where: { accountId: { in: ids } }, select: { accountId: true, activeAvatarFrameKey: true } })
        : [],
      heldRewards(prisma, ids),
      ids.length ? prisma.accountProfile.count({ where: { accountId: { in: ids }, showOnSupporterList: true } }) : 0,
    ]);
    const tenureHeld = ids.length
      ? await prisma.accountCosmeticUnlock.findMany({
        where: { accountId: { in: ids }, key: { in: [...TENURE_KEYS] } },
        select: { accountId: true, key: true },
      })
      : [];
    const tenureBy = new Map<string, string[]>();
    for (const row of tenureHeld) tenureBy.set(row.accountId, [...(tenureBy.get(row.accountId) ?? []), row.key]);
    const wearing = new Set(profiles.filter((profile) => profile.activeAvatarFrameKey === SIGNATURE_CARD_FRAME_KEY).map((profile) => profile.accountId));
    const supporters: AdminSupporterDto[] = accounts
      .map((account) => {
        const keys = held.get(account.id);
        return {
          accountId: account.id,
          username: account.username,
          isActive: account.isActive,
          since: since.get(account.id)?.toISOString() ?? null,
          lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
          rewardKeys: REWARD_KEYS.filter((key) => keys?.has(key)),
          missingKeys: missingFrom(keys),
          tenureKeys: TENURE_KEYS.filter((key) => tenureBy.get(account.id)?.includes(key)),
          wearingCard: wearing.has(account.id),
          membership: membershipBy.has(account.id) ? membershipDto(membershipBy.get(account.id)!) : null,
        };
      })
      .sort((a, b) => (b.since ?? '').localeCompare(a.since ?? '') || a.username.localeCompare(b.username));
    return {
      rewards: Object.values(SUPPORTER_COSMETICS).map((reward) => ({ key: reward.key, name: reward.name, kind: reward.kind, rarity: reward.rarity })),
      tenure: SUPPORTER_TENURE.map((tier) => ({ key: tier.badge.key, name: tier.badge.name, kind: tier.badge.kind, rarity: tier.badge.rarity })),
      supporters,
      // Only reward holders can be missing a reward; a subscriber waiting on payment gets everything when it lands.
      missingCount: supporters.filter((supporter) => supporter.since && supporter.missingKeys.length).length,
      activeCount: supporters.filter((supporter) => supporter.membership?.active).length,
      checkoutEnabled: env.stripe.enabled,
      drops,
      listedCount,
      payments: payments.map((payment) => ({
        id: payment.id,
        accountId: payment.accountId,
        username: payment.account?.username ?? null,
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        paidAt: payment.paidAt.toISOString(),
        stripeInvoiceId: payment.stripeInvoiceId,
      })),
    };
  },

  /**
   * Grants supporter rewards to the named accounts. A preview (dryRun) only
   * sorts the names into new, missing rewards, already done, not found, self
   * and duplicate; a commit grants the first two, each audited on its own.
   */
  async grant(
    prisma: PrismaClient,
    actor: AuditActor,
    input: { usernames: string[]; reason?: string | undefined; dryRun?: boolean | undefined },
  ): Promise<AdminSupporterGrantResultDto> {
    const dryRun = input.dryRun ?? false;
    if (!dryRun && !input.reason) throw AppError.badRequest('REASON_REQUIRED', 'Give a reason for the grant.', { reason: 'Give a reason of at least 5 characters.' });
    const names = input.usernames.map((name) => name.trim().replace(/^@/, '')).filter(Boolean);
    const normalized = [...new Set(names.map(normalizeUsername))];
    const accounts = normalized.length
      ? await prisma.account.findMany({ where: { usernameNormalized: { in: normalized } }, select: { id: true, username: true, usernameNormalized: true } })
      : [];
    const byName = new Map(accounts.map((account) => [account.usernameNormalized, account]));
    const held = await heldRewards(prisma, accounts.map((account) => account.id));

    const seen = new Set<string>();
    const rows: AdminSupporterGrantRowDto[] = names.map((name) => {
      const key = normalizeUsername(name);
      const account = byName.get(key) ?? null;
      const base = { input: name, accountId: account?.id ?? null, username: account?.username ?? null, rewardKeys: [] as string[], error: null };
      if (seen.has(key)) return { ...base, status: 'duplicate' as const };
      seen.add(key);
      if (!account) return { ...base, status: 'not-found' as const };
      if (account.id === actor.id) return { ...base, status: 'self' as const };
      const keys = held.get(account.id);
      const missing = missingFrom(keys);
      if (!missing.length) return { ...base, status: 'already' as const };
      return { ...base, status: keys?.size ? 'missing-rewards' as const : 'new' as const, rewardKeys: missing };
    });
    const granted = dryRun ? 0 : await commit(prisma, actor, rows, input.reason!);
    return { dryRun, rows, granted };
  },

  /** Gives every supporter the catalogue rewards they are missing, such as one added after their grant. */
  async backfill(
    prisma: PrismaClient,
    actor: AuditActor,
    input: { reason?: string | undefined; dryRun?: boolean | undefined },
  ): Promise<AdminSupporterGrantResultDto> {
    const dryRun = input.dryRun ?? false;
    if (!dryRun && !input.reason) throw AppError.badRequest('REASON_REQUIRED', 'Give a reason for the backfill.', { reason: 'Give a reason of at least 5 characters.' });
    const { supporters } = await AdminSupporterService.list(prisma);
    const rows: AdminSupporterGrantRowDto[] = supporters
      .filter((supporter) => supporter.since && supporter.missingKeys.length)
      .map((supporter) => ({
        input: supporter.username,
        status: supporter.accountId === actor.id ? 'self' as const : 'missing-rewards' as const,
        accountId: supporter.accountId,
        username: supporter.username,
        rewardKeys: supporter.missingKeys,
        error: null,
      }));
    const granted = dryRun ? 0 : await commit(prisma, actor, rows, input.reason!);
    return { dryRun, rows, granted };
  },
};
