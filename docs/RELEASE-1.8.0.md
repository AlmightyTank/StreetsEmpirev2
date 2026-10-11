# StreetsEmpire 1.8.0 release gate — Pregame Sportsbook

1.8.0 adds a pregame moneyline sportsbook to the casino: NFL, NBA, MLB and NHL from TheRundown, paid in casino chips, no turns spent, closed at the scheduled start. Slices A–E are on beta. This page is the release checklist and records the market expansion decision.

## What ships

| Slice | In short |
| --- | --- |
| A — Foundation | Shared odds cache polled by the server, Sports Betting in the casino, casino-chip tickets with pinned odds, exactly-once settlement. |
| B — Ticket clarity | League filter, day grouping, kickoff countdowns, feed freshness, a bet slip with payout preview and moved-price protection, open/settled ticket history. |
| C — Feed reliability | Retries and run-wide stops, one poller at a time, pulled lines, paced result checks, admin feed panel with audited recheck and void. |
| D — Limits | `SPORTSBOOK_LIMITS` tuned by `npm run qa:sportsbook`; concurrency, casino-bankroll and settlement-edge tests. |
| E — Release | Sportsbook pinned to `classic-og-v1.8-e`; feed-run log and grading source; market expansion readiness; provider payload check; this checklist. |

## Run the gates

- `npm run qa:release`: typecheck, unit tests, build and every balance gate, now including **Sportsbook limit gates** (`npm run qa:sportsbook`).
- `npm run release:rc`: adds the PostgreSQL suites. `TURF_INTEGRATION=1` runs `sportsbook.integration.test.ts` (slices B–E).
- `npm run qa:release -- --with-ui` with a running API and web client, or `npm run qa:ui -- --only sportsbook` and `--only admin/casino`: mobile (360/390 px), keyboard focus and axe WCAG 2.2 AA. Both pages passed with no sideways scrolling, no undersized targets and no axe violations.

## Deploy to beta

1. **Migrations.** The normal deploy runs `prisma migrate deploy`. 1.8.0 adds `20261010180000_sportsbook_cache`, `20261012100000_sportsbook_feed_reliability` and `20261013100000_sportsbook_market_review`, all additive. The last one backfills `settledVia` for games already settled, using the admin audit log. All migrations apply from an empty database, and the schema then matches `schema.prisma` (the only drift is the long-standing `NpcGang.updatedAt` default).
2. **Provider key.** Set `THERUNDOWN_API_KEY` (server only) and optionally `SPORTSBOOK_POLL_MINUTES` (default 30, minimum 15). With no key the poller never starts and the board says the feed is offline; the server starts either way.
3. **Ruleset.** Move the beta round to **classic-og-v1.8-e** in Admin › Rounds › ruleset change, with a reason. A round on an earlier ruleset takes no new tickets and tells players so, while tickets it already holds still settle and stay visible. 1.8.0-E changes nothing else from 1.7.0-E, and crew selected teams carry forward.
4. **Provider check.** In Admin › Casino Operations › Sportsbook feed, run **Check provider payload** for NFL, NBA, MLB and NHL. Each costs one request. Every listing should be stored, with skipped at 0, and every raw status should map to the outcome it means. Record the results here before public release.
5. **Watch the first days.** On the same panel: last success and attempt, failed runs, quota, per-league errors and unresolved games. Recheck or void anything stuck.

## Release gates (from the roadmap)

| Gate | Evidence |
| --- | --- |
| Migration applies; service starts with and without a key | Migration check above; poller only starts with a key; board shows OFF without one. |
| Actual TheRundown fields for ids, league, teams, start, prices, final status, scores | **Beta, manual:** provider check per league (snapshot fields and status mapping) and the first graded games (result fields). First beta run showed every NFL/NHL moneyline as Off: v2 nests prices at `participants[].lines[].prices[affiliate].price` (0.0001 = off the board), splits team city and mascot, and keeps the status at `score.event_status`. The parser now reads that shape (unit and end-to-end tests); re-run the provider check per league to confirm. |
| Auth, usage headers, cadence, quota stop, recovery after failure | `sportsbook-feed.test.ts` (retries, 401 stop, 429 Retry-After, headers); integration tests for league isolation, the poll lease, outage recording and recovery; quota on the admin panel. |
| Board shows the latest snapshot; refuses stale, missing, live and started lines | `sportsbook.service.test.ts` line states; integration tests for stale, pulled, no-line and feed-down lines. |
| Wager debits the right wallet, spends no turns, pins odds, idempotent retry | 1.8.0-D tests: trip bankroll vs home cash, turns unchanged, pinned price after the line moves, raced retries make one ticket. |
| Simultaneous wagers cannot overspend; no wager after kickoff via clock or body | Concurrent wager tests against casino chips and the daily limit; the server checks `startsAt` against its own clock and ignores the client's. |
| Win, loss, push, void and repeated settlement exactly once | Settlement race test (three concurrent settlements, one payout), push/void/loss/late-correction tests. |
| Button, switcher, route, board and closed-line messages on desktop, mobile, keyboard | UI audit above; slice B and E browser checks. |
| Sportsbook stays out of earlier pinned rulesets | Every ruleset except `classic-og-v1.8-e` has no `casino.sportsbook` (unit test); a 1.7.0-E round refuses tickets but still settles old ones (integration test). |

## Market expansion decision (1.8.0-E)

**Decision: do not add leagues or pregame spreads/totals in 1.8.0.** The roadmap allows expansion only after the first market is proven, and it is not proven yet: real provider payloads and real grading have not been checked, because no beta key has run against this code.

Admin › Casino Operations › Sportsbook feed › **Market expansion readiness** turns "proven" into checks on the last 30 days of real data (`SPORTSBOOK_EXPANSION_THRESHOLDS`):

- at least 14 days with a successful odds snapshot;
- at least 50 games graded;
- at least 98% of them graded by the feed without an admin recheck or void;
- no game still waiting 24 hours after its start;
- at most 5% of feed runs got no odds;
- projected datapoints at most 50% of the plan's quota, because a second market roughly doubles each snapshot.

When every check passes, review one addition at a time. Pregame spreads and totals come first because they reuse the same games and feed. They would need:

- **Ticket:** pinned line (points) and price on each ticket.
- **Grading:** by margin or total, with a push on a whole-number line.
- **Data:** provider market ids 2 and 3 added to the snapshot request.
- **Balance:** limits per market, re-checked with `qa:sportsbook`.
- **Ruleset:** a new ruleset version.

A new league needs its result payload verified with the provider check and grading proven the same way. **Live betting, parlays and player props stay out** until each is separately designed and budgeted.

## Known items for the release owner

- `APP_VERSION` in `packages/shared/src/platform.ts` still reads `1.5.0`.
- `NpcGang.updatedAt` keeps a database default the schema does not declare (pre-existing; a later `prisma migrate dev` would drop it).
- `crew-roster.integration.test.ts` expected the crew view without the 1.7.0-E `supportsSelectedTeams` field; fixed in this slice so `release:rc` passes.
