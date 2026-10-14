'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

contextBridge.exposeInMainWorld('streetsempire', {
  getState: () => invoke('shell:get-state'),
  setTab: (tab) => invoke('shell:set-tab', { tab }),
  switchEnvironment: (environment) => invoke('shell:switch-environment', { environment }),
  reloadGame: () => invoke('shell:reload-game'),
  openGameExternal: () => invoke('shell:open-game-external'),
  setImmersive: (immersive) => invoke('shell:set-immersive', { immersive }),
  setPreference: (key, value) => invoke('shell:set-preference', { key, value }),
  getDiagnostics: () => invoke('shell:get-diagnostics'),
  getUpdates: () => invoke('shell:get-updates'),
  setDiscordEnabled: (enabled) => invoke('shell:discord-enabled', { enabled }),
  reconnectDiscord: () => invoke('shell:discord-reconnect'),
  testDiscord: () => invoke('shell:discord-test'),
  openReleasePage: () => invoke('shell:open-release-page'),
  onState: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('shell:state', listener);
    return () => ipcRenderer.removeListener('shell:state', listener);
  },
});
