# StreetsEmpire — The Street Report Roadmap

> **Status:** Planned; documentation only. **Branch target:** `beta`. **Release:** Player-experience milestone TBD (do not renumber 1.8.5).
>
> **Companion:** [Streets Daily newspaper](ROADMAP-STREETS-DAILY.md)  
> **Dependency:** [1.8.5 unified events](ROADMAP-1.8.5.md)

## Vision

**"The streets didn't stop while you were gone."**

When a player signs in or returns after inactivity, show a personal, actionable **Street Report**: what actually changed for their empire while they were away, what matters most, and where to go next. This is not another quest page or a dump of every notification. It is a compact intelligence briefing, generated from authoritative events and state deltas with no speculative outcomes.

The personal report and public Streets Daily use a shared **read-only news/event projection** where practical, but have separate audience filters and UI: private player data must never leak into the public paper.

## User experience / scope

- **On return:** polished, centered briefing modal on desktop and a scrollable bottom sheet/full-screen modal on narrow mobile screens. Never obscure an active action or fire mid-transaction.
- **Tone:** noir / crime-empire intelligence from the player's crew; concise copy without fabricated gameplay. Example: "Boss, here's what went down."
- **Header:** time since last meaningful activity; concise counts of combat alerts, resolved activities, and relevant updates. Counts and deltas must be derived from real records.
- **Priority section:** attacks, lost turf, high-priority defense changes, time-sensitive eligible claims, important alliance developments; exact affected place, timestamp, and a direct "View ..." action.
- **Sections:** Turf & Combat; Crew & Business; Quests / Progression / Street Pass; Alliance & Social; Casino & Sportsbook settlements; City Events & Encounters. Include a category only if its corresponding event producer really exists and offers reliable data.
- **Actual before/after differences:** cash, XP, respect, holdings, crews, etc. only when valid starting/ending snapshots exist and attribution is clear. Don't imply all changes were passive income.
- **Readable length:** show roughly 5–8 high-priority entries first, collapse routine duplicates into summaries (e.g. "4 operations completed"), and offer **View full report**.
- **Navigation:** direct links take the player to the affected game page or event detail and never silently claim rewards or start attacks.
- **Recoverability:** dismiss, reopen from Dashboard and notification bell, and read archived reports. Dismissal does not dismiss unrelated notifications.
- **Optional flavor:** a brief crew voice-over line drawn from safe fixed text templates, which can be muted/disabled.
- **Empty state:** no blocking modal for new accounts, short returns with no useful events, or a fully caught-up session.

## Return / idle policy (tunable defaults)

| Absence | Experience |
| --- | --- |
| Under 15 minutes | No automatic report; notifications remain available. |
| 15–60 minutes | Show a compact report **only** if important new facts exist. |
| 1–6 hours | Show a full report if relevant new facts exist. |
| 6+ hours | Show a complete priority-first briefing with expandable timeline. |

- Measure **meaningful activity** server-side (not simply an open tab). Use page visibility/focus and inactivity detection only to request a report; neither the client clock nor tab focus is the authority for elapsed absence.
- Cover fresh authentication, session resume after a hidden tab, and return after true input inactivity; debounce focus/visibility churn and define one canonical session for multiple open tabs.
- Track a durable **last-consumed event cursor / delivered-through watermark**, not only `lastLoginAt`; authentication alone must not erase the missed interval.
- Prefer event IDs + ordered timestamps + stable tie-breaker, and persist delivery/ack states with a short retention policy. Multiple devices should not replay the same modal after acknowledged viewing. A report may still be accessible in history.
- First login / newly approved beta player: establish a baseline without surfacing legacy account or system-wide events.
- Don't auto-open during onboarding, active raids, encounter choices, casino spins, form submission, modal dialogs, or crucial combat actions. Queue it until the interaction is safe.
- If a **major raid/drive-by combat alert** is also queued, show the dramatic combat alert first; then the Street Report **once**. A triggered **random encounter choice** maintains its correct priority and expiration. Never stack modals.
- All intervals and decisions use server time and proper round identity. Round rollovers, paused rounds, or daylight-saving changes must not corrupt the gap calculation.

## Source of truth / delivery architecture

1. Inventory existing activity feed, in-app notifications, battle/raid resolution, turf history, crew jobs, store ledger, quests/achievements, settlements, and the 1.8.5 first-class event receipts. Build an **event coverage matrix** marking authoritative, missing, and future producers.
2. Emit or adapt immutable, stable-ID **reportable facts** from committed gameplay outcomes. Example envelope: `eventId`, `roundId`, `occurredAt`, `audiencePlayerId`, `kind`, `severity`, `entityId`, `deepLink`, `sourceId`, and privacy-safe structured display payload. Do **not** create duplicate awards or simulate gameplay on a read.
3. Query using round + player + cursor bounded by an indexed time/event key. Aggregate repetitive facts; cap query cost and the number of display items, and provide pagination/continuation for the full timeline.
4. The authoritative backend computes prioritization and unread state; client renders existing facts, not balances based on optimistic or client-side math.
5. Implement `GET /api/.../street-report/preview` and delivery/ack/history contracts with auth and player scoping (final route names follow existing API conventions). Distinguish `shown`, `acknowledged`, and `actedOn`; automatic preview does not consume the cursor.
6. Idempotent cursor acknowledgement and report snapshot IDs avoid repeat presentation, cross-device race duplication, and flicker after refresh. Keep notification read state independent.
7. Security/privacy: player can see only their own private events and authorized alliance-level events. Never show another player's secret activity, hidden encounter rolls, unrevealed scouting, or confidential staff tools.
8. Reuse current accent-color theme, design tokens, notification layers, scroll restore, and accessible focus management rather than creating a separate disconnected popup framework.
9. Graceful degradation: a failed category fetch must not block login, and the report can render partial trustworthy data with a retry affordance.

## Implementation slices

| Slice | Focus | Deliverable |
| --- | --- | --- |
| **SR-A — Data & Coverage Audit** | Inventory producers, source of truth and privacy | Document coverage matrix, severity classification, reusable event contract, data gaps, and baseline/round-scoping strategy; no redundant second event engine. |
| **SR-B — Session Return Detection** | Activity watermark and idleness | Server-side last-meaningful-activity and cursor fields, tab/focus debounce, multi-tab/multi-device semantics, default thresholds, no-popup new-account baseline. |
| **SR-C — Report Service & Aggregation** | Authoritative facts | Read-only report assembly, grouping/priorities, batched/indexed queries, cursor-safe delivery/ack/history, capped payload, concurrency and auth checks. |
| **SR-D — Street Report UX** | Desktop and mobile briefing | Noir-theme report modal with hero summary, priority banner, event cards, counts, empty state, accessibility, visual polish, and open/dismiss/reopen affordances. |
| **SR-E — Integration & Actions** | Connect real gameplay | Turf, raid/combat, crew, quests/progression, alliance, resolved sportsbook/casino, and 1.8.5 events as each producer is verified; deep links and archive. |
| **SR-F — Popup Orchestration & Settings** | Coordinate interruptive experiences | One modal queue shared with major raid alerts and random encounter choices, safe suspension/defer, player popup preferences, reduced motion, and report archive controls. |
| **SR-G — QA, Telemetry & Release** | Confidence and rollout | Event coverage tests, delivery/dedup races, performance, accessibility, localization-safe timestamps, beta feature flag, admin diagnostics, staged release and rollback notes. |

## Event priorities and integration boundaries

1. **Interruptive required decision**: already-triggered encounter choice with expiry / any mandatory existing flow. Keep the original gameplay contract.
2. **Critical battle alert**: major raid, drive-by or confirmed important combat outcome; dedicated alert presentation if enabled.
3. **Street Report**: one collected summary after the above, never more than once per return cycle.
4. **Routine toasts/notification bell**: non-blocking and preserved.

The user may disable automatic **Street Report** display while leaving manual retrieval and critical gameplay alerts intact. Do not hide real pending encounter choices inside the report or reopen consumed ones. The report may summarize the outcome of an encounter **only if it actually resolved** while the player was away.

## Data integrity / economy guardrails

- **No offline simulation, punishment, or bonus** caused by opening/ignoring the report; it is presentation only.
- **No duplicate claims, payouts or credit** caused by replays, pagination, retries, browser refreshes or cross-device acknowledgement.
- Distinguish **resolved** bets from open bets; show settled results only where actual sportsbook data exists.
- Respect 1.8.5's single source of truth for community, seasonal, random encounters and city conditions.
- Never treat a still-running crew job, open quest, or pending bet as completed.
- Show explicit labels for *available to claim*, *expired*, *resolved*, and *already claimed*; validate at action time.
- Protect privacy and avoid spoiling hidden game mechanics (odds, random seeds, opponents' undisclosed operations).
- Use fixed, audited copy templates rather than free-text player-controlled headlines.

## QA and acceptance criteria

- A brand-new account and 10-minute return **do not get an unwanted popup**.
- A 30-minute return with a meaningful attack gets one **compact** actionable report; 2-hour and overnight returns with news get full reports.
- Real events carry correct round, target, source, server timestamp and destination; summaries reconcile against existing audit/ledger records.
- Repeat sign-in, multi-tab focus, network retries, and two devices never duplicate the same shown-and-acknowledged popup; report history remains accessible.
- During a simultaneous raid alert and report, **raid alert is first**, report comes next, and no two modal layers overlap.
- Optional encounter expiry does not become retroactive damage or a fake resolution; no bonus can be farmed through viewing.
- Clicking "View Turf"/"Claim Quest"/"View Settlement" lands on the correct existing route and does not unexpectedly scroll to top or auto-claim.
- No account data leaks across player identities, round boundaries, or permission changes.
- Report supports mobile safe areas, keyboard focus trap/restore, Escape/dismiss, screen reader headings, and reduced motion.
- Query performs acceptably with high-volume histories; missing producers or outages degrade gracefully.
- Staff-only beta preview can inspect **their own or explicitly permitted synthetic reports** without accessing arbitrary private player information.

## Dependencies and sequencing

Implement **SR-A → SR-B → SR-C → SR-D → SR-E → SR-F → SR-G**. Integration adapters may ship incrementally; do not delay launch for future feature producers that don't exist. Treat [Streets Daily](ROADMAP-STREETS-DAILY.md) as a separate **public editorial consumer** of eligible shared facts, not as the Street Report's public copy.

**Definition of done:** a returning player immediately understands verified empire changes, can act on urgent matters, and is never spammed, spoiled, or charged for reading a summary.
