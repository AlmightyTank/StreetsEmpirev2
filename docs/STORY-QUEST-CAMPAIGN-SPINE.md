# StreetsEmpire Story Quest Campaign Spine

**Status:** Narrative and product proposal for the Tutorial & Story Quest Overhaul. This is a new-content direction, not a claim that these chapters are already live.

## The promise

The player is not completing a disguised tutorial. They are taking jobs from people who need something, want something, and sometimes hide the real reason. Each job solves one immediate problem and reveals a larger pressure building across the city. Familiar contacts return with changed attitudes, new leverage, or consequences from earlier choices.

Use Escape from Tarkov as a reference for contact-led pacing, interlocking quest chains, delayed reveals, and a world that opens in layers. StreetsEmpire uses original characters, places, conflicts, and prose.

## Campaign premise: The Missing Line

As the player's crew grows, several contacts report unrelated trouble: a shipment arrives short, a route is exposed, a rival knows where the crew will be, and official pressure lands on the wrong people. Each contact has a plausible explanation and a personal reason to hire the player. Evidence gathered through ordinary jobs suggests that an informal brokerage network is quietly selling access to routes, supplies, and information to the highest bidder.

The network is not an all-knowing conspiracy. Its members trade favors and scraps of information, often without seeing the whole picture. The player becomes dangerous to it by connecting those scraps and building an operation that can act independently.

The central question grows from **“Who took this load?”** to **“Who is selling the city’s routes and pressure?”** and finally **“What will you do with the leverage you uncovered?”**

## Main campaign: From Nobody to a Name

The campaign uses the existing contact catalog and real game actions. A chapter ends with a story reveal and a new lead, not a tutorial lecture. Normal game mechanics are taught by the separate tutorial.

| Act | Working chapter | Contact focus | Story movement |
| --- | --- | --- | --- |
| 1 | **A Small Favor** | Mama | The player takes a modest job to establish the crew. A missing delivery looks like ordinary street loss, but the same destination appears in a second contact’s account. |
| 2 | **Short Count** | Pip | Pip hires the player to trace repeated shortages. The records point to a handoff that happened before the shipment was reported missing. Pip wants the goods back; the player can also preserve the evidence. |
| 3 | **Nobody Moves Alone** | Tommy | Tommy notices that an opposing crew keeps showing up ready for the player’s moves. He wants a response; the player can choose to investigate the leak first. The story can advance on verified recon or a resolved encounter, without requiring a PvP win. |
| 4 | **Pressure Finds a Target** | Vic and Ledger | Heat and legal pressure are landing unevenly. The contacts disagree about whether to buy time, expose a source, or protect their own arrangements. Their advice reveals conflicting motives rather than a single trusted narrator. |
| 5 | **The Long Route** | Wheels | A changed route and a quiet courier connect the shortages to the information leak. The player chooses which lead to share and which contact to keep out of it. |
| 6 | **The Block Keeps Score** | Blocks and the crew | The network's scramble for control reaches local territory. The player decides whether to stabilize the block, force a settlement, or use the conflict to gain leverage. PvP is optional; a safe, verifiable alternative must exist for the main-story proof. |
| 7 | **The Missing Line** | All involved contacts | The evidence identifies the brokers moving information between suppliers, crews, and officials. The contacts want different outcomes, so the player chooses what to reveal, whom to protect, and what leverage to keep. |
| Epilogue | **A Name of Your Own** | Player-led | Each contact reacts to the decision. The city does not reset: a follow-up job, changed contact line, or new board lead shows what the decision changed. Specialty paths remain open. |

Act 5 can open after two of the three investigation leads from Acts 2–4 are complete. The remaining lead stays available and can be finished later. This gives players room to choose an order while preserving the full reveal and every specialty path.

## Choices and consequences

Choices should change what the player learns, which contact trusts them, and how the next scene is framed. They should not silently remove access to gameplay systems, specialties, or important rewards.

- Persist choices and evidence as server-owned quest state with stable keys.
- Make the immediate consequence visible in the next dialogue or job brief.
- Let branches reconverge on shared campaign milestones while preserving distinct contact reactions and epilogue lines.
- Keep reward value and competitive power comparable across choices.
- Avoid false choices: if the system cannot store or display a consequence, do not promise it in the dialogue.
- Do not put core tutorial gates, required features, or permanent progression behind one irreversible branch.

## Jobs should feel authored

Every story job should answer these questions in its own voice:

1. **Who calls?** A named contact with a recognizable voice and relationship to the player.
2. **Why now?** A pressure, debt, opportunity, fear, or personal stake that makes the job urgent to that contact.
3. **What do they say they need?** A clear objective that can be followed without re-teaching the mechanic.
4. **What is really happening?** A clue, contradiction, or complication that advances the larger campaign.
5. **What changes after the job?** A response, new lead, relationship shift, or visible world detail.

An objective may point to the right screen or summarize its requirement. The tutorial owns mechanic explanations and system unlocking. Story jobs should not use “Lesson 1,” require a player to guess hidden requirements, or make a story reward the only way to access a core feature.

## Quest board and completion flow

- Pin the accepted main-story job and its next visible lead at the top of the Quest page.
- Show locked story leads with their actual prerequisite and a direct route to it; distinguish **Story**, **Contact Job**, and **Repeatable Contract** at a glance.
- Each card shows contact, chapter, why the contact needs the player, objective progress, reward, and the next story hook. Keep mechanic hints short and link to the tutorial refresher when useful.
- On completion, show a concise result scene: what the contact says, what evidence or relationship changed, reward status, and the next available lead. Preserve an explicit claim action only where the existing reward contract requires it.
- Keep prior dialogue, chosen responses, and completed jobs in a replayable story archive so the campaign reads as one history rather than a stack of unrelated cards.
- Preserve current quest-page performance goals: load only the active page state needed, avoid fetching the entire history for every navigation, and keep completion feedback immediate and idempotent.

## Growing the story over releases

The campaign should support new chapters without restarting old ones. New releases can add a contact, reopen an unresolved lead, or show the cost of a previous decision. Stable quest IDs, persisted evidence, and an explicit catalog version are required so existing players retain their history.

The first implementation should convert one complete contact arc as a pilot, then connect the other contacts through the shared campaign clues. Existing pinned rounds keep their current quest definitions. New active rulesets receive the revised story catalog only after migration, reward, and return-player behavior are tested.

## Relationship to the tutorial

The tutorial remains the only system for teaching mechanics and gating features. New players follow its guided route; returning players may skip chapters only when they meet clear, verified milestones. Skipping tutorial lessons grants no story rewards or competitive resources. Story jobs assume the mechanic has been taught, while optional job-specific directions explain only what this contact needs done.

See [Tutorial & Story Quest Overhaul Roadmap](./ROADMAP-TUTORIAL-AND-STORY-QUEST-OVERHAUL.md) for the implementation slices, migration requirements, and acceptance criteria.
