# Hidden Streets — Slice N: Admin Tools, Tuning & Beta Release

Status: implemented for beta diagnostics in ruleset `classic-og-v1.8-s` (`1.8.0-S`).

## Admin surface

- `GET /admin/hidden-streets` returns the latest Hidden Streets ruleset/version, family counts, encounter keys by trigger, cosmetic reward checks, admin control notes, telemetry keys, and live counters when the database is available.
- Existing quest admin controls can enable/disable individual `QuestDefinition` rows without mutating old pinned rulesets.
- Existing event admin reports continue to cover first-class random encounter/event infrastructure.

## Telemetry and duplicate checks

The diagnostics report names the release telemetry/audit keys used for monitoring encounter volume, secret reveal/completion, expired choices, and duplicate reward attempts. Permanent reward duplicates remain protected by `QUEST_CLAIM:<questKey>` and `AccountCosmeticUnlock(accountId,key)` upserts.

## Release gates

Before beta rollout, run the Hidden Streets ruleset tests, admin diagnostics tests, quest/cosmetic idempotency tests, and TypeScript checks. Rollback is by pinning new rounds to a previous ruleset or disabling specific quest definitions; old pinned rounds are not rewritten.
