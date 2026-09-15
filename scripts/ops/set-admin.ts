import 'dotenv/config';
import os from 'node:os';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const USAGE = `Grant or remove the admin flag from the console.

  npm run admin -- <username or email> [--off] [--reason "why"]
  npm run admin -- --list

Examples:
  npm run admin -- AMightyTank
  npm run admin -- someone@example.com --off --reason "stepped down"

The change is written to the admin audit log as a console action.`;

interface Args {
  who: string | null;
  isAdmin: boolean;
  reason: string;
  list: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { who: null, isAdmin: true, reason: '', list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--off' || arg === '--revoke') args.isAdmin = false;
    else if (arg === '--on' || arg === '--grant') args.isAdmin = true;
    else if (arg === '--list') args.list = true;
    else if (arg === '--reason') args.reason = argv[++i] ?? '';
    else if (arg.startsWith('--reason=')) args.reason = arg.slice('--reason='.length);
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else if (args.who === null) args.who = arg;
    else throw new Error(`Unexpected extra argument ${arg}`);
  }
  return args;
}

async function listAdmins(): Promise<void> {
  const admins = await prisma.account.findMany({
    where: { isAdmin: true },
    select: { username: true, email: true, isActive: true, lastLoginAt: true },
    orderBy: { username: 'asc' },
  });
  if (!admins.length) {
    console.log('No admins yet. Make one: npm run admin -- <username>');
    return;
  }
  console.log(`Admins (${admins.length}):`);
  for (const admin of admins) {
    const seen = admin.lastLoginAt ? admin.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : 'never';
    console.log(`- ${admin.username} <${admin.email}> ${admin.isActive ? 'active' : 'INACTIVE'}, last login ${seen}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    await listAdmins();
    return;
  }
  if (!args.who) {
    console.log(USAGE);
    process.exitCode = 1;
    return;
  }

  const needle = args.who.trim().toLowerCase();
  const account = await prisma.account.findFirst({
    where: { OR: [{ usernameNormalized: needle }, { email: needle }] },
    select: { id: true, username: true, email: true, isActive: true, isAdmin: true },
  });

  if (!account) {
    console.error(`No account matches "${args.who}" by username or email.`);
    process.exitCode = 1;
    return;
  }

  if (account.isAdmin === args.isAdmin) {
    console.log(`${account.username} is already ${args.isAdmin ? 'an admin' : 'not an admin'}. Nothing to do.`);
    return;
  }

  if (args.isAdmin && !account.isActive) {
    console.error(`${account.username} is deactivated. Reactivate the account before making them an admin.`);
    process.exitCode = 1;
    return;
  }

  if (!args.isAdmin) {
    const others = await prisma.account.count({ where: { isAdmin: true, isActive: true, id: { not: account.id } } });
    // The console can always put an admin back, so this is a warning rather than a refusal.
    if (others === 0) console.warn(`Warning: ${account.username} is the last active admin. The panel will have no one in it.`);
  }

  const actorUsername = `console:${os.userInfo().username}`;
  await prisma.$transaction(async (tx) => {
    await tx.account.update({ where: { id: account.id }, data: { isAdmin: args.isAdmin } });
    await tx.adminAuditLog.create({
      data: {
        actorAccountId: null,
        actorUsername,
        action: args.isAdmin ? 'account.grant-admin' : 'account.revoke-admin',
        targetType: 'account',
        targetId: account.id,
        reason: args.reason || 'Console command.',
        before: { username: account.username, isAdmin: account.isAdmin },
        after: { username: account.username, isAdmin: args.isAdmin },
      },
    });
  });

  console.log(`${account.username} <${account.email}> is now ${args.isAdmin ? 'an admin' : 'a normal player'}.`);
  console.log(`Logged as ${actorUsername} in the admin audit log.`);
  if (args.isAdmin) console.log('They may need to sign out and back in for the admin menu to appear.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
