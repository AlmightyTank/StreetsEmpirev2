import { describe, expect, it } from 'vitest';
import { apiAbuseDto, marketPairs, type MarketTrade } from '../admin-signals.service.js';
import { ApiAbuseRegistry } from '../api-abuse.service.js';

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 1, 12, minutes));
const trade = (accountId: string, direction: 'buy' | 'sell', minutes: number, extra: Partial<MarketTrade> = {}): MarketTrade => ({
  accountId, displayName: accountId.toUpperCase(), city: 'detroit', productKey: 'COCAINE', direction, totalCents: 50_000n, at: at(minutes), ...extra,
});

describe('1.0.0-C market pairing', () => {
  it('pairs one partner selling and another buying the same product on the same market within the hour', () => {
    const pairs = marketPairs([trade('a', 'sell', 0), trade('b', 'buy', 20)], new Set(['a', 'b']));
    expect(pairs).toEqual([{ kind: 'MARKET_PAIR', from: 'A', to: 'B', at: at(20).toISOString(), cashCents: 50_000, voided: false }]);
  });

  it('ignores ordinary trading: same direction, other markets, other products, too far apart, or outsiders', () => {
    const ids = new Set(['a', 'b']);
    expect(marketPairs([trade('a', 'sell', 0), trade('b', 'sell', 5)], ids)).toEqual([]);
    expect(marketPairs([trade('a', 'sell', 0), trade('b', 'buy', 5, { city: 'miami-beach' })], ids)).toEqual([]);
    expect(marketPairs([trade('a', 'sell', 0), trade('b', 'buy', 5, { productKey: 'METH' })], ids)).toEqual([]);
    expect(marketPairs([trade('a', 'sell', 0), trade('b', 'buy', 61)], ids)).toEqual([]);
    expect(marketPairs([trade('a', 'sell', 0), trade('a', 'buy', 5)], ids)).toEqual([]);
    expect(marketPairs([trade('a', 'sell', 0), trade('x', 'buy', 5)], ids)).toEqual([]);
  });

  it('uses each trade in one pair only', () => {
    const pairs = marketPairs([trade('a', 'sell', 0), trade('b', 'buy', 5), trade('b', 'buy', 10)], new Set(['a', 'b']));
    expect(pairs).toHaveLength(1);
  });
});

describe('1.0.0-C API abuse registry', () => {
  it('remembers who was refused for a day, most refused first, and never shows an address', () => {
    let now = Date.UTC(2026, 8, 1);
    const registry = new ApiAbuseRegistry(() => now);
    for (let i = 0; i < 5; i++) registry.record({ accountId: 'acct-1', ip: '203.0.113.9' }, 'write');
    registry.record({ accountId: 'acct-1', ip: '203.0.113.9' }, 'read');
    registry.record({ accountId: null, ip: '198.51.100.4' }, 'auth');
    const rows = registry.list();
    expect(rows.map((row) => [row.accountId, row.refused, row.buckets])).toEqual([['acct-1', 6, ['read', 'write']], [null, 1, ['auth']]]);

    const dto = apiAbuseDto(rows, new Map([['acct-1', 'scripter']]), 'secret-one');
    expect(dto[0]).toMatchObject({ account: { id: 'acct-1', username: 'scripter' }, networkKey: null, refused: 6 });
    expect(dto[1]!.account).toBeNull();
    expect(dto[1]!.networkKey).toMatch(/^[0-9a-f]{10}$/);
    expect(JSON.stringify(dto)).not.toContain('198.51.100.4');

    now += 86_400_001;
    expect(registry.list()).toEqual([]);
    expect(registry.size).toBe(0);
  });

  it('stays bounded under a flood of new addresses', () => {
    const registry = new ApiAbuseRegistry(() => 1_000, 100, 10);
    for (let i = 0; i < 1_000; i++) registry.record({ accountId: null, ip: `10.0.${i >> 8}.${i & 255}` }, 'auth');
    for (let i = 0; i < 50; i++) registry.record({ accountId: 'acct', ip: null }, 'write');
    expect(registry.size).toBeLessThanOrEqual(100);
    expect(registry.list(1)[0]).toMatchObject({ accountId: 'acct', refused: 10 });
  });
});
