# 2.1.0-B — Earned Crew Loyalty Ledger

## Scope and activation

This slice adds **narrative-only, capped loyalty** per `CrewMember` with a permanent, source-deduplicated ledger **inside the round**. `loyaltyPoints` is never read by combat, happiness, specialty, economy or staffing calculations. Existing pinned rounds (`classic-og-v3.0-g` and earlier) do not opt in. New `classic-og-v3.0-h` opts in via `crewRoster.loyalty.enabled`.

The historical record is round-scoped. A later 2.1.0-E may produce separately moderated account-level remembrance art, not stat carryover.

## Earning policy

| Source | Requirement | Per-member loyalty | Receipt identity |
| --- | --- | ---: | --- |
| Completed scout/raid/eligible work | The server resolves an actual, accepted action and writes career XP | 2 | `SCOUT:actionId` / `RAID:battleId` |
| Defended a corner | A real attack is settled and the corner holds | 4 | `TURF_DEFENSE:warId` |
| Returned escort/bodyguard duty | A named crew member completes an active run/trip | 3 | `TRAVEL:kind:runOrTripId` |
| Settled dealer sales | Active dealer actually sells stock and completes a settled shift | 2 | `DEALER:crewId:settlementCursor:product` |

A run without named escorts uses its existing completed-work pathway, keyed to run ID. Events are awarded transactionally with the gameplay settlement. Entry identities are scoped per member and unique in PostgreSQL; repeat settlement receipts cannot grant more points.

**Caps:** 8 loyalty/member/UTC day, 32/member/UTC Monday–Sunday week, 100/member/round. Partial increments count only what fits. Zero-point receipts are kept, so retrying a capped action in a later cap window cannot award it again. Each member row is locked during the cap calculation.

**Milestones:** 0 New Face, 25 Proven, 50 Trusted, 75 Veteran, 100 Legend. These are descriptive, not combat modifiers. The roster shows the total, current milestone, next goal, and four latest ledger reasons.

## Abuse and compatibility policy

- **No loyalty** for opening a page, idling, sign-in, roster reconciling, reassignment, swapping, street-pass payments or paid training. No API grants loyalty from a client-supplied score.
- **Care:** the current game has no server-confirmed, non-paid, member-specific care completion receipt. Do not pretend training or routine upkeep is care. A future verified care hook must supply a unique source receipt and comply with the same caps; this is deferred.
- **No retrospective backfill** for pre-feature career events. Existing jobs/history and named members remain unchanged; existing round rulesets are opt-out.
- **No perpetual power:** stat math ignores loyalty, and every round gets fresh member totals. Account cosmetics and legends remain separate.
- **No surprise loss:** casualty and RELEASED statuses do not subtract loyalty; released members cannot earn new entries. The existing 1.7 prune policy for zero-XP, careerless members remains unchanged.
- **UTC periods** make caps deterministic even during DST changes. A stored receipt includes source kind, canonical action/settlement key, points, descriptive reason and event time.

## Verification

- `npx vitest run apps/server/src/services/__tests__/crew-loyalty.service.test.ts`: ruleset gating, duplicate receipts, all caps, released members, bad proof, UTC boundary, tiers and history.
- CI: database migration deploy, Prisma generate, workspaces typecheck, unit/integration and build.
- Manual beta: create new round pinned `classic-og-v3.0-h`, exercise real scout, defensive win, travel return and dealer-sales settlement, verify cumulative points/history, replay and daily/weekly caps.
- Full loyalty economy/load simulation and admin correction tools belong to Slice G; personalities and moments to Slice C.
