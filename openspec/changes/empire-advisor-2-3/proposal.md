# Proposal

## Why

After onboarding, the dashboard already shows cash, turns, crew, Heat, happiness, and attention chips, but it does not tell a player the single next useful move. Quests, holdings, supply, and contracts live on other pages. Players can miss a ready claim or stare at a blocked empire with no plain-language reason.

2.3.0 adds a small Adaptive Empire Advisor: one urgent suggestion and up to two growth suggestions, each explainable from live permitted state. It is a briefing, not a new economy, not an enemy radar, and not an autopilot.

Product source: `docs/living-world/ROADMAP-2.3.0-EMPIRE-ADVISOR.md` and the 2.3 section of `docs/living-world/STREETSEMPIRE-LIVING-WORLD-ROADMAP-2.0-2.7.md`.

## What Changes

- Add an owner-only advisor signal contract covering cash, turns, crew, Heat, verified quest status, stock, and city holdings, with plain-language reasons. Advice cannot infer private enemy data.
- Add a deterministic recommendation engine. The same player snapshot, ruleset, focus, and suppression set always yield the same cards. No generative model.
- Add dismiss, snooze, global silence, new-player priority, active-tour deference, and dedup against the notification bell and Street Report.
- Show 1–3 compact dashboard cards that deep-link through existing game routes and refresh with the live dashboard, without a document reload.
- Add an optional planning focus (money, territory, crew readiness, quests, or balanced) that only reorders and filters suggestions. It never spends, attacks, claims, or otherwise acts.
- Record shown, clicked, dismissed, and completed outcomes without copying private payloads, and judge usefulness rather than whether the player obeyed.

## Capabilities

### New Capabilities

- `advisor-signals`: owner-only snapshot, eligibility, and explanation contract.
- `advisor-recommendations`: deterministic priority rules and reproducible cards.
- `advisor-suppression`: cooldown, dismiss, snooze, silence, tour deference, and dedup.
- `advisor-dashboard`: dashboard cards, existing deep links, and in-place refresh.
- `advisor-planning`: optional focus presets that do not change game rules.
- `advisor-evaluation`: utility traces that omit private data.

### Modified Capabilities

None. The dashboard snapshot, quest claims, holdings, notifications, Street Report, and guided tour stay authoritative. The advisor reads them and links to them.

## Impact

- Server: extend the existing dashboard read in `apps/server/src/services/player-state.service.ts` and `GET /api/game/me` (`toGameSnapshotDto` in `apps/server/src/game/dto.ts`) with one advisor briefing. Quest status comes from `quest-progress.service.ts`. Holdings come from `city-holdings.service.ts`. Do not add a per-card query fan-out on the dashboard poll.
- Shared: additive `advisor` field on `GameSnapshotDto` in `packages/shared/src/types/api.ts`.
- Web: cards on `apps/web/src/pages/DashboardPage.tsx`, refreshed by `useLiveDashboard`. Links reuse `/game/quests?focus=`, `/game/turf?city=&district=`, `/game/holdings`, `/game/crew`, `/game/supply`, `/game/produce`, `/game/operations`, and dashboard hashes such as `#heat` and `#crew-health`.
- Persistence: account-level focus and silence on `AccountProfile`, following the `onboarding` JSON pattern. Round-scoped suppression rows and append-only evaluation events. No new money, combat, or quest resolver.
- Privacy: snapshots and traces are limited to the signed-in player's own permitted facts. Scout reports, other players' stock, combat recon, and Black Book enemy intel are not advisor inputs.
- Later fit: 2.6 Empire Profit Intelligence may feed the money focus. 2.3 does not forecast prices or automate trades.
- Rollback: a ruleset or feature switch omits the briefing. Existing quests, notifications, and settled actions are unchanged.
