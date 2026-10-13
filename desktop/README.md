# StreetsEmpire Desktop (Windows)

A small Electron shell for the **existing** StreetsEmpire website, with opt-in
Discord Rich Presence. This does not create a second game, local game server,
or separate player database.

- Opens https://play.streetsempire.dev by default.
- **Game** menu switches between Live and https://beta.streetsempire.dev.
- Existing logins, characters and game updates use the corresponding website.
- **Discord** menu enables/disables activity sharing. First launch asks once.
- Reports only a broad current game section (Casino, Quests, Scout, etc.).
  Never publishes private messages, exact stats, hidden intel or balances.
- Updates happen entirely in the Electron main process, not in website JS.
- If Discord is closed or offline, play continues. The bridge reconnects.
- Quitting the client clears its activity.

## Requirements

- Windows 10/11 (x64) and Node.js/npm for development/builds.
- Installed **Discord desktop app** signed in with activity sharing enabled.
- A Discord Developer Application ID (public, numeric, 17-20 digits). The
  application should be named **StreetsEmpire**, because Discord takes the
  displayed game name from this application's registered name.
- Internet access to Live or Beta.

Do **not** use a Discord bot token, OAuth client secret or a Discord user token.
The native RPC protocol does not need those secrets.

## Develop in PowerShell

From the repo root:

```powershell
cd desktop
npm install
$env:STREETSEMPIRE_DISCORD_CLIENT_ID="YOUR_PUBLIC_DISCORD_APPLICATION_ID"
npm start
```

Without the Application ID the game window still works; Rich Presence is
deliberately disabled. The script generates `src/generated-config.json`, which
is ignored by Git and bundled into the installer when you build.

## Windows installer

```powershell
cd desktop
npm install
$env:STREETSEMPIRE_DISCORD_CLIENT_ID="YOUR_PUBLIC_DISCORD_APPLICATION_ID"
npm test
npm run check
npm run dist:win
```

Output: `desktop/dist/StreetsEmpire-Setup-0.1.1.exe`.

The optional Windows GitHub Actions job packages an installer and uploads it as
a workflow artifact. Configure the repository *Actions variable*
`STREETSEMPIRE_DISCORD_CLIENT_ID` first. It is **not a secret**; do not put
client secrets or tokens there.

## Security and privacy

- The website is loaded over HTTPS in a sandboxed Electron renderer:
  `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- No preload API, local file access, or Node/Discord bridge is exposed to the site.
- Navigation is restricted to the Live/Beta game hosts and Discord OAuth hosts.
  Other HTTPS links open in the normal browser; dangerous schemes are blocked.
- Discord presence is opt-in and can be disabled from the menu at any time.
- Switching accounts or logging out sends no activity from non-game pages.
- Minimizing clears activity immediately; staying unfocused for five minutes
  also clears it; returning to the game restores it.
- The game website stays authoritative; remote code must never be granted Node
  integration just to implement presence.

## Testing before release

1. Launch the desktop app with Discord installed and running.
2. Sign in using normal credentials and repeat with Discord OAuth.
3. Enable Rich Presence and verify "Playing StreetsEmpire" on a **second**
   Discord account (Discord may hide your own button).
4. Change pages between Scout, Quests and Casino; verify status transitions.
5. Log out, minimize the window, close the app, and stop Discord. Verify that
   activity clears and that gameplay remains usable.
6. Open Discord **after** starting StreetsEmpire; confirm automatic reconnection.
7. Repeat on Beta and ensure there are no cross-environment login surprises.

## Windows administrator prompts (0.1.1 correction)

The first test installer (0.1.0) allowed choosing an **all users** installation.
That could request Windows administrator privileges and leave a machine-wide
installation behind.

Starting with **0.1.1**, the NSIS installer is explicitly:
- **Current user only** (`oneClick: true`, `perMachine: false`).
- No elevation requested (`allowElevation: false`, no elevate helper).
- The desktop application manifest explicitly says `asInvoker`.
- Shortcuts are created for the current user.
- The application is **not launched by the installer**, avoiding inherited elevated context.

If an earlier version was installed **for all users** (for example under
`C:\\Program Files`), uninstall that earlier installation through Windows
**Installed apps** before installing 0.1.1. Windows may require one-time
administrator confirmation for **removing** the old machine-wide install.
Install 0.1.1 from the current Windows user's account.

These changes prevent this app from *requesting* administrator privileges; they
cannot override enterprise Windows policies, a shortcut's manually enabled
**Run as administrator** property, or Windows SmartScreen warnings for unsigned
applications. An **in-game beta account approval** prompt is unrelated to
Windows admin elevation.

The installer is currently **unsigned**. Before public distribution,
sign the Windows installer, add an app icon, validate security and ensure the
website's sign-in/payment flows work in Electron. Electron and Discord IPC
should be reviewed as versions and platform requirements change.
