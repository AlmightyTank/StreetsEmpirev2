# Round aftermath metric inventory

Slice A freezes metrics only when their source is durable and their cutoff meaning is clear. The first report schema is version 1 (`round-aftermath-v1`). Monetary values inside report JSON are base-10 integer-cent strings; UI conversion must happen after reading the report.

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
| Alliance outcomes | Current alliance membership is mutable and is not yet represented by a complete as-of-cutoff snapshot in this report. |
| Historical reports for rounds closed before this migration | There is no canonical shared cutoff for all report sources. These rounds are seeded as `UNAVAILABLE`; their aggregates are not reconstructed from current state. |

The report is written in the same transaction that settles and closes a round. The source rows, cutoff, finalized aggregates and `READY` status therefore commit together or not at all. A unique `roundId` and the round lifecycle lock prevent retries from replacing a published snapshot. There is no public rebuild path; future corrections require an explicit audited workflow.
