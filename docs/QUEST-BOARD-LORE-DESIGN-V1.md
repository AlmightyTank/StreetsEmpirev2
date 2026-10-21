# Quest Board Lore Design v1

Status: Slice 0 locked / Slice 1–7 implemented for `classic-og-v2.4-a`.

## Direction

New rounds use a trader board, not a single mandatory questline. Several
contacts can offer work at once. Every job answers four questions in its copy:

1. Who is asking?
2. Why does it matter to the contact?
3. What exact action should the player take?
4. What evidence completes the job?

The description and story copy are presentation. Completion remains driven by
the existing `QuestDefinition` objective engine and authoritative activity
ledger. No quest-only action or parallel quest system is introduced.

## Contact graph

Starter contacts are available together:

```text
Mama      Tommy      Pip      Wheels      Blocks
  │         │          │         │           │
Blocks     Vic       Ledger     Ace    Commissioner
```

The referral edges are content for later slices. Slice 1 adds only the five
starter leads and the existing First Empire capstone handoff.

The Commissioner is an original, principled law-focused contact. He is not a
renamed existing character. His current arc covers heat, evidence, wanted
status, protection, investigations, and a high-risk warrant contract after
Blocks has proof of territory ownership.

## Slice 2 starter contact arcs

Each starter lead now opens one follow-up on the same board. These jobs deepen
the contact relationship without making the player abandon the other available
leads. Referral contacts remain locked for Slice 3.

| Lead | Follow-up | Evidence |
| --- | --- | --- |
| `BOARD_MAMA_FIRST_LOOK` | `BOARD_MAMA_NIGHT_PULSE` | Recruit 3 hoes from Scout trips |
| `BOARD_TOMMY_MUSCLE` | `BOARD_TOMMY_FIRST_ARMORY` | Buy 2 Tommy pistols |
| `BOARD_PIP_FIRST_BATCH` | `BOARD_PIP_FIRST_SALE` | Sell 10 Crack through Pip |
| `BOARD_WHEELS_FIRST_RUN` | `BOARD_WHEELS_RETURN_TICKET` | Return 1 intercity run |
| `BOARD_BLOCKS_MARK_CORNER` | `BOARD_BLOCKS_HOLD_THE_LINE` | Post 5 thugs on held turf |

Every follow-up uses an existing activity or state path, has a concrete action
hint, and awards contact reputation. No follow-up introduces a quest-only
button or forces a referral contact.

## Slice 3 referral unlocks

Completing a starter contact arc opens one introduction job for the next contact
in the graph. Accepting the introduction is recorded as a normal
`QUEST_ACCEPTED` activity; the referral jobs do not force the player to gamble,
fight, travel, or take a law action just to meet someone.

| Completed arc | Referral job | New contact |
| --- | --- | --- |
| `BOARD_MAMA_NIGHT_PULSE` | `BOARD_REFERRAL_BLOCKS` | Blocks |
| `BOARD_TOMMY_FIRST_ARMORY` | `BOARD_REFERRAL_VIC` | Vic |
| `BOARD_PIP_FIRST_SALE` | `BOARD_REFERRAL_LEDGER` | Ledger |
| `BOARD_WHEELS_RETURN_TICKET` | `BOARD_REFERRAL_ACE` | Ace |
| `BOARD_BLOCKS_HOLD_THE_LINE` | `BOARD_REFERRAL_COMMISSIONER` | The Commissioner |

The Commissioner is an independent, principled law contact. Slice 3 establishes
the referral and current-v2.4 portrait/contact identity; Slice 4 adds his law
arc without making law content mandatory for the rest of the board.

## Slice 4 Commissioner law arc

The Commissioner’s jobs use existing case, evidence, lawyer, warrant, and
official activity events. They never create a quest-only heat or protection
state, and successful completion requires the authoritative law system to
confirm the result.

| Key | Focus | Completion evidence |
| --- | --- | --- |
| `BOARD_COMMISSIONER_BADGE_IN_DARK` | Open a city Case | `CASE_STAGE_UP` |
| `BOARD_COMMISSIONER_NO_NAMES_NO_FAVORS` | Investigate the record | `INFORMANT_TIP` |
| `BOARD_COMMISSIONER_KEEP_HEAT_DOWN` | Let heat cool | `CASE_COOLED` |
| `BOARD_COMMISSIONER_CITY_HAS_LIMITS` | High-risk warrant work | `WARRANT_QUASHED` |
| `BOARD_COMMISSIONER_UNOFFICIAL_ARRANGEMENT` | Establish protection | `LAWYER_RETAINED` or `WARRANT_LAWYERED` |

The arc is optional, remains on the existing Quest Board, and does not alter
historical rulesets or force real-player combat.

## Slice 5 rotating contracts

Current v2.4 adds a full current contract deck to the existing board, including
three authored daily and three authored weekly contracts plus established
contract cards and additional daily variants.
They use the existing `DAILY_CONTRACTS` and `WEEKLY_CONTRACTS` rotation pools,
repeatability values, and per-round deck flags. No second rotation engine is
introduced.

| Cadence | Contracts | Evidence examples |
| --- | --- | --- |
| Daily | Night Watch; Move a Package; Read the Room, plus the full daily deck | `SCOUT`, `STORE_SELL`, `CASE_STAGE_UP` |
| Weekly | Names Worth Keeping; Return Tickets; Keep the Armory Busy | `SCOUT`, `RUN_RETURNED`, `STORE_BUY` |

The current deck contains 180 daily and 23 weekly cards: three daily slots can
run for a 30-day round without repeating, regardless of where the round starts
in the deck; two weekly slots have more than enough cards for the round. These
contracts are current-v2.4 content only. Historical ruleset catalogs and
existing daily/weekly behavior remain unchanged.

## Slice 6 board UX

The existing Quest Board now presents the simultaneous contact graph, optional
Commissioner arc, and rotating contracts in one searchable board. Players can
filter All, Ready, Active, Available, Contracts, or Story work, while deep links
still reveal and focus a specific job. The board uses the existing accept,
track, claim, abandon, and refresh actions; it does not create a second board.

## Slice 7 migration and validation boundary

This redesign is a versioned ruleset/catalog change, not a destructive data
migration. New rounds that opt into `classic-og-v2.4-a` receive the current
board. Existing accounts and `PlayerQuest` rows keep their ruleset snapshot,
completion state, rewards, and pinned historical quest definitions.

Migration rules:

- Never mark a new job complete without matching `PlayerActivity` or
  `PlayerQuest` evidence.
- Never rewrite a historical quest key, reward, or claim receipt.
- Retired linear references in the current catalog map only to real current
  starter evidence; old catalogs retain their original references.
- Account identity and veteran suppression remain independent of round-scoped
  quest evidence.
- Daily/weekly board attempts continue through the existing rotation services;
  no duplicate rotation or claim engine is introduced.

The v2.4 validation suite checks the complete quest graph, current-only retired
keys, historical catalog preservation, contact/referral boundaries, rotating
pool shape, and lore/actionability requirements.

## Slice 1 starter leads

| Key | Contact | Lore hook | Completion evidence |
| --- | --- | --- | --- |
| `BOARD_MAMA_FIRST_LOOK` | Mama King | Learn to read one block before claiming it. | One resolved `SCOUT` |
| `BOARD_TOMMY_MUSCLE` | Tommy | Prove the crew can hire its first real muscle. | One positive `STORE_BUY` of `THUG` |
| `BOARD_PIP_FIRST_BATCH` | Pip | Make product instead of waiting on somebody else's shelf. | One resolved `PRODUCE_CRACK` |
| `BOARD_WHEELS_FIRST_RUN` | Wheels | Put the operation on the road and learn what movement costs. | One `RUN_LAUNCHED` |
| `BOARD_BLOCKS_MARK_CORNER` | Blocks | Put bodies on a held corner so the neighborhood knows it is occupied. | One `TURF_POST` |

These leads have no prerequisite on one another and are `ONCE` jobs. They use
existing event types and standard contact reputation/cash rewards. Daily and
weekly contracts are separate board content and are not silently converted into
story jobs by this slice.

## Linear-story migration boundary

The old `FIRST_NIGHT_OUT` through `PACK_YOUR_BAGS` chain is retained by its
historical rulesets, but is not offered by new `classic-og-v2.4-a` rounds.
`PLANT_THE_FLAG` remains as the current capstone, gated by the Blocks starter
lead, and continues to open the existing specialty branches. Existing player
rows and pinned rounds are never rewritten.

## Acceptance criteria

- All five starter leads exist in the current v2.4 catalog.
- None of the five has a prerequisite on another starter lead.
- Each job has non-empty lore, progress, completion, lesson, and action hint.
- Every objective maps to an existing authoritative activity/evidence path.
- The old linear jobs remain present in historical catalogs and absent from new
  v2.4 catalog availability.
- `PLANT_THE_FLAG` and specialty paths remain valid and use the existing board.
