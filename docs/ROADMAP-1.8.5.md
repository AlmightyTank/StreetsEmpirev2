# StreetsEmpire 1.8.5 — City in Motion

## Purpose

Bring the beta's existing community events and holiday event Jobs into the same player-facing event experience as action-based random encounters and future city conditions.

The update builds on the event systems already in the Jobs and quest rulesets. It should make the city feel active without replacing seasonal progress, resetting event rewards, or making players learn a second unrelated event interface.

**The question:** What is happening in the city, the round, or the real-world event calendar—and what can I do about it?

## Existing systems to carry forward

### Round community events

Phase U already runs one community event in each quarter of a round:

| Round window | Current event | Shared objective |
| --- | --- | --- |
| 0–25% | Opening Rush | Complete 100 scouting actions |
| 25–50% | Money in Motion | Sell $1,000,000 through store counters |
| 50–75% | Interstate Push | Return 25 intercity runs |
| 75–100% | Last Call | Launch 40 raids or turf pushes |

Participation starts automatically when a player takes part in the active event. Each player contributes to the shared round total and must also meet a personal contribution floor to collect the modest cash and turn reward. Community event rows stay outside the personal 8-Job limit. The shared total is aggregated from player contributions; it is not maintained by writing every action to every player's row.

1.8.5 should surface and extend this system, not rebuild it as a new contest or remove its contribution rules.

### Calendar seasonal event Jobs

Phase Y-F already provides UTC-window holiday Jobs, including **The Witching Run** for Halloween and **Midnight Delivery** for Christmas. These are personal, event-shaped objectives with permanent cosmetic rewards. Normal players follow the real UTC window; beta/admin accounts can use the existing non-production seasonal-event test mode.

1.8.5 should build a reusable event calendar and improve discovery, countdowns, history, and testing around this pattern. Keep seasonal rewards cosmetic and permanent; preserve the rule that an accepted Job is not forcibly abandoned just because its event window closes.

### Action-based random encounters

Random encounters are a separate, action-triggered lane. The beta has been extending them across Scout, Produce, Travel, Stores, Turf, and Combat. Slice A audits the current hooks, odds, receipts, and pause behavior before increasing their volume.

### Keep the event lanes distinct

The player should be able to discover all events in one place, but the existing lifecycles stay clear:

- **Street encounters:** triggered by a player's action; optional, short-lived choices.
- **Community events:** shared round progress in four quarter-season windows; automatic participation and a personal floor.
- **Seasonal Jobs:** real-world UTC windows with personal objectives and permanent cosmetic rewards.
- **City conditions:** visible, time-limited modifiers affecting named activities or districts.

Do not force these different clocks, contribution rules, or reward settlement paths into one generic quest flow just to share a screen.

## Design principles

1. **Events create choices.** Explain the trigger, options, possible outcomes, deadline, and reward before commitment.
2. **No hidden turn costs.** An encounter does not silently consume turns or charge cash. Show any optional cost before confirmation.
3. **No offline punishment.** Expiring an optional street encounter creates no debt, heat, lost crew, or missed-payment penalty.
4. **Server authority.** Eligibility, progress, event selection, cooldowns, rewards, and settlement are checked and recorded server-side.
5. **Transparent schedules.** Show whether an event is tied to the round, a real-world UTC window, an action, or a city condition.
6. **Bounded rewards and modifiers.** Preserve modest community cash/turn rewards and cosmetic seasonal rewards. Prevent modifier stacking and repeatable reward farming.
7. **Round compatibility.** Carry changes through versioned rulesets; older pinned rounds keep their existing definitions and behavior.
8. **Pause safety.** Paused rounds do not advance round-event windows, action triggers, or settlement through read requests.

## Proposed slices

| Slice | Theme | Outcome |
| --- | --- | --- |
| **1.8.5-A — Event Compatibility & Engine Audit** | Preserve what already works | Inventory Phase U community events, Phase Y-F seasonal Jobs, and random encounter hooks. Verify ruleset boundaries, progress receipts, idempotency, pause behavior, and reward settlement. Do not migrate or rewrite established event state without a concrete need. |
| **1.8.5-B — Event Center & History** | Give players one place to see what's happening | Add a responsive Events view with separate Street, Community, Seasonal, and City sections. Show active/upcoming status, source and end time, shared progress, personal contribution, rewards, receipts, and history. Keep each lane's existing actions and rules. |
| **1.8.5-C — Street Opportunities** | Make action encounters consistent | Tune and round out encounters attached to Scout, Produce, Travel, Stores, Turf, and Combat. Use action IDs, cooldowns, duplicate protection, and receipts. Keep encounters optional and low-frequency so normal play remains the main loop. |
| **1.8.5-D — Community Event Growth** | Expand the quarter-season loop | Keep the four round windows and automatic participation. Improve contribution clarity and late-join visibility, then add a small number of objective variants only when they use authoritative gameplay receipts and can be fairly balanced. Preserve a personal floor and bounded rewards. |
| **1.8.5-E — Seasonal Calendar** | Make real-world events reusable | Replace one-off discovery and date handling with a clear UTC event calendar for seasonal Jobs, countdowns, upcoming events, past rewards, and admin QA previews. Preserve the non-production test-mode boundary and permanent cosmetic ownership. |
| **1.8.5-F — City Conditions & Connected Stories** | Let event lanes affect the living city | Add transparent, bounded city conditions such as a festival, shortage, trader shipment, or economic boom. Allow a street encounter or seasonal/community objective to point into a follow-up opportunity, while keeping its progress and reward rules in its original lane. |
| **1.8.5-G — Admin, Balance & Release** | Make events operable and safe | Add permission-checked calendar and event controls, audit logs, outcome metrics, economy simulations, compatibility checks, mobile/accessibility QA, and release verification. |

## Example event experiences

- The Events view shows that **Money in Motion** is active, with the $1,000,000 shared target, the player's personal sales floor, the player's own contribution, and the quarter-window end time.
- A player who joins late can see whether a community reward is still achievable by meeting the remaining personal floor before the window closes.
- The seasonal section shows the next holiday Job, its UTC opening and closing time, required objectives, permanent cosmetic reward, and already-earned past rewards.
- After a completed scouting action, a low-frequency street encounter offers an optional lead. It has its own short deadline and does not alter community-event progress unless the underlying scouting receipt legitimately qualifies.
- A city festival marks affected districts and activities on its card and expires at a stated time. A player can see the modifier before choosing an action.

## Release gates

- Confirm the four Phase U windows remain contiguous, round-derived, and mutually exclusive.
- Confirm community totals use authoritative per-player contributions without cross-player fan-out writes; claims recheck both the shared goal and personal floor.
- Confirm auto-participation works even when the player has not opened the Events view, and community events remain outside the personal 8-Job limit.
- Confirm seasonal availability uses server UTC, accepted Jobs follow their documented expiration behavior, and only non-production admins receive the existing QA bypass.
- Confirm seasonal cosmetics are granted permanently and independently from equipped site themes.
- Confirm every random encounter can generate at most one result for a single action ID, including retries or concurrent requests.
- Confirm event rewards and receipts settle exactly once.
- Confirm paused rounds cannot trigger, expire, or settle round events through dashboard polling or other read paths.
- Confirm declining or missing an optional street encounter does not charge cash, turns, crew, heat, debt, or reputation.
- Simulate repeated encounters and overlapping city modifiers for cash, XP, supplies, turf, and combat reward farming.
- Verify event configuration changes are permission-checked and logged.
- Test desktop, mobile, keyboard navigation, empty/upcoming states, stale data, and retry behavior.

## Explicitly deferred

- Replacing the Jobs system or rebuilding Phase U and Phase Y-F from scratch.
- Live betting, parlays, and sportsbook market expansion; see the separate sportsbook roadmap.
- Permanent competitive power for community leaderboard placement.
- Uncapped city modifiers or event reward stacking.
- Events that consume turns without explicit player confirmation.
- Offline penalties for missing optional encounters.
- Large competitive tournaments until event telemetry and balance are proven.

## Guiding question

**Can players understand what's happening across the round, the seasonal calendar, and their own actions—and join in without hidden costs or unfair pressure?**
