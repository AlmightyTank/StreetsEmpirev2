import { describe, expect, it } from 'vitest';
import { buildClusters, matchKey } from '../admin-signals.service.js';

const secret = 'test-secret-that-is-long-enough-for-a-session';
const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const firefox = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0';

const account = (id: string, createdAt: string) => [id, { id, username: `user_${id}`, isActive: true, isAdmin: false, createdAt: new Date(createdAt), lastLoginAt: null }] as const;

describe('buildClusters', () => {
  const accounts = new Map([
    account('a', '2026-09-01T10:00:00.000Z'),
    account('b', '2026-09-01T10:10:00.000Z'),
    account('c', '2026-08-01T10:00:00.000Z'),
    account('d', '2026-07-01T10:00:00.000Z'),
  ]);

  it('links accounts on one network, strengthened by the same browser and back-to-back sign-ups', () => {
    const clusters = buildClusters([
      { accountId: 'a', ip: '203.0.113.7', userAgent: chrome, at: new Date('2026-09-10T10:00:00.000Z') },
      { accountId: 'b', ip: '203.0.113.7', userAgent: chrome, at: new Date('2026-09-11T10:00:00.000Z') },
      { accountId: 'c', ip: '198.51.100.9', userAgent: firefox, at: new Date('2026-09-10T10:00:00.000Z') },
      { accountId: 'd', ip: '198.51.100.9', userAgent: chrome, at: new Date('2026-09-12T10:00:00.000Z') },
    ], accounts, secret);

    expect(clusters).toHaveLength(2);
    expect(clusters[0]).toMatchObject({ signals: ['shared-network', 'same-device', 'created-together'], key: matchKey('network', '203.0.113.7', secret) });
    expect(clusters[0]!.accounts.map((row) => row.id)).toEqual(['a', 'b']);
    expect(clusters[0]!.accounts[0]!.device).toBe('Chrome on Windows');
    expect(clusters[1]).toMatchObject({ signals: ['shared-network'] });
    expect(JSON.stringify(clusters)).not.toMatch(/203\.0\.113\.7|198\.51\.100\.9|Mozilla/);
  });

  it('ignores loopback traffic and networks with a single account', () => {
    expect(buildClusters([
      { accountId: 'a', ip: '127.0.0.1', userAgent: chrome, at: new Date() },
      { accountId: 'b', ip: '127.0.0.1', userAgent: chrome, at: new Date() },
      { accountId: 'c', ip: '203.0.113.50', userAgent: chrome, at: new Date() },
      { accountId: 'c', ip: '203.0.113.50', userAgent: firefox, at: new Date() },
    ], accounts, secret)).toEqual([]);
  });

  it('keys are stable per server and differ across secrets', () => {
    expect(matchKey('network', '203.0.113.7', secret)).toBe(matchKey('network', '203.0.113.7', secret));
    expect(matchKey('network', '203.0.113.7', secret)).not.toBe(matchKey('network', '203.0.113.7', `${secret}-other`));
    expect(matchKey('network', '203.0.113.7', secret)).toHaveLength(10);
  });
});
