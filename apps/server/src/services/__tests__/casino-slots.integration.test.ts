import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV12B, type CasinoSlotMachineRules } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { CasinoService } from '../casino.service.js';
import { ReputationService } from '../reputation.service.js';

function stopTickets(machine: CasinoSlotMachineRules, symbolKey: string): number[] {
  return machine.reelStrips.map((strip) => {
    const stop = strip.findIndex((key) => key === symbolKey);
    if (stop < 0) throw new Error(machine.key + ' has no ' + symbolKey + ' on one reel');
    return (stop + 0.25) / strip.length;
  });
}

function sequenceRng(values: number[], fallback = 0.5): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

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

  it('stores one authoritative reel-stop result and replays it for the same action ID', async () => {
    const { player } = await fixture();
    await openBankroll(player.id);
    const machine = classicOgV12B.casino.slots.machines[0]!;
    const activePaylineKeys = machine.paylines.map((line) => line.key);
    const actionId = randomUUID();

    const first = await CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: machine.key,
      betPerLineCents: 1_000,
      activePaylineKeys,
      actionId,
    });
    const replay = await CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: machine.key,
      betPerLineCents: 1_000,
      activePaylineKeys,
      actionId,
    });

    expect(first.spin.grid).toHaveLength(3);
    expect(first.spin.grid.every((row) => row.length === 3)).toBe(true);
    expect(first.spin.reelStops).toHaveLength(machine.reels);
    expect(replay.spin).toEqual(first.spin);
    await expect(CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: machine.key,
      betPerLineCents: 1_100,
      activePaylineKeys,
      actionId,
    })).rejects.toMatchObject({ code: 'ACTION_ID_REUSED' });
    expect(await app.prisma.casinoLedgerEntry.count({
      where: { roundPlayerId: player.id, actionId, kind: 'SLOT_SPIN' },
    })).toBe(1);
  });

  it('enforces machine availability by venue kind', async () => {
    const { player } = await fixture('new-york-city');
    await openBankroll(player.id);
    const machine = classicOgV12B.casino.slots.machines[2]!;
    await expect(CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: machine.key,
      betPerLineCents: machine.minBetPerLineCents,
      activePaylineKeys: [machine.paylines[0]!.key],
      actionId: randomUUID(),
    })).rejects.toMatchObject({ code: 'SLOT_NOT_HERE' });
  });

  it('funds the progressive pool from a Vegas spin without making a sub-max line bet eligible', async () => {
    const { round, player } = await fixture('las-vegas');
    await openBankroll(player.id);
    const empireGold: CasinoSlotMachineRules = classicOgV12B.casino.slots.machines.find((machine) => machine.key === 'EMPIRE_GOLD')!;
    const progressive = empireGold.progressive!;

    const result = await CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: empireGold.key,
      betPerLineCents: empireGold.minBetPerLineCents,
      activePaylineKeys: [empireGold.paylines[0]!.key],
      actionId: randomUUID(),
    });

    const jackpot = await app.prisma.casinoJackpot.findUniqueOrThrow({
      where: { roundId_machineKey: { roundId: round.id, machineKey: empireGold.key } },
    });
    expect(result.spin.jackpotAwardCents).toBe(0);
    expect(result.spin.jackpotContributionCents).toBe(25);
    expect(jackpot.poolCents).toBe(BigInt(progressive.seedCents + 25));
  });

  it('awards and resets the progressive on qualifying Empire reel stops', async () => {
    const { round, player } = await fixture('las-vegas');
    await openBankroll(player.id);
    const empireGold: CasinoSlotMachineRules = classicOgV12B.casino.slots.machines.find((machine) => machine.key === 'EMPIRE_GOLD')!;
    const progressive = empireGold.progressive!;
    const activePaylineKeys = empireGold.paylines.map((line) => line.key);

    const result = await CasinoService.spinSlot(
      app.prisma,
      player.id,
      {
        machineKey: empireGold.key,
        betPerLineCents: progressive.eligibleBetPerLineCents,
        activePaylineKeys,
        actionId: randomUUID(),
      },
      sequenceRng(stopTickets(empireGold, 'JACKPOT'), 0.5),
    );

    const contribution = progressive.eligibleBetPerLineCents * activePaylineKeys.length * progressive.contributionBps / 10_000;
    expect(result.spin.jackpotAwardCents).toBe(progressive.seedCents + contribution);
    expect(result.spin.winTier).toBe('JACKPOT');
    const jackpot = await app.prisma.casinoJackpot.findUniqueOrThrow({
      where: { roundId_machineKey: { roundId: round.id, machineKey: empireGold.key } },
    });
    expect(jackpot.poolCents).toBe(BigInt(progressive.seedCents));
  });

  it('persists a rare free-spin bundle and never charges the comped spin', async () => {
    const { player } = await fixture();
    await openBankroll(player.id);
    const machine: CasinoSlotMachineRules = classicOgV12B.casino.slots.machines[0]!;
    const activePaylineKeys = [machine.paylines[0]!.key];
    const paidActionId = randomUUID();

    const paid = await CasinoService.spinSlot(
      app.prisma,
      player.id,
      {
        machineKey: machine.key,
        betPerLineCents: machine.minBetPerLineCents,
        activePaylineKeys,
        actionId: paidActionId,
      },
      sequenceRng([...stopTickets(machine, 'BAR'), 0.0001, 0.9998]),
    );
    expect(paid.spin.freeSpinsAwarded).toBe(10);
    expect(paid.spin.freeSpinsRemainingAfter).toBe(10);

    const bonus = await app.prisma.casinoFreeSpinBonus.findUniqueOrThrow({ where: { roundPlayerId: player.id } });
    expect(bonus.machineKey).toBe(machine.key);
    expect(bonus.betPerLineCents).toBe(BigInt(machine.minBetPerLineCents));
    expect(bonus.remainingSpins).toBe(10);

    await expect(CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: machine.key,
      betPerLineCents: machine.minBetPerLineCents,
      activePaylineKeys,
      actionId: randomUUID(),
    })).rejects.toMatchObject({ code: 'FREE_SPINS_PENDING' });

    const beforeFree = await app.prisma.casinoSession.findFirstOrThrow({
      where: { roundPlayerId: player.id, status: 'OPEN' },
    });
    const freeActionId = randomUUID();
    const free = await CasinoService.spinSlot(
      app.prisma,
      player.id,
      {
        machineKey: machine.key,
        betPerLineCents: machine.minBetPerLineCents,
        activePaylineKeys,
        useFreeSpin: true,
        actionId: freeActionId,
      },
      sequenceRng(stopTickets(machine, 'CHERRY'), 0.5),
    );

    expect(free.spin.isFreeSpin).toBe(true);
    expect(free.spin.chargedWagerCents).toBe(0);
    expect(free.spin.wagerCents).toBe(machine.minBetPerLineCents);
    expect(free.spin.freeSpinsAwarded).toBe(0);
    expect(free.spin.freeSpinsRemainingAfter).toBe(9);
    expect(free.spin.bankrollAfterCents).toBe(Number(beforeFree.bankrollCents) + free.spin.payoutCents);

    const bonusAfter = await app.prisma.casinoFreeSpinBonus.findUniqueOrThrow({ where: { roundPlayerId: player.id } });
    expect(bonusAfter.remainingSpins).toBe(9);
    expect(bonusAfter.totalWonCents).toBe(BigInt(free.spin.payoutCents));

    const replay = await CasinoService.spinSlot(app.prisma, player.id, {
      machineKey: machine.key,
      betPerLineCents: machine.minBetPerLineCents,
      activePaylineKeys,
      useFreeSpin: true,
      actionId: freeActionId,
    });
    expect(replay.spin).toEqual(free.spin);
    expect((await app.prisma.casinoFreeSpinBonus.findUniqueOrThrow({ where: { roundPlayerId: player.id } })).remainingSpins).toBe(9);
  });
});
