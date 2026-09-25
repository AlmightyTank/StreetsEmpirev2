# Quest System — Phase Q Secret Jobs

Phase Q adds one-time Jobs that stay completely absent from the player's board until unusual gameplay conditions expose them.

## Ruleset boundary

Phase Q ships as:

- 0.7-O — 30 handcrafted Jobs + 8 daily + 6 weekly definitions
- 0.7-P — everything in O + 7 SECRET definitions

The seven secret definitions bring the catalog from **44 to 51**.

No existing Job, daily/weekly rotation, permanent unlock, favor, Hideout rule or balance number is replaced.

## Hidden means hidden

SECRET definitions are synced into the server's QuestDefinition catalog like every other Job, but an unrevealed secret does **not** receive a PlayerQuest row.

That matters because the Jobs API is built from PlayerQuest rows. Before discovery, the player receives:

- no title
- no description
- no objective text
- no rewards
- no Locked placeholder

When the server-side trigger is satisfied, the normal one-time PlayerQuest is created as AVAILABLE. From there it accepts, tracks, abandons, progresses and claims through the existing quest pipeline.

Revealed secrets never hide again.

## Initial secret catalog

### The Red Line — Vic

Trigger: reach **80 Heat**.

Job:
- bribe away 20 Heat
- make 2 successful bribes

Reward:
- $30,000
- 1 Burner Phone
- +20 Vic reputation

### Blood in the Water — Tommy

Trigger: lose **3 raids as the attacker**.

Job:
- win 2 raids as the attacker

Reward:
- $35,000
- 2 Tommy Vouchers
- +20 Tommy reputation

### One Phone Call — Vic

Trigger: suffer a **RUN_INCIDENT / ARREST**.

Job:
- bring one run home with no road incident

Reward:
- $30,000
- 1 Burner Phone
- +20 Vic reputation

### Heavy Freight — Wheels

Trigger: bring home a run carrying **500+ total product units**.

Job:
- bring 3 runs home
- accumulate 30 returned-run road turns

Reward:
- $40,000
- 1 Low-Rider
- +20 Wheels reputation

### House Full — Mama King

Trigger: own **1,000 hoes**.

Job:
- earn $750,000 through Scout/street work

Reward:
- $50,000
- 2 Mama's Advice favors
- +25 Mama reputation

### Corner King — Blocks

Trigger: hold **3 turf blocks at once**.

Job:
- win 2 turf pushes as attacker
- post 25 thugs onto held turf

Reward:
- $50,000
- 1 Doctor Favor
- +25 Blocks reputation

### Seven Figures — Pip

Trigger: reach **$1,000,000 net worth**.

Job:
- sell $500,000 of product to Pip

Reward:
- $50,000
- 2 Pip's Connections
- +25 Pip reputation

## Trigger engine

Phase Q stores trigger configuration inside the existing QuestDefinition availability JSON.

Supported initial trigger families:

- `STATE_AT_LEAST` — authoritative RoundPlayer values
- `ACTIVITY_COUNT` — filtered PlayerActivity history
- `ACTIVITY_OBJECT_SUM_AT_LEAST` — one matching activity whose configured object field sums to the threshold
- `TURF_COUNT_AT_LEAST` — current blocks held by the player

The trigger system evaluates server data only. Browser state cannot reveal a secret.

## Progress starts after discovery

Discovery is not retroactive objective progress.

For example, the third lost raid can reveal Blood in the Water, but its subsequent two required wins must happen after the player accepts the Job. This keeps secret triggers as discovery conditions rather than free objective credit.

## UI

Revealed SECRET Jobs use the ordinary Available/Active/Completed views and identify themselves as **Secret job** on their card.

No separate Secret tab is added because a tab itself would disclose that hidden work exists before discovery.

## Rewards and progression

Secret Jobs have stronger flavor rewards than routine contracts, but Phase Q deliberately avoids permanent progression:

- no permanent unlocks
- no weapon-access rewards
- no secret-only currency
- no required secret chain for the 30-Job main catalog

Players can miss a secret trigger for a while without blocking the normal game.

## Compatibility

Phase Q requires no schema migration.

It reuses:

- QuestType SECRET
- QuestDefinition.availability JSON
- PlayerQuest
- PlayerActivity
- Turf
- the existing quest progress/reward pipeline

0.7-O stays pinned without any secret definitions.

## Tests

Phase Q covers:

- 44 → 51 definition boundary
- exact seven-secret catalog
- all definitions hidden and one-time
- repeated-loss filtering
- arrest filtering
- large-cargo object-sum trigger
- no permanent unlock/weapon-access secret rewards
- inherited daily/weekly/favor/unlock/Hideout behavior
- ruleset registry count
