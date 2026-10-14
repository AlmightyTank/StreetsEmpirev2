# StreetsEmpire Desktop — Windows, macOS and Linux

Cross-platform desktop client wrapping the **existing** StreetsEmpire website.
It is not a second game server. Players log in with their usual StreetsEmpire
credentials and use the same live game data. Discord Rich Presence is optional,
and the website itself never has local system/Discord access.

## Latest portable downloads

**One permanent link for everyone:** [Latest StreetsEmpire Desktop Beta](https://github.com/AlmightyTank/StreetsEmpirev2/releases/tag/desktop-beta). After this workflow is merged into `beta` and successfully publishes, that URL always contains the newest tested Windows, macOS Intel, macOS Apple Silicon and Linux downloads, plus their checksums. No GitHub Actions artifact hunting or account sign-in is needed for this public repository. The release is marked as a **pre-release**, not a stable production download.

Pull-request builds remain private to workflow artifacts and will **never** replace the downloadable release. A new set is published from `beta` only after all four OS builds pass. The desktop app has **Help → Get Latest Desktop Version (Beta)** to open the same page. New website features need no desktop app rebuild; changes to the desktop app do.

## Portable downloads (0.1.3)

Build artifacts are generated in [StreetsEmpire Desktop Actions](https://github.com/AlmightyTank/StreetsEmpirev2/actions/workflows/desktop-platforms.yml)
on the `feature/desktop-game-discord-presence` PR branch, and after merging
on `beta`. Download the artifact matching your operating system and extract
the GitHub artifact ZIP first.

| Platform | GitHub Actions artifact | Actual downloadable app | How to start |
| --- | --- | --- | --- |
| Windows 10/11 (64-bit) | `StreetsEmpire-Windows-x64` | `StreetsEmpire-Portable-0.1.3.exe` | Double-click EXE; no installer, administrator permission or system-wide changes |
| macOS Intel (x64) | `StreetsEmpire-macOS-Intel` | `StreetsEmpire-macOS-x64-0.1.3.zip` | Extract ZIP; open `StreetsEmpire.app`. Moving it to Applications is optional |
| macOS Apple Silicon (M1/M2/M3/M4, arm64) | `StreetsEmpire-macOS-Apple-Silicon` | `StreetsEmpire-macOS-arm64-0.1.3.zip` | Extract ZIP; open `StreetsEmpire.app`. Moving it to Applications is optional |
| Linux x86_64 | `StreetsEmpire-Linux-x64` | `StreetsEmpire-Linux-x86_64-0.1.3.AppImage` | `chmod +x StreetsEmpire-Linux-x86_64-0.1.3.AppImage` then run it |

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
