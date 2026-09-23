# Quest System — Phase T Alliance Contracts

Phase T turns the existing alliance into a real shared Jobs surface.

It deliberately reuses the proven quest engine instead of introducing a second mission system.

## Ruleset boundary

Phase T ships as:

- `0.7-R` — Phase S, 56 definitions including the two dynamic City templates
- `0.7-S` — everything in R plus four Alliance contracts

The catalog grows from **56 to 60 definitions**.

No schema migration is required. `QuestType.ALLIANCE`, `PlayerQuest.rewardState`,
`QuestProgressReceipt`, alliance membership and the normal activity ledger already provide
the persistence needed for shared attempts.

## Board cadence

Alliance contracts use the existing weekly boundary:

- Monday
- the ruleset's normal UTC daily-reset hour
- all four contracts are available each week
- only players currently in an alliance see fresh Alliance offers

The four slots are fixed rather than randomly selected. The group already has enough variance
from membership, turf state, travel routes and weekly player activity.

## Starting a contract

Any current member may start an available Alliance contract.

Acceptance is serialized under the Alliance row lock. The server then snapshots every current
member into `rewardState.allianceContract.participantIds` and starts the same attempt for all
of them in one transaction.

The immutable shared state records:

- alliance id and name
- weekly window start/end
- accepted timestamp
- snapshotted participant ids

This means two members cannot create competing copies by accepting at the same time.

## Membership rules

The roster is frozen when the contract starts.

- A member who joins later waits for the next weekly attempt.
- A snapshotted member who leaves stops contributing.
- A former member cannot collect the reward while outside the alliance.
- Leaving does not delete historical quest rows.
- Repeated refreshes cannot change the participant snapshot.

These rules prevent a player from joining after the work is finished just to collect a payout.

## Shared progress

Normal gameplay remains the source of truth.

When a snapshotted member produces a matching authoritative activity, the quest progress service
fans that source event out to every snapshotted participant who is still in the same alliance.

Each mirrored PlayerQuest writes its own `QuestProgressReceipt` using the same source event id.
That keeps retries idempotent while making every participant see the same progress.

Alliance rows are excluded from the ordinary actor-only quest candidate path, so one event cannot
be counted once personally and a second time through the alliance fan-out.

## Initial contracts

### Hold the City

As an alliance, successfully defend **4 turf pushes**.

Source:

- `TURF_PUSH_DEFENSE`
- requires `held = true`

Reward to each snapshotted member who is still in the alliance:

- $40,000
- 25 turns

### War Chest

As an alliance, sell **$1,000,000** through normal store counters.

Source:

- `STORE_SELL.totalCents`

Reward per eligible member:

- $35,000
- 20 turns

### Reinforcements

Send **100 thugs** as true ally backup.

Sources:

- `CONVOY_BACKUP.thugs`
- `TURF_PUSH_BACKUP.thugs`
- requires `kind = ALLY`

Owner self-backup does not count.

Reward per eligible member:

- $35,000
- 20 turns

### Interstate Empire

As an alliance:

- bring **12 intercity runs** home
- visit **6 unique cities** across those returned runs

Source:

- `RUN_RETURNED`
- `RUN_RETURNED.cities`

Reward per eligible member:

- $40,000
- 1 Low-Rider

## Personal Job limits

Alliance contracts do **not** consume the individual 8-Job active limit.

They may still be tracked like any other active Job, subject to the normal tracked-Job limit.

Alliance contracts cannot be abandoned individually after the shared roster has started. Allowing
one member to reset only their mirrored row would break shared-progress and receipt guarantees.

## UI

The Quest page adds an **Alliance** tab when the player has current Alliance contract rows.

Cards use the existing site styling and show:

- Alliance contract label
- shared objective progress
- per-member reward
- weekly reset time
- normal Ready / Collect state

The ordinary Available count excludes Alliance contracts.

## Rewards

Phase T uses **shared rewards** rather than contribution-weighted payouts.

The objective itself scales through group effort, while each snapshotted member who remains in
the alliance may claim once from their own mirrored row.

No Alliance contract grants:

- permanent unlocks
- weapon access
- contact reputation

That keeps this layer useful without turning alliance membership into permanent account power.

## Compatibility

Phase T preserves all Phase S behavior:

- 30 handcrafted Jobs
- Daily and Weekly contracts
- Secret Jobs
- Branching Jobs
- Dynamic City contracts
- favors
- permanent unlocks
- Hideout v2
- travel and convoy systems
- turf and alliance rules

Older pinned rulesets do not receive Alliance contracts.

## Tests

Phase T coverage includes:

- 56 → 60 ruleset boundary
- exactly four ALLIANCE definitions
- weekly repeatability
- planned turf / economy / reinforcement / travel objective shapes
- no permanent-progression rewards
- immutable shared-state parsing
- progress fan-out only to snapshotted members still in the alliance
- inherited Phase S quest, favor, unlock and Hideout behavior
