# 2.6.0-G — Scale, Audits and Release

**Status:** Candidate implementation on `feature/2-6-profit-intelligence-g-scale-release`. Merge to `beta` only after CI passes. A live beta-like database load rehearsal and operator review remain deployment acceptance steps.

## Automated audit coverage

- The report reads one player and one active round at a time. Ledger rows are selected by the indexed `(roundPlayerId, createdAt)` range, with an exclusive upper cutoff, and grouped in PostgreSQL before DTO projection.
- The ledger projection and independent count/net aggregate run in a PostgreSQL `RepeatableRead` transaction. Reconciliation reports both row-count and cents variance and never hides drift.
- A fixed-clock fixture proves a report period is stable at its selected cutoff and its reads use the same repeatable snapshot.
- A deterministic 100,000-receipt fixture exercises aggregation into bounded day/source/city buckets, checks exact cent and row-count reconciliation, and verifies unsupported sources and city attribution remain explicitly unknown.
- A deliberate mismatch fixture verifies the report fails reconciliation visibly.

## Historical data and backfill policy

G adds no projection table, migration, write path, or backfill. Reports are derived from the canonical ledger at read time. No backfill is needed to produce the current report, and replaying historical settlements would risk duplicate or fabricated cash movements.

Legacy labels do not prove city, route, business, inventory cost basis, or source semantics. Unmapped sources remain `UNKNOWN`; missing, malformed, and unsupported city metadata remains `UNKNOWN_CITY`. Do not infer values from display text. If a future feature requires a materialized projection, propose it separately with an idempotent dry-run, before/after row-count and cents reconciliation, and an explicit unknown-preservation check. It must not rewrite ledger history.

## Beta acceptance checklist

1. Apply the normal pending migrations to an isolated beta-like database; do not reset or rewrite player data for this feature.
2. Run the 2.6 profit tests and the server/web typechecks from the PR commit.
3. Seed a disposable player with at least 100,000 ledger receipts across the maximum 90-day window, known and unknown sources, and known/missing/invalid city metadata. Capture `EXPLAIN (ANALYZE, BUFFERS)` for grouped report and receipt-page queries; confirm the indexed player/time access path, bounded result shape, and acceptable latency under the deployment's normal concurrency target.
4. Compare report row count and signed cents against an independent ledger aggregate for a fixed cutoff. Repeat with a deliberate test-only mismatch and confirm `matches` is false and variance is visible.
5. Verify receipt pagination stays within 100 rows, follows deterministic `(createdAt DESC, id DESC)` order, and cannot cross player, round period, source, or city filters.
6. Confirm no historical settlement was replayed and unknown source/city counts are visible in the report. Record query-plan, latency, reconciliation, and data-quality results with the beta rollout.

Do not treat the synthetic 100,000-row fixture as a substitute for the isolated database rehearsal. Do not enable a backfill or promote to production as part of this PR.
