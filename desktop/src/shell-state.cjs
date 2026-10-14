'use strict';

const DESKTOP_BETA_RELEASE_URL = 'https://github.com/AlmightyTank/StreetsEmpirev2/releases/tag/desktop-beta';
const UPDATE_SOURCE_NOTE = 'Live and Beta gameplay notes are website-owned sources; until an authenticated changelog feed is confirmed, the desktop client shows a safe unavailable/manual-link state. Desktop executable release metadata uses the permanent GitHub Desktop Beta release URL.';

const TABS = Object.freeze(['play', 'updates', 'discord', 'settings']);
const ENVIRONMENTS = Object.freeze(['live', 'beta']);

function normalizeEnvironment(value) {
  return value === 'beta' ? 'beta' : 'live';
}

function defaultSettings() {
  return {
    environment: 'live',
    presenceEnabled: null,
    reducedMotion: false,
    immersive: false,
    notificationsOptIn: false,
    windowBounds: null,
    fullscreen: false,
    lastLocations: { live: null, beta: null },
  };
}

function normalizeSettings(value = {}) {
  const defaults = defaultSettings();
  const bounds = value.windowBounds && Number.isFinite(value.windowBounds.width) &&
    Number.isFinite(value.windowBounds.height)
    ? {
        width: Math.max(400, Math.round(value.windowBounds.width)),
        height: Math.max(520, Math.round(value.windowBounds.height)),
        ...(Number.isFinite(value.windowBounds.x) ? { x: Math.round(value.windowBounds.x) } : {}),
        ...(Number.isFinite(value.windowBounds.y) ? { y: Math.round(value.windowBounds.y) } : {}),
      }
    : null;
  return {
    ...defaults,
    environment: normalizeEnvironment(value.environment),
    presenceEnabled: typeof value.presenceEnabled === 'boolean' ? value.presenceEnabled : null,
    reducedMotion: value.reducedMotion === true,
    immersive: value.immersive === true,
    notificationsOptIn: value.notificationsOptIn === true,
    fullscreen: value.fullscreen === true,
    windowBounds: bounds,
    lastLocations: {
      live: sanitizeGameUrl(value.lastLocations?.live, 'live'),
      beta: sanitizeGameUrl(value.lastLocations?.beta, 'beta'),
    },
  };
}

function sanitizeGameUrl(rawUrl, environment, origins) {
  if (!rawUrl || !origins) return null;
  try {
    const url = new URL(rawUrl);
    const origin = origins[normalizeEnvironment(environment)];
    if (url.origin !== origin) return null;
    if (url.username || url.password) return null;
    if (url.pathname !== '/game' && !url.pathname.startsWith('/game/')) return origin + '/game';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function buildUpdateMetadata({ version, fetchedAt = new Date().toISOString() } = {}) {
  return {
    fetchedAt,
    desktop: {
      label: 'Desktop executable updates',
      version: version || '0.0.0',
      status: 'manual-link',
      message: 'Desktop app updates require downloading a reviewed build. The app never downloads, installs, or executes binaries automatically.',
      releaseUrl: DESKTOP_BETA_RELEASE_URL,
    },
    live: {
      label: 'Live gameplay updates',
      status: 'unavailable',
      message: 'Live gameplay updates are delivered by the website automatically. No desktop download is required for web-only changes.',
    },
    beta: {
      label: 'Beta previews',
      status: 'unavailable',
      message: 'Beta notes require an approved website source. Beta access remains invite-only and server-side.',
    },
    sourceNote: UPDATE_SOURCE_NOTE,
  };
}

function redactDiagnosticValue(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/(code|token|password|secret|cookie)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/se_session=[^;\s]+/gi, 'se_session=[redacted]')
    .replace(/https?:\/\/\S*(code|token|password|secret|cookie)\S*/gi, '[redacted-url]');
}

function buildDiagnostics({ environment, currentUrl, hasSessionCookie, discordStatus, updateStatus, version }) {
  let currentHost = 'unknown';
  try { currentHost = new URL(currentUrl).hostname; } catch {}
  return {
    environment: normalizeEnvironment(environment),
    currentHost,
    sessionCookie: hasSessionCookie ? 'present' : 'absent',
    discord: redactDiagnosticValue(discordStatus?.message || 'unknown'),
    discordKind: discordStatus?.kind || 'unknown',
    updates: updateStatus || 'manual-link',
    version: version || '0.0.0',
  };
}

function validateTab(value) {
  return TABS.includes(value) ? value : null;
}

module.exports = {
  DESKTOP_BETA_RELEASE_URL,
  UPDATE_SOURCE_NOTE,
  TABS,
  ENVIRONMENTS,
  defaultSettings,
  normalizeSettings,
  normalizeEnvironment,
  sanitizeGameUrl,
  buildUpdateMetadata,
  buildDiagnostics,
  redactDiagnosticValue,
  validateTab,
};
