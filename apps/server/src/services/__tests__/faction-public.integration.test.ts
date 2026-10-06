import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV14E, classicOgV14F, type FactionKey, type Ruleset } from '@streets/rulesets';
import { startingStock } from '@streets/rules-engine';
import { CommunityService } from '../community.service.js';
import { claimFactions } from '../discord-bot.service.js';
import { FactionService } from '../faction.service.js';
import { ReputationService } from '../reputation.service.js';
import { SeasonStatsService } from '../season-stats.service.js';
import { seasonFeatAwards } from '../season-feats.js';

const ruleset = classicOgV14F;
const { connected, innerCircle } = ruleset.factionStanding.tiers;

/**
 * 1.4.0-F gate, live: tier cosmetics are awarded once per account; profiles show tiers from
 * Connected up and never points; the faction feats read the season; reaching Inner Circle is
 * posted to the street feed once, and never on a 1.4.0-E round. Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.4.0-F faction rewards and public flavor with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(rules: Ruleset = ruleset) {
    const round = await app.prisma.round.create({
      data: {
        name: 'Public F fixture', slug: 'public-f-' + randomUUID(),
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
        status: 'ACTIVE', startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 14 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer, ...startingStock(rules),
        roundId: round.id, accountId, cityId: city.id,
        displayName: 'public_' + randomUUID().slice(0, 6), publicPimpId: 9700 + roundIds.length,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    return { round, player };
  }

  const grant = (playerId: string, factionKey: FactionKey, amount: number, rules: Ruleset = ruleset) =>
    FactionService.grant(app.prisma, playerId, rules, factionKey, amount, 'JOB', `test:${randomUUID()}`);

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'public_' + randomUUID().slice(0, 6);
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: name + '@example.invalid', password: randomUUID() } });
    accountId = registered.json().account.id;
  });

  afterAll(async () => {
    for (const id of roundIds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  it('awards a faction\'s title and accent at Connected and its frame at Inner Circle, once per account', async () => {
    const { player } = await fixture();
    await grant(player.id, 'CARTEL_LINE', connected - 1);
    expect(await app.prisma.accountCosmeticUnlock.count({ where: { accountId, key: { startsWith: 'cartel-' } } })).toBe(0);
    const reached = await grant(player.id, 'CARTEL_LINE', 1);
    expect(reached?.tier).toBe('CONNECTED');
    expect((await app.prisma.accountCosmeticUnlock.findMany({ where: { accountId, key: { startsWith: 'cartel-' } } })).map((row) => row.key).sort())
      .toEqual(['cartel-jade', 'cartel-partner']);
    const tierUp = await app.prisma.playerActivity.findFirstOrThrow({ where: { roundPlayerId: player.id, type: 'FACTION_TIER_UP', payload: { path: ['tier'], equals: 'CONNECTED' } } });
    expect(tierUp.payload).toMatchObject({ cosmetics: ['Line Partner', 'Cartel Jade'] });

    // A jump straight past Connected to Inner Circle awards both tiers' cosmetics.
    await grant(player.id, 'KINGS', innerCircle);
    expect((await app.prisma.accountCosmeticUnlock.findMany({ where: { accountId, key: { startsWith: 'kings-' } } })).map((row) => row.key).sort())
      .toEqual(['kings-crown-frame', 'kings-friend', 'kings-gold']);

    // A second season reaching the same tier finds them owned already.
    const next = await fixture();
    await grant(next.player.id, 'CARTEL_LINE', connected);
    expect(await app.prisma.accountCosmeticUnlock.count({ where: { accountId, key: { startsWith: 'cartel-' } } })).toBe(2);
  });

  it('shows tiers from Connected up on the profile, highest first, and never points', async () => {
    const { round, player } = await fixture();
    await grant(player.id, 'OUTFIT', innerCircle);
    await grant(player.id, 'ROAD_SAINTS', connected);
    await grant(player.id, 'CARTEL_LINE', connected - 1);
    const profile = await CommunityService.profile(app.prisma, round.id, player.publicPimpId, 0, ruleset);
    expect(profile.factionAlignment).toEqual([
      { key: 'OUTFIT', name: 'The Outfit', tierName: 'Inner Circle' },
      { key: 'ROAD_SAINTS', name: 'Road Saints MC', tierName: 'Connected' },
    ]);
    expect(JSON.stringify(profile.factionAlignment)).not.toMatch(/points|\d{2,}/);

    const e = await fixture(classicOgV14E);
    await grant(e.player.id, 'OUTFIT', innerCircle, classicOgV14E);
    expect((await CommunityService.profile(app.prisma, e.round.id, e.player.publicPimpId, 0, classicOgV14E)).factionAlignment).toBeUndefined();
  });

  it('counts Connected and Inner Circle factions toward the faction feats', async () => {
    const { round, player } = await fixture();
    await grant(player.id, 'KINGS', innerCircle);
    await grant(player.id, 'ROAD_SAINTS', connected);
    await grant(player.id, 'CARTEL_LINE', connected);
    const totals = (await SeasonStatsService.totals(app.prisma, [{ id: player.id, whores: 0, thugs: 0, peakCrew: 0, round: { endsAt: round.endsAt, rulesetId: round.rulesetId, rulesetVersion: round.rulesetVersion } }])).get(player.id)!;
    expect(totals).toMatchObject({ factionsConnected: 3, factionsInnerCircle: 1 });
    const awards = seasonFeatAwards({ name: round.name, totals }, []);
    expect(awards.find((award) => award.key === 'faction-many-friends')?.unlocked).toBe(true);
    expect(awards.find((award) => award.key === 'faction-inner-circle')?.unlocked).toBe(true);
    expect(awards.find((award) => award.key === 'faction-two-crowns')).toMatchObject({ unlocked: false, progress: { current: 1, target: 2 } });
  });

  it('posts Inner Circle to the street feed once, and never for a 1.4.0-E round', async () => {
    const f = await fixture();
    const e = await fixture(classicOgV14E);
    await grant(f.player.id, 'CIVIC_HANDSHAKE', innerCircle);
    await grant(e.player.id, 'CIVIC_HANDSHAKE', innerCircle, classicOgV14E);
    const first = [...await claimFactions(app.prisma, new Date(), 500), ...await claimFactions(app.prisma, new Date(), 500)];
    const mine = first.filter((event) => event.publicPimpId === f.player.publicPimpId || event.publicPimpId === e.player.publicPimpId);
    expect(mine).toEqual([expect.objectContaining({ publicPimpId: f.player.publicPimpId, factionName: 'Civic Handshake', tierName: 'Inner Circle', roundName: f.round.name })]);
    expect(await app.prisma.playerFactionStanding.count({ where: { roundPlayerId: { in: [f.player.id, e.player.id] }, innerCircleAt: { not: null }, innerCirclePostedAt: null } })).toBe(0);
  });
});
