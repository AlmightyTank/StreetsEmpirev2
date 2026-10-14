'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DiscordPresence, discordPipePaths } = require('../src/discord-ipc.cjs');

function frame(opcode, value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8');
  const header = Buffer.alloc(8);
  header.writeUInt32LE(opcode, 0);
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

test('Windows probes all ten Discord named pipes', () => {
  const p = discordPipePaths('win32', {});
  assert.equal(p.length, 10);
  assert.equal(p[0], '\\\\?\\pipe\\discord-ipc-0');
  assert.equal(p[9], '\\\\?\\pipe\\discord-ipc-9');
});

test('macOS/Linux searches all Discord IPC environment directories and /tmp', () => {
  const p = discordPipePaths('linux', {
    XDG_RUNTIME_DIR: '/run/user/1000',
    TMPDIR: '/tmp/current-user',
    TEMP: '/tmp/current-user',
  });
  assert.equal(new Set(p).size, p.length);
  assert.ok(p.includes('/run/user/1000/discord-ipc-0'));
  assert.ok(p.includes('/tmp/current-user/discord-ipc-9'));
  assert.ok(p.includes('/tmp/discord-ipc-0'));
  assert.ok(p.includes('/run/user/1000/app/com.discordapp.Discord/discord-ipc-0'));
  assert.equal(discordPipePaths('darwin', {})[0], '/tmp/discord-ipc-0');
});

test('presence distinguishes missing configuration from enabled but disconnected', () => {
  const missing = new DiscordPresence('');
  assert.equal(missing.start(), false);
  assert.equal(missing.getStatus().kind, 'not-configured');
  assert.equal(missing.getStatus().configured, false);
  const configured = new DiscordPresence('123456789012345678');
  assert.equal(configured.getStatus().kind, 'off');
  assert.equal(configured.getStatus().configured, true);
});

test('handshake then SET_ACTIVITY acknowledgment reports actual success', () => {
  const notifications = [];
  const rpc = new DiscordPresence('123456789012345678', {}, status => notifications.push(status.kind));
  const sent = [];
  rpc._write = (opcode, payload) => sent.push({ opcode, payload });
  rpc.stopped = false;
  rpc.setPresence({ details: 'Playing StreetsEmpire', state: 'Scouting the streets' });
  rpc._onData(frame(1, { cmd: 'DISPATCH', evt: 'READY', data: {} }));
  assert.equal(rpc.getStatus().kind, 'sending');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].payload.cmd, 'SET_ACTIVITY');
  assert.equal(sent[0].payload.args.activity.state, 'Scouting the streets');
  const nonce = sent[0].payload.nonce;
  rpc._onData(frame(1, { cmd: 'SET_ACTIVITY', nonce, data: {} }));
  assert.equal(rpc.getStatus().kind, 'active');
  assert.match(rpc.getStatus().message, /Discord accepted activity/);
  assert.ok(notifications.includes('connected'));
  assert.ok(notifications.includes('active'));
});

test('Discord rejects updates with a useful in-app status', () => {
  const rpc = new DiscordPresence('123456789012345678');
  rpc._write = () => {};
  rpc.stopped = false;
  rpc.ready = true;
  rpc.setPresence({ details: 'Playing StreetsEmpire', state: 'At the casino' });
  rpc._onData(frame(1, { cmd: 'SET_ACTIVITY', evt: 'ERROR', data: { message: 'Invalid asset key' } }));
  assert.equal(rpc.getStatus().kind, 'rejected');
  assert.match(rpc.getStatus().message, /Invalid asset key/);
  assert.equal(rpc.sent, undefined);
});

test('the socket safely responds to Discord PING', () => {
  const rpc = new DiscordPresence('123456789012345678');
  const writes = [];
  rpc._write = (opcode, payload) => writes.push({ opcode, payload });
  rpc._onData(frame(3, { random: true }));
  assert.equal(writes.length, 1);
  assert.equal(writes[0].opcode, 4);
});
