# StreetsEmpire — Streets Daily Newspaper Roadmap

> **Status:** Planned; documentation only. **Branch target:** `beta`. **Release:** Player-experience / world-flavor milestone TBD.
>
> **Companion:** [The Street Report](ROADMAP-STREET-REPORT.md)  
> **Dependency:** [1.8.5 unified events](ROADMAP-1.8.5.md)

## Vision

**"The Streets Daily — Every empire leaves a headline."**

An in-world, old-school crime newspaper publishes a **public chronicle of what happened across the game world**: turf wars, notable alliance plays, city conditions, major community/seasonal events, and verified competitive achievements. It should feel like a collectible front page rather than a generic activity log.

**Clear separation:** the [Street Report](ROADMAP-STREET-REPORT.md) is a private, sometimes automatic personal catch-up popup. **Streets Daily** is an opt-in, browseable **public publication**, with a small optional "new issue" notice—not another mandatory login modal. Both can point to the same legitimate source events but must use different audience rules.

## Player-facing experience

- **Front page:** vintage, readable tabloid/newspaper treatment with masthead, edition date + issue number, hero headline, lead story/photo or illustrated category graphic, two-column secondary headlines, and compact stat callouts.
- **Sections:** Front Page; Turf & City Control; Alliance Watch; Underground Business & Economy; Event Bulletin; Hall of Fame / notable achievements. Only publish supported, appropriate public data.
- **Headlines with personality:** templated editorial voice ("Midnight Turf Shake-Up" / "Old Depot Sees New Boss") selected from truthful facts, not invented conflict. Headlines are deterministic and source-attributed.
- **Reader path:** open from Dashboard widget, Events or main navigation entry where it fits a consolidated menu; mobile vertical reading mode with newspaper typography and strong hierarchy.
- **Issue browsing:** current edition, previous issues/archive, city filters where sources permit, deep links to public turf board, Hall of Fame, event page, or published round recap.
- **Freshness:** scheduled publication once per calendar day by default **using a documented server UTC cutoff**; the cadence is configurable by admins and may later be tuned to round schedules. An issue covers an explicit [start, end) window and displays publication time in the player's timezone.
- **Low activity:** do not invent a major winner or conflict. Publish a clearly labeled quiet-day bulletin based on true standings/event calendar facts or suppress the edition and show "No issue published today."
- **Tasteful notifications:** a single optional "New issue" badge/brief toast per issue, separate from the Street Report; do not auto-open a second modal on return.
- **Cosmetic extras (later):** newspaper cover of the round, archival front-page collectibles, rotating press aesthetics. No stat advantages or real-money wagering ties.

## Public news eligibility and privacy

- Publish only facts intentionally **public** under current rules: control changes, completed/visible event outcomes, opt-in public achievements, permitted alliance activity, published rankings, and public city modifiers.
- **Never** publish personal cash balance, inventory, private crew assignments, hidden stash/locations, unpublished scouting, secret encounter choices, pending raids, unresolved wagers, identifying account details, staff logs, or private messages.
- No paid placement, false accusations, discriminatory or insulting player-generated copy, or publisher-created victory claims.
- Use preapproved server-owned headline/copy templates; escape user-controllable display names and enforce safe lengths. Prefer pseudonyms already allowed by profile settings, and respect public-profile/privacy/blocked-user semantics where applicable.
- If a related gameplay outcome can be reverted/corrected, define a **retraction/correction policy** rather than silently editing history; version editions with `issueId` and `revision`.
- New accounts and players in a fresh round should see relevant **round-wide public** issues only, not private historical details from someone else's season.
- No payout or competition power from opening, sharing, or being named in a paper.

## Editorial pipeline / technical design

1. **Ingest public facts** via vetted adapters to 1.8.5 event lifecycle receipts, completed combat/turf history, public alliance/news data, results/round archives, and publicly released competition results. No second settlement scheduler.
2. Build a **public-news projection** with stable source IDs, `roundId`, `cityId` (if relevant), `happenedAt`, `publicAfter`, visibility status, category, impact score, and safe display descriptors. A "fact" is not automatically eligible just because it exists in a player feed.
3. For each edition, compute an immutable **cutoff window** (server UTC), audience scope, source snapshot version, and edition number. A keyed idempotent publisher can safely retry after an outage; enforce uniqueness on round + edition date/cutoff + issue type.
4. **Editorial rules** select verified leads by importance, novelty, relevance and variety; limit repeated appearances by the same player/alliance; prioritize factual substance over raw clicks. Ties resolve deterministically.
5. Render/store **edition snapshots** containing selected source IDs, headline template IDs and final display copy. Reading the paper never triggers gameplay mutations, rewards, billing, bet settlement, or new encounters.
6. Serve current edition and archive through public-eligibility-checked routes, with pagination and caching; never expose internal moderation data or unfiltered source payloads in JSON.
7. Schedule safely with existing server job runner, timezone-aware UTC boundaries, job locks, retry/backoff, and metrics. An admin preview may build a **draft** but publishing requires permissions and an audited operation.
8. If a public source is updated or withdrawn, annotate/correct or retract affected articles using recorded provenance without silently mutating other historical facts.

## Implementation slices

| Slice | Focus | Deliverable |
| --- | --- | --- |
| **SD-A — Public News Audit & Rules** | Eligible public sources | Catalog safe event producers and privacy boundaries, rules for significance, retention, copy sanitization, and edition cadence; decide what belongs in public print. |
| **SD-B — Public News Projection** | Verified story candidates | Public-visibility filter, stable event provenance, source adapters for turf/event/competition/alliance outcomes, category and impact scoring, and indexes. |
| **SD-C — Edition Publisher** | Reliable, fixed-window releases | Daily UTC windows, idempotent edition IDs, deterministic editorial selection, archive snapshots, backfills, corrections, retries, job locks, and versioning. |
| **SD-D — Newspaper Visual Experience** | Authentic publication UI | Responsive newspaper layout, illustrated section masthead, strong headline hierarchy, desktop paper columns, mobile reading cards, accessible controls, archive reader. |
| **SD-E — World Integration & Discovery** | Newspaper becomes useful | Dashboard "Today's Headlines", event/turf/Hall of Fame deep links, consolidated nav location, city/round filters, optional new-edition indicator, no return-popup collision. |
| **SD-F — Admin Editorial Tools** | Safe and testable publishing | Preview upcoming issue, adjust approved templates/scoring parameters, view source provenance, suppress unsafe sources, annotate corrections/retractions, audit privileged changes. |
| **SD-G — QA, Performance & Launch** | Trust, performance and polish | Verify publicity rules, factual headlines, edit/revision flow, historical rounds, empty/quiet days, caching, load, accessibility, rollout flag, incident rollback. |

## Layout sketch (text)

```text
+--------------------------------------------------------------+
|                       THE STREETS DAILY                      |
|  ROUND 12  |  VOL. 04  |  THU OCT 15  |  PUBLIC CITY EDITION |
+--------------------------------------------------------------+
|  CITY'S EAST SIDE CHANGES HANDS                              |
|  Confirmed turf-control result and destination to public board|
|                                                              |
|  ALLIANCE WATCH             |  UNDERWORLD ECONOMY             |
|  Verified alliance action   |  Public event/market condition  |
|                                                              |
|  EVENT BULLETIN             |  HALL OF FAME                   |
|  Upcoming public event      |  Published achievement         |
+--------------------------------------------------------------+
|  PREVIOUS ISSUES  •  FILTER CITY  •  VIEW FULL STORY         |
+--------------------------------------------------------------+
```

*Illustrative labels above are placeholders; production headlines must correspond to real source events.*

## Interaction with Street Report and major popups

- **Street Report:** priority-first personal briefing generated on return, with urgent direct actions and separately acknowledged delivery.
- **Streets Daily:** scheduled public snapshot available on demand; only an optional badge/notice announces a new issue. A public headline can appear in the Street Report as "New Streets Daily published", not as a second forced newspaper popup.
- **Combat / random encounters:** big raid alerts and time-sensitive encounter decisions keep their own orchestrated flows. Newspaper articles describe **already public and resolved** events, never live secret intentions.
- **One event, one outcome:** event adapters may feed both experiences but do not resettle, double-credit, or double-notify on the same source.

## Release quality gates

- Each headline can be traced to one or more immutable authoritative public source IDs and exact publishable timestamps.
- Publishing the same edition twice under retry/concurrency creates **one** issue, not two.
- A public endpoint cannot return private player details, secret movements, unresolved bets, hidden encounter offers, or undisclosed admin-only material.
- Round and edition boundaries never merge outcomes from unrelated rounds or accidentally attribute old data to a new round.
- An article that becomes ineligible is corrected/retracted visibly according to policy; old caches expire/invalidate safely.
- New and quiet rounds produce a truthful quiet edition or no edition, never fictional news.
- Player names and titles render safely at extreme lengths; user-controlled text cannot inject HTML/markup into the issue.
- Archive works on mobile, desktop, reduced motion, keyboard and screen readers; 2-column newsprint never becomes unreadable on small screens.
- The paper never blocks login, an encounter, a raid alert, or the Street Report.
- Publication and archive reads are bounded/cached; scheduler errors are observable and recoverable, and a failed publication does not affect normal gameplay.
- Admin editorial actions are authorized, audited, and cannot rewrite authoritative combat/event history.

## Dependencies and sequencing

Implement **SD-A → SD-B → SD-C → SD-D → SD-E → SD-F → SD-G**. Ship the private Street Report first if the team has to sequence engineering capacity, but build shared public-safe event projection primitives to avoid duplicate fetch logic. Depend on [1.8.5](ROADMAP-1.8.5.md) for event source truth, not for a forced newspaper scheduling redesign.

**Definition of done:** players can read a believable, beautiful, accurate record of the city's unfolding history without exposing secrets, duplicating economic outcomes, or interrupting gameplay.
