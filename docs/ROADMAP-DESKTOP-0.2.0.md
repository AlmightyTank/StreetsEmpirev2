# StreetsEmpire Desktop 0.2.0 — Gaming Client Refresh

**Status:** Planned / brainstorming approved for roadmap. **Target:** Desktop app only (`desktop/`), Windows, macOS and Linux.

## Purpose

Turn the existing portable StreetsEmpire Electron wrapper into a lightweight, branded gaming client without adding a second layer of complicated gameplay navigation. The full existing StreetsEmpire website remains the game. The desktop shell provides a simple way to play, see updates, control Discord Rich Presence, and manage app-only preferences.

**Player promise:** Open the app, enter Live or Beta, and play. Desktop extras stay useful but out of the way.

This is a **desktop-client version**. Do not tie it to the browser game's ruleset version or imply new gameplay mechanics.

## Existing baseline

The desktop client already:
- Packages portable Windows x64 EXE, macOS Intel/Apple Silicon ZIP apps, and Linux x86_64 AppImage builds.
- Embeds the existing Live and Beta websites, sharing server-owned game data and normal accounts.
- Uses desktop-only opt-in Discord Rich Presence, an app settings file, native menus, and a published GitHub beta download link.
- Has active work on Discord OAuth callback/session stability. **Do not regress sign-in, cookie persistence, or host isolation while building the shell.**

The proposed 0.2.0 UI should **replace or reorganize** the overlapping `Game`, `Discord`, `View`, and `Help` options rather than expose two different controls for the same feature.

## Navigation — four desktop tabs

| Desktop tab | Primary purpose | In scope |
| --- | --- | --- |
| **Play** | Main, full-size StreetsEmpire game | Live/Beta toggle, web game viewport, loading/error states, reload/open-in-browser, immersion control |
| **Updates** | What's new | Live game release notes, Beta previews/screenshots/GIFs where already supported, desktop release status and latest download link |
| **Discord** | Rich Presence control and clarity | Connected/disconnected/rejected status, current broad activity, large/small artwork preview, toggle, reconnect and test activity |
| **Settings** | App-only configuration | Display/fullscreen, default Live/Beta environment, app-only notifications preferences, version/update links, session/connection diagnostics |

**Live/Beta is a control inside Play, not a fifth tab.** The game itself keeps its existing Dashboard, Quests, Turf, Casino and other gameplay navigation—do not duplicate those pages as desktop tabs. Keep game-specific theme and account preferences inside the game unless a setting is strictly about the desktop shell.

## Visual direction

- Original StreetsEmpire branding: transparent logo/emblem, dark charcoal/slate surfaces, premium street-city atmosphere, restrained metallic-gold highlights and theme-aware accent details. Avoid a plain black rectangle around the app icon.
- Small, compact desktop header: logo, current environment, Discord status, optional quick settings, and ordinary platform window controls.
- A slim, readable four-tab bar. **Play should take nearly all available height**, with minimal permanent chrome.
- Discord tab previews the **actual Rich Presence layout**, including a square large illustration and small logo. A 16:9 promotional banner can be used in a launcher hero, but is not a Discord full-card background.
- Clear empty, connecting, offline, failed-load and new-version states. Accessibility: keyboard focus, contrast, screen-reader labels and reduced-motion preference.
- A player can collapse the client chrome for immersive play; whether the header defaults expanded or collapsed remains an **open UI decision**. Provide a discoverable way to restore tabs.

### Suggested screen structure

```text
[ StreetsEmpire logo ]   [ Play | Updates | Discord | Settings ]   [Live / Beta] [connection] [window]
+-----------------------------------------------------------------------------------------------+
|                                                                                               |
|  PLAY: current web game at maximum possible size                                              |
|  UPDATES: Live notes / Beta previews / Desktop release                                         |
|  DISCORD: connected status + activity/artwork preview + opt-in controls                        |
|  SETTINGS: desktop preferences + help + diagnostics                                            |
|                                                                                               |
+-----------------------------------------------------------------------------------------------+
```

The mockup/design proposal is illustrative, **not** a commitment to exact colors, screen proportions, or bundled imagery.

## Implementation architecture and guardrails

1. **Keep the game mounted while switching desktop tabs.** Prefer a persistent, sandboxed game `WebContentsView`/equivalent owned by the Electron main process, with separate trusted client-shell views, or another architecture that demonstrably preserves the game session, URL, scroll, and in-page state. Do not reload the website when opening Updates, Discord or Settings.
2. **Never turn Live/Beta into shared cookie storage.** Each is a different host and existing server account approval rules still apply. On environment switch, show Beta invite-only context and preserve each environment's last safe location separately where feasible. Do not reuse OAuth codes or redirect cross-host to force sign-in.
3. **Preserve security boundaries.** Remote game content remains sandboxed with Node integration disabled, context isolation enabled, and no access to privileged Electron APIs. Any client-shell-to-main IPC must be narrow, allowlisted and validated. External links open safely in the system browser.
4. **No website DOM scraping or injection** to discover player secrets, balances, or private activity. Discord activity uses only coarse, allowed page labels. Notifications use authenticated, rate-limited sources and an explicit opt-in.
5. **A missing Discord desktop client must not block gameplay.** Display a truthful connection state; test/reconnect actions must not falsely report success.
6. **Updates are not an installer.** The website updates automatically; new desktop code requires a new portable download. Show the current version and a trusted link to the published GitHub desktop-beta release, with no automatic unsigned executable execution.
7. **Portable, cross-platform behavior.** Support Windows x64, macOS Intel/Apple Silicon, Linux x86_64; avoid OS-specific assumptions in layout, menus, file paths, icons and notifications. Work without administrator privileges.
8. **Do not silently change the web game's navigation, quests, economy, or API contracts** for a desktop UI release.

## Release slices

### Desktop 0.2.0-A — Branded shell & navigation foundation

**Build:** Replace the current bare wrapper chrome with a lightweight desktop shell: transparent app logo/icon across OS packages, compact header, four-tab strip, active state, shortcuts, keyboard focus, responsive window sizing, and safe shell/main IPC. Keep native menus available for accessibility and platform conventions, but avoid duplicate top-level options.

**Done when:**
- All four tabs render and switch without remounting the embedded game or exposing Node APIs to the website.
- Brand/icon appears in Windows executable/taskbar, macOS dock/app, and Linux launcher/app where platform packaging supports it.
- Existing Discord OAuth, sign-in cookies, refresh, and normal game navigation work as before.

### Desktop 0.2.0-B — Play viewport & environment handling

**Build:** Make Play the full-size game viewport, with a compact Live/Beta switch, loading/retry/offline handling, open-in-browser, reload and immersive chrome toggle. Retain the current URL/scroll during desktop tab switching. Make switching to Beta clearly distinct from logging into Live.

**Done when:**
- Switching from Play → Updates → Play restores the *same* game page, scroll position and authenticated session without reloading.
- Live and Beta navigation/host cookies remain separate, and Beta invite-only approval is not bypassed.
- Immersive gameplay can hide and restore desktop controls without trapping the player.

### Desktop 0.2.0-C — Updates & release center

**Build:** Display readable Live patch notes, Beta feature showcases, and desktop release information in one desktop tab. Reuse authoritative current News/changelog content where APIs exist; no scraped duplicates. Support safe external links and existing image/GIF release media where present.

**Done when:**
- Players can tell a **web gameplay update** from a **desktop executable update**.
- Current desktop version and latest published beta portable download are visible; out-of-date detection handles unavailable networks gracefully.
- No automatic unsigned binaries are downloaded or executed, and no separate per-platform installers are introduced.

### Desktop 0.2.0-D — Discord activity dashboard

**Build:** Give Discord its own status panel: enable/disable, connect/reconnect, safe test activity, active game section, connection failures, and a branded preview using configured square artwork + transparent mini logo.

**Done when:**
- "Connected" / "Activity accepted" appear only after an actual local Discord IPC handshake/acknowledgment.
- The player understands that **StreetsEmpire account sign-in through Discord OAuth** is separate from **Discord Rich Presence**.
- Missing artwork keys, disconnected Discord, and privacy-disabled visibility show helpful non-sensitive guidance.

### Desktop 0.2.0-E — Settings, themes & desktop preferences

**Build:** Centralize app-only settings for startup/default environment, fullscreen/window size, reduced motion, chrome visibility, Discord preference, diagnostics, trusted update link and future notifications opt-in. Keep a sensible native View/Help menu fallback.

**Done when:**
- Preferences survive closing/reopening the portable app using per-user app storage, without copying secrets into the executable folder.
- The in-game site accent/theme remains authoritative for gameplay; desktop shell theme can complement it without overriding game styling.
- Diagnostics reveal status and the **presence/absence** of session cookies, never their values.

### Desktop 0.2.0-F — Cross-platform QA, polish & beta release

**Build:** Final UI polish, icon verification, automated tests for tab routing/state preservation/IPC, OAuth regression tests, keyboard navigation, security review, and CI packaging for all four targets.

**Done when:**
- Windows x64 portable EXE, macOS x64/arm64 ZIP app and Linux x86_64 AppImage pass build and smoke checks.
- Manual QA covers sign-in (password and Discord), Beta approval, navigation persistence, offline/reconnect, Discord presence, app update link, minimized/restored behavior and quit.
- Publish verified **desktop 0.2.0 beta** artifacts under the permanent GitHub Desktop Beta release URL; no production/live rollout implied without separate approval.

## Candidate follow-ups — not required for 0.2.0

- Opt-in native desktop alerts for completed quests, attacks and high-priority events using authenticated server notifications (no aggressive polling).
- Dedicated window or picture-in-picture for a narrow, read-only game dashboard (only if practical and permission-safe).
- Supporter-specific decorative desktop themes, assuming they reflect already owned game entitlements.
- Auto-update infrastructure only after code signing, supply-chain validation and a deliberate security review.

## Decisions to resolve before implementation

- **Tab visibility during play:** always visible, automatically collapse in Play, or a manual toggle? **Initial proposal:** compact by default with a user-controlled immersive mode.
- **App header artwork:** use the existing approved logo/emblem if suitable, or finalize a transparent cross-platform icon and a separate hero banner. No generated concept is automatically the official logo.
- **Updates source:** determine the current authoritative feed/API for Live, Beta and desktop releases before wiring it into a second UI.
- **Native menus:** keep Game/Discord/View/Help as fallback shortcuts only, or significantly slim them once the four-tab shell exists?

## Definition of 0.2.0 ready

A first-time player can install **nothing** beyond downloading the appropriate portable build, launch the app, choose Live or approved Beta, sign in reliably, move among the four desktop tabs without losing game state, see truthful Discord connection status, and locate the latest compatible desktop build. The underlying browser game remains feature-complete and independently usable.
