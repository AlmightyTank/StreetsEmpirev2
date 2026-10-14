'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, shell, session } = require('electron');
const { DiscordPresence } = require('./discord-ipc.cjs');
const { OAuthCallbackGuard } = require('./oauth-callback-guard.cjs');
const { GAME_ORIGINS, trustedNavigation, externalLink, presenceForUrl } = require('./activity.cjs');
const config = require('./generated-config.json');

const SETTINGS_FILE = 'desktop-settings.json';
const AWAY_AFTER_MS = 5 * 60_000;
const LATEST_DESKTOP_DOWNLOAD_URL = 'https://github.com/AlmightyTank/StreetsEmpirev2/releases/tag/desktop-beta';

let win = null;
let settings = null;
let awayTimer = null;
let testPresenceTimer = null;
let presence = new DiscordPresence(config.discordClientId, config.discordAssets, () => {
  if (settings && win && !win.isDestroyed()) buildMenu();
});
const hasApplicationId = Boolean(presence.clientId);

function settingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}
function readSettings() {
  try {
    const value = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    return {
      environment: value.environment === 'beta' ? 'beta' : 'live',
      presenceEnabled: typeof value.presenceEnabled === 'boolean' ? value.presenceEnabled : null,
    };
  } catch {
    return { environment: 'live', presenceEnabled: null };
  }
}
function saveSettings() {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
}
function gameUrl() {
  return GAME_ORIGINS[settings.environment] + '/game';
}

function syncPresence() {
  if (!settings?.presenceEnabled || !hasApplicationId || !win || win.isDestroyed() ||
      win.isMinimized() || !win.isVisible()) {
    presence.setPresence(null);
    return;
  }
  presence.setPresence(presenceForUrl(win.webContents.getURL()));
}

function clearAwayTimer() {
  if (awayTimer !== null) clearTimeout(awayTimer);
  awayTimer = null;
}

function changeEnvironment(environment) {
  if (settings.environment === environment) return;
  if (environment === 'beta') {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'info',
      title: 'StreetsEmpire Beta access',
      message: 'Beta is invite-only.',
      detail: 'Beta accounts require game administrator approval. This is separate from Windows permissions. For regular gameplay, choose Play Live.',
      buttons: ['Open Beta', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (choice !== 0) return;
  }
  presence.setPresence(null);
  settings.environment = environment;
  saveSettings();
  buildMenu();
  void win.loadURL(gameUrl());
}

function setPresenceEnabled(enabled) {
  if (enabled && !hasApplicationId) {
    dialog.showMessageBoxSync(win, {
      type: 'info',
      title: 'Discord setup required',
      message: 'Discord Rich Presence is not configured in this desktop build.',
      detail: 'The developer needs to supply STREETSEMPIRE_DISCORD_CLIENT_ID while packaging the application.',
      buttons: ['OK'],
    });
    buildMenu(); // Revert the checkbox when the build has no Application ID.
    return;
  }
  settings.presenceEnabled = enabled;
  if (!enabled && testPresenceTimer) clearTimeout(testPresenceTimer);
  testPresenceTimer = enabled ? testPresenceTimer : null;
  saveSettings();
  if (enabled) presence.start();
  else presence.stop();
  syncPresence();
  buildMenu();
}

function openWebsite() {
  void shell.openExternal(gameUrl());
}

function showDiscordStatus() {
  const status = presence.getStatus();
  const currentPage = win && !win.isDestroyed()
    ? presenceForUrl(win.webContents.getURL()) : null;
  const summary = [
    `Connection: ${status.message}`,
    `Application ID: ${status.configured ? 'present in desktop build' : 'MISSING (rebuild required)'}`,
    `Rich Presence: ${settings.presenceEnabled ? 'Enabled' : 'Disabled'}`,
    `Game detected: ${currentPage ? currentPage.state : 'No — sign in and open a game page'}`,
    `Large artwork key: ${presence.artwork.largeImage || 'not configured'}`,
    `Small artwork key: ${presence.artwork.smallImage || 'not configured'}`,
  ].join('\n');
  void dialog.showMessageBox(win, {
    type: status.kind === 'active' ? 'info' : 'warning',
    title: 'StreetsEmpire — Discord Rich Presence',
    message: status.message,
    detail: summary + '\n\nIf connected but not visible, check Discord Desktop → User Settings → Activity Privacy → Share Your Activity.',
    buttons: ['OK'],
  });
}

function testDiscordPresence() {
  if (!settings.presenceEnabled) return;
  if (testPresenceTimer) clearTimeout(testPresenceTimer);
  presence.start();
  presence.setPresence({ details: 'Playing StreetsEmpire', state: 'Testing Discord connection' });
  testPresenceTimer = setTimeout(() => {
    testPresenceTimer = null;
    syncPresence();
  }, 12_000);
  testPresenceTimer.unref?.();
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Game',
      submenu: [
        { label: 'Play Live', type: 'radio', checked: settings.environment === 'live',
          click: () => changeEnvironment('live') },
        { label: 'Play Beta (invite-only)', type: 'radio', checked: settings.environment === 'beta',
          click: () => changeEnvironment('beta') },
        { type: 'separator' },
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win?.webContents.reload() },
        { label: 'Open in Browser', click: openWebsite },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Discord',
      submenu: [
        { label: 'Show Playing StreetsEmpire', type: 'checkbox',
          checked: settings.presenceEnabled === true,
          click: (item) => setPresenceEnabled(item.checked) },
        { type: 'separator' },
        { label: 'Status: ' + presence.getStatus().message.slice(0, 65), enabled: false },
        { label: 'Connection Details…', click: showDiscordStatus },
        { label: 'Reconnect to Discord', enabled: settings.presenceEnabled === true,
          click: () => { presence.retry(); syncPresence(); } },
        { label: 'Test Rich Presence (12 seconds)', enabled: settings.presenceEnabled === true,
          click: testDiscordPresence },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { role: 'togglefullscreen' }],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Get Latest Desktop Version (Beta)', click: () => void shell.openExternal(LATEST_DESKTOP_DOWNLOAD_URL) },
        { type: 'separator' },
        { label: `Desktop version ${app.getVersion()}`, enabled: false },
      ],
    },
  ]));
}

function navigateSafely(event, legacyUrl) {
  // Electron 44 supplies details.url on the event; older builds pass a
  // deprecated second argument. Support both without blocking OAuth redirects.
  const rawUrl = typeof event.url === 'string' ? event.url : legacyUrl;
  if (trustedNavigation(rawUrl)) return;
  event.preventDefault();
  if (externalLink(rawUrl)) void shell.openExternal(rawUrl);
}

function createWindow() {
  const gameSession = session.fromPartition('persist:streetsempire-game');
  // Discord authorization codes can only be exchanged once. Drop a duplicate
  // callback before it reaches the API (including programmatic navigations).
  const oauthGuard = new OAuthCallbackGuard();
  gameSession.webRequest.onBeforeRequest({
    urls: [
      'https://play.streetsempire.dev/api/auth/discord/callback*',
      'https://beta.streetsempire.dev/api/auth/discord/callback*',
    ],
  }, (details, callback) => {
    const redirectURL = oauthGuard.redirectForReplay(details.url);
    callback(redirectURL ? { redirectURL } : {});
  });
  gameSession.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  gameSession.setPermissionCheckHandler(() => false);

  win = new BrowserWindow({
    title: 'StreetsEmpire',
    width: 1350,
    height: 840,
    minWidth: 400,
    minHeight: 520,
    show: true,
    autoHideMenuBar: false,
    backgroundColor: '#101419',
    webPreferences: {
      partition: 'persist:streetsempire-game',
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: false,
      webSecurity: true,
    },
  });

  win.once('ready-to-show', () => win?.show());
  win.webContents.on('will-navigate', navigateSafely);
  win.webContents.on('will-redirect', navigateSafely);
  win.webContents.on('did-navigate', syncPresence);
  win.webContents.on('did-navigate-in-page', syncPresence);
  win.webContents.on('did-finish-load', syncPresence);

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Discord sign-in may open OAuth in a separate window. Keeping it in the
    // same protected session retains the existing game login cookies.
    if (trustedNavigation(url)) void win.loadURL(url);
    else if (externalLink(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });

  win.on('minimize', () => {
    clearAwayTimer();
    presence.setPresence(null);
  });
  win.on('blur', () => {
    clearAwayTimer();
    awayTimer = setTimeout(() => presence.setPresence(null), AWAY_AFTER_MS);
  });
  win.on('focus', () => {
    clearAwayTimer();
    syncPresence();
  });
  win.on('restore', syncPresence);
  win.on('closed', () => {
    clearAwayTimer();
    if (testPresenceTimer) clearTimeout(testPresenceTimer);
    testPresenceTimer = null;
    presence.setPresence(null);
    win = null;
  });

  buildMenu();
  void win.loadURL(gameUrl()).catch(() => {
    dialog.showMessageBox({
      type: 'error',
      title: 'StreetsEmpire connection',
      message: 'Could not load StreetsEmpire.',
      detail: 'Please check your internet connection and use Game → Reload.',
    });
  });
}

async function askFirstLaunch() {
  if (settings.presenceEnabled !== null) {
    if (settings.presenceEnabled && hasApplicationId) presence.start();
    syncPresence();
    return;
  }
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Discord activity',
    message: 'Show “Playing StreetsEmpire” on your Discord profile?',
    detail: 'Optional. This only shares the current game area (such as Quests or Slots). You can change it anytime in the Discord menu.',
    buttons: ['Enable', 'Not now'],
    defaultId: 1,
    cancelId: 1,
  });
  if (response === 0 && !hasApplicationId) {
    settings.presenceEnabled = false;
    saveSettings();
    buildMenu();
    dialog.showMessageBoxSync(win, {
      type: 'info',
      title: 'Discord setup required',
      message: 'This desktop build has no Discord Application ID configured.',
      detail: 'Gameplay will work normally. The maintainer can rebuild it with STREETSEMPIRE_DISCORD_CLIENT_ID to enable Rich Presence.',
      buttons: ['OK'],
    });
    return;
  }
  setPresenceEnabled(response === 0);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('dev.streetsempire.desktop');
    settings = readSettings();
    createWindow();
    await askFirstLaunch();
  });

  app.on('before-quit', () => {
    clearAwayTimer();
    presence.stop();
  });

  app.on('window-all-closed', () => app.quit());
}
