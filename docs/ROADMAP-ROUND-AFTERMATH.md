# StreetsEmpire — Round Aftermath & Statistics Roadmap

**Target:** beta · future feature release (version to be assigned)  
**Status:** Slices A–B implemented; slices C–H planned
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
- Derive list from actual round participation/available city data, not hard-coded examples.
- Implement city selector, city-specific metric definitions and local ranking; cross-city attribution and travel edge cases tested.
- Alliance final/timed control and competitive highlights only where historic join/control evidence is available.
- **Done when:** any represented city can be selected and city totals reconcile with global totals where additive.

### Slice D — Personal empire after-action report
- Secure player-owned personal report endpoint with final rank, wealth, turf, crew, drugs, business, crime, category ranks, percentile and comparisons.
- Highlight milestones, category-specific personal bests from archived reports, and distinctions earned.
- Preserve privacy of sensitive operational data, even after a round; public pages reveal only approved public counters.
- **Done when:** a player can see their full personal report and nobody else can access private fields.

### Slice E — Records, awards, and Hall of Fame
- Define transparent, reproducible award formulas: Wealth King, Turf Warlord, Crew Commander, Drug Kingpin, Business Tycoon, Most Feared; optionally Casino King and other verified categories.
- Deterministic ties and eligibility; no grants of spendable power. Permanent badges/titles only after explicit product decision; otherwise awards are historical display records.
- Add global and city top-10 drilldowns and permanent links from Hall of Fame and Rankings.
- **Done when:** record holders match canonical stored metrics and archives survive later seasons.

### Slice F — Discord full round recap
- Replace the current minimal end-of-round embed with a polished **one-message** summary sourced from the finalized report: participant/city/alliance counts, wealth earned, turf captures, crew recruited, drugs produced, business revenue, criminal actions, top 3 by **final rank/net worth**, award winners and most contested city where supported.
- Link to `/game/rounds/:roundId/aftermath`; escape Markdown/mentions and respect Discord embed field/character limits.
- Only post when snapshot status is finalized. Reuse notification claim/delivery infrastructure and add durable idempotency/delivery receipt; retries, duplicate claims, bot restarts, missing permission and partial failures covered.
- Optional branded banner image is separate from core delivery; generated from frozen data and has text-only fallback. Keep personal stats out of public embeds.
- **Done when:** the existing basic post is replaced with one correct, legible, retry-safe recap per round.

### Slice G — Round archive and shareability
- Add archive index/filters for closed rounds and permanent report URLs, including old rounds with partial data.
- Shareable public report/category links and optional player-approved share card; public/private fields cannot leak in previews.
- Ensure archive cross-links from landing site, Hall of Fame, Rankings and round-end screen.
- **Done when:** old recaps remain readable and linkable through later rounds.

### Slice H — QA, scale, rollout and operations
- Integration tests for aggregations vs database fixtures, entire-round/city reconciliation, money precision, tie rules, cross-city activities, deleted/deactivated players, high player counts, early endings and bot delivery.
- Verify report snapshot cost on large rounds; no per-player N+1, limit API payloads, cache immutable snapshots; report progress visible to admins, retry without duplicate awards/posts.
- Beta UX pass at desktop and mobile, accessibility, fallback labels for missing fields, metrics validation and bot preview in admin round tools.
- Feature flag for staged beta release, dry-run backfill and rollout checklist; do not change game rewards or final ranking rules.
- **Done when:** round-close, public archives and Discord can ship with reproducible end-to-end checks.

## Proposed data/API contracts

- `RoundAftermathSnapshot` (conceptual): roundId, version, state (PENDING/BUILDING/READY/FAILED), cutoffAt, finalizedAt, metricCatalogVersion, sourceRunId, globalTotals, citySummaries, allianceSummaries, awardRecords, validationNotes.
- `RoundAftermathPlayer`: snapshotId, roundPlayerId, city-at-cutoff, metrics, categoryRanks, privacy/publicSummary.
- `GET /api/rounds/:roundId/aftermath`: sanitized public overview + preparation state.
- `GET /api/rounds/:roundId/aftermath/cities/:cityId`: city metrics.
- `GET /api/rounds/:roundId/aftermath/records?category=...`: paginated ranking.
- `GET /api/rounds/:roundId/aftermath/me`: authenticated account's owned data only.
- `GET /api/rounds/aftermath/archive`: public index.
- These are intended contracts, not existing API claims; align naming with current Fastify route conventions.

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
