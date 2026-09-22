import type { Prisma, PrismaClient } from '@prisma/client';
import { hideoutV2For, type Ruleset } from '@streets/rulesets';
import type { HideoutLedgerDto } from '@streets/shared';
import type { Db } from '../utils/db.js';

export interface EconomyLedgerWrite {
  source: string;
  label: string;
  amountCents: bigint | number;
  metadata?: Prisma.InputJsonValue;
}

const TRANSFER_ONLY_ACTIONS = new Set([
  'RUN_LAUNCH',
  'TURF_OUTPOST_TRANSFER',
]);

const ACTION_LABELS: Readonly<Record<string, string>> = {
  SCOUT: 'Street work',
  PRODUCE_CRACK: 'Production shift',
  STORE_BUY: 'Store purchase',
  STORE_SELL: 'Store sale',
  WEAPON_UNLOCK: 'Weapon unlock',
  HEAT_BRIBE: 'Heat bribe',
  HIDEOUT_UPGRADE: 'Hideout upgrade',
  RELOCATE: 'Relocation',
};

function toBigInt(value: bigint | number): bigint {
  return typeof value === 'bigint' ? value : BigInt(Math.trunc(value));
}

export const EconomyLedgerService = {
  /**
   * Fallback entry for ordinary actions whose economic effect is exactly their
   * home-cash delta. Actions with split economics can provide explicit lines.
   */
  defaultForAction(action: string, beforeCashCents: bigint, afterCashCents: bigint): EconomyLedgerWrite[] {
    if (TRANSFER_ONLY_ACTIONS.has(action)) return [];
    const amountCents = afterCashCents - beforeCashCents;
    if (amountCents === 0n) return [];
    return [{
      source: action,
      label: ACTION_LABELS[action] ?? action.replaceAll('_', ' ').toLowerCase(),
      amountCents,
    }];
  },

  async record(
    db: Db,
    roundPlayerId: string,
    entries: readonly EconomyLedgerWrite[],
    createdAt: Date,
  ): Promise<void> {
    for (const entry of entries) {
      const amountCents = toBigInt(entry.amountCents);
      if (amountCents === 0n) continue;
      await db.economyLedgerEntry.create({
        data: {
          roundPlayerId,
          source: entry.source,
          label: entry.label,
          amountCents,
          ...(entry.metadata !== undefined ? { metadata: entry.metadata } : {}),
          createdAt,
        },
      });
    }
  },

  async page(
    prisma: PrismaClient,
    roundPlayerId: string,
    ruleset: Ruleset,
    backOfficeLevel: number,
    now: Date,
  ): Promise<HideoutLedgerDto | undefined> {
    const rule = hideoutV2For(ruleset)?.ledger;
    if (!rule) return undefined;

    const historyDays = rule.historyDaysByBackOfficeLevel[backOfficeLevel] ?? rule.historyDaysByBackOfficeLevel[0]!;
    const rowLimit = rule.rowLimitByBackOfficeLevel[backOfficeLevel] ?? rule.rowLimitByBackOfficeLevel[0]!;
    const historyCutoff = new Date(now.getTime() - historyDays * 86_400_000);

    // Rolling totals are true aggregates over the full window. Itemized history
    // remains intentionally capped by Back Office level, but summaries never
    // silently drop older rows when a busy player exceeds that cap.
    const windows = await Promise.all(([1, 7, 30] as const).map(async (days) => {
      const cutoff = new Date(now.getTime() - days * 86_400_000);
      const [income, expense] = await Promise.all([
        prisma.economyLedgerEntry.aggregate({
          where: { roundPlayerId, createdAt: { gte: cutoff }, amountCents: { gt: 0n } },
          _sum: { amountCents: true },
        }),
        prisma.economyLedgerEntry.aggregate({
          where: { roundPlayerId, createdAt: { gte: cutoff }, amountCents: { lt: 0n } },
          _sum: { amountCents: true },
        }),
      ]);
      const incomeCents = income._sum.amountCents ?? 0n;
      const expenseSigned = expense._sum.amountCents ?? 0n;
      const expenseCents = -expenseSigned;
      return {
        days,
        incomeCents: Number(incomeCents),
        expenseCents: Number(expenseCents),
        netCents: Number(incomeCents + expenseSigned),
      };
    }));

    const rows = await prisma.economyLedgerEntry.findMany({
      where: { roundPlayerId, createdAt: { gte: historyCutoff } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: rowLimit,
    });

    return {
      backOfficeLevel,
      historyDays,
      rowLimit,
      windows,
      entries: rows
        .map((row) => ({
          id: row.id,
          category: row.amountCents > 0n ? 'INCOME' as const : 'EXPENSE' as const,
          source: row.source,
          label: row.label,
          amountCents: Number(row.amountCents),
          createdAt: row.createdAt.toISOString(),
        })),
      specializationHooks: {
        bookkeeping: {
          historyDaysBonus: rule.specializationHooks.bookkeepingHistoryDaysBonus,
          active: false,
        },
        connections: {
          takeBonusPercent: rule.specializationHooks.connectionsTakeBonusPercent,
          active: false,
        },
      },
    };
  },
};
