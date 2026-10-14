'use strict';

const net = require('node:net');
const { randomUUID } = require('node:crypto');

const MAX_FRAME = 256 * 1024;
const RETRY_MS = 15_000;
const PIPE_LIMIT = 10;

function pipePath(index) {
  if (process.platform === 'win32') return '\\\\?\\pipe\\discord-ipc-' + index;
  const dir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  return dir + '/discord-ipc-' + index;
}

/**
 * Discord's documented local RPC-over-IPC protocol. Runs only in Electron's
 * privileged main process; the remote website has no IPC/Node access.
 *
 * Uses the public Discord Application ID, never a bot token or user token.
 * If Discord is closed, the game keeps working and reconnects when possible.
 */
class DiscordPresence {
  constructor(clientId, artwork = {}) {
    this.clientId = /^\d{17,20}$/.test(clientId || '') ? clientId : null;
    const assetKey = (value) => typeof value === 'string' && /^[a-z0-9_-]{1,128}$/.test(value) ? value : '';
    this.artwork = {
      largeImage: assetKey(artwork.largeImage),
      smallImage: assetKey(artwork.smallImage),
    };
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.ready = false;
    this.stopped = true;
    this.retryTimer = null;
    this.desired = null;
    this.sent = undefined;
    this.sessionStart = null;
  }

  start() {
    if (!this.clientId || !this.stopped) return false;
    this.stopped = false;
    this._connect(0);
    return true;
  }

  setPresence(presence) {
    if (!presence && this.desired === null) return;
    if (presence && this.sessionStart === null) this.sessionStart = Math.floor(Date.now() / 1000);
    if (!presence) this.sessionStart = null;
    this.desired = presence ? { details: presence.details, state: presence.state } : null;
    this._sendCurrent();
  }

  stop() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.ready) {
      this.desired = null;
      this.sent = undefined;
      this._sendCurrent();
    }
    this.stopped = true;
    this.desired = null;
    this.sessionStart = null;
    this.socket?.end();
    this.socket = null;
    this.ready = false;
  }

  _connect(index) {
    if (this.stopped || this.socket) return;
    if (index >= PIPE_LIMIT) {
      this._scheduleReconnect();
      return;
    }

    const socket = net.createConnection(pipePath(index));
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on('connect', () => this._write(0, { v: 1, client_id: this.clientId }));
    socket.on('data', (data) => this._onData(data));
    socket.on('error', () => socket.destroy());
    socket.on('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.ready = false;
      this.sent = undefined;
      this.buffer = Buffer.alloc(0);
      if (!this.stopped) this._connect(index + 1);
    });
  }

  _scheduleReconnect() {
    if (this.stopped || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this._connect(0);
    }, RETRY_MS);
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
        this.socket?.destroy();
        return;
      }
      if (this.buffer.length < 8 + length) return;
      const payload = this.buffer.subarray(8, 8 + length);
      this.buffer = this.buffer.subarray(8 + length);

      if (opcode === 3) {
        this._write(4, payload); // Discord PING -> PONG.
        continue;
      }
      if (opcode === 2) {
        this.socket?.destroy();
        return;
      }
      if (opcode !== 1) continue;
      let frame;
      try { frame = JSON.parse(payload.toString('utf8')); } catch { continue; }
      if (frame.evt === 'READY') {
        this.ready = true;
        this._sendCurrent();
      } else if (frame.evt === 'ERROR') {
        console.warn('Discord presence rejected an update:', frame.data?.message || 'unknown error');
      }
    }
  }

  _sendCurrent() {
    if (!this.ready || this.stopped) return;
    const key = JSON.stringify(this.desired);
    if (key === this.sent) return;
    this.sent = key;

    const activity = this.desired ? {
      type: 0,
      details: this.desired.details,
      state: this.desired.state,
      timestamps: { start: this.sessionStart ?? Math.floor(Date.now() / 1000) },
      // Asset names must already exist in the Discord Developer Portal. A large
      // Rich Presence image is square; it is not a full Discord card background.
      ...(this.artwork.largeImage || this.artwork.smallImage ? {
        assets: {
          ...(this.artwork.largeImage ? {
            large_image: this.artwork.largeImage,
            large_text: 'StreetsEmpire — Build Your Empire',
          } : {}),
          ...(this.artwork.smallImage ? {
            small_image: this.artwork.smallImage,
            small_text: 'Playing StreetsEmpire',
          } : {}),
        },
      } : {}),
      // No party fields, fabricated deadlines, or join secrets: StreetsEmpire
      // does not yet implement invites that Discord could safely open.
      buttons: [{ label: 'Play StreetsEmpire', url: 'https://play.streetsempire.dev' }],
    } : null;

    this._write(1, {
      cmd: 'SET_ACTIVITY',
      args: { pid: process.pid, activity },
      nonce: randomUUID(),
    });
  }
}

module.exports = { DiscordPresence };
