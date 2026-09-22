# Quest System — Phase B Objective/Event Tracker

Phase B turns the Phase A storage contract into a live progress engine. It does not add the quest page, accept/turn-in APIs, rewards, contacts, favors or the handcrafted quest catalog yet.

## Event source

The existing `PlayerActivity` feed is now the default quest event bus.

`ActivityService.log()` writes the activity row and immediately feeds that committed row to `QuestProgressService` using the same Prisma transaction client.

This gives quest progress the same atomicity as gameplay:

- rolled-back gameplay cannot leave quest progress behind
- an activity cannot commit while matching quest progress silently fails to commit
- combat, recon, travel settlement, turf settlement and other systems already using `ActivityService` automatically become quest-event sources

Systems that do not emit `PlayerActivity` can use `QuestProgressService.emit()` with their own stable `sourceKey`.

## Durable idempotency

`QuestProgressReceipt` records one source event per quest attempt.

The unique key is:

`(playerQuestId, sourceKey)`

Normal activity keys use:

`activity:<PlayerActivity.id>`

This is deliberately separate from `ProcessedAction`. Action replay prevents a gameplay action from executing twice; the quest receipt independently guarantees the same event cannot advance one quest attempt twice.

## Concurrency

Before changing one `PlayerQuest`, the tracker takes a row lock on that quest attempt. This prevents two simultaneous events from reading the same JSON progress snapshot and overwriting one another.

## Supported objective kinds

### EVENT_COUNT

Adds one for each matching event.

Example use:

- Scout 10 times
- Recon 3 players
- Complete 5 runs
- Treat wounded thugs twice

Configuration:

```ts
{
  id: 'recons',
  kind: 'EVENT_COUNT',
  target: 3,
  params: { eventTypes: ['COMBAT_RECON'] }
}
```

### EVENT_SUM

Adds a positive numeric field from matching event payloads.

Example use:

- Produce 500 Crack
- Buy 100 Weed
- Sell 1,000 product units
- Treat 25 thugs

Configuration:

```ts
{
  id: 'crack',
  kind: 'EVENT_SUM',
  target: 500,
  params: {
    eventTypes: ['PRODUCE_CRACK'],
    field: 'product',
    where: { productType: 'CRACK' }
  }
}
```

Dotted paths are supported for nested payload values and filters.

### SPEND_TURNS

Adds `payload.turns`, falling back to `payload.turnsUsed`.

Example:

```ts
{
  id: 'scout_turns',
  kind: 'SPEND_TURNS',
  target: 12,
  params: { eventTypes: ['SCOUT'] }
}
```

### EARN_CASH

Adds only positive `payload.cashCents` values.

Losses never subtract from cumulative earned-cash progress.

### RECRUIT_CREW

Adds recruited `whores`, `thugs`, or both from an event payload.

`params.crew` may be:

- `WHORES`
- `THUGS`
- `ANY`

### WIN_EVENTS

Adds one when a matching event contains:

`won: true`

This works naturally with raid, drive-by and other combat activity payloads.

### STATE_AT_LEAST

Reads the authoritative post-event `RoundPlayer` state rather than accumulating an event counter.

Example:

```ts
{
  id: 'muscle',
  kind: 'STATE_AT_LEAST',
  target: 5,
  params: { field: 'thugs' }
}
```

This is intentionally different from `RECRUIT_CREW`.

- **Own 5 thugs** uses `STATE_AT_LEAST`.
- **Recruit 5 thugs after accepting** uses `RECRUIT_CREW`.

State objectives may decrease. If a quest was ready to turn in and the player falls below a required state threshold before claiming it, the tracker returns the quest to `ACTIVE`.

## State fields currently exposed

The Phase B authoritative state snapshot includes:

- cashCents
- turns
- payoutPercent
- whores
- thugs
- fitThugs
- woundedThugs
- busyThugs
- postedThugs
- armedThugs
- condoms
- medicine
- crack
- beer
- pistols
- shotguns
- tek9s
- ak47s
- lowRiders
- weapon-unlock booleans
- heat
- netWorthCents
- all current hideout room levels
- allianceId
- current city slug

Other product inventory can be added when the content slice needs state-based objectives for those rows.

## Event filters

Every Phase B objective may restrict its event source with:

`params.eventTypes`

It may also require exact payload values with:

`params.where`

Example:

```ts
{
  eventTypes: ['STORE_BUY'],
  where: {
    storeKey: 'PIP',
    product: 'WEED'
  }
}
```

The `where` keys may use dotted paths.

## Stable event keys

Phase B adds stable machine-readable keys to several existing activity payloads without removing their display strings:

### Scout

- `district` — display name
- `districtKey` — ruleset key

### Store trades

- `store` — display name
- `storeKey`
- `item` — display name
- `itemKey`
- `direction`

### Pip product trades

Also expose:

- `product`
- stable product/item key

### Weapon unlocks

Expose:

- `weapon` — display name
- `weaponKey`

Quest definitions should prefer stable keys.

## Required and bonus objectives

Required and bonus objective arrays are reduced independently.

An event may advance both in the same transaction.

When every required objective is complete:

`ACTIVE -> READY_TO_TURN_IN`

Bonus objectives may continue progressing while the quest is ready to turn in.

Phase C will own accepting and claiming quests.

## Timed quests

Before applying an event, the tracker checks `expiresAt`.

If the deadline has passed:

`ACTIVE / READY_TO_TURN_IN -> EXPIRED`

No late event is credited.

## Validation

The ruleset validator now rejects:

- non-positive objective targets
- invalid/empty event-type arrays
- EVENT_SUM without a field
- STATE_AT_LEAST without a field
- invalid RECRUIT_CREW selector values

This is in addition to all Phase A catalog validation.

## Deliberately not in Phase B

Later slices still own:

- syncing ruleset quest definitions into `QuestDefinition`
- accept/abandon/claim APIs
- initial state reconciliation when a quest is accepted
- prerequisite evaluation
- reward execution
- Quest page UI
- contact reputation expansion
- favorites/tracking
- favors and timed buffs
- handcrafted story content
- daily/weekly rotation

## Phase B result

The game now has one central mechanism that can observe existing gameplay and progress active quests without adding checks like:

`if (FIRST_NIGHT_OUT is active) ...`

inside Scout, Combat, Travel, Turf or Store code.

That is the foundation needed for Phase C and the first actual handcrafted quest chain.
