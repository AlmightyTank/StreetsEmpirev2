import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12D } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { CasinoInstantGamesService } from '../casino-instant-games.service.js';
import { CasinoService } from '../casino.service.js';
import { ReputationService } from '../reputation.service.js';
import { RouletteService } from '../roulette.service.js';

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.2.0-D roulette and instant games with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture() {
    const round = await app.prisma.round.create({ data: {
      name: 'Casino D fixture', slug: 'casino-d-' + randomUUID(), rulesetId: classicOgV12D.meta.id,
      rulesetVersion: classicOgV12D.meta.version, status: 'ACTIVE', startsAt: new Date('2000-01-01'),
      endsAt: new Date(Date.now() + 86_400_000),
    } });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    const player = await app.prisma.roundPlayer.create({ data: {
      ...classicOgV12D.round.startingPlayer, ...startingStock(classicOgV12D), cashCents: 3_000_000n,
      roundId: round.id, accountId, cityId: city.id, displayName: 'casino_d_' + randomUUID().slice(0, 6),
      publicPimpId: 9800 + roundIds.length, reputation: { create: ReputationService.seedFor(classicOgV12D) },
    } });
    await CasinoService.buyChips(app.prisma, player.id, { amountCents: 700_000, actionId: randomUUID() });
    await CasinoService.startSession(app.prisma, player.id, { amountCents: 500_000, actionId: randomUUID() });
    return player;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'casino_d_' + randomUUID().slice(0, 6);
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { ageConfirmed: true, username: name, email: name + '@example.invalid', password: randomUUID() } });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('resolves an American straight-up roulette win and replays one receipt', async () => {
    const player = await fixture();
    const table = classicOgV12D.casino.roulette.tables[0]!;
    const actionId = randomUUID();
    const input = { tableKey: table.key, bets: [{ kind: 'STRAIGHT' as const, selection: '0', amountCents: table.minBetCents }], actionId };
    const spin = await RouletteService.spin(app.prisma, player.id, input, () => 0);
    expect(spin).toMatchObject({ pocket: '0', color: 'GREEN', wagerCents: table.minBetCents, returnCents: table.minBetCents * 36, netCents: table.minBetCents * 35 });
    expect(await RouletteService.spin(app.prisma, player.id, input)).toEqual(spin);
    expect(await app.prisma.casinoLedgerEntry.count({ where: { roundPlayerId: player.id, actionId, kind: 'ROULETTE' } })).toBe(1);
  });

  it('settles and safely replays a server-generated scratch card', async () => {
    const player = await fixture();
    const actionId = randomUUID();
    const input = { denominationCents: 1_000, actionId };
    const card = await CasinoInstantGamesService.playScratch(app.prisma, player.id, input, () => 0);
    expect(card).toMatchObject({ denominationCents: 1_000, payoutCents: 0, netCents: -1_000 });
    expect(card.winningSymbols).toHaveLength(3);
    expect(card.spots).toHaveLength(9);
    expect(await CasinoInstantGamesService.playScratch(app.prisma, player.id, input, () => 0.999)).toEqual(card);
    await expect(CasinoInstantGamesService.playScratch(app.prisma, player.id, { denominationCents: 5_000, actionId }))
      .rejects.toMatchObject({ code: 'ACTION_ID_REUSED' });
  });

  it('settles a fixed-odds horse ticket from a server-generated finish order', async () => {
    const player = await fixture();
    const horse = classicOgV12D.casino.horseRacing.horses[0]!;
    const actionId = randomUUID();
    const input = { horseKey: horse.key, wagerCents: 1_000, actionId };
    const race = await CasinoInstantGamesService.runHorseRace(app.prisma, player.id, input, () => 0);
    expect(race.finishOrder).toHaveLength(classicOgV12D.casino.horseRacing.horses.length);
    expect(race).toMatchObject({ horseKey: horse.key, winnerKey: horse.key, wagerCents: 1_000, returnCents: 3_000, netCents: 2_000 });
    expect(await CasinoInstantGamesService.runHorseRace(app.prisma, player.id, input, () => 0.999)).toEqual(race);
  });
});
