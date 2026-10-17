# StreetsEmpire 2.0.0-F — Immersive Player Experience

Implementation on `feature/living-streets-2.0.0-f`, based on merged 2.0.0-E in `beta`.

## Player-facing flow
- **Black Book:** separate navigation to Street Intelligence and **Criminal Case Files**. Existing combat intelligence remains unchanged.
- **Case Files:** new public city opportunities (opt in), unaccepted offers, active investigations with ordered verified clues, contextual links to Scout / Combat Intel / Travel / Event Center, real source confidence, progress bar, evidence timeline and paginated owner-only archive.
- **Choices:** solving a case displays two named outcome options; confirmation dialog spells out that both are free and pay equally. POST uses the existing server-side transaction and idempotency. The result dialog displays the actual saved ending and actual payout, with no client-side reward rolls.
- **Dashboard:** compact active-case card, priority to SOLVED cases, then ACTIVE cases and AVAILABLE offers; link into the exact Black Book case by `?tab=cases&focus=id#case-id`. Hidden for historical rounds that don't enable Living Streets.
- **Action-linked story dialogs:** the same `streets:quests-changed` event already emitted for *confirmed game actions* refreshes the private Case Files snapshot and compares against a silent initial baseline. Only actual new offers, new clues and newly solved cases produce dialogs. Hydration/reconnect/page changes do not replay historical cases. Existing accessible `GameDialog` handles Escape, focus management and scroll locking.
- **Archive:** owner-only paginated cases, immutable reward/story report, neutral expired-case message, chronological timeline.
- **Related news:** an owner-scoped `GET /api/game/case-files/publications` checks the associated source event is public and an auto-generated Streets Daily article has actually been published in the same round. Only then show a deep link to the published post; private memories and held drafts never get a link. The generic Streets Daily link remains for unrelated articles. No case evidence is posted to news.

## Interaction requirements
- Small screens: cards and choice columns wrap, buttons remain reachable, no sticky navigation overlap, no implicit scroll-to-top after case activation or closure.
- Keyboard: links and buttons have explicit focus rings; dialog uses the existing focus trap and restores focus; deep-link case focuses once rather than on each re-render.
- Accessibility: progressbar receives explicit counts, status badges remain textual, evidence timeline has semantic list and timestamps. Reduced motion disables case progress animation.
- Security: case IDs and offers are owner scoped by the already-shipped API. UI never awards game resources or decides evidence locally.
- Current data is loaded via authenticated no-store Case File APIs. Empty case book is expected on non-story rounds. No migration, extra scheduler, or new economic effects in F.

## Verification
1. Run `npm run typecheck`, unit suite and build. Check action popup policy tests and case deep-link helpers.
2. Check Black Book Street Intelligence unchanged, including empty and error states.
3. Complete Scout then Contact then Encounter as configured, verify progress update and exactly one popup for each newly verified clue; no dialogs on refresh or old session hydration.
4. Open and close a solved case by keyboard and by touch; switch branches only before confirmation; confirm payout source is server and one-time.
5. Verify public opportunities require opt-in, case pagination doesn't truncate an old archive, page focus works on direct URL and never scrolls after every action.
6. Check mobile 320–430px, reduced motion, large font, paused rounds, expired optional cases, and older pinned rulesets.
7. Allow only genuine verified public Streets Daily publication links; generic news links must not imply publication of private case evidence.

Next: **G** authoring, admin diagnostics, deterministic eligibility explanation, and safe test fixtures.
