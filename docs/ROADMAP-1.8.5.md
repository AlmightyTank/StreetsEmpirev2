# StreetsEmpire 1.8.5 — City in Motion

## Purpose

Build on the 1.8 events direction by making the city feel active during ordinary play. Actions can surface personal or crew encounters, while occasional citywide conditions create shared opportunities and objectives.

**The question:** What changes from one week or season to another, and how can a player respond without being ambushed by unfair or opaque penalties?

## Design principles

1. **Events create choices.** Every event explains its trigger, available options, possible outcomes, and deadline before the player commits.
2. **No hidden turn costs.** An encounter does not silently consume turns or charge the player. Any optional cost is shown before confirmation.
3. **No offline punishment.** Expired offers close cleanly; they do not create debt, heat, lost crew, or missed-payment style penalties.
4. **Server authority.** Selection, eligibility, cooldowns, rewards, and settlement are checked and recorded on the server.
5. **Transparent city rules.** City conditions show their duration and affected actions or districts. Effects are bounded and do not stack without a clear cap.
6. **Protect fair competition.** Rewards favor useful but bounded resources, recognition, and cosmetics over permanent competitive power.
7. **Respect round state.** Paused rounds do not advance event timers, triggers, or settlements through read requests.

## Current foundation

The beta has been expanding random encounters across Scout, Produce, Travel, Stores, Turf, and Combat. Slice A should audit and standardize the existing action hooks, trigger odds, receipts, and pause behavior before expanding event volume. Existing action-specific rates are tuning inputs, not permanent guarantees.

The sportsbook is tracked separately in [ROADMAP-SPORTSBOOK-1.8.0.md](ROADMAP-SPORTSBOOK-1.8.0.md). It remains a distinct casino feature with its own provider, quota, and settlement release gates.

## Proposed slices

| Slice | Theme | Outcome |
| --- | --- | --- |
| **1.8.5-A — Event Engine Hardening** | Make encounters safe and consistent | Audit existing triggers; standardize event definitions, eligibility, weighted selection, cooldowns, duplicate protection, action idempotency, pause safety, and outcome records. |
| **1.8.5-B — Event Inbox & History** | Make event state easy to understand | Present pending choices, deadlines, receipts, results, and history in one responsive player-facing view. Explain why an event is unavailable or has expired. |
| **1.8.5-C — Street Opportunities** | Deepen action-based encounters | Tune and round out opportunities attached to Scout, Produce, Travel, Stores, Turf, and Combat. Keep the odds low enough that normal gameplay remains the main loop. |
| **1.8.5-D — Crew Moments** | Give crew identity a gameplay role | Let relevant crew specialties or assignments unlock an option or modestly shape an outcome. Keep this as a readable group-management benefit, not a second character simulator. |
| **1.8.5-E — City in Motion** | Add shared, time-limited conditions | Introduce conditions such as a product shortage, festival, trader shipment, crackdown, or economic boom. State who is affected, when it ends, and what actions change. Bound modifiers and prevent harmful combinations. |
| **1.8.5-F — Event Chains & Season Goals** | Connect moments into longer stories | Add optional follow-up events and limited seasonal objectives. Show progress and deadlines clearly; missing or declining an objective has no punitive side effect. |
| **1.8.5-G — Admin, Balance & Release** | Make content operable and measurable | Add safe event enable/disable and tuning controls, audit logs, outcome metrics, economy simulations, accessibility checks, mobile QA, and release verification. |

## Event examples

### Personal or action encounters

- A buyer offers a limited order after a successful produce run.
- A trader tip reveals a short-lived opportunity on the travel route.
- A store delivery opens a small, optional bulk-purchase window.
- A turf patrol spots a temporary opening that can be taken or ignored.
- A combat aftermath presents a choice about recovering a bounded reward.

### Crew moments

- A driver specialist opens a safer route choice during travel.
- A lookout recognizes a low-risk opportunity during scouting.
- A mechanic improves the result of a vehicle-related event.
- An enforcer changes the available response to a turf or raid encounter.

Crew specialties should shape options or small modifiers, not guarantee wins.

### City conditions

- **Product shortage:** affected goods become less available in named markets for a visible window.
- **City festival:** selected districts have more activity and a temporary objective.
- **Trader shipment:** a public shipment creates a contest or contract with capped rewards.
- **Police crackdown:** affected actions display increased pressure and a clear end time; avoid unavoidable loss.
- **Economic boom:** selected legal or street markets gain temporary demand.

## Release gates

- Confirm every supported action path can generate at most one event for a single action ID, including retries and concurrent requests.
- Confirm event outcomes and rewards settle exactly once and appear in the player receipt/history.
- Confirm paused rounds cannot trigger, expire, or settle events through dashboard polling or other read paths.
- Confirm declining or missing an event does not charge cash, turns, crew, heat, debt, or reputation.
- Confirm eligibility, cooldown, expiry, and city-condition rules are evaluated on the server.
- Simulate repeated event use and reward combinations to detect cash, XP, supply, turf, or combat farming.
- Verify active conditions are visible, time-bounded, and do not create uncapped modifier stacking.
- Verify admin changes are permission-checked and logged.
- Test desktop, mobile, keyboard navigation, empty states, stale state, and network retry behavior.

## Explicitly deferred

- Live betting, parlays, and sportsbook market expansion; see the separate sportsbook roadmap.
- Permanent power rewards tied to event leaderboard placement.
- Events that consume turns without explicit player confirmation.
- Unbounded random punishment or events that damage a player's account while offline.
- Large competitive tournaments until event telemetry and balance are proven.

## Guiding question

**Does the event offer a clear, optional decision that makes the city feel alive while keeping the core StreetsEmpire loop fair and understandable?**
