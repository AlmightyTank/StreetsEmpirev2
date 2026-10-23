# UI visual QA and 2.0 release gate

This is the operational policy for Slice G of the UI Consistency 2.0 roadmap. The automated gate is implemented by [Game UI Visual Audit](../.github/workflows/game-ui-visual-audit.yml).

## CI matrices

### Pull-request smoke matrix

UI-affecting pull requests run seven essential routes across three deterministic presentations:

- 390×844, default theme and accent;
- 1440×900, alternate `midnight-market` theme with blue accent;
- 1440×900 rail navigation, premium `federal-case` theme, gold accent and compact density.

Routes cover authentication, Dashboard/global shell, Scout, Combat, Stores, Casino and Rankings. Each row checks page overflow, touch targets, keyboard focus and skip navigation, accessible names, WCAG 2.2 AA axe rules, browser errors and route-specific responsive behavior. Screenshots and reports are uploaded from both shards even when a check fails.

### Scheduled and release matrix

The Tuesday scheduled run and manual workflow dispatch use the 360/390/768/1440 responsive matrix across twelve representative route families. It includes default and premium themes, non-default accents, comfortable and compact density, reduced motion, mobile pull navigation, overlay scroll locking, sticky action clearance, and Store/Casino shared-shell scroll retention.

Large matrices stay split into isolated shards because the development API has a server-wide request throttle. Each job gets its own PostgreSQL service and deterministic test player.

## Deterministic capture contract

`scripts/qa/ui-audit.mjs --deterministic` provides the capture contract:

- isolated seeded database and a fixed audit-player identity;
- fixed browser clock (`2030-01-15T12:00:00Z`);
- fixed Chromium and viewport definitions in CI;
- reduced-motion emulation plus paused CSS animation/transitions/caret;
- `document.fonts.ready` before measurement and capture;
- forced theme, accent, density and sidebar mode per matrix row;
- screenshots only after network idle, the audit settle window and intro dismissal.

Dynamic IDs are discovered from the fixture API rather than embedded in the workflow. Secrets and real player credentials must never be used for screenshot generation.

## Screenshot review and baseline updates

Screenshots are review artifacts, not self-approving golden images. Chromium/font rasterization changes can produce meaningless pixel noise, so a human reviewer owns visual comparison while structural, accessibility and runtime failures remain hard CI errors.

When a screenshot changes:

1. Download both `game-ui-visual-audit-*` artifacts from the PR check.
2. Compare every changed route at phone and desktop sizes; include tablet when layout behavior changed.
3. Confirm the change is intentional for default, alternate and premium themes, including focus/disabled/loading/error states where applicable.
4. Add before/after images to the PR description and check the design-consistency checklist.
5. Do not approve a new visual baseline to hide overflow, contrast, focus, touch, script or axe failures.
6. For an intentional matrix or fixture change, update this policy and the workflow in the same PR.

The final beta candidate requires a named human reviewer to approve the generated screenshots before live release. Automation cannot check that box on the reviewer's behalf.

## CSS drift guard

Run:

```sh
npm run qa:ui:styles
```

The guard rejects:

- new hard-coded colors in standard UI declarations outside token definitions, semantic-state selectors and the reviewed art/game-board allowlist;
- new or increased duplicate global selectors for shell and shared component surfaces.

Intentional artwork exceptions live in `scripts/qa/ui-style-allowlist.mjs` with a reason. Existing migration debt is recorded explicitly in `scripts/qa/ui-style-baseline.json`; it is a ceiling, not a preferred pattern. Refresh it only with:

```sh
npm run qa:ui:styles:update
```

Baseline changes require human review. Prefer reducing entries. Never update the baseline merely to make CI green.

## Release checklist

- [x] Every audited route is migrated or has a documented art/data-fixture exception.
- [x] Automated mobile navigation, scrolling, overflow, contrast and accessibility matrices pass.
- [x] Shared controls and selected themes are covered by deterministic smoke and scheduled matrices.
- [x] Typecheck, tests, build, browser smoke and CSS drift guard are available as gates.
- [x] The PR template requires theme, mobile, accessibility, state and screenshot review.
- [ ] A human reviewer has approved the final beta-candidate screenshots for live 2.0 release.

The unchecked item is intentionally release-specific. Record the reviewer and workflow run URL in the release PR rather than editing historical evidence.
