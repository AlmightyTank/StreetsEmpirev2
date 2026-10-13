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

### C — Actions: Scout, Produce and Raids
- Unified action dock, equipment/turn status, outcome receipt and consistent quantity shortcuts.
- Draw attention to what is available now; show job unlock restrictions contextually.
- Replace redundant activity panels with a compact recent-result summary.

### D — Empire: Crew, Dealers, Hideout, Travel and Turf
- Reuse one small set of roster cards, management patterns and contextual inspectors.
- Turf ownership and scout locations share a clear map/area vocabulary without merging permissions.
- Keep existing game loops, crew jobs, travel routes and upgrade mechanics.

### E — Economy: Stores, Bulk Orders and Loans
- Merge the already-planned hybrid Store marketplace approach (search/filters/trade-first cards) into the refreshed shell.
- Use common receipt, quote, pending, batch action and fulfillment conventions.
- Avoid requiring users to switch pages just to understand quantities or prerequisites.

### F — Casino
- One Casino destination. Individual games retain deep-linked URLs and their own optimized play surfaces.
- Unified game selector, betting controls, available cash, results and mobile controls.
- Preserve sportsbook rules/close times, cache and settlement boundaries.

### G — Career: Profile, XP, Street Pass and Events
- One coherent presentation of level, progress, achievements, titles, unlocks and supporter cosmetics.
- Do not remove paid customization or mix appearance settings with game progression.
- Move duplicate explanations into optional detail panels.

### H — Social and communication
- Distinguish player Contacts, Console messages, Alliance coordination, Rankings and News by their actual purpose.
- Cross-links where useful; remove duplicated unread counters/sidebars.
- Improve inbox and player profile readability on narrow screens.

### I — Admin workspace
- Group admin tools by Operations, Players, Economy, Content and Monitoring.
- Keep all permission checks and audit logs server-side. Preserve direct URLs.
- Admin features never appear in ordinary player navigation.

### J — QA, accessibility and performance
- Check at 360/390/768/1024/1440/1920 widths, with sidebar rail, expanded sidebar and premium shell themes.
- Keyboard navigation, readable labels, color contrast, reduced motion and no horizontal overflow.
- Unit tests for nav routing/aliases/visibility, quest ordering and focus, basket persistence, result actions.
- Review performance on transitions, caches and polling (no unnecessary extra requests).
- Release only when typecheck, tests and build pass and actual beta gameplay is spot checked.

## Release strategy

One reviewable PR per slice into beta, merging in dependency order. No mass rewrite of the existing routes, APIs, saves, server rules or economy. Keep beta deploy separate from `main`; publish before/after screenshots with desktop and mobile review for each area.
