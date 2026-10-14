# Design

## Context

See `proposal.md` for motivation and `specs/desktop-client-shell/spec.md` for the behavior contract.

Current desktop state observed in `desktop/`:
- `desktop/src/main.cjs` creates one sandboxed `BrowserWindow` and loads either `https://play.streetsempire.dev/game` or `https://beta.streetsempire.dev/game` in the window's `webContents`.
- Live/Beta, reload, open-in-browser, session check, Discord Rich Presence, zoom/fullscreen, and latest-version link are exposed through native menus.
- Preferences are stored in per-user app data as `desktop-settings.json`; current settings cover `environment` and `presenceEnabled` only.
- Discord Rich Presence already uses main-process local IPC (`desktop/src/discord-ipc.cjs`), a public application id, coarse URL labels (`desktop/src/activity.cjs`), and tests under `desktop/test`.
- Existing security constraints are important: remote game content is sandboxed, Node integration is disabled, context isolation is enabled, webviews are blocked, host navigation is allowlisted, and Discord OAuth callback/session stability must not regress.

## Goals / Non-Goals

**Goals:**
- Introduce a trusted desktop shell UI that owns the four desktop tabs while preserving the remote web game as sandboxed content.
- Preserve the game session, URL, scroll, and in-page state across shell tab switches.
- Keep desktop-only data and privileged operations in the main process or trusted shell, never in the remote game page.
- Make the release slices independently testable: shell foundation, Play/environment handling, Updates, Discord dashboard, Settings, and cross-platform QA.
- Keep native menus as fallbacks/shortcuts rather than the primary way to discover desktop features.

**Non-Goals:**
- Rebuilding the StreetsEmpire web game as native desktop screens.
- Adding desktop-only gameplay mechanics, economy behavior, account rules, or server API changes.
- Implementing auto-update, unsigned executable execution, code signing/notarization, or installer replacement in 0.2.0.
- Reading private game state from the DOM or exposing privileged Electron APIs to the remote website.

## Decisions

### Decision 1: Use a trusted shell plus persistent game view

Implement the desktop client as a trusted local shell surface with a separate persistent game view. Prefer Electron `WebContentsView` owned by the main process for the remote game, with the shell rendered by trusted local assets and narrow IPC. If Electron/platform constraints make that impractical, use an equivalent architecture that keeps the game `webContents` alive while shell tab content changes.

Rationale: A single `BrowserWindow.loadURL(gameUrl())` cannot show native shell tabs without either reloading the game or mixing trusted desktop UI into remote game content. A persistent view lets Play occupy most of the window while Updates/Discord/Settings can overlay or replace visible shell content without remounting the game.

Alternatives considered:
- Continue menu-only controls: lowest risk but does not satisfy discoverability or four-tab shell requirements.
- Inject a tab bar into the web game: rejected because it violates isolation and risks DOM injection/scraping.
- Use `<webview>` inside a renderer shell: rejected because the app currently blocks webviews and maintaining tighter main-process ownership is safer.

### Decision 2: Keep shell IPC allowlisted and app-owned

Expose only explicit shell operations through preload/IPC: tab state, environment switch request, reload, open current game in browser, immersive toggle, preference read/write, diagnostics summary, Discord enable/reconnect/test/status, and update metadata retrieval. Validate all IPC payloads in the main process and return sanitized status objects.

Rationale: The shell needs desktop capabilities, but the remote game must not gain them. A narrow contract keeps the security review tractable and testable.

Alternatives considered:
- Give the shell broad Electron access: rejected because accidental exposure to remote content would be high impact.
- Put all logic in the renderer: rejected for Discord IPC, cookies, and filesystem preferences because those belong in the main process.

### Decision 3: Model Live and Beta as separate environment state

Keep Live and Beta origins explicit (`play.streetsempire.dev`, `beta.streetsempire.dev`). Store selected environment and, where feasible, each environment's last safe game URL separately. On Beta selection, show invite-only context before navigation. Continue using host-bound cookies and avoid cross-host OAuth/code reuse.

Rationale: The roadmap explicitly calls out sign-in, cookie persistence, and host isolation as regression-sensitive. Per-environment last location improves UX without changing server account rules.

Alternatives considered:
- One shared last URL: rejected because it can accidentally cross hosts.
- Shared desktop auth/session abstraction: rejected because authentication remains server-owned.

### Decision 4: Treat Updates as display/linking, not installation

The Updates tab should read authoritative existing sources where available: current game News/changelog APIs for Live/Beta and GitHub release metadata or the permanent desktop-beta release link for desktop builds. If a source is unavailable, show a graceful unavailable state. Do not download or execute binaries automatically.

Rationale: Website updates and desktop executable updates have different delivery models. The desktop client can inform and link without taking on unsigned auto-update risk.

Alternatives considered:
- Scrape website news pages: rejected because the roadmap forbids scraped duplicates.
- Add auto-update now: rejected until code signing and supply-chain review exist.

### Decision 5: Reuse Discord presence backend, build a richer dashboard

Keep `DiscordPresence` as the main-process owner of local Discord IPC and status transitions. Add shell-facing status snapshots and controls around the existing enable/reconnect/test behavior. Add preview data from configured artwork keys and coarse `presenceForUrl` labels only.

Rationale: Existing code already separates Rich Presence from OAuth and avoids secrets. The refresh should surface that state rather than replace the working IPC layer.

Alternatives considered:
- Use a third-party Discord RPC dependency: unnecessary and adds supply-chain risk.
- Derive activity from DOM/page content: rejected for privacy and security.

### Decision 6: Extend preferences carefully in per-user storage

Extend `desktop-settings.json` with app-only settings such as default environment, window bounds/fullscreen, reduced motion, chrome visibility/immersive preference, Discord preference, and future notification opt-in. Store only preferences and safe metadata; never store cookie values, OAuth codes, or private game data outside Electron's normal session storage.

Rationale: Portable builds should not write secrets next to executables, and moving the executable must not copy sessions.

Alternatives considered:
- Store settings beside the portable executable: rejected because it can leak user/session-adjacent state and may fail on read-only locations.
- Mirror web-game theme/account settings: rejected because game settings remain authoritative in the website.

## Risks / Trade-offs

- [Risk] `WebContentsView` behavior differs across Electron versions/platforms → Mitigation: prototype the persistent view first, add tab-switch state preservation tests, and keep the current single-window load path as a rollback reference until the foundation slice passes.
- [Risk] New shell IPC accidentally exposes privileged operations to remote content → Mitigation: keep shell and game origins separate, use preload only for trusted shell assets, validate sender/origin where possible, and add negative tests for game content privilege access.
- [Risk] Environment switching could regress Discord OAuth/cookie persistence → Mitigation: preserve current callback behavior, test password and Discord sign-in on Live and Beta, and verify `se_session` presence diagnostics never reveal values.
- [Risk] Update feeds may not exist or may be inconsistent → Mitigation: make Updates source adapters optional, show unavailable states, and fall back to the trusted GitHub Desktop Beta link for executable updates.
- [Risk] More visible Discord controls can confuse OAuth sign-in with Rich Presence → Mitigation: label Discord tab copy and diagnostics around the distinction and keep account sign-in inside the web game.
- [Risk] Cross-platform icon/window/menu behavior can vary → Mitigation: verify Windows taskbar/exe, macOS dock/app ZIPs for x64/arm64, and Linux AppImage launcher metadata during the QA slice.

## Migration Plan

1. Build the shell foundation behind the existing desktop entry point and keep native menu commands functional as fallbacks.
2. Move Play loading into the persistent game view and verify current 0.1.6 sign-in, Discord OAuth callback, cookie persistence, navigation, and Rich Presence still work.
3. Add Updates, Discord, and Settings surfaces incrementally, each with unavailable/error states and tests.
4. Update packaging assets/icons and release metadata for version 0.2.0 beta.
5. Run desktop tests, security checks, manual OAuth/sign-in QA, and all target builds before publishing to the existing `desktop-beta` release URL.

Rollback: If the shell architecture fails late, keep the current menu-driven wrapper as the fallback release path and do not publish 0.2.0 beta artifacts until tab switching, sign-in, and packaging checks pass.

## Open Questions

- Which current News/changelog endpoint or feed is authoritative for Live and Beta release notes? The Updates tab can ship a graceful unavailable/manual-link state until the source is confirmed.
- Which approved transparent logo/emblem and square Discord artwork should be bundled as official 0.2.0 assets? Placeholder wiring can be implemented before final art selection.
- Should native Game/Discord/View/Help menus be slimmed aggressively after the shell exists, or kept broadly equivalent for accessibility and platform conventions? The initial design keeps them as fallbacks.
