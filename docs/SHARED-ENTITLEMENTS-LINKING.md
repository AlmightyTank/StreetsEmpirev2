# Shared Entitlements Account Linking

Slice 1 adds the operator-controlled link and one-time import for the shared
beta/main Crown and Drop entitlement store. Slice 2 routes wallet and Drop
ownership reads through the canonical store and charges Drop purchases there.

## Safety rules

- Verify that the beta and main account IDs belong to the same player before
  linking them. The command intentionally does not infer identity from email,
  username, or matching account IDs.
- Back up both game databases and the entitlement database before the first
  production use.
- Apply the shared-entitlements Prisma migration to the shared database first.
- The command imports each account's current Crown balance and Drop-sourced
  cosmetic unlocks. It does not copy round state, passwords, email, or other
  cosmetic rewards.
- An account already linked to any shared identity is rejected. The command
  will not merge or relink it.

## Run

Provide database connection strings through the environment, not command-line
arguments, so credentials do not appear in shell history:

```bash
export BETA_DATABASE_URL='postgresql://...'
export MAIN_DATABASE_URL='postgresql://...'
export ENTITLEMENT_DATABASE_URL='postgresql://...'
npm run ops:link-shared-entitlements -- \
  --beta-account '<beta-account-id>' \
  --main-account '<main-account-id>'
```

Without `--confirm`, the command is a dry run: it prints the matched usernames,
IDs, and total Crowns/Drop unlock count without writing. Verify both accounts
belong to the same player, then rerun the exact command with `--confirm`. The
generated shared identity key is random and contains no personal information.
The imports and both environment links are written in one transaction to the
shared store. An error rolls back the shared-store changes.

## Verification

After success, inspect the shared database for exactly two
`SharedEntitlementLink` rows (one `beta`, one `production`), one shared wallet,
and the union of Drop unlock keys. Each non-zero source balance has a
`SharedCrownLedgerEntry` with a stable `legacy-import:<environment>:<accountId>`
reference, so the amount is recorded once.

## Runtime behavior

Set `SHARED_ENTITLEMENTS_ENABLED=true` and `ENTITLEMENT_DATABASE_URL` on both
beta and production after both deployments have the shared schema. Signed-in
wallet and Drop catalog requests resolve the explicit environment/account link;
unlinked accounts receive `SHARED_ENTITLEMENT_LINK_REQUIRED`. The wallet
balance/history, Drop ownership, and Drop purchase debit then use the shared
database. Shared Drop unlocks are copied idempotently into each local account
unlock table so existing equip and collection checks continue to work.

Other Crown earning and pack billing paths still write the environment-local
Crown ledger. They need a follow-up integration before Crown gains from play
or Crown pack purchases made in one environment appear in the other. Keep
shared mode disabled until that integration and the production account linking
are complete.
