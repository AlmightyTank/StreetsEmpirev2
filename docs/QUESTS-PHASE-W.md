# Quest System — Phase W Balance & Anti-Abuse

Phase W hardens the expanded Jobs system after the Daily, Weekly, Secret, Branching, City, Alliance, Community/Event and UI phases.

The goal is not to make quests stingier. It is to close reward-farming and replay edges while keeping normal cooperative play rewarding.

## Version boundary

Phase W introduces `classic-og-v0.7-u` / `0.7.0-U`.

- It inherits all 64 Phase U quest definitions.
- It does not add or remove quests.
- It does not change the shared Alliance objective targets.
- It does not reduce Alliance payouts.
- It does not change Daily, Weekly, City or Community/Event reward amounts.
- Older rounds pinned to `classic-og-v0.7-t` keep their original behavior.
- No Prisma migration is required.

This is a balance-sensitive behavior change, so it receives a new pinned ruleset instead of silently changing existing rounds.

## Alliance reward free-rider protection

Phase T intentionally snapshots the full Alliance roster when a contract starts. That prevents late joiners from inheriting completed work, but it still allowed a snapshotted member to contribute nothing while another member completed the whole shared objective.

Phase W keeps the shared objective and adds a small personal eligibility floor for each snapshotted member.

| Alliance contract | Shared target unchanged | Personal requirement to collect |
| --- | --- | --- |
| Hold the City | Successfully defend 4 turf pushes | Help with at least 1 turf defense |
| War Chest | $1,000,000 in store sales | Personally sell $25,000 through store counters |
| Reinforcements | Send 100 ally-backup thugs | Personally send 10 ally-backup thugs |
| Interstate Empire | Return 12 runs and visit 6 cities | Personally return 1 intercity run |

These are eligibility floors, not extra shared objectives. One member's personal contribution never satisfies another member's floor.

## Server-authoritative contribution accounting

Personal Alliance contribution is derived only from authoritative server activity:

- `TURF_PUSH_DEFENSE` / `TURF_PUSH_BACKUP`
- `STORE_SELL`
- `CONVOY_BACKUP` / `TURF_PUSH_BACKUP`
- `RUN_RETURNED`

The browser does not send contribution totals.

Contribution progress is stored inside the existing PlayerQuest `rewardState` beside the immutable Alliance attempt snapshot. The shared objective continues to use the existing mirrored `objectiveProgress`.

QuestProgressReceipt remains the replay guard, so the same source event cannot advance either shared progress or a personal floor twice.

## Ready and claim rules

An Alliance contract becomes Ready for a member only when both are true:

1. the shared Alliance objective is complete; and
2. that member's personal contribution floor is complete.

Members who have not contributed stay Active even after the Alliance finishes the shared target. Their next eligible server activity can satisfy their personal floor while the contract window remains open.

Claim performs the contribution check again server-side. A stale or manipulated client cannot collect by posting directly to the claim endpoint.

Existing membership protections remain in force:

- the member had to be in the snapshotted roster;
- the member must still belong to the same Alliance at claim time;
- late joiners do not inherit the attempt;
- Alliance/member lock ordering remains Alliance first, then RoundPlayer.

## Claim replay hardening

Resource-changing actions already use client-generated action IDs and ProcessedAction replay protection.

Before Phase W every quest claim shared the replay namespace `QUEST_CLAIM`. Reusing one action ID across two different quest keys could therefore replay the first claim response into the second request.

Phase W scopes quest-claim replay records by quest key:

`QUEST_CLAIM:<quest key>`

The public action remains `QUEST_CLAIM`; the narrower string is used only for replay binding.

This means:

- a legitimate retry of the same quest claim still returns the original result;
- the same request ID cannot masquerade as a different quest claim;
- reward application remains transactional and idempotent.

## Repeatable-job farm audit

Phase W keeps the existing one-attempt-per-window behavior:

- Daily contracts materialize one live attempt per selected contract until the daily reset.
- Weekly contracts materialize one live attempt per selected contract until the weekly reset.
- Dynamic City contracts key attempts to the exact 12-hour offer window.
- Alliance contracts allow one shared attempt per Alliance/slot/week.
- Community Events have one quarter-season attempt and already require personal contribution.

Completing, abandoning, refreshing, logging out, or reopening Jobs does not create an extra reward-bearing attempt inside the same window.

## Balance guardrails

Automated regression coverage now asserts that:

- Phase W keeps the 64-definition catalog size.
- non-Alliance Phase U definitions are inherited unchanged.
- Alliance shared objectives and rewards are unchanged.
- every hardened Alliance contract has a personal contribution floor.
- repeatable quest definitions do not award permanent unlocks or weapon-access rewards.
- contribution progress is separate per member.
- claim rejects a non-contributing member even when the shared work is complete.

## UI

Hardened Alliance cards use the Phase V progress treatment to show:

**Your contribution · <requirement>**

The shared Alliance objective remains visible immediately below it.

Players can therefore tell the difference between:

- what the Alliance still owes, and
- what they personally still owe before collecting.

## Out of scope

Phase W does not:

- add CAPTCHAs or friction to normal gameplay;
- punish high activity by itself;
- add hidden client-side anti-cheat;
- reduce rewards solely because an Alliance is full;
- alter raid combat balance;
- change the five-member Alliance cap;
- add permanent account penalties for ordinary failed or expired quests.

Anti-abuse rules are enforced through authoritative game state, transactions, immutable attempt windows and idempotent event accounting.

## Release checks

Phase W is complete when:

- a zero-contribution Alliance member cannot collect a shared contract reward;
- a contributing member can collect normally once the shared target is complete;
- one member's contribution cannot credit another member's personal floor;
- duplicate source events do not double-count;
- late Alliance joins still cannot inherit an in-flight attempt;
- leaving the Alliance still blocks claim;
- repeated request IDs cannot cross quest-claim namespaces;
- Daily, Weekly, City and Event reward windows cannot be recycled early;
- `0.7-T` remains unchanged for already-pinned rounds;
- `0.7-U` passes quest/ruleset/server regression coverage.
