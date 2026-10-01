import { describe, expect, it } from 'vitest';
import {
  backupFileName, compareManifest, describeUrl, libpqTarget, offsiteTarget, parseBackupFileName, retentionPlan, sameDatabase, withDatabase,
} from '../../../../../scripts/ops/backup-lib.mjs';

const URL_ = 'postgresql://streets:s3cr%40t@db.internal:5433/streets_empire?schema=public&connection_limit=5&sslmode=require';
const day = (n: number, hour = 3) => new Date(Date.UTC(2026, 8, 27 - n, hour, 10, 0));

describe('1.0.0-F backup targets', () => {
  it('turns a Prisma URL into a libpq one with the password out of the URL', () => {
    const target = libpqTarget(URL_);
    expect(target.password).toBe('s3cr@t');
    expect(target.url).not.toContain('s3cr');
    expect(target.url).not.toContain('schema=');
    expect(target.url).not.toContain('connection_limit');
    expect(target.url).toContain('sslmode=require');
    expect(target).toMatchObject({ database: 'streets_empire', host: 'db.internal', port: '5433' });
    expect(describeUrl(URL_)).toBe('db.internal:5433/streets_empire');
  });

  it('points at another database on the same server and knows the live one when it sees it', () => {
    const scratch = withDatabase(URL_, 'streets_restore_test_x');
    expect(libpqTarget(scratch).database).toBe('streets_restore_test_x');
    expect(scratch).toContain('schema=public');
    expect(sameDatabase(scratch, URL_)).toBe(false);
    expect(sameDatabase('postgresql://a:b@127.0.0.1:5432/x', 'postgresql://c@localhost/x?schema=public')).toBe(true);
  });

  it('names backups so they sort by time and carry their environment and label', () => {
    const name = backupFileName('production', new Date('2026-09-27T03:10:05.123Z'), 'predeploy');
    expect(name).toBe('streets-production-20260927T031005Z-predeploy.dump');
    expect(parseBackupFileName(name)).toMatchObject({ environment: 'production', label: 'predeploy', at: new Date('2026-09-27T03:10:05Z') });
    expect(parseBackupFileName('streets-production-20260927T031005Z.dump.partial')).toBeNull();
    expect(parseBackupFileName('status.json')).toBeNull();
  });

  it('reads the off-server target', () => {
    expect(offsiteTarget('')).toBeNull();
    expect(offsiteTarget('rclone:b2:streets/prod/')).toEqual({ kind: 'rclone', dest: 'b2:streets/prod' });
    expect(offsiteTarget('rsync:backup@vault:/srv/streets')).toEqual({ kind: 'rsync', dest: 'backup@vault:/srv/streets' });
    expect(offsiteTarget('s3://bucket/prefix')).toEqual({ kind: 's3', dest: 's3://bucket/prefix' });
    expect(() => offsiteTarget('ftp://nope')).toThrow();
  });
});

describe('1.0.0-F retention', () => {
  const now = new Date(Date.UTC(2026, 8, 27, 12));
  const scheduled = Array.from({ length: 120 }, (_, n) => backupFileName('production', day(n)));

  it('keeps a daily backup for two weeks, then one a week for eight weeks', () => {
    const plan = retentionPlan(scheduled, now);
    const kept = plan.keep.map((name) => parseBackupFileName(name)!.at);
    const ages = kept.map((at) => (now.getTime() - at.getTime()) / 86_400_000);
    expect(ages.filter((age) => age < 14)).toHaveLength(14);
    const older = ages.filter((age) => age >= 14);
    expect(older.length).toBeGreaterThanOrEqual(6);
    expect(older.length).toBeLessThanOrEqual(8);
    expect(Math.max(...ages)).toBeLessThan(56);
    expect(plan.keep.length + plan.remove.length).toBe(120);
  });

  it('keeps only the newest of several backups on one day', () => {
    const plan = retentionPlan([backupFileName('production', day(0, 3)), backupFileName('production', day(0, 9))], now);
    expect(plan.keep).toEqual([backupFileName('production', day(0, 9))]);
  });

  it('keeps the newest labelled backups separately, and never deletes the newest backup of all', () => {
    const labelled = Array.from({ length: 8 }, (_, n) => backupFileName('production', day(n, 15), 'predeploy'));
    const plan = retentionPlan([...labelled], now, { keepLabelled: 3 });
    expect(plan.keep).toEqual(labelled.slice(0, 3));
    const ancient = backupFileName('production', day(400));
    expect(retentionPlan([ancient], now).keep).toEqual([ancient]);
  });
});

describe('1.0.0-F restore verification', () => {
  const expected = { tables: { Account: 3, Round: 1, _prisma_migrations: 89 }, lastMigration: '20260927200000_admin_operations' };

  it('passes a restore whose every table count matches', () => {
    expect(compareManifest(expected, { tables: { ...expected.tables }, lastMigration: expected.lastMigration })).toEqual({ ok: true, problems: [], tables: 3, rows: 93 });
  });

  it('fails a restore that lost rows, a table or migrations', () => {
    const result = compareManifest(expected, { tables: { Account: 2, _prisma_migrations: 88, Extra: 0 }, lastMigration: '20260927150000_exploit_hardening' });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual(expect.arrayContaining([
      'Account: 2 rows, expected 3', 'table Round is missing', 'unexpected table Extra', expect.stringContaining('last migration'),
    ]));
  });
});
