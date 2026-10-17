# 2.1.0-A — Roster Identity Audit (beta)

**Scope:** existing 1.7 roster and 1.8.6 staffing/travel systems. This is an identity/invariant gate for 2.1.0, **not** a loyalty reward or a new combat modifier.

## Source-of-truth inventory

| Concern | Current authority | Identity and reconciliation rule |
| --- | --- | --- |
| Active thug/worker headcount | `RoundPlayer.thugs`, `whores`; plus active boss-trip bodyguards and run escorts | One active `CrewMember` per targeted slot. Bodyguards/escorts are physically away and must not be counted as home losses. |
| Business staffing | `Business.staffOwnerId`, `staff`, catalog worker/thug staff role, plus `businessThugs`/`businessWhores` | Existing members move into/out of a BUSINESS placement; do not regenerate their identities. |
| Dealer careers | `DealerStaff` (linked `dealerStaffId`, dealer crew, authoritative career XP) and `dealerThugs` | One carrier per career; never overwrite one person's career link with another career. Released historical carriers are not active headcount. |
| Turf and defensive posts | `Turf.holderId`, `cornerThugs`, `postedThugs` | TURF, CORNER_LOOKOUT and STASH_GUARD share the posted total. Corner-specialty counts are read from current named assignments. |
| Runners and staffing orders | `busyThugs`, RUNNER `assignmentRef`, `CrewJobPost` | Physical busy count remains authoritative; orders are targets, not extra headcount. |
| Travel | `BossTrip.bodyguards`, `Run.escortThugs`, selected IDs, trip/run state | BODYGUARD/ESCORT retain member ID on dispatch; completion returns or wounds the same member. |
| Casualties, recovery, release | `RoundPlayer` counters and canonical action settlements; RECOVERING and RELEASED statuses | Moves, not new entities, reflect injury/recovery. Release keeps earned career/XP; unearned careerless members may be pruned under the existing 1.7 policy. |
| Training and work history | `CrewMember.experiencePoints`, `trainingExperiencePoints`, specialty XP and append-only `CrewMemberEvent` | Training is capped by verified work; the per-member event history follows the member, never a count or newly generated name. |
| Names and traits | Member role plus monotonically increasing per-round serial | Deterministic display identity, stable after a swap. A serial cannot be reused within a live roster. |
| Crew happiness and upkeep | Existing action/ruleset values, **not** this roster audit | 2.1 loyalty remains separate; this slice adds no economy, combat or happiness adjustments. |

## Persistence contract

- **Round-scoped:** `CrewMember.id`, serial, current assignment, statuses, dealer career link, earned XP, training, history and (future) loyalty. Owned by `RoundPlayer`, deleted with that round player by cascade; archived rounds retain their round-linked records while their database rows exist. Never transfer active members or boosts into another round.
- **Account-scoped:** `AccountProfile.crewName`, account cosmetics and approved Empire Legacy/Aftermath presentation. Slice E may capture a **read-only snapshot**/artwork of a qualifying member and a moderated nickname for long-term remembrance. It must not recreate a live `CrewMember`, assign a new job or award stat carryover.
- **Reconciliation:** counts and canonical assignment refs produce `crewTargets`; `planCrewRoster` preserves occupants and historical careers, then moves, hires or releases under the per-player lock. `CrewRosterMigration` is the first-build audit; `syncedKey` skips unchanged state. New validation checks the projected post-plan placement counts and career identity **before database writes**.
- **Idempotency and rollback:** all writes remain in the existing transaction; if the identity audit fails, no partial roster is committed. Retry/replay with unchanged authoritative counts has no additional hires/releases.
- **Ruleset compatibility:** when `crewRoster.enabled` is off, no named roster is built. This audit makes no schema changes and does not retroactively add loyalty to historical rounds.

## Issues found and Slice A corrections

1. **Dealer career overwrite risk — corrected.** The planner previously fell back to any same-role person when an unlinked member was unavailable. A member with an existing `DealerStaff` link could be reassigned to a different career, erasing their old career association. New careers now use an unlinked member or a new counted recruit. The old career/identity remains with its original person (possibly RELEASED).
2. **Silent reconciliation defects — fail closed.** The new pure audit compares projected counts by role/status/job/ref, including untouched aggregate placements; rejects duplicate/reused IDs or serials, career overwrite/duplication, missing active dealer carriers, invalid drops and orphaned events.
3. **Scale:** the audit works on the same changed subset already loaded by the incremental planner; it does not add a full-roster query to ordinary actions.

## Existing behavior and follow-up boundaries

- **Deliberate prune:** unearned, careerless departures with 0 XP are deleted by existing 1.7 rules; their event rows cascade. This must be reviewed before Slice E's permanent legends policy if a non-XP historical milestone should qualify for retention. Never treat a pruned entry as a returning veteran.
- **Fast-path limitation:** a matching `syncedKey` skips deep database reinspection. Out-of-band raw database writes need to invalidate that key; full-round diagnostic checks and correction tools belong in 2.1.0-G.
- **Event provenance:** existing work/training entries are append-only but don't yet provide the dedupe ledger/caps needed for loyalty. That is Slice B, and must not use UI reads or assignments alone to earn loyalty.
- **Moderation and deletion:** display names derived from serials are not user input. Future nicknames require moderation; legacy snapshots should be scrubbed/anonymized as required by account deletion.

## Verification gates

1. Pure 2.1.0-A tests: first build, repeat/no-op, mixed turf/wounded/escort statuses, partial-slot preservation, dealer-carrier protection, phantom/duplicate/orphan guards and historical released careers.
2. Existing `crew-roster-plan.test.ts` regression suite: random count-change stress (300 steps), dealer continuity, releases and rehires, specialty assignment distribution.
3. PostgreSQL integration opt-in: `CREW_INTEGRATION=1` verifies migration retries/races, 1.6 career migration, real action reconciliation and staffing vacancies. Requires a test DB and local runtime.
4. `npm run typecheck`, server tests and CI before merging. No financial or competitive changes should result.
