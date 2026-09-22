# Quest System — Phase P Weekly Contracts

Phase P adds larger rotating goals above the Phase O daily board.

## Ruleset boundary

Phase P ships as:

- 0.7-N — 30 handcrafted Jobs + 8 daily definitions
- 0.7-O — everything in N + 6 weekly definitions

No handcrafted Job, daily contract, favor effect, permanent unlock, Hideout rule, Travel rule, Turf balance or combat number is replaced.

## Weekly board

The weekly board exposes **2 contracts at a time** from a **6-contract pool**.

The board is:

- server-authoritative
- deterministic for the pinned ruleset and weekly window
- shared by players on that ruleset
- category-diverse when the pool allows it
- reset every **Monday** at the same UTC hour used by the daily board

Accepting late does not extend the deadline. Abandoning and reaccepting does not move the reset. Open attempts expire at the shared boundary; completed attempts stay in history. When a contract returns in a later week it receives a new `PlayerQuest.attempt`.

## Initial weekly pool

- **Street Boss** — earn $500,000 from Scout/street work
- **Road Warrior** — bring 5 intercity runs home
- **Warlord** — win 5 offensive fights
- **Landlord** — accumulate 48 combined turf-hours
- **Entrepreneur** — sell $250,000 of product to Pip
- **Traveler** — visit 5 different cities on returned runs

The board shows two of these each week.

## Exact progression

Weekly contracts use the normal authoritative activity pipeline wherever possible.

Two roadmap goals need richer progress than a simple counter:

### Traveler — distinct cities

Phase P adds `UNIQUE_VALUES`.

It reads a scalar or string-array field from matching activity payloads and stores the values already credited with objective progress. Repeating the same city does not advance the goal.

Traveler reads `RUN_RETURNED.cities`, so a multi-city run can legitimately credit several distinct cities.

### Landlord — combined turf-hours

Landlord does not approximate time with turf actions.

The weekly sync reads the existing `TurfHoldSegment` history and sums the overlap between:

- the contract's accepted-at time
- the current server time
- the contract reset deadline

Holding two blocks for 24 hours therefore produces 48 combined turf-hours. Hours before accepting the weekly contract do not count.

## Rewards

Weekly rewards are stronger than dailies but stay below permanent progression:

- $40,000–$60,000 cash
- +10 contact reputation
- occasional resource rewards
- selected contracts grant two useful favors
- Landlord grants one Doctor Favor

There are no permanent unlocks, weapon-access grants or weekly-only currency.

## UI

The Jobs page gets a **Weekly** tab beside Daily.

It shows:

- the current two offers
- accepted/ready/completed attempts from the current weekly window
- the server-authoritative weekly reset time

The page refreshes automatically at the next daily or weekly boundary, whichever comes first.

Historical weekly attempts remain under Completed after their window ends.

## Compatibility

Phase P requires no schema migration.

It reuses:

- `QuestType.WEEKLY`
- `QuestRepeatability.WEEKLY`
- `PlayerQuest.attempt`
- `PlayerQuest.expiresAt`
- `QuestProgressReceipt`
- `TurfHoldSegment`
- the existing quest reward/claim pipeline

Phase P adds one reusable event objective kind (`UNIQUE_VALUES`) and one derived objective kind (`TURF_HOLD_HOURS`).

## Tests

Phase P covers:

- 38 → 44 definition boundary
- exact six-contract weekly pool
- bounded/no-permanent-progression rewards
- Monday reset behavior
- deterministic two-offer selection
- category-diverse selection
- weekly board rotation
- unique-value deduplication
- combined turf-hour overlap accounting
- inherited daily/favor/unlock/Hideout behavior
- ruleset registry count
