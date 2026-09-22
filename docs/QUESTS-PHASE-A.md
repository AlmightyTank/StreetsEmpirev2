# Quest System — Phase A Foundation

Phase A establishes the durable data contract for the new handcrafted quest system. It does not add the quest page, progress listener, contacts, rewards, or playable quest content yet.

## Why this is separate from the old trader favors

The existing rulesets already expose `quests` for the one-time CORNER/TOMMY/CHARLIE/PIP favors that feed trader reputation and weapon unlocks. Those remain untouched.

The new system is exposed as optional `Ruleset.questDefinitions`, so historical rounds and the existing reputation ladder keep their current behavior.

## Database

### QuestDefinition

A definition is pinned to:

- `rulesetId`
- `rulesetVersion`
- stable quest `key`

It stores presentation metadata plus JSON definitions for:

- prerequisites
- required objectives
- bonus objectives
- rewards
- follow-up quest keys
- availability rules

Definitions also carry repeatability and an optional accepted-quest expiry duration.

The unique key is `(rulesetId, rulesetVersion, key)`. Quest content should be treated as immutable once a ruleset version is live; changed quest behavior belongs in a new ruleset version.

### PlayerQuest

A player quest belongs to one seasonal `RoundPlayer` and one `QuestDefinition`.

It stores:

- attempt number
- lifecycle status
- required objective progress
- bonus objective progress
- chosen branch
- reward state
- accepted/completed/claimed/failed/expiry timestamps

The attempt number is intentionally present in Phase A so daily, weekly and generally repeatable contracts do not require a future schema rewrite.

## Lifecycle

Supported statuses:

- LOCKED
- AVAILABLE
- ACTIVE
- READY_TO_TURN_IN
- COMPLETED
- FAILED
- EXPIRED

Supported repeatability:

- ONCE
- DAILY
- WEEKLY
- REPEATABLE

## Ruleset contract

`packages/rulesets/src/types.ts` now contains the generic quest-definition contract.

Phase A keeps `kind` fields generic strings with JSON-safe parameters. Phase B will turn the objective layer into concrete event-driven objective kinds without changing the database shape.

`defineQuestCatalog()` validates static content before it reaches gameplay code. It currently catches:

- catalog key / definition key drift
- missing title or description
- quests with no required objectives
- missing prerequisite or reward kinds
- missing or duplicate objective IDs
- missing objective kinds/descriptions
- non-positive objective targets
- invalid expiry durations
- self-looping, duplicate, or unknown follow-ups

## Deliberately not in Phase A

The following belong to later slices:

- definition synchronization/seeding service
- objective/event progress tracker
- quest API
- quest page
- tracking UI
- contacts and contact reputation
- turn-in/reward execution
- favors and timed buffs
- daily/weekly rotation
- the first ten story quests

Phase A's job is to make those systems possible without another database redesign.
