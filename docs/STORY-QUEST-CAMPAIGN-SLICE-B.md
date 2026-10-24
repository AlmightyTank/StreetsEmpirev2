# The Missing Line — Slice B: Story-Scene Engine (contract)

**Status:** implemented on the server. No player-visible change yet: no shipped quest has scenes, and the quest card UI is Slice C. Built on the decisions in the [Slice A contract](./STORY-QUEST-CAMPAIGN-SLICE-A.md).

## Authoring a scene (rulesets package)

Scenes live on the quest's story copy (`QuestStoryDefinition.scenes`, in `packages/rulesets/src/types.ts`):

```ts
story: {
  chapter: 'Act I', intro: '…', inProgress: '…', ready: '…', completed: '…',
  actionHint: 'Hear what Mrs. Alvarez remembers.',   // `lesson` is now optional; story jobs omit it
  scenes: [{
    key: 'alvarez_statement',                         // lower_snake, unique in the quest, never renamed
    title: 'The woman at closing',
    prose: '…',
    after: ['pip_sale'],                              // optional: required objective ids that must be done first
    responses: [
      { key: 'show_receipt', label: 'Show her the receipt', outcome: '…' },
      { key: 'ask_who_collected', label: 'Ask who took the money', outcome: '…' },
    ],
  }],
},
objectives: [
  { id: 'statement_taken', kind: 'EVENT_COUNT', description: 'Hear Mrs. Alvarez out.', target: 1,
    params: { eventTypes: ['QUEST_STORY_SCENE'], where: { questKey: 'ML_M02_SMALL_FAVOR', sceneKey: 'alvarez_statement' } } },
],
```

`storySceneProblems` (wired into `questDefinitionProblems`, so `defineQuestCatalog` throws at build time) enforces:

- scene and response keys are lower_snake and unique; title, prose, label, and outcome are non-empty; each scene has at least one response;
- every `after` id names one of the quest's **required** objectives, and `after` chains can't form a cycle;
- a scene objective is `EVENT_COUNT`, target 1, counts only `QUEST_STORY_SCENE`, and filters on **its own** `questKey` plus a `sceneKey` that exists on the quest. The `questKey` filter means two quests can reuse a scene key without crediting each other;
- every scene is counted by at least one objective (required or bonus).

## State

| Store | Shape | Purpose |
| --- | --- | --- |
| `QuestSceneResponse` (new table) | `playerQuestId`, `sceneKey`, `responseKey`, `createdAt`; `@@unique([playerQuestId, sceneKey])` | One answer per attempt and scene. Read by the quest DTO now, and by branch-aware copy (Slice H) and the story archive (Slice J) later. |
| `ActivityType.QUEST_STORY_SCENE` (new enum value) | Payload `questKey`, `title`, `attempt`, `sceneKey`, `sceneTitle`, `responseKey` | Feed line ("Made your choice in …"), console "progress" group, and the quest-progress event. |

Migration: `prisma/migrations/20261220000000_quest_story_scenes`.

## Server

- **Endpoint:** `POST /api/game/quests/:key/scenes/:sceneKey` with body `{ responseKey }` (`questSceneResponseSchema`). Returns the quest page.
- **Rules** (`apps/server/src/services/quest-story-scene.service.ts`, run inside one transaction holding the round player's lock):
  1. The quest and scene must exist in the round's pinned ruleset, and the response must exist in the scene (`SCENE_NOT_FOUND`, `SCENE_RESPONSE_INVALID`).
  2. The player's latest attempt must exist (`QUEST_NOT_FOUND`).
  3. Repeating the recorded answer is a no-op; a different answer is refused (`SCENE_ALREADY_ANSWERED`).
  4. The attempt must be `ACTIVE` or `READY_TO_TURN_IN` and not expired (`QUEST_NOT_ACTIVE`, `QUEST_EXPIRED`), and every `after` objective must be complete (`SCENE_NOT_AVAILABLE`).
  5. It writes the response row and the activity, then calls `QuestProgressService.emit` with source key `quest-scene:<playerQuestId>:<sceneKey>`. That key is deterministic, so the event can only be credited once per attempt.
- **Abandon and admin reset** clear the attempt's scene responses along with its progress receipts, so a re-taken job plays its scenes again.
- **DTO:** `QuestStoryDto.scenes[]` gives `key`, `title`, `prose`, `responses` (key and label only), `available` (can be answered right now), and `response` (key, label, outcome once answered; otherwise null). Outcomes stay hidden until answered. Responses are loaded in one query per page or tracked read, and only for rows whose quest has scenes.

## Tests

- `packages/rulesets/src/__tests__/story-scenes.test.ts`: validator rules, including a quest with no lesson text, `after` ordering, cross-quest filters, orphans, and cycles.
- `apps/server/src/services/__tests__/story-scenes.integration.test.ts` (`STORY_INTEGRATION=1`, PostgreSQL, with a test-only ruleset registered for the suite):
  - the happy path to ready, claim, and history;
  - refusals before accepting;
  - unknown scene, response, or quest;
  - an `after` scene closed until a Pip sale;
  - repeat-same no-op and changed-answer refusal;
  - five concurrent submits giving one response, one activity, and one receipt;
  - abandon and re-take with a new answer;
  - ruleset pinning.

## Left for Slice C

The web quest card doesn't render scenes yet. It still draws an empty **Lesson** block for a story job without a lesson. Slice C renders `story.scenes`, posts to the endpoint above, and hides the block when `lesson` is absent.
