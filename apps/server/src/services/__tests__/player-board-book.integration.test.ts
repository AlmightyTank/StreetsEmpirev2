import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { classicOgV26J } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { PlayerBoardService, type BoardRound } from '../player-board.service.js';
import { ReputationService } from '../reputation.service.js';

/**
 * The Board D read model, live: the book is hidden while the flag is off, an empty book is
 * empty, offers group by item in catalog order and sort cheapest first, expired offers never
 * show, and the viewer's own offers and listable parts come with it.
 * Opt in with PLAYER_BOARD_INTEGRATION=1.
 */
describe.runIf(process.env.PLAYER_BOARD_INTEGRATION === '1')('The Board book with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const closed = classicOgV26J;
  const rules = { ...closed, playerBoard: { ...closed.playerBoard, enabled: true } };
  const t0 = new Date('2030-01-01T12:00:00Z');
  const HOUR = 3_600_000;
  let round: BoardRound;
  const accounts: string[] = [];
  const players: Record<'ace' | 'bo' | 'cy', { id: string; name: string }> = {} as never;

  beforeAll(async () => {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    round = await prisma.round.create({ data: {
      name: 'Board book fixture', slug: `board-book-${randomUUID()}`,
      rulesetId: closed.meta.id, rulesetVersion: closed.meta.version, status: 'ACTIVE',
      startsAt: new Date('2000-01-01'), endsAt: new Date('2099-01-01'),
    } });
    for (const [index, key] of (['ace', 'bo', 'cy'] as const).entries()) {
      const name = `${key}_${randomUUID().slice(0, 6)}`;
      const account = await prisma.account.create({ data: { username: name, usernameNormalized: name, email: `${name}@example.invalid`, passwordHash: 'integration-fixture' } });
      accounts.push(account.id);
      const player = await prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId: round.id, accountId: account.id, cityId: city.id, displayName: name, publicPimpId: 7700 + index,
        reputation: { create: ReputationService.seedFor(rules) } } });
      players[key] = { id: player.id, name };
    }
  });

  afterAll(async () => {
    if (round?.id) await prisma.round.delete({ where: { id: round.id } });
    await prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.playerBoardOffer.deleteMany({ where: { roundId: round.id } });
    for (const { id } of Object.values(players)) {
      await prisma.roundPlayer.update({ where: { id }, data: {
        cashCents: 100_000n, playerBoardEscrow: {},
        scavengedComponents: { SCRAP_METAL: 40, RADIO: 4, SPECIALIST_CIRCUITRY: 1 },
      } });
    }
  });

  const post = (who: keyof typeof players, itemKey: string, quantity: number, unitPriceCents: number, durationHours = 48, now = t0) =>
    PlayerBoardService.post(prisma, round, rules, players[who].id, { itemKey, quantity, unitPriceCents, durationHours }, now);

  it('is hidden while the ruleset keeps the Board off', async () => {
    await expect(PlayerBoardService.book(prisma, round, closed, players.ace.id, 'ALL', t0)).rejects.toMatchObject({ code: 'BOARD_CLOSED' });
  });

  it('shows an empty book as empty, with the viewer\'s listable parts and the rules', async () => {
    const book = await PlayerBoardService.book(prisma, round, rules, players.ace.id, 'ALL', t0);
    expect(book.rows).toEqual([]);
    expect(book.mine).toEqual([]);
    expect(book.openOffers).toBe(0);
    expect(book.rules).toEqual({ maxOpenOffers: 6, listingHours: [12, 48], postingFeePercent: 1, postingFeeMinCents: 100, taxPercent: 8 });
    expect(book.listable.map((row) => [row.key, row.held, row.floorCents, row.capCents])).toEqual([
      ['SCRAP_METAL', 40, 534, 579],
      ['RADIO', 4, 3_334, 3_623],
      ['SPECIALIST_CIRCUITRY', 1, 333_334, 362_318],
    ]);
  });

  it('groups by item in catalog order and sorts each item cheapest first, oldest first on a tie', async () => {
    await post('bo', 'RADIO', 2, 3_500);
    await post('ace', 'SCRAP_METAL', 10, 579);
    await post('cy', 'SCRAP_METAL', 5, 534, 12, new Date(t0.getTime() + 1_000));
    await post('bo', 'SCRAP_METAL', 3, 534);
    await post('cy', 'RADIO', 1, 3_334);

    const book = await PlayerBoardService.book(prisma, round, rules, players.ace.id, 'ALL', new Date(t0.getTime() + 2_000));
    expect(book.rows.map((row) => [row.itemKey, row.unitPriceCents, row.sellerName])).toEqual([
      ['SCRAP_METAL', 534, players.bo.name],
      ['SCRAP_METAL', 534, players.cy.name],
      ['SCRAP_METAL', 579, players.ace.name],
      ['RADIO', 3_334, players.cy.name],
      ['RADIO', 3_500, players.bo.name],
    ]);
    expect(book.rows.find((row) => row.sellerName === players.ace.name)).toMatchObject({ mine: true, quantity: 10, totalCents: 5_790, rarity: 'COMMON', category: 'PART' });
    expect(book.rows.filter((row) => row.mine)).toHaveLength(1);
    expect(book.mine).toHaveLength(1);
    expect(book.openOffers).toBe(1);
    expect(book.listable.find((row) => row.key === 'SCRAP_METAL')?.held).toBe(30);

    const parts = await PlayerBoardService.book(prisma, round, rules, players.ace.id, 'PARTS', new Date(t0.getTime() + 2_000));
    expect(parts.filter).toBe('PARTS');
    expect(parts.rows).toEqual(book.rows);
  });

  it('drops an offer the moment it expires, and hands the stack back on the read', async () => {
    await post('bo', 'SCRAP_METAL', 6, 550, 12);
    await post('cy', 'SCRAP_METAL', 6, 560, 48);
    const at = new Date(t0.getTime() + 12 * HOUR);
    const book = await PlayerBoardService.book(prisma, round, rules, players.ace.id, 'ALL', at);
    expect(book.rows.map((row) => row.sellerName)).toEqual([players.cy.name]);
    const bo = await prisma.roundPlayer.findUniqueOrThrow({ where: { id: players.bo.id }, select: { scavengedComponents: true, playerBoardEscrow: true } });
    expect(bo).toEqual({ scavengedComponents: { SCRAP_METAL: 40, RADIO: 4, SPECIALIST_CIRCUITRY: 1 }, playerBoardEscrow: {} });
  });
});
