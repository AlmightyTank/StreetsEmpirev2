'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DESKTOP_BETA_RELEASE_URL,
  TABS,
  normalizeSettings,
  sanitizeGameUrl,
  buildUpdateMetadata,
  buildDiagnostics,
  validateTab,
} = require('../src/shell-state.cjs');
const { GAME_ORIGINS } = require('../src/activity.cjs');

test('desktop shell exposes exactly four primary tabs with Live/Beta outside primary navigation', () => {
  assert.deepEqual(TABS, ['play', 'updates', 'discord', 'settings']);
  assert.equal(TABS.includes('live'), false);
  assert.equal(TABS.includes('beta'), false);
  assert.equal(validateTab('discord'), 'discord');
  assert.equal(validateTab('casino'), null);
});

test('settings migrate safely with app-only defaults and no executable-folder secrets', () => {
  const settings = normalizeSettings({
    environment: 'beta',
    presenceEnabled: true,
    reducedMotion: true,
    immersive: true,
    notificationsOptIn: true,
    fullscreen: true,
    windowBounds: { x: 1.2, y: 2.8, width: 320, height: 400 },
  });
  assert.equal(settings.environment, 'beta');
  assert.equal(settings.presenceEnabled, true);
  assert.equal(settings.reducedMotion, true);
  assert.equal(settings.immersive, true);
  assert.equal(settings.notificationsOptIn, true);
  assert.equal(settings.fullscreen, true);
  assert.deepEqual(settings.windowBounds, { x: 1, y: 3, width: 400, height: 520 });
  assert.deepEqual(Object.keys(settings.lastLocations), ['live', 'beta']);
});

test('last safe game URLs cannot cross hosts or capture OAuth/token URLs', () => {
  assert.equal(sanitizeGameUrl('https://play.streetsempire.dev/game/turf', 'live', GAME_ORIGINS), 'https://play.streetsempire.dev/game/turf');
  assert.equal(sanitizeGameUrl('https://beta.streetsempire.dev/game/quests', 'live', GAME_ORIGINS), null);
  assert.equal(sanitizeGameUrl('https://play.streetsempire.dev/login?code=secret', 'live', GAME_ORIGINS), 'https://play.streetsempire.dev/game');
  assert.equal(sanitizeGameUrl('https://attacker.example/game', 'beta', GAME_ORIGINS), null);
});

test('update metadata distinguishes web gameplay notes from desktop executable releases', () => {
  const updates = buildUpdateMetadata({ version: '0.2.0' });
  assert.equal(updates.desktop.version, '0.2.0');
  assert.equal(updates.desktop.releaseUrl, DESKTOP_BETA_RELEASE_URL);
  assert.equal(updates.desktop.status, 'manual-link');
  assert.equal(updates.live.status, 'unavailable');
  assert.match(updates.live.message, /No desktop download is required/);
  assert.match(updates.desktop.message, /never downloads, installs, or executes/);
});

test('diagnostics report presence and redact secret-like values', () => {
  const diagnostics = buildDiagnostics({
    environment: 'live',
    currentUrl: 'https://play.streetsempire.dev/game?code=secret',
    hasSessionCookie: true,
    discordStatus: { kind: 'error', message: 'bad token=abc123 at https://x.test/callback?code=secret' },
    updateStatus: 'manual-link',
    version: '0.2.0',
  });
  assert.equal(diagnostics.sessionCookie, 'present');
  assert.equal(diagnostics.currentHost, 'play.streetsempire.dev');
  assert.doesNotMatch(JSON.stringify(diagnostics), /abc123|secret/);
  assert.match(diagnostics.discord, /\[redacted/);
});
