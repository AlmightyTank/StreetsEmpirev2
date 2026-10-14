import { describe, expect, it } from 'vitest';
import { safeRequestLogSerializer, safeRequestLogUrl } from '../safe-request-log.js';

describe('request log sanitization', () => {
  it('removes Discord authorization code and state from request URLs', () => {
    const url = '/api/auth/discord/callback?code=secret-code&state=secret-state&iss=https%3A%2F%2Fdiscord.com';
    expect(safeRequestLogUrl(url)).toBe('/api/auth/discord/callback?[redacted]');
    const serialized = safeRequestLogSerializer({
      method: 'GET', url, headers: { host: 'beta.streetsempire.dev' },
      socket: { remoteAddress: '127.0.0.1', remotePort: 1234 },
    });
    expect(JSON.stringify(serialized)).not.toContain('secret-code');
    expect(JSON.stringify(serialized)).not.toContain('secret-state');
    expect(serialized.url).toBe('/api/auth/discord/callback?[redacted]');
  });

  it('removes all query secrets including reset and account URLs', () => {
    expect(safeRequestLogUrl('/api/auth/reset-password?token=secret')).toBe('/api/auth/reset-password?[redacted]');
    expect(safeRequestLogUrl('/api/game/me?background=1')).toBe('/api/game/me?[redacted]');
    expect(safeRequestLogUrl('/api/health')).toBe('/api/health');
  });
});
