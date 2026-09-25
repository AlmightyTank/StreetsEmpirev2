# Quest System — Phase R Branching Jobs

Phase R adds rare, durable choices to the unified Jobs & Contacts system.

## Ruleset boundary

Phase R ships as:

- 0.7-P — 51 definitions including Secret Jobs
- 0.7-Q — everything in P + Taking Sides and two mutually exclusive follow-ups

The catalog grows from **51 to 54** definitions.

No existing Job, secret trigger, daily/weekly board, favor, permanent unlock, Hideout rule or balance number is replaced.

## First branch — Taking Sides

Taking Sides appears after both:

- Pip: Bulk Order
- Tommy: Heavy Hands

The player first produces 250 product for a disputed shipment. When the Job is Ready to collect, the normal payment button is replaced by two explicit choices.

### Give it to Pip

Immediate consequences:

- $20,000
- 2 Pip's Connections
- +25 Pip reputation
- -10 Tommy reputation
- early Heroin counter access

Follow-up:

- **After Hours**
- sell 250 units of product to Pip
- $30,000
- 2 Pip's Connections
- +20 Pip reputation

### Give it to Tommy

Immediate consequences:

- $20,000
- 2 Tommy Vouchers
- +25 Tommy reputation
- -10 Pip reputation
- early Tek-9 rack access

Follow-up:

- **Back Room**
- buy 3 weapons from Tommy
- $30,000
- 2 Tommy Vouchers
- +20 Tommy reputation

## Commitment semantics

The branch is selected **at turn-in**, not at accept.

This matters because:

- the shared objective remains neutral
- the player sees both consequences before committing
- abandoning/reaccepting before turn-in does not secretly choose a side
- the existing `PlayerQuest.chosenBranch` field is written in the same transaction as rewards and completion
- after completion, the choice cannot be changed through normal player APIs

The claim request carries an optional `branchKey`. Non-branching Jobs ignore/forbid a branch key; branching Jobs require one of their declared keys.

## Mutually exclusive follow-ups

Phase R adds the prerequisite:

`BRANCH_CHOSEN { questKey, branchKey }`

Availability checks build a server-side map of completed quests and their durable `chosenBranch`.

Therefore:

- Pip choice unlocks After Hours
- Tommy choice unlocks Back Room
- the unchosen follow-up remains Locked for the round
- contact reputation alone cannot accidentally unlock the other path

## Rewards and unlocks

A branch can have:

- normal quest rewards
- positive or negative contact reputation deltas
- explicit follow-up keys

Negative reputation is clamped at zero by the existing contact reputation writer.

Taking Sides intentionally grants an existing permanent access unlock early. If the player already owns that unlock, the existing unlock ledger remains idempotent.

## UI

A Ready branching Job displays a choice card for every branch with:

- title
- description
- reward preview
- contact reputation consequences
- an explicit Choose button

The browser asks for confirmation because the choice is permanent.

After completion, the Job card shows the committed branch.

## Persistence / retry safety

No schema migration is required: `PlayerQuest.chosenBranch` already exists.

The choice and all branch rewards are committed inside the existing idempotent quest-claim ActionService transaction. Replaying the same action id returns the original claim result; a different action id after completion cannot re-claim or change the branch.

## Tests

Phase R covers:

- 51 → 54 catalog boundary
- exact two-way Taking Sides branch
- opposite contact-reputation effects
- branch-specific permanent unlocks
- BRANCH_CHOSEN catalog validation
- only the selected follow-up becoming available
- chosen branch included in player DTOs and claim result
- missing/invalid branch rejection
- branch choice persistence on claim
- inherited Secret/Daily/Weekly/Favor/Unlock/Hideout behavior
- ruleset registry count
