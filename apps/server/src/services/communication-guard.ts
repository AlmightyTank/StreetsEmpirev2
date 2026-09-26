import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

type Tx = Prisma.TransactionClient;

/**
 * 0.9.0-H. The rules every player-to-player message passes, beyond the B1 send
 * floor, window limit and duplicate check.
 *
 * - Communication mutes (admin) stop private messages and wire posts entirely.
 * - New accounts get a tighter window, fewer cold recipients, and no links.
 * - Everyone has a cap on how many players they can cold-message in an hour.
 *   Replying to someone who wrote to you first is never throttled.
 * - Links from established accounts and copy-paste blasts are allowed but flagged
 *   into the admin report queue automatically.
 */
export const NEW_ACCOUNT_HOURS = 48;
export const NEW_ACCOUNT_WINDOW_MAX = 5;
export const COLD_RECIPIENT_WINDOW_MS = 60 * 60_000;
export const NEW_ACCOUNT_COLD_RECIPIENTS = 3;
export const COLD_RECIPIENTS = 10;
export const BLAST_RECIPIENTS = 3;

/** Web addresses, bare domains on common TLDs, and chat invites. The game's own sites are fine. */
const LINK_PATTERN = /\b(?:https?:\/\/|www\.)[^\s]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|gg|xyz|ru|ly|me|co|app|link|info|biz|site|online|shop|top|tk|cc)\b(?:\/[^\s]*)?|discord(?:app)?\.(?:gg|com)\/invite/gi;

function ownHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const origin of [env.frontendOrigin, env.forum.origin]) {
    try {
      if (origin) hosts.add(new URL(origin).hostname.replace(/^www\./, '').toLowerCase());
    } catch {
      // A misconfigured origin just means no exemption.
    }
  }
  return hosts;
}

/** Links in a message that point anywhere but StreetsEmpire itself. */
export function foreignLinks(text: string, allowed: Set<string> = ownHosts()): string[] {
  const found = text.match(LINK_PATTERN) ?? [];
  return found.filter((link) => {
    const host = link.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#:]/)[0]!.toLowerCase();
    return ![...allowed].some((own) => host === own || host.endsWith(`.${own}`));
  });
}

export function isNewAccount(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() < NEW_ACCOUNT_HOURS * 3_600_000;
}

export interface CommsMuteState {
  commsMutedUntil: Date | null;
  commsMutedPermanent: boolean;
}

export function commsMuted(account: CommsMuteState, now: Date): boolean {
  return account.commsMutedPermanent || Boolean(account.commsMutedUntil && account.commsMutedUntil > now);
}

/** Throws when an admin has restricted this account's communication. */
export async function assertCanCommunicate(tx: Tx, accountId: string, now: Date): Promise<{ createdAt: Date }> {
  const account = await tx.account.findUniqueOrThrow({
    where: { id: accountId },
    select: { createdAt: true, commsMutedUntil: true, commsMutedPermanent: true },
  });
  if (commsMuted(account, now)) {
    throw new AppError(
      403,
      'COMMS_MUTED',
      account.commsMutedPermanent
        ? 'Your messaging has been switched off by a moderator.'
        : `A moderator has paused your messaging until ${account.commsMutedUntil!.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
    );
  }
  return { createdAt: account.createdAt };
}

/**
 * The 0.9.0-H send checks that need history. Returns the reasons to auto-flag the
 * message once it is written; throws for anything that should not be sent at all.
 */
export async function checkDirectMessage(
  tx: Tx,
  input: {
    senderPlayerId: string;
    recipientPlayerId: string;
    senderCreatedAt: Date;
    body: string;
    subject: string;
    recentCount: number;
  },
  now: Date,
): Promise<string[]> {
  const fresh = isNewAccount(input.senderCreatedAt, now);
  const links = foreignLinks(`${input.subject} ${input.body}`);

  if (fresh && input.recentCount >= NEW_ACCOUNT_WINDOW_MAX) {
    throw AppError.tooManyRequests('MESSAGE_NEW_ACCOUNT_LIMIT', 'New accounts can send a few messages at a time. Try again in a few minutes.');
  }
  if (fresh && links.length) {
    throw AppError.badRequest('MESSAGE_LINKS_NEW_ACCOUNT', 'New accounts cannot send links yet. Send it without the link.');
  }

  const since = new Date(now.getTime() - COLD_RECIPIENT_WINDOW_MS);
  const [repliedBy, recent] = await Promise.all([
    // Anyone who has written to the sender this round is a conversation, not cold outreach.
    tx.directMessage.findMany({
      where: { recipientId: input.senderPlayerId },
      distinct: ['senderId'],
      select: { senderId: true },
    }),
    tx.directMessage.findMany({
      where: { senderId: input.senderPlayerId, createdAt: { gte: since } },
      select: { recipientId: true, body: true },
    }),
  ]);
  const conversations = new Set(repliedBy.map((row) => row.senderId));
  const coldRecipients = new Set(recent.map((row) => row.recipientId).filter((id) => !conversations.has(id)));
  const isCold = !conversations.has(input.recipientPlayerId) && !coldRecipients.has(input.recipientPlayerId);
  const cap = fresh ? NEW_ACCOUNT_COLD_RECIPIENTS : COLD_RECIPIENTS;
  if (isCold && coldRecipients.size >= cap) {
    throw AppError.tooManyRequests('MESSAGE_RECIPIENT_LIMIT', 'You have messaged a lot of new players this hour. Try again later, or reply to people who wrote to you.');
  }

  const flags: string[] = [];
  if (links.length) flags.push(`Contains a link: ${links.slice(0, 3).join(', ')}`.slice(0, 300));
  const sameBody = new Set(recent.filter((row) => row.body === input.body).map((row) => row.recipientId));
  sameBody.add(input.recipientPlayerId);
  if (sameBody.size >= BLAST_RECIPIENTS) flags.push(`Same message sent to ${sameBody.size} players within an hour`);
  return flags;
}

/** One automated flag per message, however many reasons it has. */
export async function flagMessage(tx: Tx, messageId: string, reasons: string[], now: Date): Promise<void> {
  if (!reasons.length) return;
  const existing = await tx.playerMessageReport.findFirst({ where: { messageId, source: 'AUTO' }, select: { id: true } });
  if (existing) return;
  await tx.playerMessageReport.create({
    data: { messageId, source: 'AUTO', reporterAccountId: null, reason: reasons.join(' · ').slice(0, 500), createdAt: now },
  });
}
