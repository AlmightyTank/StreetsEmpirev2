# StreetsEmpire v1.5.0 — Vehicles & Garage 2.0

## Brainstorm

**Status:** 1.5.0-A through E are implemented on beta as `classic-og-v1.5-a` to `classic-og-v1.5-e`, the 1.5 release ruleset. 1.5.0-F (cosmetics) is a proposal.

**Target base:** StreetsEmpire v1.4.0, after its release ruleset is pinned.  
**Theme (from [ROADMAP-FUTURE.md](ROADMAP-FUTURE.md)):** expand Low-Riders into a useful fleet.  
**The question:** what do I drive and move my empire with?  
**Core loop:** build a small fleet → choose vehicles for a run → carry crew and cargo through a route → return, repair or recover vehicles → assign them again.

---

## Starting point

Travel already gives Low-Riders a job: runs take vehicles, cash and product out of the home operation, and drive-by actions use them as part of the crew's street presence. The 1.1 business design also has vehicle hooks in the Chop Shop and Auto Garage, while 1.4 gives Road Saints MC a natural connection to the road.

1.5 should connect those pieces into a fleet decision. It should not replace the run wallet, route system, or the existing Low-Rider role.

---

## Design principles

1. **Every vehicle needs a distinct job.** A class should change how a player plans a run, not add another row of nearly identical stats.
2. **Start with a small fleet.** Three useful classes are better than launching with every vehicle type in the future-roadmap sketch.
3. **Make the tradeoff understandable before dispatch.** Show cargo and crew limits clearly. Describe risk in player-readable terms; keep hidden odds and thresholds out of the general panel.
4. **Keep vehicles useful without making them safe.** A specialized vehicle can reduce one kind of risk or improve one capability, but no vehicle should bypass police, convoy attacks, or the cost of travel.
5. **Preserve historical rounds.** Each slice uses a pinned ruleset. Existing rounds keep their current Low-Rider behavior.
6. **Avoid passive wealth.** A larger fleet should create choices and costs, not automatically print money.

---

## Proposed first vehicle classes

These roles are a starting point for balance work, not final stats.

| Class | Possible role | Tradeoff to test |
| --- | --- | --- |
| **Low-Rider** | The familiar, flexible baseline for street work and travel | Keeps today's identity without being best at every run |
| **Sedan** | A lighter, lower-profile option for smaller jobs | Carries less crew or cargo |
| **Van** | A practical hauler for larger loads | More visible and less suited to fast, discreet trips |

SUVs, box trucks, armored cars and performance cars can stay in the backlog until the first three roles prove distinct. An armored vehicle must never mean immunity from a bust, arrest, road stop, or convoy hit.

---

## First-pass vehicle behavior

These identities should be clear enough for implementation and simulation before exact numbers are pinned.

| Class | First-pass behavior | Watch item |
| --- | --- | --- |
| **Low-Rider** | Medium crew seats, medium cargo, normal route risk and the required vehicle for drive-bys. It remains the familiar all-purpose street car. | Must stay useful without being the best answer for every run. |
| **Sedan** | Low crew seats, low cargo, lower-profile travel and cheaper or faster service. It is the small-job, quiet-movement option. | Must not become the automatic way to bypass Heat, police or road pressure. |
| **Van** | Medium crew seats, high cargo, higher visibility and higher service cost. It is the practical hauler for larger product moves. | Must not become the default profit vehicle for every serious run. |

Mixed loadouts are allowed if the run planner can show total seats, cargo, cash carried and risk in a readable way. If that UI becomes muddy, 1.5.0-B should start with one class per run and save mixed fleets for a later slice.

Vehicle condition should start with readable states such as **Ready**, **Away**, **Damaged** and **Disabled**. Permanent loss and insurance should remain deferred unless simulation proves repairable damage is too soft.

Risk language should stay player-facing. Labels such as **Heavy**, **Hot** or **Soft target** can explain why a route is tense without exposing hidden rolls or thresholds.

---

## Proposed roadmap

Each slice should have its own release gate and pinned ruleset, following the earlier StreetsEmpire roadmap pattern.

| Slice | Status | Proposal |
| --- | --- | --- |
| **1.5.0-A — Fleet Foundation** | Built | `classic-og-v1.5-a` adds the stable `LOW_RIDER` class identity and exposes existing home/away counts in the Hideout Garage. Older rulesets and all travel values remain unchanged. |
| **1.5.0-B — Vehicle Classes & Run Loadouts** | Built | `classic-og-v1.5-b` adds Sedan and Van ownership, predictable garage purchase prices, mixed run loadouts, class-specific cargo and seating capacity, and visible route profiles before dispatch. |
| **1.5.0-C — Garage Service, Recovery & Class Art** | Built | `classic-og-v1.5-c` adds Damaged and Disabled vehicle states, priced garage repair and recovery, a Garage tab on Travel, and class artwork in the garage, run loadout and Hideout. Busts, arrests and lost convoy fights dent cars instead of deleting them. |
| **1.5.0-D — Road Specialization** | Built | `classic-og-v1.5-d` connects the road lane to garage service: an Auto Garage cuts repairs, the Chop Shop's Vehicle recovery racket cuts recovery and Stolen Low-Riders now discounts Sedans and Vans, and Road Saints MC at Trusted cut both. Capped at 35%; no vehicle is exclusive to anyone. |
| **1.5.0-E — Balance, Admin & Release** | Built | `classic-og-v1.5-e` adds the `qa:vehicles` simulation and release gate, trims the Sedan's low-profile edge from 10% to 5% lower route risk, and adds Admin → Vehicles, a fleet view and audited fleet corrections in the player inspector, exploit-audit checks and historical-ruleset tests. |
| **1.5.0-F — Vehicle Cosmetics** | Proposed | After the base class silhouettes and garage presentation are settled, add optional player-selected vehicle looks. Cosmetics remain presentation-only and do not change vehicle stats or route outcomes. |

---

## Recommended first release

Start with **Low-Rider, Sedan and Van**, class-based run loadouts, and a straightforward garage inventory. Defer upgrades and insurance until the class choices are fun and balanced on their own. This gives 1.5 a clear playable loop before adding more economy or collection systems.

### 1.5.0-A — Fleet Foundation

**Status: implemented on beta.** `classic-og-v1.5-a` wraps `classic-og-v1.4-g` with a catalog entry for the existing Low-Rider. The travel response maps the legacy home count and active-run counts to that class, and the Hideout Garage shows the fleet summary. This slice adds no vehicle purchase, dispatch, risk, capacity, price, or repair changes. Existing rounds remain pinned to their original rulesets.

### 1.5.0-B — Vehicle Classes & Run Loadouts

**Status: implemented on beta.** `classic-og-v1.5-b` adds the Sedan and Van classes. Sedans carry 65% of baseline cargo, seat four crew, cost $3,500, and reduce route exposure by 10%; Vans carry 150% of baseline cargo, use the round’s normal crew capacity, cost $8,500, and raise exposure by 15%. Neither class removes police, Heat, road-stop or convoy risk. Players can buy them from the travel garage, choose a mixed loadout, and see class capacities and route profiles before committing. Runs store the class breakdown and restore the surviving vehicles on return. The legacy `lowRiders` request field remains supported for clients that only dispatch Low-Riders.

### 1.5.0-C — Garage Service, Recovery & Class Art

**Status: implemented on beta.** `classic-og-v1.5-c` wraps `classic-og-v1.5-b` with `vehicleCatalog.service`. Every other value is unchanged.

**Vehicle condition.** Cars at home are **Ready**, **Damaged** or **Disabled**; cars on a run are **Away**. Damaged and Disabled cars cannot go on runs or drive-bys, still count toward net worth at the normal per-vehicle value, and still count toward Hideout Low-Rider requirements. On a run, a dented car keeps driving with its cargo and comes home to the garage when the run returns.

| Trouble | What happens to the run's vehicles |
| --- | --- |
| Bust in town | 1 vehicle comes home Damaged |
| Convoy hit the run loses | 1 vehicle comes home Damaged |
| Arrest in town | 1 vehicle is impounded and comes home Disabled |
| Convoy theft (escorts down) | A Low-Rider is still stolen. A run with no Low-Rider has a Sedan or Van wrecked (Disabled) instead, so it is no longer turned into a Low-Rider for the attacker |
| Road stop | No vehicle effect |

Trouble lands on the most visible car first: Vans, then Low-Riders, then Sedans. A disabling hit takes a running car before a damaged one. A car stolen off a run takes its damage record with it.

**Garage service.** Instant, paid from home cash, never a roll, and priced on the button before the player commits:

| Class | Repair (Damaged → Ready) | Recovery (Disabled → Ready) | New price |
| --- | --- | --- | --- |
| Low-Rider | $750 | $2,000 | $5,000 at Charlie's |
| Sedan | $500 | $1,400 | $3,500 |
| Van | $1,250 | $3,400 | $8,500 |

Repair is about 15% of a class's price and recovery about 40%, so a bad run costs real money without costing the car. The Sedan is the cheap car to keep running and the Van the expensive one.

**Presentation.** A **Garage** tab on Travel shows one card per class with its art, role, capacity, route profile, Ready/Away/Damaged/Disabled counts, and priced buy, repair and recover buttons. The tab shows a count when anything is waiting for service. Buying Sedans and Vans moved there from the launch panel. The launch panel puts each class's art on its loadout field, says which cars are waiting on the garage, and previews what busts, arrests and convoy losses do to vehicles and what fixing them costs. Active runs and the last-run receipt list damaged and disabled cars. The Hideout Garage uses each class's own art and shows service counts.

**Fixed along the way.** The Hideout v2 extension now covers `classic-og-v1.5-a` and later, which A and B had missed, so the Hideout rooms (including the Garage) appear on 1.5 rounds. The player-state invariant now treats the optional vehicle counts as zero when absent.

**Not in C.** Drive-by losses and Steal-a-Ride raids keep their permanent Low-Rider losses: they are combat outcomes, and changing them is a balance call for E. Admin voids of convoy hits do not undo vehicle damage. Admin visibility and corrections for vehicle condition belong in **1.5.0-E**.

### 1.5.0-D — Road Specialization

**Status: implemented on beta.** `classic-og-v1.5-d` wraps `classic-og-v1.5-c`. It adds `vehicleCatalog.service.specialization`, widens one racket and rewords three racket descriptions. Every other value is unchanged.

The road lane makes a fleet **cheaper to keep running**, and that is all it does. No business or faction unlocks a vehicle class, changes capacity or route risk, or makes a car safer, so nobody has to pick the lane to field the same fleet.

| Source | Effect | At full strength |
| --- | --- | --- |
| Auto Garage (either racket, scaled by the strongest running one) | Off repairs | 25% |
| Chop Shop · Vehicle recovery racket (also still cuts convoy theft) | Off recovery | 25% |
| Chop Shop · Stolen Low-Riders racket | Off Low-Riders at Charlie's, and now Sedans and Vans in the garage | 8% |
| Road Saints MC at Trusted or above | Off every repair and recovery | 10% |

All service discounts together are capped at 35%. They are read on the server when the action runs, never taken from the client. The Garage tab shows the discounted price with the list price struck through, and a line naming each source that applies. The Road Saints Connected nudge (bodyguard tickets) and their Known and Trusted road information are unchanged.

**Why the numbers are small.** At full strength an Auto Garage saves $125 to $313 per repair, and Road Saints save $50 to $340 per service. A running Auto Garage's front income alone is $165 an hour at level 1. The discount rewards a crew already in the lane; it does not pay for building into it. Trouble that dents a car is occasional, so even a heavy runner saves far less from the lane than its rackets earn.

### 1.5.0-E — Balance, Admin & Release

**Status: implemented on beta.** `classic-og-v1.5-e` is the 1.5 release ruleset. It wraps `classic-og-v1.5-d` with one balance change.

**Simulation.** `npm run qa:vehicles` drives every class through four run scenarios on the best mid-round trade: a small quiet job at high Heat, a big haul, a heavily escorted run under convoy pressure, and a hot road. It uses the engine the server uses: road stops and town trouble at the fleet's route risk, convoy hits and theft, the damage they leave, and garage prices. Every fleet that can carry and seat the run is scored on the same paired draws, so differences come from the fleet and not the dice. Each fleet is charged fines, seizures, loot, garage bills, stolen cars and the share of each car's price that net worth never gives back. The full report is in [VEHICLES-SIMULATION-1.5.0-E.md](VEHICLES-SIMULATION-1.5.0-E.md).

**What it found.** On a route worth driving, the trade dwarfs what cars cost, so classes land within a few percent of each other. On 1.5.0-D's numbers, though, the Sedan was the favourite in every scenario, and 5.2% ahead on a hot road. Carrying less is no real cost when another Sedan is cheap, so its low profile made it the automatic way past Heat, which was this roadmap's own watch item. Fewer Sedan seats or less Sedan cargo changed nothing. The lever was the risk edge itself.

**The change.** Route-profile risk is now a ruleset value (`vehicleCatalog.routeRisk`). Older rulesets keep 1.5.0-B's 0.9 and 1.15 through the defaults. 1.5.0-E sets the Sedan to 0.95 (5% lower route risk) and leaves the Van at 1.15. The Garage tab and run loadout read the percentage from the round. The Sedan's lead on a hot road drops to 3.6%.

**Gate.** The release check runs `qa:vehicles`:
- Every class is a reasonable pick somewhere (within 3% of the best fleet in at least one scenario).
- No class is a must-have (the best class leads the next by under 5% in every scenario).
- No reasonable fleet spends over 10% of its run on the garage.
- Every fleet still meets trouble on the hot road.
- Repair < recovery < half a new car, and net worth never counts a car above its price.
- The road specialization cap stays under 50%.

The Sedan is still the narrow favourite. The gate asks for real choices, not an outright winner per class. The Low-Rider's other job, drive-bys, isn't a run and isn't scored.

**Admin.**
- **Admin → Vehicles:** per round, the fleet by class (Ready, Away, Damaged, Disabled), the largest fleets, garage spend over 24 hours and 7 days, Sedan and Van sales, staff corrections, and active runs whose classes don't add up to their car count.
- **Player inspector:** each class's counts and the garage spend. **Fleet correction** sets one class's home Ready, Damaged and Disabled counts exactly. It settles the player first, leaves cars on a run alone, recomputes net worth and ranks, refuses self-corrections and finished rounds, and writes a player-visible admin activity and a `vehicle.fleet-adjust` audit row (target `player-vehicles`).

**Exploit audit.** `ops:exploit-audit` checks the 1.5 constraints (class counts, garage counts, and run loadout and damage records as JSON objects), active runs whose classes miss their car count, and runs with more dented cars than cars.

**Historical rulesets.** Tests pin that 1.4.0-G has no vehicle catalog, that Low-Rider capacity and route risk on 1.5.0-A and E match 1.4.0-G, and that 1.5.0-B keeps its −10% Sedan.

**Mobile.** The Garage tab, run loadout, Admin → Vehicles and the fleet correction form have no horizontal scroll at phone width.

**Open options, not shipped.** The sim also tested *fleet exposure*, where every car past the first few adds route risk. It didn't change the picture enough to justify a new mechanic. It stays available if a later season shows big Sedan columns dominating.

### Vehicle artwork

The Low-Rider, Sedan and Van base-class illustrations are individual item-tile assets in `apps/web/public/items/` (`low-rider.svg`, `sedan.svg`, `van.svg`) and are wired into the garage, run loadout and Hideout in 1.5.0-C. The Sedan has a discreet, low-profile look and the Van a larger, cargo-focused one.

The repository's `scripts/art/render-cosmetic-art.mjs` script renders authored SVG masters from `apps/web/art/cosmetics/` into lossless WebP files under `apps/web/public/items/cosmetics/`. For example, `node scripts/art/render-cosmetic-art.mjs rides` rebuilds the ride cosmetic files. It is an export step, not an image generator; base vehicle artwork will need its own registry/runtime paths, while optional cosmetic variants belong in **1.5.0-F**.

---

## Balance and release gates

- Every class has routes where it is a reasonable choice; there is no universally best fleet.
- More cargo or crew capacity has a visible opportunity cost.
- Vehicle choice does not remove the existing road, Heat, police or convoy risks.
- Repairs and recovery are predictable, with costs shown before action.
- No class becomes a passive income source or a substitute for existing travel choices.
- Historical rulesets and active rounds retain their original vehicle behavior.
- Automated simulations cover trip profitability, risk outcomes, damage and vehicle usage by class.
- Mobile run planning remains usable with the garage and loadout controls.

---

## Open decisions

- Are vehicles season-long property, or are some classes rented for individual runs?
- Can vehicles be damaged, disabled, or permanently lost? The initial recommendation is repairable damage, with permanent loss deferred.
- Where are vehicles acquired: a general dealer, existing stores, the Chop Shop, or jobs?
- Do upgrades change a class's role, or should early customization stay cosmetic?
- Should faction standing unlock service access and information, while leaving core vehicle power available to everyone?
- Does 1.5 include more than one active run per player, or should it deepen loadout choices first?

