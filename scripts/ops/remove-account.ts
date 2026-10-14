import 'dotenv/config';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { normalizeUsername } from '@streets/shared';
import { hashPassword } from '../../apps/server/src/auth/password.js';

const prisma = new PrismaClient();

const USAGE = `Remove an account from the console.

  npm run ops:remove-account -- <username or email> --confirm <exact-username> --reason "why" [--dry-run]

Examples:
  npm run ops:remove-account -- SomePlayer --confirm SomePlayer --reason "player request"
  npm run ops:remove-account -- someone@example.com --confirm SomePlayer --reason "spam account" --dry-run

Rules (same as the admin panel):
  - Admins cannot be deleted. Revoke admin first: npm run admin -- <who> --off
  - Never played a season: row is deleted outright.
  - Played a season: personal/login data is erased and the row becomes a
    "Deleted Player" tombstone so standings, battles and history stay intact.
  - Sessions end immediately. The action is written to the admin audit log
    as a console action. There is no undo.`;

interface Args {
  who: string | null;
  confirm: string | null;
  reason: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { who: null, confirm: null, reason: '', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--confirm') args.confirm = argv[++i] ?? null;
    else if (arg.startsWith('--confirm=')) args.confirm = arg.slice('--confirm='.length);
    else if (arg === '--reason') args.reason = argv[++i] ?? '';
    else if (arg.startsWith('--reason=')) args.reason = arg.slice('--reason='.length);
    else if (arg === '--dry-run' || arg === '--dryRun') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') { console.log(USAGE); process.exit(0); }
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else if (args.who === null) args.who = arg;
    else throw new Error(`Unexpected extra argument ${arg}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.who) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  const needle = args.who.trim().toLowerCase();
  const account = await prisma.account.findFirst({
    where: { OR: [{ usernameNormalized: needle }, { email: needle }] },
  });
  if (!account) {
    console.error(`No account matches "${args.who}" by username or email.`);
    process.exitCode = 1;
    return;
  }

  if (account.isAdmin) {
    console.error(`Refusing: ${account.username} is an admin. Revoke admin first: npm run admin -- ${account.username} --off`);
    process.exitCode = 1;
    return;
  }

  const roundsPlayed = await prisma.roundPlayer.count({ where: { accountId: account.id } });
  const sessions = await prisma.session.count({ where: { accountId: account.id } });
  const mode = roundsPlayed === 0 ? 'deleted' : 'anonymized (Deleted Player tombstone)';
  console.log(`${account.username} <${account.email}> active=${account.isActive} rounds=${roundsPlayed} sessions=${sessions} -> ${mode}`);

  if (args.dryRun) {
    console.log('Dry run: nothing changed. Re-run without --dry-run to delete.');
    return;
  }
  if (!args.reason.trim()) {
    console.error('Refusing: --reason "why" is required (written to the audit log).');
    process.exitCode = 1;
    return;
  }
  if (args.confirm !== account.username) {
    console.error(`Refusing: re-run with --confirm ${account.username} (exact username) to confirm permanent deletion.`);
    process.exitCode = 1;
    return;
  }

  const actorUsername = `console:${os.userInfo().username}`;
  const replacementPasswordHash = await hashPassword(randomBytes(32).toString('base64url'));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(3003)`;
    const before = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
    if (before.isAdmin) throw new Error(`Refusing: ${before.username} is an admin.`);

    const audit = await tx.adminAuditLog.create({
      data: {
        actorAccountId: null,
        actorUsername,
        action: 'account.delete',
        targetType: 'account',
        targetId: before.id,
        reason: args.reason,
        before: { id: before.id, username: before.username, isActive: before.isActive, roundsPlayed },
      },
    });

    await tx.bugReport.updateMany({ where: { accountId: before.id }, data: { username: 'Deleted Player' } });
    await tx.supportTicket.deleteMany({
      where: { OR: [{ accountId: before.id }, ...(before.discordId ? [{ discordId: before.discordId }] : [])] },
    });

    let after: Record<string, unknown>;
    if (roundsPlayed === 0) {
      await tx.account.delete({ where: { id: before.id } });
      after = { id: before.id, mode: 'deleted', roundsPreserved: 0, sessionsRevoked: sessions };
    } else {
      await tx.session.deleteMany({ where: { accountId: before.id } });
      await tx.passwordResetToken.deleteMany({ where: { accountId: before.id } });
      await tx.accountEmailToken.deleteMany({ where: { accountId: before.id } });
      await tx.forumLinkRequest.deleteMany({ where: { accountId: before.id } });
      await tx.forumLink.deleteMany({ where: { accountId: before.id } });
      await tx.notificationOutbox.deleteMany({ where: { accountId: before.id } });
      await tx.notificationSettings.deleteMany({ where: { accountId: before.id } });
      await tx.pushSubscription.deleteMany({ where: { accountId: before.id } });
      await tx.accountProfile.deleteMany({ where: { accountId: before.id } });
      await tx.twoFactorRecoveryCode.deleteMany({ where: { accountId: before.id } });
      await tx.loginChallenge.deleteMany({ where: { accountId: before.id } });
      await tx.trustedDevice.deleteMany({ where: { accountId: before.id } });
      await tx.accountDevice.deleteMany({ where: { accountId: before.id } });
      await tx.accountUsernameChange.deleteMany({ where: { accountId: before.id } });

      const tombstone = {
        username: `deleted_${before.id}`,
        email: `deleted+${before.id}@deleted.streetsempire.invalid`,
      };
      await tx.account.update({
        where: { id: before.id },
        data: {
          username: tombstone.username,
          usernameNormalized: normalizeUsername(tombstone.username),
          email: tombstone.email,
          emailVerifiedAt: null,
          passwordHash: replacementPasswordHash,
          discordId: null,
          discordUsername: null,
          discordAvatar: null,
          discordLinkedAt: null,
          lastLoginAt: null,
          isActive: false,
          isAdmin: false,
          betaApproved: false,
          suspendedUntil: null,
          suspendedReason: null,
          suspendedByUsername: null,
          registeredIp: null,
          twoFactorSecret: null,
          twoFactorPendingSecret: null,
          twoFactorEnabledAt: null,
          twoFactorLastStep: null,
        },
      });
      await tx.roundPlayer.updateMany({ where: { accountId: before.id }, data: { displayName: 'Deleted Player' } });
      after = { id: before.id, username: tombstone.username, mode: 'anonymized', roundsPreserved: roundsPlayed, sessionsRevoked: sessions };
    }

    await tx.adminAuditLog.update({ where: { id: audit.id }, data: { after: after as never } });
  });

  console.log(roundsPlayed === 0
    ? `${account.username} deleted outright (${sessions} session(s) revoked). Logged as ${actorUsername}.`
    : `${account.username} erased to a Deleted Player tombstone (${roundsPlayed} season(s) preserved, ${sessions} session(s) revoked). Logged as ${actorUsername}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
