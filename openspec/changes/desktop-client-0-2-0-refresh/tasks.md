# Tasks

## 1. Shell foundation and persistent Play view

- [x] 1.1 Create the trusted desktop shell asset structure and entry path, then verify `npm --prefix desktop run check` succeeds and the app opens to a shell instead of a bare game window.
- [x] 1.2 Implement four primary shell tabs (Play, Updates, Discord, Settings) with keyboard focus, active state, responsive sizing, accessible labels, and reduced-motion styling; verify by launching the app and tabbing/clicking through all four tabs.
- [x] 1.3 Move the remote game into a persistent main-process-owned game view or equivalent architecture; verify Play → Updates → Play preserves the same game URL and does not trigger a reload caused by shell tab switching.
- [x] 1.4 Keep native menus as fallback shortcuts while removing duplicate primary navigation behavior from menus where shell controls replace it; verify menu actions still work for reload, fullscreen/zoom, latest version, Discord status, and quit.
- [x] 1.5 Add shell foundation tests for tab routing, view visibility, and game-view persistence; verify `npm --prefix desktop test` passes.

## 2. Play viewport and environment handling

- [x] 2.1 Implement Play as the maximum-size game viewport with compact Live/Beta control, reload, open-in-browser, loading, offline, and failed-load states; verify each state can be triggered or simulated without losing shell controls.
- [x] 2.2 Implement reversible immersive chrome mode with a discoverable restore affordance and keyboard accessibility; verify immersive mode can be entered/exited with pointer and keyboard without trapping focus.
- [x] 2.3 Preserve separate Live/Beta host sessions and last safe locations where feasible; verify Live and Beta navigate only to their own hosts and switching environments does not reuse OAuth codes or cross-host redirects.
- [x] 2.4 Preserve existing Discord OAuth and password sign-in behavior; verify sign-in cookies persist for Live and approved Beta and diagnostics report only cookie presence/absence.
- [x] 2.5 Add tests for environment switching, trusted navigation, failed-load handling, and diagnostics redaction; verify `npm --prefix desktop test` passes.

## 3. Updates and release center

- [x] 3.1 Identify the authoritative Live/Beta news or changelog sources and the desktop release metadata source; verify the selected source is documented in `desktop/README.md` or code comments before wiring UI data.
- [x] 3.2 Implement the Updates tab sections for Live notes, Beta previews, and desktop executable status, including graceful unavailable/offline states; verify unavailable sources do not block Play.
- [x] 3.3 Show current desktop version and a trusted link to the permanent GitHub Desktop Beta release URL without automatic executable download or execution; verify the link opens in the system browser.
- [x] 3.4 Add tests or fixture coverage for successful update metadata, unavailable network/source, and web-vs-desktop update labeling; verify `npm --prefix desktop test` passes.

## 4. Discord dashboard

- [x] 4.1 Expose main-process Discord status snapshots and allowlisted shell controls for enable/disable, reconnect, and safe test activity; verify invalid shell IPC payloads are rejected or ignored.
- [x] 4.2 Implement the Discord tab status panel, OAuth-vs-Rich-Presence guidance, activity/artwork preview, and helpful states for missing app, rejected activity, missing artwork keys, privacy-disabled visibility, and connected/accepted activity; verify labels match actual `DiscordPresence` status transitions.
- [x] 4.3 Ensure Connected and Activity accepted states only appear after local Discord IPC handshake or acknowledgment; verify with existing and added Discord connection tests.
- [x] 4.4 Add or update Discord tests for dashboard-facing status, artwork preview data, reconnect/test activity, and missing-client behavior; verify `npm --prefix desktop test` passes.

## 5. Settings, preferences, and diagnostics

- [x] 5.1 Extend per-user desktop settings for default environment, window bounds/fullscreen, reduced motion, chrome/immersive preference, Discord preference, and future notification opt-in; verify settings survive closing/reopening without writing secrets next to the executable.
- [x] 5.2 Implement the Settings tab for app-only preferences, version/update links, diagnostics, and help text while leaving game account/theme/preferences inside the website; verify changing desktop settings does not alter in-game settings.
- [x] 5.3 Implement diagnostics summaries for selected environment, current host, cookie presence/absence, Discord status, update-source status, and app version; verify cookie values, OAuth codes, tokens, passwords, and private game data never appear.
- [x] 5.4 Add tests for settings migration/defaults, preference persistence, and diagnostics redaction; verify `npm --prefix desktop test` passes.

## 6. Branding, packaging, and cross-platform release QA

- [x] 6.1 Confirm and add approved transparent logo/emblem and square Discord artwork keys/assets for the shell and package metadata; verify placeholder/generated art is not presented as official if approval is missing.
- [x] 6.2 Update desktop package version/release copy for 0.2.0 beta and packaging metadata/icons for Windows, macOS, and Linux; verify `npm --prefix desktop run prepare:config` and `npm --prefix desktop run check` pass.
- [x] 6.3 Add or update packaging tests for app icon metadata, target artifact naming, desktop-beta link, and supported targets; verify `npm --prefix desktop test` passes.
- [ ] 6.4 Build Windows x64 portable EXE, macOS x64 ZIP, macOS arm64 ZIP, and Linux x86_64 AppImage in CI or an equivalent release environment; verify each build completes and produces the expected artifact names.
- [ ] 6.5 Perform manual smoke QA for password sign-in, Discord OAuth sign-in, Beta approval messaging, Play tab persistence, offline/reconnect handling, Discord presence, update link, minimized/restored behavior, immersive mode restore, and quit; verify results are recorded in release notes or QA notes.
- [ ] 6.6 Publish verified desktop 0.2.0 beta artifacts to the permanent GitHub Desktop Beta release URL only after all target builds and smoke checks pass; verify the release remains a desktop beta and does not imply production web-game rollout.

## Workflow follow-up

- Archive the OpenSpec change after implementation, review, validation, and release-readiness checks are complete.
