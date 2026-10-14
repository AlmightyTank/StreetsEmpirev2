# Spec Delta

## Purpose

Defines the StreetsEmpire Desktop client shell behavior that wraps the existing web game with branded navigation, app-only surfaces, truthful status, safe preferences, and portable cross-platform release expectations.

## ADDED Requirements

### Requirement: Four-tab desktop shell
The desktop client SHALL present exactly four primary desktop tabs: Play, Updates, Discord, and Settings, with Live/Beta as a Play control rather than a top-level tab.

#### Scenario: Primary shell navigation is visible
- **WHEN** a player opens the desktop client
- **THEN** the shell shows Play, Updates, Discord, and Settings as the primary desktop navigation
- **AND** gameplay destinations such as Dashboard, Quests, Turf, Casino, and similar web-game pages are not duplicated as desktop tabs

#### Scenario: Live and Beta are Play controls
- **WHEN** the player needs to choose between Live and Beta
- **THEN** the control is available from Play or shared shell chrome associated with Play
- **AND** Live and Beta are not displayed as a fifth primary desktop tab

### Requirement: Persistent game viewport
The desktop client SHALL keep the embedded game mounted while moving among desktop tabs so tab changes do not reload or reset the game.

#### Scenario: Returning to Play preserves state
- **WHEN** a signed-in player navigates within the game, scrolls or changes in-page state, switches from Play to another desktop tab, and returns to Play
- **THEN** the same game page, authenticated session, scroll position, and in-page state remain available without a page reload caused by the tab switch

#### Scenario: Non-Play surfaces do not control game navigation
- **WHEN** the player opens Updates, Discord, or Settings
- **THEN** the game remains mounted in the background
- **AND** the desktop surface does not navigate, inject into, or scrape the game page to populate its content

### Requirement: Play environment handling
The desktop client SHALL let players switch Live/Beta intentionally while preserving separate host identity, cookies, and last safe locations where feasible.

#### Scenario: Beta selection explains access
- **WHEN** a player switches from Live to Beta
- **THEN** the client explains that Beta is invite-only and governed by server-side account approval
- **AND** it does not imply Windows, macOS, Linux, or desktop-app permission grants game access

#### Scenario: Host sessions remain isolated
- **WHEN** the player uses Live and Beta in the desktop client
- **THEN** Live and Beta cookies and sign-in outcomes remain tied to their own hosts
- **AND** the client does not reuse OAuth codes or redirect across hosts to force sign-in

### Requirement: Play viewport controls and states
The Play tab SHALL provide the game at maximum practical size with loading, offline, failed-load, reload, open-in-browser, and reversible immersive controls.

#### Scenario: Play handles failed loading
- **WHEN** the game fails to load or the network is unavailable
- **THEN** Play shows a clear non-gameplay error or offline state with a retry path
- **AND** normal shell controls remain reachable

#### Scenario: Immersive mode is reversible
- **WHEN** a player hides desktop chrome for immersive play
- **THEN** the player has a discoverable way to restore tabs and shell controls
- **AND** immersive mode does not trap keyboard, pointer, or assistive-technology users

### Requirement: Updates and release center
The Updates tab SHALL distinguish web gameplay updates from desktop executable updates and use authoritative sources or trusted release links without automatic unsigned execution.

#### Scenario: Player can distinguish update types
- **WHEN** a player opens Updates
- **THEN** the client separately identifies Live gameplay notes, Beta previews when available, and desktop executable release information
- **AND** it makes clear that website gameplay changes do not necessarily require a desktop download

#### Scenario: Desktop update link is safe
- **WHEN** a newer desktop build or release information is shown
- **THEN** the client links to the trusted GitHub Desktop Beta release page
- **AND** it does not automatically download, install, execute, or replace unsigned binaries

#### Scenario: Update source unavailable
- **WHEN** update or release metadata cannot be fetched
- **THEN** Updates shows a graceful unavailable/offline state without blocking Play

### Requirement: Discord Rich Presence dashboard
The Discord tab SHALL expose opt-in Rich Presence controls, truthful connection states, activity preview, reconnect/test actions, and guidance that separates local Rich Presence from game Discord OAuth sign-in.

#### Scenario: Connected status requires acknowledgment
- **WHEN** Discord Rich Presence reports Connected or Activity accepted
- **THEN** that state is shown only after a real local Discord IPC handshake or activity acknowledgment

#### Scenario: Missing Discord does not block gameplay
- **WHEN** the local Discord desktop client is missing, closed, privacy-disabled, or rejects artwork/activity
- **THEN** Discord shows helpful non-sensitive guidance
- **AND** Play remains usable

#### Scenario: OAuth and Rich Presence are distinct
- **WHEN** the player views Discord status or controls
- **THEN** the client explains that StreetsEmpire account sign-in through Discord OAuth is separate from desktop Discord Rich Presence

### Requirement: App-only settings and diagnostics
The Settings tab SHALL centralize desktop-only preferences and diagnostics without overriding web-game account, gameplay, or theme settings.

#### Scenario: Preferences persist safely
- **WHEN** a player changes default environment, fullscreen/window size, reduced motion, chrome visibility, or Discord preference
- **THEN** the preference survives closing and reopening the portable app using per-user app storage
- **AND** secrets or session values are not copied into the executable folder

#### Scenario: Diagnostics protect secrets
- **WHEN** the player views session or connection diagnostics
- **THEN** diagnostics show status and presence or absence of relevant cookies or connections
- **AND** cookie values, OAuth codes, passwords, tokens, and private game data are never displayed

### Requirement: Security and privacy boundaries
The desktop client SHALL keep remote game content sandboxed and restrict privileged desktop behavior to narrow, validated app-shell pathways.

#### Scenario: Remote game content has no privileged APIs
- **WHEN** the web game is loaded in the desktop client
- **THEN** Node integration is disabled, context isolation is enabled, the content is sandboxed, and privileged Electron APIs are unavailable to the game page

#### Scenario: External navigation is safe
- **WHEN** the game or shell opens an external link
- **THEN** trusted game hosts and allowed Discord OAuth navigation are handled safely
- **AND** unrelated external links open in the system browser without exposing privileged app APIs

#### Scenario: No private game scraping
- **WHEN** the shell needs Discord activity, notifications, updates, or diagnostics
- **THEN** it uses coarse allowed labels or authenticated/rate-limited sources as applicable
- **AND** it does not scrape or inject into the website DOM to read secrets, balances, private activity, targets, or hidden intel

### Requirement: Portable cross-platform release readiness
The desktop client SHALL remain portable across supported desktop targets and verify shell behavior before publishing 0.2.0 beta artifacts.

#### Scenario: Supported builds are produced
- **WHEN** desktop 0.2.0 beta is prepared for release
- **THEN** Windows x64 portable EXE, macOS x64 ZIP app, macOS arm64 ZIP app, and Linux x86_64 AppImage builds pass build and smoke checks

#### Scenario: Release does not imply gameplay rollout
- **WHEN** desktop 0.2.0 beta artifacts are published
- **THEN** they are available under the permanent GitHub Desktop Beta release URL
- **AND** the release does not imply production web-game rollout or new gameplay mechanics without separate approval
