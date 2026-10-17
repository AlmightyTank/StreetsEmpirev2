# Tasks

## 1. Signals and explanation contract (2.3.0-A)

- [ ] 1.1 Inventory the owner-only fields for cash, turns, crew, Heat, verified quest status, stock, and city holdings, and name the existing service and column for each. Verify the inventory lists no scout report, combat recon, other player's stock, or Black Book rival field.
- [ ] 1.2 Add the advisor signal types to `packages/shared` and a server assembler that reads only that inventory. Verify a unit test fails the build if a forbidden enemy field is copied into the snapshot.
- [ ] 1.3 Define plain-language reason templates bound to rule ids, using the player's own numbers only. Verify each template renders without a model call and without another player's identity unless it is already on an activity delivered to this player.
- [ ] 1.4 Keep the assembler on the `GET /api/game/me` read path and confirm the read does not claim, award, or settle. Verify a paused-round dashboard read still skips loan settlement.

## 2. Deterministic recommendation engine (2.3.0-B)

- [ ] 2.1 Implement `recommend(snapshot, rulesetVersion, focus, suppressions, now)` as a pure function with stable rule ids and the urgent-then-growth order from `design.md`. Verify two calls with the same input return the same keys in the same order.
- [ ] 2.2 Encode blocked progress, ready claims, supply shortfalls, affordable holdings, and available contracts, and drop rules the active ruleset disables. Verify a no-holdings ruleset never emits a holdings card.
- [ ] 2.3 Reject unauthorized and closed sources using the destination action's gates. Verify completed, failed, expired, paused, and zero-turn cases produce no actionable card for the blocked action.
- [ ] 2.4 Cap output at one urgent card and two growth cards, and allow an empty briefing. Verify a fixture with more than three candidates still returns at most three, with urgent first.

## 3. Context and suppression (2.3.0-C)

- [ ] 3.1 Persist account-level silence and focus on `AccountProfile`, and round-scoped snooze and dismiss rows keyed by rule id plus source id. Verify a second device sees the same suppression on the next dashboard read.
- [ ] 3.2 Honor a 24-hour snooze, round-long dismiss, and global silence. Verify a snoozed key stays hidden until the cooldown passes, and a dismissed key does not return under reworded copy.
- [ ] 3.3 Defer to the guided tour. Verify an active tour overlay yields zero advisor cards, and an incomplete tour yields at most one informational tour card.
- [ ] 3.4 Dedup headlines already present as an unread notification or a Street Report `GAME_ANNOUNCEMENT` for the same source id. Verify the bell and the Street Report still deliver, and the advisor does not repeat that headline.
- [ ] 3.5 Confirm silencing the advisor does not mute combat alerts, pending encounters, or Street Report delivery. Verify those existing items still appear when the advisor is silenced.

## 4. Dashboard action cards (2.3.0-D)

- [ ] 4.1 Render 1–3 compact cards on `DashboardPage` from the snapshot `advisor` field, including the reason and an informational label when the card is not actionable. Verify a phone-width layout shows the title, reason, and destination without a new nav item.
- [ ] 4.2 Link actionable cards through existing quest focus, turf city/district, holdings, crew, supply, produce, operations, and dashboard hash routes. Verify each fixture href opens the matching page, tab, and target.
- [ ] 4.3 Refresh cards through `useLiveDashboard` after the underlying state changes, and refresh after dismiss or snooze without a document reload. Verify a claimed quest disappears from the briefing on the next snapshot.
- [ ] 4.4 Give every card a keyboard-reachable link and a visible dismiss control with a touch target consistent with other dashboard controls. Verify focus order and the reduced-motion path do not depend on hover.

## 5. Optional planning mode (2.3.0-E)

- [ ] 5.1 Add the balanced, money, territory, crew, and quests presets to the account preference and the dashboard control. Verify the choice survives reload and does not write cash, turns, inventory, crew, Heat, or quest status.
- [ ] 5.2 Filter and tie-break with the selected preset while keeping the same eligibility gates and the three-card cap. Verify a quests focus never surfaces an attack, and a money focus never spends.
- [ ] 5.3 Leave a documented extension point so a later 2.6 money goal can feed the money preset. Verify 2.3 itself contains no price forecast and no automated trade.

## 6. Outcome evaluation (2.3.0-F)

- [ ] 6.1 Append `shown`, `clicked`, `dismissed`, `silenced`, and `completed` events with rule id, suggestion key, slot, focus, ruleset version, round id, and outcome only. Verify a serialized event has no cash amount, stock quantity, reason text, or enemy id.
- [ ] 6.2 Dedupe `shown` once per suggestion key until the source fingerprint changes. Verify a dashboard poll loop does not multiply impressions.
- [ ] 6.3 Record `completed` only after a click when the linked source actually settles. Verify doing the same action without the card does not increment completed, and dismiss with `not_useful` is distinguishable from snooze.

## 7. QA and rollout (2.3.0-G)

- [ ] 7.1 Add fixtures for zero cash, no turns, an active-tour newcomer, a maxed-out late game, and a paused round. Verify every displayed card is actionable or labeled informational, and silence clears the list.
- [ ] 7.2 Add ruleset-drift tests so a ruleset that removes Heat, holdings, or quests drops those cards. Verify advice never names an unauthorized or already-closed action.
- [ ] 7.3 Assert the dashboard read's query shape stays bounded after the assembler lands. Verify the advisor path adds no per-card query loop.
- [ ] 7.4 Gate the briefing with a switch that omits `advisor` when off, and document the beta rollout and rollback in the 2.3 roadmap. Verify turning the switch off leaves quests, notifications, and settled actions unchanged.

## Workflow follow-up

- Implement each slice from up-to-date `beta` as its own reviewable PR (`feature/2-3-empire-advisor-a` and onward).
- Archive this OpenSpec change after the slice G fixtures pass and the beta switch is ready.
