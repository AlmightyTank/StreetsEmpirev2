# Quest System — Phase O Daily Contracts

Phase O adds rotating small contracts on top of the completed 30-Job handcrafted catalog.

## Ruleset boundary

Phase O ships as:

- 0.7-M — 30 handcrafted Jobs
- 0.7-N — the same 30 handcrafted Jobs plus an 8-contract daily pool

No handcrafted Job, permanent unlock, favor effect, Hideout rule or balance number is replaced.

## Daily board

The daily board exposes **3 contracts at a time** from an **8-contract pool**.

The selection is:

- server-authoritative
- deterministic for the current ruleset/reset window
- shared by players on that ruleset
- refreshed at the existing rankings daily reset boundary

A daily contract is a normal PlayerQuest attempt. Phase O uses the attempt field that already exists rather than creating a second quest table.

At reset:

- open daily contracts expire
- completed daily attempts remain in history
- the next three offers are materialized
- if a contract returns on a later day it receives a new attempt number

Accepting late in the window does **not** buy another 24 hours. The contract still expires at the shared reset.

## Initial contract pool

- **Street Sweep** — spend 25 turns Scouting
- **Cook Order** — produce 100 units of product
- **Cash Take** — earn $25,000 through street work/production
- **Eyes on Target** — complete one Recon
- **Road Money** — launch one intercity run
- **Supply Run** — buy $10,000 of Corner Store supplies
- **Move Product** — sell 100 units of product to Pip
- **Two Shifts** — complete two Scout/street-work shifts

These contracts listen to the same activity stream as handcrafted Jobs.

## Rewards

Daily rewards stay deliberately small:

- $7,500–$15,000 cash where cash is used
- supplies such as condoms, medicine or beer
- +2 contact reputation
- occasional consumable favors

There are **no permanent unlocks** and no daily-only currency.

The initial pool contains only two favor-paying contracts:

- Eyes on Target → Burner Phone
- Move Product → Cookhouse Rush

## UI

The Jobs page gets a **Daily** tab showing the current three offers, including contracts already accepted or completed during the current reset window.

Daily cards show the shared reset/expiry time. Historical completed and expired attempts remain under Completed.

## Compatibility

Phase O requires no schema migration.

It reuses:

- QuestDefinition type DAILY
- QuestRepeatability DAILY
- PlayerQuest.attempt
- PlayerQuest.expiresAt
- QuestProgressReceipt
- the existing quest claim/reward pipeline

0.7-M remains pinned to the 30 handcrafted Jobs and receives no daily definitions.

## Tests

Phase O covers:

- exact eight-contract pool
- 30 → 38 definition boundary
- ordinary Scout/Produce/Store activity progress
- no permanent-unlock daily rewards
- bounded cash rewards
- deterministic three-offer selection
- daily reset boundary behavior
- board rotation across reset windows
- Hideout inheritance through 0.7-M and 0.7-N
