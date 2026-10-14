'use strict';

const api = window.streetsempire;
let state = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function text(value) {
  return String(value ?? '');
}

function renderTabs() {
  $$('[data-tab-target]').forEach(button => {
    const active = button.dataset.tabTarget === state.activeTab;
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $$('.panel').forEach(panel => {
    panel.hidden = panel.id !== `panel-${state.activeTab}`;
  });
  $('#app').dataset.tab = state.activeTab;
}

function renderPlay() {
  $$('[data-env]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.env === state.environment)));
  const status = $('#play-status');
  status.textContent = state.gameStatus?.message || 'Ready';
  status.classList.toggle('error', ['failed', 'offline'].includes(state.gameStatus?.kind));
  $('#play-message').textContent = state.gameStatus?.kind === 'ready' ? '' : state.gameStatus?.message || 'Loading StreetsEmpire…';
}

function renderDiscord() {
  const status = state.discordStatus || {};
  $('#discord-status').innerHTML = `
    <strong>${text(status.message || 'Discord status unavailable')}</strong>
    <p>Configuration: ${status.configured ? 'Application ID present' : 'Application ID missing from this build'}</p>
    <p>Rich Presence: ${state.settings?.presenceEnabled ? 'Enabled' : 'Disabled'}</p>
    <p>Connection state: ${text(status.kind || 'unknown')}</p>`;
  $('#discord-toggle').textContent = state.settings?.presenceEnabled ? 'Disable Rich Presence' : 'Enable Rich Presence';
  const enabled = state.settings?.presenceEnabled === true;
  $('#discord-reconnect').disabled = !enabled;
  $('#discord-test').disabled = !enabled;
  $('#discord-preview').innerHTML = `
    <strong>Activity preview</strong>
    <p>Details: Playing StreetsEmpire</p>
    <p>State: ${text(state.activityPreview?.state || 'Open a game page to share a broad area label')}</p>
    <p>Large artwork key: ${text(state.discordArtwork?.largeImage || 'not configured')}</p>
    <p>Small artwork key: ${text(state.discordArtwork?.smallImage || 'not configured')}</p>
    <p class="muted">Missing or rejected artwork is reported by Discord status; gameplay remains available.</p>`;
}

function renderSettings() {
  $('#setting-environment').value = state.environment;
  $('#setting-reduced-motion').checked = state.settings?.reducedMotion === true;
  $('#setting-immersive').checked = state.settings?.immersive === true;
  $('#setting-notifications').checked = state.settings?.notificationsOptIn === true;
  $('#app').classList.toggle('reduced-motion', state.settings?.reducedMotion === true);
  $('#app').classList.toggle('immersive', state.settings?.immersive === true && state.activeTab === 'play');
  $('#immersive-restore').hidden = !(state.settings?.immersive === true && state.activeTab === 'play');
}

async function renderDiagnostics() {
  try {
    const diag = await api.getDiagnostics();
    $('#diagnostics').textContent = JSON.stringify(diag, null, 2);
  } catch {
    $('#diagnostics').textContent = 'Diagnostics unavailable.';
  }
}

async function renderUpdates() {
  try {
    const updates = await api.getUpdates();
    $('#updates-content').innerHTML = ['live', 'beta', 'desktop'].map(key => {
      const item = updates[key];
      const release = item.releaseUrl ? `<p><button data-release-link type="button">Open trusted release page</button></p>` : '';
      return `<article class="update-card"><h2>${text(item.label)}</h2><p>${text(item.message)}</p><p>Status: ${text(item.status)}</p>${item.version ? `<p>Version: ${text(item.version)}</p>` : ''}${release}</article>`;
    }).join('') + `<p class="muted">${text(updates.sourceNote)}</p>`;
  } catch {
    $('#updates-content').innerHTML = '<article class="update-card"><h2>Updates unavailable</h2><p>Play remains available while update sources are unavailable.</p></article>';
  }
}

async function render(next) {
  state = next;
  renderTabs();
  renderPlay();
  renderDiscord();
  renderSettings();
  if (state.activeTab === 'updates') await renderUpdates();
  if (state.activeTab === 'settings') await renderDiagnostics();
}

function bindEvents() {
  $$('[data-tab-target]').forEach(button => {
    button.addEventListener('click', () => api.setTab(button.dataset.tabTarget));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const tabs = $$('[data-tab-target]');
      const index = tabs.indexOf(button);
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
      tabs[next].focus();
      api.setTab(tabs[next].dataset.tabTarget);
    });
  });
  $$('[data-env]').forEach(button => button.addEventListener('click', () => api.switchEnvironment(button.dataset.env)));
  $('#reload-game').addEventListener('click', () => api.reloadGame());
  $('#open-game').addEventListener('click', () => api.openGameExternal());
  $('#immersive-on').addEventListener('click', () => api.setImmersive(true));
  $('#immersive-restore').addEventListener('click', () => api.setImmersive(false));
  $('#discord-toggle').addEventListener('click', () => api.setDiscordEnabled(!state.settings?.presenceEnabled));
  $('#discord-reconnect').addEventListener('click', () => api.reconnectDiscord());
  $('#discord-test').addEventListener('click', () => api.testDiscord());
  $('#setting-environment').addEventListener('change', event => api.switchEnvironment(event.target.value));
  $('#setting-reduced-motion').addEventListener('change', event => api.setPreference('reducedMotion', event.target.checked));
  $('#setting-immersive').addEventListener('change', event => api.setPreference('immersive', event.target.checked));
  $('#setting-notifications').addEventListener('change', event => api.setPreference('notificationsOptIn', event.target.checked));
  $('#refresh-diagnostics').addEventListener('click', renderDiagnostics);
  $('#settings-release').addEventListener('click', () => api.openReleasePage());
  document.addEventListener('click', event => {
    if (event.target?.matches?.('[data-release-link]')) api.openReleasePage();
  });
}

bindEvents();
api.onState(render);
api.getState().then(render).catch(() => {
  $('#play-message').textContent = 'Desktop shell failed to initialize.';
});
