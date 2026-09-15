import { describe, expect, it } from 'vitest';
import { devBotsBlockedReason, isLocalDatabaseUrl } from '../dev-bots.service.js';

describe('dev bot safety', () => {
  it('only treats loopback database hosts as local', () => {
    expect(isLocalDatabaseUrl('postgresql://streets:streets@localhost:5433/streets_empire')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://streets:streets@127.0.0.1:5432/db')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://streets:streets@[::1]:5432/db')).toBe(true);
    expect(isLocalDatabaseUrl('postgresql://streets:streets@db.example.com:5432/db')).toBe(false);
    expect(isLocalDatabaseUrl('not a url')).toBe(false);
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
  });

  it('refuses production and non-local databases, with no override', () => {
    const local = 'postgresql://streets:streets@localhost:5433/streets_empire';
    expect(devBotsBlockedReason({ isProduction: false, databaseUrl: local })).toBeNull();
    expect(devBotsBlockedReason({ isProduction: true, databaseUrl: local })).toBe('Dev bots are refused in production.');
    expect(devBotsBlockedReason({ isProduction: false, databaseUrl: 'postgresql://u:p@db.example.com/db' })).toBe('Dev bots are refused against a non-local database.');
  });
});
