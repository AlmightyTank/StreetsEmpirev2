# StreetsEmpire v1.5.0 — Vehicles & Garage 2.0

## Brainstorm

**Status:** 1.5.0-A and B are implemented on beta as `classic-og-v1.5-a` and `classic-og-v1.5-b`. The remaining slices are proposals.

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
| **1.5.0-C — Garage Service, Recovery & Class Art** | Proposed | Give the garage a clear purpose for checking, repairing and recovering vehicles after a run. Add distinct Low-Rider, Sedan and Van artwork to the garage and run loadout, with costs and consequences previewed before committing. Prefer damage and repair over surprise permanent loss. |
| **1.5.0-D — Road Specialization** | Proposed | If simulation supports it, connect the existing Auto Garage, Chop Shop and Road Saints lane to vehicle access, service or a limited specialization. Avoid faction-exclusive vehicles that create a must-pick advantage. |
| **1.5.0-E — Balance, Admin & Release** | Proposed | Simulate route value, vehicle use, repairs and losses; add admin visibility and audited corrections where needed; complete mobile, exploit and historical-ruleset checks. |
| **1.5.0-F — Vehicle Cosmetics** | Proposed | After the base class silhouettes and garage presentation are settled, add optional player-selected vehicle looks. Cosmetics remain presentation-only and do not change vehicle stats or route outcomes. |

---

## Recommended first release

Start with **Low-Rider, Sedan and Van**, class-based run loadouts, and a straightforward garage inventory. Defer upgrades and insurance until the class choices are fun and balanced on their own. This gives 1.5 a clear playable loop before adding more economy or collection systems.

### 1.5.0-A — Fleet Foundation

**Status: implemented on beta.** `classic-og-v1.5-a` wraps `classic-og-v1.4-g` with a catalog entry for the existing Low-Rider. The travel response maps the legacy home count and active-run counts to that class, and the Hideout Garage shows the fleet summary. This slice adds no vehicle purchase, dispatch, risk, capacity, price, or repair changes. Existing rounds remain pinned to their original rulesets.

### 1.5.0-B — Vehicle Classes & Run Loadouts

**Status: implemented on beta.** `classic-og-v1.5-b` adds the Sedan and Van classes. Sedans carry 65% of baseline cargo, seat four crew, cost $3,500, and reduce route exposure by 10%; Vans carry 150% of baseline cargo, use the round’s normal crew capacity, cost $8,500, and raise exposure by 15%. Neither class removes police, Heat, road-stop or convoy risk. Players can buy them from the travel garage, choose a mixed loadout, and see class capacities and route profiles before committing. Runs store the class breakdown and restore the surviving vehicles on return. The legacy `lowRiders` request field remains supported for clients that only dispatch Low-Riders.

### Vehicle artwork schedule

Create and integrate the distinct base-class illustrations in **1.5.0-C**, when the garage service and run-loadout presentation are being built. The recent sedan/van concept image is a direction reference; production artwork should be individual vehicle assets that fit the existing item-tile presentation. Keep the silhouettes readable and give the Sedan a discreet, low-profile treatment and the Van a larger, cargo-focused treatment.

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

