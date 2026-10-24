# The Missing Line — Implementation Slices

**Status:** Build plan for the [Campaign Spine](./STORY-QUEST-CAMPAIGN-SPINE.md) and the [Objective and Gameplay Map](./STORY-QUEST-OBJECTIVE-PLAY-MAP.md). Nothing here is live yet. Each slice is sized to land as one PR with its own tests and leave `beta` releasable.

The order: build the systems first (A–C), ship Act I as a playable pilot (D), then add one act per slice. The branch-aware copy layer lands before the finale needs it, and side arcs can land in parallel once the main quest they branch from exists.

## Dependency map

```
A Audit & contracts (done)
├─ A2 Basket checkout evidence fix (done)
└─ B Story-scene engine (server) (done)
   └─ C Story-scene UI (Quest page) (done)
      └─ D PILOT: Act I (Main 1–5) + new ruleset (done)
         ├─ E Act II (Main 6–10) (done) ┬─ K Side: Pip arc (S4–S6)
         │                         └─ L Side: Tommy arc (S7–S9)
         ├─ F Act III (Main 11–15) ── first turn-in branch (Q15)
         ├─ G Act IV (Main 16–20) ─┬─ M Side: Alvarez/Mama arc (S1–S3)
         │                         ├─ N Side: Wheels arc (S10–S12)
         │                         └─ O Side: Ledger/Blocks arc (S13–S15)
         ├─ H Branch-aware story copy layer
         └─ I Act V (Main 21–25) + MARA_VENN + endings   (needs H; reads K–O if present)
            └─ J Story archive, migration, balance & release
```

Side slices K–O depend only on the main slice they branch from and can be built in any order. Slice I must handle side arcs that are not yet installed, because they are optional.

## Conventions for every content slice (D–O)

- **Ruleset pinning:** each content slice that changes the catalog extends the previous one with a new id, starting at `classic-og-v2.6-a`. Old rounds keep their catalog, so a round only gets the acts that existed when it opened.
- **Quest keys:** `ML_M01_NIGHT_RECEIPT` … `ML_M25_MISSING_LINE`, `ML_S01_KEY_UNDER_MAT` … `ML_S15_PLAIN_ENGLISH`. The number in the key keeps Main 5 and Main 25 apart, since both are titled "The Missing Line".
- **Story copy:** `story.intro / inProgress / ready / completed` hold chapter prose (see the Spine's prose standard). Story quests get no `lesson` text; mechanics stay in the tutorial.
- **Evidence:** use only the events the Objective Map lists, verified in Slice A. Prefer events that happen after accepting the quest over `STATE_AT_LEAST`.
- **Rewards:** comparable value within an act; branch options give equal-power rewards; no rewards that lock out a specialty.
- **Tests per slice:** catalog validation (`defineQuestCatalog` passes, prerequisites and follow-ups resolve), one server integration test per objective type the slice uses, and a full play-through of the slice's chain on a test round.

---

## Contact room and depth pass (added after Act II)

Contacts carry more than the campaign: story chapters, side jobs, referrals and contracts, Pip's and Tommy's counters, and standing. These slices give each contact a visit screen, then deepen the campaign's objectives before Acts III–V are written.

### Slice R1 — Contact room ✅

**Done:** `/game/visit/:contactKey` (`apps/web/src/pages/ContactRoomPage.tsx`, `components/ContactDialogue.tsx`, `utils/contactRoom.ts`, `styles/contact-room.css`). Web only: it reuses the quest page data and the existing accept, scene and claim endpoints.
- **The room:** each contact's room has a CSS backdrop with its own tint, their portrait shown large, and a dialogue box with a greeting.
- **Dialogue options:** "Got any work for me?", "Want to trade?" (Pip and Tommy link to their store), "Where do we stand?" and "I've got to go." Number keys pick options.
- **Inside a job:** the contact speaks the job's story line. Taking the job, story-scene answers (confirmed first), branch choices and collecting payment are all dialogue options.
- **Show history:** finished business with the contact and the choices made in it.
- **Entry points:** each contact in the quest page's "Contact standing" panel, "Talk to …" on every quest card with a contact, and **Visit Pip / Visit Tommy** on their store screens.
- **Stage ratio:** the contact keeps a fixed share of the screen (`--room-stage`: 44% of the height, 220–420px; 30% and 170–240px on phones). The portrait always fits inside it, and the dialogue may overlap only the desk edge at its bottom (28px, or 16px on phones). Checked at 1480×716, 1280×900, 1920×1080, 1024×600, 390×844 and 390×600: the dialogue covers 7–11% of the portrait at every size.
- **Tests:** `ContactDialogue.test.tsx`, plus a manual check in the running app at 1280px and 390px.

### Slice R2 — Painted rooms (art)

Replace the CSS backdrop with a painted room per contact: Mama's kitchen table, Pip's counter, Tommy's back room, Wheels' garage, Vic's booth, Blocks' corner, Ledger's desk, Ace's casino floor, the Commissioner's office. Keep the CSS tint as the fallback.

### Slice R3 — Objective depth pass (Acts I–II) ✅

**Done:** ruleset `classic-og-v2.6-c` (2.6.0-C), now the default for new rounds (`classic-og-v2.6-c/missing-line-depth.ts`). Same keys, chain, rewards and catalog order. 2.6.0-A and 2.6.0-B rounds keep their acts.

| Chapter | Work | Then |
| --- | --- | --- |
| M01 The Night Receipt | scene first, then scout Low Rent to walk the receipt back | — |
| M02 A Small Favor | 10 beer from the Corner for Mrs. Alvarez's shelf | her statement (scene) |
| M03 The Other Door | sell Pip 10 units | **new scene:** the two slips |
| M04 Roll Call | bring a run home | **new scene:** Eli's mark |
| M06 Pip's Count | cook a batch and sell Pip 10 units | **new scene:** the count sheet |
| M07 The North Road | bring a run home | **new scene:** where the road splits |
| M08 Tommy's Serial | buy 5 pistols from Tommy | **new scene:** the tally book |

**Unchanged:** M05, M09 and M10 were already scene-led.

**New evidence** (verified): `SCOUT` with `districtKey`, `PRODUCE_CRACK`, and Corner `BEER` buys, which also count through the basket.

**Tests:**
- `missing-line-depth.test.ts` checks that only the deepened chapters change, that each scene waits for its work, the evidence and targets, and that the work is affordable from a fresh start.
- `missing-line-depth.integration.test.ts` plays Acts I–II with the real scout, store, checkout and production actions from a fresh starting player.

Make chapters do more in the game without turning them into chores:
- add an action-then-scene pairing where a reveal now only appears in the "ready" text;
- use more systems where the story fits them (scouting the shop's district, producing for Pip, Ledger's lawyer, Blocks' turf);
- set real but fair targets.

Pinned in a new ruleset, so in-flight rounds are unaffected. Acts III–V are written to this standard from the start.

## Slice A — Audit and contracts (no player-facing change) ✅

**Done:** see [Slice A contract](./STORY-QUEST-CAMPAIGN-SLICE-A.md). It found blocker B1 (Slice A2) and settled the open questions below. The checklist that follows is kept as the record of what was audited.

**Goal:** turn the Objective Map's "design candidates" into verified contracts before writing content.

- Verify the real `PlayerActivity` payloads in beta for each event the campaign uses:
  - `STORE_BUY` / `STORE_SELL` with `storeKey: 'PIP'` and `storeKey: 'TOMMY'` (`apps/server/src/services/store.service.ts`, `product-market.service.ts`). Confirm Tommy's store key spelling.
  - `RUN_RETURNED` is emitted on every return, not just successful shipments (needed by Q4, 7, 16, S10, S12).
  - `COMBAT_RECON` is emitted whenever a recon succeeds and has reliable targets (Q13), or record the decision to use the scene-only fallback.
  - `SUPPLY_LANE_ARRIVED` is reachable in the target round (S5), or record the decision to use the scene-only fallback.
- Confirm that multiple `QUEST_COMPLETED` prerequisites are ANDed (Q9 needs 6, 7, and 8; Q22 needs the main clue chain; S15 needs S13 and S14).
- Confirm how `branches` + `chosenBranch` behave when every branch shares the same follow-up (Q15, Q23, Q25).
- Decide how the campaign relates to the current `story-quests.ts` chain (`FIRST_NIGHT_OUT` → `PLANT_THE_FLAG`), using `AUDIT-TUTORIAL-STORY-QUEST-CONVERSION-MAP.md`: does the campaign replace it in the new ruleset, or run after it? Record what happens to players partway through that chain.
- Decide whether `questContacts` (global, not round-pinned) can safely gain `LEDGER` and `MARA_VENN`, or whether contacts need ruleset scoping.
- **Deliverable:** `docs/STORY-QUEST-CAMPAIGN-SLICE-A.md` (contract), plus server tests that pin the payload fields above so later slices can rely on them.
- **Done when:** every row in the Objective Map is marked *verified*, *fallback to scene*, or *blocked: reason*.

## Slice A2 — Basket checkout evidence fix ✅

**Done, for every ruleset:** a basket counts exactly like the same trades made one at a time, including for unfiltered store-action counts. See B1 in the [Slice A contract](./STORY-QUEST-CAMPAIGN-SLICE-A.md).

**Goal:** a basket checkout gives quests the same evidence as the single trades it contains (Slice A blocker B1). Before the fix, 57 store-filtered objectives in the latest ruleset ignored basket purchases.

- Give each basket line its own quest-progress evidence (its own `storeKey`, `itemKey`, `direction`, `quantity`, `totalCents`, and the event type for that line's direction) with a stable per-line source key, so `QuestProgressReceipt` still makes each line count once.
- Unfiltered "any store" objectives count a basket the same way: one per line, as if each line were its own trade. (Chosen over "one per basket" so a basket and separate trades always give the same result.)
- Applies to every ruleset, including rounds already running (decided by the owner).
- **Tests:** extend `story-campaign-evidence.integration.test.ts` so the basket case matches Pip and Tommy objectives; add mixed-basket and sum cases.
- **Done when:** a mixed basket credits Pip and Tommy objectives line by line, exactly once, through the real pipeline.

## Slice B — Story-scene engine (server) ✅

**Done:** see [Slice B contract](./STORY-QUEST-CAMPAIGN-SLICE-B.md) for the authoring format, endpoint, and rules.

**Goal:** the one new system piece the Objective Map calls for, built and tested on a test-only quest.

- Add `QUEST_STORY_SCENE` to `ActivityType` (`packages/shared/src/types/api.ts`).
- Add an authored scene definition to quest story data: stable `sceneKey`, prose panel, one or more `responses` (each with a stable `responseKey`). Add validator rules in `quest-definitions.ts` for unique keys, objectives that reference real scenes, and no orphan scenes.
- Objective wiring: `EVENT_COUNT` filtered on `payload.sceneKey`, which needs no new objective kind if the filter supports it (otherwise add a filter field, not a new kind).
- Server action `respondToStoryScene(roundPlayerId, questKey, sceneKey, responseKey)`:
  - quest must be `ACTIVE` for this attempt, and the scene must belong to it and be currently available (supports scene-after-event ordering, as in Q13, S5, S6, S12);
  - writes a response receipt and the activity in one transaction, idempotent per (player-quest attempt, sceneKey); a repeat returns the existing receipt;
  - the client cannot pick the quest attempt, progress amount, or payload.
- Store the response in a new `QuestSceneResponse` table (`@@unique([playerQuestId, sceneKey])`, `responseKey`, time). Add `QUEST_STORY_SCENE` to the Prisma `ActivityType` enum and to `packages/shared`. Both need a migration.
- Make `QuestStoryDefinition.lesson` optional so story quests carry no lesson text.
- **Tests:** happy path, double submit, wrong quest/inactive quest, scene out of order, concurrent submit, ruleset pinning.
- **Done when:** a test-only quest with one scene can be accepted, answered, completed, and claimed, with one activity and one receipt.

## Slice C — Story-scene UI (Quest page) ✅

**Done:** `apps/web/src/components/QuestStoryScenes.tsx` renders each scene on the quest card in one of three states:
- **locked:** title plus a hint, with no prose;
- **open:** prose plus one button per response. Answering asks for confirmation through the same dialog as branch choices;
- **answered:** the chosen response and its outcome.

The card opens its details when a scene becomes playable. Chapter copy keeps paragraph breaks, the **Lesson** block is hidden when there's no lesson, and scene titles are searchable. Checked in the running app at 1280px and 390px with a demo ruleset: the scene was answered, confirmed, and the job moved to *Ready to collect*.

**Goal:** players can read and answer a scene on the active quest card.

- Scene panel inside the quest card: prose, response buttons, a confirmation state, and the recorded response shown after answering ("You returned it unopened.").
- Handle loading, error, and already-answered states; disable double-submit.
- Mobile layout, keyboard and screen-reader support, consistent with the quest page.
- Keep the labeling separate: story-scene panels must not look like tutorial highlights.
- Hide the quest card's **Lesson** block when a quest has no `lesson`, and give chapter prose room for more than one line.
- Post answers to `POST /api/game/quests/:key/scenes/:sceneKey` with `{ responseKey }`. Render from `story.scenes[]`: show `available`, the response buttons, and the recorded `response.outcome` (see the Slice B contract).
- **Done when:** the Slice B test quest is playable end to end in the web app on desktop and mobile widths.

## Slice D — PILOT: Act I, "A Name in the Rain" (Main 1–5) ✅

**Done:** ruleset `classic-og-v2.6-a` (2.6.0-A), now the default for new rounds, adds `ML_M01_NIGHT_RECEIPT` → `ML_M05_MISSING_LINE` in `packages/rulesets/src/classic-og-v2.6-a/missing-line-act-1.ts`.

- **Chain and evidence:** linear chain. M01 has no prerequisite. Category is `CAMPAIGN`, with no lesson text. Evidence: scenes for M01, M02, M05; a `STORE_SELL` to Pip for M03; `RUN_RETURNED` for M04.
- **Rewards:** $1,000 / $1,000 / $1,500 / $2,000 / $2,500 cash ($8,000 for the act) plus 3–5 contact rep each, which is the opening board-job band. Contact rep also pays the contact's faction standing, as it does for those jobs.
- **Board order:** appended after the 2.5.0-A catalog, so the Origin and first-names jobs keep their board order. M05 has no follow-up until Act II ships.
- **Tests:**
  - `missing-line-act-1.test.ts` covers the chain, that contacts exist in the ruleset, the evidence, the reward band, and that 2.5.0-A is untouched;
  - `missing-line-act-1.integration.test.ts` plays M01 to M05 on PostgreSQL, checking pay, rep, recorded choices, and no double claim;
  - a manual check in the running app.
- **Known pilot issues:** M04 needs a car (players start with none; Charlie sells them), and the hint says so. The campaign shares the board's "Main story" slot with the Origin and first-names jobs: whichever story job is furthest along is featured.

**Goal:** first playable arc, as the Spine's production rule asks for.

- Reuse the existing `LEDGER` contact (Marisol "Ledger" Pike, retired records sergeant). Campaign prose must match her established voice.
- Add a catalog check that every campaign `contactKey` exists in the ruleset's contacts.
- Quests: M01 Night Receipt (scene), M02 A Small Favor (scene), M03 The Other Door (`STORE_SELL`/PIP), M04 Roll Call (`RUN_RETURNED`), M05 The Missing Line (scene).
- Author the full chapter prose and the scene responses for all five.
- Create the new ruleset id and register the catalog; old rounds are unaffected.
- **Note:** M04 needs intercity runs to be unlocked. Check that against the tutorial gates (Roadmap Slice D) so the pilot cannot get stuck behind a gate it does not explain.
- **Done when:** a new test-round player can go from M01 through M05, see M06–M08 waiting as "coming soon" or simply absent, and everything holds across reloads and round restarts.

## Slice E — Act II, "Three Ways to Lose a Load" (Main 6–10) ✅

**Done:** ruleset `classic-og-v2.6-b` (2.6.0-B), now the default for new rounds.
- **Re-issued chapter:** `ML_M05_MISSING_LINE` is re-issued, unchanged apart from opening the three leads. 2.6.0-A rounds keep Act I as it shipped.
- **Leads and evidence:** `ML_M06_PIPS_COUNT` (a trade with Pip), `ML_M07_NORTH_ROAD` (`RUN_RETURNED`) and `ML_M08_TOMMYS_SERIAL` (a buy from Tommy) can be held at once and done in any order. `ML_M09_TWO_BUYERS` (Ledger's scene: who hears it first) needs all three, then `ML_M10_FAVOR_ALREADY_PAID` (Vic's scene).
- **Rewards:** $2,500–$4,000 each, $16,000 for the act, plus 5 contact rep each.
- **Tests:** `missing-line-act-2.test.ts`; `missing-line-act-2.integration.test.ts` checks all six lead orders reach M09, that one lead's work doesn't advance another, and plays M09 and M10.

- M06 Pip's Count (`STORE_BUY`|`STORE_SELL`/PIP), M07 The North Road (`RUN_RETURNED`), M08 Tommy's Serial (`STORE_BUY`/TOMMY) all unlock together from M05 and can be done in any order.
- M09 Two Buyers, One Load: three `QUEST_COMPLETED` prerequisites plus the `two_buyers_briefed` scene.
- M10 A Favor Already Paid (scene).
- UI check: three active leads at once read clearly on the quest board.
- **Done when:** all 3! = 6 completion orders of M06–M08 reach M09 (tested).

## Slice F — Act III, "The Price of Keeping Quiet" (Main 11–15) ✅

**Done:** ruleset `classic-og-v2.6-d` (2.6.0-D), now the default for new rounds (`classic-og-v2.6-d/missing-line-act-3.ts`). Written to the R3 standard. `ML_M10_FAVOR_ALREADY_PAID` is re-issued to open the act; 2.6.0-C rounds keep Act II closed.

| # | Chapter (contact) | Work | Then |
| --- | --- | --- | --- |
| 11 | Terms of Quiet (Vic) | scout Urban Ghetto to reach the old drop | scene: the notice behind the radiator |
| 12 | The Clerk on the Stairs (Ledger) | 5 medicine from the Corner for Mr. Hales | scene: the carbon in the bread box |
| 13 | A Date Changed in Ink (Tommy) | 2 ammo boxes from Tommy; recon a rival is a **bonus** only | scene: the report filed before the fact |
| 14 | The Woman at Closing (Mama) | hire a thug from Tommy for Mrs. Alvarez's door | scene: the second receipt |
| 15 | Your Name in the Margin (Ledger) | scene: the crew's entry | **turn-in choice:** Dispute the entry / Leave it for now / Keep a copy |

- **M15 choices:** every option pays the same $6,000 and +5 Ledger rep. The choice adds +2 with Ledger, Vic or Mama respectively, and is stored in `chosenBranch`.
- **No follow-up yet:** M15 has no follow-up until Act IV re-issues it to open Mile Marker Nine.
- **Rewards:** $4,500–$6,000 per chapter, $25,000 for the act.
- **Rejected:** the lawyer retainer for Ledger costs at least $25,000, so it would be forced spending.
- **Tests:**
  - `missing-line-act-3.test.ts`;
  - `missing-line-act-3.integration.test.ts` plays M11–M15 with the real scout, basket and store actions, confirms collecting M15 without a choice is refused, and checks that each choice pays the same and tilts the right contact.

**Plan as written:**


- M11, M12, M14 scenes; M13's required objective is the `raid_report_reviewed` scene, with `COMBAT_RECON` as an optional bonus (Slice A decision 6).
- M15 Your Name in the Margin: first **turn-in branch** (Dispute / Leave it / Keep a copy), all leading to M16 with equal rewards.
- **Done when:** each M15 branch is recorded in `chosenBranch`, shown in the quest history, and leads to M16.

## Slice G — Act IV, "The Road Keeps Its Own Books" (Main 16–20) ✅

**Done:** ruleset `classic-og-v2.6-e` (2.6.0-E), now the default for new rounds (`classic-og-v2.6-e/missing-line-act-4.ts`). `ML_M15_NAME_IN_THE_MARGIN` is re-issued so every choice leads to Mile Marker Nine; its options pay exactly as before. Nothing in the act needs turf or a fight.

| # | Chapter (contact) | Work | Scene |
| --- | --- | --- | --- |
| 16 | Mile Marker Nine (Wheels) | bring a run home | the depot that isn't on any map, and Eli's name on the list |
| 17 | Passenger No. 9 (Wheels) | reach Eli first, then buy a Low-Rider from Charlie to get him out | Eli's account and the torn page |
| 18 | What Mama Bought (Mama) | scene-led confession | the fire on Delancey: settle quietly, or tell the families |
| 19 | The Honest Scale (Pip) | sell Pip 20 units | squaring it with the supplier |
| 20 | The Map in the Margins (Blocks) | walk the corridor: scout 3 different districts | the debts under the corridor |

- **New evidence:** `UNIQUE_VALUES` on the scout `districtKey`.
- **The car:** the Low-Rider ($5,000) was picked because Sedans can be locked behind a permanent unlock.
- **Rewards:** $6,500–$8,000 per chapter, $35,000 for the act; M17 pays more than the car it asks for.
- **Tests:**
  - `missing-line-act-4.test.ts`;
  - `missing-line-act-4.integration.test.ts` confirms each Act III choice opens M16, and plays M16–M20 with the real run, store and scouting actions (a repeated district doesn't count twice).

**Plan as written:**


- M16 (`RUN_RETURNED`), M17 Passenger No. 9 (scene), M18 What Mama Bought (scene, response recorded), M19 The Honest Scale (`STORE_SELL`/PIP), M20 The Map in the Margins (scene, no turf requirement).
- **Done when:** the chain plays through, and the M18 response is readable by Slice H.

## Slice H — Branch-aware story copy layer ✅

**Done:**
- **Variants:** `QuestStoryDefinition.variants` adds conditional story lines. Each variant has a `when` condition (`BRANCH_CHOSEN`, `SCENE_RESPONSE` or `QUEST_COMPLETED`) and may replace `intro`, `inProgress`, `ready`, `completed` or `actionHint`. For each line, the first matching variant wins; the quest's own line is always the default.
- **Resolver:** `resolveStoryCopy` in `packages/rulesets/src/story-copy.ts`, a pure function.
- **Validator:** `storyVariantProblems` checks that every condition names a real quest, branch, scene and response in the same catalog, and that each variant replaces at least one allowed, non-empty line.
- **Server:** `storyFactsFor` loads the player's earlier outcomes in one query, only for the quests some line depends on, and only when the ruleset has variants. `storyDto` resolves the lines, so the client and the contact room receive plain text, never conditions.
- **Content:** ruleset `classic-og-v2.6-f` (2.6.0-F), now the default, re-issues three Act IV chapters with echoes. Nothing else changes.
  - Mile Marker Nine answers each Your Name in the Margin choice.
  - Passenger No. 9 answers what was done at the depot.
  - What Mama Bought's opening remembers whether Mr. Alvarez's name went into the record, and its closing line follows how Mama settled her debt.
- **Tests:**
  - `story-copy.test.ts` covers the resolver and validator;
  - `missing-line-echoes.test.ts` checks that every choice has its echo;
  - `missing-line-echoes.integration.test.ts` checks the served text for each choice, the default for players without history, and the echoes in history.

**Plan as written:**


**Goal:** later text can respond to earlier choices. This has to land before Act V, whose finale depends on it.

- A small, typed condition on story copy: variant text chosen by an earlier quest's `chosenBranch`, a recorded scene `responseKey`, or whether a side quest is completed. Resolved on the server when the quest page payload is built; the client never evaluates conditions.
- Validator: every condition references a real quest/scene/response key in the same catalog, and every conditional block has a default.
- Retrofit a few lines in Acts III–IV to prove it out (for example, M16–M18 lines that mention the M15 stance).
- **Done when:** changing an earlier choice on a test player changes the resolved text, and a missing or uninstalled side quest falls back to the default.

## Slice I — Act V, "Who Keeps the Book" (Main 21–25) and endings ✅

**Done:** ruleset `classic-og-v2.6-g` (2.6.0-G), now the default for new rounds (`classic-og-v2.6-g/missing-line-act-5.ts`). It adds the `MARA_VENN` contact ("The Clearinghouse"; her room shows a silhouette until she has art). `ML_M20_MAP_IN_THE_MARGINS` is re-issued to open the act.

| # | Chapter (contact) | Work | Scene / choice |
| --- | --- | --- | --- |
| 21 | The Man Who Signed Twice (Blocks) | scout Wino Slums to find him | his two papers |
| 22 | No One Owes Alone (Mama) | scene-led | every account on one table |
| 23 | The Last Appointment (Mara) | scene: her offer | **turn-in:** Accept / Refuse / Ask for the book first |
| 24 | Everybody at the Table (Mama) | 10 beer from the Corner | whose concern goes first (six contacts) |
| 25 | The Missing Line (Mama) | scene: the original book | **ending:** Open / Burn / Keep the Book |

- **Echoes (Slice H):**
  - Mara's opening line answers the M15 stance;
  - the M24 intro answers the M23 answer;
  - the M25 ready line remembers how Mama settled her debt (M18);
  - the M25 closing line is the chosen ending.
- **Choices pay the same:** every M23 and M25 option pays the same and only tilts one contact (+2).
- **Nothing locks:** no unlock, item, cosmetic or specialty reward anywhere, and no non-campaign job depends on the campaign.
- **Stored ending:** the ending is `chosenBranch` on `ML_M25_MISSING_LINE`, a stable server-side key for later content and contact dialogue.
- **Rewards:** $8,500–$15,000 per chapter, $51,000 for the act.
- **Tests:**
  - `missing-line-act-5.test.ts`;
  - `missing-line-act-5.integration.test.ts` plays M21–M22 with the real scout, then **all 3 × 3 combinations** of M23 and M25. Each finishes the campaign, pays exactly the same, records both choices, and shows its own ending in history.

**Plan as written:**


- Add the `MARA_VENN` contact.
- M21 (scene), M22 No One Owes Alone (scene; requires the main clue chain only, never side quests), M23 The Last Appointment (turn-in branch: `MEET_MARA_ACCEPT` / `REFUSE` / `DEFER`), M24 Everybody at the Table (scene), M25 The Missing Line (ending branch: `OPEN_BOOK` / `BURN_BOOK` / `KEEP_BOOK`).
- Finale copy uses Slice H to react to M15, M18, M23, and to whichever side arcs are complete.
- Persist the ending with a stable server-side key so later campaigns and contact dialogue can read it.
- **Done when:** all 3 × 3 combinations of M23 and M25 complete the chain, award equal-power rewards, and keep every specialty open.

## Side-arc slices (each lands after its parent main slice) ✅

**Done (K, L, M, N and O together):** ruleset `classic-og-v2.6-h` (2.6.0-H), now the default for new rounds (`classic-og-v2.6-h/missing-line-side-stories.ts`). It has fifteen `SIDE` quests, `ML_S01`–`ML_S15`, written to the depth standard (work, then the scene; no lessons, no branches) and appended after the 2.6.0-G catalog.
- **Arcs open from their main chapters:**
  - Mrs. Alvarez from M04 and M18;
  - Pip from M06;
  - the apprentice from M08;
  - Wheels' drivers from M07 and M17;
  - the signed pages from M12 and M20. S15 needs both S13 and S14.
- **No gating:** no main chapter depends on a side quest.
- **Optional supply lane:** S5's supply-lane arrival is a bonus only.
- **Finale echoes:** each finished arc changes one finale line of its own, so they combine:
  - Pip: M22 in-progress;
  - the apprentice: M24 ready;
  - Wheels: M24 completed;
  - the signed pages: M25 intro;
  - Mrs. Alvarez: M25 in-progress.

  M22, M24 and M25 are re-issued with only those variants appended.
- **Rewards:** $2,500–$6,000 cash plus 3 contact rep each, $60,000 in all.
- **Tests:**
  - `missing-line-side-stories.test.ts` covers where each arc opens, that nothing gates the main story, the evidence, rewards, and that the echoes combine;
  - `missing-line-side-stories.integration.test.ts` plays all fifteen with the real scout, store, checkout, production and run actions, and checks the finale text picks up every arc at once.

**Plan as written:**


| Slice | Arc | Quests | Branches from | Needs | Notes |
| --- | --- | --- | --- | --- | --- |
| **K** | Pip | S4–S6 | M06 | E | S5's required objective is the scene, with `SUPPLY_LANE_ARRIVED` as a bonus; S6 is `STORE_SELL` + scene. |
| **L** | Tommy | S7–S9 | M08 | E | Store-receipt evidence only; no invented serial tracking. |
| **M** | Alvarez / Mama | S1–S3 | M04 (S1), M18 (S3) | D, G | S1–S2 can ship as soon as D lands; S3 waits for G. Fine to split. |
| **N** | Wheels | S10–S12 | M07 (S10), M17 (S11) | E, G | S10 can ship after E; S11–S12 after G. |
| **O** | Ledger / Blocks | S13–S15 | M12 (S13), M20 (S14) | F, G | S15 requires both S13 and S14. |

For every side slice: side quests never gate the main chain or M22. Each arc contributes at least one finale variant through Slice H; if I has already shipped, add that variant in the same PR.

## Slice J — Story archive, migration, balance, and release

- Story archive view: completed chapters, recorded scene responses, branch choices, and the ending, all read from stored keys and never made up from current stats.
- Migration: players with progress in the old story chain keep their rewards with no duplicate grants; apply the Slice A decision about how the chain hands off.
- Balance review of every campaign reward against the act's power band; confirm branch parity.
- Telemetry: chapter completion and drop-off per quest, scene response distribution, ending distribution.
- Release checklist: new accounts, returning accounts, mid-campaign round change, every ending, with and without side arcs.

---

## Open questions (settled in Slice A)

1. **Campaign vs. current chain:** additive. The current `FIRST_NIGHT_OUT` chain stays; `ML_M01` has no quest prerequisite.
2. **Contacts:** pinned per ruleset. `LEDGER` already exists and is reused; `MARA_VENN` is added with Act V.
3. **Scene responses:** a new `QuestSceneResponse` table (Slice B).
4. **Intercity runs:** no tutorial gate. They need a ready vehicle and road time, which the pilot copy should set up honestly.
5. **Ruleset ids:** one new id per content slice, starting at `classic-og-v2.6-a`.
