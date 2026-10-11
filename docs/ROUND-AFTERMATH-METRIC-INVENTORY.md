# Round aftermath metric inventory

Slice A freezes metrics only when their source is durable and their cutoff meaning is clear. Version 1 is `round-aftermath-v1`; Slice C adds version 2 (`round-aftermath-v2`) with stable city keys, local standings, and an as-of-cutoff alliance snapshot. Version 3 (`round-aftermath-v3`) adds per-player physical-city turf and business holdings. Monetary values inside report JSON are base-10 integer-cent strings; UI conversion must happen after reading the report.

## Version 1: recorded at round close

Eligibility for competitive aggregates is the frozen `RoundPlayer.nationalRank IS NOT NULL`. Final standing calculation already excludes inactive accounts and NPC gangs. All round-player rows remain in the personal snapshot, but do not enter eligible global totals or category records when ineligible.

| Metric | Source and cutoff | Unit / aggregation | Attribution and limits |
| --- | --- | --- | --- |
| Participants | `RoundPlayer` rows after final settlement | Players, counted once per round | Includes every row; this is not the eligible competitor count. |
| Eligible competitors | Frozen `RoundPlayer.nationalRank` | Players | Inactive accounts and NPC gangs have null final ranks. |
| Final net worth | `RoundPlayer.netWorthCents` after `PlayerStateService` settlement | Integer cents; sum eligible players once | Each player's full final amount belongs to their final `cityId`; never repeated for cities they visited. |
| Final crew | `RoundPlayer.thugs` and `RoundPlayer.whores` after settlement | Members; sum eligible players | A cutoff headcount, not recruits, releases, losses, or peak roster. |
| Final turf control | `Turf.holderId` and `Turf.cityId` after cutoff turf-war settlement | Held blocks | A final ownership snapshot, not captures, defenses, duration, or activity. |
| Active business footprint | `Business.level > 0` joined to its turf's final `holderId` | Active lots held | A final footprint only; not gross revenue, profit, or business ownership history. |
| Crime actions | `RoundPlayer.raidsDone` and `RoundPlayer.driveBysDone` | Round-global and per-player attempted actions | Counters explicitly include attempts whether landed or not; they are not victories. They are not attributed to a city because these counters do not retain event city. |
| City aggregates | The union of final participant cities and round turf cities | Final resident wealth/crew; turf and businesses by physical location | The list is data-driven. A player's global event counters are never relabeled as activity in their final city. |
| Category records | Frozen national rank and supported cutoff counters | All tied leaders are retained | Wealth ties use frozen national rank; other counters retain every eligible player at the maximum. Empty rounds have no category champions. |
| City keys and local standings (v2) | `City.slug` and frozen `RoundPlayer.localRank` | Public stable slug and final eligible local rankings | Local totals use final resident city; physical city remains the attribution for turf/businesses. No city-scoped crime totals are inferred. |
| Alliance roster and control (v2) | Non-disbanded `Alliance`, each `RoundPlayer.allianceId`/`leaderId`, final `Turf.holderId`, and active businesses | Combined eligible net worth, roster counts, member public summaries, turf and businesses at cutoff | Membership/leadership and territory attribution are sampled in the close transaction. Net worth includes eligible members only; no capture history or time-held claims are made. |
| Per-player physical-city holdings (v3) | Final turf and active business lots grouped by holder and stable city slug | Turf blocks and active business lots per player/city | Supports accurate city-scoped boards without assigning holdings to a player's final resident city. |

## Not recorded in version 1

These values remain `NOT_RECORDED`, not zero, until a complete source and attribution rule are implemented:

| Metric | Why it is not yet safe |
| --- | --- |
| Earned and spent money | The available ledgers do not provide complete, consistently scoped round totals across every source. |
| Turf captures, defenses, and hold duration | The final `Turf` row proves cutoff ownership, but does not by itself provide a complete cross-system event count. |
| Recruited, released, and lost crew | Crew history coverage is not complete for every round, so cumulative totals cannot be safely backfilled. |
| Drugs produced, transported, and sold | Stock movements and sales are not a complete, consistently attributed production-and-sales history. Product keys must also be checked against each round's pinned ruleset. |
| Business revenue and profit | `Business.registerCents` is a cutoff balance, not cumulative revenue or net profit. |
| Crime victories | Raid and drive-by counters measure attempts; outcomes need a separately verified source and definition. |
| Historical alliance outcomes | Older reports do not contain an alliance snapshot; cumulative timed control, captures, defenses, and war outcomes are not inferred from final membership. |
| Historical reports for rounds closed before this migration | There is no canonical shared cutoff for all report sources. These rounds are seeded as `UNAVAILABLE`; their aggregates are not reconstructed from current state. |

The report is written in the same transaction that settles and closes a round. The source rows, cutoff, finalized aggregates and `READY` status therefore commit together or not at all. A unique `roundId` and the round lifecycle lock prevent retries from replacing a published snapshot. Version 1 reports remain readable for global data, but city detail and alliance tabs explicitly report unavailable when their version-2 frozen keys/data are absent. There is no public rebuild path; future corrections require an explicit audited workflow.

## Records, awards, and next-round cash

National top-10 finishers and winners of supported global awards (Wealth King, Turf Warlord, Crew Commander, Business Tycoon, and Round Champion) qualify for $500 per distinction, capped at $2,500 per account for the next round. Awards can stack as distinct qualifications; unsupported Drug Kingpin and Most Feared awards and city-scoped awards do not grant cash. Tied eligible global leaders all qualify. A claim is stored once per account/target round and committed in the same transaction as the new round player and starting cash; its source is only the immediately previous ended round when that round has a `READY` frozen report.
