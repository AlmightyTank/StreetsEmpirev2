# StreetsEmpire 2.0 — Unified UI & Theme Consistency Roadmap

**Status:** Slices A–G implemented; automated certification passed; pending human visual sign-off  
**Target branch:** `beta`  
**Proposed repository path:** `docs/ROADMAP-UI-CONSISTENCY-2.0.md`  
**Target milestone:** 2.0 release-readiness  
**Scope:** All authenticated player-facing game pages, common navigation, responsive layouts, theme engine, shared UI components, and admin-interface consistency where practical  
**Out of scope:** Rebalancing gameplay, modifying game-economy mechanics, changing server-side action rules, replacing the game's entire visual identity, or deleting legitimate premium visual effects

## 1. Vision

**One recognizable StreetsEmpire experience across every page.**

Every screen should feel like a different room in the *same game*, rather than a separate site designed at a different time. We will preserve StreetsEmpire's dark street atmosphere, cinematic imagery, early-2000s strategic-game density, compact controls, player-defined accents, special site themes, and supporter cosmetics while standardizing visual structure and interaction patterns.

This is a **system-wide consistency project, not a full redesign**. Preserve working gameplay and page personalities; unify the interface underneath them.

### Non-negotiable principles

1. **One visual foundation:** A single documented set of design tokens and common components for the whole game.
2. **Personalization remains global:** The selected accent and site theme must visibly work on every gameplay page.
3. **Page personality without theme hijacking:** Casino may have reels, Turf may have a map, and Scout may have radar; none may independently replace the user's primary interface color or control style.
4. **Predictable interactions:** The same button, tab, form, confirmation, disabled state, loading state, toast, modal, and action receipt behaves the same everywhere.
5. **Mobile is a first-class layout:** Do not create a desktop-only baseline and fix mobile later; implement both per slice.
6. **No destructive CSS cleanups:** Inventory overrides and test before removing or consolidating styles.
7. **No gameplay regressions:** Existing routes, selected tabs, quest anchors, remembered values, scroll positions, API calls, and action results continue working.
8. **Prevent future drift:** New pages and PRs must use shared primitives and pass visual/theme checks.

## 2. Current beta findings and why this is needed

Based on review of the `beta` branch on October 15, 2026:

- `apps/web/src/main.tsx` imports more than 50 CSS files, including successive waves of common shell, page, and dashboard styling.
- `apps/web/src/styles/theme.css` contains base styling and tokens, `polish.css` redefines some base values, and `site-themes.css` defines premium/seasonal full-site skins. These layers need a clearly documented precedence model.
- `apps/web/src/styles/page-identities.css` applies fixed page accent hues to routes. Those should become decoration-only cues rather than competing with the player's chosen accent.
- The project has reusable `Panel`, `Button`, `Field`, and `Alert` components, but design rules are not yet fully enforced for every custom panel, tab, action, and header.
- Dashboard, Casino, Stores, Quests, Scout, and other screens have their own substantial page styles. Several successive dashboard CSS layers also exist (`dashboard.css`, `dashboard-cinematic.css`, and `dashboard-final-polish.css`).
- `apps/web/src/styles/experience-shell.css` has already attempted to unify core card shapes; we should build on that effort rather than start over.
- The game-wide visual audit workflow at `.github/workflows/game-ui-visual-audit.yml` now expands the original Dashboard gate across representative routes, themes and responsive states.

**Important:** These findings indicate architectural drift and review priorities; they do not mean every stylesheet, color literal, or page-specific style is incorrect. Slice A must separate intentional exceptions from actual inconsistencies.

## 3. Approved visual contract

### 3.1 Global design elements — must be consistent

| Element | Unified requirement |
|---|---|
| App shell | Same global header, resource bar, desktop sidebar, mobile tabs/sheet, page content boundaries |
| Page headers | Shared structure: optional eyebrow, title, short explanation, primary actions/status |
| Panels and cards | Standard surface hierarchy, border width, radius, title treatment, padding, internal spacing |
| Typography | Shared text families, heading scale, numeric treatment, readable minimums, muted text hierarchy |
| Buttons | Same primary/secondary/ghost/destructive styles, heights, loading/disabled/focus states |
| Forms | Unified labels, hints, error feedback, selectors, counters, checkboxes, and validation |
| Tabs | Same active state, underline/shape, keyboard semantics, mobile overflow behavior |
| Status/UI feedback | Consistent success/warning/error colors, alert, action result, reward chip, loading and empty states |
| Tables/lists | Unified headings, density, row spacing, sorting/filter controls, responsive overflow |
| Modals/toasts | Shared layering, spacing, dismissal, focus behavior, and motion rules |
| Touch interaction | Accessible tap targets, reliable vertical scrolling, no accidental pull-to-refresh conflicts |
| Spacing/responsiveness | Common gap and padding scale; matching breakpoints and layout constraints |

### 3.2 Allowed page-specific identity

- **Dashboard:** Command center / skyline art and overview panels.
- **Scout:** Radar, district maps, intel visualizations.
- **Produce:** Production machinery, recipes, and supply workflow illustrations.
- **Combat/Raids:** High-stakes encounter and battle presentation.
- **Turf/City Blocks:** Territory maps, contested-zone visuals, influence markers.
- **Stores:** Vendor portraits, merchandise shelves, store-specific illustrations.
- **Quests:** Contact portraits, story art, contracts, reward celebrations.
- **Casino:** Physical table/reel game visuals, sound, motion and venue art.
- **Hideout/Collection/Profile:** Player identity, supporter cosmetics, thematic scenes.

These exceptions must **not** override the primary UI's shared component dimensions, chosen theme tokens, or accessible interaction patterns. A themed game canvas (such as a blackjack felt table) may use game-specific colors as part of the illustration.

### 3.3 Theme precedence and color ownership

Adopt an explicit resolution order and document it in code:

1. **Semantic state colors** (success, warning, danger, informational) represent meaning. Do not recolor them to match player accents if doing so would destroy their meaning.
2. **Selected site theme** supplies appropriate background, surface, border, typography, and atmosphere values.
3. **Player accent selection / theme accent policy** governs interactive emphasis, selected states, focus borders, and primary actions. Define and test the expected behavior when a premium site theme also specifies accent colors; avoid unpredictable overrides.
4. **Page identity** may supply decorative illustration tints or patterns only; it cannot silently change primary UI colors.
5. **Local component styles** may size or position elements but should consume shared tokens for standard controls.

Previewing another player's profile theme must respect the existing page-theme takeover behavior without unintentionally recoloring the viewer's surrounding shell. Preserve the existing reduced-motion and UI-density preferences.

### 3.4 Proposed token families

Keep compatibility with existing `--se-*` variables. Normalize and extend the semantic layer rather than blindly renaming every declaration:

- **Colors:** `--se-bg`, `--se-panel`, `--se-panel-hi`, `--se-line`, `--se-text`, `--se-text-dim`, `--se-muted`, `--se-accent`, `--se-accent-hover`, `--se-good`, `--se-warn`, `--se-bad`.
- **Semantic component colors:** primary control, muted control, focus ring, selected tab, hover panel, disabled text/surface, chart/data visualization colors.
- **Spacing:** coherent 4px-based increments for `space-1` through `space-8` (and named content layout gaps).
- **Geometry:** small/default/large radii; control heights; card/panel body padding; maximum content width.
- **Type:** caption, label, body, section heading, page title, large figure, numeric/monospace.
- **Motion:** short/medium durations and easing with reduced-motion overrides.
- **Layers:** popover, sticky action bar, mobile sheet, tooltip, modal, encounter alert, toast.
- **Responsive:** documented phone/tablet/desktop breakpoints and container widths.

## 4. Implementation roadmap — Slices A–G

### Slice A — Audit & baseline (inventory before changing visuals)

**Goal:** Know where UI patterns diverge and create an approved reference before bulk migration.

**Tasks**

- [ ] Inventory every player-facing page, shared layout, reusable component, stylesheet, and theme mechanism.
- [ ] Build a screen audit worksheet: route, header style, card type, tab style, buttons, tables, alerts, theme compatibility, mobile issues, severity, migration owner.
- [ ] Track where multiple stylesheets define the same core token, component selector, or layout rule, with effective cascade order.
- [ ] Identify hard-coded page accent values and distinguish functional state colors from decorative image/canvas colors.
- [ ] Audit the global sidebar, mobile tabbar, all-pages sheet, resource bar, sticky action controls, and overlay z-index ordering.
- [ ] Inspect default accent, at least two alternate accents, and representative premium/seasonal site themes.
- [ ] Capture reproducible before screenshots at 390px phone, 768px tablet, and 1440px desktop for core screens.
- [ ] Review keyboard navigation, contrast, overflow, reduced motion, and page transitions/scroll retention.
- [ ] Agree on reference UI samples: one action page, one information page, one complex page (Casino or Store), one mobile screen.

**Deliverables:** `docs/UI-AUDIT-2.0.md`, screen matrix, priority issue list, baseline images, and approved design contract.

**Acceptance criteria**

- [ ] Every route is classified as compliant, minor drift, major drift, or documented exception.
- [ ] All high-priority visual conflicts have a file-level source and a proposed fix.
- [ ] No unreviewed visual changes shipped as part of the inventory work.

### Slice B — Design tokens & CSS architecture

**Goal:** Establish one authoritative foundation for shared colors, spacing, typography, and layout.

**Tasks**

- [ ] Create a clear token ownership and CSS import/cascade hierarchy: foundation → semantic tokens → components → layout → theme overrides → page art/feature styles.
- [ ] Reconcile repeated root variables in `theme.css`, `polish.css`, and other common style files.
- [ ] Define a documented CSS naming and override strategy, minimizing overly broad page selectors.
- [ ] Migrate fixed `--se-page-accent` usage toward decorative-only page artwork or theme-aware derivations.
- [ ] Standardize radius, borders, shadows, input sizes, typography hierarchy, and spacing scale.
- [ ] Keep UI-density settings functional and independently test compact/default variants.
- [ ] Add a component/token showcase route or developer-only visual gallery so maintainers can inspect changes easily.
- [ ] Consolidate duplicate or obsolete overrides only after behavior and snapshot checks confirm equivalence.

**Deliverables:** Unified token layer, documented cascade rules, code examples, component gallery, safe CSS cleanup list.

**Acceptance criteria**

- [ ] A change to a shared token predictably updates standard UI across representative pages.
- [ ] Changing player accent does not leave unexpected hard-coded accents on primary controls.
- [ ] Theme and contrast behavior remain correct across default and premium themes.

### Slice C — Standard shared UI primitives

**Goal:** Replace page-specific reimplementations with consistent, composable building blocks.

**Tasks**

- [ ] Enhance `Panel`, `Button`, `Field`, and `Alert` with documented variant and sizing APIs while preserving existing callers.
- [ ] Add or standardize `GamePageHeader`, `SectionHeader`, `GameCard`, `StatCard`, `GameTabs`, `FormControl`, `GameTable`, `EmptyState`, `StatusBadge`, `GameDialog`, and `ActionFooter`/dock patterns where justified.
- [ ] Ensure consistent disabled-reason, loading, success, danger, confirmation, and progress states.
- [ ] Standardize action receipts, resource deltas, reward tiles, availability/locked-state notes, and quest progress presentation.
- [ ] Unify hover/focus states, outlines, keyboard tab order, ARIA patterns, and labels.
- [ ] Add illustrative examples and migration recipes for each primitive.
- [ ] Avoid abstraction that hides unique gameplay elements: casino reels and territory maps remain feature components.

**Deliverables:** Documented shared component set, usage patterns, migration helpers, basic component tests.

**Acceptance criteria**

- [ ] Existing and new primitives support supported themes and density/motion settings.
- [ ] Simple cards, buttons, tabs, and forms no longer require standalone visual implementations per page.
- [ ] Shared component tests cover focus, disabled, loading, selected, mobile, and theme states.

### Slice D — Theme engine & supporter-theme consistency

**Goal:** Make player-chosen styling reliable across the entire authenticated experience.

**Tasks**

- [ ] Audit `Shell.tsx`, `pageTheme.ts`, `site-themes.css`, `page-identities.css`, and the supported theme set.
- [ ] Formalize precedence between default palette, custom profile accent, active site theme, supporter effects, and visited-profile preview.
- [ ] Fix panels, tabs, nav indicators, buttons, forms, meters, notifications, dialogs, action docks, and sidebars that ignore active theme tokens.
- [ ] Ensure premium scenes remain decorative and never obstruct actions or scrolling.
- [ ] Verify avatar borders, player profile hover previews, Street Pass selections, cosmetic effects, and custom crew color displays still work.
- [ ] Preserve semantically meaningful red/yellow/green alerts while using accent for navigational/interactive emphasis.
- [ ] Validate theme fallback on missing assets and transitions between themes without a page reload.
- [ ] Test light/bright accent contrast on all dark surfaces; avoid unreadable text on custom colors.

**Deliverables:** Consistent theme engine behavior, theme compliance matrix, regression tests.

**Acceptance criteria**

- [ ] Accent/site theme changes propagate throughout the UI without stale colors.
- [ ] Premium theme selection works beyond the Profile/Street Pass pages.
- [ ] Public profile previews don't incorrectly leak another player's theme into unrelated UI.
- [ ] No theme blocks interaction, significantly degrades legibility, or defeats reduced-motion settings.

### Slice E — Player-page migration in manageable batches

**Goal:** Bring every game page under the approved design system, without redesigning its game mechanics.

**Batch E1 — Core game loop (highest priority)**

- [ ] Dashboard / command center
- [ ] Scout and district selector
- [ ] Produce / crafting / recipe workflows
- [ ] Combat, raids, and encounter results
- [ ] Travel, Turns, and common action docks
- [ ] Turf / City Blocks / map controls

**Batch E2 — Progression & economy**

- [ ] Quests / story / daily contracts / reward states
- [ ] Stores / inventory / basket / vendor views
- [ ] Hideout / crew / roster / management
- [ ] Supplies, vehicles/garage, loans, and other economy screens
- [ ] XP, Street Pass, achievement and collection screens

**Batch E3 — Social, entertainment & identity**

- [ ] Casino hub, Slots, Blackjack, Roulette, Street Dice, Poker, and Sportsbook
- [ ] Alliances, players, rankings, reputation, and contacts
- [ ] Profile / hover card / cosmetics and supporter panels
- [ ] Events, surveys, notifications, and activity logs
- [ ] News, rules, status, round reports and other information pages

**Batch E4 — Admin and edge cases**

- [ ] Admin panels and multi-form data tables adopt shared controls where appropriate.
- [ ] Authentication, registration, verification, onboarding, and special full-screen dialogs share typography and theme-safe controls where appropriate.
- [ ] Empty/error/loading/locked states reviewed for every core page.

**Rules for every page migration**

1. Capture before screenshots and note existing layout/navigation behavior.
2. Replace repeated presentation with common primitives and shared tokens.
3. Preserve page-specific art and interactions; do not change backend gameplay.
4. Check at least default and alternate theme on desktop and mobile.
5. Check loading/empty/error/disabled and populated states.
6. Run typechecks/tests and include before/after images in the PR.
7. Verify scroll restoration, action docks, anchors, navigation tabs, and dialogs.

**Acceptance criteria**

- [ ] Every audited player-facing route uses approved page chrome and standard controls, or has a documented visual exception.
- [ ] No known major theme inconsistency remains in the core game loop.
- [ ] No change in gameplay actions, costs, rewards, or API semantics as a side effect of migration.

### Slice F — Responsive consistency, performance & accessibility

**Goal:** The same visual hierarchy and reliable interactions on phone, tablet, and desktop.

**Tasks**

- [x] Normalize content gutters, card stacking, responsive grids, typography, panel density, and safe-area spacing.
- [x] Preserve the intended mobile pull-down All Pages sheet while preventing accidental native refresh and scroll lock.
- [x] Confirm vertical scrolling works after idle, while touch events and overlays are present, and after switching tabs.
- [x] Keep sticky primary actions accessible above mobile navigation and device safe areas without covering page content.
- [x] Prevent horizontal overflow and unintentional layout jumps in casino games, stores, tables, long names, and status rows.
- [x] Standardize responsive tab overflow and nested menu behavior; no trapping scroll inside the wrong region.
- [x] Preserve page position when switching store fronts and casino games where the current UX intentionally retains it.
- [x] Measure screen-load/interaction responsiveness; avoid creating large overlapping theme selectors or costly visual effects.
- [x] Support focus visibility, screen reader labeling, touch targets, and user preferences for reduced motion.

**Acceptance criteria**

- [x] No core page requires horizontal scrolling outside intentional maps/game boards/tables.
- [x] Mobile primary actions remain reachable and are not hidden behind the bottom tabbar.
- [x] The pull-down sheet gesture and normal vertical scrolling coexist reliably.
- [x] Content remains readable and usable at 360px, 390px, 768px, and 1440px.

### Slice G — Visual QA, CI guardrails & 2.0 release gate

**Goal:** Stop future style drift before it reaches beta or live.

**Tasks**

- [x] Extend the existing Dashboard visual audit workflow to representative game routes and global shell components.
- [x] Add deterministic screenshot tests using stable data fixtures, paused animation, controlled fonts, fixed timestamps, and predictable viewport settings.
- [x] Maintain a fast pull-request smoke matrix: essential routes × default/alternate/premium theme × mobile/desktop.
- [x] Run a fuller scheduled or pre-release matrix including tablet, reduced motion, density, and non-default accents.
- [x] Add targeted lint/checks to flag hard-coded primary UI colors outside approved decorative exceptions and new duplicate global selectors.
- [x] Require a design-consistency section in PR templates with theme, mobile, and shared-component checkboxes.
- [x] Include keyboard-focus, contrast, accessible names, and overflow checks alongside visual comparison.
- [x] Maintain an explicit allowlist for intentional custom art, canvas, game boards, and semantic status colors.
- [x] Document screenshot baseline updates and require human review for changed screenshots.
- [x] Triage CI failures, PR review comments, regressions and final visual differences before merge.

**Deliverables:** Game-wide visual workflow, review checklist, screenshot baseline policy, completed 2.0 consistency audit.

**Acceptance criteria / hard 2.0 release gate**

- [x] All core player-facing routes have completed the migration or an approved documented exception.
- [x] No critical mobile navigation, theme, contrast, or scrolling defects remain.
- [x] Shared controls and selected themes are visually consistent across audited screens.
- [x] Typecheck, relevant unit/integration tests, visual smoke tests, and accessibility checks pass.
- [x] CI and review rules prevent easy reintroduction of hard-coded conflicting UI styles.
- [ ] The beta build is reviewed visually before the live 2.0 release.

## 5. Page audit priority

| Priority | Areas | Why first |
|---|---|---|
| P0 | Global Shell, sidebar, mobile tabs/sheet, Dashboard | Visible on nearly every session; defects spread across the game |
| P0 | Scout, Produce, Combat/Raids, Turf, Travel | Central gameplay loop, heavy interaction and responsive behavior |
| P0 | Theme system, supporter site themes, profile accent | Core personalization promise and monetized cosmetics |
| P1 | Quests, Stores, Crew, Hideout, Supply, XP/Street Pass | High page complexity and progression/economy UX |
| P1 | Casino and Sportsbook | Highly customized screens with touch and animation exceptions |
| P2 | Alliances, Contacts, Rankings, Profile, Activity, Events, Surveys | Retain distinctive content while standardizing common controls |
| P2 | Info pages, account, onboarding, Admin | Broader consistency and maintenance quality; no gameplay regression |

**Operational recommendation:** Complete A → B → C → D, then tackle E1/E2/E3/E4 in small PRs while applying F throughout. Use G from early in the process, then enforce its full release gate after migration.

## 6. Definition of done for every UI PR

- [ ] Uses the documented design tokens and appropriate shared components.
- [ ] Respects user accent, selected site theme, premium cosmetic settings, density and reduced motion.
- [ ] Tested on desktop and mobile; no clipped text, blocked action, scrolling regression or unexpected navigation jump.
- [ ] Default, active, hover, focus, disabled, loading, success, warning and error states reviewed as relevant.
- [ ] Preserves functional behavior, URL routing, existing game state and server contracts.
- [ ] Before/after screenshots included when the change is visual.
- [ ] Relevant tests and typecheck pass; CI comments/review findings are addressed before merge.
- [ ] Any exception to the system is documented rather than silently hard-coded.

## 7. Risks and safeguards

| Risk | Mitigation |
|---|---|
| Theme overrides unexpectedly alter other pages | Scope changes to tokens/components; screenshot-test multiple pages and themes |
| Moving CSS imports changes cascade behavior | Inventory and test in small PRs; avoid unverified mass deletions |
| Premium visuals lose their unique look | Treat artwork/canvas as explicit exceptions; keep decorative customization separate from UI controls |
| Mobile scroll gestures regress | Automated touch checks and manual on-device testing in every related PR |
| Giant all-at-once redesign causes merge conflicts | Ship in independent batches; isolate shared-system PRs before page migrations |
| Dynamic content makes screenshots flaky | Stable fixtures, fixed clocks, reduced animation, defined test fonts |
| False positives from hard-coded color checks | Only restrict standard UI selectors; allow documented art/semantic-color exceptions |
| Accessibility suffers under bright/dark custom themes | Check text contrast, controls/focus visibility, and selected states across themes |

## 8. Suggested implementation / PR sequence

1. `ui-consistency-2.0-a-audit`
2. `ui-consistency-2.0-b-tokens`
3. `ui-consistency-2.0-c-components`
4. `ui-consistency-2.0-d-themes`
5. `ui-consistency-2.0-e1-core-loop`
6. `ui-consistency-2.0-e2-progression-economy`
7. `ui-consistency-2.0-e3-social-casino`
8. `ui-consistency-2.0-e4-admin-edge`
9. `ui-consistency-2.0-f-mobile-a11y`
10. `ui-consistency-2.0-g-ci-release-gate`

PR names are suggestions; base each implementation branch on the current `beta`, verify compatibility with in-flight UI work, and merge only after checks and review comments are addressed.

## 9. First work item to start immediately

**Slice A, Task 1: UI drift inventory.** Build `docs/UI-AUDIT-2.0.md` with a row for every actual game route, screen captures at defined viewports, screenshots of three theme combinations, mismatched classes/overrides and severity ratings. Rank the first P0 fixes. Do not start changing the entire site's CSS before the inventory is finished.

## 10. What success looks like to players

A player can go from **Dashboard → Scout → Produce → Turf → Quests → Stores → Casino → Profile** and feel a continuous visual language: the same panel system, readable labels, familiar actions, consistent feedback, stable navigation and their chosen color/theme throughout. The content and atmosphere change to fit each feature; the basic interface does not.

---

**Recommended 2.0 milestone:** Treat visual consistency, theme coverage and mobile reliability as release blockers, not optional finishing touches.
