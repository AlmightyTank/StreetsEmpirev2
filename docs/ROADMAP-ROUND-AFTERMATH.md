# StreetsEmpire — Round Aftermath & Statistics Roadmap

**Target:** beta · future feature release (version to be assigned)  
**Status:** Slices A–H implemented; production rollout checks requiring the beta database remain operational.
**Goal:** Replace the bare “round ended / top standings” experience with a permanent, compelling end-of-round report covering **every city** and the complete criminal economy, with a personal performance view and a compact Discord recap.

## Player experience

At round close, show a new **Round Aftermath** page. A player can switch between **Entire Round**, **By City**, **My Empire**, and **Alliances**, explore statistics grouped into Wealth, Turf, Crew, Drugs, Businesses, Crime, and Competition, and browse prior rounds forever.

- **Entire Round:** participants, cities, alliances, economic totals, distribution bars, top 10, standout moments and record holders.
- **By City:** city selector is **data-driven from the round**, never hard-coded to New York or any fixed list. Show each city's player activity, wealth, turf outcomes, drug production/sales, businesses, crime and local standings. Handle players who traveled through multiple cities with clear attribution rules.
- **My Empire:** frozen final rank/net worth, personal totals, contribution to global economy, category ranks/percentiles, career records and earned awards. Do not imply an account played when it did not.
- **Alliances:** final membership / owner context where reconstructable, territorial dominance, captures, defenses, and alliance leaderboards, without exposing private data.
- **Records:** discover category champions and top 10 per category, distinguishing final snapshot measures from cumulative round totals. Only award records that have trustworthy persisted evidence.
- Visual direction: dense Tarkov-style end-of-wipe statistics panel reimagined for StreetsEmpire; muted dark surfaces, ivory/gold highlights, bars, sparklines only where time-series exists, responsive mobile cards, accessibility and reduced-motion support. Support player shell/accent styling without sacrificing readability.
- Navigation: round-end handoff -> `/game/rounds/:roundId/aftermath`; also link from Rankings, Hall of Fame and past-round archive. Nonparticipants can view authorized **public** global records; personal view requires account ownership.
- Display a “report preparing” state until the canonical frozen report is published; do not show partial totals as final.

## Metric definitions (establish source, unit, aggregation and eligibility per metric)

| Pillar | Global / city | Personal / record examples |
| --- | --- | --- |
| Wealth | final net worth distribution; total money **earned** vs **spent** by eligible tracked sources; business vs street income; avoid calling summed earned money “final wealth” | final net worth, gross earnings, spending, category rank; Wealth King |
| Turf | claims/captures, defenses, control at final cutoff, block-hold time, contested cities | personal captures, defenses, hold duration; Turf Warlord |
| Crew | recruited, released/lost if reliably logged, role assignments, end-of-round crew count | peak roster, most experienced crew/specialist where tracked; Crew Commander |
| Drugs | produced units **by product**, scouted, transported, sold; only real product keys in ruleset | top producer, dealer/sales leader; Drug Kingpin |
| Businesses | owned at finish, gross revenue, net profits only when expenses are observable | highest business income, largest footprint; Business Tycoon |
| Crime | raids attempted/won, defensive victories, drive-bys, recon and other tracked activities; label actions vs wins | highest raid victories, most defenses; Most Feared (precise rule required) |
| Competition | final national/local placement, city leaderboards, alliance outcomes, active participants | top 10 and position/percentile for everyone, personal bests |
| Optional | casino wins/losses, runs/transport, quests, law/heat, event results where source coverage is reliable | separate records rather than forcing into core 7 pillars |

**Critical correctness:**
- Define money as integer cents (or bigint-backed decimal) and convert for display only. Never blend total wager volume with winnings, revenues with profit, or drug units across unlike measures without a labeled total.
- Each metric definition documents table/query, event timing, scope (round/city/player/alliance), de-duplication, and historical availability. Do not fabricate unavailable counters or award records from unreliable proxies.
- Multi-city attribution: round-global player performance is counted **once**; city-level event metrics attributed to the event's city if recorded; final roster/net worth attributed to final city with explicit label; never sum the same player's entire wealth once for each visited city.
- Membership and alliance affiliation must be as-of the final cutoff (or explicitly marked historical); avoid present-day relationship joins that rewrite old outcomes.
- Counts of players, cities, and alliances use clear definitions (e.g., joined, active, had events, existed). Make zero-activity cases and ties explicit.
- Percentiles and tied records use documented ranking rules. Historical round rulesets determine eligibility.

## Existing beta integration points (review before edits)

- `apps/server/src/services/round.service.ts`: `closeRoundInTransaction` settles, freezes standings and marks ENDED; hook canonical snapshot creation **after** final settlement, supporting normal expiry, end-early, and handoff.
- `apps/server/src/routes/round.routes.ts` and `apps/server/src/game/dto.ts`: existing `roundOver` player presentation is a foundation, not a complete aftermath report.
- `apps/server/src/services/season-stats.service.ts`: reuse bulk per-player tracked stats, but verify semantics and historical persistence.
- `apps/server/src/services/notification.service.ts`: `finalStandings` currently provides the top 10.
- `packages/shared/src/types/community.ts`: extend versioned `DiscordRoundEventDto` cautiously.
- `apps/discord-bot/src/format.ts` `roundEventEmbed` + `apps/discord-bot/src/index.ts`: existing minimal Discord end post; use same frozen aftermath source.
- `apps/web` Rankings/Hall of Fame/routes and `apps/site` historical statistics: integrate navigation and archive rather than create a disconnected history.
- Prisma snapshot tables/migration required; avoid recalculating historical standings with newer rules.

## Delivery slices

### Slice A — Audit, definitions, and immutable round snapshot
**Status: Complete.** The canonical version-1 report is created in the round-close transaction after settlement and final standings. See [ROUND-AFTERMATH-METRIC-INVENTORY.md](./ROUND-AFTERMATH-METRIC-INVENTORY.md) for source definitions and unsupported metrics.

- `RoundAftermathReport` stores status, schema/source revisions, cutoff/finalized timestamps, global/city/player aggregates, category records, optional alliance data, and metric provenance.
- Close retries are protected by the round lock and unique report-per-round row. A failed close rolls back both the round transition and report.
- Historical ended rounds are seeded as `UNAVAILABLE`; no unsupported values are recalculated from current state.
- Version 1 records final wealth, final crew headcount, final turf ownership, active business footprint, and attempted raid/drive-by counts. Unsupported cumulative metrics are `NOT_RECORDED`, never fabricated as zero.
- Unit coverage checks tied records, empty rounds, dynamic cities, and exact integer-cent handling. Round lifecycle integration coverage exercises normal expiry, concurrent retries, and handoff cutoffs.
- Report corrections/rebuilds are not exposed; a future rebuild must be an explicit audited operation.

### Slice B — Global Aftermath dashboard
**Status: Complete.** Public, read-only report APIs and `/game/rounds/:roundId/aftermath` now read only the canonical frozen report. Preparing and unavailable states never expose partial totals.

- Overview and category endpoints expose frozen global/city stats and the seven pillar states; paged leaderboards expose only display names, public pimp IDs and report metrics, never stable account or round-player IDs.
- The dashboard includes the overall summary, final wealth top 10, supported record highlights and accessible category tabs/comparison meters.
- Rankings and Hall of Fame link to the aftermath and past-round archive.
- Mobile layouts, loading/error/empty states, keyboard tab navigation and reduced-motion styles are included.
- Leaderboards are paginated server-side with stable tie ordering; supported counters and frozen final placement only are used.
- Unit coverage verifies exact-cent ordering, tie ranks, pagination and absence of private identifiers in the response projection.

### Slice C — Every city and alliance breakdown
**Status: Complete.** Schema version 2 freezes stable city slugs/local standings and alliance membership, leadership, eligible combined wealth, and member turf/business control in the round-close transaction.

- City selection is derived from frozen participant/turf cities; city details and local standings use only the report snapshot and expose no stable player/city database IDs.
- City wealth and crew use eligible residents' final city once; turf/businesses use physical city. Crime attempts remain unattributed because their source has no event city.
- Alliance roster/leader and member-held territory reflect exact cutoff state. Alliance wealth is integer-cent summed over eligible members; ties share ranks. Historical timed control, captures, defenses and war outcomes remain unrecorded.
- Version-1 ready reports remain available globally; their absent city keys and alliance cutoff data are reported unavailable rather than reconstructed from mutable state.
- Unit coverage checks city slugs/local rank projection, alliance membership/wealth/control, and private identifier omission.
- **Done when:** any represented city can be selected and city totals reconcile with global totals where additive.

### Slice D — Personal empire after-action report
**Status: Complete.** Authenticated `GET /rounds/:roundId/aftermath/me` resolves the signed-in account only against the frozen report and returns a sanitized personal projection.

- Personal view shows frozen final rank/percentile, wealth, turf, crew, businesses, attempted crime actions, available category ranks/ties and explicit unrecorded drug totals. Percentile is `(eligible competitors - rank) / (eligible competitors - 1)`; a sole eligible player is at the 100th percentile.
- Milestones include national podium/top-ten, local champion and supported category leadership; personal bests compare eligible results across earlier ready reports.
- A ready report with no account row is explicitly `NOT_PLAYED`; preparing and unavailable reports have unknown participation and no partial data.
- The endpoint requires authentication and does not return account, round-player, or city database IDs or another player's personal aggregates.
- **Done when:** a player can see their full personal report and nobody else can access private fields.
- **Done when:** a player can see their full personal report and nobody else can access private fields.

### Slice E — Records, awards, and Hall of Fame
**Status: Complete.** The Records & Awards tab exposes paginated global and city leaderboards with explicit formulas and supported award winners.

- Wealth King follows frozen national rank; Turf Warlord, Drug Kingpin, Crew Commander, and Business Tycoon use eligible players' cutoff holdings/inventory. Round Champion follows rank #1. Ties share awards.
- Drug Kingpin measures total drug units held at cutoff, attributed to the player's final resident city; it is explicitly not a production or sales total. Most Feared remains unawarded because attempts do not prove victories or fear. City crime is not attributed.
- National top-10 placements and supported global award distinctions, including Drug Kingpin, earn $500 each toward next-round starting cash, capped at $2,500 per player. City awards are recognition only.
- Claims are written atomically with the new round player, uniquely keyed per account and target round, and included in the join activity record. Only the immediately preceding ended round's `READY` report qualifies.
- Hall of Fame and Rankings link directly to the Records & Awards view.
- **Done when:** record holders match canonical frozen metrics, rewards are auditable/idempotent, and archives survive later seasons.

### Slice F — Discord full round recap
- **Status: Complete.** Replaced the minimal post with one compact embed sourced only from a `READY` aftermath report. It includes final participants, ranked competitors, cities, alliances, final net worth, final crew, cutoff turf/business holdings, attempted crime actions, the top three and supported Round Champion, Wealth King, Turf Warlord, Drug Kingpin, Crew Commander and Business Tycoon winners.
- Unsupported earnings/spending, captures/defenses, recruiting, drug production/sales, business revenue and contested-city totals are explicitly labeled not recorded; the embed does not infer them. Drug Kingpin uses cutoff inventory held.
- Links directly to `/game/rounds/:roundId/aftermath`, escapes player text and mentions, disables Discord mentions, and keeps exact cents when formatting money.
- Round posts use a dedicated claim endpoint and a five-minute delivery lease; only a Discord message receipt marks delivery. Failures are persisted and retried, and the bot checks recent channel history using a stable report marker before retrying to recover a send whose receipt was interrupted by a restart. Posts are not claimed without a usable news channel and read-history permission.
- Personal stats and the optional banner image are intentionally excluded from the public embed.
- **Done when:** one correct, legible, retry-safe recap is delivered per round.

### Slice G — Round archive and shareability
- **Status: Complete.** Added a paginated public archive for ended/archived rounds, with name, year, report-state and sort filters. Historical rounds without a canonical frozen report remain discoverable and are explicitly marked unavailable; their metrics are neither shown as zero nor reconstructed.
- The archive URL preserves filters, pagination and up to two comparison selections. Its side-by-side comparison reads only the selected rounds' frozen overview reports, while unavailable reports show no fabricated totals.
- Permanent report URLs support shareable view/category/city query parameters and a copy-link action. Cross-links are available from the public landing-site navigation, Hall of Fame, Rankings, and the report itself.
- **Done when:** old recaps remain readable and linkable through later rounds.

### Slice H — QA, scale, rollout and operations
- **Status: Implementation complete.** Close-time source reads remain batched (no per-player queries); player-by-city holdings are accumulated sparsely rather than scanning every city for every player. Public frozen report/archive responses use short shared-cache headers; personal reports remain `private, no-store`.
- Public aftermath/archive endpoints can be staged with `ROUND_AFTERMATH_PUBLIC_ENABLED`; web/site builds use the matching `VITE_ROUND_AFTERMATH_PUBLIC_ENABLED` from their app-level environment. Both default to enabled for existing deployments. Disabling these flags hides public navigation and removes the public report routes without disabling report capture, Discord delivery or next-round rewards; Discord aftermath links fall back to Hall of Fame while public reports are disabled.
- Responsive archive controls and report cards collapse for mobile; comparison tables stay inside scroll containers, and reduced-motion preferences are respected. Loading, error, empty, unavailable and preparing states are explicit; report links are present on the round-over handoff.
- Focused tests cover aggregation ties/precision and archived, unavailable and invalid reports. Database-backed close/restart, production-scale load and Discord delivery checks require the beta integration environment and must be run before production rollout.
- **Release checklist:** set matching `ROUND_AFTERMATH_PUBLIC_ENABLED` in the server environment and `VITE_ROUND_AFTERMATH_PUBLIC_ENABLED` in both web/site build environments; apply pending Prisma migrations; confirm ended rounds have `READY` or explicit `UNAVAILABLE` reports (never reconstruct history); smoke-test archive search, pagination, unavailable rounds, two-report comparison, shareable category/city URLs and the round-over link; verify the same frozen totals in the Discord recap; exercise a retry after bot interruption; verify next-round awards remain capped/idempotent; repeat on a narrow viewport with keyboard navigation and reduced motion.
- **Done when:** round-close, public archives and Discord can ship with reproducible end-to-end checks.

## Proposed data/API contracts

- `RoundAftermathSnapshot` (conceptual): roundId, version, state (PENDING/BUILDING/READY/FAILED), cutoffAt, finalizedAt, metricCatalogVersion, sourceRunId, globalTotals, citySummaries, allianceSummaries, awardRecords, validationNotes.
- `RoundAftermathPlayer`: snapshotId, roundPlayerId, city-at-cutoff, metrics, categoryRanks, privacy/publicSummary.
- `GET /api/rounds/:roundId/aftermath`: sanitized public overview + preparation state.
- `GET /api/rounds/:roundId/aftermath/cities/:citySlug`: frozen city metrics and local standings.
- `GET /api/rounds/:roundId/aftermath/alliances`: frozen cutoff alliance roster, leadership, wealth and control.
- `GET /api/rounds/:roundId/aftermath/records?category=...`: paginated ranking.
- `GET /api/rounds/:roundId/aftermath/me`: authenticated account's owned data only.
- `GET /api/rounds/aftermath/archive`: public index with closed-round paging and filters.
- `GET /api/rounds/:roundId/aftermath`: permanent public report; view/category/city state is URL-addressable.

## Discord embed structure (compact and within Discord limits)

Title: **ROUND #NNN — AFTERMATH**  
Description: the round is over; a one-line narrative.  
Fields: **The Final Numbers** (players, cities, alliances, earned wealth, turf captures, crew recruited, drugs produced, business revenue, crime actions); **Top 3 Empires**; **Legends of the Round**; **City Wars**.  
Link: **View Full Round Aftermath** -> canonical archive URL.  
Use 2–4 short fields or split into a minimal number of embeds only if Discord field/description limits require it; never silently truncate a winner name or statistic.

Example values in previews are illustrative. **Production must only display verified finalized metrics**. Unsupported metric => “Not recorded for this round,” not zero.

## Rollout dependencies / guardrails

1. Slice A is the prerequisite for B–H. B and C can be visually prototyped first, but never shipped using invented numbers.
2. Existing rounds' frozen standings, ruleset pinning, and Street Pass cosmetic grants must be preserved.
3. Ending a round must not fail solely because Discord is offline; snapshot/post pipelines are resumable.
4. Once READY/published, report and Discord results must agree; revisions require an explicit audited admin workflow.
5. No paid supporter advantage or gameplay reward tied to historical stat awards.
6. No hard-coded single-city assumption: every global metric and city filter supports every city on the round.
7. All aggregate views use real player events and historical ownership; no double counting.

## Acceptance scenario

End a multi-city beta round with players, businesses, drug production/sales, raids, turf changes and alliances. Confirm a frozen report appears; test global numbers, two cities, two player accounts and a player who traveled; compare leaderboards and round standing values. Restart bot mid-delivery and check one Discord post linking to the same report. Start the next round and verify archived stats remain identical.
