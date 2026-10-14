'use strict';

const net = require('node:net');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_FRAME = 256 * 1024;
const RETRY_MS = 15_000;
const HANDSHAKE_TIMEOUT_MS = 5_000;
const PIPE_LIMIT = 10;
const RICH_PRESENCE_TYPE_PLAYING = 0;
const MAX_ACTIVITY_TEXT_LENGTH = 128;
const PLAY_URL = 'https://play.streetsempire.dev';

/** Discord can choose one of ten pipes in several candidate directories. */
function discordPipePaths(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    return Array.from({ length: PIPE_LIMIT }, (_, i) => '\\\\?\\pipe\\discord-ipc-' + i);
  }
  const dirs = [
    env.XDG_RUNTIME_DIR,
    env.TMPDIR,
    env.TMP,
    env.TEMP,
    '/tmp',
  ].filter(Boolean);
  // The Flatpak Discord package commonly exports the socket in its app
  // namespace rather than the main XDG runtime directory.
  if (env.XDG_RUNTIME_DIR) dirs.push(path.posix.join(env.XDG_RUNTIME_DIR, 'app/com.discordapp.Discord'));
  const uniqueDirs = [...new Set(dirs)];
  return uniqueDirs.flatMap(dir =>
    Array.from({ length: PIPE_LIMIT }, (_, i) => path.posix.join(dir, 'discord-ipc-' + i)));
}

function safeStatusError(error) {
  if (typeof error !== 'string') return 'Discord returned an unknown error';
  // Keep diagnostics user friendly. Never surface OAuth data or credentials.
  return error.replace(/https?:\/\/\S+/gi, '[url]').slice(0, 160);
}

function activityText(value, fallback) {
  const text = String(value || fallback || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_ACTIVITY_TEXT_LENGTH);
  return text || fallback;
}

function buildRichPresenceActivity(desired, artwork = {}, startedAt = Math.floor(Date.now() / 1000)) {
  if (!desired) return null;
  const activity = {
    // Discord RPC SET_ACTIVITY uses Activity type 0 for Rich Presence "Playing".
    type: RICH_PRESENCE_TYPE_PLAYING,
    details: activityText(desired.details, 'Playing StreetsEmpire'),
    state: activityText(desired.state, 'Building an empire'),
    timestamps: { start: startedAt },
    buttons: [{ label: 'Play StreetsEmpire', url: PLAY_URL }],
  };
  if (artwork.largeImage || artwork.smallImage) {
    activity.assets = {
      ...(artwork.largeImage ? {
        large_image: artwork.largeImage,
        large_text: 'StreetsEmpire — Build Your Empire',
      } : {}),
      ...(artwork.smallImage ? {
        small_image: artwork.smallImage,
        small_text: 'Playing StreetsEmpire',
      } : {}),
    };
  }
  return activity;
}

/**
 * Local Discord RPC over IPC. No Discord user token or bot token is required.
 * All native communication stays in the privileged Electron main process.
 */
class DiscordPresence {
  constructor(clientId, artwork = {}, onStatusChange = () => {}) {
    this.clientId = /^\d{17,20}$/.test(clientId || '') ? clientId : null;
    const assetKey = value =>
      typeof value === 'string' && /^[a-z0-9_-]{1,128}$/.test(value) ? value : '';
    this.artwork = {
      largeImage: assetKey(artwork.largeImage),
      smallImage: assetKey(artwork.smallImage),
    };
    this.onStatusChange = onStatusChange;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.ready = false;
    this.stopped = true;
    this.retryTimer = null;
    this.handshakeTimer = null;
    this.desired = null;
    this.sent = undefined;
    this.pendingNonce = null;
    this.sessionStart = null;
    this.paths = [];
    this.status = {
      kind: this.clientId ? 'off' : 'not-configured',
      message: this.clientId ? 'Discord activity is off' : 'No Discord Application ID in this build',
    };
  }

  getStatus() {
    return { ...this.status, connected: this.ready, configured: Boolean(this.clientId) };
  }

  _status(kind, message) {
    if (this.status.kind === kind && this.status.message === message) return;
    this.status = { kind, message };
    try { this.onStatusChange(this.getStatus()); }
    catch (error) { console.warn('Discord status UI update failed:', safeStatusError(error?.message)); }
  }

  start() {
    if (!this.clientId) {
      this._status('not-configured', 'Discord Application ID missing from this build');
      return false;
    }
    if (!this.stopped) return true;
    this.stopped = false;
    this.paths = discordPipePaths();
    this._status('connecting', 'Searching for the Discord desktop app');
    this._connect(0);
    return true;
  }

  setPresence(next) {
    if (!next && !this.desired) return;
    if (next && this.sessionStart === null) this.sessionStart = Math.floor(Date.now() / 1000);
    if (!next) this.sessionStart = null;
    this.desired = next ? {
      details: activityText(next.details, 'Playing StreetsEmpire'),
      state: activityText(next.state, 'Building an empire'),
    } : null;
    this._sendCurrent();
  }

  stop() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.retryTimer = null;
    this.handshakeTimer = null;
    if (this.ready) {
      this.desired = null;
      this.sent = undefined;
      this._sendCurrent();
    }
    this.stopped = true;
    this.desired = null;
    this.sessionStart = null;
    this.socket?.end();
    this.socket?.destroy();
    this.socket = null;
    this.ready = false;
    this.pendingNonce = null;
    this._status(this.clientId ? 'off' : 'not-configured',
      this.clientId ? 'Discord activity is off' : 'No Discord Application ID in this build');
  }

  retry() {
    this.stop();
    return this.start();
  }

  _connect(index) {
    if (this.stopped || this.socket) return;
    if (index >= this.paths.length) {
      this._status('not-found', 'Discord desktop app not detected; start Discord and enable Activity Sharing');
      this._scheduleReconnect();
      return;
    }
    const socket = net.createConnection(this.paths[index]);
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on('connect', () => {
      this._status('handshake', 'Connected to Discord socket, waiting for handshake');
      this._write(0, { v: 1, client_id: this.clientId });
      this.handshakeTimer = setTimeout(() => {
        this._status('error', 'Discord handshake timed out');
        socket.destroy();
      }, HANDSHAKE_TIMEOUT_MS);
      this.handshakeTimer.unref?.();
    });
    socket.on('data', chunk => this._onData(chunk));
    socket.on('error', error => {
      // Missing sockets are routine, because Discord can choose any pipe.
      if (!['ENOENT', 'ECONNREFUSED', 'EPIPE'].includes(error?.code)) {
        this._status('error', 'Discord connection error: ' + safeStatusError(error?.code || error?.message));
      }
      socket.destroy();
    });
    socket.on('close', () => {
      if (this.socket !== socket) return;
      if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
      this.socket = null;
      this.ready = false;
      this.sent = undefined;
      this.pendingNonce = null;
      this.buffer = Buffer.alloc(0);
      if (!this.stopped) this._connect(index + 1);
    });
  }

  _scheduleReconnect() {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this._status('connecting', 'Retrying the Discord desktop connection');
      this._connect(0);
    }, RETRY_MS);
    this.retryTimer.unref?.();
  }

  _write(opcode, payload) {
    if (!this.socket || this.socket.destroyed) return;
    const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload), 'utf8');
    const header = Buffer.alloc(8);
    header.writeUInt32LE(opcode, 0);
    header.writeUInt32LE(bytes.length, 4);
    this.socket.write(Buffer.concat([header, bytes]));
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 8) {
      const opcode = this.buffer.readUInt32LE(0);
      const length = this.buffer.readUInt32LE(4);
      if (length > MAX_FRAME) {
        this._status('error', 'Discord sent an invalid RPC frame');
        this.socket?.destroy();
        return;
      }
      if (this.buffer.length < 8 + length) return;
      const payload = this.buffer.subarray(8, 8 + length);
      this.buffer = this.buffer.subarray(8 + length);
      if (opcode === 3) {
        this._write(4, payload); // PING -> PONG
        continue;
      }
      if (opcode === 2) {
        this._status('error', 'Discord closed the RPC connection');
        this.socket?.destroy();
        return;
      }
      if (opcode !== 1) continue;

      let frame;
      try { frame = JSON.parse(payload.toString('utf8')); }
      catch { continue; }
      if (frame.evt === 'READY') {
        if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
        this.ready = true;
        this._status('connected', 'Connected to Discord; waiting for gameplay');
        this._sendCurrent();
      } else if (frame.evt === 'ERROR') {
        this.sent = undefined;
        const message = safeStatusError(frame.data?.message);
        this._status('rejected', 'Discord rejected Rich Presence: ' + message);
      } else if (frame.cmd === 'SET_ACTIVITY' && frame.nonce === this.pendingNonce) {
        this.pendingNonce = null;
        this._status(this.desired ? 'active' : 'connected', this.desired
          ? 'Discord accepted activity: ' + this.desired.state
          : 'Connected to Discord; waiting for gameplay');
      }
    }
  }

  _sendCurrent() {
    if (!this.ready || this.stopped) return;
    const key = JSON.stringify(this.desired);
    if (key === this.sent) return;
    this.sent = key;

    const activity = buildRichPresenceActivity(
      this.desired,
      this.artwork,
      this.sessionStart ?? Math.floor(Date.now() / 1000));

    this.pendingNonce = randomUUID();
    this._status('sending', this.desired
      ? 'Sending activity to Discord: ' + this.desired.state
      : 'Clearing Discord game activity');
    this._write(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity }, nonce: this.pendingNonce });
  }
}

module.exports = { DiscordPresence, discordPipePaths, buildRichPresenceActivity };
