# StreetsEmpire v0.7.0 — Hideout Improvements Roadmap

## Vision
Turn the Hideout from four passive upgrade bars into the player's seasonal headquarters.

The release builds on the existing Safe Room, Lookouts, Workshop, and Back Office and connects the Hideout to combat, products, travel, convoys, turf, crew recovery, and the economy without turning StreetsEmpire into a separate base-building game.

## Goals
- Make the Hideout the headquarters view for the player's operation.
- Add meaningful room specializations so maxed Hideouts do not all play the same.
- Connect 0.2 combat, 0.4 products, 0.5 travel, and 0.6 turf.
- Require gameplay progress as well as cash for higher upgrades.
- Preserve OG browser-game pacing and avoid base-building chores.

## Core room specializations
| Room | Base purpose | Specialization A | Specialization B |
|---|---|---|---|
| Safe Room | Protect assets | Vault | Panic Room |
| Lookouts | Defense / awareness | Street Eyes | Armed Watch |
| Workshop | Production | Drug Lab | Garage |
| Back Office | Income / management | Bookkeeping | Connections |

## 0.7.0-A — Hideout Foundation 2.0
**Status:** **complete.** The foundation shipped through PR #25: the 0.7 ruleset/DTO contract, level-3 progress gates, specialization metadata, HQ summary, product-aware Workshop naming, compatibility tests, and `qa:hideout` validation are in place.

**Goal:** Build the framework without stacking major balance changes on top.

- New v0.7 hideout ruleset contract with older-round compatibility.
- Cash + achievement requirements for upgrades.
- Specialization-ready room data.
- Headquarters dashboard.
- Summary of cash, crew, security, products, wounds, turf, active runs, and Heat.
- Product-aware Workshop bonus naming and behavior.
- API/DTO support for requirement progress and lock reasons.
- Hideout simulation and validation.

**Done when:** older rulesets still work, all original rooms upgrade correctly, the dashboard matches game state, and every lock explains what is missing.

## 0.7.0-B — Safe Room & Protected Storage
**Status:** **complete in beta.** Protected product capacity, protected/exposed HQ reporting, recon-aware exposure, raid/drug-run enforcement, receipt visibility, and balance/regression coverage are in place. Weapon reserve protection remains deliberately held for the later Armory/balance work.

**Goal:** Make asset protection understandable and interactive.

- Keep protected cash.
- Add capped protected product storage at higher levels.
- Consider limited protected weapon reserve only if balance supports it.
- Show protected vs exposed assets.
- Make recon/combat respect the protected asset model.
- Improve raid receipts.

**Done when:** protected assets cannot be looted, exposure is visible before attacks, and wealthy players remain meaningfully raidable.

## 0.7.0-C — Lookouts & Security
**Status:** **complete in beta.** Lookouts now preserve the defense bonus, add tiered recon warnings and a Hideout security desk, reuse convoy/turf warning windows, provide count-only local run awareness, gate higher levels with turf ownership, and prepare inactive Street Eyes / Armed Watch hooks for 0.7.0-G.

**Goal:** Connect defense, recon, turf, and convoy awareness.

- Preserve home-defense bonus.
- Add recon-warning tiers.
- Show suspicious activity on the dashboard.
- Add limited local convoy/run awareness.
- Use turf ownership as an upgrade requirement where appropriate.
- Prepare Street Eyes and Armed Watch specialization hooks.

**Done when:** Lookouts give useful warnings without replacing deliberate recon.

## 0.7.0-D — Workshop & Garage
**Status:** **complete in beta.** Workshop now uses one production-bonus path for every cookable product, ingredient efficiency is capped at 8%, Garage construction requires two owned Low-Riders, Garage opens a second run and a 5% relocation discount, and the Hideout manages active-run logistics without changing road time or risk. 0.7-E also corrects the ownership gate so Low-Riders currently away on a run still count as owned.

**Goal:** Support the whole product economy and connect travel.

- Apply Workshop bonuses to all producible products.
- Separate output and ingredient-efficiency tuning.
- Add Garage management tied to Low-Riders, runs, and relocation.
- Show active run, vehicles, cargo/escort summary, and relocation.
- Add modest logistics bonuses.
- Avoid major travel-time reductions unless simulation supports them.

**Done when:** all products use the same Hideout bonus path and Garage improves logistics without replacing Travel.

## 0.7.0-E — Back Office & Ledger
**Status:** **feature-complete in PR #39** targeting `beta`. A durable transactional ledger covers ordinary action cash changes, split production income/costs, run-market economics, raid cash transfers, relocation and Hideout spending. Back Office level expands itemized history while 1/7/30-day summaries remain visible, and Bookkeeping/Connections hooks are prepared for G.

**Goal:** Make Back Office the economic command center.

- Add income/expense ledger.
- Cover street work, product sales, production costs, stores, combat, travel, and Hideout spending.
- Add rolling summaries.
- Keep the current street-take bonus.
- Prepare Bookkeeping and Connections branches.

**Done when:** ledger totals reconcile and Back Office does not become a compounding money printer.

## 0.7.0-F — Armory & Infirmary
**Status:** **in progress** on `hideout-0.7.0-f`. Armory now reads the real arsenal and persists Power First / Conserve Premium allocation for raids, defense, convoy squads and run escorts. Infirmary reads the existing combat injury queue and Workshop infrastructure can reduce medicine use by at most 15%, without changing natural recovery time.

**Goal:** Bring weapons and recovery into headquarters management.

- Armory: weapons, armed capacity, unarmed fit thugs.
- Optional weapon-priority configuration for defense, raids, and runs.
- Infirmary: fit/wounded thugs, timers, medicine.
- Modest recovery or medicine-efficiency upgrades.
- Combat remains authoritative.

**Done when:** weapon and recovery state exactly matches the existing systems.

## 0.7.0-G — Specializations, Balance & Polish
**Goal:** Enable build identity and ship the complete experience.

- Enable Level-3 specialization choices.
- Vault vs Panic Room.
- Street Eyes vs Armed Watch.
- Drug Lab vs Garage.
- Bookkeeping vs Connections.
- Decide whether respec is impossible or expensive.
- Finish dashboard polish and season archive.
- Run economy, raid, travel, product, turf, and hideout simulations together.
- Tune from test/simulation data.

**Done when:** every branch has a valid use case and no universal best specialization exists.

## Balance guardrails
- No invulnerable vault.
- No passive runaway compounding.
- Lookouts provide warnings, not omniscience.
- Garage does not erase route risk or local markets.
- Armory/Infirmary support combat instead of duplicating it.
- Higher Hideout levels remain a meaningful seasonal cash sink.

## Explicitly out of scope
- Free-form room placement/decorating.
- Generator/fuel chores.
- Junk-item crafting solely for Hideout progression.
- Dozens of rooms.
- Long construction timers.
- Separate duplicate inventory state.
- Major travel-time compression.
- Permanent competitive mechanical bonuses across seasons.

## Final release criteria
- Every room and next requirement is understandable.
- Dashboard accurately summarizes the operation.
- At least four meaningful specialization choices exist.
- Connected-system simulations include Hideout effects.
- Older pinned rulesets retain their behavior.
- Resource-changing actions remain idempotent.
- Mobile and desktop remain usable without dense micromanagement.
