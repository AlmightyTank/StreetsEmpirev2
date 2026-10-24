# The Missing Line — release notes and checklist (Slice J)

This covers shipping The Missing Line: migration, balance, telemetry, the story archive, and the release checklist. Plan of record: [STORY-QUEST-CAMPAIGN-SLICES.md](STORY-QUEST-CAMPAIGN-SLICES.md).

## What ships

- **Ruleset:** `classic-og-v2.6-i` (2.6.0-I) is the default for new rounds. The game's only story is The Missing Line: 25 main chapters (`ML_M01`–`ML_M25`) and five side arcs of three chapters each (`ML_S01`–`ML_S15`).
- **Player story archive:** `/game/story`, opened from **Story so far** on the job board. It lists every chapter the crew has reached, grouped by act and side arc, with:
  - the scene answers and turn-in choices, read from the stored keys;
  - each finished chapter's closing line;
  - once M25 is turned in, how the book was closed.

  Locked chapters count toward the total but aren't listed, so their titles don't spoil what comes next.
- **Admin campaign report:** `GET /admin/story-campaign?roundId=…`, shown as **The Missing Line** on the admin Quests page.
- **Campaign carry on ruleset change:** when an admin moves a round to another ruleset, each crew's campaign rows follow it (see below).

## Migration

**No data migration is needed to ship 2.6.0-I.**

- **Rounds are pinned to a ruleset.** Rounds on 2.6.0-H or earlier keep their old story chain, side jobs and rewards exactly as they were. Only new rounds start on 2.6.0-I.
- **Crews belong to one round.** A returning account joins a new round as a new crew and starts the campaign at M01. Nothing from the old chain carries over, so nothing can be granted twice.
- **Unlocks can't be granted twice.** Permanent unlocks are stored per crew with an upsert keyed on the unlock. A crew that already holds an unlock gets nothing extra when a campaign chapter grants it again.
- **The schema change is additive.** The only schema change for the campaign is the `QuestSceneResponse` table and the `QUEST_STORY_SCENE` activity type (migration `20261220000000_quest_story_scenes`, shipped with Slice B).

**Ruleset change mid-round (fixed in this slice).**

- **The problem:** quest progress hangs off one ruleset version's quest definitions. Before this slice, moving a live round from, say, 2.6.0-H to 2.6.0-I put every crew back at M01. Chapters they had finished could then be played and paid a second time.
- **The fix:** `AdminRoundService.changeRuleset` now calls `StoryCampaignCarryService`, which moves each crew's `ML_` rows onto the same chapter in the new ruleset, in the same transaction. The rows bring their scene answers, progress receipts and turn-in choices with them. The audit entry records how many rows moved (`storyRowsCarried`).
- **Rows that stay behind:**
  - A crew that already has a row for a chapter on the target ruleset (a round moved there and back) keeps that row.
  - Non-campaign jobs (dailies, weeklies and so on) still start fresh after a ruleset change, as before.

## Balance review

Base cash per chapter, from the 2.6.0-I catalog. Campaign quests have no bonus-objective cash.

| Arc | Chapters | Cash | Unlocks |
| --- | --- | --- | --- |
| Act I · A Name in the Rain | 5 | $8,000 | Weed recipe |
| Act II · Three Ways to Lose a Load | 5 | $16,000 | Ecstasy access + recipe |
| Act III · The Price of Keeping Quiet | 5 | $25,000 | AK-47 |
| Act IV · The Road Keeps Its Own Books | 5 | $35,000 | Van; Cocaine and Heroin recipes |
| Act V · Who Keeps the Book | 5 | $51,000 | — |
| Side · Mrs. Alvarez's Shop | 3 | $10,000 | — |
| Side · Pip's Honest Count | 3 | $10,500 | Meth access + recipe; Cocaine and Heroin access |
| Side · The Apprentice | 3 | $10,500 | Out-of-town guns |
| Side · Wheels' Drivers | 3 | $12,500 | — |
| Side · The Signed Pages | 3 | $15,000 | — |
| **Total** | **40** | **$193,500** | |

Contact reputation is paid on top, at about 2–6 per chapter.

**Reference points on the same ruleset:**

- crews start with $20,000;
- a daily contract pays a median of $1,450;
- a weekly pays a median of $40,000;
- season contracts pay $120,000–$150,000.

**Findings:**

- **The pay curve rises steadily:** about $1.6k a chapter in Act I, about $10k a chapter in Act V. No act pays less per chapter than the one before it.
- **Branch parity holds.** None of the turn-in choices (M15, M23, M25) adds cash, items or unlocks. Each one moves 2 reputation toward one contact, and nothing else. The Act III and Act V integration suites check that every option pays the same.
- **The campaign isn't the main source of cash, and that's intended.** All 40 chapters together pay less than five weeklies. The real rewards are the unlocks and the story. Boards remain the economy.
- **No tuning in this release.** Revisit Act V pay (about $10k a chapter, a quarter of a weekly) once the admin report shows how many crews get that far and how quickly.

## Telemetry

The admin Quests page shows **The Missing Line** for the selected round. The same data comes from `GET /admin/story-campaign?roundId=…`. It reports:

- **Chapter status:**
  - For every chapter, the number of crews with it Available, Active, Ready or Completed.
  - **Kept going** is the share of crews that finished the previous main chapter and have also finished this one. That shows drop-off per chapter.
  - Statuses are what's stored; a crew's next unlocked chapter moves to Available when it next opens the job board.
- **Choices:** the count and share for each option of M15, M23 and the M25 ending.
- **Scene answers:** the count of each response to every scene, with its share.

All of it comes from `PlayerQuest` and `QuestSceneResponse` rows for the round. No new events are logged. Each scene answer is also in the activity feed as `QUEST_STORY_SCENE`.

## Release checklist

Automated coverage is in parentheses. Integration suites run with `STORY_INTEGRATION=1`.

**New account**
- [ ] Join a 2.6.0-I round. The job board shows M01 Available. No retired story or side jobs appear. (`campaign-only-stories.integration`)
- [ ] Play Act I through the contact room (`/game/visit/MAMA_KING`) with real store, scout and run actions. (`missing-line-act-1`, `missing-line-depth`)
- [ ] **Story so far** shows Act I with your scene answers, and no locked chapter titles. (`storyArchive.test`)

**Returning account**
- [ ] An account that finished the old story chain in an earlier round starts the campaign at M01 in a new round.
- [ ] When M03 grants the Weed recipe, it's granted once, and the store's "Finish … for …" hints point to campaign chapters. (`campaign-only-stories.integration`)

**Ruleset change mid-campaign**
- [ ] Move a live round from 2.6.0-H to 2.6.0-I after a crew has finished some chapters. Finished chapters stay finished. Scene answers stay. The next chapter is Available. Finished chapters can't be claimed again. (`story-campaign-carry.integration`)
- [ ] The audit log entry shows `storyRowsCarried`.

**Every ending**
- [ ] All nine combinations of the M23 answer and the M25 ending finish the campaign, pay the same, and are remembered. (`missing-line-act-5`)
- [ ] The archive's **How it ended** shows the chosen ending and its closing line.
- [ ] The admin report counts the ending. (`story-campaign-report.integration`)

**With and without side arcs**
- [ ] Main chapters M01–M25 complete without any side chapter. Side arcs never gate the main chain or M22. (`missing-line-side-stories`)
- [ ] With side arcs done, the finale variants pick up their echoes. (`missing-line-side-stories`, `missing-line-echoes`)

**Before shipping**
- [ ] `FULL_TESTS=1 npx vitest run`, all campaign integration suites with `STORY_INTEGRATION=1`, and `npm run typecheck` pass.
- [ ] On a short phone screen, the contact room still shows the contact's face above the dialogue.
- [ ] The admin report loads for an older round without a campaign; it shows "no campaign".

## Also shipped

- R2: painted contact rooms for every contact, Mara included (`apps/web/public/rooms/`). Mara still has no portrait; she's shown as a silhouette in her room.
