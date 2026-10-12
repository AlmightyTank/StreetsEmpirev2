# StreetsEmpire 1.8.5 — Event System Takeover

## Purpose

Make 1.8.5 the release that takes ownership of StreetsEmpire's event systems and upgrades the current random encounters.

The existing round-based Community Events, calendar Seasonal Event Jobs, and action-triggered random encounters become first-class features of one event system. That system will own event schedules, triggers, participation, progress, outcomes, rewards, history, and admin controls. The current encounter behavior is audited, moved into the new event catalog, and improved; it is not merely connected to a new screen.

This is a modernization and migration of real gameplay—not just a new page that links to the current features.

**The question:** Can players see what is happening across the round, the seasonal calendar, and their own actions, and take part through one dependable event system?

## Current events 1.8.5 takes over

### Round Community Events

Phase U currently runs one shared event in each quarter of a round:

| Round window | Event | Shared objective |
| --- | --- | --- |
| 0–25% | Opening Rush | Complete 100 scouting actions |
| 25–50% | Money in Motion | Sell $1,000,000 through store counters |
| 50–75% | Interstate Push | Return 25 intercity runs |
| 75–100% | Last Call | Launch 40 raids or turf pushes |

Participation is automatic. Each player contributes to the shared round total and meets a personal contribution floor to collect the modest cash and turn reward. Community Events remain outside the personal 8-Job limit.

1.8.5 moves these events' definitions, scheduling, progress, claims, and history into the first-class event system. Preserve the shared objective, personal floor, automatic participation, bounded rewards, and no-fan-out aggregation model unless balance work gives a clear reason to adjust them.

### Calendar Seasonal Events

Phase Y-F currently provides holiday Event Jobs on real-world UTC windows, including The Witching Run for Halloween and Midnight Delivery for Christmas. They use personal objectives and award permanent cosmetic themes. On non-production servers, admins can use the existing seasonal-event test mode.

1.8.5 moves seasonal schedules, eligibility, progress, rewards, and event history into the same first-class event system. Keep the UTC boundaries, permanent cosmetic ownership, beta/admin QA controls, and the rule that an accepted event is not forcibly abandoned at the instant its window closes.

### Random Encounters and City Events

Random encounters are action-triggered opportunities currently available across Scout, Produce, Travel, Stores, Turf, and Combat. 1.8.5 takes over their trigger rules, event pool, odds, cooldowns, outcomes, receipts, and tuning. The current encounter implementation is the migration baseline; the new event system becomes the single source of truth for newly versioned rounds. Keep action-based eligibility and short-lived choices, while improving variety, clarity, and balance.

Citywide conditions—such as a festival, product shortage, trader shipment, or economic boom—become scheduled event types whose affected districts, actions, modifiers, and end times are visible to players.

## Event system boundaries

1. **One source of truth.** A first-class event catalog and lifecycle own schedules, eligibility, progress, reward claims, and history. Do not leave competing quest and event schedulers active for the same event.
2. **Distinct event types.** Community, calendar-seasonal, action-triggered, and city-condition events can have different progress rules while sharing event identity, lifecycle, audit, and player discovery.
3. **Safe migration.** Preserve in-flight progress, completed objectives, claimed rewards, and accepted seasonal events when moving state. A migration or compatibility adapter must prevent duplicate progress and duplicate payouts.
4. **Round compatibility.** New event behavior ships through a versioned ruleset. Older pinned rounds continue using their original definitions and behavior; do not silently rewrite historical rules.
5. **No hidden costs.** Random encounters do not silently consume turns or cash. Optional costs are shown before confirmation.
6. **No offline punishment.** Missing an optional encounter does not create debt, heat, lost crew, or a missed-payment penalty.
7. **Server authority.** Selection, eligibility, progress, schedules, rewards, and settlement are checked on the server and protected against retries and concurrency.
8. **Transparent rewards and modifiers.** Preserve bounded community rewards and permanent seasonal cosmetics. Cap city modifiers and prevent reward farming.
9. **Pause safety.** Paused rounds do not advance round event windows or settle event progress through read requests.

## Proposed slices

| Slice | Theme | Outcome |
| --- | --- | --- |
| **1.8.5-A — First-Class Event Foundation** | Establish event ownership | Define the event catalog, event identities and types, schedule/lifecycle contracts, authoritative progress and claim records, history, audit trail, and ruleset boundaries. Map the existing Phase U and Y-F data to the new model. |
| **1.8.5-B — Community Event Takeover** | Move the quarter-season loop | Move the four Phase U events to the event system. Preserve automatic participation, four round-derived windows, shared progress, personal contribution floors, 8-Job-limit exemption, modest rewards, and concurrency-safe aggregation. Remove duplicate legacy ownership for new supported rulesets. |
| **1.8.5-C — Seasonal Event Takeover** | Move holiday windows and rewards | Move Phase Y-F scheduling, UTC eligibility, personal objectives, permanent cosmetic rewards, event history, and non-production admin test mode to the event system. Preserve progress and prevent double-granting during transition. |
| **1.8.5-D — Player Event Center** | Make the new system visible | Add a responsive Events center for active, upcoming, completed, and claimed events. Show event type, schedule, shared and personal progress, objectives, choices, deadlines, rewards, and history. Use one consistent entry point while clearly labeling each event's rules. |
| **1.8.5-E — Random Encounter Takeover & Upgrade** | Replace and improve the current encounter system | Move current Scout, Produce, Travel, Stores, Turf, and Combat encounters into first-class event definitions. Rework trigger weights, cooldowns, duplicate protection, encounter variety, choices, outcomes, receipts, and reward settlement. Keep encounters tied to the action that triggered them, and retire duplicate legacy ownership for new rulesets. |
| **1.8.5-F — City Conditions & Event Chains** | Make events shape the season | Add bounded citywide conditions and optional event follow-ups. Show affected districts/actions and end times. Community and seasonal objectives may point to a follow-up, but the original event remains the source of truth for its progress and reward. |
| **1.8.5-G — Migration, Admin & Release** | Finish the takeover safely | Add permission-checked event authoring/tuning, calendar controls, QA preview, migration verification, duplicate-handler removal, audit views, balance simulation, compatibility checks, and release verification. |

## Migration and compatibility plan

- Establish the first-class event record and lifecycle before moving existing definitions.
- Map each current Community Event and Seasonal Event Job to a stable event key and ruleset version.
- Preserve each player's progress, completion, accepted status, and claim state. Never replay a completed claim as a new reward.
- Keep old pinned rulesets on their existing behavior. New or explicitly upgraded rulesets use the event system.
- During migration, use one authoritative writer for each event. A compatibility adapter may read old state temporarily, but must not let both systems advance or pay the same event.
- Compare old and new progress totals and claim states before retiring the old event-specific handlers.
- Keep schema/data migration reversible through a verified backup or a migration script that does not delete the legacy state until parity is confirmed.

## Example event experience

The Events center lists **Money in Motion** as the active community event. The player sees the shared $1,000,000 sales target, the personal floor, their contribution, the round window end, and the cash/turn reward. Progress and claims are served by the first-class event system.

The same center lists an upcoming holiday event with its UTC dates, objectives, permanent cosmetic reward, and admin test status when appropriate. A completed seasonal reward remains in the player's history and account inventory.

After scouting, the player may receive an optional short-lived street opportunity. It uses the same event identity, receipt, and audit system, but does not accidentally count toward the community objective unless the underlying action independently meets that objective.

A city festival card shows which districts and actions it affects and when those modifiers expire.

## Release gates

- Inventory current encounter triggers, odds, outcomes, cooldowns, receipts, and ledger effects before changing them. Confirm the new definitions cover Scout, Produce, Travel, Stores, Turf, and Combat.
- Confirm Community Event windows remain contiguous, round-derived, and mutually exclusive.
- Confirm each community event still auto-enrolls qualifying activity without requiring the player to open the Events center first.
- Confirm shared totals use authoritative per-player contributions without cross-player fan-out writes; claims recheck the shared goal and personal floor.
- Confirm Community Events remain outside the personal 8-Job limit unless an explicit balance decision changes the design.
- Confirm seasonal event availability uses server UTC and only non-production admins receive the QA bypass.
- Confirm accepted seasonal event progress survives the event boundary according to its documented expiration rules.
- Confirm existing event progress, completion, and claims survive the migration without reset or double payout.
- Confirm only one system can progress or settle each event during and after migration.
- Confirm retries, concurrent actions, and repeated claims cannot duplicate progress or rewards.
- Confirm paused rounds cannot advance event windows or settle progress through read paths.
- Confirm random encounter expiry creates no penalty and consumes no hidden turns or cash.
- Compare old and new encounter behavior in simulations. Verify the upgraded pool has useful variety, visible outcomes, controlled frequency, no repeatable reward exploit, and no unintended reduction in normal action rewards.
- Confirm the old and new handlers cannot both award the same action.
- Simulate repeated events and overlapping conditions for cash, XP, supplies, turf, and combat reward farming.
- Verify event authoring, tuning, calendar controls, and QA tools are permission-checked and logged.
- Test desktop, mobile, keyboard navigation, accessibility, stale data, and retry behavior.
- Keep historical rulesets and existing player-facing rules stable unless a versioned change is explicitly approved.

## Explicitly deferred

- Rebuilding the general Jobs system, story quests, contacts, or all contracts under the event service. The takeover is limited to Community Events, Seasonal Event Jobs, and random encounters.
- Letting two schedulers or settlement paths own the same Community or Seasonal Event.
- Live betting, parlays, and sportsbook market expansion; see the separate sportsbook roadmap.
- Permanent competitive power for community event placement.
- Uncapped city modifiers or event reward stacking.
- Events that consume turns without explicit player confirmation.
- Offline penalties for missing optional random encounters.
- Large competitive tournaments until the unified event system has proven telemetry and balance.

## Guiding question

**Have Community Events, Seasonal Events, random encounters, and city conditions become real parts of one dependable event system, with no lost progress, duplicate payouts, or confusion about how to participate?**
