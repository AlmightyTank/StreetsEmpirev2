# StreetsEmpire Tutorial & Story Quest Overhaul Roadmap

## Vision

Make learning the game clear and gradual, while making quests feel like ongoing stories in a living city. The tutorial becomes the single authoritative system for teaching mechanics and unlocking gameplay. Quests become contact-led jobs about relationships, pressure, ambition, and consequences.

Use the grounded, contact-driven mission feel the project admires in Escape from Tarkov as inspiration. All StreetsEmpire characters, dialogue, plots, locations, and presentation remain original.

## Product rules

1. **Tutorial teaches; quests tell stories.** No core mechanic should require a story quest to explain it.
2. **The tutorial gates systems for every player.** New players follow the guided path. Returning players can skip lessons by meeting clear, visible milestones.
3. **Teach in the real game.** Tutorial steps take players to the actual screen, let them perform the action, and explain only what they need at that moment.
4. **Quests remain meaningful after the tutorial.** Jobs can assume unlocked mechanics, but their objectives and stakes must be understandable.
5. **Preserve useful content.** Audit existing contacts, quest chains, prerequisites, rewards, and completion state before rewriting. Keep or adapt viable material; do not discard progression without a migration plan.
6. **Keep the tutorial calm and focused.** Introduce one main decision or mechanic at a time. Optional systems can wait until their milestone.
7. **Avoid power advantages from skipping.** Skip paths grant access and lesson completion only; they do not grant extra resources or competitive rewards.

## Player experience

### New player

Create their identity by naming the crew, choosing its color, and creating a custom street-name sign. Then learn the core loop through a short sequence of real actions: understand the dashboard and turns, take an introductory job, scout, manage supplies, and grow the operation. Additional systems appear only as the player reaches their readiness milestones.

### Returning or experienced player

See a concise map of tutorial chapters and each chapter's unlock requirement. They can complete a chapter normally or use **Skip ahead** when they meet its milestone. The system records skipped chapters as completed for access purposes and offers an optional refresher without blocking play.

### Story quest player

Meet contacts with distinct voices, motives, and ongoing problems. Jobs connect across chapters, respond to previous outcomes where practical, and reveal the city through the player's work. Brief job-specific instructions may explain the objective, but core mechanics are taught by the tutorial.

The proposed growing campaign is **The Missing Line**: 25 connected main-story quests and 15 side-story quests follow an apparently local missing-shipment problem into a citywide debt market selling routes, supply access, and information. Investigation leads can be pursued in different orders; side arcs follow characters and close loose ends; the final choice changes relationships and the epilogue. See the [25-main / 15-side Story Quest Campaign](./STORY-QUEST-CAMPAIGN-SPINE.md) for the full act-by-act story treatment and prose sample. Choices do not lock specialties, and tutorial teaching remains separate.

## Slices

### Slice A — Audit and system boundary

- Inventory the existing guided tour, the 12-mission **From Nobody to Boss** journey, all tutorial-like quests, contact chains, and current unlock logic.
- Tag each quest: tutorial lesson, story job, hybrid, repeatable contract, seasonal/event content, or obsolete.
- Record prerequisites, rewards, branches, activity tracking, player completion state, and any gameplay rules currently taught only by quests.
- Define the canonical tutorial state and the canonical story-quest state; identify migration needs.
- Deliverable: an audit and conversion map showing what moves, stays, is rewritten, or is retired.

### Slice B — Tutorial progression and skip rules

- Extend the existing guided tour and **From Nobody to Boss** plan; do not create a competing onboarding flow.
- Define chapter objectives, system gates, milestone evidence, return-player skip behavior, resume behavior, and accessibility/mobile requirements.
- Ensure tutorial state is durable across sessions and round transitions according to the game's existing progression rules.
- Make locked systems explain what chapter or milestone opens them and how to complete or skip it.
- Deliverable: approved tutorial chapter and unlock specification, including migration behavior for existing players.

### Slice C — Tutorial foundation and first-session path

- Implement identity setup: crew name, color, and street sign.
- Present a focused first-session route through dashboard, turns, first job, scouting, supplies, and the basic operation loop.
- Teach on the relevant screens using concise prompts, highlights, and objective tracking.
- Add pause, resume, replay, and optional refresher controls.
- Deliverable: a complete playable opening tutorial with progress persistence.

### Slice D — Gradual system unlocks

- Add milestone gates for the next systems in the agreed progression order, such as production/stores, recruitment/equipment, Heat, Hideout, travel, raids, and later territory or advanced operations.
- Verify each gate against actual server-side action permissions and navigation visibility; hiding a tab alone is not a gate.
- Provide a visible unlock preview and a direct route to the required lesson.
- Implement experienced-player skip milestones without granting resources, story rewards, or competitive power.
- Deliverable: consistent tutorial gates and skip-ahead behavior across UI and server actions.

### Slice E — Story framework and first contact arc

- Define story-quest structure: contact profile, voice, motive, current pressure, job brief, objective, outcome, follow-up hook, and rewards.
- Separate story text from mechanic help so jobs stay readable and narrative-led.
- Select one contact and convert a small connected chain as the pilot; retain compatible prerequisites and rewards.
- Add meaningful but bounded choices where existing systems support them; do not promise branching consequences the game cannot persist.
- Deliverable: one end-to-end original contact arc that assumes tutorial-taught mechanics.

### Slice F — Quest conversion and content tools

- Convert remaining tutorial-like quests into tutorial steps or remove their teaching text from story jobs.
- Rewrite and reorganize existing contact quests into connected arcs, preserving strong premises and usable content.
- Review quest page labels, availability states, follow-ups, and tracked-job navigation so tutorial lessons and story jobs are unmistakable.
- Add authoring validation for missing prerequisites, unreachable jobs, broken follow-ups, unclear objectives, and invalid rewards.
- Deliverable: converted core contact content and reliable quest authoring checks.

### Slice G — Migration, balance, and release

- Migrate existing players without resetting completed quest rewards or duplicating grants.
- Map players who completed old tutorial quests to equivalent tutorial milestones where evidence exists; provide a fair skip path where it does not.
- Test new accounts, returning accounts, interrupted/resumed tutorials, skipped chapters, round changes, and quest chains with existing progress.
- Review resource and competitive rewards to ensure skips and tutorial completion do not create an exploit or material advantage.
- Measure tutorial drop-off, time to first meaningful action, support confusion, and story-quest completion; use results to tune pacing.
- Deliverable: release checklist, migration report, balance review, and follow-up content plan.

## Suggested chapter order

1. **Make Your Mark** — crew name, color, custom street sign, dashboard orientation.
2. **Learn the Streets** — turns, first job, scouting, cash, and supplies.
3. **Build Your Operation** — production and stores, then recruitment and equipment.
4. **Hold It Together** — Heat, Hideout, and managing risk.
5. **Reach Beyond the Block** — travel and city systems.
6. **Make Your Move** — raids and crew readiness.
7. **Take Control** — City Blocks/Turf, alliances, and advanced operations.

The exact gates should be confirmed against current mechanics during Slice A. The sequence is a design proposal, not a claim about current implementation.

## Acceptance criteria

- A new player can learn the core loop without completing a story quest for instruction.
- A returning player can understand each gate and skip ahead through explicit milestones.
- Locked systems show a useful requirement and a direct next step.
- A skipped tutorial chapter does not award resources or competitive advantages.
- Story quests read as jobs from people with motives, not disguised tutorials.
- Existing quest progress and rewards are preserved or deliberately mapped with an auditable migration.
- Tutorial state, quest state, unlock state, and server authorization agree across desktop and mobile.
- The first contact pilot is playable from introduction through follow-up before the full quest catalog is converted.
