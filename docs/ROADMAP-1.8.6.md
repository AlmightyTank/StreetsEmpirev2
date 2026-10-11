# StreetsEmpire 1.8.6 — Crew Jobs

## Purpose

1.8.6 lets a player put a specific thug to work, and gives thugs more kinds of work worth choosing between.

1.7.0 made every thug and worker a persistent crew member with a career, but the jobs themselves are still count-based and started from the job's own page. A player opens a dealer crew with N dealers or posts N thugs on a corner, and the roster sync decides which people those are. A specific member can only be swapped into a slot that already exists (1.7.0-D), and a dealer career cannot be moved at all.

1.8.6 turns that around. The player picks a member, picks a job, and that member goes. A board shows every job slot in one place. Four new jobs (Corner Lookout, Stash Guard, Runner, and roster-tracked Bodyguards/Escorts) give specialties somewhere new to matter. Standing staffing orders keep large crews topped up without clicking every person.

**The question:** Can I put the right person on the right job, see every job my crew is working, and keep it staffed, without micro-managing hundreds of thugs?

**Core loop:**

> Pick a member → put them to work → the job uses their specialty → they earn from what the job does → keep, move, or bring them home

## Current state this builds on

| Job | How thugs get there today | Counted in | Person-selectable today |
| --- | --- | --- | --- |
| Dealer crew | Open a crew with N dealers (4 setup turns), or assign one at a time. Max 6 per crew, 400 units of capacity each. Released careers return first, most experienced first. | `dealerThugs` + `DealerStaff` | Only a released career, by id. Active dealer careers cannot be exchanged. |
| Turf corner | Claim, post or pull N thugs. 4 turns to post, 2 to pull. One home gun leaves the arsenal per thug. Corner minimum is a share of the whole crew. | `postedThugs` + `Turf.cornerThugs` | Swap an available member into an occupied corner slot (1.7.0-D). The sync picks who comes home on a pull. |
| Business | Opening sends `baseStaff × level` staff. Staff turn cost to open or close. | `businessThugs` / `businessWhores` | Swap into an existing staff slot (1.7.0-D). |
| Raid / scouting team | Optional selected team at dispatch (1.7.0-E). | — (one transaction) | Yes. |
| Boss-trip bodyguards, convoy escorts | Count chosen at launch. | `busyThugs` (roster: `IN_TRANSIT`, no reference) | No. |

The player's count columns remain authoritative in 1.8.6. Every new action writes counts through the existing action pipeline, and the roster places the chosen members in the same transaction.

## Design principles

1. **Counts stay the source of truth.** A person-first action runs the same count-based action a job page runs, then pins the chosen identities in the same transaction. The two paths cannot disagree.
2. **Same costs either way.** Putting a member to work from the roster costs exactly what the job page charges: the same turns, guns, capacity and minimums. There is no cheaper route.
3. **One effect per job.** Each new job does one legible thing. Specialty bonuses stay narrow, capped and non-stacking, as in 1.7.
4. **Experience comes from what the job does, not from time.** No experience for holding a corner or standing guard. Experience is awarded for a defended push, a restock delivered, a trip or run completed, and is idempotent by the event that caused it.
5. **No new permanent loss.** New jobs can wound members or send them home. They never kill a member or erase a career.
6. **Orders never surprise the player.** Staffing orders only refill jobs that already exist, only on the player's own actions, and only spend turns the player can see.
7. **Pinned rulesets.** New behavior ships in `classic-og-v1.8.6-*` rulesets built on the latest 1.8.5 ruleset. Earlier rounds keep their rules.
8. **No paid competitive power.** No purchase grants jobs, slots, orders or bonuses.

## Release shape

Slices **A–I**. A is a no-behavior-change foundation. B and C deliver person-first assignment and the board for the existing jobs. D–G add specialties and new jobs. H adds staffing orders once every job exists. I covers balance, admin and release.

Proposed ruleset IDs are `classic-og-v1.8.6-a` through `classic-og-v1.8.6-i`.

| Slice | Theme | Outcome |
| --- | --- | --- |
| **1.8.6-A — Job Foundation** | One availability rule, one job model | Replace the copied fit-at-home formula with one shared helper. Add the job-post table and assignment kinds the new jobs need. No gameplay change. |
| **1.8.6-B — Put to Work** | Person-first assignment | Assign, move and bring home specific members from the roster for dealer crews and turf corners, alone or as a multi-select group. Pinned identities, same costs as the job pages. |
| **1.8.6-C — Crew Jobs Board** | Every slot in one place | A responsive board of every dealer crew, corner, business and (later) new job, with the fit pool, guns and turns, +/- controls and a "who's here" list. |
| **1.8.6-D — Corner Specialties** | Make the corner choice matter | Enforcer corner defense, capped and non-stacking. Experience for defended pushes. |
| **1.8.6-E — Corner Lookouts & Stash Guards** | Two new turf jobs | Lookouts lengthen push warning on their corner. Stash guards reduce outpost loot when a corner falls. |
| **1.8.6-F — Runners** | A new supply job | Runners restock their dealer crew from city storage as it sells. Wheelmen run faster. |
| **1.8.6-G — Bodyguards & Escorts on the Roster** | Named people on trips and runs | Pick the bodyguards and escorts. They are tracked with a reference, earn on completion, and are wounded by name. |
| **1.8.6-H — Staffing Orders** | Keep big crews staffed | Target headcounts per job, filled in priority order on the player's own actions at normal turn cost. |
| **1.8.6-I — Balance, Admin & Release** | Prove it is fair | Simulations, admin job view and correction, exploit and concurrency tests, mobile review, release gates. |

## Slice details

Numbers below are proposed starting values to be confirmed in I. Items marked **Decide** are small design calls still open; each has a recommended default.

### 1.8.6-A — Job Foundation

- **One availability helper.** The fit-at-home formula (`thugs − wounded − busy − posted − business − dealer`) appears as `fitThugs` in `action.service.ts`, as `homeFit` in `turf.service.ts`, and inline in `business.service.ts` and others: about 110 references across 28 server files. Move it into one rules-engine helper with a single term list and replace every copy. Tests prove the helper equals the old expressions for every prior ruleset and a fuzzed set of player rows.
- **Job posts.** Rather than a new `RoundPlayer` column per job, add one table, `CrewJobPost { roundPlayerId, kind, ref, thugs, guns… }`, and one aggregate column `jobThugs` that the helper subtracts. Corner lookouts, stash guards and runners are rows in it. Dealer, corner and business staffing stay where they are.
- **Assignment kinds.** Extend `CrewAssignmentKind` with `CORNER_LOOKOUT`, `STASH_GUARD`, `RUNNER`, `BODYGUARD` and `ESCORT`. The UI name is "Corner Lookout" so it is never confused with the Hideout's LOOKOUTS room.
- **In-transit assignments.** Bodyguards and escorts are on the road, not at a post. Allow `IN_TRANSIT` members to carry a `BODYGUARD`/`ESCORT` assignment and reference (today a database check allows an assignment only on `ASSIGNED`). Busy thugs with no trip or run stay `IN_TRANSIT` with no reference.
- **Planner support.** Teach `planCrewRoster` the new places, and accept a list of *preferred members* for places that grow, so a caller can say who fills a slot instead of the least-senior rule.

**Gate:** On every 1.8.x ruleset, actions, counts, happiness, net worth and roster placement are unchanged. The helper matches the old formula everywhere. The sync signature changes only when a 1.8.6 ruleset adds a job.

### 1.8.6-B — Put to Work

The member card's **Put to work ▸** opens the jobs this member can take, each with its cost and the member's effect there.

- **Dealer crew.** Runs `DEALER_STAFF_ASSIGN` and gives the new career to *this* member. A member with a released career gets it back. Crew size, capacity and the out-of-sync check apply unchanged.
- **Turf corner.** Runs `TURF_POST` for the selected members in one action: one post turn cost (4) for the group, one home gun per thug, and the push lockout still applies. With multi-select, five members cost the same as posting five by count.
- **Business.** Business staff is fixed by level, so a member can only *replace* someone at a business (the existing 1.7.0-D exchange). The menu says so instead of offering a +1.
- **Bring home.** From a posted member's card: `TURF_PULL` for this member (2 turns, corner minimum applies), or `DEALER_STAFF_RELEASE` for this career (the capacity check applies).
- **Move.** One confirmed action that runs bring-home then put-to-work and charges both costs. It is allowed only when both halves would succeed. A dealer can move to another dealer crew; this lifts the 1.7.0-D dealer exchange restriction for that one path.
- **Pinning.** After the count action, the sync places exactly the selected members, using the preferred-member planner support from A. If a selected member stopped being available (another tab, a run left), the whole action fails before anything is spent.
- **Decide — group size.** *Recommended:* multi-select up to the job's own limit (6 per dealer crew, any number of fit armed thugs for a corner).

**Gate:** The selected members, and only they, end up in the job. The count change and costs are identical to the job page's. Concurrent requests cannot place one member twice. Retries replay.

### 1.8.6-C — Crew Jobs Board

- One page grouped by city, then district. Each row shows the job, who works it (count and an expandable member list), the limit or minimum, guns posted, and stock or capacity where relevant.
- A header shows fit thugs at home, home guns, and turns.
- +/- controls call the same actions as the job pages. Each confirm shows the turn cost and gun need first. "Swap" opens a member picker filtered to eligible members.
- New jobs appear as D–G land. The board reads from one server endpoint that aggregates the existing job tables; it introduces no new state.
- **Decide — page name.** "Jobs" already means quest Jobs (the 8-Job limit). *Recommended:* the page is **Crew Assignments**, at `/game/crew/assignments`, linked from the roster. "Crew Jobs" remains the release name only.

**Gate:** Every slot a player holds appears exactly once. Board totals match the count columns. Usable on phone width with 500+ members.

### 1.8.6-D — Corner Specialties

- **Enforcer on a corner.** The highest Enforcer tier posted on a corner adds +2% (tier 1) or +5% (tier 2) to that corner's defense against pushes and block-war fights. It does not stack, matching raids.
- **Experience.** When a push on a corner lands and the holder keeps it, every member posted there at landing gets 5 XP, once per push id. A lost corner awards nothing. No experience for time held.
- **Decide — XP to all or one.** 1.7.0-C awards one deterministic member per completed job. *Recommended:* all defenders, since a defense is a group outcome and member XP does not compound in power.
- **Decide — crackdown survivors.** *Recommended:* no XP for surviving a crackdown; it would reward being caught in one.

**Gate:** The bonus applies only to corner defense, is capped at 5%, and never stacks. XP is awarded once per push, even with retries and settlement re-runs.

### 1.8.6-E — Corner Lookouts & Stash Guards

**Corner Lookout** (a `CrewJobPost` on a held corner)

- **Effect.** Each lookout adds +2 minutes to the push warning on that corner (base 8), up to 3 lookouts (+6, so 14). A Scout lookout adds +1 minute at tier 1 or +2 at tier 2, highest only. Total cap: +8 minutes.
- **Constraints.** A block war must still give at least a push's warning, so the cap is validated against `wars.warningMinutes` in ruleset checks.
- **Costs.** 2 turns to post a lookout group, 1 to pull. Lookouts carry no gun, don't fight, and don't count toward the corner minimum. They burn the same beer upkeep as corner thugs.
- **Corner lost.** Lookouts come home unhurt.
- **Decide — crackdowns.** *Recommended:* lookouts are not picked up in a crackdown, and they have no effect on crackdowns. One effect per job.

**Stash Guard** (a `CrewJobPost` on an outpost)

- **Effect.** When the corner falls, each guard cuts the outpost's `lootShare` by 5%, capped at 25% with 5 guards. A posted Enforcer guard adds 2% or 5% to that cut, highest only. Total cap: 30%.
- **Costs.** 2 turns to post, 1 to pull. One home gun per guard leaves the arsenal, like corner guns.
- **Corner lost.** Guards come home. Half (rounded down) are wounded and go to `RECOVERING`. Their guns come home with them.
- **Decide — do guards fight?** *Recommended:* no. They protect the stash, not the corner, so a corner's defense still comes only from corner thugs.

**Gate:** Each effect touches only its stated outcome, respects its cap, and is validated in ruleset checks. Posting and pulling follow the corner's locks, so a push in flight cannot be dodged by pulling guards at the last second (posting is blocked under push, as with thugs).

### 1.8.6-F — Runners

- **Effect.** Runners are assigned to a dealer crew. Whenever that crew's sales settle, its runners move stock of the crew's product from its city's storage into the crew, up to its capacity. Each runner moves up to 20 units per settled hour. A Wheelman runner adds +10% at tier 1 or +25% at tier 2, highest only.
- **Records.** Each restock is a `SupplyMovement` (`ASSIGNED_TO_DEALER`) keyed to the sales batch, so a settlement retry cannot move stock twice. Manual loading is unchanged.
- **Costs.** No turn cost, the same as assigning a dealer to an open crew; the runner is a thug off the street. Max 2 runners per crew.
- **Experience.** 5 XP to each runner on the crew per batch that moved stock, once per batch.
- **Decide — warehouse floor.** *Recommended:* a per-crew "leave at least N units in storage" setting, default 0, so runners don't drain stock the player meant to keep for production or a run.
- **Decide — paused rounds.** Runners settle with sales, so they inherit sales' pause behavior and never move stock on a read while the round is paused.

**Gate:** Restock never exceeds capacity or the warehouse floor, never crosses cities, never moves twice for one batch, and appears in the supply journal.

### 1.8.6-G — Bodyguards & Escorts on the Roster

- **Selection.** Launching a boss trip or a convoy run accepts an optional list of members, as raids do since 1.7.0-E. Leaving it empty keeps today's count-based launch, and the roster picks.
- **Tracking.** The chosen members are `IN_TRANSIT` with `BODYGUARD` (trip id) or `ESCORT` (run id). The roster shows "Bodyguarding the boss in Vegas" instead of "On a run."
- **Effects.** Wheelman escorts keep the existing 1.7.0-C road-stop reduction, now tied to the selected member. An Enforcer escort adds the 2% or 5% capped bonus to the run's defense when tailed. Bodyguards gain no new effect in 1.8.6.
- **Wounds.** Wounded escorts and bodyguards go to `RECOVERING` by name: the members the planner places there, not the least senior.
- **Experience.** 5 XP each on a trip's or run's completed return, once, at the same point road-run XP is awarded today.

**Gate:** A member on a trip or run cannot be selected anywhere else. Return, wounds and XP happen once per trip or run. An empty selection behaves exactly as today.

### 1.8.6-H — Staffing Orders

- **What an order is.** For a job that already exists (dealer crew, corner, lookout, stash guard, runner post), set a target headcount and a priority (1–20). Maximum 20 orders.
- **When it fills.** At the end of the player's own actions in the action pipeline, after the roster sync, and only then. Never on a timer or while the player is away. Thugs who recovered or returned while the player was offline fill on the next action.
- **Cost.** Each fill runs the job's normal action at its normal turn cost: one post action per job per fill, however many thugs it adds. A turf fill needs home guns. If turns or guns are short, that order waits and shows why ("Waiting: needs 4 turns"). Lower priorities are not skipped ahead of a waiting higher one.
- **Who fills.** The most experienced available member with the job's specialty first, then generalists. Orders never pull members from another job and never open a new crew, corner or post.
- **Turn guard.** A per-player "keep at least N turns" setting, default 10, that orders never spend below. This prevents an order from emptying the turns a player was saving for a raid.
- **Decide — confirmation.** *Recommended:* the action result shows a line for each fill ("Order: posted 2 on the Casino corner, −4 turns") rather than asking each time.

**Gate:** Orders never spend below the turn guard, never act outside the player's own actions, never move a member between jobs, and an action retry never fills twice.

### 1.8.6-I — Balance, Admin & Release

- **Simulation.** `qa:crew-jobs` covers casual and active players, crews of 10 to 2,000, with and without orders. It checks that lookouts don't make pushes pointless, that guards don't make outposts loot-proof, that runners don't out-earn manual loading by more than the time they save, and that the turn guard holds.
- **Admin.** The roster admin view gains job-post distribution, order counts, and audited correction of a job post's headcount (ended rounds are read-only, as in 1.7.0-F).
- **Exploit tests.** Pulling guards or lookouts mid-push, moving a dealer during settlement, a double fill from two tabs, a member selected for a run and a corner at once, retries of every new action.
- **Review.** Mobile and accessibility review of the board and the Put to work menu. Pinned-ruleset tests for every 1.8.x and 1.7.x ruleset.

## Release gates

- Every 1.8.x and earlier round keeps its rules, counts and roster placement.
- The roster and the count columns never disagree, and the board totals match both.
- Choosing a person never costs less than the job page, and a failed choice spends nothing.
- Each new job's effect is capped, limited to its outcome, and covered by ruleset validation.
- Experience is awarded once per triggering event and never for time.
- Orders spend turns only on the player's own actions, never below the turn guard, at the job's normal cost.
- No member can be in two jobs, or on a trip or run and in a job, at the same time.

## Explicitly deferred

- Mixed-role dealer crews (an Enforcer dealer against stick-ups).
- Lookout effects on crackdowns.
- Orders that open new jobs, move members between jobs, or act on a schedule.
- Hideout security and business protection as thug jobs.
- Worker (girl) person-first assignment beyond the existing business exchange.
- Player-to-player lending of crew members.

## Guiding question

**Can a player put the right person on the right job, see everything their crew is doing, and keep it staffed, without the game turning into a spreadsheet?**
