# StreetsEmpire 2.0.0-D — Investigation Gameplay

Status: Implemented as code on `feature/living-streets-2.0.0-d`, based on merged Slice C in `beta`.

## Trusted evidence sources

| Clue source | Verified event | Gameplay origin |
| --- | --- | --- |
| Scout | `PlayerActivity.type=SCOUT` | Completed Scout action |
| Contact | `INFORMANT_TIP` | Paid informant intelligence action, not a quest completion |
| Travel | `RUN_RETURNED` | Completed travel run, not starting or viewing a run |
| Encounter | `RANDOM_ENCOUNTER_CHOICE` | Settled legacy or first-class encounter choice |

The `ActivityService.log` writer hooks into the *same transaction* as the action's existing quest progress. A case can advance only when active, accepted before the receipt, pinned to the current round ruleset, and not expired in **active** round time. The oldest accepted eligible case receives at most one clue. One receipt cannot be reused for multiple investigations; a database-wide unique `sourceReceiptId` index enforces this. Each case requires ordered, distinct source kinds; repeated Scout clicks don't replace its missing Contact/Travel/Encounter clues.

Legacy Slice B case snapshots marked `CONTACT` as `QUEST_CLAIMED`. This slice interprets those snapshots only as requiring **`INFORMANT_TIP`**; quest claims never qualify.

## Read model and player guidance

Private Case Files responses now include the first missing clue key, the source action kind, readable action hint, and a confidence band: `rumor` (no verified clues), `likely` (one), `confirmed` (at least two separate sources). This is narrative confidence **only**—not Black Book numerical recon certainty or a reveal of another player's private assets. The existing Case Files API remains owner-scoped and `Cache-Control: private, no-store`.

The full Black Book Case Files presentation and story popup system remain Slice F. The case may be solved through authentic actions but **still grants no cash, XP, or cosmetics** until Slice E implements one-time rewards. No separate scheduler is introduced.

## QA

- Apply migration `20261103000000_living_case_evidence` after migrations for B and C.
- Run `npm run typecheck`, `npm test`, `npm run build` and release integration.
- Confirm the first actual Scout action after accepting a case records exactly one clue. Try repeating or replaying the action and verify no extra evidence.
- Verify `INFORMANT_TIP` (not `QUEST_CLAIMED`) counts as Contact, `RUN_RETURNED` counts only on real return, and encounter choice only after resolution.
- Confirm separate concurrent cases cannot claim the same receipt, the paused/expired statuses stop progress, and admin/nonexistent-round activity grants nothing.
- Inspect the case DTO and Street Report/News to confirm no target-level intelligence leaks through story text or badges.
