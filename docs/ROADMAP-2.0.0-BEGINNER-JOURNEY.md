# StreetsEmpire 2.0 — Beginner Journey Roadmap

> **Status:** Planned; not implemented by this document.
>
> **Feature:** **From Nobody to Boss** — a contextual, action-driven new-player guide with the opening chapter **Make Your Mark**.
>
> **Target:** Beta development toward the 2.0 release.
>
> **Existing foundation:** [Guided Quest Overhaul](QUEST-ONBOARDING-OVERHAUL.md) (1.8.0-S seven-step tour), `packages/rulesets/src/tour-campaign.ts`, `packages/shared/src/onboarding.ts`, `apps/server/src/services/onboarding.service.ts`, `apps/web/src/components/onboarding/TourOverlay.tsx`, and `apps/web/src/help/catalog.ts`.
>
> **Rule:** Extend the existing onboarding + quest engine. Do **not** invent a competing quest system, duplicate reward ledger, or new global onboarding modal stack.

## Vision

Players create an identity, learn the dashboard, complete meaningful actions that underpin the economy, then graduate into optional combat, city, and social specializations. One step is visible at a time, its action is demonstrated on the real page, and completion is credited by authoritative server events or saved identity state. The experience should feel like an introductory story delivered by Mama, Pip and Tommy rather than a manual.

**Promise:** A newly joined player always knows **what to do, where to do it, why it matters, and what comes next**.

### Product rules

1. **Make Your Mark comes first:** **Name Your Crew → Fly Your Colors → Build Your Street Sign**. These are sequential required objectives **within an active guide**; the entire guide remains dismissible and gameplay is never locked behind it. Existing valid choices count automatically.
2. Keep a small persistent mission tracker on desktop/mobile with **Guide Me**, **Why?**, **Minimize**, **Resume** and **Skip Guide**. One current mission and at most 1–3 subtasks; never a wall of 12 objectives.
3. Launch at first eligible round join after age/verification/round-access gates; never interfere with the existing 16+ eligibility flow. Veterans see a nonintrusive optional replay entry, not a forced prompt.
4. Save account-level identity and tour preferences across devices. Game-action mission progress and balance-altering rewards remain round-scoped; old pinned rounds keep their historical definitions.
5. Rewards are modest starter **round** cash/XP/contact reputation/cosmetics as suitable, claimed once via the existing quest/reward pipeline. Cosmetics can be account-persistent, but must not confer permanent gameplay advantage.
6. No dependence on random recruiting, sold-out items, paid cosmetics, a profitable outcome, high-level unlock, real-player PvP, or unavailable NPCs to finish the core guide.
7. All instructions, highlights, and labels must match actual player-visible UI on desktop and phone. Never move or fake a gameplay action just to complete a step.

## Player journey and definition of done

### Chapter 1 — MAKE YOUR MARK (identity)

| # | Mission | Player action / completion evidence | Mentor |
|---|---|---|---|
| 1 | **Name Your Crew** | Enter and save a valid `crewName` through the existing profile settings, or detect an already saved valid crew name. Distinguish **crew name** from account/pimp name; the first assignment must not trigger a *pimp-name* rename cooldown. | Mama |
| 2 | **Fly Your Colors** | Select/confirm a free `profileAccent` color and preview how it appears in the crew's profile and supported UI. An existing deliberate accent choice counts; merely having a default value does not prove the user made a choice. | Mama |
| 3 | **Build Your Street Sign** | Create and save a personal **custom street-name sign**, choosing its text, base shape/style, and palette. Show a live preview. An already-saved sign counts. This is **cosmetic identity**, not an actual city/block claim. | Mama |

At Chapter 1 completion, play a short skippable reveal: **crew name + chosen colors + completed sign**, with the line: *"You've got your crew, you've got your colors, and now you've got a street to call your own. Time to make a name for yourself."* Award one small first-chapter cosmetic/XP claim, once, via an idempotent existing reward pathway.

**Street-sign design contract**
- Reuse `AccountProfile` or a tightly coupled profile-settings record; keep an explicit, versioned object for `text`, `styleKey`, `colorKey` and any unlocked decorations. Avoid an unbounded free-form HTML/SVG field.
- Server-side validate, normalize and length-limit the public text; apply existing community naming/moderation rules, escape on rendering, and give a friendly inline error. Support mobile keyboard and real-time preview.
- Initial **free** styles: Classic Street Green, Midnight Black, Industrial Blue, Weathered Metal. Optional **earned/supporter** trims may follow, but no paid or rare item may be required to complete the mission.
- Display the sign on the player profile/signature area first; add tasteful placement in their Hideout later if layout supports it. Turf representation is future scope and must not imply ownership of a real game block.
- Re-edit from profile/collection settings after onboarding. Changing the sign must not reset the tutorial or award repeat rewards.
- Match selected accent/theme without assuming one hard-coded house color. Provide readable contrast in all palettes.

### Chapter 2 — LEARN THE STREETS (navigation + income)

| # | Mission | Player action / completion evidence | Mentor |
|---|---|---|---|
| 4 | **Meet Your Empire** | Open dashboard; point out turns, cash, crew, and resources. User acknowledges the brief explanation. No gameplay spend required. | Mama |
| 5 | **Take Your First Job** | Accept an eligible first contact job, explain tracking and claiming, and automatically advance when the accepted event is recorded. | Mama |
| 6 | **Hit the Streets** | Open Scout, pick an available district, complete one successful *resolved* scout action, and reveal where to read the result/turn cost. | Mama |

### Chapter 3 — BUILD YOUR OPERATION (upkeep + muscle)

| # | Mission | Player action / completion evidence | Mentor |
|---|---|---|---|
| 7 | **Keep Them Working** | Acquire both condoms and beer using canonical store line-item accounting, not simply *any two* `STORE_BUY` events. Check supplies and show why shortages matter. | Pip |
| 8 | **Build Your Crew** | Gain a thug via a real recruit **or** valid store hire (or other approved roster increase). Never demand a random scout drop; verify both paths in quest and tour. Explain workers versus muscle. | Tommy |
| 9 | **Arm Your Muscle** | Acquire/equip the starter weapon required by game rules; explain coverage/readiness, using real inventory/equipment events. Make baseline stock and affordability reliable. | Tommy |

### Chapter 4 — GROW YOUR FOUNDATION (sustainable loop)

| # | Mission | Player action / completion evidence | Mentor |
|---|---|---|---|
| 10 | **Make Your Own Product** | Produce one batch of any genuinely available starter product; do not hard-code only `PRODUCE_CRACK` if current rulesets offer other valid products. Explain turns, ingredients and Heat. | Pip |
| 11 | **Build the Base** | Make a reachable initial Hideout upgrade (e.g. Safe Room or Workshop); explain its seasonal nature. Offer a reasonable alternative/assistance if funds or prereqs cannot be met. | Mama |
| 12 | **Read the Take** | Revisit dashboard/activity to review recent income, spent turns, resources, and next opportunities. Complete through an explicit short acknowledgement tied to the screen. | Mama |

**Graduation:** Show a **You're on the Map** recap with crew name, accent and street sign; a summary of turns/scout/crew/supplies/production; links to optional specialties; and a one-time modest completion reward. No unavoidable full-screen interruption on each later login.

### Chapter 5 — TAKING CONTROL (optional, not a 2.0 core-tour blocker)

- **First Fight:** practice with the existing beginner attack dummy **if present and functional**; otherwise repair/reintroduce a dedicated safe practice target before enabling this mission. No compulsory real-player raid, no punitive loss or revenge trigger.
- **Know Your Target:** real recon explanation with a safe practice path if available; never require attacking a nonconsenting player.
- **Find Your Turf:** inspect city blocks, learn claiming and defending; actual claim is optional and rules-dependent.
- **Take the Road:** learn cities, runs, vehicles and risk; a costly shipment is not required to finish the core tour.
- **Find Your People:** introduce contacts, alliances and community, but don't require another player to accept an invitation.

Further optional tracks from the pre-existing overhaul: Street Operator, Business Builder, Crew Boss, Enforcer, Road Boss, Fixer, Underworld Network, High Roller, Supply Broker, Career & Community.

## UX specification

**Opening:** an opt-in **Start my journey** / **Not now** entry shown to first-time eligible players, following current intro rules. Beginning Chapter 1 opens a focused task card, not several stacked modals.

**Persistent mini-tracker:** `Chapter 1 · Mission 2 of 3`, title, 1–3 checkboxes, reward hint and single `Guide Me` action. Dashboard can show the full chapter map; the sidebar or mobile compact bottom card follows the player.

**Spotlight:** a contextual, accessible highlight around the current **real** button/form; route automatically when Guide Me is tapped. Respect sticky headers, safe areas, open keyboard and nested scroll containers. When the target is missing or locked, render a helpful fallback, never a broken overlay. A manual Next button may advance instructional *slides*, but it must not forge a completed game objective or skip ahead in claimable quest progression.

**Mobile:** never capture vertical touch gestures globally. Maintain normal up/down page scrolling and functional navigation tabs. A collapsible bottom sheet/dock should not cover the highlighted control, keyboard, fixed buttons, or browser/system UI. Avoid pull-to-refresh regressions or forced scroll-to-top on tab changes. Auto-scroll once on direct `Guide Me` navigation, not repeatedly while someone swipes.

**Accessibility:** usable by keyboard, screen reader and reduced-motion users; strong text contrast with all accents; semantic live region for mission completion; adequate tap targets and focus restoration after navigation. Optional celebratory animation, never the only confirmation.

**Recovery:** preserve current state through refresh, device changes, reconnect, rerender and logout. A user can minimize, dismiss, restore or replay instructional content. Replaying must **not** reset rewards, overwrite identity or create duplicate gameplay progress.

## Implementation slices (A–H)

### Slice A — Audit and reconcile the existing tour
- Compare the shipped seven-step `tour-campaign.ts` to this 12-mission journey and current `QUEST-ONBOARDING-OVERHAUL.md`; document which quests are reused, amended or retired.
- Trace `OnboardingService`, `TOUR_STEP_KEYS`, `TOUR_STEPS`, `TourOverlay`, profile settings and page-intro entry points. Use one authoritative mission registry and progress contract.
- Define progression: chapter/mission IDs, prerequisites, completion evidence, rewards, completed/skipped/replayed states, compatibility with pinned old rounds.
- Fix misleading `Next` and objective semantics; ensure advancement cannot claim rewards for unperformed actions.
- **Done when:** sequence and contract are testable; old rounds stay unchanged; new active rounds can opt in without parallel logic.

### Slice B — Make Your Mark: identity + sign editor
- Reuse existing `crewName` and `profileAccent` state/validators and add explicit color-choice acknowledgement when the default is preselected.
- Implement a versioned account-level street-sign DTO, schema, API persistence, profile renderer, sign editor, live preview, safe palettes and name moderation.
- Wire the three identity missions to saved state; count existing settings fairly; ensure cosmetic editing is available afterward.
- Add crew/color/sign reveal and new chapter-completion reward, without assigning real turf.
- **Done when:** a new or existing player can finish the three steps on phone/desktop, log out/in and keep their exact identity.

### Slice C — Guided navigation, mentor dialogue and tracker
- Build the reusable compact tracker, `Guide Me` deep linking, highlight targets and on-page contextual help.
- Keep the spotlight nonblocking and stable when a target moves; fallback cleanly on inaccessible targets.
- Add Mama/Pip/Tommy copy, chapter transitions, short success/claim feedback and replay/help entry.
- **Done when:** every live step identifies a real action and no overlay blocks scrolling or buttons at phone widths.

### Slice D — Learn the Streets + accurate shop progression
- Wire dashboard introduction, quest acceptance, real scouting and result review to server-backed completion.
- Fix supplies: individually detect both required items in single- and multi-line checkout purchases (quantities and directions matter).
- Provide starter-item availability and useful instruction when shelves change.
- **Done when:** Steps 4–7 advance only when appropriate, with no false positives or soft-locks.

### Slice E — Crew, equipment, production and Hideout
- Ensure thugs obtained by *scouting or hiring* both satisfy the crew objective; separate starting roster from earned increase.
- Link weapon acquisition/equip to canonical inventory and actionable starter stock.
- Make the produce objective support the current eligible product catalog, ingredients and preconditions.
- Verify a starter Hideout upgrade is attainable; reconcile quest prerequisites and target actions with live rules.
- **Done when:** Steps 8–12 are reliably finishable with standard starting resources, including an unlucky scouting run.

### Slice F — Safe optional Chapter 5 and specialty handoff
- Audit/repair beginner attack dummy and its entry route; use it as a first-combat practice encounter.
- Teach recon, turf, travel and alliances with safe, optional practice and no forced player targeting.
- Link post-graduation specialty starts to the existing Quest/Contacts board, not an independent board.
- **Done when:** graduates see optional branches; no real-player raid is required to clear the core tutorial.

### Slice G — Reward integrity, veteran migration and observability
- Use existing quest completion + reward-claim transaction semantics; check idempotency and race-safe double-click handling.
- Map existing tutorial completion to new missions using *actual* saved identity and prior ledger events; never invent history when proof is absent.
- Respect veteran suppression, manual replay, per-round objective data, account-level identity persistence, and old ruleset pinning.
- Add minimal privacy-conscious metrics: tour offered/started/skipped, step blocked, step completed, chapter graduated; no birthday or raw custom street text in analytics.
- **Done when:** no duplicate cash/XP/cosmetic claims; a returning player is never forced into a blank setup.

### Slice H — Release QA and 2.0 polish
- Integration tests: new accounts, existing accounts, rejoining rounds, pinned historic rounds, interrupted flow, missing highlight target, race/double submission, mobile keyboard and swipe, free item availability, age/verification gates.
- E2E browser tests on small Android-like viewports and desktop, with real page transitions and refreshed sessions.
- Accessibility pass, loading/error/empty state polish, reduced-motion support and visual regression coverage of all accent/sign palettes.
- Feature flag/beta cohort rollout, rollback plan, docs/Rules update and release notes.
- **Done when:** a real clean account can complete all 12 core missions without admin grants, randomness, paid content, PvP, navigation dead ends or a broken mobile scroll state.

## Known beta mismatches to resolve

- The existing `TOUR_SUPPLIES` quest counts **two generic store buys**, while its copy specifically asks for condoms and beer. The onboarding summary already has more precise item checks; unify them.
- `TOUR_CREW` says "**scout or hire**" yet its quest objective is based on scouting recruit events; unify event semantics and state fallback.
- `TOUR_COOK` keys its objective to `PRODUCE_CRACK` while the in-game catalog may allow other starter products; use the active ruleset's eligible product events.
- The tour's last quest is a **real raid**, but the core tutorial should graduate before optional and safe combat practice.
- The existing `TourOverlay` allows **Next** among incomplete spotlight hints, which must remain instructional navigation and never imply authoritative completion.
- Crew name and accent options already exist under account profile settings. A **custom street-name sign builder** is a new product deliverable, not merely a page highlight.

## Release gates / success measures

1. All 12 core missions can be completed with normal starter resources and without a mandatory real-player interaction.
2. Chapter 1 creates a persisted, editable **crew name + deliberate color choice + custom street sign**; returning accounts are not forced to rename.
3. Scouting, supply buying, recruiting/hiring, equipment, production, upgrades and quest claims complete via validated gameplay/state evidence only.
4. No duplicate rewards, bypassed age gating, broken pinned-round content, account-vs-round persistence regressions, or unsafe public sign markup.
5. Mobile up/down scrolling, pull-to-refresh behavior and tab navigation are not intercepted by the tour.
6. Players can skip the guide, resume it, or replay explanations without gaining rewards again.
7. Existing quests, contacts, XP, collection and cosmetic subsystems are reused; no second progression ledger.

## Out of scope for the first release

- Arbitrary user-uploaded sign art; HTML/SVG editing; real map/geographic renaming; actual turf ownership from a street-sign choice.
- Full beginner campaign dependency on other player behavior, premium purchases or season-exclusive availability.
- Replacement of advanced seasonal/community/daily quests or the Jobs & Contacts board.

## Suggested implementation order

**A → B → C → D → E → G → H** for the first polished core guide; **F** can ship later as an optional chapter if that is safer for the 2.0 release. Run tests in every slice and let beta PR review/CI pass before merge.
