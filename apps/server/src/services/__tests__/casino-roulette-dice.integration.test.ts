import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12D } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { CasinoService } from '../casino.service.js';
import { RouletteService } from '../roulette.service.js';
import { StreetDiceService } from '../street-dice.service.js';
import { ReputationService } from '../reputation.service.js';
import { PlayerStateService } from '../player-state.service.js';

function sequenceRng(values: number[], fallback = 0.5): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.2.0-D roulette and Street Dice with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(citySlug = 'new-york-city') {
    const round = await app.prisma.round.create({
      data: {
        name: 'Casino D fixture',
        slug: 'casino-d-' + randomUUID(),
        rulesetId: classicOgV12D.meta.id,
        rulesetVersion: classicOgV12D.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: citySlug } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV12D.round.startingPlayer,
        ...startingStock(classicOgV12D),
        cashCents: 3_000_000n,
        roundId: round.id,
        accountId,
        cityId: city.id,
        displayName: 'casino_d_' + randomUUID().slice(0, 6),
        publicPimpId: 9800 + roundIds.length,
        reputation: { create: ReputationService.seedFor(classicOgV12D) },
      },
    });
    return { round, player, city };
  }

  async function openBankroll(playerId: string, amountCents = 500_000) {
    await CasinoService.buyChips(app.prisma, playerId, {
      amountCents: 700_000,
      actionId: randomUUID(),
    });
    return CasinoService.startSession(app.prisma, playerId, {
      amountCents,
      actionId: randomUUID(),
    });
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'casino_d_' + randomUUID().slice(0, 6);
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

  it('resolves an American straight-up roulette win on the server and replays the receipt', async () => {
    const { player } = await fixture();
    await openBankroll(player.id);
    const table = classicOgV12D.casino.roulette.tables[0]!;
    const actionId = randomUUID();

    const spin = await RouletteService.spin(
      app.prisma,
      player.id,
      {
        tableKey: table.key,
        bets: [{ kind: 'STRAIGHT', selection: '0', amountCents: table.minBetCents }],
        actionId,
      },
      () => 0,
    );

    expect(spin.pocket).toBe('0');
    expect(spin.color).toBe('GREEN');
    expect(spin.wagerCents).toBe(table.minBetCents);
    expect(spin.returnCents).toBe(table.minBetCents * 36);
    expect(spin.netCents).toBe(table.minBetCents * 35);
    expect(spin.bets[0]).toMatchObject({ won: true, selection: '0' });

    const replay = await RouletteService.spin(app.prisma, player.id, {
      tableKey: table.key,
      bets: [{ kind: 'STRAIGHT', selection: '0', amountCents: table.minBetCents }],
      actionId,
    });
    expect(replay).toEqual(spin);

    await expect(RouletteService.spin(app.prisma, player.id, {
      tableKey: table.key,
      bets: [{ kind: 'RED', selection: 'RED', amountCents: table.minBetCents }],
      actionId,
    })).rejects.toMatchObject({ code: 'ACTION_ID_REUSED' });

    expect(await app.prisma.casinoLedgerEntry.count({
      where: { roundPlayerId: player.id, actionId, kind: 'ROULETTE' },
    })).toBe(1);
  });

  it('runs a persistent Street Dice point with true odds and preserves casino value while money is committed', async () => {
    const { player } = await fixture();
    await openBankroll(player.id);
    const table = classicOgV12D.casino.streetDice.tables[0]!;
    await app.prisma.$transaction((tx) =>
      PlayerStateService.settleInTransaction(tx, player.id, { markActive: false }),
    );
    const before = await CasinoService.page(app.prisma, player.id);
    const netWorthBefore = (await app.prisma.roundPlayer.findUniqueOrThrow({
      where: { id: player.id },
      select: { netWorthCents: true },
    })).netWorthCents;

    const startAction = randomUUID();
    const started = await StreetDiceService.start(
      app.prisma,
      player.id,
      { tableKey: table.key, wagerCents: table.minBetCents, actionId: startAction },
      sequenceRng([0.2, 0.5]),
    );

    expect(started.status).toBe('ACTIVE');
    expect(started.dice).toEqual([2, 4]);
    expect(started.total).toBe(6);
    expect(started.point).toBe(6);
    expect(started.outcome).toBe('POINT');

    const afterPoint = await CasinoService.page(app.prisma, player.id);
    expect(afterPoint.totalCasinoValueCents).toBe(before.totalCasinoValueCents);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({
      where: { id: player.id },
      select: { netWorthCents: true },
    })).netWorthCents).toBe(netWorthBefore);

    const oddsAction = randomUUID();
    const withOdds = await StreetDiceService.addOdds(app.prisma, player.id, {
      roundId: started.id,
      amountCents: table.betStepCents,
      actionId: oddsAction,
    });
    expect(withOdds.oddsWagerCents).toBe(table.betStepCents);

    const afterOdds = await CasinoService.page(app.prisma, player.id);
    expect(afterOdds.totalCasinoValueCents).toBe(before.totalCasinoValueCents);
    expect((await app.prisma.roundPlayer.findUniqueOrThrow({
      where: { id: player.id },
      select: { netWorthCents: true },
    })).netWorthCents).toBe(netWorthBefore);

    const rollAction = randomUUID();
    const settled = await StreetDiceService.roll(
      app.prisma,
      player.id,
      { roundId: started.id, actionId: rollAction },
      sequenceRng([0.34, 0.34]),
    );
    expect(settled.status).toBe('SETTLED');
    expect(settled.dice).toEqual([3, 3]);
    expect(settled.outcome).toBe('WIN');
    expect(settled.totalReturnCents).toBe(
      table.minBetCents * 2 + Math.floor(table.betStepCents * 11 / 5),
    );

    const replay = await StreetDiceService.roll(app.prisma, player.id, {
      roundId: started.id,
      actionId: rollAction,
    });
    expect(replay).toEqual(settled);

    const state = await StreetDiceService.state(app.prisma, player.id);
    expect(state.activeRound).toBeNull();
    expect(state.history[0]?.id).toBe(started.id);
  });

  it('settles natural 7 and craps on the come-out immediately', async () => {
    const { player } = await fixture();
    await openBankroll(player.id);
    const table = classicOgV12D.casino.streetDice.tables[0]!;

    const natural = await StreetDiceService.start(
      app.prisma,
      player.id,
      { tableKey: table.key, wagerCents: table.minBetCents, actionId: randomUUID() },
      sequenceRng([0.2, 0.7]),
    );
    expect(natural.dice).toEqual([2, 5]);
    expect(natural.total).toBe(7);
    expect(natural.status).toBe('SETTLED');
    expect(natural.outcome).toBe('WIN');
    expect(natural.totalReturnCents).toBe(table.minBetCents * 2);

    const craps = await StreetDiceService.start(
      app.prisma,
      player.id,
      { tableKey: table.key, wagerCents: table.minBetCents, actionId: randomUUID() },
      sequenceRng([0, 0]),
    );
    expect(craps.dice).toEqual([1, 1]);
    expect(craps.total).toBe(2);
    expect(craps.status).toBe('SETTLED');
    expect(craps.outcome).toBe('LOSE');
    expect(craps.totalReturnCents).toBe(0);
  });

  it('blocks other casino play and session close while a Street Dice point is active', async () => {
    const { player } = await fixture();
    const page = await openBankroll(player.id);
    const diceTable = classicOgV12D.casino.streetDice.tables[0]!;
    await StreetDiceService.start(
      app.prisma,
      player.id,
      { tableKey: diceTable.key, wagerCents: diceTable.minBetCents, actionId: randomUUID() },
      sequenceRng([0.2, 0.5]),
    );

    const roulette = classicOgV12D.casino.roulette.tables[0]!;
    await expect(RouletteService.spin(app.prisma, player.id, {
      tableKey: roulette.key,
      bets: [{ kind: 'STRAIGHT', selection: '0', amountCents: roulette.minBetCents }],
      actionId: randomUUID(),
    })).rejects.toMatchObject({ code: 'STREET_DICE_ACTIVE' });

    const slot = classicOgV12D.casino.slots.machines[0]!;
    await expect(CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: slot.key,
      betPerLineCents: slot.minBetPerLineCents,
      activePaylineKeys: [slot.paylines[0]!.key],
      actionId: randomUUID(),
    })).rejects.toMatchObject({ code: 'STREET_DICE_ACTIVE' });

    await expect(CasinoService.closeSession(
      app.prisma,
      player.id,
      page.openSession!.id,
      randomUUID(),
    )).rejects.toMatchObject({ code: 'STREET_DICE_ACTIVE' });
  });
});
