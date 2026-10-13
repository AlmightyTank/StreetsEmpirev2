# StreetsEmpire Desktop — portable Windows app

A **no-install**, single-file Windows .exe for the existing StreetsEmpire
browser game, with optional Discord Rich Presence. It does **not** run a second
game server or make players create a new account.

## Run it (no installation or administrator required)

1. Download **StreetsEmpire-Portable-0.1.2.exe** from the
   **StreetsEmpire-Windows-Portable** artifact in the Windows GitHub Actions run.
   Unzip the artifact GitHub downloaded; the .exe itself needs no installation.
2. Save the .exe in Downloads, on your Desktop, or on a USB drive.
3. Double-click it. You can right-click → Create shortcut if you want.
4. Log in to your normal StreetsEmpire account.

The portable application does **not** install into Program Files, request
administrator privileges, modify installation registry entries, or create Start
menu shortcuts. Electron-builder extracts its runtime into Windows temporary
storage while running. Delete the .exe when you no longer want the application.

**Player settings and website login sessions stay under the current user's
Windows AppData folder** (not beside the portable .exe). This is intentional
so moving the executable to another machine does not also copy login sessions
or tokens. If you run the same .exe on a second computer, sign in there.

The executable is **not yet digitally signed**. Windows SmartScreen may show
"Unknown publisher" or "Windows protected your PC" for the downloaded binary;
that is a *trust warning*, not a request by the game for administrator rights.
Windows security policies may still block unsigned binaries. Test builds should
only be downloaded from this project's GitHub Actions.

If you installed the old **0.1.0 / 0.1.1 installer**, you can run the portable
.exe independently without reinstalling. You can also uninstall the older
installed app through Windows Settings. Removing an earlier machine-wide
installation might require a one-time Windows administrator confirmation.

## Features

- Opens https://play.streetsempire.dev by default.
- **Game → Play Live / Play Beta (invite-only)** switches servers; all game
  updates are delivered by the existing websites.
- Existing StreetsEmpire accounts and progress work normally.
- **Discord → Show Playing StreetsEmpire** enables/disables activity sharing.
- Discord activity includes broad game locations such as Scouting, Quests,
  Turf and individual Casino games. No hidden intel, private messages,
  detailed inventories or player balances are shared.
- Uses Discord's **installed desktop client** and a public Discord Application
  ID; does not need a bot/user token or OAuth client secret.
- If Discord is closed, the game still works, and Presence reconnects later.
  Minimizing, logging out or closing the desktop window clears the activity.

**Beta access is invite-only and requires in-game admin approval** for accounts
that aren't yet authorized. This is unrelated to Windows UAC. Play Live for
regular gameplay.

## Requirements

- Windows 10/11 x64, with an internet connection to the StreetsEmpire website.
- Discord desktop client is optional, but required for Discord Rich Presence.
- The Discord Application ID needs to be configured at build time for Presence
  to work. If it's missing, the portable game still runs.

## Build locally (PowerShell)

Node.js/npm are only required **for building** the portable executable, not
for running a downloaded .exe.

From the repository root:

```powershell
cd desktop
npm install
$env:STREETSEMPIRE_DISCORD_CLIENT_ID="YOUR_PUBLIC_DISCORD_APPLICATION_ID"
npm test
npm run check
npm run dist:portable
```

Output: `desktop/dist/StreetsEmpire-Portable-0.1.2.exe`.

Omitting the Application ID builds a usable desktop game with Discord Presence
disabled. The config generator embeds only the **public numeric Application
ID** in `src/generated-config.json`, which is git-ignored. **Never use a
Discord bot token, OAuth secret or a user token.**

## GitHub Actions build

The workflow `.github/workflows/desktop-windows.yml` runs Windows tests and
packages a single, unsigned **StreetsEmpire-Windows-Portable** artifact. To
enable Discord status in those builds, set the GitHub Actions **repository
variable** `STREETSEMPIRE_DISCORD_CLIENT_ID` to the public Discord Developer
Application ID of the **StreetsEmpire** app before running the workflow.
You must rebuild after setting the variable.

This portable app does not automatically install updates. Replace the old
portable .exe with the newest version when desktop features change; ordinary
gameplay updates continue to arrive from the existing StreetsEmpire website.

## Security and testing

- The web renderer is sandboxed, without Node integration or a JavaScript
  bridge to the computer. Discord RPC remains in the Electron main process.
- Website navigation is restricted to game domains and Discord OAuth; other
  HTTPS links open in the default browser. File and script URLs are rejected.
- Portable packaging requests `asInvoker` (run with current-user rights).
- Player logins are kept in per-user AppData rather than on removable drives.
- Before publishing, validate the downloaded Windows EXE on a real PC:
  normal sign-in, Discord OAuth, game navigation, Discord activity,
  reconnecting Discord after launch, and presence cleanup on closing/minimize.
- For a public release, code-sign the executable and review its Windows
  SmartScreen reputation. Untrusted or organization-managed PCs can have
  stricter execution policies regardless of packaging.
