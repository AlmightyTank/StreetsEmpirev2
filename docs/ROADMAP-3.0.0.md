# StreetsEmpire 3.0.0 — Empire Cohesion

Planning source of truth: `openspec/changes/empire-cohesion-3-0/`. The [Territory Perks Roadmap](https://github.com/AlmightyTank/StreetsEmpirev2/blob/beta/docs/ROADMAP-TERRITORY-PERKS.md) informs the full passive-perk scope; its sample percentages, districts, tier thresholds, and city list are proposals, not overrides of this plan or the live catalog.

## Goal

Make multi-city holdings work together: hold a city, connect it to logistics, compete for zone control with an alliance, see bounded passive perks and their sources, and choose where to reinvest. Map expansion must create strategic tradeoffs rather than repeat existing cities. Existing counts, turf ownership, city-control history, settlement, and bookmarked screens remain authoritative.

## Locked rules

- One existing **alliance** grows to at most **7 members** on 3.0-pinned rounds. There is no separate org, alliance merger, or three-sect roster. Older rounds retain their own membership cap, 24-hour leave cooldown and combat rules.
- Existing alliance **city control is three of five blocks**. For a zone, count each alliance's controlled cities there. The alliance with strictly more than every rival controls the zone; **one city can be enough**, while a tie or no controlled cities means no controller.
- **Zone map:** Northeast = New York City, Boston, Philadelphia; Midwest = Chicago, Detroit, Toronto; South = Tulsa, Dallas, Atlanta, Miami Beach, Monterrey; West = Seattle, San Francisco, Los Angeles, Las Vegas. Toronto and Monterrey are gameplay assignments beyond the U.S. regional map. San Francisco already replaces Beverly Hills in the `1.8-s` seed; rounds pinned before that replacement retain Beverly Hills. Mexico City remains supplier-only in 3.0 and does not count.
- Alliance pacts enable cooperation **without an attack ban**. An attack between pact allies resolves normally and automatically ends the pact. Both sides see a "pact broken" record; cooperative access and pending backup close immediately, without undoing settled actions. Same-alliance friendly-fire rules stay intact.
- Territory grants **access** (places, stock, jobs, routes, open to non-holders only by toll where allowed), **yields** (resources accruing into a capped local cache that must be collected and can be raided), and small passive perks. All last only while control holds. District effects depend on qualifying turf, city identity effects on existing city control. An alliance leading a zone—even through one city—can select that zone's regional power perk immediately. **Only one regional perk is active at a time**, and its strength grows with the **number of zones the alliance controls**, under ruleset-pinned caps. Losing control lowers or revokes future eligible effects; past settlements are never rewritten.
- A shared server modifier resolver applies eligibility, deterministic rounding, stacking and category caps at settlement; eligible previews and receipts explain sources. No casino outcome-odds boosts, purchased power, or permanent competitive power from milestones. Participation requirements and selection cooldown guard against alliance hopping. The linked roadmap's example rates are simulation hypotheses, not approved values.
- `classic-og-v3.0-a` is not created until 2.0 is finished. When it is added, it inherits `classic-og-v2.2-a`, not `classic-og-v1.8-s`; later slices spread forward. Old pinned rounds do not acquire 3.0 cities, pacts, perks, or zone effects.

## Release slices

| Slice | Outcome | Gate |
| --- | --- | --- |
| **3.0-A — Foundation** | Audit real catalogs/control/buffs; per-city holding read-model and reconcile; identity-default 3.0 ruleset. | Existing ownership/counts unchanged; pre-3.0 rounds isolated. |
| **3.0-B — Alliance cohesion** | Single 7-member alliance, ally pacts and break-on-attack, interstate contracts, alliance UI. | Last-seat races, pact betrayal, idempotent payouts, legacy membership/combat tests. |
| **3.0-C — Logistics** | One quote for pickups, shipments and lanes; Regional Courier evaluated only in simulation. | Capacity/stock/room conservation, clear refusals, no settlement fork or must-pick lane. |
| **3.0-D — Map** | Four playable additions: Toronto, Boston, Philadelphia and Monterrey; existing San Francisco stays in the West; complete city content and zone assignments; small block-holding dealer bonus. | Each addition offers a distinct sim-proven strategy; rounds pinned before the San Francisco replacement retain Beverly Hills and its routes; Mexico City remains supplier-only. |
| **3.0-E — Law** | City evidence plus alliance investigation, bounded raids/bribes, cross-city case view. | No double-write or farm loop; pressure and costs remain legible. |
| **3.0-F — Local rewards** | Audited district and city catalogs of access, yields and perks; access gate and tolls; yield clocks and caches; shared modifier resolver, action previews and receipts. | Ownership flips immediately affect future settlements; caps, rounding and older rounds tested. |
| **3.0-G — Zones** | Strict-lead zone standings, one selected scaling regional perk, officer controls, contribution safeguards. | One-city leads and ties work; one perk only, immediate revocation and no stacking exploits. |
| **3.0-H — Experience** | Alliance > Empire Perks, influence-only alliance wars, territory-gated encounters, cosmetic milestones, rankings and aftermath. | Accessible explanations, privacy-safe views, once-only event/cosmetic grants. |
| **3.0-I — Release** | Admin diagnostics, simulations, load/exploit and historical-round tests, staged opt-in. | No must-pick zone/perk/city; `qa:release --with-db --with-load` and rollout gates pass. |

Names for later `classic-og-v3.0-*` rulesets are finalized as slices land, not retroactively changed on in-flight rounds. Rollback pins new rounds to a prior version and disables future perk/event activation; settled receipts and historical ownership are never rewritten.

## Slice notes

**Holdings and logistics.** One per-city holding view aggregates turf, fronts, paid-up properties, dealer crews, stock and law pressure from existing records. Dispatch previews show goods cost and fees, fleet/crew effects, travel time, risk band, room, pressure, and cash remaining. Existing pickup/shipment/lane settlement and reservation rules remain the source of truth.

**Map with roles.** Toronto closes the northern-lane gap; Boston and Philadelphia give the Northeast meaningful alternatives to New York; Monterrey provides a southern hub. Each addition needs demand, property, turf, law and travel differentiation proven in city/route simulations. San Francisco already supplies the West route/market role in the `1.8-s` seed; Beverly Hills and its original routes remain intact only for rounds pinned before the `1.5-e3` replacement. The dealer-on-owned-block sales-pace bonus starts with **+8% as a hypothesis**, is capped/nonstacking and sim-finalized before pinning. Regional Courier (2,500/load, $3,000 + $4/unit, 6h) is a **sim-only candidate**, not a promised card. Playable Mexico City is deferred pending evidence that Monterrey succeeds as a distinct hub without cannibalizing Dallas.

**Territory perks.** Audit actual district keys and existing effects before registering a catalog: example industrial/market/transit/residential labels and percentage values in the linked roadmap may not match live districts. District, city and regional effects use explicit source IDs, eligible actions, scope, fixed-point rounding, and separate capped stacking categories. A zone's perk identity is chosen by an officer, but its strength depends on total zones led—not a within-zone city-count tier. A selected perk whose source zone is lost becomes inactive until an eligible choice is made. A player can trace applied effects in action receipts and the Empire Perks panel; admin diagnostics show control inputs and reasons an effect is inactive.

**Competition and events.** Interstate contracts reuse existing run/shipment/sale settlement. Alliance wars score visible influence actions in windows, with cosmetic placement awards and no property destruction. Territory-exclusive encounters, region-hold milestones and prestige use the consolidated 1.8.5 event and existing entitlement systems, never a competing scheduler. Permanent awards remain cosmetic; qualifying territory power lasts only while eligibility holds.

## Balance and release safeguards

- Simulate catalog values, zone-count scaling and caps across solo/alliance fields and bankroll sizes before enabling each perk slice. No fixed percentage in the linked roadmap is approved by reference alone.
- Server settlement rechecks live control, membership, contribution and the selected perk; retries and parallel control flips cannot grant expired or duplicate bonuses. Show what changed in receipts and auditable control events.
- Keep combat modifiers small and bounded; no casino odds changes, purchased advantages, member/property trades, or rewriting old rounds. Territory yields are the only passive income: capped caches, diminishing returns per holding, an alliance daily ceiling, and no carry-over between rounds.
- Verify phone and desktop layouts, keyboard navigation, accessibility, stale clients, rollback, admin permissions, and a 7+ day full-season simulation before enabling new rounds.

## Guiding question

Do my holdings across cities work like one empire, where each new city, route and controlled zone creates a choice worth planning around—without erasing the original street game or making a large alliance unbeatable?
