# Hidden Streets — Slice A: Secret Content Foundation (contract)

Status: implemented. No new model, no parallel scheduler.

## Typed definitions (rulesets package)

- `SecretTrigger` (`packages/rulesets/src/types.ts`): discriminated union
  `STATE_AT_LEAST | TURF_COUNT_AT_LEAST | ACTIVITY_COUNT | ACTIVITY_OBJECT_SUM_AT_LEAST`.
- `SecretContentMeta` (`availability.secretContent`): `family`, `discoveryTier`
  (`OBVIOUS | HIDDEN | LEGENDARY`), optional `clueMilestones` (must name real
  objective ids), `rarityWeight` (>0), `cooldownMinutes` (int ≥ 0 or null),
  `districts` (DistrictKey subset), `testOnly`, `disabled`.
- `QuestDefinition.availability` now types `hidden`, `secretTrigger`, `secretContent`.
- Validators (`packages/rulesets/src/quest-definitions.ts`): `secretTriggerProblems`,
  `secretContentProblems`, wired into `questDefinitionProblems` with key prefixes.
  `defineQuestCatalog` still throws on any problem, so bad secrets fail at build time.

## State ownership (no new tables)

- Per-round story: `PlayerQuest` (one row per roundPlayer × questDefinitionId × attempt).
  Created only after the trigger is met; never pre-created.
- Permanent trophies: `AccountCosmeticUnlock` (upsert by accountId + key, first-write-wins)
  via the normal `QUEST_CLAIM` → `grantRewards` → `COSMETIC_UNLOCK` path.
- Rewards stay atomic and once-only: `QUEST_CLAIM:<key>` idempotency scope (claim),
  `AccountCosmeticUnlock` upsert (cosmetics), `PlayerQuest` unique constraint (reveal).

## Server rules

- `syncSecretQuestAttempts(db, roundPlayerId, ruleset, { testMode })`
  (`apps/server/src/services/secret-quest.service.ts`):
  - Filters `QuestDefinition` by `rulesetId + rulesetVersion + key + isEnabled` (pinned
    rulesets keep old behavior; disabling stops future reveals without rewriting history).
  - Skips `secretContent.disabled`; skips `testOnly` unless `testMode`.
  - Server-authoritative trigger check (`triggerSatisfied`), then one `PlayerQuest`
    create per secret. `P2002` on create is absorbed (concurrent race loser), anything
    else rethrows.
- Spoiler privacy: no row before reveal, so `page()`, boards, feed, and award payloads
  cannot leak unrevealed keys. `hidden: true` + `ONCE` enforced by the validator.
- Pause/expiry/old rulesets: reveals ride the existing quest sync inside `page()`
  (locked by `lockRoundPlayer`, expiry handled by `refreshAvailability`). Expired
  secrets follow the standard `AVAILABLE → EXPIRED` path; old pinned rulesets never see
  new secrets because the definition lookup is version-scoped.

## Tests

- `packages/rulesets/src/__tests__/secret-content-foundation.test.ts`: trigger kinds,
  per-kind fields, content descriptor, catalog wiring.
- `apps/server/src/services/__tests__/secret-content-foundation.test.ts`: discover-once,
  unrevealed privacy, disable/test gates, P2002 race safety, ruleset-version pinning,
  reward-key audit.
- Existing `secret-quest.service.test.ts`, `secret-quests.test.ts`,
  `quest-definitions.test.ts` still pass.

## Done when (verified)

A test-defined secret is discovered once, recorded as one `AVAILABLE` PlayerQuest row,
and revealed through the existing quest/event contracts with no duplicate award,
no spoiler leak, and no new scheduler.
