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

  it('lets a player change only the capitals of their own name', async () => {
    const player = await account('mighty');
    const { account: renamed } = await UsernameChangeService.change(prisma, player.id, player.username.toUpperCase(), t0);
    expect(renamed.username).toBe(player.username.toUpperCase());
  });
});
