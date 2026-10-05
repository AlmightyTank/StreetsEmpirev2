# StreetsEmpire v1.5.0 — Vehicles & Garage 2.0

## Brainstorm

**Status:** Design draft. No 1.5.0 slices are implemented or committed. The first pass below is a proposal; the open decisions remain open until the scope is approved.

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

## Proposed roadmap

Each slice should have its own release gate and pinned ruleset, following the earlier StreetsEmpire roadmap pattern.

| Slice | Status | Proposal |
| --- | --- | --- |
| **1.5.0-A — Fleet Foundation** | Proposed | Add explicit vehicle inventory and class identity. Existing vehicle counts map to Low-Riders; older rulesets continue unchanged. No balance change in A. |
| **1.5.0-B — Vehicle Classes & Run Loadouts** | Proposed | Add the first three classes and let players assign them to a run. Show available capacity and what must be loaded before the player commits. Keep the run's cash and product physically with the vehicles. |
| **1.5.0-C — Garage Service & Recovery** | Proposed | Give the garage a clear purpose for checking, repairing and recovering vehicles after a run. Preview costs and consequences before committing. Prefer damage and repair over surprise permanent loss. |
| **1.5.0-D — Road Specialization** | Proposed | If simulation supports it, connect the existing Auto Garage, Chop Shop and Road Saints lane to vehicle access, service or a limited specialization. Avoid faction-exclusive vehicles that create a must-pick advantage. |
| **1.5.0-E — Balance, Admin & Release** | Proposed | Simulate route value, vehicle use, repairs and losses; add admin visibility and audited corrections where needed; complete mobile, exploit and historical-ruleset checks. |

---

## Recommended first release

Start with **Low-Rider, Sedan and Van**, class-based run loadouts, and a straightforward garage inventory. Defer upgrades and insurance until the class choices are fun and balanced on their own. This gives 1.5 a clear playable loop before adding more economy or collection systems.

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

