# Unified Jobs & Contacts — Phases C through G

This pass makes the event-driven Jobs system the authoritative quest/progression system for current rounds.

## Phase C — Quest API

Current game API:

- `GET /api/game/quests`
- `POST /api/game/quests/:key/accept`
- `POST /api/game/quests/:key/abandon`
- `POST /api/game/quests/:key/track`
- `POST /api/game/quests/:key/claim`

Definitions are synchronized by ruleset id/version. Player state lives in `PlayerQuest`, and claim rewards execute transactionally through `ActionService`.

The old `/reputation/quest` favor API and its shared request/response contract are removed.

## Phase D — Quest Page

`/game/quests` provides:

- Available, Active and Completed views
- objective progress
- bonus objective progress
- reward preview
- accept / abandon / track / claim controls
- active-job and tracked-job limits
- contact identity on each job

## Phase E — Tracking & Notifications

Players can track up to three jobs.

Tracked jobs render from the main game layout, so progress remains visible while scouting, producing, shopping, traveling, fighting or managing turf.

Quest transitions write:

- `QUEST_READY`
- `QUEST_CLAIMED`

The objective engine consumes normal gameplay activity in the same database transaction. Actions that deliberately have no activity-feed row emit a separate internal quest signal so current-state objectives and explicitly scoped action objectives are not skipped.

Every event-driven objective must declare `params.eventTypes`; semantic counters can no longer accidentally count unrelated events such as away bonuses.

## Phase F — Contacts & Reputation

Current contacts:

- Mama King — street operations
- Pip — products and distribution
- Tommy — weapons and muscle
- Wheels — transportation
- Vic — Heat, favors and pressure
- Blocks — turf and city control

Contact standing is displayed from the same durable relationship table used historically for store standing. New contact keys coexist with historical store keys.

Current Jobs award contact reputation through `CONTACT_REP` rewards. The historical `questDoneAt` flag is never written by the new system.

## Phase G — First 10 Story Jobs

1. First Night Out
2. Fresh Faces
3. Keeping Them Happy
4. Cookhouse
5. Payday
6. Heavy Hands
7. Eyes Open
8. Collection Day
9. Pack Your Bags
10. Plant the Flag

The chain teaches the existing game rather than creating a second mini-game.

Weapon purchase access is now awarded by the story chain:

- Heavy Hands -> Shotgun access
- Collection Day -> Tek-9 access
- Plant the Flag -> AK-47 access

The store only checks the resulting access flags; there is no live trader-favor completion action.

## Legacy Favor Replacement

The previous CORNER/TOMMY/CHARLIE/PIP one-time favors are no longer a live quest system.

Removed live surfaces:

- legacy server favor service
- legacy web reputation/favor API
- legacy favor request schema
- legacy favor summary/completion DTOs
- store favor completion UI/action

Retained only for compatibility:

- historical `Ruleset.quests` data in pinned older rulesets
- historical rules-engine favor calculators used by old ruleset tests
- `PlayerReputation.questDoneAt` so old round history is not destroyed

These retained pieces are explicitly marked deprecated/legacy and are not used to complete current jobs.

## Historical Progress & Public Stats

Current-round quest achievements and career job counts come from completed `PlayerQuest` rows.

For rounds that predate `PlayerQuest`, public career/stat code falls back to historical `questDoneAt` rows. It never adds both systems together for the same player/round.

Existing weapon access flags are preserved. A player who earned an unlock before the migration does not lose it.

## C-G Release Guardrails

- no quest-specific checks inside Scout/Combat/Travel/Turf code
- gameplay and quest progress commit atomically
- duplicate source events cannot advance one quest twice
- claim rewards are action-idempotent
- state objectives can regress before turn-in
- event objectives require explicit event scopes
- old rounds retain their pinned behavior/data
- current rounds expose only one Jobs system
