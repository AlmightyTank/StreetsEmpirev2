# StreetsEmpire 3.0.0 — Empire Cohesion

Source of truth for planning: `openspec/changes/empire-cohesion-3-0/` (proposal, design, `regional-holdings` + `organization-layer` specs, tasks). This doc is the readable roadmap derived from those artifacts.

## Purpose

1.x–2.0 built systems that play side by side: turf, business fronts, warehouses/safehouses/hideouts, supply orders/pickups/shipments/lanes, dealer crews, vehicles, crew roster, law/heat/cases, factions/contracts, casino/sportsbook, events. A player holding three cities manages three disconnected loops.

3.0 makes multi-city play feel like one organization.

**The question:** My blocks in different cities finally work like one organization — why should I hold Chicago + Dallas + a lane instead of just farming one city?

**Core loop:**

> Hold a city → connect it to the network → run interstate work → grow org influence → defend standing → reinvest

**Theme:** Empire Cohesion. **Constraint:** expand map/systems only where they create a cohesion reason (close the northern-lane gap, make the southern branch playable, give orgs a cross-city identity).

## Design principles

1. **Counts stay authoritative.** Turf/business/stock/crew columns remain the source of truth. Holdings and org rows follow them; 3.0-A adds reads, not rewrites.
2. **Properties enable activity; they do not print money.** Carried forward from 1.6. No passive-income buildings.
3. **Every dispatch shows the full deal.** Goods cost + fees, fleet capacity, crew effect, route time, visible risk band, storage room, landing-city pressure — before commit. No hidden drains.
4. **Modifiers are pinned, capped, and visible.** Holding effects default to identity until sim passes. Crew specialty caps (5%) carry forward; no stacking.
5. **Law is pressure, not punishment.** Investigations follow the org across cities with bounded raid/bribe/lay-low valves, all priced upfront and audited.
6. **Competition rewards recognition, not power.** Org wars score influence points only in v1. Rewards are cosmetics, trophies, titles, Hall of Fame — never turns/cash/product/combat/pace.
7. **New cities earn their place.** A city ships only with distinct leans, costs, connections, turf difficulty, and law profile, proven by sim to enable a strategy that did not exist.
8. **Rounds pin rulesets.** `classic-og-v3.0-*` slices spread the prior version. Pre-3.0 rounds never see new behavior.

## Release shape

Slices **A–C** build cohesion on the existing map. Slices **D–F** expand and compete. Slice **G** proves and releases.

| Slice | Theme | Outcome |
| --- | --- | --- |
| **3.0-A — Holding read-model** | One card per city | Holding aggregation (corners, fronts, properties + upkeep, crews, stock by place, pressure) with reconcile checks; modifiers default to identity. |
| **3.0-B — Org layer + contracts** | Identity above alliances | Org create/join/leave, interstate contracts on existing settlement, org dashboard. |
| **3.0-C — Unified logistics** | One planner | Single quote path for pickups/shipments/lanes; existing specialties assignable; no settlement fork. |
| **3.0-D — New holding nodes** | Map with reason | Northern playable city (default Toronto, confirm via sim) + playable Monterrey; block-holding foot-traffic decision. |
| **3.0-E — Cross-city law** | Pressure follows the org | Evidence routing to city cases + investigation progress; bounded raids/bribes; case cross-city view. |
| **3.0-F — Org wars + aftermath** | Scored competition | Transparent influence windows through the 1.8.5 event system; cosmetic rewards; regional rankings/aftermath. |
| **3.0-G — Balance, admin, release** | Prove it is fair | Season sims, Holding/Org Operations admin, audited corrections, full QA + historical-ruleset gates. |

Ruleset pins: `classic-og-v3.0-a` through `classic-og-v3.0-g` (names finalized at implementation). Latest is registered only after targeted tests pass; rollback pins new rounds to the prior version.

## Slice details

### 3.0-A — Holding read-model + ruleset foundation

Expose one holding per player per city from existing rows: turf corners, business fronts, warehouse/safehouse + upkeep-due state, dealer crews (active/paused), stored/inbound/crew stock, law pressure. Deep links go to the existing screens; no routes removed. Add reconcile checks mirroring `SupplyReconcileService` so drift surfaces in admin before any modifier ships.

**Gate:** counts/happiness/net worth unchanged; concurrent syncs create no duplicates; pre-3.0 rulesets build no holdings.

### 3.0-B — Org layer + interstate contracts

Orgs are new entities above alliances (one org per round, capped roster). Alliances keep their wire. Interstate contracts (move/protect/supply/hold across cities) settle on existing run/shipment/sale paths with single idempotent payouts. Org dashboard shows members, contracts, influence, history.

**Gate:** retry/race creates one membership; leaving strands no stock/crews/property; contracts supplement PvP (1.4 guardrail), never the safest optimal money.

### 3.0-C — Unified logistics planner

One quote for pickups, shipments, and lane orders: goods + fees, fleet capacity, crew effect (highest selected, no stacking, 5% cap), time, risk band, room, pressure, cash-after-payment. Over-capacity/no-room plans are refused with the shortfall stated. Settlement paths are untouched.

**Gate:** reservations hold (units leave source at dispatch, inbound holds room); replays cannot double-claim; empty-team flow keeps count-based behavior.

### 3.0-D — New cities as holding nodes

Northern city (default Toronto pending sim) pays off Northern Supply; Monterrey becomes playable with southern supplier rebalancing. Full city-keyed content each: leans, demand, heat, districts, hotels, turf locals, business signature, casino venue, law speeds, property prices. Existing city numbers unchanged. Decide the deferred 1.6-E question here: does holding the block boost its dealer crew traffic — capped, visible, sim-gated, or explicitly deferred again with numbers.

**Gate:** city sim (à la `qa:supply-cities`) ranks each new city best-or-second-best somewhere; no city dominates every product/route.

### 3.0-E — Cross-city law

Arrival/sale/contract writes route evidence to the operating city's case plus org investigation progress in one transaction. Warehouses/crews become bounded raid targets; bribery/lay-low are priced valves with caps/cooldowns. Case view goes cross-city using 1.8.5 city-condition vocabulary (affected districts/actions/end times).

**Gate:** no double-write on retry; exploit sim proves no raid/bribe/lane farming loop; pressure stays legible and escapable.

### 3.0-F — Org wars, rankings, aftermath

Influence-point wars in transparent windows (rules, standings, contribution, end time, rewards shown upfront). Paused rounds freeze windows. Community/seasonal war objectives run through the 1.8.5 first-class event system (single writer). Rewards are account-cosmetic upserts; regional rankings + aftermath + spectator-safe public reads respect privacy/recon boundaries.

**Gate:** late actions don't count; duplicates impossible on race/retry; no competitive power granted.

### 3.0-G — Balance, admin, release

Season sims (small/large bankrolls × home/hub/dear-market/lane over 7+ days) must reconcile every ledger with no must-pick. Admin Holding/Org Operations shows coverage, influence ranges, stock by city, crew economics, reconcile status, plus audited corrections (reason, before/after, no self-correct, frozen finished rounds). Full `qa:release` + `--with-db --with-load`, mobile 360–1920, axe-core, keyboard, retry coverage.

**Gate:** pre-3.0 behavior proven unchanged by historical-ruleset tests.

## Open decisions (3 locked, 2 recommended)

- ~~Org size~~ **Locked: 15 per org for v1**; alliance-of-alliances deferred.
- ~~Northern pick~~ **Locked: Toronto**; Vancouver deferred.
- ~~Block-holding dealer bonus~~ **Locked: yes, small** — starting hypothesis +8% sales pace when holding the crew's block, shown pre-commit, no stacking, sim sets the final number.
- Mexico City playable timing: **recommended deferred to 3.1** — 3.0-D ships playable Monterrey, Mexico City stays a supplier-only contact (Freight/Air lots as today). Ship playable Mexico City only if Monterrey season sim shows a distinct hub role plus leftover southern demand that doesn't cannibalize Dallas. Two southern playables at once doubles city-keyed content and risks a must-pick south.
- Courier route card: **recommended Regional Courier hypothesis** — 2,500/load, $3,000 + $4/unit, 6h, domestic holding-to-holding transfer with no vehicles, medium-low search (partial 10–30% on hit). Gap it fills: sub-Overland restocks for thin crews / vehicle-light players topping up dealer cities, vs shipments (need fleet) / Air (1k, pricey) / Freight (20k, 36h). Sim proves or kills it; default is defer if no gap.

## Explicitly deferred

- Property destruction/seizure/trading; org wars v1 is influence-points only.
- New currencies; real-money logistics/crew/power purchases (never sell competitive power).
- Passive-income holdings; automatic bulk pickup/restocking.
- Player-to-player trading of members/properties; permanent crew death.
- Competing event scheduler; anything that forks 1.8.5 single-writer settlement.
- Rewriting historical rounds or in-flight supply/quest/event progress.

## Guiding question

**3.0.0:** Do my holdings across cities work like one organization, where each new city, route, and contract creates a tradeoff worth planning around — without invalidating the Scout/Product/Combat/Travel/Turf/Hideout/Stores game players already know?
