# Hidden Streets — Slice B: First Playable Vertical Slice (contract)

Status: implemented on ruleset `classic-og-v1.8-p` (`1.8.0-P`). No new model, no new
scheduler, no new client surface.

## What shipped

- **The Traveling Salesman** (`travel-traveling-salesman`, TRAVEL, neutral, weight 3):
  original comedic road salesman, three choices (`buy-sample-case` −$5 flat,
  `trade-road-stories` −1 Heat, `roll-on` no-op), settled with a clear receipt.
- **The Colorful Van** (`scout-colorful-van`, SCOUT, neutral, weight 3): original
  mystery van; paw-print trail points at the Blackwood estate. Three choices
  (`follow-tracks` small cash find, `study-the-note` −1 Heat, `leave-the-van` no-op).
- **Blackwood Gate** (`SECRET_BLACKWOOD_GATE`): opening quest of Blackwood Manor.
  Trigger `ACTIVITY_COUNT` on `SCOUT` where `encounter.key = scout-colorful-van`
  (the scout activity payload carries the offered encounter, so meeting the van
  plants the clue; next quest sync reveals it). One completable objective
  (`trace_steps`: 3 scouts), bounded rewards (cash + favor item, no permanent
  progression), `secretContent: { family: BLACKWOOD, discoveryTier: HIDDEN }`.

## Reuse guarantees

- Settlement: existing capped effects, 24h `PENDING` choices with `EXPIRED`
  (no-penalty) path, per-key cooldowns (non-repeatable rewards), first-class
  receipts/claims/history with `skipDuplicates` idempotency. Normal action
  payouts untouched (encounter merges into `next`, never replaces it).
- Persistence: pending choices survive navigation/reconnect via
  `RandomEncounter` / `GameEventParticipation(OFFERED)` + `pendingForPlayer`.
- UI: existing generic pending-encounter rendering (dashboard, console, scout
  inline). No per-encounter client work; labels kept short for mobile.
- Versioning: everything lives only in `v1.8-p`. Old pinned rulesets (incl.
  `v1.8-o`) contain none of the three keys, so old rounds are unaffected. New
  rounds auto-pin the latest registered ruleset (`LATEST_RULESET`), so beta
  picks this up with no migration. Disable path: secret via `QuestDefinition`
  `isEnabled`; encounters via cooldowns/ruleset pin (no per-entry kill switch).

## Tests

- `packages/rulesets/src/__tests__/hidden-streets-slice-b.test.ts`: 3-choice
  entries, bounded effects, trigger/content shape, full catalog validation,
  original seven secrets preserved, `v1.8-o` untouched, first-class + cooldowns.
- `apps/server/src/services/__tests__/hidden-streets-slice-b.test.ts`: van
  scout matches / other scouts do not, reveal-once through the existing
  quest contract, gate stays shut without the clue.

## Beta verification

1. Start a round on `classic-og-v1.8-p`; scout until `scout-colorful-van` offers.
2. Resolve any of its three choices (or leave pending, reconnect, resolve).
3. Open quests: `Blackwood Gate` appears once, completes after 3 scouts, claims once.
4. Run travel until `travel-traveling-salesman` offers; resolve each choice on
   separate cooldown windows; receipts show bounded effects, no duplicates.
