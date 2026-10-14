'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, shell, session, ipcMain, WebContentsView } = require('electron');
const { DiscordPresence } = require('./discord-ipc.cjs');
const { GAME_ORIGINS, trustedNavigation, externalLink, presenceForUrl } = require('./activity.cjs');
const {
  DESKTOP_BETA_RELEASE_URL,
  TABS,
  ENVIRONMENTS,
  normalizeSettings,
  sanitizeGameUrl,
  buildUpdateMetadata,
  buildDiagnostics,
  validateTab,
} = require('./shell-state.cjs');
const config = require('./generated-config.json');

const SETTINGS_FILE = 'desktop-settings.json';
const AWAY_AFTER_MS = 5 * 60_000;
const SHELL_CHROME_HEIGHT = 72;
const PLAY_TOOLBAR_HEIGHT = 46;

let win = null;
let settings = null;
let activeTab = 'play';
let awayTimer = null;
let testPresenceTimer = null;
let gameStatus = { kind: 'loading', message: 'Loading StreetsEmpire…' };
let presence = new DiscordPresence(config.discordClientId, config.discordAssets, () => {
  if (settings && win && !win.isDestroyed()) {
    buildMenu();
    sendShellState();
  }
});
const hasApplicationId = Boolean(presence.clientId);
const gameViews = new Map();

function appIconPath() {
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return path.join(__dirname, '..', 'assets', iconFile);
}

function settingsPath() {
  return path.join(app.getPath('userData'), SETTINGS_FILE);
}

function readSettings() {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(settingsPath(), 'utf8')));
  } catch {
    return normalizeSettings();
  }
}

function saveSettings() {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

function originFor(environment = settings.environment) {
  return GAME_ORIGINS[environment];
}

function defaultGameUrl(environment = settings.environment) {
  return originFor(environment) + '/game';
}

function gameUrl(environment = settings.environment) {
  return settings.lastLocations?.[environment] || defaultGameUrl(environment);
}

function currentGameView() {
  return gameViews.get(settings.environment) || null;
}

function currentGameContents() {
  return currentGameView()?.webContents || null;
}

function currentGameUrl() {
  return currentGameContents()?.getURL() || gameUrl();
}

function shellBounds() {
  if (!win || win.isDestroyed()) return { width: 0, height: 0 };
  return win.getContentBounds();
}

function gameBounds() {
  const bounds = shellBounds();
  if (activeTab !== 'play') return { x: 0, y: 0, width: 0, height: 0 };
  if (settings.immersive) return { x: 0, y: 0, width: bounds.width, height: bounds.height };
  const y = SHELL_CHROME_HEIGHT + PLAY_TOOLBAR_HEIGHT;
  return { x: 0, y, width: bounds.width, height: Math.max(0, bounds.height - y) };
}

function layoutGameViews() {
  const visibleBounds = gameBounds();
  for (const [environment, view] of gameViews) {
    const visible = environment === settings.environment && activeTab === 'play';
    view.setBounds(visible ? visibleBounds : { x: 0, y: 0, width: 0, height: 0 });
  }
}

function shellState() {
  const preview = presenceForUrl(currentGameUrl());
  return {
    activeTab,
    tabs: TABS,
    environment: settings.environment,
    environments: ENVIRONMENTS,
    gameUrl: currentGameUrl(),
    gameStatus,
    settings: {
      presenceEnabled: settings.presenceEnabled,
      reducedMotion: settings.reducedMotion,
      immersive: settings.immersive,
      notificationsOptIn: settings.notificationsOptIn,
      fullscreen: settings.fullscreen,
    },
    discordStatus: presence.getStatus(),
    discordArtwork: presence.artwork,
    activityPreview: preview,
    version: app.getVersion(),
    releaseUrl: DESKTOP_BETA_RELEASE_URL,
  };
}

function sendShellState() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('shell:state', shellState());
}

function syncPresence() {
  if (!settings?.presenceEnabled || !hasApplicationId || !win || win.isDestroyed() ||
      win.isMinimized() || !win.isVisible()) {
    presence.setPresence(null);
    return;
  }
  presence.setPresence(presenceForUrl(currentGameUrl()));
  sendShellState();
}

function clearAwayTimer() {
  if (awayTimer !== null) clearTimeout(awayTimer);
  awayTimer = null;
}

function rememberSafeLocation(environment, rawUrl) {
  const safe = sanitizeGameUrl(rawUrl, environment, GAME_ORIGINS);
  if (!safe) return;
  settings.lastLocations[environment] = safe;
  saveSettings();
}

function navigateSafely(event, legacyUrl) {
  const rawUrl = typeof event.url === 'string' ? event.url : legacyUrl;
  if (trustedNavigation(rawUrl)) return;
  event.preventDefault();
  if (externalLink(rawUrl)) void shell.openExternal(rawUrl);
}

function makeGameView(environment) {
  const gameSession = session.fromPartition(`persist:streetsempire-game-${environment}`);
  gameSession.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  gameSession.setPermissionCheckHandler(() => false);

  const view = new WebContentsView({
    webPreferences: {
      partition: `persist:streetsempire-game-${environment}`,
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: false,
      webSecurity: true,
    },
  });

  view.webContents.on('will-navigate', navigateSafely);
  view.webContents.on('will-redirect', navigateSafely);
  view.webContents.on('did-start-loading', () => {
    if (environment === settings.environment) {
      gameStatus = { kind: 'loading', message: 'Loading StreetsEmpire…' };
      sendShellState();
    }
  });
  view.webContents.on('did-finish-load', () => {
    rememberSafeLocation(environment, view.webContents.getURL());
    if (environment === settings.environment) {
      gameStatus = { kind: 'ready', message: 'Ready' };
      syncPresence();
      sendShellState();
    }
  });
  view.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame || environment !== settings.environment) return;
    gameStatus = {
      kind: errorCode === -106 || errorCode === -105 ? 'offline' : 'failed',
      message: `Could not load StreetsEmpire: ${String(errorDescription || 'connection failed').slice(0, 120)}`,
    };
    sendShellState();
  });
  view.webContents.on('did-navigate', () => {
    rememberSafeLocation(environment, view.webContents.getURL());
    syncPresence();
  });
  view.webContents.on('did-navigate-in-page', () => {
    rememberSafeLocation(environment, view.webContents.getURL());
    syncPresence();
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (trustedNavigation(url)) void view.webContents.loadURL(url);
    else if (externalLink(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  return view;
}

function ensureGameView(environment) {
  if (gameViews.has(environment)) return gameViews.get(environment);
  const view = makeGameView(environment);
  gameViews.set(environment, view);
  win.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  void view.webContents.loadURL(gameUrl(environment)).catch(() => {
    if (environment === settings.environment) {
      gameStatus = { kind: 'failed', message: 'Could not load StreetsEmpire. Check your internet connection and retry.' };
      sendShellState();
    }
  });
  return view;
}

function switchTab(tab) {
  const safeTab = validateTab(tab);
  if (!safeTab) return shellState();
  activeTab = safeTab;
  layoutGameViews();
  sendShellState();
  return shellState();
}

function changeEnvironment(environment) {
  if (!ENVIRONMENTS.includes(environment)) return shellState();
  if (settings.environment === environment) return shellState();
  if (environment === 'beta') {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'info',
      title: 'StreetsEmpire Beta access',
      message: 'Beta is invite-only.',
      detail: 'Beta accounts require game administrator approval. This is separate from Windows, macOS, Linux, or desktop-app permissions. For regular gameplay, choose Play Live.',
      buttons: ['Open Beta', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (choice !== 0) return shellState();
  }
  presence.setPresence(null);
  settings.environment = environment;
  saveSettings();
  ensureGameView(environment);
  gameStatus = { kind: 'loading', message: 'Loading StreetsEmpire…' };
  buildMenu();
  layoutGameViews();
  syncPresence();
  sendShellState();
  return shellState();
}

function setPresenceEnabled(enabled) {
  if (enabled && !hasApplicationId) {
    settings.presenceEnabled = false;
    saveSettings();
    buildMenu();
    sendShellState();
    dialog.showMessageBoxSync(win, {
      type: 'info',
      title: 'Discord setup required',
      message: 'Discord Rich Presence is not configured in this desktop build.',
      detail: 'The developer needs to supply STREETSEMPIRE_DISCORD_CLIENT_ID while packaging the application. Gameplay will work normally.',
      buttons: ['OK'],
    });
    return shellState();
  }
  settings.presenceEnabled = Boolean(enabled);
  if (!settings.presenceEnabled && testPresenceTimer) clearTimeout(testPresenceTimer);
  testPresenceTimer = settings.presenceEnabled ? testPresenceTimer : null;
  saveSettings();
  if (settings.presenceEnabled) presence.start();
  else presence.stop();
  syncPresence();
  buildMenu();
  sendShellState();
  return shellState();
}

function openWebsite() {
  void shell.openExternal(currentGameUrl() || defaultGameUrl());
}

async function sessionDiagnostic() {
  const origin = originFor();
  const cookies = await session.fromPartition(`persist:streetsempire-game-${settings.environment}`).cookies.get({ url: origin, name: 'se_session' });
  return buildDiagnostics({
    environment: settings.environment,
    currentUrl: currentGameUrl(),
    hasSessionCookie: cookies.length > 0,
    discordStatus: presence.getStatus(),
    updateStatus: 'manual-link',
    version: app.getVersion(),
  });
}

async function showSessionStatus() {
  if (!win || win.isDestroyed()) return;
  const diagnostics = await sessionDiagnostic();
  const hasCookie = diagnostics.sessionCookie === 'present';
  void dialog.showMessageBox(win, {
    type: hasCookie ? 'info' : 'warning',
    title: 'StreetsEmpire — Sign-in Session',
    message: hasCookie ? 'A StreetsEmpire session cookie is saved in this app.' : 'No StreetsEmpire session cookie was saved in this app.',
    detail: [
      `Selected game: ${diagnostics.environment}`,
      `Current page host: ${diagnostics.currentHost}`,
      `Session cookie stored: ${hasCookie ? 'Yes' : 'No'}`,
      'Your account must remain signed in on the same host after Discord authorization.',
      hasCookie ? 'If sign-in still fails, the server may be rejecting the session. Check server logs.' : 'Try a fresh Discord login; if the problem continues, test in a normal browser.',
    ].join('\n'),
    buttons: ['OK'],
  });
}

function showDiscordStatus() {
  const status = presence.getStatus();
  const currentPage = presenceForUrl(currentGameUrl());
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
    detail: summary + '\n\nDiscord OAuth sign-in to the game is separate from local Rich Presence. If connected but not visible, check Discord Desktop → User Settings → Activity Privacy → Share Your Activity.',
    buttons: ['OK'],
  });
}

function testDiscordPresence() {
  if (!settings.presenceEnabled) return shellState();
  if (testPresenceTimer) clearTimeout(testPresenceTimer);
  presence.start();
  presence.setPresence({ details: 'Playing StreetsEmpire', state: 'Testing Discord connection' });
  testPresenceTimer = setTimeout(() => {
    testPresenceTimer = null;
    syncPresence();
  }, 12_000);
  testPresenceTimer.unref?.();
  sendShellState();
  return shellState();
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Game',
      submenu: [
        { label: 'Play Live', type: 'radio', checked: settings.environment === 'live', click: () => changeEnvironment('live') },
        { label: 'Play Beta (invite-only)', type: 'radio', checked: settings.environment === 'beta', click: () => changeEnvironment('beta') },
        { type: 'separator' },
        { label: 'Show Play Tab', accelerator: 'CmdOrCtrl+1', click: () => switchTab('play') },
        { label: 'Reload Game', accelerator: 'CmdOrCtrl+R', click: () => currentGameContents()?.reload() },
        { label: 'Open Game in Browser', click: openWebsite },
        { label: 'Check Sign-in Session…', click: () => void showSessionStatus() },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Discord',
      submenu: [
        { label: 'Show Playing StreetsEmpire', type: 'checkbox', checked: settings.presenceEnabled === true, click: (item) => setPresenceEnabled(item.checked) },
        { type: 'separator' },
        { label: 'Status: ' + presence.getStatus().message.slice(0, 65), enabled: false },
        { label: 'Connection Details…', click: showDiscordStatus },
        { label: 'Reconnect to Discord', enabled: settings.presenceEnabled === true, click: () => { presence.retry(); syncPresence(); } },
        { label: 'Test Rich Presence (12 seconds)', enabled: settings.presenceEnabled === true, click: testDiscordPresence },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { label: settings.immersive ? 'Exit Immersive Mode' : 'Enter Immersive Mode', accelerator: 'F11', click: () => {
          settings.immersive = !settings.immersive;
          saveSettings();
          layoutGameViews();
          sendShellState();
        } },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Get Latest Desktop Version (Beta)', click: () => void shell.openExternal(DESKTOP_BETA_RELEASE_URL) },
        { type: 'separator' },
        { label: `Desktop version ${app.getVersion()}`, enabled: false },
      ],
    },
  ]));
}

function authorizeShellIpc(event) {
  return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
}

function registerIpc() {
  ipcMain.handle('shell:get-state', (event) => authorizeShellIpc(event) ? shellState() : null);
  ipcMain.handle('shell:set-tab', (event, payload) => authorizeShellIpc(event) ? switchTab(payload?.tab) : null);
  ipcMain.handle('shell:switch-environment', (event, payload) => authorizeShellIpc(event) ? changeEnvironment(payload?.environment) : null);
  ipcMain.handle('shell:reload-game', (event) => {
    if (!authorizeShellIpc(event)) return null;
    currentGameContents()?.reload();
    return shellState();
  });
  ipcMain.handle('shell:open-game-external', (event) => {
    if (!authorizeShellIpc(event)) return null;
    openWebsite();
    return shellState();
  });
  ipcMain.handle('shell:set-immersive', (event, payload) => {
    if (!authorizeShellIpc(event)) return null;
    settings.immersive = payload?.immersive === true;
    saveSettings();
    layoutGameViews();
    sendShellState();
    return shellState();
  });
  ipcMain.handle('shell:set-preference', (event, payload) => {
    if (!authorizeShellIpc(event)) return null;
    if (['reducedMotion', 'immersive', 'notificationsOptIn'].includes(payload?.key)) {
      settings[payload.key] = payload.value === true;
      saveSettings();
      layoutGameViews();
      sendShellState();
    }
    return shellState();
  });
  ipcMain.handle('shell:get-diagnostics', async (event) => authorizeShellIpc(event) ? sessionDiagnostic() : null);
  ipcMain.handle('shell:get-updates', (event) => authorizeShellIpc(event) ? buildUpdateMetadata({ version: app.getVersion() }) : null);
  ipcMain.handle('shell:discord-enabled', (event, payload) => authorizeShellIpc(event) ? setPresenceEnabled(payload?.enabled === true) : null);
  ipcMain.handle('shell:discord-reconnect', (event) => {
    if (!authorizeShellIpc(event)) return null;
    if (settings.presenceEnabled) {
      presence.retry();
      syncPresence();
    }
    return shellState();
  });
  ipcMain.handle('shell:discord-test', (event) => authorizeShellIpc(event) ? testDiscordPresence() : null);
  ipcMain.handle('shell:open-release-page', (event) => {
    if (!authorizeShellIpc(event)) return null;
    void shell.openExternal(DESKTOP_BETA_RELEASE_URL);
    return shellState();
  });
}

function persistWindowState() {
  if (!win || win.isDestroyed()) return;
  settings.fullscreen = win.isFullScreen();
  if (!settings.fullscreen && !win.isMaximized() && !win.isMinimized()) settings.windowBounds = win.getBounds();
  saveSettings();
}

function createWindow() {
  const savedBounds = settings.windowBounds || {};
  win = new BrowserWindow({
    title: 'StreetsEmpire',
    width: savedBounds.width || 1350,
    height: savedBounds.height || 840,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 400,
    minHeight: 520,
    show: true,
    icon: appIconPath(),
    autoHideMenuBar: false,
    backgroundColor: '#101419',
    webPreferences: {
      preload: path.join(__dirname, 'shell', 'preload.cjs'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: false,
      webSecurity: true,
    },
  });

  if (settings.fullscreen) win.setFullScreen(true);
  win.once('ready-to-show', () => win?.show());
  win.on('resize', () => { persistWindowState(); layoutGameViews(); });
  win.on('move', persistWindowState);
  win.on('enter-full-screen', () => { settings.fullscreen = true; saveSettings(); sendShellState(); });
  win.on('leave-full-screen', () => { settings.fullscreen = false; saveSettings(); sendShellState(); });
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
  ensureGameView('live');
  if (settings.environment === 'beta') ensureGameView('beta');
  layoutGameViews();
  void win.loadFile(path.join(__dirname, 'shell', 'index.html')).then(sendShellState);
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
    detail: 'Optional. This only shares the current game area (such as Quests or Slots). You can change it anytime in the Discord menu or Discord tab.',
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

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});

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
    registerIpc();
    createWindow();
    await askFirstLaunch();
  });

  app.on('before-quit', () => {
    persistWindowState();
    clearAwayTimer();
    presence.stop();
  });

  app.on('window-all-closed', () => app.quit());
}
