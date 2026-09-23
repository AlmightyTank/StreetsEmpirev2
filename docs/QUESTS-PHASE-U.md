# Quest System — Phase U Community / Seasonal Events

Phase U adds round-wide community events to the Jobs system.

The goal is to make each season feel like it has a changing rhythm without creating a second mission engine or giving passive players free rewards.

## Ruleset boundary

Phase U ships as:

- `0.7-S` — Phase T, 60 definitions including Alliance contracts
- `0.7-T` — everything in S plus four Community events

The catalog grows from **60 to 64 definitions**.

No Prisma migration is required. The existing `EVENT` quest type, `PlayerQuest`,
`QuestProgressReceipt`, activity ledger and round start/end timestamps are enough.

## Seasonal schedule

The round is split into four event windows:

| Round window | Event | Shared goal |
| --- | --- | --- |
| 0–25% | Opening Rush | 100 scouting actions |
| 25–50% | Money in Motion | $1,000,000 of store sales |
| 50–75% | Interstate Push | 25 returned intercity runs |
| 75–100% | Last Call | 40 raids or turf pushes launched |

Exactly one Phase U event is active at a time.

The window is derived from the pinned round's `startsAt` and `endsAt`, so short and long seasons keep the same four-part structure.

## Automatic participation

Community events do not need an Accept button.

When a player performs gameplay during an active event, the quest progress service materializes that player's event attempt before evaluating the activity. Opening the Jobs page also materializes the active attempt.

This prevents activity from being lost just because the player never opened the Events tab first.

Event attempts:

- start automatically
- do not consume the personal 8-Job active limit
- may be tracked normally
- cannot be abandoned
- expire at the end of their quarter-season window

## Shared progress without fan-out writes

Each player's event row records only that player's own matching contribution.

The shared total is calculated by summing matching event rows for the same:

- round
- quest definition
- event window

This is intentionally different from Alliance contracts.

Alliance contracts have a frozen roster and mirror an event to several known participant rows. Community events can involve the whole round, so writing every gameplay event into every player's quest row would create unnecessary fan-out, contention and deadlock risk.

Phase U therefore keeps writes local to the actor and calculates the community total from committed per-player contributions.

`QuestProgressReceipt` still makes retries idempotent.

## Personal participation floor

A completed global target is not enough by itself.

To collect the reward, a player must also contribute:

- **Opening Rush:** 5 scouting actions
- **Money in Motion:** $10,000 of personal store sales
- **Interstate Push:** 1 returned run
- **Last Call:** 2 raids or turf pushes launched

The Events tab shows both the shared objective and **Your contribution**.

A player who joins after the community target has already been reached may still qualify by meeting the personal floor before the event window closes.

## Rewards

Rewards are intentionally seasonal and modest.

### Opening Rush

- $15,000
- 10 turns

### Money in Motion

- $20,000
- 10 turns

### Interstate Push

- $20,000
- 15 turns

### Last Call

- $25,000
- 20 turns

No Phase U event grants:

- permanent unlocks
- weapon access
- contact reputation

## Readiness and claims

A player's EVENT row becomes Ready to collect only when both conditions are true:

1. the round-wide objective is complete
2. that player meets the personal participation floor

Readiness is refreshed only for the current player. The server does **not** lock or update every participant row when the global goal crosses the finish line.

That keeps concurrent gameplay from different players from forming cross-player lock cycles.

Claims re-check the shared goal and personal contribution before paying.

## UI

The Jobs page adds an **Events** tab while the current seasonal event exists.

Event cards show:

- Community event label
- shared round-wide progress
- Your contribution and required personal floor
- event end time
- normal Track / Collect controls

There is no Accept or Abandon action for EVENT jobs.

The Jobs summary also shows the current Community event and highlights it when the reward is ready.

## Compatibility

Phase U preserves all Phase T behavior:

- handcrafted Story and Side Jobs
- Daily and Weekly contracts
- Secret Jobs
- Branching Jobs
- Dynamic City contracts
- Alliance contracts
- favors
- permanent unlocks
- Hideout v2
- travel, convoy, turf and alliance systems

Older pinned rulesets do not receive Community events.

## Tests

Phase U coverage includes:

- 60 → 64 ruleset boundary
- exactly four EVENT definitions
- four contiguous quarter-season windows
- authoritative Scout / Store / Run / Combat activity sources
- bounded seasonal rewards
- event-window timestamp calculation
- shared-progress aggregation
- personal contribution kept separate from the shared total
- inherited Phase T quest, favor, unlock and Hideout behavior
