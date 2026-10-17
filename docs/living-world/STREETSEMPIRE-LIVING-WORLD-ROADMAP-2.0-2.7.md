# StreetsEmpire — Living World Release Roadmap (2.0.0–2.7.0)

**Status:** Proposed product and engineering roadmap, **not implemented by this document**  
**Planning baseline:** `AlmightyTank/StreetsEmpirev2`, `beta`, reviewed 2026-10-16 (`37470c36d305112ab0c53833dca827f2b276e541`)  
**Target:** Independently reviewable A–G/H slices, feature branches based on up-to-date `beta`, PRs into `beta`, then controlled release.  
**Product promise:** *Every street has a story. Every crew builds a reputation. Every round leaves a legacy.*

## Release map

| Version | Feature release | What players gain | Primary integration |
| --- | --- | --- | --- |
| **2.0.0** | **Living Streets Stories + Criminal Case Files** | City stories, clues, investigations and meaningful choices | First-class events, Black Book, City Memory, Streets Daily |
| **2.1.0** | **Crew Loyalty & Legends** | Memorable named crew, loyalty milestones, veteran stories | Crew roster, specialties, training, Empire Legacy |
| **2.2.0** | **Underworld Operations 2.0** | Coordinated, multi-stage cooperative criminal jobs | Existing Operations, alliances, supply, battle receipts |
| **2.3.0** | **Adaptive Empire Advisor** | Relevant, explainable suggestions about what to do next | Dashboard, quests, player state, holdings |
| **2.4.0** | **Career Storylines** | Narrative identity for five existing careers | Career identity, factions, quests, cosmetic inventory |
| **2.5.0** | **Rivalries & Vendettas** | Rival histories, personal stakes, anti-griefing guardrails | Turf revenge, combat events, City Memory, NPC gangs |
| **2.6.0** | **Empire Profit Intelligence** | Actionable earnings, costs, and route/holding performance | Economy ledger, product markets, business settlements |
| **2.7.0** | **Last Stand: Round Finale** | A dramatic, fair end-of-round series and lasting record | Events, round close, aftermath, legacy, Discord |

## Important repository/version reconciliation

1. `package.json` on `beta` already declares `2.0.0`, and `docs/2.0-STORY-PLAN.md` already describes a **shipped storytelling backbone** (City Memory, Streets Daily draft handoff, prototype cooperative Operation, Black Book intel, Empire Legacy, careers). **2.0.0 here means finishing and branding the Living Streets Stories feature release**, not recreating those components. If a `v2.0.0` release/tag has already been publicly issued, do **not** reuse or rewrite it: keep these names as planning milestones and allocate the next unissued patch/minor version when executing release engineering.
2. Existing `docs/ROADMAP-2.0.0-BEGINNER-JOURNEY.md`, UI-consistency plans, and `docs/ROADMAP-3.0.0.md` are independent plans. Preserve their scopes. In particular, 3.0 Empire Cohesion includes a **law case view**; the Criminal Case Files in 2.0 are **player-owned underworld investigations**, not a second federal-law case engine.
3. Roll Call/login-reward development in PR #298 is independent. Reuse its permanent cosmetic entitlement infrastructure only when appropriate. Do not couple attendance to required story progress, and do not introduce a competing daily scheduler.
4. `beta` contains or plans much of the required infrastructure; a roadmap entry does not assert that an unmerged PR or a feature behind a ruleset has shipped to `main`.

## Core design rules across all releases

- **Reuse authoritative transactions.** A story/case, rivalry, operation, or award reacts to an already settled action. Do not create a competing action resolver, economy ledger, quest scheduler, or event lifecycle.
- **One event and one receipt for each source event.** Stable source IDs and server-side idempotency protect retries, two devices, double taps, parallel claims and job restart.
- **Round pinned and pause aware.** Ruleset definitions and balance are versioned for new rounds. Active/historical rounds keep their rules, expiry and settlement clocks; pause stops round-relative deadlines.
- **Player consent and legible consequences.** Show costs, failure bands where appropriate, deadlines, and reward types before committing. Missing an optional story or being offline cannot silently confiscate cash, turns, inventory, crew or reputation.
- **Power is seasonal, identity can persist.** Permanent profile/legacy/crew-remembrance cosmetics may outlast a round, but competitive bonuses do not. No paid statistical advantage or casino-odds modifier.
- **Fair PvP.** No rewards for attack-spamming one account, multi-account collusion or farming NPC victims; reuse protections and moderation signals. Never disclose private scout, combat, case or account information through public feed summaries.
- **No navigation explosion.** Cases live in Black Book; crew stories in Crew; operations in Operations/Alliance; advice on Dashboard; career stories in Quests/Career; rivalries in existing profile/Turf; profits in Holdings/Dashboard; finale in Events/Aftermath.
- **Responsive, accessible, low interruption.** Shared modal queue for cinematic story reveals; touch-safe controls, stable scroll positions, reduced-motion alternatives, and no overlay that steals controls during casino/game actions.
- **Publish only verified stories.** Streets Daily remains admin-reviewed where required. News, stories and reports derive from persisted facts rather than fabricated game activity.

## Shared technical interfaces (proposed; adapt to real types after Slice A audits)

- A **story definition catalog** with `definitionKey`, `rulesetVersion`, trigger sources, priority/weight, eligibility, allowed branches, deadline policy, reward budget and privacy scope. Integrate with the 1.8.5 first-class event ownership rather than fork it.
- **Narrative instances** point to existing player, city, round and source-event identifiers. Unique `(roundId, sourceEventId, definitionKey, eligibleOwner)` for generated instances; a single authoritative claim state.
- **Case evidence** has `(caseId, sourceKind, sourceActionId, observedAt, confidence contribution, visibility)`, with dedup by distinct verified action source and controlled expiry. Existing Black Book `rumor → likely → confirmed` supplies the vocabulary; raw privileged combat recon stays in its owning service.
- **Player notifications** use the bell/Activity pipeline and existing Street Report orchestration; one notable event may appear in several views but only one reward claim exists.
- **Admin audit tools** support preview, force-test in non-production, pause/retire definitions, explanation of eligibility, source-event replay with no duplicate grant, safe rollbacks, and exportable test metrics.
- **Every mutation** must check ownership, version eligibility, role constraints, active round and server clock; reads should not award, claim or silently settle.

---

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

---

## 2.1.0 — Crew Loyalty & Legends

### Player fantasy and loop

A roster becomes a cast. Crew members already have stable round identities, names, descriptive traits, specialties, XP, training and histories. Extend these records so players remember **who** did the work, not just how many thugs/workers they own.

**Loop:** assign a crew member → complete normal work → earn trust/experience → witness a milestone or personal incident → give an earned nickname → feature that crew legend in the round recap. Keep happiness/upkeep authoritative and separate from loyalty; no mandatory micromanagement.

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.1.0-A** | **Roster identity audit** | Inventory crew assignments, status, stable member IDs, releases, casualty handling, training and history; specify round-vs-account persistence. **Pass:** no lost or phantom crew after roster reconciles. |
| **2.1.0-B** | **Earned loyalty ledger** | Compute understandable loyalty/milestones from verified assignments, defensives, completed jobs and care; add daily/weekly caps and reason history. **Pass:** idle check-ins, reassign spam and paid items cannot farm loyalty. |
| **2.1.0-C** | **Personalities & moments** | Add opt-in crew commentary/incident stories using existing descriptive traits. Tie examples to authentic actions without giving undisclosed combat/math bonuses. **Pass:** personalities do not penalize poor RNG or force daily attendance. |
| **2.1.0-D** | **Mentors & crew bonds** | Optional mentor links for veteran-to-newer members, earned training memories and bounded round progression. **Pass:** benefits, if any, are minor, capped and simulation-tested; no permanent earned power. |
| **2.1.0-E** | **Nicknames & legends** | Earn names such as *Corner Keeper* or *Road Veteran* from factual milestones; archived crew biographies and account-level collectible remembrance artwork where eligible. **Pass:** nicknames can be moderated and archive snapshots cannot resurrect active members. |
| **2.1.0-F** | **Crew UI & celebrations** | Roster detail: job, specialty, training, loyalty history and last major moment; optional celebration overlay. **Pass:** large rosters virtualize/paginate and phones remain performant. |
| **2.1.0-G** | **Admin, balance & release** | Crew event provenance, correction tools, legacy snapshots, economy/combat simulation, abuse tests and migrated legacy-roster fallback. **Pass:** tier changes cannot break staffing or roster counts. |

### Guardrails

- Losing a member can remain emotionally meaningful but must not cause new surprise penalties beyond the existing game rules.
- Avoid permanent stat-carryover, paid loyalty shortcuts or a forced daily bond chore.
- Preserve individual crew history while safely anonymizing/moderating user-authored names.

**Definition of done:** A player can identify at least three genuinely different crew histories in a typical round, recognize how a legend was earned, and find it in the end-of-round Legacy without competitive carryover.

---

## 2.2.0 — Underworld Operations 2.0

### Player fantasy and loop

Make the existing **one-template Corner Takeover** operation system into small, tactical cooperative stories. The current driver/enforcer/intel seat model, invite acceptance, execution and deterministic receipt are the starting point. Do not create a second combat or convoy engine.

**Loop:** discover an operation → review eligibility/cost → reserve roles → gather intel/prepare → execute canonical underlying actions → receive one shared settlement and report.

### Starter operations

| Operation | Existing foundations | Differentiator |
| --- | --- | --- |
| **Stash Recovery** | Scout, supply, NPC encounters | Locate and retrieve known limited inventory; no duplication of product stock |
| **Convoy Protection** | Travel, convoy and crew | Choose escort allocation and route risk before real shipment settlement |
| **Block Defense** | Turf, alliance, combat | Cooperative response to a genuine active threat with bounded rewards |
| **The Big Score** | Contacts, intel, operations | Longer opt-in chain requiring diverse contributions; appearance/legacy milestone, not runaway cash |

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.2.0-A** | **Prototype audit** | Check the Corner Takeover state machine, existing seat invitations, cooldown, payout and idempotency. **Pass:** protect already-started operations. |
| **2.2.0-B** | **Versioned operation templates** | Define mission catalog, role requirements, deadlines, cost/reward budgets and branch outcomes; add a Stash Recovery vertical slice. **Pass:** all item/turn/cash flows reconcile. |
| **2.2.0-C** | **Roles & collaborative preparation** | Invite, accept/decline, lock and release roles with compatible alliance/team rules; clear cancel and expiry behavior. **Pass:** two players cannot claim the same seat; invites never override blocking/privacy. |
| **2.2.0-D** | **Multistage execution** | Add optional intel, preparation and action windows; reuse existing combat, turf, travel and product settlement. **Pass:** retry/late result resolves exactly once. |
| **2.2.0-E** | **Success, partial success & failure** | Explain outcome bands and distinct contribution credits; controlled split payouts and nonfarmable failure reports. **Pass:** solo and groups have reasonable balanced choices, not a mandatory alliance. |
| **2.2.0-F** | **Operation command experience** | Mission cards, ready-state checklist, live seat list, clear countdowns, notifications and cinematic receipt. **Pass:** no navigation/scroll jump after action, mobile role status stays in view. |
| **2.2.0-G** | **Admin, anti-abuse & simulation** | Stalled mission repair, invite/collusion limits, reward caps, traceable state machine, large-load tests and flag-gated release. **Pass:** no deadlocks, stock cloning or duplicate rewards. |

**Definition of done:** At least three distinct new templates plus existing Corner Takeover, with a real multi-player end-to-end test, fair solo alternative, and a fully traceable shared receipt.

---

## 2.3.0 — Adaptive Empire Advisor

Engineering contract: `openspec/changes/empire-advisor-2-3/`. The slice table below stays the product description.

### Player fantasy and loop

After onboarding, give each player a small, useful **next best action** briefing. The advisor recommends opportunities using live, permitted information, not a new AI-driven economy or omniscient enemy radar.

**Loop:** inspect Dashboard → see 1 urgent + up to 2 growth suggestions → tap to navigate with the right focus → complete an action → suggestion disappears or updates.

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.3.0-A** | **Signals & explanation contract** | Audit cash/turns/crew/Heat, verified quest status, stock and city holdings. Define server-permitted eligibility and plain-language reasons. **Pass:** advice cannot infer private enemy data. |
| **2.3.0-B** | **Deterministic recommendation engine** | Priority rules for blocked progress, ready claims, supply shortfalls, safe investments and available contracts; avoid a generative model requirement. **Pass:** every suggestion is reproducible from the player's snapshot. |
| **2.3.0-C** | **Context & suppression** | Cooldowns, dismiss/snooze, new-player prioritization, active-tour deference and dedup across notifications/Street Report. **Pass:** no persistent nagging. |
| **2.3.0-D** | **Dashboard action cards** | 1–3 compact linked cards and explanations of why; use existing deep links and refresh without page reload. **Pass:** open correct page, tab and target on phone. |
| **2.3.0-E** | **Optional planning mode** | Let players focus on money, territory, crew readiness or quests without changing game rules; presets and simple preferences. **Pass:** no auto-spending, auto-attacking, or silent decision execution. |
| **2.3.0-F** | **Outcome evaluation** | Trace suggestion shown/clicked/completed, user dismissals, false positives and goal usefulness without exposing private data. **Pass:** measure utility, not compulsory compliance. |
| **2.3.0-G** | **QA and rollout** | Zero-cash, no-turn, newcomer, maxed-out and paused-round fixtures; ruleset-drift tests; accessible cards, no excess backend queries. **Pass:** advice never recommends an unauthorized or already-closed action. |

**Definition of done:** In realistic fresh, midgame and late-game fixtures, every displayed recommendation is actionable or explicitly labeled informational, and users can silence it.

---

## 2.4.0 — Career Storylines

### Player fantasy and loop

Existing career identities are **Enforcer, Smuggler, Fixer, Business Boss and Intelligence Broker**, mainly presentation/contract filters with a seven-day switch cooldown. Give each identity a narrative chain without creating a dominant build or locking core game systems behind identity.

**Loop:** select existing career → play ordinary game actions → unlock themed chapter → choose a story response → earn profile narration, contact relationships and cosmetic distinctions.

### Career arcs (initial themes)

| Career | Storyline | Core game touchpoints |
| --- | --- | --- |
| **Enforcer** | **The Code of the Block** | Defense, combat, turf restraint vs escalation |
| **Smuggler** | **Roads Without Names** | Travel, suppliers, shipments and risk |
| **Fixer** | **Favors Owed** | Contacts, lawful pressure, faction negotiation |
| **Business Boss** | **Fronts and Fortunes** | Staffing, profitability, expansion and Heat |
| **Intelligence Broker** | **The Quiet Network** | Scout, Black Book, source verification and cases |

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.4.0-A** | **Career audit & content spec** | Preserve career identity/cooldown and existing contract lens; define five arcs with comparable opportunity costs. **Pass:** no gameplay entitlement removed on switching. |
| **2.4.0-B** | **Chapter system** | 3–5 narrative chapters per career tied to verified normal actions, not synthetic clicks. **Pass:** objectives respect existing recipe/district progression. |
| **2.4.0-C** | **Meaningful but fair branches** | Dialog choices lead to different story text, contacts and earned cosmetic recognition; keep expected power/economy equivalent. **Pass:** no must-pick career. |
| **2.4.0-D** | **Shared-world crossover** | Optional case, crew and faction cameos with stable source IDs; never block base cases if a career changes. **Pass:** switching careers preserves history and follows existing cooldown. |
| **2.4.0-E** | **Career rewards & portfolio** | Distinct titles, cosmetic badges, profile moments and end-of-round biography; grants through existing inventory. **Pass:** permanent cosmetic, temporary gameplay resources only when bounded. |
| **2.4.0-F** | **Career story UI** | Current chapter in existing Quest/Career screens; locked step with clear prerequisite; direct links and replayable narrative archive. **Pass:** story-first Quest hierarchy remains intact. |
| **2.4.0-G** | **Editorial, balance & release** | Five-arc completion tests, choice copy review, admin authoring visibility, economy simulations and old-career migration. **Pass:** every career has a completable path without forced PvP. |

**Definition of done:** Every career has a complete introductory arc, one branch, a clear identity reward and a visible record of past choices.

---

## 2.5.0 — Rivalries & Vendettas

### Player fantasy and loop

Players and NPCs remember contested actions, while the game gives rivals a way to write a story rather than just repeat attacks. Reuse Turf Revenge, combat receipts, City Memory, NPC retaliatory memory, block wars and player privacy settings.

**Loop:** meaningful conflict → documented rivalry → escalation or de-escalation choice → limited objective or settlement → round rivalry recap.

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.5.0-A** | **Rivalry source audit** | Define eligible, distinct conflict events and separate mutual rivalry from one-sided targeting. **Pass:** zero credit from chat harassment, losses without participation or self-alts. |
| **2.5.0-B** | **Round rivalry history** | Chronological settled matches, turf flips and material outcomes, with normalized scores and permissioned visibility. **Pass:** no private power/stock location leakage. |
| **2.5.0-C** | **NPC vendetta personalities** | Tie faction/NPC revenge to actual prior conflict, existing aggression and cooldowns. **Pass:** always bounded, defeatable and not unavoidable offline punishment. |
| **2.5.0-D** | **Optional feud contracts** | Limited challenges linked to already legal gameplay actions, plus nonviolent conclusion paths; no extra payout for repeatedly hitting the same target. **Pass:** no harassment incentive or alliance dogpile farming. |
| **2.5.0-E** | **Reconciliation & end states** | Timeouts, ceasefire/story closure, defeated-rival ending and historic archive; clear nonagreement behavior. **Pass:** players can disengage without punitive debuffs. |
| **2.5.0-F** | **Profiles, maps & story cards** | Rivalry timeline in Profiles/Turf and verified public city headlines. Cosmetic record awards for meaningful fair play, not aggression volume. **Pass:** block/mute/moderation respected. |
| **2.5.0-G** | **Moderation, abuse & release** | Alt and target-farming detection, cross-alliance collusion simulation, rate limits, admin suppression and report tools. **Pass:** repeat-target strategy not dominant or profitable. |

**Definition of done:** A fair rivalry can evolve over multiple real encounters, be settled or closed, and show a trustworthy round history without increasing player harassment.

---

## 2.6.0 — Empire Profit Intelligence

### Player fantasy and loop

Move from scattered cash numbers to an understandable **business intelligence layer**. The backend already has ledger and settled sources for businesses, dealers, product sales, supply, travel, loans, stock and city holdings. Read them; do not invent earnings.

**Loop:** view historical period → identify best/worst operation → inspect cost and risk → compare an alternative → take a normal management action and later see its result.

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.6.0-A** | **Metric inventory and source map** | Canonical source per cash flow, attribution to city/route/business, costs vs transfers, refunds/repayments, time cutoff. **Pass:** avoid counting both purchase and transfer as expenses. |
| **2.6.0-B** | **Reconciled reporting projections** | Build indexed read-only totals by source/time/city with clearly labeled incomplete or unknown history. **Pass:** global totals reconcile with ledger within defined rules. |
| **2.6.0-C** | **Profit & efficiency views** | Realized inflows/outflows, estimated net profit, crew or turn efficiency where measurable, stock tied up and Heat/route risk context. **Pass:** explain estimate assumptions and missing costs. |
| **2.6.0-D** | **City and route comparison** | Compare actual historical trip and business results, market pressures and cash tied in holdings. **Pass:** no fake guaranteed future price forecasts. |
| **2.6.0-E** | **Optional financial goals** | Player-configured targets and nonpunitive warnings for liquidity, supply bottlenecks and costly routes; integrate with Advisor. **Pass:** thresholds only, no automated trade. |
| **2.6.0-F** | **Holdings/Dashboard UI** | Profit cards, charts, city filters and drilldown to actual receipts; mobile readable and performant. **Pass:** no new redundant main navigation tab. |
| **2.6.0-G** | **Scale, audits & release** | Reconciliation fixtures, frozen-period tests, high-volume aggregation/load QA, safe backfill and explicit unknown-history handling. **Pass:** no runaway query load or fabricated historic figures. |

**Definition of done:** Players can answer **where their last 24 hours of money came from, where it went and which city/operation performed better**, with an auditable path to receipts.

---

## 2.7.0 — Last Stand: Round Finale

### Player fantasy and loop

Turn the final portion of a round into a memorable closing act, without invalidating months/weeks of prior play. Use the existing first-class event lifecycle, Round Aftermath, City Memory, Empire Legacy and Discord recap. Do not introduce a parallel finale clock or separate leaderboard math.

**Loop:** final-week announcement → optional earned final contracts, last city moments and alliance challenges → clear countdown → one canonical close → personal and city cinematic recap → permanent cosmetic/historical record.

### Slices

| Slice | Name | Deliverable and acceptance |
| --- | --- | --- |
| **2.7.0-A** | **Finale window contract** | Compute configurable end window from actual round duration and pause-aware server clock; coexist with quarter-round and Roll Call events. **Pass:** short rounds and shifted end times never create negative windows. |
| **2.7.0-B** | **Finale story chapters** | Three themed windows (opening call, pressure rises, closing hour) are presentation/mission chapters backed by existing events and city memory. **Pass:** no hidden income boost to late entrants. |
| **2.7.0-C** | **Last Stand objectives** | Mix solo tasks, alliance contributions, turf defense, trade and NPC challenges with equivalent paths and contribution floors. **Pass:** no forced PvP or mandatory massive alliances to enjoy finale. |
| **2.7.0-D** | **Live highlights & standings** | Verified public moments, final-rank snapshots and city milestones with conservative freshness labels. **Pass:** rankings remain authoritative and historical events cannot be rewritten. |
| **2.7.0-E** | **Rewards & unique cosmetic keepsakes** | Cosmetic-only final-event rewards (e.g., Last Stand profile frame, legacy plaque, backdrop or crew remembrance); no permanent combat/economy buffs. **Pass:** Roll Call's final-exclusive shell+crew set stays independent and claim-once. |
| **2.7.0-F** | **Closing experience** | Optional cinematic moment, Downtown Newspaper cover, player highlight reel and deep links to complete Aftermath/Discord recap. **Pass:** no duplicate recap facts or reward claims. |
| **2.7.0-G** | **Operations and launch QA** | Admin preview/test for nonproduction, paused/delayed close and timestamp boundaries, load/collusion tests, fallback for low-population rounds. **Pass:** round close remains atomic and final receipt immutable. |

**Definition of done:** A solo player and an alliance member can both experience the closing act, receive accurate recap/eligibility and claim at most one award per earned milestone; the final close remains safe and reproducible.

---

## Dependency path and implementation order

```text
1.8.5 unified event system ─┐
2.0 existing story backbone ├──> 2.0 Living Streets + Cases ─┬──> 2.4 Career Storylines
NPC gangs + Black Book ─────┘                               └──> 2.5 Rivalries

1.7 crew roster/training ──────────> 2.1 Crew Loyalty ────────> 2.2 Underworld Operations
Existing operations + alliances ─────────────────────────────> 2.2 Underworld Operations

Dashboard + quest progress ─────────> 2.3 Empire Advisor <──── 2.6 Empire Intelligence
Economy ledger + Holdings ─────────> 2.6 Empire Intelligence

1.8.5 Events + Round Aftermath + Empire Legacy + verified story records ──> 2.7 Last Stand
```

- Every feature should have an independently playable vertical slice early in its release, with stable final API/DTO contracts and source receipt assertions before polish.
- **1 active source of truth** for event/case/contract/award state. Avoid multiple jobs advancing the same objective.
- Beta deployments are explicit and gated. Separate migrations from app rollout where additive fields/data need safe expansion; rollback can disable future triggers but must never delete already-settled gameplay.

## Common release checklist

Each version's last slice requires:

1. **Schema/ruleset compatibility:** additive migrations, documented ruleset pins, active and historical round tests, backfill where needed, and rollback by disabling future activation rather than deleting audit history.
2. **Server correctness:** ownership/auth, unique event keys, transaction lock order, idempotent POST/claim/award endpoints, safe retries, pause-aware deadlines and stress-tested concurrency.
3. **Balance/abuse:** simulate low-population vs full-city play, first-week vs endgame, solo vs alliance, new vs rich players, NPC-bot activity, AFK gaps, and exploit/economy feedback loops.
4. **UI acceptance:** 360/390/768/1024/1440/1920 widths, keyboard navigation, focus order, screen readers, reduced motion, safe-area bottom controls, no scroll-to-top regressions, themed shells and cosmetics.
5. **Admin/ops:** permission checks, audit events, safe testing, tunable spawn/award parameters, metrics, rollout toggles, feature documentation, playable QA fixtures and alarms for stuck flows.
6. **CI:** Prisma validation, workspace typecheck, relevant Vitest suites, browser smoke tests, `qa:release` and load simulations on an actual migrated beta-like DB when required.
7. **Source quality:** cross-check actual backend types/DB columns before implementation. Feature names, proposed fields, starter cases and sample cosmetic names in this roadmap are **design proposals**, not assertions that live schemas already contain them.

## Suggested PR and documentation convention

- Feature branches: `feature/2-0-living-streets-a`, `feature/2-1-crew-legends-a`, etc., branched from freshly synced `beta`.
- One reviewable PR per slice to `beta`; require tests and resolution of Codex/reviewer comments. Merge only after compatibility and CI gates.
- Suggested docs: `docs/ROADMAP-2.0.0-LIVING-STREETS-STORIES.md`, `docs/ROADMAP-2.1.0-CREW-LOYALTY.md`, etc., plus this master index. Existing 2.0 and 3.0 roadmaps remain untouched unless explicitly reconciled in a later PR.
- Implementation starts with **2.0.0-A**, which explicitly inventories the already-shipped story backbone and names what remains, preventing a second redundant system.