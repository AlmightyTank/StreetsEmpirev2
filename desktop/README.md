# StreetsEmpire Desktop — Windows, macOS and Linux

Cross-platform desktop client wrapping the **existing** StreetsEmpire website.
It is not a second game server. Players log in with their usual StreetsEmpire
credentials and use the same live game data. Discord Rich Presence is optional,
and the website itself never has local system/Discord access.

## Latest portable downloads

**One permanent link for everyone:** [Latest StreetsEmpire Desktop Beta](https://github.com/AlmightyTank/StreetsEmpirev2/releases/tag/desktop-beta). After this workflow is merged into `beta` and successfully publishes, that URL always contains the newest tested Windows, macOS Intel, macOS Apple Silicon and Linux downloads, plus their checksums. No GitHub Actions artifact hunting or account sign-in is needed for this public repository. The release is marked as a **pre-release**, not a stable production download.

Pull-request builds remain private to workflow artifacts and will **never** replace the downloadable release. A new set is published from `beta` only after all four OS builds pass. The desktop app has **Help → Get Latest Desktop Version (Beta)** to open the same page. New website features need no desktop app rebuild; changes to the desktop app do.

## Desktop client refresh (2.0.0)

Starting with desktop **2.0.0**, the app opens to a lightweight trusted
desktop shell with four primary tabs: **Play**, **Updates**, **Discord**, and
**Settings**. The existing website remains the game. Live and Beta are controls
inside Play, not separate desktop navigation, and gameplay pages such as
Dashboard, Quests, Turf and Casino are not duplicated as native screens.

Play uses persistent sandboxed game views so switching to Updates, Discord or
Settings does not intentionally reload the game. Live and Beta use separate
desktop storage partitions (`persist:streetsempire-game-live` and
`persist:streetsempire-game-beta`) to keep host sessions isolated. The shell
does not scrape or inject into the game DOM; diagnostics report only
presence/absence of state such as the `se_session` cookie.

The Updates tab distinguishes website gameplay updates from desktop executable
updates. The authoritative desktop executable source is the permanent
[Latest StreetsEmpire Desktop Beta](https://github.com/AlmightyTank/StreetsEmpirev2/releases/tag/desktop-beta)
release page. Live/Beta gameplay notes are website-owned sources; until a
confirmed authenticated changelog/news feed is available, the desktop client
shows a graceful unavailable/manual-link state instead of scraping web pages.

## Portable downloads (2.0.0)

Build artifacts are generated in [StreetsEmpire Desktop Actions](https://github.com/AlmightyTank/StreetsEmpirev2/actions/workflows/desktop-platforms.yml)
on the `feature/desktop-game-discord-presence` PR branch, and after merging
on `beta`. Download the artifact matching your operating system and extract
the GitHub artifact ZIP first.

| Platform | GitHub Actions artifact | Actual downloadable app | How to start |
| --- | --- | --- | --- |
| Windows 10/11 (64-bit) | `StreetsEmpire-Windows-x64` | `StreetsEmpire-Portable-2.0.0.exe` | Double-click EXE; no installer, administrator permission or system-wide changes |
| macOS Intel (x64) | `StreetsEmpire-macOS-Intel` | `StreetsEmpire-macOS-x64-2.0.0.zip` | Extract ZIP; open `StreetsEmpire.app`. Moving it to Applications is optional |
| macOS Apple Silicon (M1/M2/M3/M4, arm64) | `StreetsEmpire-macOS-Apple-Silicon` | `StreetsEmpire-macOS-arm64-2.0.0.zip` | Extract ZIP; open `StreetsEmpire.app`. Moving it to Applications is optional |
| Linux x86_64 | `StreetsEmpire-Linux-x64` | `StreetsEmpire-Linux-x86_64-2.0.0.AppImage` | `chmod +x StreetsEmpire-Linux-x86_64-2.0.0.AppImage` then run it |

Windows uses electron-builder's **portable** target, macOS uses ZIP archives
containing a native `.app`, and Linux uses **AppImage**. None of these require
a traditional installer. Builds target Intel/x64 Windows and Linux and both
Intel/x64 and Apple Silicon/arm64 macOS. Linux ARM64 is not included yet.

**Unsigned builds:** Test releases have no Windows code-signing certificate,
Apple Developer ID/notarization or Linux software-vendor signatures. macOS
Gatekeeper may block the app, even though it is packaged correctly. If you trust
the exact artifact downloaded from your GitHub Actions run, macOS provides
an exception through System Settings → Privacy & Security → Open Anyway.
Windows may warn with SmartScreen, and managed devices can prohibit unknown
applications altogether. A public release should be properly signed and
notarized before telling regular players to install/open it.

**Linux caveat:** Depending on the distribution, AppImage may require a
compatible FUSE runtime. If it cannot launch, review the host's AppImage/FUSE
support. Desktop Chromium sandboxing may also depend on Linux user namespaces;
do not disable sandboxing as a blanket workaround.

## Discord game sign-in troubleshooting

Discord OAuth sign-in to StreetsEmpire is different from sharing Rich Presence.
Starting with desktop **0.1.6**, the browser callback is allowed to finish at
the server so its session cookie is not overtaken by a second desktop redirect.

If the app returns to the login screen after Discord authorization:

1. Select **Game → Check Sign-in Session…**. The dialog only reports whether the
   current game host has a `se_session` cookie; it never reveals the token.
2. If the cookie is **missing**, test sign-in at the same game's host in a
   regular browser. If browser sign-in works, reinstalling is not needed:
   download the new portable version, then retry in the desktop app.
3. If the cookie is **present** but the game still opens the login page,
   inspect the server's `/api/auth/me` request result and make sure that
   the beta account is approved. An expired/invalid server session also gives
   HTTP 401 without revealing the session token.
4. If the server redirects to `/login?twoFactor=1`, finish the authenticator
   step; this is expected on accounts with two-factor authentication enabled.

**Do not share OAuth codes, callback query parameters, cookies or passwords in
logs.** The server should redact authorization URLs.

## Accounts, updates and privacy

- Opens https://play.streetsempire.dev by default.
- **Game → Play Live** or **Play Beta (invite-only)** switches servers. Beta
  access requires a StreetsEmpire administrator's approval and is unrelated
  to Windows/macOS/Linux account permissions.
- Players get website gameplay updates automatically. New desktop-only
  features require downloading a new app version.
- Discord → Show Playing StreetsEmpire is optional and can be turned off.
  The displayed activity reflects the broad current game section only (e.g.
  Scout, Quests, Slots, Poker). It never reveals player balances, private
  messages, targets or hidden intel.
- A running Discord desktop client is required for Rich Presence to work.
  Discord being closed should not interrupt the game.
- App preferences and login session data remain in the **current user's
  OS application-data directory**, not next to portable files. Moving a
  portable executable to another computer does not copy account sessions.
- If you have an older Windows installer version, the new portable EXE can
  run without uninstalling the old program. You may remove the old installation
  through Windows Installed Apps. A machine-wide uninstall may request an
  administrator confirmation.

## Building locally

Node.js/npm are needed **only to build** the desktop client, not to use it.

```bash
cd desktop
npm install
npm test
npm run check
```

Set the public Discord Application ID before packaging if you want status to
work. It is **not** a Discord Bot Token, OAuth Client Secret or user token.

Windows PowerShell:

```powershell
$env:STREETSEMPIRE_DISCORD_CLIENT_ID="YOUR_PUBLIC_DISCORD_APPLICATION_ID"
npm run dist:win
```

macOS Intel:

```bash
export STREETSEMPIRE_DISCORD_CLIENT_ID="YOUR_PUBLIC_DISCORD_APPLICATION_ID"
npm run dist:mac:x64
```

macOS Apple Silicon:

```bash
export STREETSEMPIRE_DISCORD_CLIENT_ID="YOUR_PUBLIC_DISCORD_APPLICATION_ID"
npm run dist:mac:arm64
```

Linux x64:

```bash
export STREETSEMPIRE_DISCORD_CLIENT_ID="YOUR_PUBLIC_DISCORD_APPLICATION_ID"
npm run dist:linux
```

If you omit the Application ID, the app still opens the game but Discord Rich
Presence is unavailable. No developer secrets are embedded.

## Discord Presence troubleshooting (desktop v2.0.0)

To share an activity, run the **Discord desktop app** on the **same computer**
as StreetsEmpire Desktop, sign in to Discord, and ensure Discord →
**User Settings → Activity Privacy → Share Your Activity** is enabled.
Rich Presence doesn't work when only the Discord website is open.

Inside StreetsEmpire Desktop:

1. Choose **Discord → Show Playing StreetsEmpire** or use the **Discord** tab
   toggle (must be enabled).
2. Open a page under `/game`, such as Scout or Casino (the login page does not
   broadcast a game activity). The program displays only coarse page labels.
3. Choose **Discord → Connection Details…**. You can distinguish a missing
   Application ID, searching for the local Discord app, a completed handshake,
   a sent activity, Discord acknowledgment, or a rejected update.
4. If needed, choose **Reconnect to Discord** after opening Discord. The app
   also retries the connection automatically.
5. To separate an RPC connection problem from game-page detection, use
   **Discord → Test Rich Presence (12 seconds)**. It temporarily shares a
   harmless test status without exposing any player data.

If the connection details say **Discord accepted activity** but other people
don't see it, check Discord's Activity Privacy and per-game sharing settings.
If the connection details report **Rich Presence rejected**, confirm the
large/small art asset keys were actually uploaded to the same Discord
application whose public Application ID is embedded in the build.

On Linux/macOS the app now searches the documented XDG runtime and temporary
socket locations, with the Linux Discord Flatpak socket path as a fallback.
Platform packaging environments may still prevent access to Discord's socket.

Discord OAuth **sign-in to the game** is a separate feature from Rich Presence:
it requires backend OAuth credentials, whereas Rich Presence uses only the
public Application ID and a locally running Discord app.

## Discord Rich Presence artwork

The optional Discord artwork uses the fields `assets.large_image`,
`assets.large_text`, `assets.small_image`, and `assets.small_text` in
Discord's desktop `SET_ACTIVITY` payload. This is **not** the deprecated
C library `Discord_UpdatePresence`.

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and select the **same StreetsEmpire application whose Application ID you
   set as `STREETSEMPIRE_DISCORD_CLIENT_ID`**.
2. Find **Rich Presence → Art Assets** for that application and upload a
   **square** game illustration for the big Rich Presence image, and a small
   transparent StreetsEmpire emblem. The previously designed 16:9 cover is
   good for banners but should be square-cropped for the normal large image.
3. Name the image assets `streetsempire_city` and `streetsempire_logo` in
   the portal. Names must match **exactly**.
4. Under GitHub **Settings → Secrets and variables → Actions → Variables**, set
   these **public repository variables**:

   | Variable | Example value |
   | --- | --- |
   | `STREETSEMPIRE_DISCORD_CLIENT_ID` | Your public Discord Application ID |
   | `STREETSEMPIRE_DISCORD_LARGE_IMAGE_KEY` | `streetsempire_city` |
   | `STREETSEMPIRE_DISCORD_SMALL_IMAGE_KEY` | `streetsempire_logo` |

5. Rebuild all desktop packages. Existing apps do not acquire the new asset keys
   automatically; normal web gameplay content still updates automatically.
6. Opt into **Discord → Show Playing StreetsEmpire** and test with the desktop
   Discord client running.

The two image keys are optional. When omitted, no imaginary/missing asset keys
are sent to Discord. A registered large image appears as a large **square**
Rich Presence illustration, not a fully customizable Discord card background.

The app includes elapsed play time and a **Play StreetsEmpire** button. It
does not send an `endTimestamp`, `partyId`, `partyMax`, or `joinSecret`
until real timed sessions and authenticated multiplayer invites exist.
Do **not** copy sample party secrets from online snippets.

## GitHub Actions

Workflow: `.github/workflows/desktop-platforms.yml`.

It runs all **four native-platform build jobs** independently:

1. Windows x64 → portable EXE
2. macOS Intel x64 → zipped app
3. macOS Apple Silicon arm64 → zipped app
4. Linux x64 → AppImage

Each runner installs desktop dependencies, runs Node unit tests and syntax
checks, builds its artifact and uploads it. The workflow can be launched
manually on the feature branch and also runs for PRs, and on the beta branch
when the desktop code changes.

For Discord activity, configure repository **Settings → Secrets and variables
→ Actions → Variables** with the public variable named
`STREETSEMPIRE_DISCORD_CLIENT_ID`. All four builds share that value. After
adding/changing it, **run the workflow again** to package it into new binaries.

## Security and release validation

- Electron remote web pages run sandboxed, with Node integration disabled,
  context isolation on and no privileged preload bridge.
- Navigation is restricted to the game origins and Discord's OAuth origin.
  Other normal HTTPS links open in the external browser.
- Discord IPC stays entirely in the Electron main process and never exposes
  a privileged interface to the game website.
- The app does not request Windows administrator privileges. On macOS or
  Linux, run it as a normal user.
- **Manual testing is still required** for login (including Discord OAuth),
  presence updates on all three OSes, minimized/closed cleanup and the first
  run experience. Successful CI proves the programs packaged, not that Discord
  integration and all gameplay flows have been exercised in each OS.
