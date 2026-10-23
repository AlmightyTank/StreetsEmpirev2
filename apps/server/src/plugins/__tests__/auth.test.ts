import { describe, expect, it } from 'vitest';
import { bearerTokenFromHeader, wantsNativeSessionToken } from '../auth.js';

describe('native mobile session tokens', () => {
  it('extracts bearer tokens', () => {
    expect(bearerTokenFromHeader('Bearer abc123')).toBe('abc123');
    expect(bearerTokenFromHeader('bearer abc123')).toBe('abc123');
  });

  it('rejects missing or non-bearer headers', () => {
    expect(bearerTokenFromHeader(undefined)).toBeNull();
    expect(bearerTokenFromHeader('Basic abc')).toBeNull();
    expect(bearerTokenFromHeader('Bearer ')).toBeNull();
  });

  it('only hands session tokens to the native app header', () => {
    expect(wantsNativeSessionToken('android')).toBe(true);
    expect(wantsNativeSessionToken('Android')).toBe(true);
    expect(wantsNativeSessionToken(undefined)).toBe(false);
    expect(wantsNativeSessionToken('web')).toBe(false);
  });
});
