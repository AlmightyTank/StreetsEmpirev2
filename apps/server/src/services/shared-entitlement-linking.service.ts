import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '@prisma/client';
import { DROP_SOURCE } from '@streets/rulesets';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { legacyCrownImportRef, snapshotLegacyEntitlements } from './shared-entitlement-import.js';

const CODE_TTL_MS = 48 * 60 * 60 * 1000;

function codeHash(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}

function makeCode(now: Date): string {
  return `${now.getTime().toString(36)}.${randomBytes(24).toString('base64url')}`;
}

function codeIsFresh(code: string, now: Date): boolean {
  const issuedAt = Number.parseInt(code.split('.')[0] ?? '', 36);
  return Number.isSafeInteger(issuedAt) && issuedAt <= now.getTime() && now.getTime() - issuedAt <= CODE_TTL_MS;
}

async function snapshot(prisma: PrismaClient, environment: 'beta' | 'production', localAccountId: string) {
  const account = await prisma.account.findUnique({ where: { id: localAccountId }, select: { id: true, username: true } });
  if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account was not found in this environment.');
  const [wallet, unlocks] = await Promise.all([
    prisma.crownWallet.findUnique({ where: { accountId: localAccountId }, select: { balance: true, heldAt: true, holdReason: true } }),
    prisma.accountCosmeticUnlock.findMany({
      where: { accountId: localAccountId },
      select: { key: true, kind: true, title: true, description: true, rarity: true, styleKey: true, sourceQuestKey: true, awardedAt: true },
    }),
  ]);
  return {
    account,
    snapshot: snapshotLegacyEntitlements(environment, localAccountId, wallet, unlocks),
  };
}

async function importSnapshot(shared: Prisma.TransactionClient, canonicalAccountId: string, legacy: Awaited<ReturnType<typeof snapshot>>['snapshot']): Promise<void> {
  const importRef = legacyCrownImportRef(legacy);
  if (legacy.balance > 0 && !await shared.sharedCrownLedgerEntry.findUnique({ where: { externalRef: importRef }, select: { id: true } })) {
    const wallet = await shared.sharedCrownWallet.findUniqueOrThrow({ where: { accountId: canonicalAccountId } });
    const balance = wallet.balance + legacy.balance;
    if (!Number.isSafeInteger(balance)) throw AppError.conflict('SHARED_CROWN_BALANCE_INVALID', 'The combined Crown balance exceeds the supported limit.');
    await shared.sharedCrownWallet.update({ where: { accountId: canonicalAccountId }, data: { balance, version: { increment: 1 } } });
    await shared.sharedCrownLedgerEntry.create({
      data: {
        accountId: canonicalAccountId,
        kind: 'ADJUSTMENT', delta: legacy.balance, balanceAfter: balance, source: 'legacy-import', externalRef: importRef,
        environment: legacy.environment, localAccountId: legacy.localAccountId,
        reason: `Imported existing ${legacy.environment === 'beta' ? 'beta' : 'main'} Crown balance.`,
      },
    });
  }
  if (legacy.heldAt) {
    await shared.sharedCrownWallet.update({
      where: { accountId: canonicalAccountId },
      data: { heldAt: legacy.heldAt, holdReason: legacy.holdReason ?? 'Imported wallet hold; review before releasing.' },
    });
  }
  for (const unlock of legacy.unlocks) {
    await shared.sharedCosmeticUnlock.upsert({
      where: { accountId_key: { accountId: canonicalAccountId, key: unlock.key } },
      create: {
        accountId: canonicalAccountId, key: unlock.key, kind: unlock.kind, title: unlock.title,
        description: unlock.description, rarity: unlock.rarity, styleKey: unlock.styleKey,
        source: 'legacy-import', environment: legacy.environment, localAccountId: legacy.localAccountId,
        awardedAt: unlock.awardedAt,
      },
      update: {},
    });
  }
}

function assertSharedStore(shared: PrismaClient | null): asserts shared is PrismaClient {
  if (!shared || !env.sharedEntitlements.databaseUrl) {
    throw new AppError(503, 'SHARED_ENTITLEMENTS_UNAVAILABLE', 'The shared entitlement store is not configured on this server.');
  }
}

export const SharedEntitlementLinkingService = {
  async playerStatus(shared: PrismaClient | null, localAccountId: string) {
    const available = Boolean(shared && env.sharedEntitlements.databaseUrl && ['beta', 'production'].includes(env.appEnvironment));
    if (!available || !shared) return { available, environment: env.appEnvironment, status: 'unavailable' as const };
    const link = await shared.sharedEntitlementLink.findUnique({
      where: { environment_localAccountId: { environment: env.appEnvironment, localAccountId } },
      include: { account: { select: { identityKey: true } } },
    });
    return {
      available, environment: env.appEnvironment,
      status: !link ? 'not-linked' as const : link.account.identityKey.startsWith('pairing:') ? 'pending' as const : 'linked' as const,
    };
  },

  async findLocalAccount(prisma: PrismaClient, username: string) {
    const account = await prisma.account.findUnique({
      where: { usernameNormalized: username.trim().toLowerCase() },
      select: { id: true, username: true },
    });
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'No account has that username in this environment.');
    const [wallet, unlockCount] = await Promise.all([
      prisma.crownWallet.findUnique({ where: { accountId: account.id }, select: { balance: true, heldAt: true } }),
      prisma.accountCosmeticUnlock.count({ where: { accountId: account.id, sourceQuestKey: DROP_SOURCE } }),
    ]);
    return { accountId: account.id, username: account.username, crowns: wallet?.balance ?? 0, held: Boolean(wallet?.heldAt), dropUnlocks: unlockCount };
  },

  async start(prisma: PrismaClient, shared: PrismaClient | null, localAccountId: string, now = new Date()) {
    assertSharedStore(shared);
    if (env.appEnvironment !== 'beta' && env.appEnvironment !== 'production') throw AppError.forbidden('Account linking is available only on beta and main.');
    const environment = env.appEnvironment;
    const local = await snapshot(prisma, environment, localAccountId);
    const priorLink = await shared.sharedEntitlementLink.findUnique({
      where: { environment_localAccountId: { environment, localAccountId } },
      include: { account: { select: { id: true, identityKey: true, links: { select: { environment: true } } } } },
    });
    if (priorLink && (!priorLink.account.identityKey.startsWith('pairing:') || priorLink.account.links.length !== 1)) {
      throw AppError.conflict('SHARED_ENTITLEMENT_ALREADY_LINKED', 'This beta account is already linked. Existing links cannot be replaced here.');
    }

    const code = makeCode(now);
    const identityKey = `pairing:${codeHash(code)}`;
    await shared.$transaction(async (tx) => {
      const canonical = priorLink
        ? await tx.sharedEntitlementAccount.update({ where: { id: priorLink.accountId }, data: { identityKey }, select: { id: true } })
        : await tx.sharedEntitlementAccount.create({ data: { identityKey }, select: { id: true } });
      if (!priorLink) {
        await tx.sharedEntitlementLink.create({ data: { accountId: canonical.id, environment, localAccountId } });
        await tx.sharedCrownWallet.create({ data: { accountId: canonical.id } });
      }
      await importSnapshot(tx, canonical.id, local.snapshot);
    });
    return { code, expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(), account: { ...local.account, crowns: local.snapshot.balance, dropUnlocks: local.snapshot.unlocks.length } };
  },

  async complete(prisma: PrismaClient, shared: PrismaClient | null, localAccountId: string, codeInput: string, now = new Date()) {
    assertSharedStore(shared);
    if (env.appEnvironment !== 'beta' && env.appEnvironment !== 'production') throw AppError.forbidden('Account linking is available only on beta and main.');
    const environment = env.appEnvironment;
    const code = codeInput.trim();
    if (!codeIsFresh(code, now)) throw AppError.conflict('SHARED_LINK_CODE_EXPIRED', 'That pairing code is invalid or has expired. Start a new link from beta.');
    const local = await snapshot(prisma, environment, localAccountId);
    const identityKey = `pairing:${codeHash(code)}`;
    const account = await shared.sharedEntitlementAccount.findUnique({ where: { identityKey }, include: { links: true } });
    if (!account || account.links.length !== 1 || !['beta', 'production'].includes(account.links[0]?.environment ?? '') || account.links[0]?.environment === environment) {
      throw AppError.conflict('SHARED_LINK_CODE_INVALID', 'That pairing code is invalid, already used, or was created in this environment.');
    }
    const existing = await shared.sharedEntitlementLink.findUnique({
      where: { environment_localAccountId: { environment, localAccountId } },
      select: { accountId: true },
    });
    if (existing) throw AppError.conflict('SHARED_ENTITLEMENT_ALREADY_LINKED', 'This main account is already linked. Existing links cannot be replaced here.');

    await shared.$transaction(async (tx) => {
      const claimed = await tx.sharedEntitlementAccount.updateMany({ where: { id: account.id, identityKey }, data: { identityKey: `linked:${randomUUID()}` } });
      if (claimed.count !== 1) throw AppError.conflict('SHARED_LINK_CODE_INVALID', 'That pairing code was just used. Start a new link from beta.');
      await tx.sharedEntitlementLink.create({ data: { accountId: account.id, environment, localAccountId } });
      await importSnapshot(tx, account.id, local.snapshot);
    });
    return { linked: true, account: { ...local.account, crowns: local.snapshot.balance, dropUnlocks: local.snapshot.unlocks.length } };
  },
};
