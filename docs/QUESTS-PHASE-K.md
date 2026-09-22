# Quest System — Phase K Timed Favors

Phase K turns the timed favors introduced in Phase J into live, server-authoritative buffs.

The inventory remains durable per round. Activating a timed favor consumes one inventory item, writes an active timer, and applies the effect anywhere the relevant gameplay calculation runs.

## Ruleset boundary

Phase K ships as:

- 0.7-I: favor inventory only
- 0.7-J: favor inventory + timed activation/effects

Pinned 0.7-I rounds keep their stored favor items but do not expose timed activation.

## Active categories

Timed favors are split into three categories:

- STREET
- UNDERWORLD
- MUSCLE

A player may have one active timed favor in each category at once.

A second favor in an already-occupied category is rejected until the current timer expires. It does not overwrite the timer or consume the new item.

Expired rows are ignored by reads and may be replaced lazily by the next activation. No background cleanup job is required.

## Server-authoritative timers

Activation stores:

- favor key
- category
- startedAt
- expiresAt

The timer is real server time. It continues while the player is offline.

The client only renders the server timestamps. It does not decide whether the favor is active.

## Activation safety

`POST /api/game/favors/:key/activate`

requires an `actionId` and runs through the existing ActionService pipeline.

That provides:

- RoundPlayer locking
- retry/idempotency protection
- atomic inventory decrement + timer write
- activity logging

A repeated request with the same action id does not consume a second favor.

## Timed effects

### Mama's Advice

Duration: 10 minutes  
Category: STREET

- +10% Scout income
- +10% Scout recruitment

The bonus modifies the normal Scout earning/recruit rates before the calculation runs. Existing district modifiers, happiness, exposure, product effects, soft caps, Heat, turf and variance still apply.

### Street Frenzy

Duration: 1 minute  
Category: STREET

- +25% Scout income

It competes with Mama's Advice for the STREET slot.

### Cookhouse Rush

Duration: 5 minutes  
Category: UNDERWORLD

- +20% product output from Produce

The recipe throughput itself is increased before production is calculated.

Extra output therefore still:

- costs ingredients
- is limited by available cash
- adds normal recipe Heat
- participates in normal product/inventory accounting

This is not free post-action product.

### Pip's Connection

Duration: 10 minutes  
Category: UNDERWORLD

- 10% off eligible buys at Pip's multi-product counter

The discounted buy quote is passed through the normal trade validator, so:

- affordability uses the discounted price
- the actual cash movement uses the discounted price
- selling is never discounted
- buy price is never allowed to fall to or below Pip's buyback price
- permanent product-access locks still apply

Crack continues to use Pip's legacy store item and is not part of this Phase K discount.

### Field Medic

Duration: 10 minutes  
Category: MUSCLE

- +20 percentage points medicine efficiency for combat treatment

It combines with Hideout medicine efficiency, capped at the existing 50% treatment-efficiency ceiling.

Both the Combat page preview and the submitted treatment use the same effective efficiency.

### Tommy Voucher

Still SINGLE_USE / MUSCLE.

Phase K does not consume or apply it. That remains Phase L.

## Player UI

The Quest page now has:

### Active favors

Shows every live category timer and its server-provided expiry.

### Favor inventory

Timed favors show an Activate button when supported by the pinned ruleset.

If another favor occupies that category, the button is disabled with the active favor and expiry shown.

0.7-I inventory-only rounds do not show a working Activate button.

Single-use favors remain marked for Phase L.

## Activity feed

Activation writes:

`FAVOR_ACTIVATED`

The activity feed shows the favor name, category and expiry.

## Admin support

The player inspector now shows active favor rows with:

- favor key
- category
- startedAt
- expiresAt

Only unexpired timers are included.

## Compatibility

0.7-J extends 0.7-I and preserves:

- all 19 Jobs
- favor inventory
- permanent unlocks
- product purchase progression
- weapon access
- 0.7-G Hideout v2 behavior and specializations

No older ruleset gains timed effects retroactively.

## Tests

Phase K adds coverage for:

- exact timed effect definitions
- 0.7-I remaining inventory-only
- Tommy Voucher remaining Phase L
- Hideout and permanent-unlock inheritance
- active-bonus reduction
- timer DTO mapping
- inventory consumption on activation
- category collision rejection
- refusal to activate single-use favors
- discounted Pip buy quotes
- unchanged Pip sell prices
- anti-arbitrage discount floor
- live PostgreSQL Pip Connection pricing
- activity-feed activation rendering

## Phase boundary

Phase K handles timed favors only.

Phase L will implement single-use favors, starting with Tommy Voucher and the one-action favor pattern.
