import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const web = new URL('../../apps/web/', import.meta.url);
const html = readFileSync(new URL('index.html', web), 'utf8');
const live = JSON.parse(readFileSync(new URL('public/manifest.webmanifest', web), 'utf8'));
const beta = JSON.parse(readFileSync(new URL('public/manifest-beta.json', web), 'utf8'));

function installMetadataOn(hostname) {
  const script = html.match(/<script data-pwa-branding>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'install-identity script must run in the HTML head');
  assert.ok(html.indexOf('<script data-pwa-branding>') < html.indexOf('</head>'));
  const manifestLink = { href: '/manifest.webmanifest', setAttribute(key, value) { this[key] = value; } };
  const appleTitle = { content: 'StreetsEmpire', setAttribute(key, value) { this[key] = value; } };
  const document = {
    querySelector(selector) {
      if (selector === 'link[rel="manifest"]') return manifestLink;
      if (selector === 'meta[name="apple-mobile-web-app-title"]') return appleTitle;
      throw new Error('Unexpected selector: ' + selector);
    },
  };
  runInNewContext(script, { window: { location: { hostname } }, document });
  return { manifestHref: manifestLink.href, appleTitle: appleTitle.content };
}

test('live game has the StreetsEmpire install identity', () => {
  assert.equal(live.name, 'StreetsEmpire');
  assert.equal(live.short_name, 'StreetsEmpire');
  assert.deepEqual(installMetadataOn('play.streetsempire.dev'), {
    manifestHref: '/manifest.webmanifest',
    appleTitle: 'StreetsEmpire',
  });
});

test('beta game has a distinct install name on Android and iOS', () => {
  assert.equal(beta.name, 'StreetsEmpire Beta');
  assert.match(beta.short_name, /Beta/i, 'short phone shortcut label must visibly say Beta');
  assert.deepEqual(installMetadataOn('beta.streetsempire.dev'), {
    manifestHref: '/manifest-beta.json',
    appleTitle: 'StreetsEmpire Beta',
  });
});

test('unknown origins never masquerade as beta', () => {
  assert.deepEqual(installMetadataOn('localhost'), {
    manifestHref: '/manifest.webmanifest',
    appleTitle: 'StreetsEmpire',
  });
});

test('both installs keep the same icons, isolated origin scope and game entry', () => {
  for (const manifest of [live, beta]) {
    assert.equal(manifest.id, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.start_url, '/game');
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons.length >= 2);
  }
  assert.deepEqual(beta.icons, live.icons);
});
