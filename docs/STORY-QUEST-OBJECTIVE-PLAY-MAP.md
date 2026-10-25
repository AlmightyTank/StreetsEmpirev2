# Story Campaign Objective and Gameplay Map

**Status:** Design companion to the proposed 25-main / 15-side campaign. Event names marked **NEW** are proposed and are not currently emitted by StreetsEmpire.

## Objective design

A quest objective must make sense as part of the contact's job. The player should see a story scene, understand what the contact wants, perform a related game action or make a recorded story decision, and then see what changed. Avoid arbitrary totals, repeated chores, forced spending, and required PvP wins.

The current quest engine already supports event counts/sums, turn and cash progress, crew recruitment, state thresholds, unique values, turf-hold time, and quest prerequisites. Existing gameplay activities include scouting, store transactions, intercity runs, business actions, recon, legal actions, supply arrivals, and turf actions. The quest card already has intro, in-progress, ready, and completed story text.

### One small narrative-system addition

Some chapters are about examining a receipt, speaking to a witness, or comparing records. StreetsEmpire does not currently record those as distinct actions. Add a server-written **QUEST_STORY_SCENE** activity for a small, authored scene interaction on the active quest card. The scene has a stable sceneKey, a short prose panel, and one or more responses. The server validates that the quest is active and the scene is available, records the response idempotently, then emits the event that advances an EVENT_COUNT objective. The client cannot submit arbitrary proof or progress for another quest.

This lets the campaign use normal actions where they fit and authored story interactions where the plot needs them. A story scene is a short dialogue/evidence moment in the Quest page, not a new tutorial or a fake map location.

Branch choices at turn-in already fit QuestDefinition.branches: the player chooses after the objective, and PlayerQuest.chosenBranch records the result. Use that for the three major decisions below. Give each option the same main follow-up and comparable rewards; choices alter the recorded stance and finale text, not feature access or side-quest availability.

## Main storyline — objective map

| # | Quest | What the player does in game | Progress evidence |
| ---: | --- | --- | --- |
| 1 | The Night Receipt | Read Mama's scene, inspect the receipt, and choose to return it unopened or examine the erased line first. | **NEW** QUEST_STORY_SCENE — night_receipt_handled. |
| 2 | A Small Favor | Hear Mrs. Alvarez's account and decide whether to show her the receipt or ask who collected the money. | **NEW** scene — alvarez_statement_taken. |
| 3 | The Other Door | Make one sale to Pip after taking the job. Pip notices the duplicate route mark on the transaction slip he keeps for the player. | Existing STORE_SELL, filtered to storeKey: PIP. |
| 4 | Roll Call | Complete one intercity run. When the driver returns, Wheels recognizes Eli's route notation on the dispatch copy. | Existing RUN_RETURNED. No combat or successful shipment required. |
| 5 | The Missing Line | Compare the three account copies with Ledger and choose whether to keep or share the name recovered from the carbon. | **NEW** scene — missing_line_compared. |
| 6 | Pip's Count | Complete one buy or sale with Pip; the contact scene compares the receipt against his count sheet. | Existing STORE_BUY or STORE_SELL, filtered to storeKey: PIP. |
| 7 | The North Road | Bring an intercity run back. The returned route record contains the unexpected turn. | Existing RUN_RETURNED. |
| 8 | Tommy's Serial | Complete one purchase from Tommy; the scene compares the item's store receipt with Tommy's old tally. It does not claim the game tracks weapon serials. | Existing STORE_BUY, filtered to storeKey: TOMMY. |
| 9 | Two Buyers, One Load | After 6, 7, and 8 are complete, review the three clues on the campaign board and select which contact to brief first. | Quest-completion prerequisites plus **NEW** scene — two_buyers_briefed. The three leads may be completed in any order. |
| 10 | A Favor Already Paid | Ask Vic about the police notice and choose whether to take his lead to Ledger or protect the name on it. | **NEW** scene — vic_favor_answered. |
| 11 | Terms of Quiet | Interview Vic at the old drop. The player chooses what to do with the surviving notice; no warrant or Heat penalty is required. | **NEW** scene — notice_examined; response saved in the scene receipt. |
| 12 | The Clerk on the Stairs | Meet Hales through Ledger and compare a carbon page with the account copy from Quest 5. | **NEW** scene — hales_copy_compared. |
| 13 | A Date Changed in Ink | Use Combat recon to read one target report; Tommy's follow-up scene shows how a report can precede the action it supposedly records. Recon only; no attack or win. | Existing COMBAT_RECON, followed by **NEW** scene — raid_report_reviewed. If recon target availability proves unreliable, replace it with a scene-only objective. |
| 14 | The Woman at Closing | Return the second receipt to Mrs. Alvarez and let her choose whether her husband's name is included in the evidence. | **NEW** scene — second_receipt_returned. |
| 15 | Your Name in the Margin | Read the crew's entry in the book and choose Dispute, Leave it for now, or Keep a copy. | **NEW** scene — crew_entry_decided; record the selected response using the existing claim-branch field. |
| 16 | Mile Marker Nine | Complete an intercity run and compare its route record with Wheels' depot lead. | Existing RUN_RETURNED. |
| 17 | Passenger No. 9 | Review the passenger list with Wheels, then choose whether to contact Eli directly or let Wheels make the introduction. | **NEW** scene — eli_located. No forced travel loss or PvP. |
| 18 | What Mama Bought | Hear Mama's account of the fire relief money and choose whether she repays quietly or tells the affected families the truth. | **NEW** scene — mama_debt_reckoned; record the response. |
| 19 | The Honest Scale | Sell one product to Pip after accepting the job. Pip's copy of the sale becomes the opening for his corrected count. | Existing STORE_SELL, filtered to storeKey: PIP. |
| 20 | The Map in the Margins | Review Blocks' territory map and match its corridor marks to the debt page. The reveal is a story scene, not a requirement to win turf. | **NEW** scene — corridor_map_matched. |
| 21 | The Man Who Signed Twice | Hear the rival's account and choose whether to give them time to explain or confront the contradiction immediately. | **NEW** scene — rival_statement_taken. No PvP action. |
| 22 | No One Owes Alone | Bring the contact accounts together on the campaign board; identify which debts were transferred without consent. | **NEW** scene — accounts_reconciled. Requires main clues 6–8 and 10–21, not the optional side quests. |
| 23 | The Last Appointment | Hear Mara's offer and choose whether to accept, refuse, or ask for the book first. | Existing turn-in branch choice: MEET_MARA_ACCEPT, MEET_MARA_REFUSE, or MEET_MARA_DEFER; all share Quest 24 as follow-up. |
| 24 | Everybody at the Table | Review the contact requests and choose which concern to put first in the plan. The scene acknowledges all contacts; it does not require a player to spend cash, lose turf, or take a fight. | **NEW** scene — table_priority_chosen. |
| 25 | The Missing Line | Choose the campaign ending: Open the Book, Burn the Book, or Keep the Book. | Existing turn-in branch choice: OPEN_BOOK, BURN_BOOK, or KEEP_BOOK; all close the main chain and use equal-power rewards. |

## Side stories — objective map

Side-story evidence should be independently attainable. Side quests add character context and close loose ends; they never gate the main ending or specialty features.

| # | Quest | What the player does in game | Progress evidence |
| ---: | --- | --- | --- |
| S1 | A Key Under the Mat | Examine the key Mrs. Alvarez kept and decide whether to open Eli's locker. | **NEW** scene — eli_key_examined. |
| S2 | The Rent Envelope | Compare the rent envelope with the shop receipt; let Mrs. Alvarez decide whether her name can be shared. | **NEW** scene — rent_envelope_compared. |
| S3 | A Warm Room | Hear the fire-relief families and choose whether to deliver Mama's repayment or let her explain it herself. | **NEW** scene — relief_repaid_or_explained. |
| S4 | The Weight on the Scale | Complete one Pip store transaction; Pip checks its displayed amount against his retained count. | Existing STORE_BUY or STORE_SELL, filtered to storeKey: PIP. |
| S5 | A Box with No Label | Receive one supply-lane shipment, then inspect the receipt in the Pip scene. If supply-lane access is unavailable in the target round, use a **NEW** scene-only objective instead. | Existing SUPPLY_LANE_ARRIVED, followed by **NEW** scene — box_code_examined. |
| S6 | The Last Honest Count | Complete one sale to Pip and choose whether to show the corrected count to the supplier. | Existing STORE_SELL to Pip plus **NEW** scene — honest_count_shared. |
| S7 | The Other Serial | Buy one item from Tommy; compare its ordinary purchase receipt with the apprentice's sale book. | Existing STORE_BUY, filtered to storeKey: TOMMY; no invented item-serial tracking. |
| S8 | Last Shift at the Armory | Hear the apprentice's account and let Tommy answer why he stopped asking questions. | **NEW** scene — apprentice_heard. |
| S9 | A Rack Kept Open | Make one Tommy store purchase after the apprentice returns; the closing scene shows the apprentice setting the new terms. | Existing STORE_BUY, filtered to storeKey: TOMMY. |
| S10 | Mile Marker Zero | Complete an intercity run and ask Wheels to compare it with Eli's first route. | Existing RUN_RETURNED. |
| S11 | The Passenger Window | Hear Eli describe the three drivers and choose whether to label one an informant. | **NEW** scene — drivers_identified. |
| S12 | Every Road Home | Complete one intercity run; Wheels offers a route out to a driver who wants to leave the work. | Existing RUN_RETURNED, followed by the scene driver_route_offered. |
| S13 | A Copy for Ledger | Meet Hales's daughter through Ledger and choose whether she can share the carbon copy. | **NEW** scene — carbon_copy_released. |
| S14 | The Holding Company | Review Blocks' ownership map and identify which corridor parcel matches the account page. | **NEW** scene — holding_company_matched. No turf claim required. |
| S15 | Terms in Plain English | Hear the rival's statement with Vic, Ledger, and Blocks present; choose whether to attach it to the final record. | **NEW** scene — statement_attached. |

## What uses existing systems vs. what needs work

| Capability | Current support | Campaign use |
| --- | --- | --- |
| Normal gameplay proof | Quest progress records PlayerActivity events and supports filtered count/sum objectives. | Use STORE_BUY, STORE_SELL, RUN_RETURNED, COMBAT_RECON, and SUPPLY_LANE_ARRIVED only where the contact's job naturally calls for them. |
| Chapter text | Quest definitions already have intro, in-progress, ready, completed, and action-hint copy. | Use these for chapter scenes; remove lesson-style instructional language from the story copy. |
| Choice at turn-in | Branch choices are defined on quests and saved as PlayerQuest.chosenBranch. | Use for Quests 15, 23, and 25; all options retain the shared main follow-up. |
| Branch-dependent future dialogue | The chosen branch is retained and displayed, but general story text is not yet conditional on earlier choices. | Add a small story-copy condition/resolution layer before promising personalized later scenes. |
| Evidence-only scenes | No generic authored story-scene activity currently exists. | Add the server-validated QUEST_STORY_SCENE event described above; use stable scene keys and idempotent receipts. |
| Main/side progression | Quest prerequisites and follow-ups are supported. | Unlock side arcs from their stated main quest; side quests do not gate the main ending. |

## Release and fairness checks

- Validate every proposed ActivityType against the pinned target ruleset before implementation. Do not silently count an unrelated activity as story evidence.
- For every filtered store objective, verify the actual payload field and value in a test; use the existing authored catalog spellings.
- Keep optional supply-lane content out of the main chain.
- Avoid STATE_AT_LEAST for story proof when it could be satisfied before accepting the quest; prefer post-accept events or explicit scene receipts.
- Make scene choices replay-safe: one accepted scene key per player-quest attempt, transactionally recorded and idempotent.
- Verify all ending and side-story outcomes preserve access to the other specialty paths and have comparable reward value.
- Treat these mappings as design candidates. The next implementation slice should audit the actual beta event payloads and then write integration tests for each event used.
