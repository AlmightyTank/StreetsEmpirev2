# Quest System — Phase I Permanent Unlocks

Phase I turns job rewards into durable, per-round capabilities.

The key architectural change is a generic `PlayerUnlock` ledger. New permanent rewards no longer require adding a dedicated Boolean column every time StreetsEmpire introduces a product privilege or other unlockable access.

## Ruleset boundary

Phase I ships as a new ruleset:

- 0.7-F: 19 Jobs, no generic permanent-unlock ledger requirements
- 0.7-G: Hideout Specializations, still no generic unlock gates
- 0.7-H: Hideout Specializations + permanent weapon/product unlock rewards

Existing 0.7-F rounds remain unchanged. New rounds may opt into `classic-og-v0.7-g`.

## PlayerUnlock

Each unlock stores:

- player / round
- stable unlock key
- source quest key
- awarded timestamp

The unique key is:

`(roundPlayerId, key)`

Claim retries are safe: awarding the same permanent unlock again does not create a duplicate.

## Weapon progression

The existing story chain is migrated onto generic permanent rewards in 0.7-H:

### Heavy Hands
Unlocks:

**Shotgun Rack Access**

The generic ledger records `WEAPON_SHOTGUN_ACCESS` and the existing `shotgunUnlocked` flag is also enabled for compatibility with the existing store/combat code.

### Collection Day
Unlocks:

**Tek-9 Rack Access**

Writes `WEAPON_TEK9_ACCESS` and mirrors the existing Tek-9 flag.

### Plant the Flag
Unlocks:

**AK-47 Rack Access**

Writes `WEAPON_AK47_ACCESS` and mirrors the existing AK flag.

The old `WEAPON_ACCESS` reward kind remains supported only so pinned older rulesets keep working.

## Pip product progression

Phase I makes Pip's higher product shelves something the player earns.

### Always open

- Weed purchases remain open.

### Bulk Order

Completing **Bulk Order** grants:

**Meth Counter Access**

The player may then buy Meth directly from Pip for the rest of the round.

Producing Meth is still allowed before the unlock, which is how the job itself is completed.

### Party Favors

Completing **Party Favors** grants:

**Ecstasy Counter Access**

The player may then buy Ecstasy directly from Pip.

Producing Ecstasy remains available before the unlock.

### Move the Weight

Completing **Move the Weight** grants:

- Cocaine Counter Access
- Heroin Counter Access

These products are not cooked in the current economy, so this creates a meaningful later Pip progression reward.

## Buying versus selling

Product access gates **purchases only**.

A player may always sell product they already own, including product gained through:

- Scout
- raids
- runs
- existing inventory
- production where a recipe exists

This prevents an unlock from trapping loot or making a job impossible.

## UI

Pip's product counter now tells the player:

- whether purchases are locked
- the permanent unlock name
- what the unlock does
- that it is earned from Jobs
- that selling owned stock remains allowed

Quest reward previews display the permanent unlock's player-facing name rather than only its internal key.

Tommy's store copy now consistently explains that weapon access is earned through Jobs and lasts for the round.

## Admin support

The player inspector now displays:

- legacy Shotgun/Tek-9/AK access flags
- every generic permanent unlock key
- which quest granted it
- when it was awarded

This makes support/debugging possible without querying the database manually.

## Compatibility

The generic ledger does not replace existing weapon flags yet.

Instead:

1. the Job reward writes the generic unlock
2. weapon effects mirror the old Boolean flag
3. existing store/combat code keeps reading the old flag

This avoids a risky all-at-once weapon-system rewrite while making future unlocks data-driven.

## Tests

Phase I adds coverage for:

- 0.7-F remaining unchanged
- 0.7-H registering seven permanent unlock definitions
- story weapon reward migration
- Pip product reward progression
- every permanent reward having a backing catalog definition
- weapon effect mapping
- product purchase gates
- unlock-ledger idempotency
- invalid unlock keys
- PostgreSQL product purchase lock behavior
- selling locked products
- purchase access becoming available immediately after the unlock row is awarded

## Phase boundary

Phase I adds permanent access only.

It does **not** add:

- timed buffs
- consumable favors
- temporary discounts
- temporary Heat protection
- temporary production bonuses

Those belong to the Favor / timed-buff phases that follow.
