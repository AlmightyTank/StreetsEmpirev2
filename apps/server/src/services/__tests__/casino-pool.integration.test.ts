import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12E2 } from '@streets/rulesets';
import { startingStock, type Rng } from '@streets/rules-engine';
import { BlackjackService } from '../blackjack.service.js';
import { CasinoService } from '../casino.service.js';
import { PoolService } from '../pool.service.js';
import { ReputationService } from '../reputation.service.js';

const ruleset = classicOgV12E2;
const pool = ruleset.casino.pool;
const table = pool.tables[0]!;

/** Scripted rolls in basis points, so every branch of a rack is pinned. */
function rolls(...bps: number[]): Rng {
  let index = 0;
  return () => {
    const value = bps[index++];
    if (value === undefined) throw new Error('Ran out of scripted rolls.');
    return value / 10_000;
  };
}

/** A break that drops one ball and keeps the table. */
const KEEP_TABLE_BREAK = pool.break.goldenBps + pool.break.scratchBps + pool.break.dryBps + pool.break.twoBallBps;
/** A steady shot that drops. */
const POT = pool.steady.scratchBps;

describe.runIf(process.env.TURF_INTEGRATION === '1')('pool with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture() {
    const round = await app.prisma.round.create({
      data: {
        name: 'Casino pool fixture',
        slug: 'casino-pool-' + randomUUID(),
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer,
        ...startingStock(ruleset),
        cashCents: 2_000_000n,
        roundId: round.id,
        accountId,
        cityId: city.id,
        displayName: 'pool_' + randomUUID().slice(0, 6),
        publicPimpId: 9800 + roundIds.length,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
    await CasinoService.buyChips(app.prisma, player.id, { amountCents: 500_000, actionId: randomUUID() });
    await CasinoService.startSession(app.prisma, player.id, { amountCents: 300_000, actionId: randomUUID() });
    return { player };
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'pool_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ageConfirmed: true, username: name, email: name + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('racks, keeps the stake in casino value, replays a duplicate rack and blocks other tables', async () => {
    const { player } = await fixture();
    const before = await CasinoService.page(app.prisma, player.id);
    const actionId = randomUUID();
    const input = { tableKey: table.key, wagerCents: table.minBetCents, actionId };

    const game = await PoolService.rack(app.prisma, player.id, input, rolls(KEEP_TABLE_BREAK));
    expect(game.status).toBe('ACTIVE');
    expect(game.playerBalls).toHaveLength(6);
    expect(game.bankrollAfterCents).toBe(300_000 - table.minBetCents);
    expect(game.shots.map((shot) => shot.shot)).toEqual(['STEADY', 'POWER', 'SAFETY']);

    expect(await PoolService.rack(app.prisma, player.id, input)).toEqual(game);
    await expect(PoolService.rack(app.prisma, player.id, { ...input, wagerCents: table.minBetCents * 2 }))
      .rejects.toMatchObject({ code: 'ACTION_ID_REUSED' });
    expect(await app.prisma.casinoPoolGame.count({ where: { roundPlayerId: player.id } })).toBe(1);

    const during = await CasinoService.page(app.prisma, player.id);
    expect(during.totalCasinoValueCents).toBe(before.totalCasinoValueCents);
    expect((await PoolService.state(app.prisma, player.id)).activeGame?.id).toBe(game.id);

    const blackjack = ruleset.casino.blackjack.tables[0]!;
    await expect(BlackjackService.deal(app.prisma, player.id, { tableKey: blackjack.key, wagerCents: blackjack.minBetCents, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'POOL_GAME_ACTIVE' });
    await expect(CasinoService.closeSession(app.prisma, player.id, during.openSession!.id, randomUUID()))
      .rejects.toMatchObject({ code: 'POOL_GAME_ACTIVE' });
  });

  it('pays a break-and-run and writes the rack to history and the ledger', async () => {
    const { player } = await fixture();
    const game = await PoolService.rack(app.prisma, player.id, { tableKey: table.key, wagerCents: 10_000, actionId: randomUUID() }, rolls(KEEP_TABLE_BREAK));
    let current = game;
    while (current.status === 'ACTIVE') {
      current = await PoolService.shoot(app.prisma, player.id, { gameId: game.id, shot: 'STEADY', actionId: randomUUID() }, rolls(POT));
    }
    expect(current.status).toBe('WON');
    expect(current.finish).toBe('BREAK_AND_RUN');
    const returned = (10_000 * table.breakAndRunReturnBps) / 10_000;
    expect(current.totalReturnCents).toBe(returned);
    expect(current.netCents).toBe(returned - 10_000);
    expect(current.bankrollAfterCents).toBe(300_000 - 10_000 + returned);

    const state = await PoolService.state(app.prisma, player.id);
    expect(state.activeGame).toBeNull();
    expect(state.history[0]?.id).toBe(game.id);
    const ledger = await app.prisma.casinoLedgerEntry.findMany({ where: { roundPlayerId: player.id, kind: 'POOL' } });
    expect(ledger.reduce((sum, entry) => sum + entry.sessionChipDeltaCents, 0n)).toBe(BigInt(returned - 10_000));
  });

  it('presses once while the hustler is ahead and loses the doubled stake', async () => {
    const { player } = await fixture();
    const game = await PoolService.rack(app.prisma, player.id, { tableKey: table.key, wagerCents: 10_000, actionId: randomUUID() }, rolls(KEEP_TABLE_BREAK));
    await expect(PoolService.press(app.prisma, player.id, { gameId: game.id, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'POOL_PRESS_NOT_ALLOWED' });

    const saved = await app.prisma.casinoPoolGame.findUniqueOrThrow({ where: { id: game.id } });
    await app.prisma.casinoPoolGame.update({
      where: { id: game.id },
      data: { rack: { ...(saved.rack as object), playerBalls: [5, 6, 7], hustlerBalls: [15], hustlerVisits: 2 } },
    });

    const pressed = await PoolService.press(app.prisma, player.id, { gameId: game.id, actionId: randomUUID() });
    expect(pressed.pressed).toBe(true);
    expect(pressed.canPress).toBe(false);
    expect(pressed.totalWagerCents).toBe(20_000);
    expect(pressed.bankrollAfterCents).toBe(300_000 - 20_000);
    await expect(PoolService.press(app.prisma, player.id, { gameId: game.id, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'POOL_PRESS_NOT_ALLOWED' });

    // Player misses; the hustler pots the 15, then sinks the 8.
    const miss = 9_999;
    const lost = await PoolService.shoot(app.prisma, player.id, { gameId: game.id, shot: 'STEADY', actionId: randomUUID() }, rolls(miss, table.hustler.scratchBps, table.hustler.scratchBps));
    expect(lost.status).toBe('LOST');
    expect(lost.finish).toBe('HUSTLER_EIGHT');
    expect(lost.netCents).toBe(-20_000);
    expect(lost.bankrollAfterCents).toBe(300_000 - 20_000);
    const page = await CasinoService.page(app.prisma, player.id);
    expect(page.openSession?.bankrollCents).toBe(280_000);
  });
});
