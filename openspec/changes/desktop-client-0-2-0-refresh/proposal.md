# Proposal

## Why

StreetsEmpire Desktop currently behaves like a portable Electron wrapper with most desktop-only controls hidden in native menus. The 0.2.0 refresh turns it into a lightweight branded gaming client that keeps the existing website as the game while making Play, updates, Discord Rich Presence, and app-only preferences discoverable without risking sign-in, cookie, or host-isolation regressions.

## What Changes

- Replace the current bare wrapper experience with a compact desktop shell containing four top-level desktop tabs: Play, Updates, Discord, and Settings.
- Keep Live/Beta selection inside Play, preserve separate host sessions, and avoid duplicating the web game's Dashboard, Quests, Turf, Casino, or other gameplay navigation.
- Keep the embedded game mounted while switching desktop tabs so game URL, session, scroll, and in-page state are preserved.
- Add Play affordances for loading/offline/error states, reload, open-in-browser, and a reversible immersive chrome mode.
- Add an Updates tab that distinguishes web gameplay updates from desktop executable updates and links to the trusted desktop-beta release without auto-installing unsigned binaries.
- Add a Discord tab that exposes truthful Rich Presence status, opt-in controls, reconnect/test actions, and artwork/activity preview without conflating game Discord OAuth sign-in with local Rich Presence.
- Add a Settings tab for app-only preferences, display/fullscreen/chrome behavior, default environment, reduced motion, trusted update links, and diagnostics that reveal only presence/absence of session cookies.
- Preserve current desktop security boundaries: sandboxed remote game content, Node integration disabled, context isolation enabled, narrow validated IPC, safe external links, no game DOM scraping/injection, and no silent gameplay/API changes.
- Keep native menus as accessible platform fallbacks while removing or reorganizing duplicate top-level controls.

## Capabilities

### New Capabilities

- `desktop-client-shell`: Desktop app behavior for the branded four-tab shell, persistent Play viewport, environment/session handling, updates surface, Discord Rich Presence dashboard, app-only settings, diagnostics, cross-platform packaging, and release readiness.

### Modified Capabilities

- None.

## Impact

- Affects `desktop/src/main.cjs`, desktop shell rendering/preload/client files to be introduced, Discord presence integration, settings persistence, packaging metadata/icons, and desktop tests under `desktop/test`.
- May require Electron APIs beyond the current single `BrowserWindow` page load, such as `WebContentsView` or an equivalent persistent view architecture, while keeping privileged shell IPC separate from remote game content.
- Requires preserving existing Live/Beta hosts (`play.streetsempire.dev`, `beta.streetsempire.dev`), Discord OAuth callback behavior, `se_session` cookie persistence, and the published GitHub Desktop Beta release URL.
- Does not change the browser game's ruleset, economy, quests, navigation, account model, or server API contracts.
