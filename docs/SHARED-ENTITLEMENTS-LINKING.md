# Shared Entitlements Account Linking

Slice 1 adds the operator-controlled link and one-time import for the shared
beta/main Crown and Drop entitlement store. It does not yet route live Crown
operations through that store; that is the next integration slice.

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
