# StreetsEmpire 1.8.0 — Pregame Sportsbook

## Purpose

Add a sportsbook as another casino destination where players use casino chips without spending turns. Keep the first release close to the old pregame betting loop: review a line, place a moneyline ticket before the event, and wait for the result. When the event starts, its line is closed.

The first release uses TheRundown for pregame odds across NFL, NBA, MLB, and NHL. The provider key stays on the server. The game polls and stores a shared snapshot so player page visits never become provider requests.

**The question:** Can a player make a quick pregame pick with casino chips from an open casino bankroll, then see a clear ticket and settlement?

## Design principles

1. **Pregame only.** A ticket is accepted only while the provider event is pregame and its start time is still in the future. Kickoff or first pitch closes betting immediately.
2. **Casino chips only.** A wager spends chips from the open casino bankroll, uses no turns, and never touches real money, game cash, or premium currency.
3. **One shared cache.** The server polls TheRundown on a controlled cadence and stores the snapshot. Player reads use the database cache, not the provider API.
4. **Pin the ticket.** Store the selected team, accepted odds, stake, and potential payout on the ticket. Later line movement cannot change an accepted bet.
5. **Server authority.** Validate event status, cutoff, bankroll chips, limits, and idempotency on the server. Client controls are presentation only.
6. **Protect provider budget.** Track provider usage headers, stop optional refreshes near quota, and make stale or unavailable data visibly unavailable for betting.
7. **Keep history understandable.** Every ticket ends as a win, loss, push, or void with a clear chip adjustment.
8. **Preserve casino rules.** A sportsbook ticket requires the same casino visit and open bankroll as other casino games. Earlier rounds and existing casino games keep their current rules.

## Proposed slices

| Slice | Theme | Outcome |
| --- | --- | --- |
| **1.8.0-A — Pregame Moneyline Foundation** | Ship the first usable sportsbook | Cache NFL, NBA, MLB, and NHL pregame moneylines; add the Sports Betting casino destination; let players wager casino chips without turns; close at kickoff; store and settle tickets. Implemented on beta; provider and result payload verification remains a release gate. |
| **1.8.0-B — Ticket Clarity & Board Polish** | Make picks and outcomes easy to follow | Improve league selection, event grouping, cache freshness, open-ticket details, and settled-ticket history. Keep the board useful on mobile and explain why a line is closed or unavailable. Implemented on beta. |
| **1.8.0-C — Feed Reliability & Operations** | Make polling and settlement supportable | Harden retries and stale-cache handling; expose last successful poll, provider quota, and errors to admins; safely recheck unresolved results without duplicate settlement. Implemented on beta. |
| **1.8.0-D — Limits & Economy Balance** | Keep casino-chip risk bounded | Tune minimum/maximum stakes and exposure controls through simulations; test repeat requests, concurrent wagers, bankroll/session changes, pushes, cancellations, and late provider updates. Keep the no-turn rule. Implemented on beta; see SPORTSBOOK-SIMULATION-1.8.0-D.md. |
| **1.8.0-E — Market Expansion & Release** | Expand only after the first market is proven | Review provider usage and grading accuracy, then decide whether to add leagues or pregame spreads/totals. Keep live betting, parlays, and player props out until separately designed and budgeted. Finish accessibility, mobile, migration, historical-ruleset, and release checks. Implemented on beta; expansion deferred until the readiness checks pass on real data (RELEASE-1.8.0.md). |

## Slice A details

- Keep `THERUNDOWN_API_KEY` server-side and leave it out of source control. An empty key disables the feed cleanly.
- Poll a small, fixed set of pregame moneyline snapshots and store provider IDs, league, teams, event start, market odds, event state, and update times in PostgreSQL.
- Use a conservative shared polling interval and track TheRundown datapoint usage. Do not refresh odds independently for each player.
- Add the Sports Betting button beside Slots in the casino game selector and give it its own route.
- Let players choose a team and stake in chips from the open casino bankroll. A wager spends no turns and does not use game cash.
- Check that the cached event is pregame, the odds are fresh, and `startsAt > now` at wager time. Close at the start time even if the provider has not yet changed the event status.
- Use an idempotent action ID and an immutable ticket snapshot to prevent duplicate debits or odds changes on retry.
- Poll results only for events with open tickets. Settle wins/losses, push ties, and void cancelled events by adjusting casino chips exactly once.
- The Sports Betting board reads StreetsEmpire's cached snapshot and the player's tickets. It does not call TheRundown from the browser.

## Slice B details

- League filter (All, NFL, NBA, MLB, NHL) with game counts, remembered per player. Games are grouped by local day (Today, Tomorrow) with a kickoff countdown that turns urgent in the last 15 minutes and follows the server clock rather than the device clock.
- A feed banner shows when lines were last refreshed and the poll cadence, or why betting is paused: waiting for the first snapshot, stale snapshot, or feed offline.
- Every line carries a server-computed state (`OPEN`, `NO_LINE`, `STALE_ODDS`, `FEED_UNAVAILABLE`) from the same checks a wager runs; the board adds `STARTED` once kickoff passes on screen. Closed lines say why in one sentence. A side with no price shows "Off".
- Picking a side opens a bet slip instead of placing immediately. The slip shows the matchup, price, stake, quick stakes, to-win and total payout (the same rounding the server pins), floor bankroll, and why the ticket cannot be placed yet. On phones the slip stays pinned above the tab bar while the board scrolls.
- Wagers send the price the player saw as `expectedOdds`. If the line moved, the server refuses with `SPORTSBOOK_ODDS_CHANGED` and charges nothing; the slip reloads and shows the move.
- My tickets splits Open (kickoff order, stake, to win, payout, "Awaiting result" after the start) from Settled (result, final score, stake, chips returned or lost, settled time) with a lifetime record and net result.

## Slice C details

- The provider client lives in `sportsbook-feed.service.ts`. Each request retries up to 3 times on network errors, timeouts and 5xx (2s, then 4s), and on 429 after `Retry-After` (capped at 30s). A rejected key (401/403) or a 429 that persists stops the rest of the run so it does not waste datapoints. Other 4xx responses are not retried.
- A failing league records its own error and the other leagues still poll; result checks run either way. `lastPolledAt` means the last run with at least one successful snapshot. Per-event `oddsUpdatedAt` still closes any league that missed the refresh.
- A database lease (`pollLeaseUntil`), plus a minimum interval of the poll period less one minute, means a second server instance never polls on top of the first. A crashed run's lease expires after 10 minutes.
- Before 10:00 UTC the poll also requests yesterday's date, so US evening games stay covered if the provider dates events in a US time zone. After a complete league snapshot, an upcoming game the provider no longer lists becomes `PULLED`: closed to betting at once with a reason, and reopened if it comes back. This only applies to start times the snapshot is certain to contain, whatever the provider's date offset. Cancelled or postponed listings are also `PULLED`. A settled event is never reopened by a late listing.
- Results are checked only for started games with open tickets, beginning once a final is plausible (NFL 3h, MLB 2.5h, NBA/NHL 2h15m after the start), then backing off 30m, 30m, 1h, 2h, 4h, then every 6h. Each check records its time, count, next check and any error. Provider statuses such as `STATUS_FINAL`, `STATUS_CANCELED` and `STATUS_IN_PROGRESS` are recognised; a suspended game is treated as live, not void.
- Settlement takes a row lock and checks `settledAt` inside one transaction, so the poller, an admin recheck and an admin void can race without paying twice (covered by a concurrency test).
- Admin › Casino Operations has a Sportsbook feed panel: feed status, last success and attempt, consecutive failed runs, last error, datapoint quota with pause flags, per-league health, open exposure, 24-hour settlements, and started games still waiting on a result. **Recheck result** asks the provider now. **Void and refund** needs a reason and a confirmation. Both are written to the admin audit log.

## Slice D details

- `npm run qa:sportsbook` compares the 1.8.0-A limits with the 1.8.0-D limits over 28-day rounds for five betting styles, and fails if a band is broken. Results and reasoning: [SPORTSBOOK-SIMULATION-1.8.0-D.md](SPORTSBOOK-SIMULATION-1.8.0-D.md).
- `SPORTSBOOK_LIMITS`: $10 to $25,000 per ticket; at most $50,000 to win per ticket; $25,000 per game per player; $125,000 placed per rolling 24 hours; $150,000 and 20 tickets open; $1,000,000 potential winnings per side of a game across all players.
- One shared check (`sportsbookStakeCheck`) runs on the server inside the wager transaction, and on the bet slip to show the top stake for the selected price, the daily and open usage, and the reason a ticket cannot be placed.
- A wager locks the game row, then the player, in the same order as settlement. Tickets are stamped with the transaction clock so the 24-hour window is exact.
- PostgreSQL tests cover repeat and racing requests, concurrent wagers against casino chips and the daily limit, every limit, session/wallet settlement, pushes, cancellations, pinned odds after line movement, late score corrections and the no-turn rule.

## Slice E details

- The sportsbook and its limits are pinned to **classic-og-v1.8-e**: 1.7.0-E plus `casino.sportsbook.limits`, equal to the simulated `SPORTSBOOK_LIMITS`. A round on an earlier ruleset takes no new tickets and says so on the board; tickets it already holds still settle and stay visible. Crew selected teams, which were keyed to the exact 1.7.0-E id, now carry forward to 1.8.0-E.
- Every feed run that holds the lease is logged (`SportsbookFeedRun`, kept 90 days), and every settled game records who graded it (`settledVia`: FEED, ADMIN_RECHECK or ADMIN_VOID, backfilled from the audit log).
- Admin › Casino Operations › Sportsbook feed adds **Market expansion readiness**: provider usage and grading accuracy over 30 days, scored against `SPORTSBOOK_EXPANSION_THRESHOLDS`. It also adds **Check provider payload**, which fetches one league's live snapshot and reports listings stored or skipped (with reasons), how each raw status maps, sample rows and quota, without storing anything (audited).
- Decision: no new leagues or markets in 1.8.0 until the readiness checks pass on real beta data. Live betting, parlays and player props stay out. See [RELEASE-1.8.0.md](RELEASE-1.8.0.md) for the checklist, deploy steps and what spreads/totals would need.
- `npm run qa:release` now runs the sportsbook limit gates. The sportsbook and admin casino pages pass the mobile/keyboard/axe audit at 360, 390 and desktop widths.

## Release gates

- Apply the sportsbook migration to beta and confirm the service starts with and without a provider key.
- With the beta key configured, verify actual TheRundown response fields for event IDs, league, team names, start times, moneyline prices, final status, and scores. Update result parsing to match the live response before public release.
- Verify provider authentication, usage headers, cache refresh cadence, quota stop behavior, and recovery after a temporary provider failure.
- Verify the board shows the latest stored snapshot and refuses stale odds, missing odds, live events, and events at or past kickoff.
- Verify a successful wager debits the correct casino bankroll, spends no turns, pins the accepted odds, and returns the same result for an idempotent retry.
- Verify simultaneous wagers cannot overspend the player's chips and a player cannot wager after kickoff by changing the client clock or request body.
- Verify win, loss, push, cancellation/void, and repeated settlement all produce the correct chip and ticket state exactly once.
- Check the Sports Betting button, casino game switcher, route, ticket board, and closed-line messaging on desktop, mobile, and keyboard navigation.
- Keep sportsbook behavior out of earlier pinned rulesets unless their behavior is explicitly unchanged and covered by regression tests.

## Explicitly deferred

- Live or in-play betting.
- Parlays, player props, cash-out offers, and alternate lines.
- Real-money deposits, withdrawals, prizes, or purchases.
- Increasing the poll rate before measured usage and provider limits justify it.
- Adding leagues or markets before event mapping, result grading, quota use, and settlement tests are proven.

## Guiding question

**Can a player make a clear pregame pick with casino chips, trust the kickoff cutoff, and understand how the ticket settled?**
