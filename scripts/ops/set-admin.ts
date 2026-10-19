import 'dotenv/config';
import os from 'node:os';
import { PrismaClient, type StaffRole } from '@prisma/client';

const prisma = new PrismaClient();

const USAGE = `Set or remove a staff role from the console.

  npm run admin -- <username or email> [--role <role>] [--reason "why"]
  npm run admin -- <username or email> --founder [--reason "why"]
  npm run admin -- <username or email> --off [--reason "why"]
  npm run admin -- --list
  npm run admin -- <username or email> --reset-2fa [--reason "why"]
  npm run admin -- <username or email> --approve-beta [--reason "why"]

Roles: admin (the default), mod, jr-mod, helper. --off removes any staff role.

--founder makes the one Founder. It is only ever set here, never from the panel or
Discord, and there can be only one: move it with --off on the current Founder first.

Examples:
  npm run admin -- AMightyTank --founder
  npm run admin -- someone@example.com --role mod --reason "new moderator"
  npm run admin -- someone@example.com --off --reason "stepped down"

--reset-2fa turns off authenticator two-step sign-in (a lost phone, when no other
admin can do it from the panel).

--approve-beta lets an account into an invite-only beta. --off keeps (grants) beta
access too, so taking a staff role away never locks someone out of the beta.

The change is written to the admin audit log as a console action.`;

const ROLE_ARGS: Record<string, StaffRole> = { founder: 'FOUNDER', admin: 'ADMIN', mod: 'MOD', 'jr-mod': 'JR_MOD', helper: 'HELPER' };
const LABELS: Record<StaffRole, string> = { FOUNDER: 'Founder', ADMIN: 'Admin', MOD: 'Mod', JR_MOD: 'JR Mod', HELPER: 'Helper' };

interface Args {
  who: string | null;
  /** Null removes the staff role. */
  role: StaffRole | null;
  reason: string;
  list: boolean;
  resetTwoFactor: boolean;
  approveBeta: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { who: null, role: 'ADMIN', reason: '', list: false, resetTwoFactor: false, approveBeta: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === '--off' || arg === '--revoke') args.role = null;
    else if (arg === '--on' || arg === '--grant') args.role = 'ADMIN';
    else if (arg === '--founder') args.role = 'FOUNDER';
    else if (arg === '--role' || arg.startsWith('--role=')) {
      const value = (arg === '--role' ? argv[++i] ?? '' : arg.slice('--role='.length)).toLowerCase();
      const role = ROLE_ARGS[value];
      if (!role) throw new Error(`Unknown role "${value}". Use one of: ${Object.keys(ROLE_ARGS).join(', ')}.`);
      args.role = role;
    }
    else if (arg === '--list') args.list = true;
    else if (arg === '--reset-2fa') args.resetTwoFactor = true;
    else if (arg === '--approve-beta') args.approveBeta = true;
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
    where: { staffRole: { not: null } },
    select: { username: true, email: true, staffRole: true, isActive: true, lastLoginAt: true, discordId: true, twoFactorEnabledAt: true },
    orderBy: [{ staffRole: 'asc' }, { username: 'asc' }],
  });
  if (!admins.length) {
    console.log('No staff yet. Make the Founder: npm run admin -- <username> --founder');
    return;
  }
  console.log(`Staff (${admins.length}):`);
  for (const admin of admins) {
    const seen = admin.lastLoginAt ? admin.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ') : 'never';
    console.log(`- ${LABELS[admin.staffRole!]}: ${admin.username} <${admin.email}> ${admin.isActive ? 'active' : 'INACTIVE'}, ${admin.discordId ? 'Discord linked' : 'no Discord'}, ${admin.twoFactorEnabledAt ? 'authenticator on' : 'no authenticator'}${!admin.discordId && !admin.twoFactorEnabledAt ? ' (NO SECOND FACTOR)' : ''}, last login ${seen}`);
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
    select: { id: true, username: true, email: true, isActive: true, staffRole: true, betaApproved: true, discordId: true, twoFactorEnabledAt: true },
  });

  if (!account) {
    console.error(`No account matches "${args.who}" by username or email.`);
    process.exitCode = 1;
    return;
  }

  if (args.resetTwoFactor) {
    const actor = `console:${os.userInfo().username}`;
    await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: { twoFactorSecret: null, twoFactorPendingSecret: null, twoFactorEnabledAt: null, twoFactorLastStep: null },
      });
      await tx.twoFactorRecoveryCode.deleteMany({ where: { accountId: account.id } });
      await tx.loginChallenge.deleteMany({ where: { accountId: account.id } });
      await tx.trustedDevice.deleteMany({ where: { accountId: account.id } });
      await tx.session.updateMany({ where: { accountId: account.id }, data: { twoFactor: false } });
      await tx.session.updateMany({ where: { accountId: account.id, method: { not: 'DISCORD' } }, data: { secondFactorAt: null } });
      await tx.adminAuditLog.create({
        data: {
          actorAccountId: null, actorUsername: actor, action: 'account.reset-2fa', targetType: 'account', targetId: account.id,
          reason: args.reason || 'Console command.', before: { twoFactor: Boolean(account.twoFactorEnabledAt) }, after: { twoFactor: false },
        },
      });
    });
    console.log(`Two-step sign-in is off for ${account.username}. They can sign in with their password (or Discord) and set it up again.`);
    return;
  }

  if (args.approveBeta) {
    if (account.betaApproved) {
      console.log(`${account.username} is already approved for the beta. Nothing to do.`);
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id: account.id }, data: { betaApproved: true } });
      await tx.adminAuditLog.create({
        data: {
          actorAccountId: null, actorUsername: `console:${os.userInfo().username}`, action: 'account.approve-beta',
          targetType: 'account', targetId: account.id, reason: args.reason || 'Console command.',
          before: { betaApproved: false }, after: { betaApproved: true },
        },
      });
    });
    console.log(`${account.username} can now sign in to the invite-only beta.`);
    return;
  }

  const role = args.role;
  const describe = (value: StaffRole | null) => (value ? LABELS[value] : 'a normal player');
  if (account.staffRole === role) {
    console.log(`${account.username} is already ${describe(role)}. Nothing to do.`);
    return;
  }

  if (role && !account.isActive) {
    console.error(`${account.username} is deactivated. Reactivate the account before giving them a staff role.`);
    process.exitCode = 1;
    return;
  }

  if (role === 'FOUNDER') {
    const founder = await prisma.account.findFirst({ where: { staffRole: 'FOUNDER' }, select: { username: true } });
    if (founder) {
      console.error(`${founder.username} is already the Founder. There is only one: run --off on them first.`);
      process.exitCode = 1;
      return;
    }
  }

  const adminLevel = (value: StaffRole | null) => value === 'FOUNDER' || value === 'ADMIN';
  if (adminLevel(account.staffRole) && !adminLevel(role)) {
    const others = await prisma.account.count({ where: { isAdmin: true, isActive: true, id: { not: account.id } } });
    // The console can always put an admin back, so this is a warning rather than a refusal.
    if (others === 0) console.warn(`Warning: ${account.username} is the last active admin. The panel will have no one in it.`);
  }

  const actorUsername = `console:${os.userInfo().username}`;
  const reason = args.reason || 'Console command.';
  await prisma.$transaction(async (tx) => {
    // Taking the role away keeps them in an invite-only beta (staff never needed approval).
    await tx.account.update({ where: { id: account.id }, data: role ? { staffRole: role } : { staffRole: null, betaApproved: true } });
    await tx.staffRoleChange.create({
      data: {
        accountId: account.id,
        username: account.username,
        actorAccountId: null,
        actorUsername,
        fromRole: account.staffRole,
        toRole: role,
        reason,
        source: 'CONSOLE',
      },
    });
    await tx.adminAuditLog.create({
      data: {
        actorAccountId: null,
        actorUsername,
        action: 'account.staff-role',
        targetType: 'account',
        targetId: account.id,
        reason,
        before: { username: account.username, staffRole: account.staffRole },
        after: { username: account.username, staffRole: role, ...(role ? {} : { betaApproved: true }), source: 'CONSOLE' },
      },
    });
  });

  console.log(`${account.username} <${account.email}> is now ${describe(role)}.`);
  if (!role && !account.betaApproved) console.log('Beta access kept: they are approved for the invite-only beta, so they can still sign in.');
  console.log(`Logged as ${actorUsername} in the admin audit log and the staff role history.`);
  if (role) {
    console.log('They may need to sign out and back in for the admin menu to appear.');
    // rc.2/rc.3: with REQUIRE_ADMIN_2FA on (the default in production and beta), admin
    // tools answer only a Discord or authenticator sign-in, and a password-only staff session cannot add either.
    if (!account.discordId && !account.twoFactorEnabledAt) {
      console.warn('No second factor yet. Admin tools need a sign-in with Discord or with an authenticator code.');
      console.warn('Easiest: they use "Sign in with Discord" with a Discord account on the same verified email, which links it.');
      console.warn('Otherwise run this with --off, have them link Discord or turn on two-step sign-in in Account settings,');
      console.warn('then give the role again.');
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
