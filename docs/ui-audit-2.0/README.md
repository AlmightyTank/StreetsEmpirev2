# UI Consistency 2.0 baseline evidence

This directory holds reproducible Slice A browser evidence. Images are generated from the real local web client with a disposable test player; they are not mockups and must not contain real account credentials.

## Generate the required baseline

With PostgreSQL, API and web client running against nonproduction data:

```sh
npm run qa:ui -- --baseline --dashboard --shots --pace 350 --base http://127.0.0.1:5173 --out docs/ui-audit-2.0/dashboard
npm run qa:ui -- --baseline --shots --only /game/events --pace 350 --base http://127.0.0.1:5173 --out docs/ui-audit-2.0/events
npm run qa:ui -- --baseline --shots --only /game/casino/slots --pace 350 --base http://127.0.0.1:5173 --out docs/ui-audit-2.0/casino-slots
npm run qa:ui -- --baseline --shots --only /login --pace 350 --base http://127.0.0.1:5173 --out docs/ui-audit-2.0/login
```

If registration is closed, set `UI_AUDIT_PLAYER` to a throwaway test account in the shell. Admin evidence additionally needs `UI_AUDIT_ADMIN`. Never commit credentials.

Each output contains:

- `shots/*-phone-390.png`
- `shots/*-tablet-768.png`
- `shots/*-desktop-1440-rail.png`
- `report.md`
- `report.json`

The reports are evidence, not automatic approval. Add `--strict` for a gating run; it may intentionally exit nonzero while still writing useful screenshots and findings.

## Reviewer record

| Sample | 390 | 768 | 1440 | Runtime report | Review |
| --- | --- | --- | --- | --- | --- |
| Dashboard reference | captured | captured | captured | [`dashboard/report.md`](dashboard/report.md): one 16px-high tablet link | Pending human review |
| Events major drift | captured | captured | captured | [`events/report.md`](events/report.md): active-tab text contrast fails at 390 and 1440 | Pending human review |
| Casino exception | captured | captured | captured | [`casino-slots/report.md`](casino-slots/report.md): automated checks pass | Pending human review |
| Login/public form | captured | captured | captured | [`login/report.md`](login/report.md): automated checks pass | Pending human review |

The committed run used a local development server on port 5180 on 2026-10-16 UTC. Across all four samples there was no page-level horizontal overflow, no script error, and desktop focus was visible with the skip link first. Casino and Login had no axe violations or sub-24px targets. Dashboard's `All quests →` link measured 63×16 at 768px. Events produced two serious `color-contrast` instances for `.is-active > small`, at 390px and 1440px. Targets from 24–43px are retained in each report as improvement notes rather than WCAG 2.2 failures.

## Review checklist

- [ ] Shell/sidebar/tabbar geometry is stable and safe-area padding is visible.
- [ ] No page-level horizontal scrolling; intentional table/game scrollers are contained.
- [ ] Chosen accent owns focus, active controls and standard chrome.
- [ ] Route identity remains decorative and never impersonates warning/error state.
- [ ] Themes do not reduce text/control contrast.
- [ ] Keyboard focus order and skip link are visible on desktop.
- [ ] 24px WCAG minimum targets pass; primary touch actions aim for 44px.
- [ ] Reduced motion leaves every state and action understandable.
- [ ] Sticky docks, menus, dialogs, profile cards and cinematic overlays stack correctly.
- [ ] Long values, empty/error/loading/disabled states remain legible.

See [`../UI-AUDIT-2.0.md`](../UI-AUDIT-2.0.md) for the full route matrix, design contract and remediation backlog.

## Slice G CI and release gate

The game-wide [visual QA and release policy](../UI-VISUAL-QA-RELEASE-GATE.md) defines the deterministic PR smoke matrix, scheduled responsive matrix, screenshot review process, approved artwork exceptions and final human beta sign-off. CI runs `scripts/qa/ui-audit.mjs --deterministic` and `npm run qa:ui:styles`; changed screenshots remain review artifacts and never bypass hard overflow, focus, contrast, touch-target, accessible-name or browser-error failures.

## Post-migration evidence (Slices B-E)

The `post-migration/` directory is the after-state and does not replace the Slice A baseline.

| Sample | 390 | 768 | 1440 | Automated result |
| --- | --- | --- | --- | --- |
| [Dashboard](post-migration/dashboard/report.md) | captured | captured | captured | Pass; secondary quest link now meets the 24px minimum target |
| [Events](post-migration/events/report.md) | captured | captured | captured | Pass; previous active-tab contrast defect resolved |
| [Casino exception](post-migration/casino-slots/report.md) | captured | captured | captured | Pass |
| [Login](post-migration/login/report.md) | captured | captured | captured | Pass |
| [Developer gallery](post-migration/ui-gallery/report.md) | captured | captured | captured | Pass across representative theme/accent pairs |

“Pass” means no page-level horizontal overflow, no target under 24px, visible keyboard focus with the skip link first, no axe WCAG 2.2 AA violation, and no script error. Targets measuring 24–43px remain recorded as advisory improvements. The gallery initially exposed low-contrast shared table headings; changing them from `--se-muted` to `--se-text-dim` resolved the issue across the matrix.

## Exhaustive automated certification

The authoritative Slices B-E gate is the [`post-migration/certification/`](post-migration/certification/) matrix:

| Coverage | Reports | Route instances | Viewport rows | Strict failures |
| --- | ---: | ---: | ---: | ---: |
| Public/player canonical routes | 6 | 60 | 180 | 0 |
| Data-backed dynamic and admin routes | 6 | 31 | 93 | 0 |
| **Total** | **12** | **91** | **273** | **0** |

Every row passed page overflow, 24px minimum-target, desktop keyboard/skip-link, axe WCAG 2.2 AA, and script-error checks. The matrix uses 390px with `federal-case`/`crimson`, 768px with `midnight-market`/`blue`, and 1440px with `federal-case`/`gold`.

Run public/player coverage sequentially to stay below the local development API's server-wide throttle:

```sh
npm run qa:ui -- --baseline --strict --shard 1/6 --pace 1400 --base http://127.0.0.1:5173 --out docs/ui-audit-2.0/post-migration/certification/player-public-1-of-6
# Repeat for shards 2/6 through 6/6, changing the output suffix.
```

Admin coverage requires a disposable local admin account supplied through `UI_AUDIT_ADMIN`; never place its password in a command committed to the repository. Run the three admin shards sequentially, then revoke the temporary role:

```powershell
$env:UI_AUDIT_ADMIN = "<temporary-username>:<temporary-password>"
npm run qa:ui -- --baseline --strict --only /game/admin --shard 1/3 --pace 1400 --base http://127.0.0.1:5173 --out docs/ui-audit-2.0/post-migration/certification/admin-1-of-3
# Repeat for shards 2/3 and 3/3.
```

The runner discovers valid fixture-backed URLs for public player profiles, READY aftermath reports, admin rounds/accounts/players, and player-law details. The certification database had no alliance and no forum-link record, so `/game/alliances/:tag` and `/game/forum/:forumUserId` are explicitly fixture-dependent. No fake persistent content was created to make those URLs pass. The automated result is complete for every available route fixture; the human visual-review checklist above remains a separate approval gate.

## Slice F responsive and interaction evidence

[`slice-f/`](slice-f/) adds the 360px boundary and active behavior checks at 360, 390, 768, and 1440. The seven representative route reports cover the Dashboard, Scout, Produce, Combat, Stores, Casino Slots, and Rankings. All 28 viewport rows pass strict page-overflow, minimum-target, keyboard, axe, script, vertical-scroll, sticky-clearance, nested-scroll, and route-retention checks.

The pull-down check distinguishes a short ordinary drag from a deliberate gesture, verifies the top sheet and its internal scroll, closes it with exact page-position restoration, exercises the bottom More sheet, and confirms vertical scrolling after a mobile tab switch. Store and casino reports separately verify their intentional shared-shell scroll retention.

The optimized-build Dashboard performance sample is [`slice-f/dashboard-production/report.md`](slice-f/dashboard-production/report.md). See [`../UI-RESPONSIVE-PERFORMANCE-A11Y.md`](../UI-RESPONSIVE-PERFORMANCE-A11Y.md) for measurements, contracts, and reproduction commands.
