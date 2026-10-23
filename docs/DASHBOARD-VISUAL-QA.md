# Command Center · Dashboard-C visual QA

**Status:** Dashboard checks are part of the game-wide UI release gate. A successful workflow is automated evidence, not proof of human beta/live approval.

## Get actual screenshots before merging

The [Game UI Visual Audit workflow](../.github/workflows/game-ui-visual-audit.yml) starts an **isolated local test API and PostgreSQL database inside GitHub Actions**, registers a deterministic test player and opens the actual Dashboard and representative game routes in Chromium.

- Open the latest **Game UI Visual Audit** check for the pull request.
- Download both `game-ui-visual-audit-*` artifacts; routes are split into isolated shards.
- Each artifact contains route/viewport images under `shots/` plus `report.md` and `report.json`.
- These are actual screenshots from the code, rendered in Chromium with a deterministic test player, fixed clock, reduced motion and controlled presentation—not from a real player's account or concept art.
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

**Release policy:** Keep a visual change out of live until the visual-audit artifacts and UI checks have been reviewed. The audit uses an isolated test database and does not deploy game code. See [the 2.0 visual release gate](UI-VISUAL-QA-RELEASE-GATE.md).
