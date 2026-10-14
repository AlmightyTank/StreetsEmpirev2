# Hidden Streets — Slice G: Detective Files

Status: implemented in ruleset `classic-og-v1.8-s` (`1.8.0-S`).

## Content keys

- `store-dockyard-manifest` → `SECRET_DOCKYARD_INVESTIGATION` (`DETECTIVE`). Milestone: `manifest_checks`. Reward includes `pattern-board-badge`.
- `scout-missing-witness` → `SECRET_MISSING_WITNESS` (`DETECTIVE`). Milestone: `safe_routes`. Reward: cash + Vic reputation.
- General Scout activity → `SECRET_THE_PATTERN` (`DETECTIVE`, legendary). Milestone: `five_district_notes`. Reward includes `pattern-board-badge`.

## Recovery and privacy

Wrong-order play is recoverable because clues are ordinary quest objective progress. Unrevealed case names remain absent from player APIs until `syncSecretQuestAttempts` creates the per-round `PlayerQuest` row.

## Safety notes

Copy is respectful and procedural: suspicious manifests, safe witness routing, and pattern-board clues. It avoids gratuitous victimization and uses original agency/location names.
