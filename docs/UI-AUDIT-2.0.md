# UI consistency 2.0 — Slice A audit and baseline

**Audit date:** 2026-10-15  
**Scope:** web client on `beta`; inventory and evidence only  
**Visual-change policy:** no production UI rules or components were changed in Slice A

This is the source-of-truth worksheet for the UI Consistency 2.0 work. It classifies every route declared by `apps/web/src/App.tsx`, records the current cascade and shell contract, and turns observed drift into an ordered implementation backlog.

## Status legend

- **Compliant** — currently follows shared shell/tokens/primitives closely enough to use as a reference.
- **Minor drift** — sound shared structure with a local hero, tabs, table, spacing, or responsive rule to normalize.
- **Major drift** — page chrome or interaction styling bypasses the chosen accent/shared surface contract.
- **Documented exception** — intentionally art-directed content; shared shell, controls, focus and semantic states are still in scope.
- **Redirect / conditional** — no independent screen; audit the destination and preserve the route behavior.

These are static-review classifications, not claims that runtime accessibility checks passed. Runtime evidence and its reproducible command are tracked in [`ui-audit-2.0/README.md`](./ui-audit-2.0/README.md).

## Executive baseline

| Area | Baseline finding | Slice B/C implication |
| --- | --- | --- |
| Stylesheet surface | 58 local CSS files, 1,326 hex literals and 51 `!important` declarations | Establish cascade layers/token ownership before broad visual edits |
| Global order | Bootstrap plus 52 eager local CSS imports in `apps/web/src/main.tsx`; route-local CSS can load after the global bundle | A file described as “last” is not necessarily authoritative |
| Token ownership | `theme.css` defines base values; `polish.css` changes the effective house palette; `site-themes.css` replaces full surface palettes | Name one canonical layer for primitives and one controlled theme layer |
| Geometry | Base panels are 3px, polish uses 4/6px, app shell uses 7px, authenticated shell ends at 10px panels/12px heroes | Standardize by component role, not by import order |
| Route identity | Fixed route colors tint standard panels, tables, headings and hero borders | Restrict identity to decorative art; chosen accent owns interactive and standard chrome |
| Route coverage | Many current routes fall through `routeIdentity()` to generic `game` | Make route identity exhaustive or derive it from route metadata |
| Shared primitives | `Panel`, `Row`, `Stat`, `Button`, `Field`, and `Alert` are well used; page headers/tabs/tables are not standardized | Add the missing page-level primitives in Slice C |
| Shell/overlays | Working responsive shell and focus-trapped mobile sheet, but ad-hoc z-index values span -1 to 2,147,483,000 | Adopt a named layer scale and portal policy |
| Motion | Global `.se-reduced-motion` fallback exists and major animated features add media-query fallbacks | Keep both user-setting and OS-setting paths; runtime-check every new animation |

## Route worksheet

### Public and account routes

| Route | Screen / behavior | Classification | Evidence / action |
| --- | --- | --- | --- |
| `/` | Game entry / landing | Minor drift | Public shell is shared; landing has a fixed route accent rather than the selected accent contract |
| `/register` | Registration | Compliant | Shared `Panel`, `Button`, `Field`, `Alert`; auth identity is decorative |
| `/login` | Login | Compliant | Reference public form |
| `/forgot-password` | Recovery request | Compliant | Shared form primitives |
| `/reset-password` | Token-based reset | Compliant | Shared form primitives; runtime fixture requires a valid token |
| `/verify-email` | Token-based verification | Compliant | Shared panel/alert; runtime fixture requires a valid token |
| `/account` | Account settings | Compliant | Uses all four core controls in shared shell |
| `/account/forum-link` | Forum account link | Minor drift | Shared panel/button/alert; verify callback/error states at all widths |
| `/join` | Round onboarding | Compliant | Shared panel/button/alert |
| `*` | Not found | Documented exception | Art-directed easter-egg screen; keyboard, contrast and reduced-motion still apply |

### Player routes

| Route | Classification | Main audit note |
| --- | --- | --- |
| `/game` | Compliant | **Primary authenticated reference.** Shared shell and strong responsive structure; cinematic art colors are content-level exceptions |
| `/game/combat` | Minor drift | Shared primitives; custom raid hero and route tint |
| `/game/scout` | Compliant | **Action-page reference.** Token-aware hero and shared controls |
| `/game/quests` | Minor drift | Shared primitives; large local ruleset and custom tabs/cards |
| `/game/events` | Compliant | Slice B migrated standard chrome to selected accent and semantic state tokens |
| `/game/xp-progress` | Compliant | Shared `Panel`; no independent palette |
| `/game/surveys` | Redirect / conditional | Redirects to the surveys section in News; audit `/game/news` and hash focus |
| `/game/hideout` | Minor drift | Shared primitives with a large page-specific visual system |
| `/game/products` | Redirect / conditional | Legacy route redirects to `/game/stores/pip` |
| `/game/produce` | Compliant | **Dense action reference.** Shared controls and established action layout |
| `/game/street-pass` | Minor drift | Custom pass hero/progression surface; standard controls mostly shared |
| `/game/collection` | Documented exception | Cosmetic preview deliberately renders owned accent/theme samples; surrounding controls must remain viewer-theme aware |
| `/game/supporter` | Minor drift | Shared panels; custom purchase/tier cards need token verification |
| `/game/stores` | Compliant | **Tabbed/list reference.** Shared shell and token-aware store navigation |
| `/game/stores/:slug` | Compliant | Dynamic store detail uses shared store system; audit long names and unavailable stock |
| `/game/supply` | Minor drift | Shared primitives but route-local stylesheet and specialized network cards |
| `/game/holdings` | Compliant | Slice E uses shared page header, panel loading, empty state and tokenized facts/actions |
| `/game/loans` | Minor drift | Shared controls; route-local `supply.css` + `loans.css` import order needs containment |
| `/game/dealers` | Minor drift | Shared controls; route-local supply styling |
| `/game/crew` | Minor drift | Management canvas remains specialized; private palette and fixed standard surfaces migrated to shared tokens |
| `/game/casino` | Documented exception | Venue/game art may keep felt, card, wheel and cabinet colors; shell/forms/tabs/focus remain governed |
| `/game/casino/:game` | Documented exception | Same exception; each game state must still pass overflow/motion/keyboard checks |
| `/game/travel` | Compliant | **Map/workflow reference.** Route art is content-specific; controls remain shared |
| `/game/turf` | Documented exception | District owner/road/water colors carry map meaning; surrounding panels and actions remain governed |
| `/game/operations` | Compliant | Slice E uses shared page header, status badge and empty state; operation layout remains feature-specific |
| `/game/black-book` | Compliant | Slice E uses shared header, status and empty patterns with defined semantic tokens |
| `/game/blocks` | Redirect / conditional | Legacy route redirects to `/game/turf` |
| `/game/cities` | Redirect / conditional | Legacy route redirects to `/game/travel` |
| `/game/rankings` | Minor drift | Shared structure; fixed gold route identity colors standard chrome |
| `/game/round-archive` | Minor drift | Public flag may redirect; custom aftermath styling when enabled |
| `/game/rounds/:roundId/aftermath` | Documented exception | Editorial/cinematic round recap; shared accessibility contract still applies |
| `/game/alliance` | Compliant | Shared panels/buttons/fields and established social layout |
| `/game/alliances` | Redirect / conditional | Redirects to `/game/alliance#alliance-rankings`; verify hash focus |
| `/game/contacts` | Redirect / conditional | Redirects to `/game/players#contacts`; verify hash focus |
| `/game/console` | Compliant | **Dense data reference.** Shared panel/alert and responsive console layout |
| `/game/players` | Compliant | Shared search/actions and social layout |
| `/game/alliances/:tag` | Minor drift | Dynamic detail shares alliance visual system; long tag/name fixture required |
| `/game/hall-of-fame` | Minor drift | Public data screen; fixed silver identity and custom table presentation |
| `/game/profile` | Documented exception | Owned cosmetic art may override profile content only; viewer shell must not be replaced |
| `/game/forum/:forumUserId` | Documented exception | Public profile variant; same containment requirement |
| `/game/players/:publicPimpId` | Documented exception | Public profile variant; same containment requirement |
| `/game/activity` | Redirect / conditional | Redirects to `/game/console?view=activity` |
| `/game/news` | Compliant | Shared public/in-game layout; survey target lives here |
| `/game/status` | Compliant | Shared panels and semantic status treatment |
| `/game/rules` | Compliant | Shared panel and public/in-game shell behavior |
| `/game/report-bug` | Compliant | Shared form primitives; add long validation-message fixture |
| `/game/reputation` | Redirect / conditional | Redirects to `/game/quests#contact-standing`; verify hash focus |

### Admin routes

Admin pages intentionally share one red administrative identity, but red must identify the workspace—not turn neutral controls into danger controls. Static review shows consistent use of `AdminWorkspace`, `Panel`, `Alert` and shared controls. The workspace is **minor drift** as a group because route identity currently recolors standard panel/table chrome.

| Route | Classification | Fixture / note |
| --- | --- | --- |
| `/game/admin` | Redirect / conditional | Redirects to rounds |
| `/game/admin/rounds` | Minor drift | Admin index and round controls |
| `/game/admin/rounds/:roundId` | Minor drift | Dynamic round fixture |
| `/game/admin/news` | Minor drift | Editor/forms |
| `/game/admin/accounts` | Minor drift | Search/table |
| `/game/admin/accounts/:accountId` | Minor drift | Dynamic account fixture |
| `/game/admin/supporters` | Minor drift | Supporter table/actions |
| `/game/admin/players/:roundPlayerId` | Minor drift | Dynamic player fixture |
| `/game/admin/quests` | Minor drift | Dense content editor |
| `/game/admin/surveys` | Minor drift | Results/editor |
| `/game/admin/integrations` | Minor drift | Connection states |
| `/game/admin/rulesets` | Minor drift | Dense form/data |
| `/game/admin/signals` | Minor drift | Signal table |
| `/game/admin/audit` | Minor drift | Audit table |
| `/game/admin/events` | Minor drift | Event editor; semantic state colors are valid |
| `/game/admin/reports` | Minor drift | Moderation states |
| `/game/admin/bugs` | Minor drift | Bug workflow states |
| `/game/admin/economy` | Minor drift | Dense dashboard |
| `/game/admin/supply` | Minor drift | Dense dashboard |
| `/game/admin/loans` | Minor drift | Financial table/actions |
| `/game/admin/casino` | Minor drift | Operational controls; game artwork not required here |
| `/game/admin/factions` | Minor drift | Dense dashboard |
| `/game/admin/crew` | Minor drift | Crew data table |
| `/game/admin/vehicles` | Minor drift | Vehicle data table |
| `/game/admin/law` | Minor drift | Law dashboard |
| `/game/admin/players/:roundPlayerId/law` | Minor drift | Dynamic player-law fixture |
| `/game/admin/combat` | Minor drift | Combat operations |
| `/game/admin/turf` | Minor drift | Map/operations data |
| `/game/admin/monitoring` | Minor drift | Monitoring/status density |

## Inventory

### Layout and theme path

1. `App.tsx` applies account/playable/admin/live-round guards.
2. `GameRouteLayout` keeps one persistent `Shell` and chooses public or authenticated game layout.
3. `GameLayout` provides desktop sidebar, 4 configurable mobile tabs, focus-trapped More sheet, gamebar, banners and route-scroll behavior.
4. `Shell` applies `se-route--*`, selected `se-site-accent--*`, shell `se-site-theme--*`, density and reduced-motion classes.
5. `pageTheme` previews profile/collection content. `takeShell` is the explicit opt-in for a preview to own the surrounding shell.

Theme precedence observed in `Shell.tsx`:

```text
collection takeover (takeShell=true)
  > selected account shell theme
  > no shell theme while a contained profile preview is active
```

The content preview/decor may use a different theme from the viewer shell. Preserve this boundary.

### Shared primitive coverage

| Primitive | Contract | Adoption finding |
| --- | --- | --- |
| `Panel`, `Row`, `Stat` | Shared surface, title/aside/body, key-value rows, semantic meter tones | Broadly adopted; absent on art-led archive/profile/collection/black-book screens |
| `Button` | Native button props plus accessible `disabledReason` | Broadly adopted; local tab/chip/button patterns remain |
| `Field` | Label, hint, error, generated IDs, `aria-invalid` and descriptions | Strong on auth/admin/account; input-only API does not cover select/textarea |
| `Alert` | error/warning/info/success with alert/status roles | Broad adoption and useful reference implementation |
| Missing | Page header/hero, tabs, table wrapper, empty/loading state, select/textarea field | Repeated custom implementations are the largest component-level consistency gap |

### Theme, accent and stylesheet inventory

Observed shell themes in `site-themes.css`: `back-office`, `blackwood-manor`, `blue-heat`, `casino-floor`, `dragon-fire`, `dragon-ice`, `federal-case`, `halloween-moon`, `midnight-market`, `motor-city-iron`, `neon-vice`, `open-road`, `rain-city-wire`, `street-pass-s1-night-drive`, and `winter-lights`.

Observed accent selectors: `default`, `blue`, `crimson`, `gold`, `green`, `purple`, `cartel-jade`, `civic-seal`, `clean-books-ivory`, `clean-slate-ice`, `corner-amber`, `enforcer-red`, `gavel-bronze`, `ghost-violet`, `kings-gold`, `neon-sign-pink`, `night-map-plum`, `open-road-blue`, `original-neon`, `outfit-oxblood`, `saints-chrome`, `sunset-coral`, `top-shelf-teal`, and `velvet-rose`.

All 58 files under `apps/web/src/styles/` were included in the static scan:

```text
account-settings.css, action-experience.css, activity.css, admin.css,
admin-workspace.css, aftermath.css, alliance.css, app-shell.css,
black-book.css, career-experience.css, casino.css, casino-experience.css,
city-blocks.css, collection.css, community.css, console.css, contacts.css,
crew-roster.css, crew-team.css, dashboard.css, dashboard-cinematic.css,
dashboard-final-polish.css, dock.css, easter-eggs.css, economy-experience.css,
empire-management.css, encounter-cinema.css, events.css, experience-shell.css,
hideout.css, items.css, loans.css, mobile.css, navigation.css, operations.css,
page-identities.css, players.css, polish.css, produce.css, profile.css,
profile-hover.css, public-info.css, quests.css, raids.css, rankings.css,
release.css, scout.css, site-themes.css, social-experience.css, stability.css,
stores.css, street-pass.css, supply.css, supporter.css, surveys.css, theme.css,
travel.css, ux.css
```

### CSS loading and cascade map

`apps/web/src/main.tsx` imports Bootstrap first, then these waves:

| Wave | Files | Risk |
| --- | --- | --- |
| Foundation | `theme.css`, `site-themes.css`, `community.css`, `stability.css`, `polish.css`, `release.css`, `mobile.css`, `navigation.css` | Base tokens are changed by polish and themes before feature rules |
| Feature pages | `hideout.css` through `public-info.css` | Each page invents local anatomy; global selectors also appear here |
| Identity/shell | `page-identities.css`, `ux.css`, `dock.css`, `app-shell.css`, `account-settings.css`, `experience-shell.css` | Page identity and authenticated shell override earlier primitives |
| Late experience | `easter-eggs.css` through `dashboard-final-polish.css` | Twelve files follow `app-shell.css`; feature selectors can win by order/specificity |
| Route-local | `casino.css`, `casino-experience.css`, `crew-roster.css`, `crew-team.css`, `supply.css`, `loans.css` imported from pages/components | Lazy chunk timing can place route CSS after the eager cascade |

Confirmed cascade conflicts:

1. `theme.css` defines the base palette; `polish.css:3-17` changes every principal neutral token.
2. Panel radius progresses from `theme.css` 3px → `polish.css` 6px → `app-shell.css` 7px → `experience-shell.css` 10px for authenticated surfaces.
3. `page-identities.css:44-80` recolors shared panels, stats, tables, panel headers and page heads using a fixed route accent.
4. `site-themes.css` is described as visual-only but replaces surfaces/text/accent and restyles shared panels, inputs, buttons, topbar and footer.
5. `experience-shell.css:47-63` enumerates known hero classes; newer Events, Collection, Supporter, Operations, Black Book, Holdings and Crew heroes are not all included.
6. `black-book.css` expects `--se-border` and `--se-text-muted`, which are not foundation tokens. `casino.css` defines aliases only inside `.se-casino`; route chunk presence must never supply another page's contract.

## Hard-coded color taxonomy

Hard-coded color is not automatically a defect. Classify it by responsibility:

| Category | Allowed? | Examples | Rule |
| --- | --- | --- | --- |
| Semantic state | Yes, through semantic tokens | success, warning, danger, disabled, heat/health thresholds | Never use the user accent to communicate state |
| Data/category identity | Yes, documented | district owners, roulette red/black/green, card suits, rarity tiers | Must have text/icon/pattern reinforcement; color cannot be the only cue |
| Illustration/material | Yes, contained exception | casino felt/cards/cabinets, map water/roads, profile frames, encounter cinema, dashboard scene art | May not leak into shared buttons, tabs, focus rings or neutral panels |
| Route decoration | Yes, limited | background texture, illustration rule, noninteractive motif | Chosen accent still owns interactive and standard component chrome |
| Standard UI chrome | No | panel/table borders, active tabs, meters without semantic meaning, generic labels | Replace with shared surface/accent/semantic tokens |

Priority violations:

- `events.css:13-52`: fixed `#f1b622` is used for standard hero, selected tab, meter and labels. Proposed fix: route decoration may expose an event-art token; active tabs and progress use `--se-accent`, semantic event state uses good/warn/bad.
- `page-identities.css:44-80`: route color owns standard panels/tables/headers. Proposed fix: remove standard chrome selectors and retain only contained pseudo-elements/background motifs.
- `crew-roster.css`: private `--se-gold`, `--se-text-muted` and warm fallback palette. Proposed fix: map neutral/interactive styles to foundation tokens and reserve crew status colors for semantic state.
- `black-book.css:2-16`: undefined aliases plus fixed card-state colors. Proposed fix: use `--se-line`/`--se-text-dim`; promote confirmed/likely states to named semantic/domain tokens with non-color labels.

## Shell, mobile and overlay audit

### Geometry contract observed

| Item | Current effective contract |
| --- | --- |
| Desktop breakpoint | `900px` |
| Sidebar | 232px expanded; 208px at 900–1199px; 68px rail |
| Desktop topbar | 58px shell token |
| Content max | 1320px |
| Mobile tabbar | 60px + safe-area inset |
| Sticky action dock | layer 30; on mobile sits above tabbar by `60px + 8px + safe-area` |
| Authenticated panel radius | 10px |
| Standard authenticated hero radius | 12px, but only for the enumerated hero list |

### Overlay findings

Current significant layers are 30 (dock), 40 (tabbar/help), 55/60/70 (shell/decor/topbar/rules), 80 (confirm), 90 (More sheet/account menu), 98/99/100 (legacy dialogs), 220 (encounter cinema), 1,000 (skip link), 3,000 (profile hover), and 2,147,483,000 (easter egg).

Proposed named scale for Slice B:

```text
content 0       sticky 30       navigation 50
popover 100     modal 200       cinematic 300
accessibility 900              debug/easter-egg 1000
```

The exact numbers matter less than one owner per layer. Portaled overlays must document whether they sit above modal/cinematic content. The mobile More sheet already has a focus trap, Escape/close path and body scroll lock; retain those behaviors during restyling.

## Accessibility and interaction baseline

Static evidence:

- Skip link and visible focus rules exist; the browser runner checks the first 12 desktop tab stops.
- `Field` wires label, hint and error IDs; `Button` explains disabled actions.
- Mobile More sheet traps focus and locks scrolling.
- `.se-reduced-motion` globally collapses animation/transition durations; major animated files also include `prefers-reduced-motion` rules.
- Tables commonly use a local horizontal wrapper rather than forcing page overflow.

Runtime gate in `scripts/qa/ui-audit.mjs` checks:

- page-level horizontal overflow and likely offending elements;
- touch targets below 24px and notes targets below 44px;
- skip-link order and visible focus;
- axe WCAG 2.2 A/AA findings, including contrast;
- browser errors;
- reduced-motion rendering;
- expanded/rail navigation and representative shell theme/accent combinations.

Remaining manual checks: transition continuity across navigation, heading hierarchy, tooltip disclosure, non-color status cues, sticky controls over the mobile keyboard, and representative loading/empty/error/long-content states.

## Reference set and baseline matrix

| Role | Route | Why selected |
| --- | --- | --- |
| Authenticated shell | `/game` | Most complete shell, responsive and summary composition |
| Dense action flow | `/game/produce` | Shared actions/panels with high information density |
| Search/tab/detail | `/game/stores` and `/game/stores/pip` | Established responsive tabs and detail pattern |
| Map/workflow | `/game/travel` | Valid contained data-art exception plus standard controls |
| Social/data | `/game/players` and `/game/console` | Search, tables, feeds and long-value pressure |
| Public form | `/login` | Minimal shared-form reference |
| Admin | `/game/admin/rounds` | Workspace navigation, form and table baseline |
| Former drift baseline | `/game/events` | Slice A evidence captures the pre-migration fixed-color chrome |
| Exception sample | `/game/casino/slots` | Demonstrates containment boundary between game art and shell |

Required baseline widths:

| Width | Navigation | Forced theme | Forced accent | Checks |
| --- | --- | --- | --- | --- |
| 390×844 | Mobile tabbar + More | `federal-case` | `crimson` | safe areas, sticky dock, tap targets, overflow |
| 768×1024 | Mobile/tablet layout | `midnight-market` | `blue` | intermediate wrapping, touch, tables |
| 1440×900 | Desktop rail | `federal-case` | `gold` | rail geometry, focus order, max width, overlays |

The full runner adds 360/base theme/default accent, 1024 expanded/casino/green, and 1920 expanded/midnight/purple. Theme/accent classes are forced only for presentation; permissions and data still come from the audit account.

### Captured Slice A evidence

The committed 390/768/1440 evidence under [`docs/ui-audit-2.0/`](./ui-audit-2.0/) covers Dashboard, Events, Casino slots and Login. The automated run found no page-level overflow or script errors in any sample, and desktop focus was visible with the skip link first.

- Dashboard: no axe violations; one tablet target failure (`All quests →`, 63×16).
- Events: no target or overflow failures; two serious `color-contrast` instances on `.is-active > small` at 390 and 1440. This independently confirms the fixed-color standard-chrome classification.
- Casino slots: no axe, minimum-target, overflow or script-error failures; its art exception remains contained in this sample.
- Login: no axe, minimum-target, overflow or script-error failures.

These results are a reproducible technical baseline, not visual approval. The final completion item remains open until a reviewer signs off on the images and manual checklist.

## Prioritized remediation list

### P0 — establish ownership before visual implementation

1. **Define cascade layers and one primitive owner.** Source: `main.tsx`, `theme.css`, `polish.css`, `app-shell.css`, `experience-shell.css`. Proposed fix: explicit reset/tokens/base/components/layout/pages/themes/utilities ordering; route chunks stay in the page layer.
2. **Separate route decoration from chosen accent.** Source: `page-identities.css:44-80`. Proposed fix: page identity can style contained art/pseudo-elements only; `--se-accent` controls interaction/focus/standard chrome.
3. **Remove undefined token aliases.** Source: `black-book.css`, `crew-roster.css`, `crew-team.css`, `casino.css`. Proposed fix: foundation tokens use one vocabulary; feature-only aliases are scoped and declared at their feature root.
4. **Create a named overlay scale.** Source: shell/navigation/ux/cinema/profile/easter-egg styles. Proposed fix: layer tokens plus a documented portal hierarchy.
5. **Keep audit coverage synchronized with `App.tsx`.** Source: `scripts/qa/ui-audit.mjs`. Slice A expands canonical player/admin routes and adds `--baseline` plus explicit accent coverage.

### P1 — converge page anatomy

1. Introduce shared page header/hero, tabs, table, empty/loading/error and select/textarea field primitives.
2. Normalize Events, Crew, Operations, Black Book and Holdings first.
3. Make `routeIdentity()` exhaustive or generated from centralized route metadata.
4. Replace enumerated hero selector lists with a shared class/component contract.
5. Add long-content fixtures for names, currency, tags, validation and translated copy.

### P2 — contain intentional art systems

1. Document and enforce boundaries for Casino, Turf maps, Profile/Collection cosmetics, Aftermath and cinematic Dashboard content.
2. Require semantic and data colors to have non-color cues.
3. Test default theme plus at least three shell themes and light/dark accent values in CI sampling.
4. Add visual-diff review only after cascade ownership is stable; otherwise snapshots will encode accidental order.

### Slices B-E resolution

The P0 ownership items and first P1 migration wave were implemented after this baseline. See [`UI-CSS-ARCHITECTURE.md`](./UI-CSS-ARCHITECTURE.md) and [`UI-MIGRATION-B-E.md`](./UI-MIGRATION-B-E.md). The Slice A screenshots above intentionally remain unchanged as before-state evidence.

### Post-migration technical certification

The automated Slices B-E gate is complete. Twelve sequential strict reports under the [`certification` evidence directory](./ui-audit-2.0/post-migration/certification/README.md) cover 91 discovered route instances and 273 viewport rows. All rows report:

- zero page-level horizontal overflow;
- zero interactive targets below 24px;
- visible desktop keyboard focus with the skip link first;
- zero axe WCAG 2.2 AA violations; and
- zero script or page errors.

The route matrix includes canonical public/player/admin routes plus fixture-backed dynamic public profiles, READY round aftermath, admin round/account/player, and player-law pages. No alliance or forum-link fixture existed in the local audit database, so `/game/alliances/:tag` and `/game/forum/:forumUserId` remain documented fixture-dependent exceptions. Their shared shell and component families are exercised by the canonical social/profile routes. Sequential sharding is required because the local development API's server-wide throttle can create false failures during a monolithic run.

This technical certification does not mark the human visual-review item below as approved.

## Slice A completion gate

- [x] Every declared route is classified, including redirects, dynamic routes and wildcard.
- [x] Pages, layouts, primitives, styles, themes and route-local styles are inventoried.
- [x] High-priority conflicts name their source and proposed fix.
- [x] Hard-coded colors are classified as semantic/data/art/decorative/invalid chrome.
- [x] Shell, mobile navigation, sticky controls, overlays and theme precedence are documented.
- [x] Keyboard, contrast, overflow, motion and transition checks have an executable gate.
- [x] Reference routes and 390/768/1440 baseline matrix are defined.
- [x] Remediation work is ordered P0/P1/P2.
- [x] Slice A introduces no production visual changes.
- [ ] A reviewer has approved the generated screenshots and runtime report; this is intentionally a human sign-off.
