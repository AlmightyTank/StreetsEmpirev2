import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { classicOgV26JBoard, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { AdminPlayerBoardService } from '../admin-player-board.service.js';
import { PlayerBoardService, type BoardRound } from '../player-board.service.js';
import { ReputationService } from '../reputation.service.js';

/**
 * The Board H, live: the staff ledger lists every post, fill, cancel and expiry with the cash that
 * moved and the cash deleted, and flags a seller whose escrow does not match their offers.
 * Opt in with PLAYER_BOARD_INTEGRATION=1.
 */
describe.runIf(process.env.PLAYER_BOARD_INTEGRATION === '1')('The Board staff ledger with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const rules: Ruleset = classicOgV26JBoard;
  const accounts: string[] = [];
  let round: BoardRound;
  const ids = { seller: '', buyer: '' };

  beforeAll(async () => {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    round = await prisma.round.create({ data: {
      name: 'Board ledger fixture', slug: `board-ledger-${randomUUID()}`, rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
      status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date('2099-01-01'),
    } });
    for (const [index, key] of (['seller', 'buyer'] as const).entries()) {
      const name = `ledger_${randomUUID().slice(0, 6)}`;
      const account = await prisma.account.create({ data: { username: name, usernameNormalized: name, email: `${name}@example.invalid`, passwordHash: 'integration-fixture' } });
      accounts.push(account.id);
      ids[key] = (await prisma.roundPlayer.create({ data: { ...rules.round.startingPlayer, ...startingStock(rules),
        roundId: round.id, accountId: account.id, cityId: city.id, displayName: name, publicPimpId: 8200 + index,
        cashCents: 100_001n, scavengedComponents: { SCRAP_METAL: 50, RADIO: 3 },
        reputation: { create: ReputationService.seedFor(rules) } } })).id;
    }
  });

  afterAll(async () => {
    if (round?.id) await prisma.round.delete({ where: { id: round.id } });
    await prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await prisma.$disconnect();
  });

  it('lists posts, fills, cancels and expiries, and adds up the cash', async () => {
    const t0 = new Date();
    const sold = await PlayerBoardService.post(prisma, round, rules, ids.seller, { itemKey: 'SCRAP_METAL', quantity: 10, unitPriceCents: 550, durationHours: 12 }, t0);
    const cancelled = await PlayerBoardService.post(prisma, round, rules, ids.seller, { itemKey: 'RADIO', quantity: 2, unitPriceCents: 3_400, durationHours: 12 }, t0);
    const expiring = await PlayerBoardService.post(prisma, round, rules, ids.seller, { itemKey: 'SCRAP_METAL', quantity: 5, unitPriceCents: 560, durationHours: 12 }, t0);
    const receipt = await PlayerBoardService.fill(prisma, round, rules, ids.buyer, sold.offer.id, undefined, t0, 3);
    await PlayerBoardService.cancel(prisma, round, ids.seller, cancelled.offer.id, t0);
    const later = new Date(t0.getTime() + 13 * 3_600_000);
    await PlayerBoardService.expireDue(prisma, round, later);

    const report = await AdminPlayerBoardService.report(prisma, round.id, 24, later);
    expect(report.enabled).toBe(true);
    expect(report.totals).toMatchObject({ posts: 3, fills: 1, cancels: 1, unitsSold: 3, paidCents: receipt.paidCents });
    // The rest of the sold offer expired along with the third.
    expect(report.totals.expiries).toBe(2);
    expect(report.totals.openOffers).toBe(0);
    const fillRow = report.events.find((row) => row.kind === 'FILL')!;
    expect(fillRow).toMatchObject({ offerId: sold.offer.id, quantity: 3, item: 'Scrap metal', paidCents: 1_650 });
    expect(fillRow.buyer?.id).toBe(ids.buyer);
    expect(fillRow.deletedCents).toBe(fillRow.paidCents - fillRow.proceedsCents);
    const fees = [sold, cancelled, expiring].reduce((sum, { offer }) => sum + offer.feeCents + offer.listingTaxCents, 0);
    expect(report.totals.deletedCents).toBe(fees + fillRow.deletedCents);
    expect(report.events.map((row) => row.at)).toEqual([...report.events.map((row) => row.at)].sort().reverse());
    expect(report.problems).toEqual([]);
  });

  it('flags escrow that does not match the open offers', async () => {
    await PlayerBoardService.post(prisma, round, rules, ids.seller, { itemKey: 'SCRAP_METAL', quantity: 4, unitPriceCents: 550, durationHours: 48 });
    await prisma.roundPlayer.update({ where: { id: ids.seller }, data: { playerBoardEscrow: { SCRAP_METAL: 7 } } });
    const report = await AdminPlayerBoardService.report(prisma, round.id);
    expect(report.problems).toEqual([expect.objectContaining({ itemKey: 'SCRAP_METAL', escrow: 7, offers: 4 })]);
    expect(report.problems[0]!.player.id).toBe(ids.seller);
  });
});
