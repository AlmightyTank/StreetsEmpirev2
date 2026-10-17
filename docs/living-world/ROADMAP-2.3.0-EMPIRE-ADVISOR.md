# StreetsEmpire 2.3.0 — Release Roadmap

**Status:** Proposed. Base future implementation on `beta`; see [Living World Master Roadmap](STREETSEMPIRE-LIVING-WORLD-ROADMAP-2.0-2.7.md) for shared policies and dependencies.

**Engineering contract:** `openspec/changes/empire-advisor-2-3/` (proposal, design, `advisor-signals`, `advisor-recommendations`, `advisor-suppression`, `advisor-dashboard`, `advisor-planning`, `advisor-evaluation`, tasks). This roadmap stays the product description.

## 2.3.0 — Adaptive Empire Advisor

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