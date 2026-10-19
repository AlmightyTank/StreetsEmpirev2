# Design

## Context

See `proposal.md` for motivation and the capability specs for the behavior contract. Product slices 2.3.0-A through 2.3.0-G are in `docs/living-world/ROADMAP-2.3.0-EMPIRE-ADVISOR.md`.

Current state on `beta`:

- `GET /api/game/me` is the one dashboard payload (`GameSnapshotDto` via `toGameSnapshotDto`). `player-state.service.ts` is the read path. Background polls must not settle loans or otherwise mutate the round.
- `RoundPlayerDto` already exposes the caller's cash-related resources, turns, happiness, Heat, products, run, turf summary, pending encounters, law summary, and street pass. It does not include the quest board or city holdings.
- Quest status is server-owned (`LOCKED`, `AVAILABLE`, `ACTIVE`, `READY_TO_TURN_IN`, `COMPLETED`, `FAILED`, `EXPIRED`) in `quest-progress.service.ts`. The quest page focuses a card with `?focus=` or `#quest-`.
- City holdings are `GET /api/game/holdings` through `CityHoldingsService`, rendered at `/game/holdings`.
- `dashboardAttentionState` in `apps/web/src/utils/dashboardAttention.ts` is a client presentation count (Heat, convoy, wounded crew, turn cap). It is not an authority for what the player may do.
- The bell is `InAppNotification` over `PlayerActivity`. A published Streets Daily draft files a Street Report as a `GAME_ANNOUNCEMENT` activity in `street-daily.service.ts` (`notifyStoryPublished`).
- The guided tour lives in `OnboardingService` and `AccountProfile.onboarding` (`tourStep`, step completion). `TourOverlay` / `TourOffer` already own the new-player moment.
- `AccountProfile` holds non-gameplay preferences (`onboarding`, `reducedMotion`, `autoAcceptBoardWork`). `PlayerCareer` is cosmetic and must not fork advisor math.

Shared living-world rules that bind this change: reuse settled state, do not add a second resolver, keep reads free of awards and claims, put advice on the dashboard rather than a new nav destination, and stay pause-aware.

## Goals / Non-Goals

**Goals:**

- One server-computed briefing of at most one urgent card and two growth cards.
- Every card is either actionable through an existing flow or explicitly informational.
- The same snapshot, ruleset version, focus, suppression set, and server clock produce the same ordered cards.
- Players can snooze, dismiss, or silence the briefing. An active tour wins over the advisor.
- Dashboard refresh updates or removes cards without a full page reload.
- Evaluation can tell whether suggestions were seen, opened, dismissed, or finished after a click, without storing private facts.

**Non-Goals:**

- No generative model, price forecast, or new economy ledger.
- No enemy radar. Scout, combat recon, other players' stock, and Black Book rival intel are not inputs.
- No auto-spend, auto-attack, auto-claim, auto-travel, or any silent execution.
- No second quest scheduler, notification pipeline, or Street Report.
- No new primary navigation item. Advice stays on the dashboard.
- No 2.6 profit-intelligence charts. The money focus may later accept those goals; this change only uses current permitted state.

## Decisions

### Decision 1: Compute the briefing on the dashboard read

Assemble one owner-only `AdvisorSnapshot` inside the existing dashboard read and return it as an additive `advisor` field on `GameSnapshotDto`. The client renders that field. It does not rank cards itself.

The assembler may batch the caller's quest summary and holdings summary in that same request. It must not call the full quest-page builder or holdings-page builder once per candidate, and the dashboard poll must stay a read: no claim, award, loan settle, or encounter consume.

Rationale: slice 2.3.0-G forbids excess backend queries, and the dashboard contract is already one payload. A second client fan-out would drift from server eligibility.

Alternatives considered:

- Rank in the browser from data it already has: rejected because quests and holdings are not on the snapshot, and the client cannot be the eligibility authority.
- A separate advisor endpoint polled beside `/api/game/me`: rejected for the extra query on every dashboard tick. A dedicated route is acceptable only for dismiss, snooze, and preference writes.

### Decision 2: Allowlist the signals

The snapshot may include only the signed-in player's own facts needed by the rule catalog:

- cash, turns (including cap and whether the next tick yields turns), crew counts the player already sees (wounded, unarmed, posted), Heat and heat-lock when the ruleset has Heat
- verified quest rows for this player: key, status, and whether claim is still open
- the player's stock quantities and city-holdings summary when those rulesets are on
- round pause, ruleset version, and feature flags that turn systems off
- tour state: whether the tour overlay is the current step or the tour is still incomplete
- unread notification and Street Report source ids already delivered to this player, used only for dedup

Each candidate carries a plain-language reason built from a template and those fields. The reason may mention the player's own numbers. It must not mention another player's stock, location, defense, or identity unless that identity is already on an activity the player received.

Rationale: the pass bar for slice A is that advice cannot infer private enemy data. An allowlist is testable. A free-form model prompt is not.

Alternatives considered:

- Let the engine read Black Book or scout "because the player could open those pages": rejected. Linking to a page the player already earned is different from mining it into a recommendation. 2.3 does not recommend strikes from rival intel.

### Decision 3: Pure rule catalog, versioned with the round

Recommendations are a pure function:

`recommend(snapshot, rulesetVersion, focus, suppressions, now) -> ordered cards`

Rule ids are stable strings, for example `quest.ready-to-claim`, `progress.heat-locked`, `supply.shortfall`, `holding.affordable`, `quest.available`. A ruleset that disables Heat, holdings, supply, or quests removes those rules. Disabled rules cannot appear under an older or newer ruleset by accident.

Slot rules:

- At most one `urgent` card, then at most two `growth` cards. Total cap is 3.
- Urgent beats growth. Within a slot, priority is fixed: blocked progress the player can act on, then ready claims, then supply shortfalls, then affordable holdings or other safe investments, then available contracts.
- A paused round or zero turns does not produce an actionable card for an action that requires the round to be running or a turn to be spent. The briefing may instead show a single informational card that says why, and that card consumes a slot rather than adding a fourth.
- Empty is valid. Do not invent filler.

A card is actionable only when the same ownership, round, pause, ruleset, and status gates that the destination route uses would allow the action. `COMPLETED`, `FAILED`, `EXPIRED`, and already-closed sources are ineligible. Informational cards set `kind: informational` and are not styled as the action itself.

Rationale: slice B requires reproducibility from the player snapshot, and slice G requires that advice never recommends an unauthorized or already-closed action.

Alternatives considered:

- Learned ranking or an LLM rewrite of the reason: rejected by the roadmap. Templates can be edited without changing the chosen rule id.

### Decision 4: Suppression is preference state, not gameplay

- Account-level `advisor` JSON on `AccountProfile` stores `silenced` and `focus` (`balanced`, `money`, `territory`, `crew`, `quests`). It is not read by combat, payout, quest rewards, or round start.
- Round-scoped suppression rows store `later` (snooze) and `dismiss` for a suggestion key. Snooze hides that key until 24 hours of server time have passed. Dismiss hides that key for the rest of the round. A source that is no longer eligible does not return under a new key just to dodge a dismiss; the key is derived from rule id plus source id, not from wording.
- Global silence hides every card, including informational ones, and leaves a way to turn the advisor back on.
- While `TourOverlay` is the active step, the briefing is empty. While the tour is incomplete but the overlay is closed, skip ordinary urgent and growth cards. At most one informational card may point at the current tour step.
- Dedup: if an unread `InAppNotification` or a Street Report `GAME_ANNOUNCEMENT` already cites the same source id, do not repeat that headline. A different next action from the player's own state may still appear.

Rationale: slice C's pass bar is no persistent nagging, and the tour already has a job. Putting silence next to `onboarding` keeps it out of the economy.

Alternatives considered:

- Client-only `localStorage` dismissals: rejected because they would not survive a second device and would not be in the reproducible input set.
- Reusing the notification mute settings to hide advice: rejected because critical alerts and the advisor have different jobs. Silencing advice must not mute combat, encounters, or the Street Report.

### Decision 5: Cards are links into pages that already focus a target

Each actionable card has a same-origin `href` using routes and focus params that already exist:

- quests: `/game/quests?focus=<key>` or `#quest-<key>`
- turf: `/game/turf?city=<slug>&district=<district>`
- holdings, crew, supply, produce, operations: their current paths
- dashboard fixes: `#heat`, `#payout`, `#crew-health`, `#crew-inventory`

The dashboard poll (`useLiveDashboard`) replaces the briefing when the snapshot changes. Dismiss and snooze POST to a small advisor route, then refresh the snapshot. They do not navigate and do not perform the suggested action.

Phone layout keeps the cards in the dashboard flow, with a visible dismiss control that is not hover-only, and a touch target that meets the existing dashboard control size. The link opens the correct page, tab, and target. It does not scroll the dashboard to the top as a side effect of rendering new cards.

Rationale: slice D says to use existing deep links and to work on a phone without a reload. New focus params would be a second navigation system.

### Decision 6: Focus presets filter; they do not act

`balanced` is the default and uses the global priority list. The other presets keep the same eligibility and cap, but drop cards outside the focus and break remaining ties toward that focus:

- `money`: cash blockers, supply, affordable holdings
- `territory`: turf and holdings the player can act on
- `crew`: wounded, unarmed, happiness, and roster readiness already visible to the player
- `quests`: ready claims, then available contracts

Changing focus never writes cash, turns, inventory, crew, Heat, or quest status.

Rationale: slice E's pass bar forbids auto-spending, auto-attacking, and silent execution. A preset is a lens.

### Decision 7: Trace outcomes, not private snapshots

Append-only events record `shown`, `clicked`, `dismissed` (with `later` or `not_useful`), `silenced`, and `completed`. Fields are rule id, suggestion key, slot, focus, ruleset version, round id, and outcome. They do not store cash amounts, stock quantities, reason text, enemy ids, or notification bodies.

`shown` is written once per suggestion key until the source fingerprint changes, so the dashboard poll does not inflate impressions. `completed` is recorded only when the linked source settles after a click on that key. Doing the same thing without using the card is not scored as compliance.

Rationale: slice F asks for utility measurement without private data and without compulsory compliance.

## Risks / Trade-offs

- [Dashboard read gets slower] → The signal audit names the minimum columns before implementation. Batch those reads. If a source is expensive, omit that rule rather than paging the whole board on each poll.
- [Cards nag beside the bell and Street Report] → Dedup on source id, snooze, dismiss, and silence are part of the contract, not polish.
- [Tour and advisor talk at once] → Active overlay suppresses the briefing entirely.
- [A rule recommends something the action route then rejects] → Eligibility uses the destination gate. Fixtures cover paused rounds, zero turns, closed quests, and rulesets with the feature off.
- [Traces become a shadow profile] → The event schema has no payload column for game facts. Tests assert a serialized event contains no cash, stock, or enemy fields.
- [2.6 later wants richer money advice] → Money focus is a filter over current state. Do not invent forecast fields that 2.6 would have to unwind.

## Migration Plan

1. Add additive preference JSON and the suppression and trace tables. No rewrite of money, quest, or round rows.
2. Ship the assembler behind a ruleset or feature switch that omits `advisor` when off. Old clients ignore the field.
3. Enable on beta with the fixture pack from slice G (zero cash, no turns, newcomer, maxed-out, paused round, ruleset drift).
4. Rollback turns the switch off. Suppression rows and traces can remain. Settled gameplay is untouched.

## Resolved implementation choices

- Snooze is fixed at 24 hours of server time for 2.3.0. Changing that duration later is a tuning change, not a reason to make the initial implementation configurable.
- `completed` is recorded only for destinations with a stable source or receipt id. Holdings and supply cards record click and dismiss when no stable settlement id exists; they must not guess completion from a later state change.
- The 2.3.0 safe-investment catalog contains only player-owned city holdings that the active ruleset exposes as affordable. Unknown or newly added investment actions stay out of the catalog until a later ruleset-specific change defines their eligibility and completion source.
