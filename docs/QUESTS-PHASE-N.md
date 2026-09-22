# Quest System — Phase N Catalog Completion

Phase N completes the first planned handcrafted quest set.

Before N, 0.7-L contains:

- 10 story Jobs
- 18 side Jobs
- 28 handcrafted Jobs total

Phase N adds two capstone contracts:

- **Top Shelf** for Pip
- **Full Rack** for Tommy

The new 0.7-M ruleset therefore contains **30 handcrafted Jobs**.

## Ruleset boundary

Phase N ships as:

- 0.7-L — Phase M contact expansion, 28 Jobs
- 0.7-M — Phase N catalog completion, 30 Jobs

Older pinned rounds keep their original catalogs.

## Design rule

The final two Jobs do not add a quest-only button, action, inventory or currency.

They listen to gameplay events that already exist:

- Pip store sales
- Tommy store purchases
- raid results
- post-action armed-thug state

This keeps the Jobs layer attached to the game instead of becoming a separate minigame.

---

## Pip — Top Shelf

Prerequisites:

- Move the Weight complete
- 60 Pip reputation

Objectives:

- sell 50 Cocaine to Pip
- sell 25 Heroin to Pip

Bonus:

- sell 50 Meth to Pip while filling the contract

Rewards:

- $30,000
- 2 Pip Connections
- +25 Pip reputation

The 60-reputation gate is reachable only after the existing Pip sequence:

- Cookhouse: +10
- Bulk Order: +15
- Party Favors: +15
- Move the Weight: +20

Total: 60.

Top Shelf therefore acts as the capstone for the advanced product path already opened by the earlier Pip Jobs.

---

## Tommy — Full Rack

Prerequisites:

- Patch Job complete
- Plant the Flag complete
- 90 Tommy reputation

Objectives:

- buy 5 AK-47s from Tommy
- win 3 raids

Bonus:

- have at least 30 armed, fit thugs

Rewards:

- $35,000
- 2 Tommy Vouchers
- 1 Burner Phone
- +25 Tommy reputation

Plant the Flag is required because it is the Job that grants permanent AK-47 rack access.

The 90-reputation gate is reachable from the existing Tommy work:

- Heavy Hands: +15
- Eyes Open: +10
- Collection Day: +20
- Stock the Crew: +10
- Two Collections: +15
- Patch Job: +20

Total: 90.

Full Rack is therefore the end of Tommy's current weapon/combat progression rather than an early shortcut into the best rack.

---

## Compatibility

0.7-M inherits 0.7-L unchanged except for:

- the two new Job definitions
- follow-up links from Move the Weight and Patch Job
- ruleset metadata

It preserves:

- all 28 previous Jobs
- all permanent product and weapon unlocks
- all timed favors
- all armed single-use favors
- Hideout v2 and specializations
- Travel, Heat and Turf balance
- store, combat and product balance

No schema migration is required.

## Tests

Phase N covers:

- the exact two-job capstone catalog
- 28 → 30 catalog boundary
- pinned 0.7-L preservation
- new follow-up links existing only in 0.7-M
- reachable 60 Pip reputation gate
- reachable 90 Tommy reputation gate
- Cocaine-only matching for the Pip objective
- AK-47-only matching for the Tommy purchase objective
- raid wins versus losses
- reward-kind compatibility
- Hideout inheritance
- ruleset registry count
