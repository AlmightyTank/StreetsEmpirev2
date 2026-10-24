# 2.6.0-B — Reconciled Reporting Projection

This slice adds a read-only reporting projection over the current player's economy ledger. It is the backend contract for later profit views; it does not claim that every source is fully attributable or that the result is accounting profit.

## API

- `GET /api/game/profit-intelligence?days=30`
- Authenticated and scoped to the current player's active round.
- `days` defaults to 30 and accepts integer values from 1 through 90.
- The window is clipped to the round start. The response includes the actual `from` and `to` timestamps.
- Response DTOs are exported from `@streets/shared`; all currency values are decimal strings in cents to preserve bigint precision.
- The endpoint is read-only and sends `Cache-Control: private, no-store`.

## Projection and reconciliation

The projection groups ledger rows by UTC day, source, and city attribution, then returns totals by source, city, and day/source/city. A city is attributed only when `metadata.citySlug` matches a city in the active round's pinned ruleset. Missing, invalid, or unsupported city metadata is retained in an explicit unknown-city bucket.

The report exposes signed net, positive inflows, and absolute outflows. It reconciles projected row count and signed net against an aggregate over the same player and time window inside a repeatable-read transaction. `matches` is false if either count or net differs.

Source classifications are versioned as `2.6.0-B1`. Unmapped source names remain `UNKNOWN`; mixed ledger events remain `MIXED`. These labels describe source behavior and are not a claim of realized profit. In particular, the report does not infer missing inventory cost basis, split ambiguous store purchases, or fabricate historic city attribution. Later slices can add more exact cost and operational metrics using the Slice A source map.

## Query shape

The grouped query filters by `roundPlayerId` and a bounded `createdAt` range, using the existing `EconomyLedgerEntry(roundPlayerId, createdAt)` index. This slice adds no schema migration or backfill.
