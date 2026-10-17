# StreetsEmpire 2.0.0-H — Balance, Migration & Launch

**Base:** Slice G merged to `beta` at `429c76e6`. This slice adds rollout control and release acceptance for the already shipped Living Streets backbone. It does not add another scheduler, source writer, story catalog, or database model.

## Rollout control

`LIVING_STREETS_ENABLED` is the operator kill switch for **new** case invitations and public story opt-ins. `0`, `false`, `off`, and `disabled` (case-insensitive) pause new invitations. Unset or any other value keeps existing behavior for compatibility with beta deployments.

Turning the switch off does not hide or mutate existing case files and does not prevent players from gathering valid evidence, closing solved cases, or receiving a previously authorized one-time settlement. Canonical City Memory receipts continue to be written by their existing producers; the switch controls invitation creation only. Ruleset pinning remains the per-round content gate, so only a newly seeded round pinned to the approved Living Streets ruleset can offer these stories.

## Migration and immutable history

- H introduces no Prisma migration. All A–G schema changes remain additive migrations already merged to beta.
- Before a beta deployment, inspect `prisma migrate status`; apply pending migrations with the normal `prisma migrate deploy` release step. Never reset or roll back a player database to ship H.
- Existing rounds keep their pinned ruleset, definitions, case snapshots, evidence, outcome, and reward cap. Admin drafts remain disabled proposals and cannot change a pinned catalog.
- Do not repurpose public release tags or rewrite ruleset versions. Any story-content change belongs in a new immutable ruleset version and future rounds.

## Required automated checks

Run the focused story acceptance suite and the normal repository gates:

```sh
npm run qa:living-streets
npm run typecheck
npm test
npm run build
```

The focused suite covers ruleset-pinned offers, replay/idempotency, round pause behavior, source privacy and actor eligibility, voluntary public opportunities, evidence ownership and distinct-source requirements, concurrent/duplicate settlement, reward ceilings, admin dry-run safety, draft revision conflicts, and the rollout kill switch. It does not substitute for a production-like load run.

## Staged beta acceptance

1. Deploy the branch to beta with `LIVING_STREETS_ENABLED=false`. Confirm a verified source receipt still exists but creates no new case. Confirm public opportunity reads return empty and an attempted opt-in is rejected.
2. Turn the switch on for beta and seed a **new** round pinned to the approved Living Streets ruleset. Keep existing rounds on their original rulesets. Verify exactly three or more distinct case chains are available through real server-owned source actions; include a city-dependent opportunity and at least two noncombat conclusions.
3. For each chain, verify evidence from the configured distinct sources, pause and resume the round during an active deadline, replay each source action, and repeat settlement requests concurrently. One source receipt can advance no more than one clue; one case can settle once; per-case and per-player/round reward caps hold.
4. Run low-activity and high-activity beta simulations. Low activity: a single eligible player, sparse sources, reconnects, and a long pause. High activity: many concurrent eligible players, repeated source retries, simultaneous opt-ins, and case closures against owner/city/round quotas. Record case count, duplicate attempts, rejected reasons, transaction failures, and reward ledger totals. No uncapped growth, deadlocks, or duplicate receipts may occur.
5. Check visibility for owner-only sources, public sources, unrelated city players, admins, Street Reports, Streets Daily, and dashboard notifications. Private evidence and actor lists must never appear in public copy or another player's DTO.
6. Exercise the switch-off rollback after cases exist. New offers stop immediately; existing case detail, valid progress, closure, and already authorized payouts continue to work.
7. Observe beta admin diagnostics and application logs through one normal activity window. Confirm source receipt totals reconcile with case/evidence/outcome/ledger records, no private clue payload is logged, and there are no new database constraint, lock-timeout, or unexpected 5xx errors.

## Launch decision

Enable this content for beta rounds only after all automated gates pass and the staged checks above are recorded. Keep the switch available to pause new invitations. Do not enable the ruleset for existing or production rounds as part of H. Public launch and release numbering remain separate release-engineering decisions; do not reuse `v2.0.0` if that public tag already exists.
