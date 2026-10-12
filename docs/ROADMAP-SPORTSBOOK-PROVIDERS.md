# StreetsEmpire — Sportsbook Provider Chain

## Purpose

The 1.8.0 sportsbook reads every line and every result from one provider, TheRundown. When TheRundown is down, out of quota, or changes its payload, the board closes and open tickets wait. The v2 payload change (prices nested under `participants[].lines[].prices`, `0.0001` meaning off the board, single-event results wrapped in `events[]`) already left finished games ungraded until the parser caught up.

This roadmap puts every odds and results provider behind one interface and ranks them per league. If the provider in use cannot give us what we need, the feed moves to the next one in the chain until one can. Players keep one board, one ticket history and one settlement rule; only the source of the data changes.

**The question:** Can the sportsbook keep lines open and tickets settling through any single provider's outage, without double-spending quota or grading a game wrong?

## Design principles

1. **One interface, many adapters.** The feed, settlement and admin code talk to `SportsbookProvider`, never to a vendor URL. Each adapter turns its vendor's payload into the same normalized event and result shapes.
2. **A ranked chain per league and per job.** Odds and results have separate chains, because the best odds source is not always the best results source (ESPN has scores but no prices).
3. **Sticky primary.** A league stays on its current odds provider until that provider fails. It returns to a higher-ranked provider only after that provider has been healthy for a while. The board never flips sources poll by poll.
4. **An empty slate is an answer, not a failure.** No games in the offseason or on an off day must not walk the chain and spend every provider's quota.
5. **One canonical game.** Every provider's listing of the same game maps to one `SportsbookEvent`. Tickets point at the canonical game, so a source switch never orphans a ticket.
6. **Grading is stricter than pricing.** Falling through for a price is safe because tickets pin their odds. Falling through for a result is safe only while providers agree. Disagreement holds the game for an admin, and a void needs two sources.
7. **Bounded spend.** Each provider keeps its own quota floor and circuit breaker, and one run can only try so many fallbacks. An outage on our side must not drain every key at once.
8. **No gameplay change.** The chain changes where data comes from, not betting rules, limits or payouts. The sportsbook stays pinned to its ruleset, and no new ruleset is needed.

## Candidate providers

Researched 2026-10-11 from vendor pages and third-party trackers, which disagree with each other. Check each official pricing page and terms of use before enabling an adapter.

| Provider | Role | Notes |
| --- | --- | --- |
| **TheRundown** | Odds and results, current primary | Data-point metering via `x-datapoints-*` headers. Free tier listed at 20,000 points a day with a 5-minute delay. Pricing changed several times in Aug–Sep 2026. |
| **The Odds API** | Odds and results, first fallback | Flat payload. Cost is roughly markets × regions per odds call, and an empty response is free. One scores call grades a whole league. Free tier is 500 credits a month, and paid plans are quoted at about $25–30 a month at entry. |
| **SportsGameOdds** | Odds and results, later fallback | Results come in the same event payload. Billed per event ("object"). Free tier is 2,500 objects a month with a 10-minute delay. Paid plans start at $99 a month. |
| **ESPN scoreboard** | Results cross-check only | Free, but unofficial and without guarantees. Never the only source for a settlement. |

A chain of free tiers may cover pregame moneylines for four leagues. A paid plan matters only for whichever provider is primary once spreads and totals are offered.

## Proposed slices

| Slice | Theme | Outcome |
| --- | --- | --- |
| **A — Provider Seam** | Put TheRundown behind the interface | Define `SportsbookProvider` and normalized shapes; move TheRundown's URL, auth, payload parsing and quota headers into a `therundown` adapter. Behaviour, request counts and tests are unchanged. |
| **B — Canonical Games** | One game, many listings | Add a per-provider source mapping, team aliases, and a matcher by league, teams and start time. Backfill current events as TheRundown sources. Tickets and feed runs record their provider. |
| **C — Odds Failover** | Keep lines open | Add The Odds API adapter, per-league odds chains, a sticky primary with hysteresis, circuit breakers, the empty-slate rule and a fallback cap per run. The admin panel shows health per provider and lets an admin pin a league to a source. |
| **D — Results Chain & Cross-check** | Keep tickets settling, and settle them right | Results fall through the chain, using bulk results calls where an adapter has them. Add an ESPN results-only adapter. Disagreement holds the game as disputed, a void needs two sources, and admins resolve disputes. |
| **E — Review & Expansion** | Decide with real data | After 30 days on beta, review failovers, disputes and spend per provider. Then decide on SportsGameOdds and on spreads and totals under the chain. |

## Slice A details

- `SportsbookProvider` has an `id`, the leagues and markets it covers (`capabilities`), and three calls:
  - `listEvents(league, dates)` returns normalized events: provider event id, league, home and away team, start time, status (`PRE`, `LIVE`, `FINAL`, `CANCELLED`), prices and scores.
  - `getResult(providerEventId)` returns one normalized result.
  - `listResults(league, since)` is optional, for providers that grade a whole league in one call.
- `ProviderSession` becomes generic. Each adapter reports its own cost per response (data points, credits or objects) and its remaining quota. `SportsbookProviderState` keeps one row per provider id, with the `datapoints*` fields meaning "units" in that provider's billing.
- `providerOutcome`, `eventOdds`, `singleEventFromPayload` and `diagnoseProviderEvent` move into the TheRundown adapter. **Check provider payload** calls the adapter's own diagnose.
- An empty key still disables a provider cleanly. New keys (`THE_ODDS_API_KEY`, `SPORTSGAMEODDS_API_KEY`) follow `THERUNDOWN_API_KEY`: server-only, absent from source control, validated in `env.ts`.
- Exit check: `sportsbook-feed.test.ts` and the PostgreSQL suites pass with no changes beyond imports, and a beta run spends the same data points as before.

## Slice B details

- New `SportsbookEventSource` table: `(provider, providerEventId)` is unique and points at `SportsbookEvent`. Each row keeps that provider's last listing: status, prices, scores, `lastSeenAt`, and result-check pacing.
- `SportsbookEvent.providerEventId` stays during migration and is backfilled as a `therundown` source. A later migration makes it nullable once nothing reads it.
- `SportsbookEvent` gains `oddsProvider` (the source currently pricing it) and `settledProvider` (the source or sources that graded it, beside `settledVia`).
- `SportsbookBet` gains `oddsProvider`, pinned at wager time with the odds.
- `SportsbookFeedRun` gains `provider`. A run that touches two providers writes one row per provider.
- Team aliases live in `packages/shared`, for example `SPORTSBOOK_TEAMS[league][teamId] = { name, aliases }`. They cover city/mascot splits, abbreviations and relocations.
- Matching takes a listing to a canonical game when the league matches, both teams resolve to the same team ids, and the start time is within ±3 hours.
  - With two candidates (an MLB doubleheader), take the nearest start.
  - When the match is still ambiguous, leave the listing unmatched and log it. Never guess.
  - Only the active odds source for a league may create a new canonical game. Other providers can only attach to existing games.

## Slice C details

- Each league has an ordered odds chain, set in server config rather than rulesets. The default is TheRundown, then The Odds API. Each league also stores its active provider, when it became active, and an optional admin pin.
- A provider fails a league for this run on:
  - an auth error, a persistent 429, a 5xx after retries, or a timeout;
  - a payload the adapter cannot parse;
  - a quota at or below the provider's floor, or an open circuit breaker;
  - a suspicious empty response: no events, or events with no prices, for a league and date where the last good snapshot from any provider still had future games in the window.
- An ordinary empty response is accepted as the answer, and the chain is not walked.
- On a failure the run tries the next provider in the chain. One run makes at most one fallback per league and at most two in total. The rest wait for the next run, so a network outage on our side costs one extra request, not every key.
- After 3 failed runs a provider's circuit breaker opens. That provider is skipped for 30 minutes, then retried once.
- A league switches back to a higher-ranked provider only after that provider has passed 2 consecutive runs on a different league or as a cross-check. An admin pin overrides the chain until it is cleared.
- Pulling a game off the board stays tied to one provider. Only the league's active odds source can pull a game for missing from a complete snapshot. A fallback that does not list a game never closes it.
- A source switch can move a line, because providers quote different books. Pinned odds keep accepted tickets safe, and the existing `SPORTSBOOK_ODDS_CHANGED` slip flow covers open slips. The feed banner names the current source when it is not the league's first choice.
- Admin › Casino Operations › Sportsbook feed shows one card per provider: health, circuit breaker, quota, last success and error, and the leagues it is serving. It also has **Pin league to source**, **Clear pin**, and **Check provider payload** for any provider and league, each written to the admin audit log.

## Slice D details

- Results checks follow the results chain: TheRundown, then The Odds API, then ESPN. A provider with `listResults` grades every open game in a league with one call, so grading cost stops growing with open tickets.
- "No result yet" or a request error moves on to the next provider. A `LIVE` answer stops the walk until the next check, and the existing backoff applies.
- Settlement is safe when:
  - a provider other than ESPN reports `FINAL` with both scores, and
  - no other source that has already reported a final score disagrees.
  If a second source is cheap (a bulk call already made this run, or ESPN), compare against it before settling.
- When two sources report different final scores, the game is held as `DISPUTED`. Settlement waits, and the admin panel lists the game with each source's score. An admin settles it with a chosen score, or voids it, both audited.
- An automatic void needs two sources to agree the game was cancelled or postponed. A single source saying so marks the game `PULLED` for betting and flags it, but does not refund. Admin void stays available.
- A game with no final from any source 72 hours after its start is flagged for admin review, not voided.
- Settlement keeps its row lock and `settledAt` check, so the poller, an admin recheck and an admin resolution can still race without paying twice. Add tests for each source agreeing, disagreeing and racing.

## Slice E details

- Over 30 days of beta: failovers per league, time spent off the primary, disputes and how they were resolved, units spent per provider against each plan, and matcher misses.
- Add SportsGameOdds only if the first two providers leave a real gap: a league or market they miss, or outages that overlap.
- Spreads and totals, from [RELEASE-1.8.0.md](RELEASE-1.8.0.md), are reconsidered under the chain. A market is offered for a league only while its active odds source supplies it, and is graded only by sources that can grade it.
- Record the decision and real spend here before any provider moves to a paid plan.

## Release gates

- With only `THERUNDOWN_API_KEY` set, the feed behaves exactly as 1.8.0-E: same requests, same snapshots, same settlement.
- With no key set, the server starts and the board says the feed is offline.
- Run **Check provider payload** on every enabled provider for NFL, NBA, MLB and NHL. Every listing must map, skipped must be 0, and every raw status must map to the outcome it means.
- Every current event and open ticket is backfilled to a `therundown` source, and open tickets still settle through it.
- Forced failover on beta (revoke the primary key, then restore it): lines stay open on the fallback, the source is shown, the league returns to the primary after hysteresis, and quota spend stays within the per-run cap.
- An offseason league walks no chain and spends nothing on fallbacks.
- Matching: no duplicate canonical games across providers for a full week of slates, including an MLB doubleheader.
- Grading: agreement settles once; disagreement holds as `DISPUTED`; a single-source cancel does not refund; a two-source cancel voids once.
- Terms of use are reviewed and recorded for every enabled provider. ESPN is enabled only as a results cross-check.
- The admin provider cards and pin controls pass the mobile, keyboard and axe audit.

## Explicitly deferred

- Choosing the best price across providers. The board shows the active source's line, not the best line.
- Mixing sources within one game, for example the home price from one provider and the away price from another.
- Live betting, parlays, player props and cash-out, as in 1.8.0.
- Raising the poll rate because more providers are available.

## Open questions

- What is driving this most: cost, reliability, or reaching spreads and totals?
- Do lines need to track real sportsbooks, or could an in-game bookie that sets its own lines from team ratings fit better? Only scores would be needed then, with the house edge kept in `packages/rulesets`.
- Is there a monthly budget ceiling? At $0, the chain is limited to free tiers and the delays they carry.

## Guiding question

**If any one provider disappears for a day, does a player still see open lines, and does every ticket still settle once, correctly?**
