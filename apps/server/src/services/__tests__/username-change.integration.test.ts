import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UsernameChangeService } from '../username-change.service.js';

const DAY = 86_400_000;

/** Dates far past any real round, so the shared test database's own rounds never count. */
describe.runIf(process.env.AUTH_INTEGRATION === '1')('Player name changes with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const accountIds: string[] = [];
  const roundIds: string[] = [];
  const t0 = new Date(`2187-01-0${1 + Math.floor(Math.random() * 8)}T00:00:00.000Z`);

  async function account(label: string) {
    const username = `${label}${randomUUID().slice(0, 8)}`;
    const row = await prisma.account.create({
      data: { username, usernameNormalized: username.toLowerCase(), email: `${randomUUID()}@example.invalid`, passwordHash: 'x' },
    });
    accountIds.push(row.id);
    return row;
  }

  async function startRound(startsAt: Date) {
    const round = await prisma.round.create({
      data: { slug: `name-change-${randomUUID()}`, name: 'Name change test', rulesetId: 'classic-og', rulesetVersion: '0.1', status: 'ENDED', startsAt, endsAt: new Date(startsAt.getTime() + DAY) },
    });
    roundIds.push(round.id);
  }

  beforeAll(async () => { await prisma.$connect(); });
  afterAll(async () => {
    await prisma.round.deleteMany({ where: { id: { in: roundIds } } });
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await prisma.$disconnect();
  });

  it('allows a free first change, then holds the name until 3 rounds start', async () => {
    const player = await account('Tank');
    const first = `Renamed${randomUUID().slice(0, 6)}`;
    const { account: renamed, status } = await UsernameChangeService.change(prisma, player.id, first, t0);
    expect(renamed).toMatchObject({ username: first, usernameNormalized: first.toLowerCase() });
    expect(status.canChange).toBe(false);

    const second = `Again${randomUUID().slice(0, 6)}`;
    const soon = new Date(t0.getTime() + 20 * DAY);
    await expect(UsernameChangeService.change(prisma, player.id, second, soon)).rejects.toMatchObject({ code: 'USERNAME_CHANGE_COOLDOWN' });

    for (const day of [2, 9, 16]) await startRound(new Date(t0.getTime() + day * DAY));
    const after = await UsernameChangeService.change(prisma, player.id, second, soon);
    expect(after.account.username).toBe(second);

    const history = await prisma.accountUsernameChange.findMany({ where: { accountId: player.id }, orderBy: { createdAt: 'asc' } });
    expect(history.map((row) => [row.fromUsername, row.toUsername, row.source])).toEqual([
      [player.username, first, 'PLAYER'],
      [first, second, 'PLAYER'],
    ]);
  });

  it('refuses a name another player holds in any casing', async () => {
    const holder = await account('Holder');
    const player = await account('Taker');
    await expect(UsernameChangeService.change(prisma, player.id, holder.username.toUpperCase(), t0)).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
    const unchanged = await prisma.account.findUniqueOrThrow({ where: { id: player.id } });
    expect(unchanged.usernameChangedAt).toBeNull();
  });

  it('holds a given-up name for its previous owner for 30 days', async () => {
    const owner = await account('Owner');
    const other = await account('Other');
    const original = owner.username;
    await UsernameChangeService.change(prisma, owner.id, `Moved${randomUUID().slice(0, 6)}`, t0);

    const during = new Date(t0.getTime() + 29 * DAY);
    await expect(UsernameChangeService.change(prisma, other.id, original.toLowerCase(), during)).rejects.toMatchObject({ code: 'USERNAME_HELD' });
    await expect(UsernameChangeService.assertAvailable(prisma, original, null, during)).rejects.toMatchObject({ code: 'USERNAME_HELD' });
    expect(await UsernameChangeService.isHeld(prisma, original, during)).toBe(true);

    const after = new Date(t0.getTime() + 31 * DAY);
    expect(await UsernameChangeService.isHeld(prisma, original, after)).toBe(false);
    const taken = await UsernameChangeService.change(prisma, other.id, original, after);
    expect(taken.account.username).toBe(original);
  });

  it('lets the owner take their old name back for free, once', async () => {
    const owner = await account('Back');
    const original = owner.username;
    const moved = `Moved${randomUUID().slice(0, 6)}`;
    const first = await UsernameChangeService.change(prisma, owner.id, moved, t0);
    expect(first.status).toMatchObject({ canChange: false, reclaim: { username: original } });

    const later = new Date(t0.getTime() + 5 * DAY);
    const back = await UsernameChangeService.change(prisma, owner.id, original, later);
    expect(back.account.username).toBe(original);
    // The take-back does not restart the cooldown clock, and cannot be repeated.
    expect(back.account.usernameChangedAt?.toISOString()).toBe(t0.toISOString());
    expect(back.status.reclaim).toBeNull();
    await expect(UsernameChangeService.change(prisma, owner.id, moved, later)).rejects.toMatchObject({ code: 'USERNAME_CHANGE_COOLDOWN' });

    const sources = await prisma.accountUsernameChange.findMany({ where: { accountId: owner.id }, orderBy: { createdAt: 'asc' }, select: { source: true } });
    expect(sources.map((row) => row.source)).toEqual(['PLAYER', 'REVERT']);
  });

  it('keeps a name staff took away from everyone, its old owner included', async () => {
    const owner = await account('Retired');
    const original = owner.username;
    const replacement = `Staff${randomUUID().slice(0, 6)}`;
    await prisma.account.update({ where: { id: owner.id }, data: { username: replacement, usernameNormalized: replacement.toLowerCase() } });
    await prisma.accountUsernameChange.create({
      data: { accountId: owner.id, fromUsername: original, fromUsernameNormalized: original.toLowerCase(), toUsername: replacement, source: 'STAFF', createdAt: t0 },
    });
    const during = new Date(t0.getTime() + DAY);
    const status = await UsernameChangeService.status(prisma, owner.id, during);
    expect(status.reclaim).toBeNull();
    await expect(UsernameChangeService.change(prisma, owner.id, original, during)).rejects.toMatchObject({ code: 'USERNAME_HELD' });
  });

  it('lets a player change only the capitals of their own name', async () => {
    const player = await account('mighty');
    const { account: renamed } = await UsernameChangeService.change(prisma, player.id, player.username.toUpperCase(), t0);
    expect(renamed.username).toBe(player.username.toUpperCase());
  });
});

describe.runIf(process.env.AUTH_INTEGRATION === '1')('Name holds at sign-up and over the API', () => {
  let app: import('fastify').FastifyInstance;
  const accountIds: string[] = [];

  beforeAll(async () => { app = await (await import('../../app.js')).buildApp(); });
  afterAll(async () => {
    await app.prisma.account.deleteMany({ where: { id: { in: accountIds } } });
    await app.close();
  });

  it('refuses to sign anyone up as a name its owner just gave up', async () => {
    const original = `Gone${randomUUID().slice(0, 8)}`;
    const owner = await app.prisma.account.create({
      data: { username: original, usernameNormalized: original.toLowerCase(), email: `${randomUUID()}@example.invalid`, passwordHash: 'x' },
    });
    accountIds.push(owner.id);
    await UsernameChangeService.change(app.prisma, owner.id, `New${randomUUID().slice(0, 8)}`);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: original.toUpperCase(), email: `${randomUUID()}@example.invalid`, password: `Pw-${randomUUID()}` },
    });
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().error.code).toBe('USERNAME_HELD');
  });
});
