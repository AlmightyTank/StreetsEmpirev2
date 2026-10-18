import type { CrownAdjustmentRequest, DropOffer, PrismaClient } from '@prisma/client';
import { DROP_BUNDLES, DROP_ITEMS, DROP_KEY_PREFIX } from '@streets/rulesets';
import type {
  AdminCrownAdjustmentDto,
  AdminCrownWalletDto,
  AdminDropDashboardDto,
  AdminDropEntryDto,
  AdminDropOfferDto,
  AdminDropSettingsDto,
  DropEntryStateDto,
  DropOfferBadgeDto,
  DropOfferSlotDto,
  DropReturnPolicyDto,
} from '@streets/shared';
import { env } from '../config/env.js';
import type { Db } from '../utils/db.js';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { CrownPackService, packOrderDto } from './crown-pack.service.js';
import { CrownWalletService } from './crown-wallet.service.js';
import { isEntryState, isReturnPolicy, loadCatalog, type CatalogEntry } from './drop-catalog.service.js';
import { DropPurchaseService } from './drop-purchase.service.js';
import { DropSettingsService, settingsDto, type DropSettingsValues } from './drop-settings.service.js';
import { RoundService } from './round.service.js';

/**
 * The Drop, Slice F: operator tools. Every change here needs a reason and
 * writes an AdminAuditLog entry with before and after in the same
 * transaction. Wallet changes go through the ledger like every other Crown;
 * large ones wait for a second admin. Nothing here edits SQL by hand.
 */

const SLOTS: readonly DropOfferSlotDto[] = ['FEATURED', 'DAILY', 'CATALOG'];
const BADGES: readonly DropOfferBadgeDto[] = ['DROP_EXCLUSIVE', 'DAILY', 'FEATURED', 'RETURNING', 'PERMANENT'];
const MAX_PRICE = 100_000;
const MAX_ADJUSTMENT = 1_000_000;

function requireReason(reason: string | undefined | null): string {
  const value = reason?.trim() ?? '';
  if (value.length < 4) throw AppError.badRequest('REASON_REQUIRED', 'Give a reason of at least a few words.', { reason: 'Say why.' });
  return value.slice(0, 500);
}

function adjustmentDto(row: CrownAdjustmentRequest & { account?: { username: string } | null }): AdminCrownAdjustmentDto {
  return {
    id: row.id,
    accountId: row.accountId,
    username: row.account?.username ?? null,
    delta: row.delta,
    reason: row.reason,
    status: row.status as AdminCrownAdjustmentDto['status'],
    requestedBy: row.requestedByUsername,
    decidedBy: row.decidedByUsername,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

function offerDto(row: DropOffer): AdminDropOfferDto {
  return {
    id: row.id,
    kind: row.kind as AdminDropOfferDto['kind'],
    refKey: row.refKey,
    slot: row.slot as DropOfferSlotDto,
    badge: row.badge as DropOfferBadgeDto,
    priceCrowns: row.priceCrowns,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdBy: row.createdByUsername,
    note: row.note,
  };
}

function entryDto(entry: CatalogEntry, owners: number): AdminDropEntryDto {
  const item = DROP_ITEMS[entry.key];
  const bundle = DROP_BUNDLES[entry.key];
  return {
    key: entry.key,
    kind: entry.kind,
    name: item?.name ?? bundle?.name ?? entry.key,
    collection: item?.collection ?? bundle?.collection ?? '',
    category: item?.category ?? 'BUNDLES',
    rarity: item?.rarity ?? null,
    state: entry.state,
    defaultPriceCrowns: entry.defaultPriceCrowns,
    priceCrowns: entry.priceCrowns,
    returnPolicy: entry.returnPolicy,
    inDailyPool: entry.inDailyPool,
    homepageSlot: entry.homepageSlot,
    owners,
    updatedAt: entry.updatedAt?.toISOString() ?? null,
    updatedBy: entry.updatedBy,
  };
}

async function applyAdjustment(tx: Db, request: CrownAdjustmentRequest, decider: AuditActor | null): Promise<string> {
  const result = await CrownWalletService.apply(tx, {
    accountId: request.accountId,
    kind: 'ADJUSTMENT',
    delta: request.delta,
    source: 'admin',
    externalRef: `admin:${request.id}`,
    reason: request.reason,
    actorAccountId: decider?.id ?? request.requestedById,
    metadata: { requestId: request.id, requestedBy: request.requestedByUsername, approvedBy: decider?.username ?? null },
    allowHeld: true,
  });
  return result.entry.id;
}

export interface EntryPatch {
  state?: string;
  priceCrowns?: number | null;
  returnPolicy?: string;
  inDailyPool?: boolean;
  homepageSlot?: number | null;
  /** Required to archive, or to make the irreversible Never Returning claim. */
  confirmIrreversible?: boolean;
}

export interface OfferInput {
  refKey: string;
  slot: string;
  badge: string;
  priceCrowns?: number | null;
  startsAt: string;
  endsAt?: string | null;
  note?: string | null;
}

export const DropAdminService = {
  async dashboard(prisma: PrismaClient): Promise<AdminDropDashboardDto> {
    const since = new Date(Date.now() - 86_400_000);
    const [settings, catalog, wallets, byKind, bySource, orderTotals, orders24h, packs, mismatches, pending, recent, owners, offers] = await Promise.all([
      DropSettingsService.get(prisma),
      loadCatalog(prisma),
      prisma.crownWallet.aggregate({ _count: { _all: true }, _sum: { balance: true } }),
      prisma.crownLedgerEntry.groupBy({ by: ['kind'], _sum: { delta: true } }),
      prisma.crownLedgerEntry.groupBy({ by: ['source'], _sum: { delta: true }, _count: { _all: true } }),
      prisma.dropOrder.aggregate({ _count: { _all: true }, _sum: { priceCrowns: true } }),
      prisma.dropOrder.count({ where: { createdAt: { gte: since } } }),
      prisma.crownPackOrder.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountCents: true, crowns: true } }),
      prisma.$queryRaw<Array<{ accountId: string; balance: number; ledger: bigint | number | null }>>`
        SELECT w."accountId", w."balance", COALESCE(SUM(l."delta"), 0) AS "ledger"
        FROM "CrownWallet" w LEFT JOIN "CrownLedgerEntry" l ON l."accountId" = w."accountId"
        GROUP BY w."accountId", w."balance"
        HAVING w."balance" <> COALESCE(SUM(l."delta"), 0)
        LIMIT 50`,
      prisma.crownAdjustmentRequest.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, include: { account: { select: { username: true } } } }),
      prisma.crownAdjustmentRequest.findMany({ where: { status: { not: 'PENDING' } }, orderBy: { createdAt: 'desc' }, take: 15, include: { account: { select: { username: true } } } }),
      prisma.accountCosmeticUnlock.groupBy({ by: ['key'], where: { key: { startsWith: DROP_KEY_PREFIX } }, _count: { _all: true } }),
      prisma.dropOffer.findMany({ orderBy: { startsAt: 'desc' }, take: 50 }),
    ]);
    const kindSum = (kind: string) => byKind.find((row) => row.kind === kind)?._sum.delta ?? 0;
    const ownerCount = new Map(owners.map((row) => [row.key, row._count._all]));
    const heldWallets = await prisma.crownWallet.count({ where: { heldAt: { not: null } } });
    return {
      envEnabled: env.drop.enabled,
      checkoutConfigured: env.drop.crownPacksConfigured || env.googlePlay.crownPacksConfigured,
      settings: settingsDto(settings),
      totals: {
        wallets: wallets._count._all,
        balance: wallets._sum.balance ?? 0,
        earned: kindSum('EARN'),
        paidGranted: kindSum('PAID_GRANT'),
        spent: -kindSum('SPEND'),
        adjusted: kindSum('ADJUSTMENT'),
        reversed: -kindSum('REVERSAL'),
        heldWallets,
      },
      bySource: bySource
        .map((row) => ({ source: row.source, crowns: row._sum.delta ?? 0, entries: row._count._all }))
        .sort((a, b) => a.source.localeCompare(b.source)),
      orders: { total: orderTotals._count._all, last24h: orders24h, crowns: orderTotals._sum.priceCrowns ?? 0 },
      packOrders: packs.map((row) => ({ status: row.status, count: row._count._all, amountCents: row._sum.amountCents ?? 0, crowns: row._sum.crowns ?? 0 })),
      mismatches: mismatches.map((row) => ({ accountId: row.accountId, balance: Number(row.balance), ledger: Number(row.ledger ?? 0) })),
      pendingAdjustments: pending.map(adjustmentDto),
      recentAdjustments: recent.map(adjustmentDto),
      entries: [...catalog.values()].map((entry) => {
        const bundle = DROP_BUNDLES[entry.key];
        const count = bundle ? Math.min(...bundle.itemKeys.map((key) => ownerCount.get(key) ?? 0)) : ownerCount.get(entry.key) ?? 0;
        return entryDto(entry, count);
      }),
      offers: offers.map(offerDto),
    };
  },

  async updateSettings(prisma: PrismaClient, actor: AuditActor, patch: Partial<AdminDropSettingsDto>, reasonInput: string): Promise<AdminDropSettingsDto> {
    const reason = requireReason(reasonInput);
    const values: Partial<DropSettingsValues> = {
      ...(patch.storefront !== undefined ? { storefrontEnabled: patch.storefront } : {}),
      ...(patch.purchases !== undefined ? { purchasesEnabled: patch.purchases } : {}),
      ...(patch.earning !== undefined ? { earningEnabled: patch.earning } : {}),
      ...(patch.checkout !== undefined ? { checkoutEnabled: patch.checkout } : {}),
      ...(patch.streetPassSkips !== undefined ? { streetPassSkipsEnabled: patch.streetPassSkips } : {}),
      ...(patch.dailyOfferCount !== undefined ? { dailyOfferCount: patch.dailyOfferCount } : {}),
      ...(patch.dailyResetHourUtc !== undefined ? { dailyResetHourUtc: patch.dailyResetHourUtc } : {}),
      ...(patch.autoFeatured !== undefined ? { autoFeatured: patch.autoFeatured } : {}),
      ...(patch.roundEarnCap !== undefined ? { roundEarnCap: patch.roundEarnCap } : {}),
      ...(patch.largeAdjustmentThreshold !== undefined ? { largeAdjustmentThreshold: patch.largeAdjustmentThreshold } : {}),
    };
    return prisma.$transaction(async (tx) => {
      const { before, after } = await DropSettingsService.update(tx, values, actor.username);
      await AdminAuditService.record(tx, actor, { action: 'drop.settings', targetType: 'DropSettings', targetId: 'global', reason, before, after });
      return settingsDto(after);
    });
  },

  async updateEntry(prisma: PrismaClient, actor: AuditActor, key: string, patch: EntryPatch, reasonInput: string): Promise<AdminDropEntryDto> {
    const reason = requireReason(reasonInput);
    const kind = DROP_ITEMS[key] ? 'ITEM' : DROP_BUNDLES[key] ? 'BUNDLE' : null;
    if (!kind) throw AppError.notFound('DROP_ITEM_NOT_FOUND', 'That item is not in The Drop catalog.');
    if (patch.state !== undefined && !isEntryState(patch.state)) throw AppError.badRequest('DROP_STATE_INVALID', 'Pick Draft, QA, Scheduled, Live, Vaulted or Archived.');
    if (patch.returnPolicy !== undefined && !isReturnPolicy(patch.returnPolicy)) throw AppError.badRequest('DROP_RETURN_INVALID', 'Pick May return, Permanent or Never returning.');
    if (patch.priceCrowns !== undefined && patch.priceCrowns !== null
      && (!Number.isSafeInteger(patch.priceCrowns) || patch.priceCrowns < 1 || patch.priceCrowns > MAX_PRICE)) {
      throw AppError.badRequest('DROP_PRICE_INVALID', `Prices are whole Crowns from 1 to ${MAX_PRICE.toLocaleString('en-US')}.`);
    }
    if (patch.homepageSlot !== undefined && patch.homepageSlot !== null && (!Number.isInteger(patch.homepageSlot) || patch.homepageSlot < 1 || patch.homepageSlot > 12)) {
      throw AppError.badRequest('DROP_SLOT_INVALID', 'Homepage slots are 1 to 12.');
    }
    return prisma.$transaction(async (tx) => {
      const before = (await loadCatalog(tx)).get(key)!;
      const nextState = (patch.state ?? before.state) as DropEntryStateDto;
      const nextPolicy = (patch.returnPolicy ?? before.returnPolicy) as DropReturnPolicyDto;
      if (before.returnPolicy === 'NEVER_RETURNING' && nextPolicy !== 'NEVER_RETURNING') {
        throw AppError.conflict('DROP_NEVER_RETURNING_LOCKED', 'This item was promised never to return. That promise cannot be undone.');
      }
      if (before.returnPolicy === 'NEVER_RETURNING' && before.state !== 'LIVE' && nextState === 'LIVE') {
        throw AppError.conflict('DROP_NEVER_RETURNING_LOCKED', 'This item was promised never to return, so it cannot go live again.');
      }
      if (before.state === 'ARCHIVED' && patch.state !== undefined && nextState !== 'ARCHIVED') {
        throw AppError.conflict('DROP_ARCHIVED_LOCKED', 'This item was archived permanently and cannot return to the catalog.');
      }
      const irreversible = (nextPolicy === 'NEVER_RETURNING' && before.returnPolicy !== 'NEVER_RETURNING')
        || (nextState === 'ARCHIVED' && before.state !== 'ARCHIVED');
      if (irreversible && patch.confirmIrreversible !== true) {
        throw AppError.conflict('DROP_CONFIRM_REQUIRED', 'Archiving or promising Never returning needs an explicit confirmation.');
      }
      const data = {
        state: nextState,
        returnPolicy: nextPolicy,
        ...(patch.priceCrowns !== undefined ? { priceCrowns: patch.priceCrowns } : {}),
        ...(patch.inDailyPool !== undefined ? { inDailyPool: patch.inDailyPool } : {}),
        ...(patch.homepageSlot !== undefined ? { homepageSlot: patch.homepageSlot } : {}),
        updatedByUsername: actor.username,
      };
      await tx.dropCatalogEntry.upsert({ where: { key }, create: { key, kind, ...data }, update: data });
      const after = (await loadCatalog(tx)).get(key)!;
      await AdminAuditService.record(tx, actor, { action: 'drop.catalog', targetType: 'DropCatalogEntry', targetId: key, reason, before, after });
      const owners = DROP_ITEMS[key] ? await tx.accountCosmeticUnlock.count({ where: { key } }) : 0;
      return entryDto(after, owners);
    });
  },

  async createOffer(prisma: PrismaClient, actor: AuditActor, input: OfferInput, reasonInput: string): Promise<AdminDropOfferDto> {
    const reason = requireReason(reasonInput);
    const kind = DROP_ITEMS[input.refKey] ? 'ITEM' : DROP_BUNDLES[input.refKey] ? 'BUNDLE' : null;
    if (!kind) throw AppError.badRequest('DROP_ITEM_NOT_FOUND', 'Pick an item or bundle from the catalog.');
    if (!(SLOTS as readonly string[]).includes(input.slot)) throw AppError.badRequest('DROP_SLOT_INVALID', 'Pick Featured, Daily or Catalog.');
    if (!(BADGES as readonly string[]).includes(input.badge)) throw AppError.badRequest('DROP_BADGE_INVALID', 'Pick a sale badge.');
    const startsAt = new Date(input.startsAt);
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) throw AppError.badRequest('DROP_WINDOW_INVALID', 'Give real start and end times.');
    if (endsAt && endsAt <= startsAt) throw AppError.badRequest('DROP_WINDOW_INVALID', 'The offer must end after it starts.');
    if (input.priceCrowns !== undefined && input.priceCrowns !== null
      && (!Number.isSafeInteger(input.priceCrowns) || input.priceCrowns < 1 || input.priceCrowns > MAX_PRICE)) {
      throw AppError.badRequest('DROP_PRICE_INVALID', `Prices are whole Crowns from 1 to ${MAX_PRICE.toLocaleString('en-US')}.`);
    }
    return prisma.$transaction(async (tx) => {
      const row = await tx.dropOffer.create({
        data: {
          kind, refKey: input.refKey, slot: input.slot, badge: input.badge, priceCrowns: input.priceCrowns ?? null,
          startsAt, endsAt, createdByUsername: actor.username, note: input.note?.trim().slice(0, 300) || null,
        },
      });
      await AdminAuditService.record(tx, actor, { action: 'drop.offer.create', targetType: 'DropOffer', targetId: row.id, reason, after: row });
      return offerDto(row);
    });
  },

  async cancelOffer(prisma: PrismaClient, actor: AuditActor, offerId: string, reasonInput: string): Promise<AdminDropOfferDto> {
    const reason = requireReason(reasonInput);
    return prisma.$transaction(async (tx) => {
      const before = await tx.dropOffer.findUnique({ where: { id: offerId } });
      if (!before) throw AppError.notFound('DROP_OFFER_NOT_FOUND', 'That offer was not found.');
      if (before.cancelledAt) return offerDto(before);
      const after = await tx.dropOffer.update({ where: { id: offerId }, data: { cancelledAt: new Date() } });
      await AdminAuditService.record(tx, actor, { action: 'drop.offer.cancel', targetType: 'DropOffer', targetId: offerId, reason, before, after });
      return offerDto(after);
    });
  },

  async wallet(prisma: PrismaClient, accountId: string): Promise<AdminCrownWalletDto> {
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, username: true } });
    if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account was not found.');
    const [settings, round] = await Promise.all([DropSettingsService.get(prisma), RoundService.getCurrent(prisma)]);
    const [wallet, history, orders, packOrders] = await Promise.all([
      CrownWalletService.view(prisma, accountId, round?.id ?? null, settings.roundEarnCap),
      CrownWalletService.history(prisma, accountId, 100),
      DropPurchaseService.orders(prisma, accountId, 50),
      CrownPackService.orders(prisma, accountId, 50),
    ]);
    return { accountId, username: account.username, wallet, history, orders, packOrders };
  },

  /** Grants or removes Crowns. At or above the threshold it waits for a second admin. */
  async requestAdjustment(prisma: PrismaClient, actor: AuditActor, accountId: string, delta: number, reasonInput: string): Promise<AdminCrownAdjustmentDto> {
    const reason = requireReason(reasonInput);
    if (!Number.isSafeInteger(delta) || delta === 0 || Math.abs(delta) > MAX_ADJUSTMENT) {
      throw AppError.badRequest('CROWNS_INVALID', `Adjust by a whole, non-zero number of Crowns up to ${MAX_ADJUSTMENT.toLocaleString('en-US')}.`);
    }
    const settings = await DropSettingsService.get(prisma);
    const needsSecond = Math.abs(delta) >= settings.largeAdjustmentThreshold;
    return prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: accountId }, select: { id: true } });
      if (!account) throw AppError.notFound('ACCOUNT_NOT_FOUND', 'That account was not found.');
      let request = await tx.crownAdjustmentRequest.create({
        data: { accountId, delta, reason, requestedById: actor.id, requestedByUsername: actor.username },
      });
      if (!needsSecond) {
        const ledgerEntryId = await applyAdjustment(tx, request, null);
        request = await tx.crownAdjustmentRequest.update({
          where: { id: request.id },
          data: { status: 'APPLIED', ledgerEntryId, decidedById: actor.id, decidedByUsername: actor.username, decidedAt: new Date() },
        });
      }
      await AdminAuditService.record(tx, actor, {
        action: needsSecond ? 'drop.crowns.request' : 'drop.crowns.adjust',
        targetType: 'Account', targetId: accountId, reason, after: request,
      });
      return adjustmentDto(request);
    });
  },

  async decideAdjustment(prisma: PrismaClient, actor: AuditActor, requestId: string, approve: boolean, reasonInput: string): Promise<AdminCrownAdjustmentDto> {
    const reason = requireReason(reasonInput);
    return prisma.$transaction(async (tx) => {
      const before = await tx.crownAdjustmentRequest.findUnique({ where: { id: requestId } });
      if (!before) throw AppError.notFound('CROWN_ADJUSTMENT_NOT_FOUND', 'That request was not found.');
      if (before.status !== 'PENDING') throw AppError.conflict('CROWN_ADJUSTMENT_DECIDED', 'That request was already decided.');
      if (before.requestedById === actor.id) throw AppError.forbidden('A second admin has to approve or reject this request.');
      const decidedAt = new Date();
      const claimed = await tx.crownAdjustmentRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: approve ? 'APPLIED' : 'REJECTED', decidedById: actor.id, decidedByUsername: actor.username, decidedAt },
      });
      if (claimed.count !== 1) throw AppError.conflict('CROWN_ADJUSTMENT_DECIDED', 'That request was already decided.');
      const ledgerEntryId = approve ? await applyAdjustment(tx, before, actor) : null;
      const after = await tx.crownAdjustmentRequest.update({ where: { id: requestId }, data: { ledgerEntryId } });
      await AdminAuditService.record(tx, actor, {
        action: approve ? 'drop.crowns.approve' : 'drop.crowns.reject',
        targetType: 'Account', targetId: before.accountId, reason, before, after,
      });
      return adjustmentDto(after);
    });
  },

  async releaseHold(prisma: PrismaClient, actor: AuditActor, accountId: string, reasonInput: string): Promise<void> {
    const reason = requireReason(reasonInput);
    await prisma.$transaction(async (tx) => {
      const before = await tx.crownWallet.findUnique({ where: { accountId } });
      if (!before?.heldAt) throw AppError.conflict('CROWN_WALLET_NOT_HELD', 'That wallet is not on hold.');
      await CrownWalletService.release(tx, accountId);
      await AdminAuditService.record(tx, actor, { action: 'drop.wallet.release', targetType: 'Account', targetId: accountId, reason, before });
    });
  },

  async reconcilePackOrder(prisma: PrismaClient, actor: AuditActor, orderId: string, reasonInput: string) {
    const reason = requireReason(reasonInput);
    const result = await CrownPackService.reconcile(prisma, orderId);
    await AdminAuditService.record(prisma, actor, {
      action: 'drop.pack.reconcile', targetType: 'CrownPackOrder', targetId: orderId, reason, after: result,
    });
    return result;
  },

  async packOrders(prisma: PrismaClient, status: string | undefined) {
    const rows = await prisma.crownPackOrder.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({ ...packOrderDto(row), accountId: row.accountId, checkoutSessionId: row.checkoutSessionId }));
  },
};
