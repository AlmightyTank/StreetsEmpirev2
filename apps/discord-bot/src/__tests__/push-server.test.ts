import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startOptionalPushServer } from '../push-server.js';

function listen(server: http.Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe('startOptionalPushServer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs and lets the bot keep polling when the listener cannot bind', async () => {
    const occupied = http.createServer();
    await listen(occupied, 0);
    const address = occupied.address();
    if (!address || typeof address === 'string') throw new Error('Expected an assigned local port.');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const stop = await startOptionalPushServer({
      host: '127.0.0.1',
      port: address.port,
      token: 't'.repeat(64),
      onWake: async () => undefined,
    });

    expect(stop).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('The bot will continue and use polling as the fallback.'),
      expect.any(Error),
    );

    await close(occupied);
  });
});
