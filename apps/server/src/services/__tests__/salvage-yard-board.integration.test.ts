import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { classicOgV26J, classicOgV26JBoard, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { SalvageYardService } from '../salvage-yard.service.js';

/**
 * The Salvage Yard on a round with the Board on: barters carry their cash top-up and no trade
 * raises rank. The same trade on a round without the Board costs what it always has.
 * Opt in with PLAYER_BOARD_INTEGRATION=1.
 */
describe.runIf(process.env.PLAYER_BOARD_INTEGRATION === '1')('Salvage Yard on Board rounds with PostgreSQL', () => {
  const prisma = new PrismaClient();
  const rounds: string[] = [];
  const accounts: string[] = [];

  async function playerOn(ruleset: Ruleset, index: number): Promise<string> {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    const round = await prisma.round.create({ data: {
      name: 'Yard fixture', slug: `yard-${randomUUID()}`, rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
      status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date('2099-01-01'),
    } });
    rounds.push(round.id);
    const name = `yard_${randomUUID().slice(0, 6)}`;
    const account = await prisma.account.create({ data: { username: name, usernameNormalized: name, email: `${name}@example.invalid`, passwordHash: 'integration-fixture' } });
    accounts.push(account.id);
    return (await prisma.roundPlayer.create({ data: { ...ruleset.round.startingPlayer, ...startingStock(ruleset),
      roundId: round.id, accountId: account.id, cityId: city.id, displayName: name, publicPimpId: 7950 + index,
      cashCents: 1_000_001n, beer: 100, scavengedComponents: { SCRAP_METAL: 20, TOOL_KIT: 5 },
      reputation: { create: ReputationService.seedFor(ruleset) } } })).id;
  }
  const row = (id: string) => prisma.roundPlayer.findUniqueOrThrow({ where: { id }, select: { cashCents: true, beer: true, scavengedComponents: true, netWorthCents: true } });
  const worth = async (id: string) => { await PlayerStateService.settle(prisma, id); return (await row(id)).netWorthCents; };

  let board = '';
  let dark = '';
  beforeAll(async () => {
    board = await playerOn(classicOgV26JBoard, 1);
    dark = await playerOn(classicOgV26J, 2);
  });
  afterAll(async () => {
    for (const id of rounds) await prisma.round.delete({ where: { id } });
    await prisma.account.deleteMany({ where: { id: { in: accounts } } });
    await prisma.$disconnect();
  });

  it('charges the top-up on a Board round, and rank does not rise', async () => {
    const page = await SalvageYardService.page(prisma, board, classicOgV26JBoard);
    expect(page.offers.find((offer) => offer.key === 'MOTOR_ASSEMBLY')?.price).toMatchObject({ kind: 'BARTER', cashCents: 7_500 });
    const before = await worth(board);
    const result = await SalvageYardService.trade(prisma, board, 'MOTOR_ASSEMBLY', 2, new Date(), classicOgV26JBoard);
    expect(result.spentCents).toBe(15_000);
    expect(await row(board)).toMatchObject({ cashCents: 1_000_001n - 15_000n, beer: 60, scavengedComponents: { SCRAP_METAL: 12, TOOL_KIT: 3, MOTOR_ASSEMBLY: 2 } });
    expect(await worth(board)).toBeLessThanOrEqual(before);
    const ledger = await prisma.economyLedgerEntry.findMany({ where: { roundPlayerId: board, source: 'SALVAGE_YARD' } });
    expect(ledger.map((entry) => entry.amountCents)).toEqual([-15_000n]);
  });

  it('refuses a barter the player cannot top up, and takes nothing', async () => {
    await prisma.roundPlayer.update({ where: { id: board }, data: { cashCents: 7_499n } });
    await expect(SalvageYardService.trade(prisma, board, 'MOTOR_ASSEMBLY', 1, new Date(), classicOgV26JBoard)).rejects.toMatchObject({ code: 'NOT_ENOUGH_CASH' });
    expect(await row(board)).toMatchObject({ cashCents: 7_499n, beer: 60, scavengedComponents: { SCRAP_METAL: 12, TOOL_KIT: 3, MOTOR_ASSEMBLY: 2 } });
  });

  it('trades as before on a round without the Board', async () => {
    const page = await SalvageYardService.page(prisma, dark, classicOgV26J);
    expect(page.offers.find((offer) => offer.key === 'MOTOR_ASSEMBLY')?.price).not.toHaveProperty('cashCents');
    const result = await SalvageYardService.trade(prisma, dark, 'MOTOR_ASSEMBLY', 1, new Date(), classicOgV26J);
    expect(result.spentCents).toBe(0);
    expect((await row(dark)).cashCents).toBe(1_000_001n);
  });
});
