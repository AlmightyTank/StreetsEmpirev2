# Quest System — Phase J Favor Inventory

Phase J adds durable consumable favors to the unified Jobs & Contacts system.

This phase is inventory only. Players can earn and stack favors, see what they own, and admins can inspect the stacks. Timed activation belongs to Phase K and single-use consumption belongs to Phase L.

## Ruleset boundary

Phase J ships as:

- 0.7-H: permanent unlock progression
- 0.7-I: permanent unlock progression + favor inventory

Older pinned rounds remain unchanged.

## Favor catalog

0.7-I defines six starter favors.

### Mama King

**Mama's Advice**
- timed
- STREET category
- 10 minutes
- earned from Recruitment Drive

**Street Frenzy**
- timed
- STREET category
- 1 minute
- earned from Night Shift

### Pip

**Cookhouse Rush**
- timed
- UNDERWORLD category
- 5 minutes
- earned from Bulk Order

**Pip's Connection**
- timed
- UNDERWORLD category
- 10 minutes
- earned from Party Favors

### Tommy

**Tommy Voucher**
- single use
- MUSCLE category
- earned from Stock the Crew

**Field Medic**
- timed
- MUSCLE category
- 10 minutes
- earned from Patch Job

The categories are stored now so the later stacking rules can enforce one active timed favor per category without changing inventory data.

## Persistence

`PlayerFavor` stores one row per player/favor key:

- current quantity
- total quantity ever granted
- most recent source quest
- created / updated timestamps

Unique key:

`(roundPlayerId, key)`

Repeated rewards stack onto the same row.

## Quest rewards

Phase J adds:

`FAVOR_ITEM`

A valid favor reward requires:

- a non-empty favor key
- a positive amount

Claiming a job validates the key against the pinned ruleset favor catalog and increments that player's stack inside the same action transaction as every other quest reward.

This means:

- a failed claim cannot leave a favor behind
- action-id replay cannot double-grant the favor
- future repeatable jobs can safely award the same favor again

## Player UI

The Quest page now includes **Favor inventory**.

Each owned favor shows:

- name
- quantity
- category
- timed duration or single-use status

The UI deliberately does not show a Use button yet. Phase J is the inventory foundation only.

## Admin UI

The player inspector shows:

- favor key
- current quantity
- total granted
- most recent source quest

This makes support and balance checks possible before activation is introduced.

## Compatibility

0.7-I extends 0.7-H, so it retains:

- the permanent unlock ledger
- weapon rack access
- Pip product purchase access
- 0.7-G Hideout specializations and other Hideout v2 behavior
- all 19 existing story/side jobs

The new ruleset only adds favor catalog metadata and favor rewards to six existing side jobs.

## Tests

Phase J adds coverage for:

- 0.7-H remaining unchanged
- six favor definitions in 0.7-I
- six side-job favor rewards
- timed versus single-use metadata
- catalog-backed reward keys
- permanent unlock inheritance
- Hideout extension inheritance
- inventory stacking
- total-granted tracking
- invalid favor keys
- invalid favor quantities
- orphaned inventory rows

## Phase boundary

Phase J does not consume favors or apply effects.

Phase K will add timed favor activation and active-buff state.

Phase L will add single-use favors such as Tommy Voucher.
