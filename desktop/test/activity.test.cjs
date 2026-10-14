'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { trustedNavigation, externalLink, presenceForUrl } = require('../src/activity.cjs');

test('loads only game domains and Discord OAuth domains inside the client', () => {
  assert.equal(trustedNavigation('https://play.streetsempire.dev/login'), true);
  assert.equal(trustedNavigation('https://beta.streetsempire.dev/game'), true);
  assert.equal(trustedNavigation('https://discord.com/oauth2/authorize'), true);
  assert.equal(trustedNavigation('https://streetsempire.dev.evil.test/game'), false);
  assert.equal(trustedNavigation('file:///C:/test.html'), false);
  assert.equal(trustedNavigation('javascript:alert(1)'), false);
  assert.equal(trustedNavigation('http://play.streetsempire.dev/game'), false);
  assert.equal(trustedNavigation('https://me@discord.com/'), false);
});
test('opens only https links externally', () => {
  assert.equal(externalLink('https://example.com'), true);
  assert.equal(externalLink('file:///etc/passwd'), false);
  assert.equal(externalLink('javascript:alert(1)'), false);
});
test('presence is set only for the authenticated game area', () => {
  assert.equal(presenceForUrl('https://play.streetsempire.dev/login'), null);
  assert.equal(presenceForUrl('https://discord.com/oauth2/authorize'), null);
  assert.equal(presenceForUrl('https://play.streetsempire.dev/game')?.state, 'Building an empire');
  assert.equal(presenceForUrl('https://beta.streetsempire.dev/game/casino/blackjack')?.state, 'Playing Blackjack');
  assert.equal(presenceForUrl('https://play.streetsempire.dev/game/quests')?.state, 'Completing quests');
  assert.equal(presenceForUrl('https://play.streetsempire.dev/game/scout?district=hidden')?.state, 'Scouting the streets');
});
