'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { OAuthCallbackGuard } = require('../src/oauth-callback-guard.cjs');

test('a duplicate Discord callback is redirected before a second code exchange', () => {
  const guard = new OAuthCallbackGuard();
  const url = 'https://beta.streetsempire.dev/api/auth/discord/callback?code=unique-auth-code&state=signed-state&iss=https%3A%2F%2Fdiscord.com';
  assert.equal(guard.redirectForReplay(url, 1000), null);
  assert.equal(guard.redirectForReplay(url, 1060), 'https://beta.streetsempire.dev/join');
  assert.equal(guard.redirectForReplay(url, 1000 + 120_000), null);
});

test('guard is scoped to code, state and game origin', () => {
  const guard = new OAuthCallbackGuard();
  const first = 'https://beta.streetsempire.dev/api/auth/discord/callback?code=code-a&state=state-a';
  assert.equal(guard.redirectForReplay(first, 5000), null);
  assert.equal(guard.redirectForReplay('https://beta.streetsempire.dev/api/auth/discord/callback?code=code-b&state=state-a', 5100), null);
  assert.equal(guard.redirectForReplay('https://beta.streetsempire.dev/api/auth/discord/callback?code=code-a&state=state-b', 5200), null);
  assert.equal(guard.redirectForReplay('https://play.streetsempire.dev/api/auth/discord/callback?code=code-a&state=state-a', 5300), null);
  assert.equal(guard.redirectForReplay(first, 5400), 'https://beta.streetsempire.dev/join');
});

test('guard leaves other pages, malformed callbacks, and unrelated hosts alone', () => {
  const guard = new OAuthCallbackGuard();
  assert.equal(guard.redirectForReplay('https://beta.streetsempire.dev/login'), null);
  assert.equal(guard.redirectForReplay('https://beta.streetsempire.dev/api/auth/discord/callback?code=a'), null);
  assert.equal(guard.redirectForReplay('https://attacker.example/api/auth/discord/callback?code=a&state=b'), null);
  assert.equal(guard.redirectForReplay('http://beta.streetsempire.dev/api/auth/discord/callback?code=a&state=b'), null);
  assert.equal(guard.redirectForReplay('not a url'), null);
});

test('guard forgets old fingerprints and bounds memory', () => {
  const guard = new OAuthCallbackGuard();
  for (let n=0; n<120; n++) guard.redirectForReplay(`https://beta.streetsempire.dev/api/auth/discord/callback?code=${n}&state=fixed`, 1000+n);
  assert.ok(guard.recent.size <= 100);
  assert.equal(guard.redirectForReplay('https://beta.streetsempire.dev/api/auth/discord/callback?code=0&state=fixed', 1200), null);
});
