import { describe, expect, it } from 'vitest';
import {
  FixedWindowRateLimiter,
  RATE_LIMIT_POLICIES,
  rateLimitPolicyFor,
} from '../rate-limit.service.js';

describe('rateLimitPolicyFor', () => {
  it('does not throttle health checks or CORS preflight', () => {
    expect(rateLimitPolicyFor('GET', '/api/health')).toBeNull();
    expect(rateLimitPolicyFor('GET', '/api/ready')).toBeNull();
    expect(rateLimitPolicyFor('OPTIONS', '/api/game/me')).toBeNull();
  });

  it('does not throttle the token-guarded Discord bot API, and only that prefix', () => {
    expect(rateLimitPolicyFor('POST', '/api/internal/discord/roles')).toBeNull();
    expect(rateLimitPolicyFor('GET', '/api/internal/discord/rankings')).toBeNull();
    expect(rateLimitPolicyFor('GET', '/api/internal/discordx')).toBe(RATE_LIMIT_POLICIES.read);
  });

  it('uses the strict auth bucket for password and Discord login', () => {
    expect(rateLimitPolicyFor('POST', '/api/auth/register')).toBe(RATE_LIMIT_POLICIES.auth);
    expect(rateLimitPolicyFor('POST', '/api/auth/login')).toBe(RATE_LIMIT_POLICIES.auth);
    expect(rateLimitPolicyFor('POST', '/api/auth/password/forgot')).toBe(RATE_LIMIT_POLICIES.auth);
    expect(rateLimitPolicyFor('POST', '/api/auth/password/reset')).toBe(RATE_LIMIT_POLICIES.auth);
    expect(rateLimitPolicyFor('POST', '/api/auth/email/verify/request')).toBe(RATE_LIMIT_POLICIES.auth);
    expect(rateLimitPolicyFor('POST', '/api/auth/email/change/request')).toBe(RATE_LIMIT_POLICIES.auth);
    expect(rateLimitPolicyFor('POST', '/api/auth/email/verify')).toBe(RATE_LIMIT_POLICIES.auth);
    expect(rateLimitPolicyFor('GET', '/api/auth/discord')).toBe(RATE_LIMIT_POLICIES.auth);
    expect(rateLimitPolicyFor('GET', '/api/auth/discord/callback')).toBe(RATE_LIMIT_POLICIES.auth);
  });

  it('separates normal reads and writes', () => {
    expect(rateLimitPolicyFor('GET', '/api/game/me')).toBe(RATE_LIMIT_POLICIES.read);
    expect(rateLimitPolicyFor('POST', '/api/game/scout')).toBe(RATE_LIMIT_POLICIES.write);
    expect(rateLimitPolicyFor('PUT', '/api/game/payout')).toBe(RATE_LIMIT_POLICIES.write);
  });
});

describe('FixedWindowRateLimiter', () => {
  it('allows up to the limit, then rejects until the window resets', () => {
    let now = 1_000;
    const limiter = new FixedWindowRateLimiter(() => now);
    const policy = { name: 'test', limit: 2, windowMs: 10_000 };

    expect(limiter.hit('one', policy)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.hit('one', policy)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.hit('one', policy)).toMatchObject({ allowed: false, remaining: 0 });

    now = 11_000;
    expect(limiter.hit('one', policy)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it('does not make one identity consume another identity’s allowance', () => {
    const limiter = new FixedWindowRateLimiter(() => 5_000);
    const policy = { name: 'test', limit: 1, windowMs: 10_000 };

    expect(limiter.hit('alpha', policy).allowed).toBe(true);
    expect(limiter.hit('alpha', policy).allowed).toBe(false);
    expect(limiter.hit('beta', policy).allowed).toBe(true);
  });

  it('bounds memory even when every hit comes from a different identity', () => {
    const limiter = new FixedWindowRateLimiter(() => 5_000, 3);
    const policy = { name: 'test', limit: 1, windowMs: 60_000 };

    for (const identity of ['a', 'b', 'c', 'd', 'e']) limiter.hit(identity, policy);
    expect(limiter.size).toBeLessThanOrEqual(3);
  });
});
