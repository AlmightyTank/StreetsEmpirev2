# Rivalries 2.5 Release QA

## Rollout

Rivalries are disabled unless the round has a pinned `rivalries` ruleset capability. Enable cohorts by round, beginning with internal beta rounds. The operations pause control disables future receipt creation without deleting or rewriting settled history. Existing combat, turf, NPC, and economy flows do not depend on rivalry records.

## Verification commands

```text
npx prisma validate --schema prisma/schema.prisma
npx prisma migrate status --schema prisma/schema.prisma
npm run typecheck
npm test -- --run apps/web/src/api/rivalries.test.ts apps/server/src/services/__tests__/rivalry-settlement.service.test.ts
node --import tsx scripts/qa/rivalry-sim.ts
npm run build
```

## Operator checks

- Verify metrics for suppressed relationships, one-sided concentration, unresolved contracts, public publication, duplicate attempts, and claim failures.
- Verify pause blocks new rivalry receipts while participant history remains readable.
- Verify active, paused, and ended rounds; public suppression; blocked/muted projections; and terminal settlement replay.
- Roll back by disabling the round capability. Do not delete rivalry rows or source receipts.

## Release decision

Promote only after focused tests, simulation, migration status, production build, and beta smoke checks pass. Record the metrics snapshot and any known privacy/moderation exceptions with the release evidence.
