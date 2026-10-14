# Hidden Streets — Slice F: Lost Adventures

Status: implemented in ruleset `classic-og-v1.8-s` (`1.8.0-S`).

## Content keys

- `scout-old-coin` → `SECRET_LOST_FORTUNE` (`LOST_ADVENTURE`, hidden). Milestone: `map_fragments`. Rewards: cash, `lost-fortune-badge`, `lost-fortune-frame`.
- `travel-three-travelers` → `SECRET_THREE_TRAVELERS` (`LOST_ADVENTURE`, obvious). Milestone: `rail_clues`. Reward: cash + existing favor.

## Reset and rewards

Investigation progress is per-round `PlayerQuest` state. Badge/frame unlocks are permanent account cosmetics via `AccountCosmeticUnlock` and grant no competitive advantage.

## Safety notes

The stories use original coin/map/railroad-traveler copy and do not copy any protected characters, songs, symbols, or dialogue. Optional Blackwood tunnel flavor is represented as non-blocking `secretContent` metadata and does not hard-lock either story.
