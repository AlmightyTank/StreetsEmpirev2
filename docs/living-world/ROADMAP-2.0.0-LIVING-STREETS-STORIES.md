# StreetsEmpire 2.0.0 — Release Roadmap

**Status:** Proposed. Base future implementation on `beta`; see [Living World Master Roadmap](STREETSEMPIRE-LIVING-WORLD-ROADMAP-2.0-2.7.md) for shared policies and dependencies.

## 2.0.0 — Living Streets Stories + Criminal Case Files

### Player fantasy and loop

Cities remember what actually happens. Players stumble into stories while using Scout, Produce, Travel, Stores, Turf, Combat, Contacts or the Event Center; some lead to **Criminal Case Files**, multi-step investigations that reveal new choices. No duplicate stand-alone Quest system: a case is an investigation with evidence, while a job is a contractual objective.

**Loop:** verified event → story invitation → choice or optional case → gather distinct evidence → reveal a lead → settle a branch → city memory, report and possible cosmetic remembrance.

**Example — Detroit Power Vacuum:** An NPC gang retreats from a block. The city produces an *After the Smoke* opportunity. A player may ignore it, inform a contact, or start the *Missing Ledger* case. Clues arise through a legitimate scout action, a contact interaction, and a later encounter. Different conclusions affect modest current-round contracts, contact standing or cosmetic story records; no forced fight, no hidden loss for ignoring the case. A verified city headline can follow publication review.

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.0.0-A** | **Foundation audit & story contract** | Inventory `city-memory`, `random-encounter`, `event-lifecycle`, `black-book`, `street-daily`, and `secret-quest` triggers. Define stable story/case keys, ownership, privacy, pause/expiry, dedup and a ruleset-pinned catalog. **Pass:** no new independent scheduler or duplicate source writer. |
| **2.0.0-B** | **Criminal Case File model** | Cases with `LOCKED/AVAILABLE/ACTIVE/SOLVED/CLOSED/EXPIRED` semantics, ordered clues, distinct verified evidence sources, choice record, progress/read DTO, case archive. **Pass:** claims cannot be forged, duplicated or earned from merely opening pages. |
| **2.0.0-C** | **Living story triggers** | Connect real NPC moves, turf takeovers, business pressure, supply trouble and city conditions to selected event definitions. Apply per-player/city cooldowns and per-round budget. **Pass:** stories feel varied without replacing normal rewards. |
| **2.0.0-D** | **Investigation gameplay** | Clues through existing Scout/Contacts/Travel/encounter actions; link evidence to the source action, show hints and confidence (`rumor`, `likely`, `confirmed`). **Pass:** separate source kinds required, no repeated-action clue farming, no private recon leaks. |
| **2.0.0-E** | **Choices, results & fair rewards** | Short optional branches with explicit costs and predictable categories of outcomes; caps, seeded resolutions when random, one-time grants through reward service. **Pass:** unclaimed/expired optional cases cause no punitive offline losses. |
| **2.0.0-F** | **Immersive player experience** | Black Book gains **Case Files** panel, compact active-case card on Dashboard, action-linked story popups, case timeline and archive; links into Streets Daily/Street Report when verified. **Pass:** mobile, reduced motion, focus, scrolling and deep links work. |
| **2.0.0-G** | **Authoring & admin diagnostics** | Versioned case/story definitions, weighted trigger previews, eligibility explanation, manual non-production test trigger, audit trails and tuning. **Pass:** admin cannot silently create duplicate payoffs or broadcast private case details. |
| **2.0.0-H** | **Balance, migration & launch** | Replay/idempotency, concurrency, time/pause tests, source-visibility matrix, NPC abuse sims, low/high player activity simulation, feature flag and staged beta acceptance. **Pass:** source receipts reconcile and existing 2.0 backbone/older rounds are unchanged. |

### Starter case catalog (proposed content, not promised rewards)

| Case | Trigger | Clue paths | Possible finale |
| --- | --- | --- | --- |
| **Missing Ledger** | Business hit or NPC retreat | Scout + contact + city rumor | Return evidence to a fixer or pursue an optional stash lead |
| **Ghost Shipment** | Confirmed convoy disruption | Travel record + supplier contact + encounter | Locate lost stock or hand intel to a faction |
| **The Fifth Witness** | Recent turf conflict | City history + independent contact + recon band | Reveal the instigator; offer a bounded peace/retaliation story choice |
| **False Colors** | Suspicious takeover pattern | Rival history + encounter + local contact | Expose misdirection and earn a case completion marker |
| **Midnight Signal** | Scheduled city condition | Scout + timed street event | Discover a hidden one-time story opportunity |

**Release definition of done:** Three or more distinct working case chains, one city-dependent story trigger, multiple noncombat resolutions, correct public/private stories, measured variety and server-side one-time settlement. Do not add power creep merely to make a story feel rewarding.