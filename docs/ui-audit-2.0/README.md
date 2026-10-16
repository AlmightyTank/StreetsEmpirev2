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
