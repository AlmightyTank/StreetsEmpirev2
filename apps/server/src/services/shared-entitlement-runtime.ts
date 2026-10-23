import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { requireSharedEntitlementAccount } from './shared-entitlement-account.service.js';
import { DROP_ITEMS, DROP_SOURCE, DROP_SOURCE_VERSION } from '@streets/rulesets';
import { AppError } from '../utils/errors.js';

let canonicalClient: PrismaClient | null = null;

/** Installed by the Fastify entitlement plugin after its connection succeeds. */
export function configureSharedEntitlements(client: PrismaClient | null): void {
  canonicalClient = client;
}

export interface SharedCrownMovement {
  accountId: string;
  kind: string;
  delta: number;
  source: string;
  externalRef: string;
  roundId?: string | null;
  reason?: string | null;
  metadata?: import('@prisma/client').Prisma.InputJsonValue;
  allowHeld?: boolean;
}

/** Applies one local wallet event to the canonical wallet with a namespaced idempotency key. */
export async function applySharedCrownMovement(movement: SharedCrownMovement): Promise<{ balance: number; applied: boolean } | null> {
  if (!env.sharedEntitlements.enabled || !canonicalClient) return null;
  const linked = await requireSharedEntitlementAccount(canonicalClient, env.appEnvironment, movement.accountId);
  const milestone = /:(\d+)$/.exec(movement.externalRef)?.[1];
  const externalRef = movement.source === 'account-level' && milestone
    ? `shared:account-level:${linked.id}:${milestone}`
    : movement.source === 'birthday' && milestone
      ? `shared:birthday:${linked.id}:${milestone}`
      : `${env.appEnvironment}:${movement.externalRef}`;
  return canonicalClient.$transaction(async (tx) => {
    await tx.sharedCrownWallet.upsert({ where: { accountId: linked.id }, create: { accountId: linked.id }, update: {} });
    const rows = await tx.$queryRaw<Array<{ balance: number; version: number; heldAt: Date | null }>>`
      SELECT "balance", "version", "heldAt" FROM "SharedCrownWallet" WHERE "accountId" = ${linked.id} FOR UPDATE`;
    const wallet = rows[0];
    if (!wallet) throw AppError.notFound('SHARED_WALLET_NOT_FOUND', 'The shared Crown wallet is unavailable.');
    const existing = await tx.sharedCrownLedgerEntry.findUnique({ where: { externalRef } });
    if (existing) {
      if (existing.accountId !== linked.id) throw AppError.conflict('CROWN_REF_CONFLICT', 'That Crown event belongs to another account.');
      return { balance: wallet.balance, applied: false };
    }
    if (movement.delta < 0 && wallet.heldAt && !movement.allowHeld) {
      throw AppError.conflict('CROWN_WALLET_HELD', 'Your Crown wallet is on hold while support reviews a payment. Contact support to clear it.');
    }
    const balance = wallet.balance + movement.delta;
    if (balance < 0) {
      throw AppError.conflict('INSUFFICIENT_CROWNS', `That costs ${(-movement.delta).toLocaleString('en-US')} Crowns. You have ${wallet.balance.toLocaleString('en-US')}.`);
    }
    await tx.sharedCrownWallet.update({ where: { accountId: linked.id }, data: { balance, version: wallet.version + 1 } });
    await tx.sharedCrownLedgerEntry.create({
      data: {
        accountId: linked.id, kind: movement.kind, delta: movement.delta, balanceAfter: balance,
        source: movement.source, externalRef, environment: env.appEnvironment, localAccountId: movement.accountId,
        roundId: movement.roundId ?? null, reason: movement.reason ?? null,
        ...(movement.metadata !== undefined ? { metadata: movement.metadata } : {}),
      },
    });
    return { balance, applied: true };
  });
}

export async function setSharedCrownHold(accountId: string, reason: string | null): Promise<void> {
  if (!env.sharedEntitlements.enabled || !canonicalClient) return;
  const linked = await requireSharedEntitlementAccount(canonicalClient, env.appEnvironment, accountId);
  await canonicalClient.sharedCrownWallet.upsert({
    where: { accountId: linked.id }, create: { accountId: linked.id, ...(reason ? { heldAt: new Date(), holdReason: reason } : {}) },
    update: reason ? { heldAt: new Date(), holdReason: reason } : { heldAt: null, holdReason: null },
  });
}

export async function getSharedCrownBalance(accountId: string): Promise<number | null> {
  if (!env.sharedEntitlements.enabled || !canonicalClient) return null;
  const linked = await requireSharedEntitlementAccount(canonicalClient, env.appEnvironment, accountId);
  const wallet = await canonicalClient.sharedCrownWallet.findUnique({ where: { accountId: linked.id }, select: { balance: true } });
  return wallet?.balance ?? 0;
}

export async function getSharedCrownHold(accountId: string): Promise<{ heldAt: Date | null; holdReason: string | null } | null> {
  if (!env.sharedEntitlements.enabled || !canonicalClient) return null;
  const linked = await requireSharedEntitlementAccount(canonicalClient, env.appEnvironment, accountId);
  const wallet = await canonicalClient.sharedCrownWallet.findUnique({ where: { accountId: linked.id }, select: { heldAt: true, holdReason: true } });
  return wallet ?? { heldAt: null, holdReason: null };
}

/** Returns the canonical account for this environment, or null when sharing is disabled. */
export async function sharedEntitlementRuntime(
  fastify: Pick<FastifyInstance, 'entitlements' | 'prisma'>,
  localAccountId: string,
): Promise<{ db: PrismaClient; accountId: string; environment: string; localAccountId: string } | null> {
  if (!env.sharedEntitlements.enabled || !fastify.entitlements) return null;
  const account = await requireSharedEntitlementAccount(fastify.entitlements, env.appEnvironment, localAccountId);
  const unlocks = await fastify.entitlements.sharedCosmeticUnlock.findMany({
    where: { accountId: account.id, source: 'drop' },
    select: { key: true, kind: true, title: true, description: true, rarity: true, styleKey: true, awardedAt: true },
  });
  if (unlocks.length) {
    await fastify.prisma.accountCosmeticUnlock.createMany({
      data: unlocks.map((unlock) => ({
        accountId: localAccountId,
        ...unlock,
        sourceQuestKey: DROP_SOURCE,
        sourceRulesetId: DROP_SOURCE,
        sourceRulesetVersion: DROP_SOURCE_VERSION,
      })),
      skipDuplicates: true,
    });
  }
  return { db: fastify.entitlements, accountId: account.id, environment: env.appEnvironment, localAccountId };
}

/** Atomically charges and grants a Drop purchase in the canonical database. */
export async function applySharedDropPurchase(
  shared: NonNullable<Awaited<ReturnType<typeof sharedEntitlementRuntime>>>,
  input: { actionId: string; orderId: string; refKey: string; price: number; keys: readonly string[]; now: Date },
): Promise<void> {
  const externalRef = `shared-drop:${shared.environment}:${shared.localAccountId}:${input.actionId}`;
  const localOrderId = `${shared.localAccountId}:${input.actionId}`;
  await shared.db.$transaction(async (tx) => {
    const prior = await tx.sharedEntitlementPurchase.findUnique({
      where: { environment_localOrderId: { environment: shared.environment, localOrderId } },
    });
    if (prior) {
      if (prior.refKey !== input.refKey || prior.crownsDelta !== -input.price) {
        throw AppError.conflict('ACTION_ID_REUSED', 'That purchase id was already used for something else.');
      }
      return;
    }

    await tx.sharedCrownWallet.upsert({
      where: { accountId: shared.accountId },
      create: { accountId: shared.accountId },
      update: {},
    });
    const wallets = await tx.$queryRaw<Array<{ balance: number; version: number; heldAt: Date | null }>>`
      SELECT "balance", "version", "heldAt" FROM "SharedCrownWallet" WHERE "accountId" = ${shared.accountId} FOR UPDATE`;
    const wallet = wallets[0];
    if (!wallet) throw AppError.notFound('SHARED_WALLET_NOT_FOUND', 'The shared Crown wallet is unavailable.');
    const duplicate = await tx.sharedCrownLedgerEntry.findUnique({ where: { externalRef } });
    if (duplicate) return;
    const alreadyOwned = await tx.sharedCosmeticUnlock.findFirst({
      where: { accountId: shared.accountId, key: { in: [...input.keys] }, source: 'drop' },
      select: { key: true },
    });
    if (alreadyOwned) {
      throw AppError.conflict('DROP_ALREADY_OWNED', 'Part of that set was just added to your collection. Refresh The Drop before buying.');
    }
    if (wallet.heldAt) throw AppError.conflict('CROWN_WALLET_HELD', 'Your Crown wallet is on hold while support reviews a payment. Contact support to clear it.');
    if (wallet.balance < input.price) {
      throw AppError.conflict('INSUFFICIENT_CROWNS', `That costs ${input.price.toLocaleString('en-US')} Crowns. You have ${wallet.balance.toLocaleString('en-US')}.`);
    }
    const balance = wallet.balance - input.price;
    await tx.sharedCrownWallet.update({ where: { accountId: shared.accountId }, data: { balance, version: wallet.version + 1 } });
    await tx.sharedCrownLedgerEntry.create({
      data: {
        accountId: shared.accountId, kind: 'SPEND', delta: -input.price, balanceAfter: balance,
        source: 'drop-order', externalRef, environment: shared.environment, localAccountId: shared.localAccountId,
        reason: input.refKey, metadata: { orderId: input.orderId, actionId: input.actionId }, createdAt: input.now,
      },
    });
    for (const key of input.keys) {
      const item = DROP_ITEMS[key];
      if (!item) throw AppError.conflict('DROP_ITEM_INVALID', 'That Drop item is no longer available.');
      await tx.sharedCosmeticUnlock.upsert({
        where: { accountId_key: { accountId: shared.accountId, key } },
        create: {
          accountId: shared.accountId, key, kind: item.kind, title: item.name,
          description: item.description, rarity: item.rarity, styleKey: item.styleKey ?? null,
          source: DROP_SOURCE, environment: shared.environment, localAccountId: shared.localAccountId, awardedAt: input.now,
        },
        update: {},
      });
    }
    await tx.sharedEntitlementPurchase.create({
      data: {
        accountId: shared.accountId, environment: shared.environment, localOrderId,
        kind: 'DROP', refKey: input.refKey, crownsDelta: -input.price, status: 'completed',
        metadata: { actionId: input.actionId, orderId: input.orderId, keys: [...input.keys] }, createdAt: input.now,
      },
    });
  });
}
