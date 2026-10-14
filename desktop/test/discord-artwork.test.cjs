'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DiscordPresence } = require('../src/discord-ipc.cjs');

test('native presence maps Discord registered artwork keys and start time', () => {
  const client = new DiscordPresence('123456789012345678', {
    largeImage: 'streetsempire_city',
    smallImage: 'streetsempire_logo',
  });
  const calls = [];
  client._write = (opcode, payload) => calls.push({ opcode, payload });
  client.stopped = false;
  client.ready = true;
  client.setPresence({ details: 'Playing StreetsEmpire', state: 'Playing Blackjack' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opcode, 1);
  const activity = calls[0].payload.args.activity;
  assert.equal(activity.type, 0);
  assert.equal(activity.details, 'Playing StreetsEmpire');
  assert.equal(activity.state, 'Playing Blackjack');
  assert.deepEqual(activity.assets, {
    large_image: 'streetsempire_city',
    large_text: 'StreetsEmpire — Build Your Empire',
    small_image: 'streetsempire_logo',
    small_text: 'Playing StreetsEmpire',
  });
  assert.ok(activity.timestamps.start > 0);
  assert.equal(activity.timestamps.end, undefined);
  assert.equal(activity.party, undefined);
  assert.equal(activity.secrets, undefined);
  client.setPresence(null);
  assert.equal(calls.at(-1).payload.args.activity, null);
});

test('no nonexistent/default artwork keys are sent if not configured', () => {
  const client = new DiscordPresence('123456789012345678');
  const calls = [];
  client._write = (opcode, payload) => calls.push(payload);
  client.stopped = false;
  client.ready = true;
  client.setPresence({ details: 'Playing StreetsEmpire', state: 'Scouting the streets' });
  assert.equal(calls[0].args.activity.assets, undefined);
});

test('invalid keys cannot reach the Discord activity', () => {
  const client = new DiscordPresence('123456789012345678', {
    largeImage: 'https://attacker.example/bad.png',
    smallImage: 'UNREGISTERED SPACE',
  });
  const calls = [];
  client._write = (opcode, payload) => calls.push(payload);
  client.stopped = false;
  client.ready = true;
  client.setPresence({ details: 'Playing StreetsEmpire', state: 'Building an empire' });
  assert.equal(calls[0].args.activity.assets, undefined);
});
