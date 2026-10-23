import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { snapshotLegacyEntitlements, legacyCrownImportRef } from '../../apps/server/src/services/shared-entitlement-import.js';

type Environment = 'beta' | 'production';

const usage = `Link verified beta and main accounts and import their existing Crowns and Drop unlocks.

  BETA_DATABASE_URL=... MAIN_DATABASE_URL=... ENTITLEMENT_DATABASE_URL=... \\
    npm run ops:link-shared-entitlements -- --beta-account <id> --main-account <id> --confirm

This is an operator-only, one-time migration. Without --confirm it only prints a
preview. Verify that both account IDs belong to the same player, then rerun with
--confirm to write. It does not copy passwords, email, round state, non-Drop
cosmetics, or other gameplay data.`;

function valueAfter(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  return argv[index + 1];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    return;
  }
  const betaAccountId = valueAfter(argv, '--beta-account');
  const mainAccountId = valueAfter(argv, '--main-account');
  if (!betaAccountId || !mainAccountId) throw new Error(usage);
  const confirm = argv.includes('--confirm');
  const dryRun = argv.includes('--dry-run');

  const urls: Record<Environment, string> = {
    beta: process.env.BETA_DATABASE_URL ?? '',
    production: process.env.MAIN_DATABASE_URL ?? '',
  };
  const sharedUrl = process.env.ENTITLEMENT_DATABASE_URL ?? '';
  if (!urls.beta || !urls.production || !sharedUrl) {
    throw new Error('Set BETA_DATABASE_URL, MAIN_DATABASE_URL, and ENTITLEMENT_DATABASE_URL in the environment.');
  }

  const clients = {
    beta: new PrismaClient({ datasources: { db: { url: urls.beta } } }),
    production: new PrismaClient({ datasources: { db: { url: urls.production } } }),
    shared: new PrismaClient({ datasources: { db: { url: sharedUrl } } }),
  };
  try {
    const [betaAccount, mainAccount] = await Promise.all([
      clients.beta.account.findUnique({ where: { id: betaAccountId }, select: { id: true, username: true } }),
      clients.production.account.findUnique({ where: { id: mainAccountId }, select: { id: true, username: true } }),
    ]);
    if (!betaAccount) throw new Error(`No beta account found for id ${betaAccountId}.`);
    if (!mainAccount) throw new Error(`No main account found for id ${mainAccountId}.`);
    console.log(`Beta: ${betaAccount.username} (${betaAccount.id})`);
    console.log(`Main: ${mainAccount.username} (${mainAccount.id})`);

    const [betaWallet, mainWallet, betaUnlocks, mainUnlocks] = await Promise.all([
      clients.beta.crownWallet.findUnique({ where: { accountId: betaAccountId }, select: { balance: true, heldAt: true, holdReason: true } }),
      clients.production.crownWallet.findUnique({ where: { accountId: mainAccountId }, select: { balance: true, heldAt: true, holdReason: true } }),
      clients.beta.accountCosmeticUnlock.findMany({ where: { accountId: betaAccountId }, select: { key: true, kind: true, title: true, description: true, rarity: true, styleKey: true, sourceQuestKey: true, awardedAt: true } }),
      clients.production.accountCosmeticUnlock.findMany({ where: { accountId: mainAccountId }, select: { key: true, kind: true, title: true, description: true, rarity: true, styleKey: true, sourceQuestKey: true, awardedAt: true } }),
    ]);
    const snapshots = [
      snapshotLegacyEntitlements('beta', betaAccountId, betaWallet, betaUnlocks),
      snapshotLegacyEntitlements('production', mainAccountId, mainWallet, mainUnlocks),
    ];
    const totalBalance = snapshots.reduce((sum, row) => sum + row.balance, 0);
    const totalUnlocks = snapshots.reduce((sum, row) => sum + row.unlocks.length, 0);
    console.log(`Preview: ${totalBalance} Crowns and ${totalUnlocks} Drop unlock records will be imported.`);
    if (dryRun || !confirm) {
      console.log('No changes made. Review the account IDs and ownership, then rerun with --confirm.');
      return;
    }
    const identityKey = `linked:${randomUUID()}`;

    await clients.shared.$transaction(async (tx) => {
      const account = await tx.sharedEntitlementAccount.create({ data: { identityKey } });
      for (const snapshot of snapshots) {
        const existing = await tx.sharedEntitlementLink.findUnique({
          where: { environment_localAccountId: { environment: snapshot.environment, localAccountId: snapshot.localAccountId } },
        });
        if (existing) throw new Error(`${snapshot.environment} account is already linked; refusing to move or merge its entitlements.`);
        await tx.sharedEntitlementLink.create({ data: { accountId: account.id, environment: snapshot.environment, localAccountId: snapshot.localAccountId } });
      }

      await tx.sharedCrownWallet.create({ data: { accountId: account.id } });
      for (const snapshot of snapshots) {
        const importRef = legacyCrownImportRef(snapshot);
        const imported = await tx.sharedCrownLedgerEntry.findUnique({ where: { externalRef: importRef }, select: { id: true } });
        if (!imported && snapshot.balance > 0) {
          const wallet = await tx.sharedCrownWallet.findUniqueOrThrow({ where: { accountId: account.id } });
          const balance = wallet.balance + snapshot.balance;
          if (!Number.isSafeInteger(balance)) throw new Error('Combined Crown balance exceeds the safe integer limit.');
          await tx.sharedCrownWallet.update({ where: { accountId: account.id }, data: { balance, version: { increment: 1 } } });
          await tx.sharedCrownLedgerEntry.create({
            data: {
              accountId: account.id,
              kind: 'ADJUSTMENT',
              delta: snapshot.balance,
              balanceAfter: balance,
              source: 'legacy-import',
              externalRef: importRef,
              environment: snapshot.environment,
              localAccountId: snapshot.localAccountId,
              reason: `Imported existing ${snapshot.environment === 'beta' ? 'beta' : 'main'} Crown balance.`,
            },
          });
        }
        if (snapshot.heldAt) {
          await tx.sharedCrownWallet.update({
            where: { accountId: account.id },
            data: { heldAt: snapshot.heldAt, holdReason: snapshot.holdReason ?? 'Imported wallet hold; review before releasing.' },
          });
        }
        for (const unlock of snapshot.unlocks) {
          await tx.sharedCosmeticUnlock.upsert({
            where: { accountId_key: { accountId: account.id, key: unlock.key } },
            create: {
              accountId: account.id,
              key: unlock.key,
              kind: unlock.kind,
              title: unlock.title,
              description: unlock.description,
              rarity: unlock.rarity,
              styleKey: unlock.styleKey,
              source: 'legacy-import',
              environment: snapshot.environment,
              localAccountId: snapshot.localAccountId,
              awardedAt: unlock.awardedAt,
            },
            update: {},
          });
        }
      }
    });

    console.log(`Linked both accounts and imported ${totalBalance} Crowns plus ${totalUnlocks} Drop unlock records.`);
    console.log('This migration is complete. Keep the generated shared identity internal; do not use usernames or email as identity keys.');
  } finally {
    await Promise.all(Object.values(clients).map((client) => client.$disconnect()));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
