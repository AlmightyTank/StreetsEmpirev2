import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { classicOgV26J, rulesets, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { PlayerBoardService } from '../player-board.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { ScoutService } from '../scout.service.js';
import { WorkshopService } from '../workshop.service.js';

/**
 * Parts in rank, live. Scouting finds and workshop ingredients stick (they used to be written back
 * over by the action), and with the Board on, held and escrowed parts count at book: posting costs
 * only the weighted fee and cancelling moves nothing.
 * Opt in with PLAYER_BOARD_INTEGRATION=1.
 */
describe.runIf(process.env.PLAYER_BOARD_INTEGRATION === '1')('parts in rank with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const ON_ID = `classic-og-board-on-${randomUUID().slice(0, 8)}`;
  const on = { ...classicOgV26J, meta: { ...classicOgV26J.meta, id: ON_ID }, playerBoard: { ...classicOgV26J.playerBoard, enabled: true } } as Ruleset;
  const registry = rulesets as Record<string, Ruleset>;
  const rounds: string[] = [];
  const accounts: string[] = [];

  async function fixture(ruleset: Ruleset, parts: Record<string, number>) {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const round = await prisma.round.create({ data: {
      name: 'Parts in rank fixture', slug: `parts-rank-${randomUUID()}`,
      rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date('2099-01-01'),
    } });
    rounds.push(round.id);
    const name = `parts_${randomUUID().slice(0, 6)}`;
    const account = await prisma.account.create({ data: { username: name, usernameNormalized: name, email: `${name}@example.invalid`, passwordHash: 'integration-fixture' } });
    accounts.push(account.id);
    const player = await prisma.roundPlayer.create({ data: { ...ruleset.round.startingPlayer, ...startingStock(ruleset),
      roundId: round.id, accountId: account.id, cityId: city.id, displayName: name, publicPimpId: 7600 + accounts.length,
      scavengedComponents: parts, reputation: { create: ReputationService.seedFor(ruleset) } } });
    return { round, playerId: player.id };
  }

  const stored = (id: string) => prisma.roundPlayer.findUniqueOrThrow({ where: { id }, select: { cashCents: true, netWorthCents: true, scavengedComponents: true, playerBoardEscrow: true } });
  const settledWorth = async (id: string) => { await PlayerStateService.settle(prisma, id); return (await stored(id)).netWorthCents; };

  beforeAll(() => { registry[ON_ID] = on; });
  afterAll(async () => {
    delete registry[ON_ID];
    for (const id of rounds) await prisma.round.delete({ where: { id } });
    await prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await prisma.$disconnect();
  });

  describe('with the Board off', () => {
    it('keeps what a scouting trip finds', async () => {
      const { playerId } = await fixture(classicOgV26J, { RADIO: 1 });
      const result = await ScoutService.scout(prisma, playerId, { district: 'URBAN_GHETTO', turns: 4 } as never);
      const found = (result.result as { componentsFound: Array<{ key: string; quantity: number }> }).componentsFound;
      expect(found.length).toBeGreaterThan(0);
      const expected: Record<string, number> = { RADIO: 1 };
      for (const row of found) expected[row.key] = (expected[row.key] ?? 0) + row.quantity;
      expect((await stored(playerId)).scavengedComponents).toEqual(expected);
    });

    it('uses up workshop ingredients', async () => {
      const { playerId } = await fixture(classicOgV26J, { SCRAP_METAL: 5, WIRING: 3 });
      await prisma.roundPlayer.update({ where: { id: playerId }, data: { hideoutWorkshopLevel: 1, generatorPowered: true, generatorFuel: 50 } });
      await WorkshopService.craft(prisma, playerId, 'AMMO_BUNDLE');
      expect((await stored(playerId)).scavengedComponents).toEqual({ SCRAP_METAL: 3, WIRING: 2 });
    });

    it('leaves rank exactly where held parts never counted', async () => {
      const { playerId } = await fixture(classicOgV26J, {});
      const before = await settledWorth(playerId);
      await prisma.roundPlayer.update({ where: { id: playerId }, data: { scavengedComponents: { SPECIALIST_CIRCUITRY: 3 } } });
      expect(await settledWorth(playerId)).toBe(before);
    });
  });

  describe('with the Board on', () => {
    it('counts held parts at book times quantity', async () => {
      const { playerId } = await fixture(on, {});
      const before = await settledWorth(playerId);
      await prisma.roundPlayer.update({ where: { id: playerId }, data: { scavengedComponents: { SCRAP_METAL: 100, SPECIALIST_CIRCUITRY: 1 } } });
      expect(await settledWorth(playerId)).toBe(before + 40_000n + 250_000n);
    });

    it('stores the rank a scouting trip earns, finds included', async () => {
      const { playerId } = await fixture(on, {});
      await ScoutService.scout(prisma, playerId, { district: 'URBAN_GHETTO', turns: 4 } as never);
      const after = await stored(playerId);
      expect(Object.keys(after.scavengedComponents as object).length).toBeGreaterThan(0);
      expect(await settledWorth(playerId)).toBe(after.netWorthCents);
    });

    it('moves rank by the weighted fee on posting and not at all on cancel', async () => {
      const { round, playerId } = await fixture(on, { SCRAP_METAL: 50 });
      await prisma.roundPlayer.update({ where: { id: playerId }, data: { cashCents: 100_001n } });
      const before = await settledWorth(playerId);

      const { offer, feeCents } = await PlayerBoardService.post(prisma, round, on, playerId, { itemKey: 'SCRAP_METAL', quantity: 30, unitPriceCents: 550, durationHours: 12 });
      const posted = await stored(playerId);
      expect(posted.scavengedComponents).toEqual({ SCRAP_METAL: 20 });
      expect(posted.playerBoardEscrow).toEqual({ SCRAP_METAL: 30 });
      const weighted = (cash: bigint) => (cash * 75n) / 100n;
      expect(await settledWorth(playerId)).toBe(before - (weighted(100_001n) - weighted(100_001n - BigInt(feeCents))));

      const afterPost = await settledWorth(playerId);
      await PlayerBoardService.cancel(prisma, round, playerId, offer.id);
      const cancelled = await stored(playerId);
      expect(cancelled.scavengedComponents).toEqual({ SCRAP_METAL: 50 });
      expect(cancelled.playerBoardEscrow).toEqual({});
      expect(await settledWorth(playerId)).toBe(afterPost);
    });

    it('keeps rank still when a listing expires', async () => {
      const { round, playerId } = await fixture(on, { RADIO: 3 });
      const t0 = new Date();
      await PlayerBoardService.post(prisma, round, on, playerId, { itemKey: 'RADIO', quantity: 3, unitPriceCents: 3_400, durationHours: 12 }, t0);
      const afterPost = await settledWorth(playerId);
      await PlayerBoardService.expireDue(prisma, round, new Date(t0.getTime() + 12 * 3_600_000));
      expect((await stored(playerId)).playerBoardEscrow).toEqual({});
      expect(await settledWorth(playerId)).toBe(afterPost);
    });
  });
});
