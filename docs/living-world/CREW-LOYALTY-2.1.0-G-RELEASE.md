# 2.1.0-G — Admin, Balance & Release

**Release status:** Candidate implementation only. Merge after CI/review, deploy to `beta`, manually validate real round-close/legacy migration, and explicitly promote after sign-off. This slice does not automatically merge or deploy.

## Release controls

Admin Crew Roster now exposes **round-scoped loyalty health** and staff-only receipts:

- `GET /api/admin/rounds/:roundId/crew/release-health` — source receipt totals (positive and capped), bond/memory counts, archived mementos, pre-migration players, **bounded top-25 materialized-loyalty mismatches**, pinned ruleset on/off and hard limits. SQL aggregates within PostgreSQL rather than transferring all accounts to the client.
- `GET /api/admin/players/:roundPlayerId/crew/:memberId/provenance` — owner-scoped member details, **full aggregate numeric sum**, the last **100** immutable source-key receipts, whether more history exists, suspicious per-receipt/daily/UTC-week sample violations and bond count. A sampled page is never presented as the complete history. Responses are `private, no-store`.
- `POST /api/admin/players/:roundPlayerId/crew/:memberId/loyalty/reconcile` — reason **5–500 characters** plus `expectedPoints` optimistic precondition. **Only** repairs materialized `CrewMember.loyaltyPoints` to the sum of immutable receipts (0–100); cannot mint new receipts or choose arbitrary points. Invalid sums require investigation, not bypass. Invalidated earned nickname is cleared. Writes an immutable career correction event and audit entry in the **same transaction**. Staff cannot correct their own account, closed rounds are frozen, and round+player locks serialize with settlement and final snapshots.
- `POST /api/admin/players/:roundPlayerId/crew/reconcile` — audited, reasoned **explicit legacy roster recovery**, uses the existing fail-closed planner after invalidating only the stored `syncedKey`. Cannot change source-of-truth headcounts, cash, happiness, training XP, or effect caps. Does not run automatically for every request or touch legacy pinned non-roster rulesets.

The **existing** career XP correction endpoint remains authoritative for XP, and the 2.1.0-E admin suppression endpoint remains authoritative for nicknames and archived legends. No parallel moderation system was created.

## Critical identity fix

The 1.7.0 roster planner previously discarded unused members with zero XP and no dealer career. However zero-XP individuals may already have earned loyalty or be an apprentice with a lasting bond. Planner and pre-write identity audit now retain them as **released historical careers** when any of these holds: positive loyalty, earned nickname, apprentice link, or mentorship history. Zero-XP and zero-identity disposable recruits may still be deleted as before. This applies to roster-count changes, admin reconciliation and legacy migration fallback. Unit tests prove each protected case and the fail-closed drop rejection.

## Anti-abuse and economy/combat gates

`npm run qa:crew-release` is part of `Public Platform` CI. The deterministic, no-database simulator drives **80 crew careers for 28 UTC days**, 9 verified action receipts a day per member, with repeated exact-source replays. It validates that:
- each source key credits at most once; zero-point capped receipts cannot be replayed after a new day;
- loyalty stays within 8/day, 32/UTC Monday-week and 100/round;
- career totals equal the sum of their immutable ledger rows;
- all earned catalog names use positive source receipts and level thresholds are narrative only;
- test XP and economy inventory values never change from a loyalty award;
- a pinned `classicOgV30G` round still cannot generate loyalty receipts.

The existing `qa:crew-roster`, staffing, combat, release integration and test suites continue to verify job bonuses, selected-team caps, and actual player resources. New admin tests validate the same immutable-provenance repair constraints, self-correction denial, stale expected totals, ended-round freezes and migrations.

## Operational beta checklist

1. Apply migrations normally (this slice requires **no new database tables**).
2. In Admin → Crew Roster, select a loyalty-enabled round, verify summary counters and mismatch sample; inspect source keys as staff. Keep records private.
3. Create actual verified work and confirm no repeated positive receipt for the same `sourceKey`; test a capped zero-point receipt after UTC rollover.
4. On a disposable beta test account, introduce a simulated **materialized counter mismatch** in an isolated test DB, verify that only canonical reconciliation (with reason and existing actual points) is allowed. Do not change real player balances to test.
5. Test migration recovery using a fresh account that predates individual crew, verify idempotence and preserved totals, released narrative identities and dealer links.
6. End a disposable round, verify archived memento proof and crew nicknames never restore living crew members, and all staff repairs reject that round.
7. Confirm mobile Crew Career inspector, opt-in celebrations, reduced motion, audited action records, disabled pinned rulesets, performance of a 200-name jobs board, and no permanent combat/economy benefit.

**Do not mark 2.1.0 released solely because GitHub CI is green.** This is a beta promotion gate; deploy/migration, moderation testing, season-close drill and runtime telemetry remain real-world validation steps.
