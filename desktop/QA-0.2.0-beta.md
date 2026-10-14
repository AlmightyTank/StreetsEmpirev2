# StreetsEmpire Desktop 0.2.0 Beta — Manual Smoke QA

This file records the required manual smoke checks before publishing desktop
0.2.0 beta artifacts to the permanent GitHub Desktop Beta release page.

## Build Under Test

- Desktop version: `0.2.0`
- Release channel: Desktop beta
- Trusted release URL: <https://github.com/AlmightyTank/StreetsEmpirev2/releases/tag/desktop-beta>

## Automated Checks

- [x] `npm --prefix desktop run prepare:config`
- [x] `npm --prefix desktop run check`
- [x] `npm --prefix desktop test`

## Manual Smoke Checks

These checks require a real desktop app launch, a valid StreetsEmpire account,
server-side Beta approval where applicable, and a local Discord desktop client
for Rich Presence validation. Do not mark this file complete from automated
tests alone.

| Check | Result | Notes |
| --- | --- | --- |
| App opens to the four-tab shell instead of a bare game window | Pending | Verify Play, Updates, Discord, Settings tabs are visible. |
| Password sign-in on Live persists session | Pending | Confirm diagnostics show only cookie presence/absence, never cookie value. |
| Discord OAuth sign-in on Live completes and returns to an authenticated game session | Pending | Do not record OAuth codes, callback URLs with codes, cookies, or tokens. |
| Beta selection shows invite-only approval messaging | Pending | Confirm copy does not imply OS/desktop permission grants Beta access. |
| Approved Beta account can sign in and remains isolated from Live session | Pending | Confirm Beta and Live do not reuse OAuth codes or cross-host redirects. |
| Play tab persistence | Pending | Navigate in-game, switch Play → Updates/Discord/Settings → Play, verify no tab-switch reload/reset. |
| Offline/reconnect handling | Pending | Simulate network failure or bad load, verify shell controls remain reachable and Retry/Reload works. |
| Discord Rich Presence enable/reconnect/test activity | Pending | Requires Discord desktop app and configured public Application ID/artwork keys. |
| Discord missing/closed behavior | Pending | Confirm missing Discord shows helpful state and Play remains usable. |
| Update link opens system browser | Pending | Verify the permanent Desktop Beta GitHub release URL opens externally. |
| Minimized/restored behavior | Pending | Confirm presence clears while minimized and resumes appropriately after restore/focus. |
| Immersive mode restore | Pending | Enter immersive mode and restore tabs via pointer and keyboard without focus trap. |
| Quit/close cleanup | Pending | Confirm app exits cleanly and Discord presence clears. |

## Publication Gate

- [ ] Windows x64 portable EXE built and smoke checked.
- [ ] macOS x64 ZIP built and smoke checked.
- [ ] macOS arm64 ZIP built and smoke checked.
- [ ] Linux x86_64 AppImage built and smoke checked.
- [ ] All manual smoke checks above are passing or have approved release notes.
- [ ] Desktop 0.2.0 beta artifacts published to the permanent Desktop Beta URL.

## QA Result

Status: **Pending manual validation**

The implementation and automated checks are complete, but final release QA still
requires hands-on validation of real sign-in, OAuth, Discord, platform builds,
and publish flow.
