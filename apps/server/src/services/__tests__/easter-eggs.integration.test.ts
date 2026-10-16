import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12D } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { EASTER_EGGS } from '@streets/shared';
import type { Db } from '../../utils/db.js';
import { CasinoStatusService } from '../casino-status.service.js';
import { RandomEncounterChoiceService } from '../random-encounter-choice.service.js';
import { ReputationService } from '../reputation.service.js';

describe.runIf(process.env.TURF_INTEGRATION === '1')('Easter eggs with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture() {
    const round = await app.prisma.round.create({
      data: {
        name: 'Easter egg fixture',
        slug: 'easter-egg-' + randomUUID(),
        rulesetId: classicOgV12D.meta.id,
        rulesetVersion: classicOgV12D.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV12D.round.startingPlayer,
        ...startingStock(classicOgV12D),
        cashCents: 3_000_000n,
        roundId: round.id,
        accountId,
        cityId: city.id,
        displayName: 'egg_' + randomUUID().slice(0, 6),
        publicPimpId: 9700 + roundIds.length,
        reputation: { create: ReputationService.seedFor(classicOgV12D) },
      },
    });
    return { player, city };
  }

  async function titles(): Promise<string[]> {
    const rows = await app.prisma.accountCosmeticUnlock.findMany({ where: { accountId }, select: { key: true } });
    return rows.map((row) => row.key);
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'egg_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: name + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('finds Don’t Panic on a winning $42 play at any game, once', async () => {
    // Only Corner Classic can take exactly $42 (3 paylines at $14), and a slot
    // win cannot be forced, so this drives the shared casino result hook.
    const { player, city } = await fixture();
    const result = (returnCents: bigint) => CasinoStatusService.recordResult(app.prisma as unknown as Db, classicOgV12D, {
      roundPlayerId: player.id, cityId: city.id, play: { game: 'SLOTS', tableKey: 'CORNER_CLASSIC', actionId: randomUUID() },
      stakeCents: 4_200n, returnCents, highlight: null, now: new Date(),
    });

    await result(0n);
    expect(await titles()).not.toContain(EASTER_EGGS.DONT_PANIC.key);
    await result(12_600n);
    await result(8_400n);
    expect(await titles()).toContain(EASTER_EGGS.DONT_PANIC.key);
    const notices = await app.prisma.playerActivity.count({ where: { roundPlayerId: player.id, type: 'EASTER_EGG_FOUND' } });
    expect(notices).toBe(1);
  });

  it('finds l33t on an exact $1,337 casino return', async () => {
    const { player, city } = await fixture();
    const result = (returnCents: bigint) => CasinoStatusService.recordResult(app.prisma as unknown as Db, classicOgV12D, {
      roundPlayerId: player.id, cityId: city.id, play: { game: 'HORSE_RACING', tableKey: 'TRACK', actionId: randomUUID() },
      stakeCents: 10_000n, returnCents, highlight: null, now: new Date(),
    });
    await result(133_699n);
    expect(await titles()).not.toContain(EASTER_EGGS.LEET.key);
    await result(133_700n);
    expect(await titles()).toContain(EASTER_EGGS.LEET.key);
  });

  it('only counts a prompt stare at the statue', async () => {
    const { player } = await fixture();
    const choices = [
      { key: 'dont-blink', label: 'Don’t blink', text: 'You stare.', effects: {} },
      { key: 'run', label: 'Run', text: 'You run.', effects: {} },
    ];
    const statue = (createdAt: Date) => app.prisma.randomEncounter.create({
      data: {
        roundPlayerId: player.id, trigger: 'SCOUT', key: 'egg-the-statue', title: 'The statue', text: 'A statue.',
        tone: 'warn', status: 'PENDING', choices, expiresAt: new Date(Date.now() + 3_600_000), createdAt,
      },
    });

    const late = await statue(new Date(Date.now() - 10 * 60_000));
    const blinked = await RandomEncounterChoiceService.resolve(app.prisma, player.id, late.id, { choice: 'dont-blink', actionId: randomUUID() });
    expect(blinked.result.text).toMatch(/You blinked/);
    expect(blinked.result.easterEgg).toBeUndefined();
    expect(await titles()).not.toContain(EASTER_EGGS.DONT_BLINK.key);

    const fresh = await statue(new Date());
    const stared = await RandomEncounterChoiceService.resolve(app.prisma, player.id, fresh.id, { choice: 'dont-blink', actionId: randomUUID() });
    expect(stared.result.easterEgg).toMatchObject({ title: EASTER_EGGS.DONT_BLINK.title, isNew: true });
    expect(await titles()).toContain(EASTER_EGGS.DONT_BLINK.key);
  });
});
