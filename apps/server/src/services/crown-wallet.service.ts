import type { CrownLedgerEntry, Prisma, PrismaClient } from '@prisma/client';
import type { CrownLedgerEntryDto, CrownLedgerKindDto, DropWalletDto } from '@streets/shared';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

/**
 * The Drop, Slice A: the account's Crown wallet. Every change runs here, in the
 * caller's transaction:
 *
 *   lock the wallet row -> refuse a repeated externalRef -> check the balance ->
 *   update the balance and version -> append the ledger entry
 *
 * The row lock serialises two spends against one balance, so they can never
 * both pass; the unique externalRef stops a replayed grant or charge from
 * applying twice. The wallet belongs to the account and never to a round.
 */

export type CrownLedgerKind = CrownLedgerKindDto;

export interface CrownMovement {
  accountId: string;
  kind: CrownLedgerKind;
  /** Signed whole Crowns, never zero. */
  delta: number;
  source: string;
  /** Idempotency key of the event that moves the Crowns. */
  externalRef: string;
  roundId?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
  actorAccountId?: string | null;
  /** A held wallet still takes credits and reversals; only spends stop. */
  allowHeld?: boolean;
}

export interface CrownMovementResult {
  applied: boolean;
  balance: number;
  entry: CrownLedgerEntry;
}

interface LockedWallet {
  balance: number;
  version: number;
  heldAt: Date | null;
  holdReason: string | null;
}

/** Creates the wallet if needed, then takes its row lock. */
export async function lockCrownWallet(tx: Db, accountId: string): Promise<LockedWallet> {
  await tx.$executeRaw`INSERT INTO "CrownWallet" ("accountId", "balance", "version", "createdAt", "updatedAt")
    VALUES (${accountId}, 0, 0, NOW(), NOW()) ON CONFLICT ("accountId") DO NOTHING`;
  const rows = await tx.$queryRaw<LockedWallet[]>`SELECT "balance", "version", "heldAt", "holdReason"
    FROM "CrownWallet" WHERE "accountId" = ${accountId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account was not found.');
  return { balance: Number(row.balance), version: Number(row.version), heldAt: row.heldAt, holdReason: row.holdReason };
}

const LEDGER_LABELS: Record<string, string> = {
  'daily-contract': 'Daily contract',
  'weekly-contract': 'Weekly contract',
  milestone: 'Round milestone',
  event: 'Event contract',
  'drop-order': 'The Drop purchase',
  'street-pass-skip': 'Street Pass level skip',
  admin: 'Admin adjustment',
  refund: 'Refund',
  dispute: 'Dispute',
};

export function ledgerLabel(entry: Pick<CrownLedgerEntry, 'source' | 'reason'>): string {
  if (entry.source.startsWith('pack:')) return `Crown pack · ${entry.source.slice(5)}`;
  return LEDGER_LABELS[entry.source] ?? entry.reason ?? entry.source;
}

export function ledgerDto(entry: CrownLedgerEntry): CrownLedgerEntryDto {
  return {
    id: entry.id,
    kind: entry.kind as CrownLedgerKind,
    delta: entry.delta,
    balanceAfter: entry.balanceAfter,
    source: entry.source,
    label: ledgerLabel(entry),
    createdAt: entry.createdAt.toISOString(),
  };
}

export const CrownWalletService = {
  /**
   * Move Crowns exactly once. A repeated externalRef returns the original entry
   * with `applied: false` and changes nothing.
   */
  async apply(tx: Db, movement: CrownMovement): Promise<CrownMovementResult> {
    if (!Number.isSafeInteger(movement.delta) || movement.delta === 0) {
      throw AppError.badRequest('CROWNS_INVALID', 'Crowns move in whole, non-zero amounts.');
    }
    const wallet = await lockCrownWallet(tx, movement.accountId);
    // Checked after the lock, so two racing duplicates cannot both miss it.
    const existing = await tx.crownLedgerEntry.findUnique({ where: { externalRef: movement.externalRef } });
    if (existing) {
      if (existing.accountId !== movement.accountId) {
        throw AppError.conflict('CROWN_REF_CONFLICT', 'That Crown event belongs to another account.');
      }
      return { applied: false, balance: wallet.balance, entry: existing };
    }
    if (movement.delta < 0 && wallet.heldAt && !movement.allowHeld) {
      throw AppError.conflict('CROWN_WALLET_HELD', 'Your Crown wallet is on hold while support reviews a payment. Contact support to clear it.');
    }
    const balance = wallet.balance + movement.delta;
    if (balance < 0) {
      throw AppError.conflict(
        'INSUFFICIENT_CROWNS',
        `That costs ${(-movement.delta).toLocaleString('en-US')} Crowns. You have ${wallet.balance.toLocaleString('en-US')}.`,
      );
    }
    await tx.crownWallet.update({
      where: { accountId: movement.accountId },
      data: { balance, version: wallet.version + 1 },
    });
    const entry = await tx.crownLedgerEntry.create({
      data: {
        accountId: movement.accountId,
        kind: movement.kind,
        delta: movement.delta,
        balanceAfter: balance,
        source: movement.source,
        externalRef: movement.externalRef,
        roundId: movement.roundId ?? null,
        reason: movement.reason ?? null,
        ...(movement.metadata !== undefined ? { metadata: movement.metadata } : {}),
        actorAccountId: movement.actorAccountId ?? null,
      },
    });
    return { applied: true, balance, entry };
  },

  /** Freeze spending (a spent pack was refunded or disputed). Credits still land. */
  async hold(tx: Db, accountId: string, reason: string, at = new Date()): Promise<void> {
    await lockCrownWallet(tx, accountId);
    await tx.crownWallet.update({ where: { accountId }, data: { heldAt: at, holdReason: reason } });
  },

  async release(tx: Db, accountId: string): Promise<void> {
    await lockCrownWallet(tx, accountId);
    await tx.crownWallet.update({ where: { accountId }, data: { heldAt: null, holdReason: null } });
  },

  /** Crowns this account earned from play in one round. */
  async earnedInRound(db: Db | PrismaClient, accountId: string, roundId: string | null): Promise<number> {
    if (!roundId) return 0;
    const sum = await db.crownLedgerEntry.aggregate({
      where: { accountId, kind: 'EARN', roundId },
      _sum: { delta: true },
    });
    return sum._sum.delta ?? 0;
  },

  async view(db: Db | PrismaClient, accountId: string, roundId: string | null, roundCap: number): Promise<DropWalletDto> {
    const [wallet, earned] = await Promise.all([
      db.crownWallet.findUnique({ where: { accountId } }),
      CrownWalletService.earnedInRound(db, accountId, roundId),
    ]);
    return {
      balance: wallet?.balance ?? 0,
      earnedThisRound: earned,
      remainingEarnable: roundId ? Math.max(0, roundCap - earned) : 0,
      roundCap,
      held: Boolean(wallet?.heldAt),
      holdReason: wallet?.holdReason ?? null,
    };
  },

  async history(db: Db | PrismaClient, accountId: string, limit = 50): Promise<CrownLedgerEntryDto[]> {
    const rows = await db.crownLedgerEntry.findMany({
      where: { accountId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
    });
    return rows.map(ledgerDto);
  },
};
