import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12D, classicOgV12E2, type Ruleset } from '@streets/rulesets';
import { hotelCents, seededRng, startingStock, tripRules } from '@streets/rules-engine';
import { BlackjackService } from '../blackjack.service.js';
import { CasinoService } from '../casino.service.js';
import { ReputationService } from '../reputation.service.js';
import { RouletteService } from '../roulette.service.js';
import { refreshAwayWorth } from '../run-settle.service.js';
import { StreetDiceService } from '../street-dice.service.js';

const BASIS = 10_000n;

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.2.0-E high rollers with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(ruleset: Ruleset = classicOgV12E2) {
    const round = await app.prisma.round.create({
      data: {
        name: 'Casino E2 fixture', slug: 'casino-e2-' + randomUUID(),
        rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
        status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    return app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer, ...startingStock(ruleset),
        cashCents: 400_000_000n, roundId: round.id, accountId, cityId: city.id,
        displayName: 'whale_' + randomUUID().slice(0, 6), publicPimpId: 9900 + roundIds.length,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
  }

  async function openBankroll(playerId: string, amountCents = 500_000) {
    await CasinoService.buyChips(app.prisma, playerId, { amountCents: Math.max(amountCents, 500_000), actionId: randomUUID() });
    return CasinoService.startSession(app.prisma, playerId, { amountCents, actionId: randomUUID() });
  }

  /** Give a player rated history directly: theo and comps in whole cents. */
  async function seedRating(playerId: string, citySlug: string, theoCents: bigint, compCents = 0n) {
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: citySlug } });
    await app.prisma.casinoRating.upsert({
      where: { roundPlayerId_cityId: { roundPlayerId: playerId, cityId: city.id } },
      update: { theoBasis: { increment: theoCents * BASIS }, compBasis: { increment: compCents * BASIS } },
      create: { roundPlayerId: playerId, cityId: city.id, theoBasis: theoCents * BASIS, compBasis: compCents * BASIS },
    });
  }

  async function tripToVegas(playerId: string, bodyguards = 0) {
    const now = Date.now();
    const trip = await app.prisma.bossTrip.create({
      data: {
        roundPlayerId: playerId, homeCity: 'new-york-city', city: 'las-vegas',
        bankrollCents: 1_000_000n, startBankrollCents: 1_000_000n, ticketCents: 0n, hotelCents: 0n, turnsSpent: 0,
        bodyguards,
        departedAt: new Date(now - 2 * 3_600_000), arrivesAt: new Date(now - 3_600_000),
        stayUntil: new Date(now + 3_600_000), returnsAt: new Date(now + 2 * 3_600_000),
      },
    });
    await app.prisma.$transaction((tx) => refreshAwayWorth(tx, playerId, classicOgV12E2));
    return trip;
  }

  const straight = (amountCents: number) => [{ kind: 'STRAIGHT' as const, selection: '17', amountCents }];

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'casino_e2_' + randomUUID().slice(0, 6);
    const registered = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { username: name, email: name + '@example.invalid', password: randomUUID() },
    });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('rates each charged wager at posted theo, never at its result, and replays without rating twice', async () => {
    const player = await fixture();
    await openBankroll(player.id);
    const actionId = randomUUID();
    const spin = { tableKey: 'STREET_ROULETTE', bets: straight(100_000), actionId };
    await RouletteService.spin(app.prisma, player.id, spin, seededRng(7));
    await RouletteService.spin(app.prisma, player.id, spin, seededRng(99));

    const page = await CasinoService.page(app.prisma, player.id);
    // $1,000 on an American wheel rates at 5.26%: $52.60 of theo whatever the pocket.
    expect(page.status?.theoCents).toBe(5_260);
    expect(page.status?.wageredCents).toBe(100_000);
    expect(page.status?.tier.key).toBe('WALK_IN');
    expect(page.status?.compBalanceCents).toBe(0);
    expect(page.status?.cities[0]?.citySlug).toBe('new-york-city');
    expect(page.status?.homeRoomCitySlug).toBe('new-york-city');
  });

  it('counts true odds as action but adds no theo', async () => {
    const player = await fixture();
    await openBankroll(player.id);
    // Seed 1 rolls a 5 on the come-out: a point.
    const round = await StreetDiceService.start(app.prisma, player.id, { tableKey: 'STREET_DICE', wagerCents: 10_000, actionId: randomUUID() }, seededRng(1));
    expect(round.point).toBe(5);
    const before = (await CasinoService.page(app.prisma, player.id)).status!;
    expect(before.theoCents).toBe(141);
    await StreetDiceService.addOdds(app.prisma, player.id, { roundId: round.id, amountCents: 20_000, actionId: randomUUID() });
    const after = (await CasinoService.page(app.prisma, player.id)).status!;
    expect(after.theoCents).toBe(before.theoCents);
    expect(after.wageredCents).toBe(before.wageredCents + 20_000);
  });

  it('climbs a tier, logs it, and pays comps at the new tier from the next wager on', async () => {
    const player = await fixture();
    await openBankroll(player.id);
    await seedRating(player.id, 'new-york-city', 24_990n);
    await RouletteService.spin(app.prisma, player.id, { tableKey: 'STREET_ROULETTE', bets: straight(100_000), actionId: randomUUID() }, seededRng(3));
    const crossed = (await CasinoService.page(app.prisma, player.id)).status!;
    expect(crossed.tier.key).toBe('REGULAR');
    // The crossing wager is rated at the tier held before it: no comps yet.
    expect(crossed.compBalanceCents).toBe(0);
    const activity = await app.prisma.playerActivity.findFirst({ where: { roundPlayerId: player.id, type: 'CASINO_STATUS_UP' } });
    expect(activity?.payload).toMatchObject({ tierKey: 'REGULAR' });

    await RouletteService.spin(app.prisma, player.id, { tableKey: 'STREET_ROULETTE', bets: straight(100_000), actionId: randomUUID() }, seededRng(4));
    const comped = (await CasinoService.page(app.prisma, player.id)).status!;
    expect(comped.compBalanceCents).toBe(526);
  });

  it('raises the session bankroll ceiling with status', async () => {
    const player = await fixture();
    await CasinoService.buyChips(app.prisma, player.id, { amountCents: 150_000_000, actionId: randomUUID() });
    await expect(CasinoService.startSession(app.prisma, player.id, { amountCents: 150_000_000, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'CASINO_AMOUNT' });
    await seedRating(player.id, 'new-york-city', 250_000n);
    const opened = await CasinoService.startSession(app.prisma, player.id, { amountCents: 150_000_000, actionId: randomUUID() });
    expect(opened.openSession?.bankrollCents).toBe(150_000_000);
    expect(opened.limits?.sessionMaxCents).toBe(250_000_000);
  });

  it('keeps VIP tables behind the door, then deals them with the floor table rules', async () => {
    const player = await fixture();
    await openBankroll(player.id, 500_000);
    const locked = await BlackjackService.state(app.prisma, player.id);
    const salon = locked.tables.find((table) => table.key === 'SALON_BLACKJACK')!;
    expect(salon.room).toBe('VIP');
    expect(salon.availableHere).toBe(false);
    expect(salon.lockedReason).toContain('The Penthouse Game');
    expect(locked.tables.find((table) => table.key === 'STREET_BLACKJACK')?.availableHere).toBe(true);
    // Black Room tables are Vegas-only: not a door problem in New York.
    expect(locked.tables.find((table) => table.key === 'BLACK_ROOM_BLACKJACK')?.lockedReason).toBeNull();
    await expect(BlackjackService.deal(app.prisma, player.id, { tableKey: 'SALON_BLACKJACK', wagerCents: 50_000, actionId: randomUUID() }, seededRng(5)))
      .rejects.toMatchObject({ code: 'VIP_ROOM_LOCKED' });

    await seedRating(player.id, 'new-york-city', 25_000n);
    const open = await BlackjackService.state(app.prisma, player.id);
    expect(open.tables.find((table) => table.key === 'SALON_BLACKJACK')?.availableHere).toBe(true);
    const hand = await BlackjackService.deal(app.prisma, player.id, { tableKey: 'SALON_BLACKJACK', wagerCents: 50_000, actionId: randomUUID() }, seededRng(5));
    expect(hand.tableKey).toBe('SALON_BLACKJACK');
    const page = await CasinoService.page(app.prisma, player.id);
    expect(page.status?.vipHere).toMatchObject({ allowed: true, via: 'STATUS', roomName: 'The Penthouse Game' });
    // $500 at a stand-on-soft-17 table rates at 0.50%.
    expect(page.status!.theoCents).toBe(25_000 + 250);
  });

  it('opens a VIP room to the owner of an operating Casino Front in that city', async () => {
    const player = await fixture();
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: 'new-york-city' } });
    const turf = await app.prisma.turf.create({ data: { roundId: player.roundId, cityId: city.id, district: 'CASINO', localsThugs: 0, holderId: player.id, cornerThugs: 4, heldSince: new Date() } });
    await app.prisma.business.create({
      data: { roundId: player.roundId, turfId: turf.id, lot: 1, kind: 'CASINO_FRONT', level: 1, staff: 2, staffTarget: 2, staffOwnerId: player.id },
    });
    await app.prisma.roundPlayer.update({ where: { id: player.id }, data: { thugs: 40, postedThugs: 4, businessThugs: 2 } });
    await openBankroll(player.id);
    const page = await CasinoService.page(app.prisma, player.id);
    expect(page.status?.tier.key).toBe('WALK_IN');
    expect(page.status?.vipHere).toMatchObject({ allowed: true, via: 'FRONT' });
    expect(page.status?.casinoFronts).toEqual([
      { citySlug: 'new-york-city', cityName: city.name, venueName: 'Five Boroughs Card Room', level: 1, grantsVip: true },
    ]);
    expect(page.status?.frontCompBonusBps).toBe(classicOgV12E2.casino.status.casinoFront.compBonusBps);

    // Front owners earn extra comps on their own strip, even as a walk-in.
    await RouletteService.spin(app.prisma, player.id, { tableKey: 'SALON_ROULETTE', bets: straight(100_000), actionId: randomUUID() }, seededRng(11));
    const after = (await CasinoService.page(app.prisma, player.id)).status!;
    // $1,000 on a single-zero wheel: $27.00 theo, 5% of it in comps.
    expect(after.theoCents).toBe(2_700);
    expect(after.compBalanceCents).toBe(135);
  });

  it('asks a visiting boss for respect at the Black Room door', async () => {
    const player = await fixture();
    await seedRating(player.id, 'new-york-city', 2_500_000n);
    await tripToVegas(player.id, 0);
    const alone = await CasinoService.page(app.prisma, player.id);
    expect(alone.currentVenue?.vipRoom?.name).toBe('Empire Black Room');
    expect(alone.status?.vipHere?.allowed).toBe(false);
    expect(alone.status?.vipHere?.reason).toContain('2 bodyguards');

    await app.prisma.bossTrip.updateMany({ where: { roundPlayerId: player.id, status: 'ACTIVE' }, data: { bodyguards: 2 } });
    const escorted = await CasinoService.page(app.prisma, player.id);
    expect(escorted.status?.vipHere).toMatchObject({ allowed: true, via: 'STATUS' });
  });

  it('spends comps on hotel time for a trip to a casino city, once per action ID, without moving money', async () => {
    const player = await fixture();
    const rules = tripRules(classicOgV12E2)!;
    const block = hotelCents(rules, 'las-vegas', rules.extendMinutes);
    const trip = await tripToVegas(player.id, 0);
    const before = await CasinoService.page(app.prisma, player.id);
    expect(before.status?.hotelComp?.blockedReason).toBe('Not enough comps for another block yet.');
    await expect(CasinoService.compHotel(app.prisma, player.id, { blocks: 1, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'NOT_ENOUGH_COMPS' });

    await seedRating(player.id, 'new-york-city', 0n, block + 1_000n);
    const ready = await CasinoService.page(app.prisma, player.id);
    expect(ready.status?.hotelComp).toMatchObject({ blockCompCents: Number(block), blockedReason: null });

    const actionId = randomUUID();
    const comped = await CasinoService.compHotel(app.prisma, player.id, { blocks: 1, actionId });
    await CasinoService.compHotel(app.prisma, player.id, { blocks: 1, actionId });
    const after = await app.prisma.bossTrip.findUniqueOrThrow({ where: { id: trip.id } });
    expect(after.stayUntil.getTime() - trip.stayUntil.getTime()).toBe(rules.extendMinutes * 60_000);
    expect(after.returnsAt.getTime() - trip.returnsAt.getTime()).toBe(rules.extendMinutes * 60_000);
    expect(after.bankrollCents).toBe(trip.bankrollCents);
    expect(comped.status?.compBalanceCents).toBe(1_000);
    expect(comped.status?.compsSpentCents).toBe(Number(block));
    expect(comped.recentLedger[0]).toMatchObject({ kind: 'COMP_HOTEL', cashDeltaCents: 0, walletChipDeltaCents: 0, sessionChipDeltaCents: 0 });
    const receipts = await app.prisma.casinoLedgerEntry.count({ where: { roundPlayerId: player.id, kind: 'COMP_HOTEL' } });
    expect(receipts).toBe(1);
  });

  it('leaves older casino rulesets without status, ratings or VIP rooms', async () => {
    const player = await fixture(classicOgV12D);
    await openBankroll(player.id);
    await RouletteService.spin(app.prisma, player.id, { tableKey: 'STREET_ROULETTE', bets: straight(100_000), actionId: randomUUID() }, seededRng(7));
    const page = await CasinoService.page(app.prisma, player.id);
    expect(page.status).toBeNull();
    expect(page.currentVenue?.vipRoom).toBeNull();
    expect(page.currentVenue?.identity).toBeNull();
    expect(await app.prisma.casinoRating.count({ where: { roundPlayerId: player.id } })).toBe(0);
    await expect(CasinoService.compHotel(app.prisma, player.id, { blocks: 1, actionId: randomUUID() }))
      .rejects.toMatchObject({ code: 'COMPS_CLOSED' });
  });
});
