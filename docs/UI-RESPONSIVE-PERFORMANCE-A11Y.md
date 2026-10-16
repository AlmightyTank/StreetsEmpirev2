# UI consistency 2.0 — Slice F completion record

Slice F makes the existing shared shell reliable at phone, tablet, and desktop sizes without changing game actions, costs, rewards, API calls, or route permissions.

## Responsive contract

- `theme.css` owns phone, tablet, narrow-desktop, and desktop gutters plus safe-area and mobile-navigation offsets.
- The shell, tabbar, sheets, action docks, and shared sticky action footer consume those tokens instead of repeating device-specific numbers.
- Phone content keeps a 10px minimum gutter at 360px and 390px. Tablet and desktop gutters expand without changing the 1320px content maximum.
- Page-level horizontal overflow is prohibited. Tables, game boards, tab strips, receipts, and maps may scroll only inside a visibly bounded local region.
- Sticky actions use `--se-mobile-sticky-offset`, which includes the 60px mobile tabbar and the device bottom safe area.
- Sheet bodies own their vertical scroll with `overscroll-behavior: contain` and `touch-action: pan-y`; they do not transfer scrolling to the locked page behind them.

## Scroll and overlay behavior

`lockPageScroll()` is the shared overlay lock for the All Pages sheet, shared dialog, and notification sheet. It:

1. snapshots both axes and all touched inline styles;
2. locks both the root and body without moving the visible page;
3. reference-counts nested overlays; and
4. restores the exact scroll position and original styles when the final lock closes.

The pull-down gesture remains passive. It opens only after a deliberate 96px predominantly vertical pull from the top of game content, ignores controls and nested scrollers, and coexists with ordinary page scrolling. Mobile shell checks verify short drags do not open it, deliberate pulls do, the directory itself scrolls, closing restores the page, and normal scrolling still works after a tab switch.

Storefront-to-storefront and casino-game-to-casino-game navigation intentionally preserves page position. `shouldPreserveRouteScroll()` documents and unit-tests that policy. Restoration continues through an asynchronous shared-view swap so temporary loading height cannot clamp the page to the top. Hash links, unrelated routes, the casino lobby, browser Back, and browser Forward retain their existing behavior.

## Measured browser evidence

Evidence is under [`ui-audit-2.0/slice-f/`](./ui-audit-2.0/slice-f/). Seven representative route families were exercised at **360×740, 390×844, 768×1024, and 1440×900**:

| Surface | What it covers | Report |
| --- | --- | --- |
| Dashboard | shell, pull-down, overlays, tab switch, card grids | [`dashboard-responsive`](./ui-audit-2.0/slice-f/dashboard-responsive/report.md) |
| Scout | repeat action dock and status rows | [`scout-responsive`](./ui-audit-2.0/slice-f/scout-responsive/report.md) |
| Produce | dense action controls and dock | [`produce-responsive`](./ui-audit-2.0/slice-f/produce-responsive/report.md) |
| Combat | long labels, action readiness, dock | [`combat-responsive`](./ui-audit-2.0/slice-f/combat-responsive/report.md) |
| Stores | contained tabs and storefront scroll retention | [`store-retention`](./ui-audit-2.0/slice-f/store-retention/report.md) |
| Casino Slots | contained game UI, sticky dock, game scroll retention | [`casino-retention`](./ui-audit-2.0/slice-f/casino-retention/report.md) |
| Rankings | dense table/card transformation and long names | [`rankings-responsive`](./ui-audit-2.0/slice-f/rankings-responsive/report.md) |

Across the 28 representative viewport rows there were:

- zero page-level horizontal overflows;
- zero controls below the WCAG 2.2 24px minimum target;
- zero keyboard/skip-link failures;
- zero axe WCAG 2.2 AA violations;
- zero page/script errors; and
- zero responsive interaction, sticky-clearance, overlay-lock, or route-retention failures.

This supplements the Slices B-E exhaustive certification of 91 available route instances at 390px, 768px, and 1440px. Slice F adds the 360px boundary and behavior checks rather than duplicating that full matrix.

## Performance measurement

Measurements use real local Chromium and reduced-motion mode. They are development/localhost diagnostics, not field Core Web Vitals. The audit writes navigation timing, observed LCP, CLS, and long-task details to every `report.json`; performance numbers are advisory while interaction and accessibility failures remain strict.

An optimized Vite build of Dashboard was measured at all four target widths in [`dashboard-production`](./ui-audit-2.0/slice-f/dashboard-production/report.md):

| Metric | Local p50 | Local p95 |
| --- | ---: | ---: |
| DOMContentLoaded | 163ms | 182ms |
| Observed LCP | 716ms | 1,268ms |
| Audit settled (includes network-idle and deliberate 600ms settle) | 3,480ms | 4,482ms |
| Maximum long task | — | 86ms |
| CLS | 0.0000 | 0.0000 |

Measurement first exposed dashboard CLS up to `0.4542`, sourced to the snapshot/story moving when asynchronous onboarding cards appeared above them. The dashboard now holds a viewport-stable loading region until that non-blocking state settles. Re-measurement reduced the optimized-build CLS to `0.0000` at all four widths. No visual effect or theme selector was added to mask the issue.

The generated CSS and main JavaScript bundles remain large (approximately 976KB CSS and 2.43MB JavaScript before gzip). That pre-existing bundling concern is recorded rather than “optimized” without a route/module profile; code splitting and CI budgets belong to the release-guard work in Slice G.

## Accessibility and user preferences

- Audits run with `prefers-reduced-motion: reduce` and existing feature motion fallbacks remain in force.
- Desktop checks require the skip link first and a visible focus indicator on every tab stop.
- Touch checks fail controls under 24px and retain 24–43px targets as advisory opportunities toward the preferred 44px primary target.
- The shared page lock preserves focus-management behavior in dialogs and sheets.
- Screen-reader labels, local scroller names, semantic status text, and axe WCAG 2.2 AA checks remain mandatory even for approved casino/map/art exceptions.

## Reproduction

With PostgreSQL, API, and web client running against nonproduction data:

```powershell
$env:CHROMIUM_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm run qa:ui -- --responsive --dashboard --strict --shots --pace 1200 --base http://127.0.0.1:5173 --out docs/ui-audit-2.0/slice-f/dashboard-responsive
npm run qa:ui -- --responsive --only /game/stores/pip --strict --shots --pace 1200 --base http://127.0.0.1:5173 --out docs/ui-audit-2.0/slice-f/store-retention
npm run qa:ui -- --responsive --only /game/casino/slots --strict --shots --pace 1200 --base http://127.0.0.1:5173 --out docs/ui-audit-2.0/slice-f/casino-retention
```

Use sequential runs: the local API has a server-wide sustained-request throttle. Never commit disposable audit credentials.
