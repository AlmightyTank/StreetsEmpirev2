# Hidden Streets — Slice D: Reward & Cosmetic Integration

Status: implemented for the first Blackwood secret reward path.

## Ruleset isolation

- New latest ruleset: `classic-og-v1.8-q` / `1.8.0-Q`.
- `classic-og-v1.8-p` remains untouched for existing pinned rounds.
- Slice D cosmetics live in `packages/rulesets/src/hidden-streets-cosmetics.ts` and are merged only by `packages/rulesets/src/classic-og-v1.8-q/index.ts`.

## Cosmetic rewards

`SECRET_BLACKWOOD_GATE` now grants, through normal quest claiming:

- `blackwood-gate-badge` — `TITLE_BADGE`, epic, title label: **Blackwood Gatecrasher**.
- `blackwood-gate-frame` — `PROFILE_FRAME`, epic, style key `blackwood-gate-frame`.

Also reserved but not awarded yet:

- `blackwood-manor-theme` — `SITE_THEME`, legendary, style key `blackwood-manor`, reserved for the later Blackwood Manor finale.

All rewards are original Hidden Streets designs; no external characters, logos, lines, emblems, or protected likenesses are used.

## Safety and idempotency

- Cosmetic rewards use the existing `QUEST_CLAIM:<questKey>` idempotency scope.
- Permanent cosmetic unlocks are stored in `AccountCosmeticUnlock` with unique `(accountId, key)` and `upsert(..., update: {})` first-write-wins behavior.
- New `questCosmeticProblems(catalog, cosmetics)` validation catches unknown `COSMETIC_UNLOCK` keys at ruleset build/import time before a runtime `QUEST_COSMETIC_UNKNOWN` claim failure.
- These rewards are cosmetic only: no cash-flow, combat, travel, turf, or store advantage.

## Player-facing surfaces

- `TITLE_BADGE` appears in Profile achievements/badges and title picker.
- `PROFILE_FRAME` appears in account appearance settings and on public profile avatars.
- The Blackwood frame is a static CSS frame in `apps/web/src/styles/profile.css`.
- The reserved manor theme is a static shell palette/background in `apps/web/src/styles/site-themes.css`.

## Motion and mobile behavior

- The new frame and reserved theme are static by construction, so they honor reduced-motion without extra animation-specific overrides.
- The reserved site theme uses only layered CSS backgrounds and no particle/serpent/timed effects.
- Standard shell/profile responsive layouts handle the picker and profile surfaces; no new wide art assets or clipping-prone layers were added.

## Tests

- `packages/rulesets/src/__tests__/hidden-streets-slice-d.test.ts` covers ruleset isolation, Blackwood cosmetic definitions, Blackwood Gate rewards, and cosmetic-key validation.
- `apps/server/src/services/__tests__/quest-cosmetic.service.test.ts` covers repeated Blackwood award upserts using the same account/key unique row and first-write-wins update shape.
