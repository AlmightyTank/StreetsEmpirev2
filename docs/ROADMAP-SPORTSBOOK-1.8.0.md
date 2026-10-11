# StreetsEmpire 1.8.0 — Pregame Sportsbook

## Purpose

Add a sportsbook as another casino destination where players can use their in-game cash without spending turns. Keep the first release close to the old pregame betting loop: review a line, place a moneyline ticket before the event, and wait for the result. When the event starts, its line is closed.

The first release uses TheRundown for pregame odds across NFL, NBA, MLB, and NHL. The provider key stays on the server. The game polls and stores a shared snapshot so player page visits never become provider requests.

**The question:** Can a player make a quick pregame pick with the cash already in their pocket, then see a clear ticket and settlement?

## Design principles

1. **Pregame only.** A ticket is accepted only while the provider event is pregame and its start time is still in the future. Kickoff or first pitch closes betting immediately.
2. **Game cash only.** A wager spends current in-game cash, uses no turns, and never touches real money, casino chips, or premium currency.
3. **One shared cache.** The server polls TheRundown on a controlled cadence and stores the snapshot. Player reads use the database cache, not the provider API.
4. **Pin the ticket.** Store the selected team, accepted odds, stake, and potential payout on the ticket. Later line movement cannot change an accepted bet.
5. **Server authority.** Validate event status, cutoff, cash, limits, and idempotency on the server. Client controls are presentation only.
6. **Protect provider budget.** Track provider usage headers, stop optional refreshes near quota, and make stale or unavailable data visibly unavailable for betting.
7. **Keep history understandable.** Every ticket ends as a win, loss, push, or void with a clear cash adjustment.
8. **Preserve casino rules.** A sportsbook ticket does not require a casino visit or casino session. Earlier rounds and existing casino games keep their current rules.

## Proposed slices

| Slice | Theme | Outcome |
| --- | --- | --- |
| **1.8.0-A — Pregame Moneyline Foundation** | Ship the first usable sportsbook | Cache NFL, NBA, MLB, and NHL pregame moneylines; add the Sports Betting casino destination; let players wager game cash without turns; close at kickoff; store and settle tickets. Implemented on beta; provider and result payload verification remains a release gate. |
| **1.8.0-B — Ticket Clarity & Board Polish** | Make picks and outcomes easy to follow | Improve league selection, event grouping, cache freshness, open-ticket details, and settled-ticket history. Keep the board useful on mobile and explain why a line is closed or unavailable. |
| **1.8.0-C — Feed Reliability & Operations** | Make polling and settlement supportable | Harden retries and stale-cache handling; expose last successful poll, provider quota, and errors to admins; safely recheck unresolved results without duplicate settlement. |
| **1.8.0-D — Limits & Economy Balance** | Keep game-cash risk bounded | Tune minimum/maximum stakes and exposure controls through simulations; test repeat requests, concurrent wagers, cash-location changes, pushes, cancellations, and late provider updates. Keep the no-turn rule. |
| **1.8.0-E — Market Expansion & Release** | Expand only after the first market is proven | Review provider usage and grading accuracy, then decide whether to add leagues or pregame spreads/totals. Keep live betting, parlays, and player props out until separately designed and budgeted. Finish accessibility, mobile, migration, historical-ruleset, and release checks. |

## Slice A details

- Keep `THERUNDOWN_API_KEY` server-side and leave it out of source control. An empty key disables the feed cleanly.
- Poll a small, fixed set of pregame moneyline snapshots and store provider IDs, league, teams, event start, market odds, event state, and update times in PostgreSQL.
- Use a conservative shared polling interval and track TheRundown datapoint usage. Do not refresh odds independently for each player.
- Add the Sports Betting button beside Slots in the casino game selector and give it its own route.
- Let players choose a team and stake in dollars from current game cash. A wager spends no turns and does not use casino chips.
- Check that the cached event is pregame, the odds are fresh, and `startsAt > now` at wager time. Close at the start time even if the provider has not yet changed the event status.
- Use an idempotent action ID and an immutable ticket snapshot to prevent duplicate debits or odds changes on retry.
- Poll results only for events with open tickets. Settle wins/losses, push ties, and void cancelled events by adjusting game cash exactly once.
- The Sports Betting board reads StreetsEmpire's cached snapshot and the player's tickets. It does not call TheRundown from the browser.

## Release gates

- Apply the sportsbook migration to beta and confirm the service starts with and without a provider key.
- With the beta key configured, verify actual TheRundown response fields for event IDs, league, team names, start times, moneyline prices, final status, and scores. Update result parsing to match the live response before public release.
- Verify provider authentication, usage headers, cache refresh cadence, quota stop behavior, and recovery after a temporary provider failure.
- Verify the board shows the latest stored snapshot and refuses stale odds, missing odds, live events, and events at or past kickoff.
- Verify a successful wager debits the correct game-cash wallet, spends no turns, pins the accepted odds, and returns the same result for an idempotent retry.
- Verify simultaneous wagers cannot overspend the player's cash and a player cannot wager after kickoff by changing the client clock or request body.
- Verify win, loss, push, cancellation/void, and repeated settlement all produce the correct cash and ticket state exactly once.
- Check the Sports Betting button, casino game switcher, route, ticket board, and closed-line messaging on desktop, mobile, and keyboard navigation.
- Keep sportsbook behavior out of earlier pinned rulesets unless their behavior is explicitly unchanged and covered by regression tests.

## Explicitly deferred

- Live or in-play betting.
- Parlays, player props, cash-out offers, and alternate lines.
- Real-money deposits, withdrawals, prizes, or purchases.
- Increasing the poll rate before measured usage and provider limits justify it.
- Adding leagues or markets before event mapping, result grading, quota use, and settlement tests are proven.

## Guiding question

**Can a player make a clear pregame pick with in-game cash, trust the kickoff cutoff, and understand how the ticket settled?**
