# StreetsEmpire 1.7.0 — Crew Identity & Careers

## Purpose

1.7.0 makes the people in a player's organization feel distinct and gives their careers continuity. Thugs and workers become persistent crew members with individual records, job experience, and a small number of useful specialties.

The goal is to add character and meaningful assignment choices while keeping StreetsEmpire a strategy game that feels close to the original Pimp Wars. Players should recognize their people without having to manage a deep RPG skill tree for every action.

**The question:** Who runs my operation, what are they good at, and how do they improve by doing the work?

**Core loop:**

> Recruit → assign → complete work → gain experience → specialize → keep, reassign, or release

This release builds on the completed 1.6.0 supply loop. Dealer career experience and release/re-hire behavior should carry forward rather than being replaced by a second progression system.

## Design principles

1. **People persist.** Each member has a stable identity and career record across jobs and reassignments within a round.
2. **Skill comes from work.** Members improve by completing the jobs they are assigned to; merely waiting online or repeatedly retrying an action does not generate experience.
3. **Specialties are legible.** A player can tell what a member is good at and what benefit that provides before assigning them.
4. **Members remain useful in a group game.** The roster should be easy to scan, filter, and assign. Routine actions should not require clicking every person individually.
5. **Choices have limits.** A member cannot be in two places or jobs at once. Specialty bonuses have caps and should not make one lineup best for every situation.
6. **Careers survive release.** Releasing a member frees them for other work but does not erase their earned experience. Rehiring that member restores their career.
7. **Keep setbacks fair.** Initial 1.7 slices do not permanently kill, delete, or irreversibly damage a member.
8. **Preserve prior play.** New rules are pinned to 1.7 rulesets. Earlier rounds continue using their existing crew-count and job rules.
9. **No paid competitive power.** Real-money purchases cannot grant crew members, experience, or job performance.

## Release shape

Slices **A–F** introduce persistent members, profiles, job progression, assignments, and the tools to balance them. Existing group actions remain available; individual assignment is added where it creates a real strategic choice.

Each slice should follow the project's ruleset and release-gate pattern. Proposed ruleset IDs are `classic-og-v1.7-a` through `classic-og-v1.7-f`; finalize them as implementation is planned.

## Proposed slices

| Slice | Theme | Outcome |
| --- | --- | --- |
| **1.7.0-A — Individual Roster Foundation** | Give crew members stable identities | Add individual member records and safely migrate count-based thugs and workers without changing crew totals, assignments, happiness, or net worth. Preserve existing 1.6 dealer career records. |
| **1.7.0-B — Profiles, Traits & History** | Make the crew recognizable | Show a member's name, role, current assignment, experience, specialty, and career history. Add a small, readable trait set with bounded effects. |
| **1.7.0-C — Career Experience & Specialties** | Improve through completed work | Award experience for authoritative, completed jobs. Add specialties such as combat aim, driving, scouting, dealing, and worker service proficiency where the game supports distinct service categories. |
| **1.7.0-D — Assignment, Training & Availability** | Let players shape careers | Assign and reassign members between jobs, make availability visible, and offer limited training choices with clear costs and caps. Retain experience when released and rehired. |
| **1.7.0-E — Teams & Operational Choices** | Build the right lineup for a job | Let players select eligible members for supported operations and compare the team's strengths before committing. Keep team bonuses small and avoid mandatory combinations. |
| **1.7.0-F — Balance, Admin & Release** | Prove the system is fair and manageable | Add admin inspection and audited correction, progression simulations, migration checks, mobile roster review, exploit tests, and release gates. |

## Slice details

### 1.7.0-A — Individual Roster Foundation

Create the server-owned member records that later slices use.

- Give every individual thug and worker who can be assigned a stable ID, role, experience, status, and assignment history.
- Migrate existing aggregate crew counts into member records without adding or removing people. Preserve business assignments, dealer assignments, crew happiness, net worth, and all other derived totals.
- Preserve 1.6 dealer staff IDs and experience when moving them into the common career model; do not reset dealer tiers or cuts.
- Keep member records scoped to a round. A new round follows its own recruitment and ruleset; career history from a prior round may be shown as history but does not grant new-round power.
- Keep aggregate totals available to existing actions and interfaces while the game transitions to member-level data.
- Make migration retry-safe and auditable. A retry cannot create duplicate members or change a player's total crew.

**Gate:** Migration tests prove that before/after crew totals, assignments, happiness, and net worth match; repeated migration creates no duplicate members; prior rulesets are unchanged.

**Status: Implemented.**

**As built:**

- **Ruleset.** `classic-og-v1.7-a` is 1.6.5-G plus `crewRoster: { enabled: true }`, and is now the newest ruleset. No gameplay value changes. Every earlier ruleset has no `crewRoster`, so no roster is built, read or synced for it.
- **Records.** `CrewMember` is one thug or worker: a stable id, a role (`THUG` or `WORKER`), a per-round serial (order of joining, never reused), a status, an assignment, experience, and the 1.6 dealer career it carries, if any. Statuses use 1.7.0-D's vocabulary: `AVAILABLE` (fit at home), `ASSIGNED` (with a `BUSINESS`, `DEALER` or `TURF` assignment and, where the game records it, the business, dealer crew or corner), `IN_TRANSIT` (the player's busy thugs), `RECOVERING` (wounded) and `RELEASED` (no longer in the crew). `CrewMemberEvent` is the immutable history: `MIGRATED`, `JOINED`, `ASSIGNED`, `UNASSIGNED`, `RELEASED` and `REHIRED`. Changes between available, in transit and recovering are not written to the history. `CrewRosterMigration` is the per-player audit of the first build: the counts it read, the member totals it ended with, and how many members and dealer careers it created. Members belong to the round's player row, so a new round starts a new roster.
- **Counts stay authoritative.** The player's columns (`thugs`, `woundedThugs`, `busyThugs`, `postedThugs`, `businessThugs`, `dealerThugs`, `whores`, `businessWhores`) remain the source of truth for every existing action, screen, happiness and net-worth calculation. The roster follows them and never writes them. Database checks keep an assignment only on assigned members and a release time only on released ones.
- **Sync.** `CrewRosterService.sync` runs under the player's lock at the end of every action in the action pipeline, and when the roster is read. It first checks cheaply (a grouped count of members by place, and each working dealer career's member) and does nothing when the roster is in step. When it is not, the pure planner (`crew-roster-plan.ts`) matches members to the places the counts call for: members already in the right place stay there, with the most experienced and longest-serving kept first; members whose place shrank fill places that grew; new members join only for places nobody can fill; and whoever is left without a place is released. Counts that change outside the player's own actions (raids taken, admin grants) are picked up on the player's next action or roster read.
- **Migration.** The first sync for a player builds the roster from their counts and writes the audit row, in one transaction. Every counted thug and worker gets exactly one member in the place the counts give, so totals, assignments, happiness and net worth are unchanged. A retry or a parallel request waits on the player's lock, finds the audit row and an in-step roster, and creates nobody. `npm run ops:crew-roster -- --round <slug>` migrates and verifies a whole round ahead of time; `--check` only reports players whose members do not match their counts.
- **1.6 dealer careers.** Each working career becomes a member under the career's own id, on its crew, with its experience. Released careers go to thugs at home, the most experienced first; any beyond the crew are kept as released members, so no career is lost. After migration, a new career is taken up by a thug from home, and a rehired career brings its own member back. Tiers, cuts and pace are still read from `DealerStaff`, which is unchanged; sales add the same experience to the career's member, so the two never drift.
- **Read API.** `GET /api/game/crew` returns totals by role, status and assignment, the migration time, and a page of members (filters: `role`, `status`; `limit` up to 200, `offset`). Nothing in the web client changes yet; 1.7.0-B builds the roster screen on it.
- **Tests.** Planner unit tests cover targets, migration, dealer careers, rehire, shrinking and growing crews, and 300 random count changes, checking that every place always holds exactly what the counts call for and that a second plan is empty. A PostgreSQL suite (`CREW_INTEGRATION=1`) moves a seasoned 1.6.5-G crew onto 1.7.0-A and proves the player row, happiness and net worth do not change, that each place matches its count, that dealer ids and experience carry over, that three parallel migrations create one roster, that actions keep members in step, that release and rehire keep a career with its member, and that an earlier ruleset never builds a roster.

### 1.7.0-B — Profiles, Traits & History

Present individual members in a compact roster rather than adding a separate management screen to every action.

- Show name, role, current assignment, availability, experience, specialty, and a short career history.
- Give recruited members a small set of readable baseline traits. Traits should be visible and should not secretly change unrelated outcomes.
- Use names and profile details that fit the game's tone. Allow players to rename members only if the rename rules and costs are clear.
- Provide filters for role, assignment, availability, and specialty, plus grouped roster summaries for large crews.
- Show why a member cannot be selected, such as working as a dealer, assigned to a business, or away on a run.
- Record promotions, training, assignments, releases, and notable completed jobs in member history.

**Gate:** A player can find an eligible member and understand their strengths and current commitment without navigating through multiple unrelated tabs.

### 1.7.0-C — Career Experience & Specialties

Make members improve in ways tied to their work.

- Award experience only after a completed server-resolved action or completed interval of work. A failed request, replay, or duplicate tick cannot award it twice.
- Start with a few specialties that map to existing game systems:
  - **Enforcer:** bounded aim or combat performance.
  - **Wheelman:** a bounded benefit to an existing vehicle or route check.
  - **Scout:** a bounded improvement to existing scouting outcomes.
  - **Dealer:** continue 1.6's per-dealer pace and cut progression through the same career record.
  - **Service specialist:** improve performance in a selected worker service category when that category exists in the game's ruleset.
- Keep specialties narrow. Better aim should affect combat aim, not income, travel, or every action at once.
- Display current skill, next milestone, and the actual effect before assignment or training.
- Define all thresholds, multipliers, and caps in the pinned ruleset.

**Gate:** Tests prove skill applies only to its stated job, is capped, advances only from valid completed work, and cannot be multiplied by retries or timing manipulation.

### 1.7.0-D — Assignment, Training & Availability

Give players practical control over who does each job.

- Assign members to supported jobs through clear roster actions. Keep one active assignment per person unless a ruleset explicitly supports a shared reserve role.
- Show available, assigned, in-transit, recovering, and released states distinctly.
- Reassigning a member follows the current job's safe release rules; do not silently abandon stock, vehicles, business shifts, or dealer crews.
- Allow a released member to return to the roster with experience intact. A replacement starts at the base tier.
- Offer a small training choice, such as focusing on one eligible specialty or accelerating the next tier. Display turn/cash cost and expected gain before the player commits.
- Training cannot exceed ruleset caps or bypass the experience earned through play.

**Gate:** Concurrent actions cannot assign the same member twice; members in an active run or work shift cannot be selected elsewhere; release and re-hire preserve career data.

### 1.7.0-E — Teams & Operational Choices

Make the roster matter in jobs where a selected team changes the outcome.

- Start with a short list of operations where member selection adds meaningful choice, such as combat, convoy driving/escorting, scouting, dealer crews, or business staffing.
- Show eligible members, relevant specialties, assignment conflicts, and expected bounded effects before dispatch.
- Support group selection and recommended lineups without making recommendations mandatory.
- Keep reserve crew useful for existing count-based systems. Do not require players to micro-manage the full roster for routine turns.
- Add limited team synergies only when they are transparent and testable; no hidden chain bonuses or single best lineup.
- Reconcile selected personnel on dispatch and completion so failed, interrupted, or retried operations cannot duplicate crew or rewards.

**Gate:** Member availability reconciles across all supported operations; no member can produce overlapping benefits in two simultaneous jobs.

### 1.7.0-F — Balance, Admin & Release

Make individual progression safe to operate and fair across different play styles.

- Add an admin roster view showing member counts, role distribution, assignments, experience ranges, and migration health.
- Make admin corrections auditable and prevent changes to completed or historical rounds.
- Simulate casual and active players, small and large crews, new hires, veteran members, and each specialty path.
- Check that an optimized crew does not make existing combat, supply, travel, business, or worker systems obsolete.
- Review the roster UI on desktop and mobile, including large lists and accessibility of status labels.
- Run pinned historical-ruleset tests and database migration tests before release.

**Release gates:**

- Migrated players retain every crew member and all existing derived totals.
- Experience is awarded once for completed work and is never created by retries or passive waiting.
- Releasing, replacing, and rehiring members behaves predictably; the old member's career is retained.
- Specialties are visible, capped, and restricted to their intended actions.
- Individual rosters add strategic choice without requiring constant manual selection for normal play.
- 1.7 rules do not alter earlier rounds.

## Initial balance recommendations

- Launch with a handful of specialties, one clear effect each, and generous but finite caps.
- Prefer earned milestones over random stat rolls so players understand why a member is strong.
- If random starting traits are used, make them visible at recruitment and keep their power modest.
- Do not introduce permanent death, purchasable skill, or a large point-allocation tree in the first release.
- Reuse the dealer experience and cut rules already established in 1.6 rather than layering separate dealer XP on top.

## Open decisions

- Should all recruited members receive names and profiles immediately, or should 1.7 first individualize members assigned to active jobs and expand to reserves later?
- Are profiles auto-named, player-named, or a mix with a clear rename limit?
- Which existing combat and travel formulas are safe places to add a specialist bonus without shifting current balance too far?
- Which worker service categories should receive individual proficiency, and should the player choose a specialty or discover it through use?
- Should training cost turns, cash, or both?
- Which operations benefit enough from selecting individuals to justify the extra player decision?

## Explicitly deferred

- Deep branching skill trees with many stat points.
- Permanent crew-member death or irreversible loss of experience.
- Player-to-player trading of individual members.
- Real-money recruitment, training, or competitive bonuses.
- Dozens of traits that are hard to compare or remember.
- Individual animation or artwork for every member; cosmetics can be scoped separately after the profile and data model are proven.

## Guiding question

**1.7.0:** Who actually runs my operation, and how do they get better at it?

The answer should make a favorite dealer, driver, enforcer, scout, or worker feel earned and memorable while preserving the readable strategy and familiar crew management of StreetsEmpire.
