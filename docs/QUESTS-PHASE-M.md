# Quest System — Phase M Contact Expansion

Phase M gives the second half of the contact roster real side-job chains.

Before M, the handcrafted catalog contains:

- 10 story jobs
- 3 Mama King side jobs
- 3 Pip side jobs
- 3 Tommy side jobs

Phase M adds:

- 3 Wheels side jobs
- 3 Vic side jobs
- 3 Blocks side jobs

The 0.7-L catalog therefore contains **28 handcrafted Jobs**.

The remaining two jobs for the planned first 30 are intentionally left for the next content-completion slice.

## Ruleset boundary

Phase M ships as:

- 0.7-K — timed + single-use favors, 19 Jobs
- 0.7-L — same gameplay/favors/unlocks plus 9 contact-expansion Jobs, 28 Jobs total

Older pinned rounds do not gain these Jobs retroactively.

## Design rule

No Phase M job adds a quest-only action.

Every objective listens to a gameplay event already produced by:

- Travel runs
- Heat bribes
- Turf posting
- settled turf pushes
- away-city outposts

This keeps Jobs as progression around the game instead of turning the Quest page into a separate minigame.

---

## Wheels — Transportation

Wheels begins with the story job **Pack Your Bags**, which already grants 15 Wheels reputation.

### Road Test

Prerequisite:

- Pack Your Bags complete

Objectives:

- launch 3 intercity runs

Bonus:

- put a cumulative 6 Low-Riders on the road across those launches

Rewards:

- $15,000
- 1 Low-Rider
- +15 Wheels reputation

Resulting Wheels reputation from the story + this job: 30.

### Heavy Haul

Prerequisites:

- Road Test complete
- 30 Wheels reputation

Objectives:

- launch runs carrying a cumulative 20 escort thugs
- launch runs using a cumulative 6 Low-Riders

Bonus:

- bring 2 runs home

Rewards:

- $20,000
- 25 Beer
- +20 Wheels reputation

Resulting Wheels reputation: 50.

### Home Safe

Prerequisites:

- Heavy Haul complete
- 50 Wheels reputation

Objectives:

- bring 3 intercity runs home
- accumulate 30 road turns across those returned runs

Bonus:

- return one run with no recorded road incident

Rewards:

- $25,000
- 2 Low-Riders
- +25 Wheels reputation

The clean-return bonus reads the authoritative `RUN_RETURNED.incidents` list. It does not infer safety from the client.

---

## Vic — The Fixer

Vic has no story job in the first ten, so his first side job is the introduction to his relationship track.

### Grease the Wheel

Prerequisite:

- Payday complete

Objective:

- bribe away 10 Heat

Bonus:

- make one successful bribe that leaves Heat at exactly 0

Rewards:

- $10,000
- 5 Medicine
- +15 Vic reputation

### Price of Silence

Prerequisites:

- Grease the Wheel complete
- 15 Vic reputation

Objectives:

- make 3 successful Heat bribes
- remove a cumulative 15 Heat

Bonus:

- finish one of those bribes at 0 Heat

Rewards:

- $15,000
- 10 Medicine
- +20 Vic reputation

Resulting Vic reputation: 35.

### Clean Slate

Prerequisites:

- Price of Silence complete
- 35 Vic reputation

Objectives:

- bribe away a cumulative 20 Heat
- make a successful bribe that leaves Heat at 0

Rewards:

- $20,000
- 15 Medicine
- +25 Vic reputation

The zero-Heat objective matches `HEAT_BRIBE.heatAfter === 0`. Failed bribes never emit the activity and therefore cannot advance the job.

---

## Blocks — Turf Broker

Blocks begins with the story job **Plant the Flag**, which grants 20 Blocks reputation.

### Fortify the Corner

Prerequisite:

- Plant the Flag complete

Objective:

- post a cumulative 15 thugs onto turf already held

Bonus:

- reach at least 25 total posted thugs after a Turf Post action

Rewards:

- $15,000
- 25 Beer
- +15 Blocks reputation

Resulting Blocks reputation: 35.

### Take Something

Prerequisites:

- Fortify the Corner complete
- 35 Blocks reputation

Objective:

- win 2 settled turf pushes as the attacker

Bonus:

- leave a cumulative 20 attacking thugs posted after won pushes

Rewards:

- $25,000
- 10 Medicine
- +20 Blocks reputation

Resulting Blocks reputation: 55.

This objective listens to `TURF_PUSH_ATTACK`, which is written when the push settles and the attacker is credited. Starting a push is not enough.

### Out-of-Town Box

Prerequisites:

- Take Something complete
- 55 Blocks reputation

Objective:

- successfully establish one away-city turf outpost

Bonus:

- seed that successful outpost with at least $10,000 cash

Rewards:

- $30,000
- 50 Beer
- 15 Medicine
- +25 Blocks reputation

The objective uses the authoritative `TURF_OUTPOST_ESTABLISH.won` result. Losing the locals fight does not count.

---

## Event mapping

| Contact | Job mechanic | Authoritative event / state |
| --- | --- | --- |
| Wheels | run launched | `RUN_LAUNCHED` |
| Wheels | run returned | `RUN_RETURNED` |
| Wheels | Low-Riders / escorts | numeric fields on `RUN_LAUNCHED` |
| Wheels | road turns | `RUN_RETURNED.turnsSpent` |
| Wheels | clean return | `RUN_RETURNED.incidents = []` |
| Vic | bribe count | `HEAT_BRIBE` |
| Vic | Heat removed | `HEAT_BRIBE.points` |
| Vic | clean slate | `HEAT_BRIBE.heatAfter = 0` |
| Blocks | reinforcements | `TURF_POST.thugs` |
| Blocks | total posted crew | post-action `postedThugs` player state |
| Blocks | offensive wins | settled `TURF_PUSH_ATTACK.won` |
| Blocks | attackers left holding turf | `TURF_PUSH_ATTACK.posted` |
| Blocks | away outpost | `TURF_OUTPOST_ESTABLISH.won` |
| Blocks | outpost seed cash | `TURF_OUTPOST_ESTABLISH.cashCents` |

## Compatibility

0.7-L inherits 0.7-K unchanged except for its quest catalog and metadata.

It preserves:

- timed favor definitions
- single-use favors and armed state
- permanent unlocks
- product access
- weapon access
- all prior 19 Jobs
- 0.7-G Hideout v2 behavior and specializations
- Travel / Heat / Turf balance numbers

No schema migration is required for Phase M because it is ruleset content using the existing quest engine.

## Tests

Phase M adds coverage for:

- exact nine-job catalog
- three jobs each for Wheels / Vic / Blocks
- 19 → 28 catalog boundary
- 0.7-K pin preservation
- Hideout inheritance
- contact-reputation gates
- clean vs incident run returns
- Vic zero-Heat matching
- settled turf push wins vs losses
- successful vs failed away-outpost establishment
- no new reward mechanic
- updated ruleset registry count
