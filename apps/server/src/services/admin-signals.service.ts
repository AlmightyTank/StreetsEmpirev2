import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AdminApiAbuseDto, AdminSignalClusterDto, AdminSignalsDto, AdminSignalTransferDto } from '@streets/shared';
import { apiAbuse, type ApiAbuseRow } from './api-abuse.service.js';
import { env } from '../config/env.js';
import { deviceLabel } from './admin-account.service.js';

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;
const CREATED_TOGETHER_MS = 30 * 60_000;
/** Local development traffic all comes from here, so it would link every account. */
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

interface Sighting {
  accountId: string;
  ip: string;
  userAgent: string | null;
  at: Date;
}

/**
 * An opaque label for a match, stable on this server, that never reveals the
 * address or browser string it came from.
 */
export function matchKey(kind: string, value: string, secret = env.SESSION_SECRET): string {
  return createHash('sha256').update(`${secret}:${kind}:${value}`).digest('hex').slice(0, 10);
}

/**
 * Accounts seen from the same network, strengthened when they also share an
 * exact browser or were created within half an hour of each other. Signals
 * only: nothing here acts on an account.
 */
export function buildClusters(
  sightings: Sighting[],
  accounts: Map<string, { id: string; username: string; isActive: boolean; isAdmin: boolean; createdAt: Date; lastLoginAt: Date | null }>,
  secret = env.SESSION_SECRET,
): AdminSignalClusterDto[] {
  const byNetwork = new Map<string, Sighting[]>();
  for (const sighting of sightings) {
    if (LOOPBACK.has(sighting.ip)) continue;
    byNetwork.set(sighting.ip, [...(byNetwork.get(sighting.ip) ?? []), sighting]);
  }

  const clusters: AdminSignalClusterDto[] = [];
  for (const [ip, rows] of byNetwork) {
    const accountIds = [...new Set(rows.map((row) => row.accountId))].filter((id) => accounts.has(id));
    if (accountIds.length < 2) continue;

    const agentsByAccount = new Map(accountIds.map((id) => [id, new Set(rows.filter((row) => row.accountId === id && row.userAgent).map((row) => row.userAgent!))]));
    const sameDevice = accountIds.some((id, index) => accountIds.slice(index + 1).some((other) =>
      [...agentsByAccount.get(id)!].some((agent) => agentsByAccount.get(other)!.has(agent))));
    const created = accountIds.map((id) => accounts.get(id)!.createdAt.getTime()).sort((a, b) => a - b);
    const createdTogether = created.some((time, index) => index > 0 && time - created[index - 1]! <= CREATED_TOGETHER_MS);

    const signals: AdminSignalClusterDto['signals'] = ['shared-network'];
    if (sameDevice) signals.push('same-device');
    if (createdTogether) signals.push('created-together');

    clusters.push({
      key: matchKey('network', ip, secret),
      signals,
      firstSeenAt: new Date(Math.min(...rows.map((row) => row.at.getTime()))).toISOString(),
      lastSeenAt: new Date(Math.max(...rows.map((row) => row.at.getTime()))).toISOString(),
      accounts: accountIds.map((id) => {
        const account = accounts.get(id)!;
        const latest = rows.filter((row) => row.accountId === id).sort((a, b) => b.at.getTime() - a.at.getTime())[0]!;
        return {
          id: account.id,
          username: account.username,
          isActive: account.isActive,
          isAdmin: account.isAdmin,
          createdAt: account.createdAt.toISOString(),
          lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
          device: deviceLabel(latest.userAgent),
          sightings: rows.filter((row) => row.accountId === id).length,
        };
      }).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    });
  }

  return clusters.sort((a, b) => b.signals.length - a.signals.length || b.accounts.length - a.accounts.length || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

/**
 * 0.5.0-E. Whether two accounts have been seen on the same real network in the signal
 * window: a hijack between them would be a way to move goods from one to the other.
 * Local development traffic never counts.
 */
export async function accountsShareNetwork(prisma: Pick<PrismaClient, 'session'>, accountA: string, accountB: string, now = new Date()): Promise<boolean> {
  if (accountA === accountB) return true;
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const rows = await prisma.session.findMany({
    where: { accountId: { in: [accountA, accountB] }, ip: { not: null }, OR: [{ lastSeenAt: { gte: since } }, { createdAt: { gte: since } }] },
    select: { accountId: true, ip: true },
  });
  const seen = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.ip || LOOPBACK.has(row.ip)) continue;
    seen.set(row.ip, (seen.get(row.ip) ?? new Set()).add(row.accountId));
  }
  return [...seen.values()].some((accounts) => accounts.size > 1);
}

const MARKET_PAIR_MS = 60 * 60_000;

export interface MarketTrade {
  accountId: string;
  displayName: string;
  city: string;
  productKey: string;
  direction: string;
  totalCents: bigint;
  at: Date;
}

/**
 * 1.0.0-C. One account selling a product on a city's high market and another in
 * the same match buying it there within the hour (or the reverse): the simplest
 * way to walk a price for a partner or launder cash through the market.
 */
export function marketPairs(trades: MarketTrade[], accountIds: Set<string>): AdminSignalTransferDto[] {
  const inside = trades.filter((trade) => accountIds.has(trade.accountId)).sort((a, b) => a.at.getTime() - b.at.getTime());
  const pairs: AdminSignalTransferDto[] = [];
  const used = new Set<MarketTrade>();
  for (const [index, first] of inside.entries()) {
    if (used.has(first)) continue;
    const match = inside.slice(index + 1).find((other) => !used.has(other)
      && other.accountId !== first.accountId
      && other.city === first.city
      && other.productKey === first.productKey
      && other.direction !== first.direction
      && other.at.getTime() - first.at.getTime() <= MARKET_PAIR_MS);
    if (!match) continue;
    used.add(first).add(match);
    const seller = first.direction === 'sell' ? first : match;
    const buyer = seller === first ? match : first;
    pairs.push({ kind: 'MARKET_PAIR', from: seller.displayName, to: buyer.displayName, at: match.at.toISOString(), cashCents: Number(buyer.totalCents), voided: false });
  }
  return pairs;
}

export function apiAbuseDto(rows: ApiAbuseRow[], usernames: Map<string, string>, secret = env.SESSION_SECRET): AdminApiAbuseDto[] {
  return rows.map((row) => ({
    account: row.accountId ? { id: row.accountId, username: usernames.get(row.accountId) ?? 'deleted account' } : null,
    networkKey: row.accountId || !row.ip ? null : matchKey('network', row.ip, secret),
    refused: row.refused,
    buckets: row.buckets,
    firstAt: row.firstAt.toISOString(),
    lastAt: row.lastAt.toISOString(),
  }));
}

export const AdminSignalsService = {
  /** Built from sessions and email/password tokens of the last 30 days, the only places the game keeps an address. */
  async clusters(prisma: PrismaClient, now = new Date()): Promise<AdminSignalsDto> {
    const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
    const [sessions, emailTokens, resetTokens] = await Promise.all([
      prisma.session.findMany({
        where: { OR: [{ lastSeenAt: { gte: since } }, { createdAt: { gte: since } }], ip: { not: null } },
        select: { accountId: true, ip: true, userAgent: true, lastSeenAt: true },
      }),
      prisma.accountEmailToken.findMany({
        where: { createdAt: { gte: since }, ip: { not: null }, NOT: { ip: 'admin-panel' } },
        select: { accountId: true, ip: true, userAgent: true, createdAt: true },
      }),
      prisma.passwordResetToken.findMany({
        where: { createdAt: { gte: since }, ip: { not: null } },
        select: { accountId: true, ip: true, userAgent: true, createdAt: true },
      }),
    ]);

    const sightings: Sighting[] = [
      ...sessions.map((row) => ({ accountId: row.accountId, ip: row.ip!, userAgent: row.userAgent, at: row.lastSeenAt })),
      ...emailTokens.map((row) => ({ accountId: row.accountId, ip: row.ip!, userAgent: row.userAgent, at: row.createdAt })),
      ...resetTokens.map((row) => ({ accountId: row.accountId, ip: row.ip!, userAgent: row.userAgent, at: row.createdAt })),
    ];
    const accountRows = await prisma.account.findMany({
      where: { id: { in: [...new Set(sightings.map((row) => row.accountId))] } },
      select: { id: true, username: true, isActive: true, isAdmin: true, createdAt: true, lastLoginAt: true },
    });

    const clusters = buildClusters(sightings, new Map(accountRows.map((row) => [row.id, row])));
    // 0.5.0-E: hits between linked accounts are refused, but any that landed before the link showed are listed.
    const linkedIds = [...new Set(clusters.flatMap((cluster) => cluster.accounts.map((account) => account.id)))];
    const hits = linkedIds.length ? await prisma.convoyTail.findMany({
      where: { status: 'LANDED', startedAt: { gte: since }, attacker: { accountId: { in: linkedIds } }, owner: { accountId: { in: linkedIds } } },
      select: { id: true, landsAt: true, voidedAt: true, attacker: { select: { accountId: true, displayName: true } }, owner: { select: { accountId: true, displayName: true } } },
    }) : [];
    // 1.0.0-C: every other way value can move between accounts, and alliances they share.
    const between = { accountId: { in: linkedIds } };
    const [battles, pushes, taxes, members, trades] = linkedIds.length ? await Promise.all([
      prisma.raidBattle.findMany({
        where: { createdAt: { gte: since }, attacker: between, defender: between },
        select: { kind: true, createdAt: true, voidedAt: true, attacker: { select: { accountId: true, displayName: true } }, defender: { select: { accountId: true, displayName: true } } },
      }),
      prisma.turfPush.findMany({
        where: { startedAt: { gte: since }, attacker: between, defender: between },
        select: { startedAt: true, attacker: { select: { accountId: true, displayName: true } }, defender: { select: { accountId: true, displayName: true } } },
      }),
      prisma.turfTaxLedger.findMany({
        where: { day: { gte: new Date(since.getTime() - DAY_MS) }, payer: between, holder: between, mintedCents: { gt: 0n } },
        select: { day: true, mintedCents: true, payer: { select: { accountId: true, displayName: true } }, holder: { select: { accountId: true, displayName: true } } },
      }),
      prisma.roundPlayer.findMany({
        where: { ...between, allianceId: { not: null }, round: { status: 'ACTIVE' } },
        select: { accountId: true, displayName: true, alliance: { select: { id: true, tag: true, name: true } } },
      }),
      prisma.runTrade.findMany({
        where: { venue: 'market', createdAt: { gte: since }, run: { roundPlayer: between } },
        select: { city: true, productKey: true, direction: true, totalCents: true, createdAt: true, run: { select: { roundPlayer: { select: { accountId: true, displayName: true } } } } },
      }),
    ]) : [[], [], [], [], []];
    const marketTrades: MarketTrade[] = trades.map((trade) => ({
      accountId: trade.run.roundPlayer.accountId, displayName: trade.run.roundPlayer.displayName,
      city: trade.city, productKey: trade.productKey, direction: trade.direction, totalCents: trade.totalCents, at: trade.createdAt,
    }));

    for (const cluster of clusters) {
      const ids = new Set(cluster.accounts.map((account) => account.id));
      const both = (a: string, b: string) => ids.has(a) && ids.has(b);
      const inside = hits.filter((hit) => both(hit.attacker.accountId, hit.owner.accountId));
      if (inside.length) cluster.convoyHits = inside.map((hit) => ({ tailId: hit.id, attacker: hit.attacker.displayName, owner: hit.owner.displayName, at: hit.landsAt.toISOString(), voided: hit.voidedAt !== null }));

      const transfers: AdminSignalTransferDto[] = [
        ...battles.filter((row) => both(row.attacker.accountId, row.defender.accountId)).map((row) => ({
          kind: row.kind === 'RAID' ? 'RAID' as const : row.kind === 'DRIVE_BY' ? 'DRIVE_BY' as const : 'SPECIAL' as const,
          from: row.defender.displayName, to: row.attacker.displayName, at: row.createdAt.toISOString(), cashCents: null, voided: row.voidedAt !== null,
        })),
        ...pushes.filter((row) => both(row.attacker.accountId, row.defender.accountId)).map((row) => ({
          kind: 'TURF_PUSH' as const, from: row.defender.displayName, to: row.attacker.displayName, at: row.startedAt.toISOString(), cashCents: null, voided: false,
        })),
        ...taxes.filter((row) => both(row.payer.accountId, row.holder.accountId)).map((row) => ({
          kind: 'TURF_TAX' as const, from: row.payer.displayName, to: row.holder.displayName, at: row.day.toISOString(), cashCents: Number(row.mintedCents), voided: false,
        })),
        ...marketPairs(marketTrades, ids),
      ].sort((a, b) => b.at.localeCompare(a.at));
      if (transfers.length) cluster.transfers = transfers;
      if (inside.length || transfers.some((row) => row.kind !== 'MARKET_PAIR')) cluster.signals.push('value-between');
      if (transfers.some((row) => row.kind === 'MARKET_PAIR')) cluster.signals.push('market-pairing');

      const byAlliance = new Map<string, { tag: string; name: string; members: Set<string> }>();
      for (const member of members) {
        if (!member.alliance || !ids.has(member.accountId)) continue;
        const entry = byAlliance.get(member.alliance.id) ?? { tag: member.alliance.tag, name: member.alliance.name, members: new Set<string>() };
        entry.members.add(member.displayName);
        byAlliance.set(member.alliance.id, entry);
      }
      const shared = [...byAlliance.values()].filter((entry) => entry.members.size > 1);
      if (shared.length) {
        cluster.alliances = shared.map((entry) => ({ tag: entry.tag, name: entry.name, members: [...entry.members].sort() }));
        cluster.signals.push('same-alliance');
      }
    }

    const abuse = apiAbuse.list();
    const abuseAccounts = abuse.flatMap((row) => row.accountId ? [row.accountId] : []);
    const usernames = abuseAccounts.length
      ? new Map((await prisma.account.findMany({ where: { id: { in: abuseAccounts } }, select: { id: true, username: true } })).map((row) => [row.id, row.username]))
      : new Map<string, string>();

    return {
      windowDays: WINDOW_DAYS,
      generatedAt: now.toISOString(),
      clusters: clusters.sort((a, b) => b.signals.length - a.signals.length || b.accounts.length - a.accounts.length || b.lastSeenAt.localeCompare(a.lastSeenAt)),
      apiAbuse: apiAbuseDto(abuse, usernames),
    };
  },
};
