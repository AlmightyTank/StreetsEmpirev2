# Quest System — Phase L Single-Use Favors

Phase L adds the reusable **armed favor** pattern for consumables that should affect one future action rather than a real-time window.

A player explicitly arms a favor. One item leaves inventory and waits in a category slot. The favor is consumed only when its matching action succeeds. Failed or unrelated actions leave it armed.

## Ruleset boundary

Phase L ships as:

- 0.7-J: timed favors
- 0.7-K: timed favors + armed single-use favors

Older pinned rounds keep their existing inventory and timed behavior. In particular, the 0.7-J Tommy Voucher remains an inventory-only placeholder and cannot be armed.

## Armed state

`PlayerArmedFavor` stores:

- player / round
- category
- favor key
- armed timestamp

Unique key:

`(roundPlayerId, category)`

The initial single-use categories are:

- UNDERWORLD — Burner Phone
- MUSCLE — Tommy Voucher or Doctor Favor

Timed active favors and armed one-shot favors use separate state. A timed MUSCLE favor such as Field Medic can therefore run while one MUSCLE one-shot is armed.

## Arm

`POST /api/game/favors/:key/arm`

Arming:

1. validates that the pinned ruleset supports a live single-use effect
2. requires one item in favor inventory
3. requires the armed category to be free
4. decrements inventory by one
5. writes the armed row
6. logs `FAVOR_ARMED`

The request uses the normal ActionService `actionId` pipeline, so retries cannot remove two inventory items.

## Disarm

`POST /api/game/favors/:key/disarm`

Disarming:

1. removes the armed row
2. returns one item to favor inventory
3. logs `FAVOR_DISARMED`

This lets a player change plans without losing the favor.

## Consumption rule

Arming is not consumption.

A favor is finally consumed only when the matching gameplay transaction succeeds.

That means:

- validation failure does not consume it
- insufficient cash / stock does not consume it
- invalid Recon does not consume it
- treatment with no wounded thugs does not consume it
- unrelated actions do not consume it
- replaying a successful action id returns the stored receipt and does not consume another favor

The armed row is deleted inside the same database transaction as the successful action. Any later transaction failure rolls the deletion back.

## Tommy Voucher

Contact: Tommy  
Category: MUSCLE  
Trigger: next eligible successful weapon purchase at Tommy's

Eligible items:

- Pistol
- Shotgun
- Tek-9
- AK-47

Effect:

- 20% off the next eligible purchase

Rules:

- Tommy's catalog shows the discounted quote while the voucher is armed
- affordability and the final cash movement use that same quote
- sells never consume the voucher
- buying from another store never consumes it
- an ineligible Tommy item never consumes it
- failed eligible purchases leave it armed
- permanent weapon access and shelf stock rules still apply
- discounted buy price can never fall to or below Tommy's buyback price

The successful trade result records:

- favor key
- discount percent
- normal base unit price
- discounted unit price

## Burner Phone

Contact: Tommy  
Category: UNDERWORLD  
Trigger: next successful Recon

Effect:

- Recon turn cost becomes 0

The Combat page shows **Burner Phone · free** before the action.

The favor is not consumed if Recon fails because of:

- invalid target
- self target
- city restrictions
- alliance restrictions
- unavailable strategy rules
- any other pre-success validation

On success:

- the normal intel report is created
- 0 turns are spent
- the armed favor is consumed
- the result/activity receipt records the favor key

## Doctor Favor

Contact: Tommy  
Category: MUSCLE  
Trigger: next successful wounded-thug treatment

Effect:

- medicine cost becomes 0 for that treatment

This is a true waived cost, separate from the timed Field Medic medicine-efficiency percentage.

The Combat recovery preview shows every wounded thug as treatable while Doctor Favor is armed, even with 0 medicine.

It is not consumed when:

- nobody is wounded
- the requested treatment is invalid
- the player cannot currently use Combat recovery
- the transaction fails

On success:

- wounded thugs are treated normally
- medicine used is 0
- the armed favor is consumed
- the result records the favor key

## Quest rewards

0.7-K adds two more Tommy favor rewards while retaining the existing voucher reward:

### Stock the Crew
- Tommy Voucher

### Two Collections
- Burner Phone

### Patch Job
- existing Field Medic timed favor
- Doctor Favor

This keeps the side jobs mechanically related to the favors they award.

## Player UI

The Jobs page adds **Armed favors**.

Each armed slot shows:

- favor name
- category
- waiting-for-next-action state

Single-use inventory items support:

- **Arm favor**
- **Disarm**

If another one-shot occupies that category, the Arm button explains which favor must be disarmed first.

Pinned rounds without a live single-use effect keep the item visible but do not show a working Arm control.

## Action UI

### Tommy's store

An armed Tommy Voucher shows:

- discounted buy price
- normal price
- discount percentage
- reminder that it is consumed only by a successful eligible buy

### Combat — Recon

An armed Burner Phone changes the Recon button and rules copy to show the action is free.

### Combat — recovery

An armed Doctor Favor shows that the next successful treatment costs 0 medicine.

## Activity and admin support

Activity feed adds:

- `FAVOR_ARMED`
- `FAVOR_DISARMED`

Matching store / Recon / Treatment receipts also include the favor key when a one-shot is consumed.

Admin player inspection includes all currently armed favor rows and their armed timestamps.

## Compatibility

0.7-K extends 0.7-J and preserves:

- all 19 Jobs
- timed favors and active timers
- favor inventory
- permanent unlocks
- product purchase progression
- weapon access
- 0.7-G Hideout v2 behavior and specializations

No older ruleset gains live single-use effects retroactively.

## Tests

Phase L adds coverage for:

- 0.7-J remaining unchanged
- exact 0.7-K single-use effect definitions
- Tommy side-job reward mappings
- Hideout / timed-favor / permanent-unlock inheritance
- arm inventory movement
- armed category collision
- disarm inventory refund
- matching-effect lookup
- pinned placeholder rejection
- Tommy Voucher price math
- unchanged sell prices
- anti-arbitrage floor
- PostgreSQL failed/unrelated Tommy trades keeping the voucher armed
- PostgreSQL successful Tommy purchase consuming exactly once
- failed Recon keeping Burner Phone armed
- successful free Recon consuming exactly once
- replay-safe free Recon
- failed treatment keeping Doctor Favor armed
- successful 0-medicine treatment consuming exactly once
- replay-safe free treatment
- arm/disarm activity rendering

## Future single-use favors

The armed-action pattern is now reusable for later favors such as:

- Pip Reserve
- Road Pass
- Free Upkeep
- Protected Shipment

Those should be added when their target systems have a stable transaction boundary rather than being stubbed early.
