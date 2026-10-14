# Hidden Streets — Slice C: Evidence, Clues & Secret Collection (contract)

Status: implemented. No new model, no new route, no new main tab.

## Read model (derived, never stored)

`SecretCollectionService.forPlayer` (`apps/server/src/services/secret-collection.service.ts`)
builds `SecretCollectionDto` (`packages/shared/src/types/community.ts`) from existing tables:

- `inProgress`: revealed SECRET `PlayerQuest` rows for this round player, projected as
  evidence — title, description, contact, status, family/tier, clue milestones with live
  `objectiveProgress`, source encounter key, reward labels, claimed flag. `questKey`
  navigates back to the quest journal (`/quests#quest-<key>`).
- `trophies`: `AccountCosmeticUnlock` rows whose `sourceQuestKey` is a SECRET definition
  in this ruleset. Permanent across rounds.
- `families`: per-family aggregates. Only families with at least one discovery are
  listed; `undiscovered` is a count, never keys or titles — zero-discovery families
  (and their names) stay hidden.

Unrevealed secrets have no `PlayerQuest` row and cannot appear anywhere in this payload.

## Reset behavior

| Event | `inProgress` | `trophies` |
|---|---|---|
| Leave / reload / switch devices | Unchanged (server rows) | Unchanged |
| New round (new `RoundPlayer`) | Resets to empty | Persist (account-scoped) |
| Secret disabled mid-round | Existing rows stay; no new reveals | Already-earned trophies stay |
| Old pinned ruleset | Sees only its own version's secrets | Filtered to current ruleset's secret keys |

## Encounter-key normalization (Slice C)

Trigger authors always write `where: {'encounter.key': '<key>'}`. The matcher now
accepts the `randomEncounter.*` nesting too (`aliasPaths` in `secret-quest.service.ts`),
because STORE/TURF/COMBAT log payloads under `randomEncounter` while SCOUT/PRODUCE/TRAVEL
use `encounter`. `secretSourceEncounterKey` reads either nesting for the DTO.

## UI

`DiscoveriesPanel` in `ProfilePage.tsx`, mounted after `AchievementsPanel` (same page,
no new tab): open investigations with accessible clue checklists (`role="progressbar"`
meters + text, journal deep links), case-file silhouettes (counts only), kept-forever
trophies. Empty state reveals nothing. Older servers omit the section (`discoveries?`).

## Tests

- `secret-collection.service.test.ts`: empty-when-unrevealed privacy, clue projection,
  trophy filtering, round-transition split (fresh player, same account), version pinning,
  cross-nesting encounter matching.
- Regression: secret-quest, secret-content-foundation, quest-cosmetic suites green;
  `tsc --noEmit` clean for server, shared, and web.
