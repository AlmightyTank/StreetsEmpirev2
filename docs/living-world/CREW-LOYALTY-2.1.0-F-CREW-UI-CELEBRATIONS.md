# 2.1.0-F — Crew UI & Celebrations

## Implementation
The Crew Assignments roster now uses a **server-paginated 50-member directory** plus a single, keyboard-accessible career inspector. Filtering remains server-side; the optional text search matches the **current page only** and cannot imply that the whole round was searched. Selection preserves the player's position and reuses the existing actions (train, swap, earned nickname selection); it does not navigate or reset page scroll. The crew job pool progressively renders 30 more names per click within the existing bounded 200-member board response, with selection and assignments otherwise unchanged.

The detail inspector surfaces current assignment/status, actual specialty level and existing training controls, loyalty tier and recent receipts, latest **positive server-issued loyalty receipt** (not generic assignment/released/trained events and not a fabricated moment), optional opt-in personality moments, earned nicknames, career history, and mentor/apprentice connections. Older pinned rounds with crew loyalty disabled continue to display careers, and no new power is awarded.

## Optional celebrations
AccountProfile.showCrewCelebrations defaults **false** and is returned via optional schema/DTO fields to support omitted older client settings. The player can opt in/out in the roster; the toggle saves by first fetching current server settings, preserving unrelated cosmetics.

The client captures a **baseline** from the first roster response in a mounted page and compares only subsequent responses. It recognizes **crossed loyalty thresholds 25/50/75/100**, newly unlocked verified catalog nickname options, and partner bond memory counts crossing 1/3/5. All values come from existing authenticated, private, capped server receipts—not ad hoc client actions, paid training, reassignments, or RNG. Unknown/newly paged members are never celebrated retrospectively; returning after navigating away establishes a new baseline. Only one toast is displayed per read, with explicit dismiss control, no sound, no auto-dismiss interrupting assistive technology, a polite status announcement, and reduced-motion compatibility both via OS media query and the existing profile preference. Opting out closes any visible toast.

**No new economy, loot, XP, combat, scheduling, or achievement write path**: only one nullable-free account preference with a false default. The overlay does not claim to generate an unlock or grant power. It reflects already-earned milestones only.

## Verification
- Prisma migration, typecheck and full unit/integration/build/UI audit.
- Pure tests for threshold transitions, genuine nickname catalog provenance, bonded memories, pagination changes, moderated and disabled records, and bounded one-at-a-time notifications.
- Manual beta check: phone list/detail selection with nested scrolling, keyboard focus and screen reader announcements, switching tabs, refresh without replay, settings persistence, and reduced-motion.
- In Slice G: stress-test large roster settlement/read scaling, ruleset version fallback, and moderation/correction diagnostics.
