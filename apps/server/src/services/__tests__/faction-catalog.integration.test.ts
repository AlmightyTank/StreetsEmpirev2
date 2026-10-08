import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV13G, classicOgV14A, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { ReputationService } from '../reputation.service.js';

/**
 * 1.4.0-A gate, live: the Jobs page names each contact's faction (or why they are
 * independent), each Job's faction, and the round's factions with their faces and rivals.
 * 1.3 rounds show no factions. Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.4.0-A faction catalog with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(ruleset: Ruleset) {
    const round = await app.prisma.round.create({
      data: {
        name: 'Factions A fixture', slug: 'factions-a-' + randomUUID(),
        rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version,
        status: 'ACTIVE', startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: ruleset.round.startingCitySlug } });
    return app.prisma.roundPlayer.create({
      data: {
        ...ruleset.round.startingPlayer, ...startingStock(ruleset),
        roundId: round.id, accountId, cityId: city.id,
        displayName: 'faction_' + randomUUID().slice(0, 6), publicPimpId: 9900 + roundIds.length,
        reputation: { create: ReputationService.seedFor(ruleset) },
      },
    });
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'factions_' + randomUUID().slice(0, 6);
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

  it('shows the factions, who works for them, and their rivals', async () => {
    const player = await fixture(classicOgV14A);
    const page = await HandcraftedQuestService.page(app.prisma, player.id, classicOgV14A);

    expect(page.factions?.map((faction) => [faction.key, faction.faces.map((face) => face.name), faction.rivals.map((rival) => rival.key)])).toEqual([
      ['KINGS', ['Mama King', 'Blocks'], ['OUTFIT']],
      ['OUTFIT', ['Tommy'], ['KINGS']],
      ['ROAD_SAINTS', ['Wheels'], ['CIVIC_HANDSHAKE']],
      ['CARTEL_LINE', ['Pip'], ['CIVIC_HANDSHAKE']],
      ['CIVIC_HANDSHAKE', [], ['ROAD_SAINTS', 'CARTEL_LINE']],
    ]);
    expect(page.factions?.find((faction) => faction.key === 'CIVIC_HANDSHAKE')?.facesNote).toMatch(/payroll/);

    const contact = (key: string) => page.contacts.find((row) => row.key === key)!;
    expect(contact('TOMMY')).toMatchObject({ faction: { key: 'OUTFIT', name: 'The Outfit' }, independent: null });
    expect(contact('VIC')).toMatchObject({ faction: null, independent: expect.stringMatching(/broker/) });
    expect(contact('LEDGER')).toMatchObject({ faction: null });
    // The DTO carries the faction as an object, not the raw ruleset fields.
    expect(contact('TOMMY')).not.toHaveProperty('factionKey');

    const job = (key: string) => page.quests.find((row) => row.key === key);
    expect(job('LEDGER_OPEN_FILE')?.factionName).toBeNull();
    const kingsJob = page.quests.find((row) => row.contactKey === 'MAMA_KING');
    expect(kingsJob?.factionName).toBe('The Kings');
  });

  it('shows no factions on a 1.3 round, and Jobs work the same', async () => {
    const player = await fixture(classicOgV13G);
    const page = await HandcraftedQuestService.page(app.prisma, player.id, classicOgV13G);
    expect(page.factions).toBeNull();
    expect(page.contacts.every((contact) => contact.faction === null && contact.independent === null)).toBe(true);
    expect(page.quests.every((quest) => quest.factionName === null)).toBe(true);

    const pinned = await fixture(classicOgV14A);
    const factionPage = await HandcraftedQuestService.page(app.prisma, pinned.id, classicOgV14A);
    // One-time Jobs only: the rotating boards are seeded per player, so two players differ there.
    const shape = (rows: typeof page.quests) => rows
      .filter((row) => row.type === 'STORY' || row.type === 'SIDE')
      .map((row) => JSON.stringify([row.key, row.status, row.rewards])).sort();
    expect(shape(page.quests).length).toBeGreaterThan(10);
    expect(shape(factionPage.quests)).toEqual(shape(page.quests));
  });
});
