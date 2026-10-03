import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12B } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { CasinoService } from '../casino.service.js';
import { ReputationService } from '../reputation.service.js';

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.2.0-B slots with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(citySlug = 'new-york-city') {
    const round = await app.prisma.round.create({
      data: {
        name: 'Casino B fixture',
        slug: 'casino-b-' + randomUUID(),
        rulesetId: classicOgV12B.meta.id,
        rulesetVersion: classicOgV12B.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: citySlug } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV12B.round.startingPlayer,
        ...startingStock(classicOgV12B),
        cashCents: 2_000_000n,
        roundId: round.id,
        accountId,
        cityId: city.id,
        displayName: 'slots_' + randomUUID().slice(0, 6),
        publicPimpId: 9600 + roundIds.length,
        reputation: { create: ReputationService.seedFor(classicOgV12B) },
      },
    });
    return { round, player, city };
  }

  async function openBankroll(playerId: string, amountCents = 400_000) {
    await CasinoService.buyChips(app.prisma, playerId, { amountCents: 500_000, actionId: randomUUID() });
    return CasinoService.startSession(app.prisma, playerId, { amountCents, actionId: randomUUID() });
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'slots_' + randomUUID().slice(0, 6);
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

  it('stores one authoritative result and replays the same reels for the same action ID', async () => {
    const { player } = await fixture();
    await openBankroll(player.id);
    const actionId = randomUUID();

    const first = await CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: 'CORNER_CLASSIC',
      wagerCents: 10_000,
      actionId,
    });
    const replay = await CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: 'CORNER_CLASSIC',
      wagerCents: 10_000,
      actionId,
    });

    expect(replay.spin).toEqual(first.spin);
    await expect(CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: 'CORNER_CLASSIC',
      wagerCents: 9_000,
      actionId,
    })).rejects.toMatchObject({ code: 'ACTION_ID_REUSED' });
    expect(await app.prisma.casinoLedgerEntry.count({
      where: { roundPlayerId: player.id, actionId, kind: 'SLOT_SPIN' },
    })).toBe(1);
    const session = await app.prisma.casinoSession.findFirstOrThrow({ where: { roundPlayerId: player.id, status: 'OPEN' } });
    expect(session.bankrollCents).toBe(BigInt(first.spin.bankrollAfterCents));
  });

  it('enforces machine availability by venue kind', async () => {
    const { player } = await fixture('new-york-city');
    await openBankroll(player.id);
    await expect(CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: 'EMPIRE_GOLD',
      wagerCents: 2_500,
      actionId: randomUUID(),
    })).rejects.toMatchObject({ code: 'SLOT_NOT_HERE' });
  });

  it('funds the progressive pool from a Vegas spin without making a sub-max wager jackpot eligible', async () => {
    const { round, player } = await fixture('las-vegas');
    await openBankroll(player.id);
    const progressive = classicOgV12B.casino.slots.machines.find((machine) => machine.key === 'EMPIRE_GOLD')!.progressive!;

    const result = await CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: 'EMPIRE_GOLD',
      wagerCents: 2_500,
      actionId: randomUUID(),
    });

    const jackpot = await app.prisma.casinoJackpot.findUniqueOrThrow({
      where: { roundId_machineKey: { roundId: round.id, machineKey: 'EMPIRE_GOLD' } },
    });
    expect(result.spin.jackpotAwardCents).toBe(0);
    expect(result.spin.jackpotContributionCents).toBe(25);
    expect(jackpot.poolCents).toBe(BigInt(progressive.seedCents + 25));
  });
});
