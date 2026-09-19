import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { AdminSignalClusterDto, AdminSignalsDto } from '@streets/shared';
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
    for (const cluster of clusters) {
      const ids = new Set(cluster.accounts.map((account) => account.id));
      const inside = hits.filter((hit) => ids.has(hit.attacker.accountId) && ids.has(hit.owner.accountId));
      if (inside.length) cluster.convoyHits = inside.map((hit) => ({ tailId: hit.id, attacker: hit.attacker.displayName, owner: hit.owner.displayName, at: hit.landsAt.toISOString(), voided: hit.voidedAt !== null }));
    }
    return { windowDays: WINDOW_DAYS, generatedAt: now.toISOString(), clusters };
  },
};
