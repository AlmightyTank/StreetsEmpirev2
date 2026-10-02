import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV11C } from '@streets/rulesets';
import {
  bribeCentsPerPoint,
  businessIncomeCentsPerHour,
  businessStaff,
  racketCashPerHour,
  registerCapCents,
  startingStock,
} from '@streets/rules-engine';
import { BusinessActionService } from '../business-action.service.js';
import { BusinessService } from '../business.service.js';
import { ReputationService } from '../reputation.service.js';
import { StoreService } from '../store.service.js';
import { TurfService } from '../turf.service.js';

const HOUR_MS = 3_600_000;
const rules = classicOgV11C;
const rackets = rules.business.rackets;
const home = rules.round.startingCitySlug;

describe.runIf(process.env.TURF_INTEGRATION === '1')('1.1.0-C rackets with PostgreSQL', () => {
  let app: FastifyInstance;
  let roundId = '';
  let cityId = '';
  let playerId = '';
  let rivalId = '';
  const accountIds: string[] = [];

  async function account(): Promise<string> {
    const name = `racket_${randomUUID().slice(0, 6)}`;
    const registered = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() },
    });
    const id = registered.json().account.id as string;
    accountIds.push(id);
    return id;
  }

  async function player(accountId: string, publicPimpId: number): Promise<string> {
    const row = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer,
        ...startingStock(rules),
        roundId,
        accountId,
        cityId,
        displayName: `racket_${publicPimpId}`,
        publicPimpId,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    return row.id;
  }

  const read = (id = playerId) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id } });
  const lot = async (district: string, at: number) => app.prisma.business.findFirstOrThrow({
    where: { roundId, lot: at, turf: { cityId, district } },
  });
  const actionId = () => randomUUID();

  /** Put a business at a level, fully staffed by the player, running a racket since `hoursAgo`. */
  async function running(district: string, at: number, level: number, racket: string | null, hoursAgo = 0, registerCents = 0n) {
    const row = await lot(district, at);
    const staff = businessStaff(rules, row.kind as never, level);
    const since = new Date(Date.now() - hoursAgo * HOUR_MS);
    await app.prisma.business.update({
      where: { id: row.id },
      data: { level, staff, staffTarget: staff, staffOwnerId: playerId, registerCents, accruedAt: since, racket, racketSince: racket ? since : null },
    });
    const kind = rules.business.catalog[row.kind as keyof typeof rules.business.catalog].staff;
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: kind === 'WHORES' ? { businessWhores: { increment: staff } } : { businessThugs: { increment: staff } },
    });
    return { row, staff };
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const round = await app.prisma.round.create({
      data: {
        name: 'Rackets C fixture',
        slug: `rackets-c-${randomUUID()}`,
        rulesetId: rules.meta.id,
        rulesetVersion: rules.meta.version,
        status: 'ACTIVE',
        startsAt: new Date('2000-01-01'),
        endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    roundId = round.id;
    cityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: home } })).id;
    playerId = await player(await account(), 8500);
    rivalId = await player(await account(), 8501);
    await TurfService.ensureRound(app.prisma, roundId, rules);
  });

  afterAll(async () => {
    if (roundId) await app.prisma.round.delete({ where: { id: roundId } });
    for (const id of accountIds) await app.prisma.account.delete({ where: { id } });
    await app?.close();
  });

  beforeEach(async () => {
    await app.prisma.business.updateMany({ where: { roundId }, data: { level: 0, staff: 0, staffOwnerId: null, registerCents: 0n, racket: null, racketSince: null } });
    await app.prisma.turf.updateMany({ where: { roundId }, data: { holderId: null, cornerThugs: 0, heldSince: null } });
    // A crew holding three home blocks, with cash, crew and supply to spare, and no Heat.
    await app.prisma.turf.updateMany({
      where: { roundId, cityId, district: { in: ['NIGHTCLUB', 'CASINO', 'LOW_RENT'] } },
      data: { holderId: playerId, cornerThugs: 6, heldSince: new Date(Date.now() - 200 * HOUR_MS), upkeepAt: new Date() },
    });
    await app.prisma.roundPlayer.update({
      where: { id: playerId },
      data: {
        cashCents: 100_000_000n, turns: 144, thugs: 80, woundedThugs: 0, busyThugs: 0, postedThugs: 18,
        whores: 100, beer: 5_000, crack: 5_000, businessThugs: 0, businessWhores: 0,
        thugHappiness: 100, whoreHappiness: 100, heat: 0, lastTurnCalculationAt: new Date(),
        racketEffects: {}, launderedDay: null, launderedHeatToday: 0, launderedHeatRound: 0,
      },
    });
  });

  it('sets a racket for turns, stores its strength on the crew, and locks a switch for the cooldown', async () => {
    await running('CASINO', 2, 5, null);
    const set = await BusinessActionService.racket(app.prisma, playerId, { district: 'CASINO', lot: 2, racket: 'LOOSE_LIPS', actionId: actionId() });
    expect(set.result).toMatchObject({ racket: 'LOOSE_LIPS', racketName: 'Loose lips', previous: null, turnsUsed: rackets.switchTurnCost });
    expect(set.before.turns - set.after.turns).toBe(rackets.switchTurnCost);
    expect((await lot('CASINO', 2)).racket).toBe('LOOSE_LIPS');
    expect((await read()).racketEffects).toEqual({ LOOSE_LIPS: 1 });

    // A racket the business cannot run, the same racket again, and a switch inside the cooldown.
    await expect(BusinessActionService.racket(app.prisma, playerId, { district: 'CASINO', lot: 2, racket: 'VIP_ROOM', actionId: actionId() }))
      .rejects.toMatchObject({ code: 'RACKET_NOT_HERE' });
    await expect(BusinessActionService.racket(app.prisma, playerId, { district: 'CASINO', lot: 2, racket: 'LOOSE_LIPS', actionId: actionId() }))
      .rejects.toMatchObject({ code: 'RACKET_NO_CHANGE' });
    await expect(BusinessActionService.racket(app.prisma, playerId, { district: 'CASINO', lot: 2, racket: 'BACK_ROOM_CARDS', actionId: actionId() }))
      .rejects.toMatchObject({ code: 'RACKET_COOLDOWN' });

    // Once the cooldown is over it switches, and later shuts.
    const row = await lot('CASINO', 2);
    await app.prisma.business.update({ where: { id: row.id }, data: { racketSince: new Date(Date.now() - rackets.switchCooldownHours * HOUR_MS) } });
    const switched = await BusinessActionService.racket(app.prisma, playerId, { district: 'CASINO', lot: 2, racket: 'BACK_ROOM_CARDS', actionId: actionId() });
    expect(switched.result).toMatchObject({ racket: 'BACK_ROOM_CARDS', previous: 'LOOSE_LIPS' });
    expect((await read()).racketEffects).toEqual({ BACK_ROOM_CARDS: 1 });
    await app.prisma.business.update({ where: { id: row.id }, data: { racketSince: new Date(Date.now() - rackets.switchCooldownHours * HOUR_MS) } });
    await BusinessActionService.racket(app.prisma, playerId, { district: 'CASINO', lot: 2, racket: null, actionId: actionId() });
    expect((await lot('CASINO', 2)).racket).toBeNull();
    expect((await read()).racketEffects).toEqual({});
  });

  it('weakens a racket with fewer staff and drops it when the business closes', async () => {
    await running('CASINO', 1, 5, 'HOUSE_ALWAYS_WINS');
    await BusinessService.settleFor(app.prisma, playerId);
    expect((await read()).racketEffects).toEqual({ HOUSE_ALWAYS_WINS: 1 });
    const max = businessStaff(rules, 'CASINO_FRONT', 5);
    await BusinessActionService.staff(app.prisma, playerId, { district: 'CASINO', lot: 1, staff: max / 2, autoStaff: false, actionId: actionId() });
    expect((await read()).racketEffects).toEqual({ HOUSE_ALWAYS_WINS: 0.5 });
    await BusinessActionService.staff(app.prisma, playerId, { district: 'CASINO', lot: 1, staff: 0, autoStaff: false, actionId: actionId() });
    expect((await read()).racketEffects).toEqual({});
  });

  it('pays a cash racket into the register on top of the front, and draws its Heat', async () => {
    const hours = 3;
    await running('CASINO', 1, 5, 'HOUSE_ALWAYS_WINS', hours);
    const front = businessIncomeCentsPerHour(rules, { citySlug: home, district: 'CASINO', business: 'CASINO_FRONT', level: 5 });
    const extra = racketCashPerHour(rules, 'HOUSE_ALWAYS_WINS', front);
    const settled = await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, new Date()));

    expect((await lot('CASINO', 1)).registerCents).toBe(BigInt(Math.floor((front + extra) * hours)));
    expect(settled?.racketHeat).toBe(rackets.catalog.HOUSE_ALWAYS_WINS.heatPerHour * hours);
    expect((await read()).heat).toBe(rackets.catalog.HOUSE_ALWAYS_WINS.heatPerHour * hours);
  });

  it('cuts the other rackets\' Heat with Wash & fold', async () => {
    const hours = 5;
    await running('CASINO', 1, 5, 'HOUSE_ALWAYS_WINS', hours);
    await running('LOW_RENT', 1, 5, 'WASH_AND_FOLD', hours);
    await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, new Date()));
    const shield = rackets.catalog.WASH_AND_FOLD.effect.share;
    expect((await read()).heat).toBe(Math.round(rackets.catalog.HOUSE_ALWAYS_WINS.heatPerHour * hours * (1 - shield)));
  });

  it('never launders more than the register can pay at the crew\'s bribe price', async () => {
    const { row } = await running('CASINO', 1, 5, 'CASINO_LAUNDERING', 10, 0n);
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { heat: 80, netWorthCents: 10_000_000_000n } });
    const price = Math.floor(Number(bribeCentsPerPoint(10_000_000_000n, rules.heat)) * rackets.laundering.bribePriceShare);
    const settled = await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, new Date()));
    const register = (await app.prisma.business.findUniqueOrThrow({ where: { id: row.id } })).registerCents;
    expect(settled!.launderedHeat).toBeLessThan(40);
    expect(settled!.launderedCents).toBe(BigInt(price * settled!.launderedHeat));
    expect(register).toBeLessThan(BigInt(price));
    expect(register).toBeGreaterThanOrEqual(0n);
  });

  it('launders Heat out of its own register, and stops at the daily and round caps', async () => {
    const hours = 10;
    const { row } = await running('CASINO', 1, 5, 'CASINO_LAUNDERING', hours, 50_000_000n);
    // At the bribe floor, so the register can always pay: this test is about the caps.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { heat: 80, netWorthCents: 0n } });
    const me = await read();
    const price = Math.floor(Number(bribeCentsPerPoint(me.netWorthCents, rules.heat)) * rackets.laundering.bribePriceShare);
    const front = businessIncomeCentsPerHour(rules, { citySlug: home, district: 'CASINO', business: 'CASINO_FRONT', level: 5 });
    const settled = await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, new Date()));

    const washed = rackets.catalog.CASINO_LAUNDERING.effect.heatPerHour * hours;
    expect(settled?.launderedHeat).toBe(washed);
    const after = await read();
    expect(after.heat).toBe(80 - washed);
    expect(after.launderedHeatToday).toBe(washed);
    expect(after.launderedHeatRound).toBe(washed);
    const cap = BigInt(registerCapCents(rules, front));
    const filled = 50_000_000n + BigInt(Math.floor(front * hours)) > cap ? cap : 50_000_000n + BigInt(Math.floor(front * hours));
    expect((await app.prisma.business.findUniqueOrThrow({ where: { id: row.id } })).registerCents).toBe(filled - BigInt(price * washed));

    // The day's cap: only what is left of it washes, however many hours pass.
    await app.prisma.business.update({ where: { id: row.id }, data: { accruedAt: new Date(Date.now() - hours * HOUR_MS) } });
    const second = await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, new Date()));
    expect(second?.launderedHeat).toBe(rackets.laundering.dailyHeatCap - washed);
    expect((await read()).launderedHeatToday).toBe(rackets.laundering.dailyHeatCap);

    // The round's cap holds on a fresh day too.
    await app.prisma.roundPlayer.update({ where: { id: playerId }, data: { heat: 80, launderedDay: '2000-01-01', launderedHeatToday: 48, launderedHeatRound: rackets.laundering.roundHeatCap - 3 } });
    await app.prisma.business.update({ where: { id: row.id }, data: { accruedAt: new Date(Date.now() - hours * HOUR_MS) } });
    const third = await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, new Date()));
    expect(third?.launderedHeat).toBe(3);
    expect((await read()).launderedHeatRound).toBe(rackets.laundering.roundHeatCap);
  });

  it('sells product over the counter at Pip\'s price, into the register, without turns', async () => {
    const hours = 5;
    await running('LOW_RENT', 2, 5, 'COUNTER_SALES', hours);
    const before = await read();
    const settled = await app.prisma.$transaction((tx) => BusinessService.settlePlayer(tx, playerId, rules, new Date()));
    const units = rackets.catalog.COUNTER_SALES.effect.unitsPerHour * hours;
    const sold = Object.values(settled!.counterSold).reduce((sum, count) => sum + count, 0);
    expect(sold).toBe(units);
    const prices = Object.entries(settled!.counterSold).reduce((sum, [key, count]) => sum
      + count * (key === 'CRACK'
        ? rules.stores.PIP.items.CRACK.sellCents
        : (rules.products as Record<string, { economy?: { pip?: { sellCents: number } } }>)[key]!.economy!.pip!.sellCents), 0);
    expect(settled!.counterCents).toBe(BigInt(prices));
    expect((await read()).turns).toBeGreaterThanOrEqual(before.turns);
  });

  it('shades store prices: Beer supply buys beer cheaper at the Corner Store', async () => {
    await running('LOW_RENT', 2, 5, 'BEER_SUPPLY');
    await BusinessService.settleFor(app.prisma, playerId);
    const bought = await StoreService.trade(app.prisma, playerId, { store: 'CORNER', item: 'BEER', direction: 'buy', quantity: 10, actionId: actionId() });
    const unit = Math.floor(rules.stores.CORNER.items.BEER.buyCents * (100 - rackets.catalog.BEER_SUPPLY.effect.buyDiscountPercent!) / 100);
    expect(bought.before.cashCents - bought.after.cashCents).toBe(unit * 10);
  });

  it('clears a business\'s racket when the crew loses the block', async () => {
    await running('CASINO', 2, 5, 'LOOSE_LIPS');
    await BusinessService.settleFor(app.prisma, playerId);
    expect((await read()).racketEffects).toEqual({ LOOSE_LIPS: 1 });
    await app.prisma.turf.updateMany({ where: { roundId, cityId, district: 'CASINO' }, data: { holderId: rivalId } });
    await BusinessService.settleFor(app.prisma, playerId);
    expect(await lot('CASINO', 2)).toMatchObject({ racket: null, racketSince: null, staffOwnerId: null });
    expect((await read()).racketEffects).toEqual({});
  });
});
