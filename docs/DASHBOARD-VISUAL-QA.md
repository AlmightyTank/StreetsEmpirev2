# Command Center · Dashboard-C visual QA

**Status:** Dashboard-A/B/C code is on PR #279. This document describes the verification gate, not proof that beta or live has received these changes.

## Get actual screenshots before merging

The [Dashboard Visual Audit workflow](../.github/workflows/dashboard-visual-audit.yml) starts an **isolated local test API and PostgreSQL database inside GitHub Actions**, registers a disposable test player and opens the actual Dashboard in Chromium.

- Go to the latest **Dashboard Visual Audit** run in [PR #279](https://github.com/AlmightyTank/StreetsEmpirev2/pull/279/checks).
- Open **Artifacts** and download `command-center-visual-audit`.
- The zip contains `shots/game-phone-360.png`, `game-phone-390.png`, `game-tablet-768.png`, `game-desktop-1024-expanded.png`, `game-desktop-1440-rail.png`, `game-desktop-1920-expanded.png`, `report.md` and `report.json`.
- These are actual screenshots from the code, rendered in Chromium with a **newly created example player**, not from the user's account and not from the previously approved concept art.
- The automated gate checks the order and presence of story, alerts, stats, actions and crew/supply/turf summaries; six KPI/action tiles; two-column action deck on phones; 44px primary touch targets; layout overflow, keyboard focus, browser errors and accessibility issues.
- A failing audit still uploads any screenshots and diagnostic report already produced so the issue can be corrected.

## Repeat on a developer computer

Start the server and game web client with a nonproduction database, then (in a separate terminal) run:

```sh
npm run qa:ui -- --dashboard --shots --strict --base http://127.0.0.1:5173 --out ./dashboard-visual-audit
```

If local player registration is disabled, set `UI_AUDIT_PLAYER` to an existing **throwaway test player's username and password** in your own shell before running. Never put credentials in screenshots, PRs or GitHub issues. The script does not print passwords.

### Reviewer checklist

- [ ] Desktop 1440/1920: no clipped side rails; story/alerts share a row; status, actions and highlights stay readable
- [ ] Desktop 1024 rail/expanded navigation: sidebar shrinks usable content without overflow
- [ ] Tablet 768 and phones 390/360: actions are two columns; long cash/rank/crew values wrap instead of clipping; tap areas work
- [ ] Dark/light accents and supporter shell themes: content remains readable; theme accents continue to apply to the CTA and borders
- [ ] Reduced motion and low-data mode: no necessary action relies on animation or imagery
- [ ] Story available/locked/ready/no current story: appropriate objective, CTA and fallback; no fictitious information
- [ ] No urgent notices vs ordinary reminders vs arrest/serious warnings: red artwork only for genuine danger
- [ ] `#crew-health`, `#crew-inventory`, `#heat` and `#payout` links open their correct disclosure even after manual closure and repeated navigation
- [ ] Keyboard focus is visible, summary elements are operable, heading hierarchy is logical, card actions are reachable
- [ ] Typecheck, unit tests, integration and production build pass on the final PR head

**Release policy:** Keep PR #279 out of beta and live until the visual audit artifacts and UI checks have been reviewed. The visual audit uses a test database and does not deploy any game code.
