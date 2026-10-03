import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12A } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { CasinoService } from '../casino.service.js';
import { ReputationService } from '../reputation.service.js';
import { refreshAwayWorth } from '../run-settle.service.js';

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.2.0-A casino foundation with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture() {
    const round = await app.prisma.round.create({
      data: {
        name: 'Casino A fixture',
        slug: 'casino-a-' + randomUUID(),
        rulesetId: classicOgV12A.meta.id,
        rulesetVersion: classicOgV12A.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...classicOgV12A.round.startingPlayer,
        ...startingStock(classicOgV12A),
        cashCents: 2_000_000n,
        roundId: round.id,
        accountId,
        cityId: city.id,
        displayName: 'casino_' + randomUUID().slice(0, 6),
        publicPimpId: 9400 + roundIds.length,
        reputation: { create: ReputationService.seedFor(classicOgV12A) },
      },
    });
    return player;
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const accountName = 'casino_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: accountName, email: accountName + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('moves cash to city chips once when the same action is retried', async () => {
    const player = await fixture();
    const actionId = randomUUID();
    await CasinoService.buyChips(app.prisma, player.id, { amountCents: 100_000, actionId });
    await CasinoService.buyChips(app.prisma, player.id, { amountCents: 100_000, actionId });

    const [fresh, wallet, receipts] = await Promise.all([
      app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } }),
      app.prisma.casinoWallet.findFirstOrThrow({ where: { roundPlayerId: player.id } }),
      app.prisma.casinoLedgerEntry.count({ where: { roundPlayerId: player.id, actionId } }),
    ]);
    expect(fresh.cashCents).toBe(1_900_000n);
    expect(wallet.chipsCents).toBe(100_000n);
    expect(receipts).toBe(1);
  });

  it('charges and redeems against the bankroll the boss actually carried on a flight', async () => {
    const player = await fixture();
    const now = new Date();
    const trip = await app.prisma.bossTrip.create({
      data: {
        roundPlayerId: player.id,
        homeCity: 'new-york-city',
        city: 'las-vegas',
        bankrollCents: 250_000n,
        startBankrollCents: 250_000n,
        ticketCents: 0n,
        hotelCents: 0n,
        turnsSpent: 0,
        departedAt: new Date(now.getTime() - 2 * 3_600_000),
        arrivesAt: new Date(now.getTime() - 60 * 60_000),
        stayUntil: new Date(now.getTime() + 60 * 60_000),
        returnsAt: new Date(now.getTime() + 2 * 3_600_000),
      },
    });
    await app.prisma.$transaction((tx) => refreshAwayWorth(tx, player.id, classicOgV12A));

    const bought = await CasinoService.buyChips(app.prisma, player.id, {
      amountCents: 100_000,
      actionId: randomUUID(),
    });
    const afterBuy = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } });
    const tripAfterBuy = await app.prisma.bossTrip.findUniqueOrThrow({ where: { id: trip.id } });
    const vegas = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'las-vegas' } });
    const walletAfterBuy = await app.prisma.casinoWallet.findUniqueOrThrow({
      where: { roundPlayerId_cityId: { roundPlayerId: player.id, cityId: vegas.id } },
    });

    expect(afterBuy.cashCents).toBe(2_000_000n);
    expect(tripAfterBuy.bankrollCents).toBe(150_000n);
    expect(walletAfterBuy.chipsCents).toBe(100_000n);
    expect(bought.cashCents).toBe(150_000);
    expect(bought.currentCitySlug).toBe('las-vegas');

    const redeemed = await CasinoService.redeemChips(app.prisma, player.id, {
      amountCents: 50_000,
      actionId: randomUUID(),
    });
    const afterRedeem = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } });
    const tripAfterRedeem = await app.prisma.bossTrip.findUniqueOrThrow({ where: { id: trip.id } });
    const walletAfterRedeem = await app.prisma.casinoWallet.findUniqueOrThrow({
      where: { roundPlayerId_cityId: { roundPlayerId: player.id, cityId: vegas.id } },
    });

    expect(afterRedeem.cashCents).toBe(2_000_000n);
    expect(tripAfterRedeem.bankrollCents).toBe(200_000n);
    expect(walletAfterRedeem.chipsCents).toBe(50_000n);
    expect(redeemed.cashCents).toBe(200_000);

    const carryOnCap = BigInt(classicOgV12A.travel.trips.carryOnCapCents);
    await app.prisma.bossTrip.update({
      where: { id: trip.id },
      data: { bankrollCents: carryOnCap - 10_000n },
    });
    await expect(CasinoService.redeemChips(app.prisma, player.id, {
      amountCents: 50_000,
      actionId: randomUUID(),
    })).rejects.toMatchObject({ code: 'OVER_CARRY_ON' });

    const [tripAtCap, walletAtCap] = await Promise.all([
      app.prisma.bossTrip.findUniqueOrThrow({ where: { id: trip.id } }),
      app.prisma.casinoWallet.findUniqueOrThrow({
        where: { roundPlayerId_cityId: { roundPlayerId: player.id, cityId: vegas.id } },
      }),
    ]);
    expect(tripAtCap.bankrollCents).toBe(carryOnCap - 10_000n);
    expect(walletAtCap.chipsCents).toBe(50_000n);
  });

  it('moves chips into one bankroll and returns them to the same city wallet on close', async () => {
    const player = await fixture();
    await CasinoService.buyChips(app.prisma, player.id, { amountCents: 200_000, actionId: randomUUID() });
    const opened = await CasinoService.startSession(app.prisma, player.id, { amountCents: 150_000, actionId: randomUUID() });
    expect(opened.openSession?.bankrollCents).toBe(150_000);
    expect(opened.currentVenue?.walletChipsCents).toBe(50_000);

    const closeAction = randomUUID();
    const closed = await CasinoService.closeSession(app.prisma, player.id, opened.openSession!.id, closeAction);
    const replay = await CasinoService.closeSession(app.prisma, player.id, opened.openSession!.id, closeAction);
    expect(closed.openSession).toBeNull();
    expect(closed.currentVenue?.walletChipsCents).toBe(200_000);
    expect(replay.currentVenue?.walletChipsCents).toBe(200_000);
  });
});
