# StreetsEmpire · Whole-Game Navigation & Experience Refresh

Status: **Slice A implemented on feature branch**; Slices B–J planned. Target: `beta`; live `main` is unchanged.

## Design intent

One coherent, modern crime-strategy game. Reduce menus, duplicated navigation, wall-of-text cards, and unnecessary page hopping **without removing gameplay systems**. Keep the OG economy, progression, player expression, and the separate API authorization rules intact.

**Player-first promises**
- One clear primary job per page; a player should see what they can do within one viewport.
- No pages that are just tabs linking to more tabs. Prefer grouped content, compact rows, disclosures and direct actions.
- Story quests always lead the Quest page, followed by ready rewards, tracked/active work, then other contracts.
- Preserve bookmarked URLs, quests' `?focus=` and `#quest-...` targets, notification links, existing autosave, checkout and transaction idempotency.
- A mobile screen is not a squashed desktop. Desktop gets room for an optional inspector/right rail; mobile gets single-column content and readable actions.
- User-selected accent colors, supporter shell themes, profile frames and reduced-motion preferences override chrome. The redesign must not hardcode one permanent accent.
- An admin remains able to reach every existing admin screen; admin page consolidation follows separately to avoid risky role or data changes.

## The new navigation

Navigation sections (desktop accordion, mobile searchable All Pages sheet):

| Section | Destinations |
| --- | --- |
| **Command** · open first | Dashboard, Quests, Scout, Produce, Raids |
| **Build Your Empire** | Hideout, Crew Assignments, Dealer Crews, Stores, Bulk Orders, Loan Shark, Travel, Turf |
| **Competition** | Casino, Alliance, Players, Rankings |
| **Progress & Rewards** | XP Progress, Events, Street Pass, Profile |
| **Messages & News** | Console, News & Surveys |
| **Help & Settings** | Status & Support, Rules, Account |

The personalized phone bar remains **four shortcuts + More**; defaults become Home, Quests, Scout, Stores. A player's existing custom tab selection remains untouched. The sidebar and mobile directory can search every page by name or group.

No backend routes are removed. Existing direct navigation, quest links and bookmarked pages continue to work.

## Implementation slices

### A — Shell, navigation and design-system foundation (this PR)
- Consolidate player-facing navigation into six clear categories.
- Keep every original destination reachable once in normal and onboarding menus.
- Add real-time navigation search in desktop sidebar and mobile directory.
- Keep active route and aliases highlighted; auto-expand the current section unless the player explicitly collapsed it.
- Upgrade shared card/header radius, typography, spacing, focus affordances and touch sizes.
- Respect existing accents, cosmetic shells, desktop icon rail, mobile safe areas and reduced-motion.

### B — Quest page: one screen, story first (implemented on Slice B feature branch; awaiting PR validation)
- Replace eleven internal tabs with one meaningful vertical page, not another tab hierarchy. **Implemented.**
- **Story mission always first**, including the next gated step if nothing is currently playable; preserve prerequisite links. **Implemented.**
- Small cards show next objective, progress, status and deadline. Full story, bonus objectives, branch consequences and all rewards appear when expanded/selected. **Implemented.**
- Then show ready payments, tracked/active personal jobs, available jobs, and recurring contract groups, with collapsed history. **Implemented.**
- Keep season/city/alliance/community contracts, faction standings, favors and recipe ladders accessible in compact sections or detail panels. **Implemented as expandable sections.**
- Support deep-link `?focus`, direct notifications, keyboard focus and mobile jump positioning. **Implemented, pending browser smoke tests.**

### C — Actions: Scout, Produce and Raids (implemented on Slice C branch; validation pending)
- **Shared readiness briefing** on all three screens, showing current turns, usable crew, relevant equipment or selection and the precise reason an action is blocked.
- **Action controls moved directly beneath the main planner** on Scout, Produce and Raids rather than below the lengthy crew-readiness and historical sections. Existing ActionDock, receipt logic, retries and API mutations are retained.
- Consistent quantity helper controls: Scout and Produce keep the common TurnSpend steps/Max; Raids now uses the same QuantitySteps component for +1, +5, +10 and Max squad size.
- **Compact receipt strip** shows three changes by default with an expandable remainder and the full underlying receipt available separately.
- **Optional intelligence**: Scout district map and crew/supply/how-to details, Produce locked recipes and crew/supply/how-to details, Raid NPC intel, equipment/recovery, rules and history are collapsed on first visit.
- **Permissions remain authoritative**: district/recipe quest locks, crew requirements, server turn costs, combat cooldowns, idempotent requests and pending-hit recovery are not bypassed.
- Added component render tests for the compact result and readiness states. **CI and browser checks are pending before release.**

### D — Empire: Crew, Dealers, Hideout, Travel and Turf (implemented; browser validation pending)
- **Shared empire shell** now supplies the page header, compact metric strip, roster card, responsive management layout and contextual inspector used across the empire screens.
- **Crew jobs and dealer crews are selection-first**: compact targets stay visible while one assignment or crew opens in the inspector. Existing staffing, stock, pricing, runner, move, pause and close mutations are retained.
- **Turf is map/list/inspector driven**: city and district deep links remain intact, while only the selected district expands its business, war and Turf controls.
- **Turf ownership and Scout coverage share one area legend vocabulary** without sharing permissions or changing either screen's authoritative lock/coverage rules.
- Hideout upgrades and Travel routes keep their established interaction surfaces, now under the common empire header. Existing game loops, URLs and mechanics remain unchanged.

### E — Economy: Stores, Bulk Orders and Loans (implemented; browser validation pending)
- **The hybrid Store marketplace is retained inside the refreshed economy shell**: search, shelf filters, trade-first cards, inline access/restock detail and the cross-store basket all remain available without changing store routes.
- **Common transaction conventions** now identify live quotes, retry-safe pending actions, atomic batch checkout and fulfillment cards across Stores, Bulk Orders and Loans. All three continue to use the established full action receipt; Store keeps its compact result dock.
- Bulk Orders keeps the supplier, product, quantity, price, cash-after-payment and pickup state together. Loan review keeps every fee, surcharge, installment, debt limit and late-payment consequence beside the accept action.
- Existing idempotency keys, uncertain-result retries, authoritative prices, prerequisites, loan schedules, pickups and API mutations are unchanged.

### F — Casino (implemented; browser validation pending)
- **The Casino remains one destination with focused game rooms**: the lobby and every game keep their existing deep-linked URLs and optimized play surfaces under one accessible game selector.
- **Shared casino conventions** now provide the cash, cage-chip and on-floor bankroll summary plus a reusable, mobile-ready wager stepper across Slots, Blackjack and Street Dice.
- Slots, Blackjack, Roulette and Street Dice continue to use the common action dock and compact result/full-receipt pattern. Poker and Sports Betting retain controls tailored to multiplayer turns and bet-slip review rather than forcing them into an unsuitable table control.
- All game APIs, session persistence, table limits, idempotency, sportsbook cache polling, authoritative close times, odds checks and settlement boundaries are unchanged.

### G — Career: Profile, XP, Street Pass and Events (implemented; browser validation pending)
- **Career now reads as one connected destination**: XP, Street Pass, Events and the signed-in player's Profile share persistent deep links and a consistent summary vocabulary for levels, progress, achievements, titles and unlocks.
- Repeated progression explanations now live in optional, keyboard-accessible detail panels. Lifetime XP, round-scoped Street Cred, event participation and permanent cosmetic rewards remain clearly separated.
- Paid and earned appearance customization remains in Account Settings rather than being mixed into gameplay progression. Public profile routes keep their existing privacy and reconnaissance boundaries and do not expose owner-only controls.
- Existing progression, Street Pass claim, event polling, Quest deep-link, profile theme and career-history APIs and mechanics are unchanged.

### H — Social and communication (implemented; browser validation pending)
- **Social destinations now explain their purpose before the player enters them**: Players and Contacts find and track people, Street Wire handles messages and alerts, Alliance hosts private crew coordination, Rankings shows public standing, and News carries official updates.
- Signed-in social screens share direct destination links while public News stays public. The redundant Street Wire hero counters and Contacts quick-link sidebar were removed; counts remain beside the tabs and controls they describe.
- Player profiles now link directly into a recipient-ready message, and profile actions plus inbox subjects and previews remain readable and tappable on narrow screens.
- Existing contact privacy, earned-intel boundaries, message moderation and blocking, Alliance Wire permissions, ranking calculations, News visibility, routes and APIs are unchanged.

### I — Admin workspace (implemented; browser validation pending)
- **Admin tools now form five purpose-led work areas**: Operations, Players, Economy, Content and Monitoring. The same groups organize the desktop sidebar, mobile page directory and an admin-only workspace switcher.
- All existing direct URLs remain intact, including account, player and round detail routes. The reorganization changes presentation only; actions, API calls, confirmations and audit trails are unchanged.
- Admin destinations continue to be added to navigation only when the signed-in account is an admin, and every admin route remains behind the existing server-backed admin and recent second-factor gates.

### K — Dashboard Command Center (on PR #279; do not merge until B/C and QA)

#### Dashboard-A — Structure & information hierarchy (implemented; CI/review pending)
- Replace name-first hero with a **Command Center** heading, player identity, current city, sync status and a linked city standing.
- Show **six real-data stat cards**: Cash (with net worth), Turns/regeneration, National Rank, Fit Crew, Turf and Heat.
- Feature **Main Story** beside **Needs Attention**, then show a full-width row of six fast action shortcuts (Scout, Produce, Raids, Travel, Casino, Quests). Stores remain one click away from Cash/Supplies.
- Add four high-signal information previews: Crew Status, Product Stock, Supplies, and Territory. No invented betting, production timers, tournament events, or unsupported server stats.
- Keep rookie onboarding and unresolved encounters accessible before ordinary summaries.
- Preserve all original detailed management tools and the Activity feed behind clear optional sections.
- Fix review findings: `#crew-health` now opens the **morale penalty breakdown**, while `#crew-inventory` opens crew/inventory; direct and repeated `#heat`/`#payout` navigation reopens the right section.
- All layout changes are CSS/grid and existing snapshot and quest reads; no gameplay API or server mutations.

#### Dashboard-B — Cinematic premium visual pass (implemented on PR #279; validation pending)
- **Three original vector scenes**: city-at-dusk command skyline, atmospheric safehouse/mission story, and a red-lit street/alley for genuinely urgent alerts. Self-contained SVG backgrounds ship with the web app; readability gradients and dark fallbacks avoid any dependency on external images.
- **Premium KPI cards**: accented SVG icons, top-edge glow, linked real cash, turn regeneration, ranking, crew, turf and heat data.
- **Main Story** now has illustrated background, chapter status, a readable live objective/progress meter and a premium CTA. All story fields come from the existing Quest DTO.
- **Attention** uses the red urgent art only for genuine danger (locked/bad Heat, tailed convoy, wounded crew); ordinary reminders keep a calmer accent-colored treatment. Real alerts, counts and direct actions are preserved.
- **Action deck**: six high-contrast icon cards with distinct restrained color treatment for Scout, Produce, Raids, Casino, Travel and Quests.
- **Highlights**: crew, production, supplies and territory summaries now have visual line icons and refined card treatment.
- **Theme/UX safeguards**: uses existing accent/compact-density tokens, dark gradients maintain readable text, responsive container queries, reduced-motion disables hover motion. The artwork never contains fake gameplay data.
- **Release status**: artwork and code committed; automated checks plus real desktop/mobile visual QA still required.

#### Dashboard-C — Mobile, performance and release polish (not implemented yet)
- Test 360/390/768/1024/1440/1920 widths, sidebar rail, dark/light, accent choice and animated supporter themes.
- Keyboard, screen reader status, disclosure and repeated deep-link navigation checks.
- Production builds, tests and browser gameplay smoke test before merging PR #279 into `beta`.

### J — QA, accessibility and performance (automated hardening complete; beta browser validation pending)
- The real-browser UI audit now checks 360/390/768/1024/1440/1920 widths with reduced motion, touch target and overflow checks, keyboard focus and WCAG axe scans. Desktop coverage includes both expanded and icon-rail sidebars, while the matrix exercises the Casino Floor, Federal Case and Midnight Market premium shell themes.
- Navigation routing, aliases and admin visibility plus quest ordering and deep-linked focus remain covered. Store baskets now have a validated, player-scoped, one-day persistence contract with merge/remove tests, and Action Dock result controls have an included render contract test.
- Background tabs no longer issue routine notification, convoy, Poker table, sportsbook, site-banner or supporter-confirmation polling requests. Returning to a visible tab refreshes time-sensitive boards without changing their cache, close-time or settlement rules.
- Web typecheck, focused tests, the full test suite and production build must pass before merge. The authenticated six-width audit and actual beta gameplay spot check remain release gates and require a running beta stack plus player/admin credentials.

## Release strategy

One reviewable PR per slice into beta, merging in dependency order. No mass rewrite of the existing routes, APIs, saves, server rules or economy. Keep beta deploy separate from `main`; publish before/after screenshots with desktop and mobile review for each area.
