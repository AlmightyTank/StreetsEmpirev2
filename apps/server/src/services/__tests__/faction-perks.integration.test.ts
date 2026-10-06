import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { classicOgV14C2, classicOgV14D, type FactionKey, type Ruleset } from '@streets/rulesets';
import { cornerUpkeep, cutCityBuyCents, liveCounter, startingStock } from '@streets/rules-engine';
import { BELL_CATEGORIES, bellMutedActivityTypes } from '@streets/shared';
import { FactionService } from '../faction.service.js';
import { FactionWarningService } from '../faction-warning.service.js';
import { factionWarnings } from '../game-alerts.service.js';
import { HandcraftedQuestService } from '../handcrafted-quest.service.js';
import { LawOfficialService } from '../law-official.service.js';
import { LawService } from '../law.service.js';
import { ReputationService } from '../reputation.service.js';
import { StoreService } from '../store.service.js';
import { TurfService } from '../turf.service.js';
import { TravelService } from '../travel.service.js';
import { BossTripService } from '../boss-trip.service.js';

const ruleset = classicOgV14D;
const HOUR = 3_600_000;

/**
 * 1.4.0-D gate, live: each perk level opens at its tier and not before, every Connected nudge
 * takes its pinned percent where it applies and logs once on the act, and 1.4.0-C2 rounds have
 * no perks. Opt in with TURF_INTEGRATION=1.
 */
describe.runIf(process.env.TURF_INTEGRATION === '1')('1.4.0-D faction perks with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  const roundIds: string[] = [];

  async function fixture(rules: Ruleset = ruleset, extra: Record<string, unknown> = {}) {
    const round = await app.prisma.round.create({
      data: {
        name: 'Perks D fixture', slug: 'perks-d-' + randomUUID(),
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version,
        status: 'ACTIVE', startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() + 14 * 86_400_000),
      },
    });
    roundIds.push(round.id);
    const city = await app.prisma.city.findUniqueOrThrow({ where: { slug: rules.round.startingCitySlug } });
    const player = await app.prisma.roundPlayer.create({
      data: {
        ...rules.round.startingPlayer, ...startingStock(rules), ...extra,
        roundId: round.id, accountId, cityId: city.id,
        displayName: 'perk_' + randomUUID().slice(0, 6), publicPimpId: 9900 + roundIds.length,
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
    return { round, city, player };
  }

  async function standWith(playerId: string, factionKey: FactionKey, points: number) {
    await FactionService.grant(app.prisma, playerId, ruleset, factionKey, points, 'JOB', `test:${randomUUID()}`);
  }

  beforeAll(async () => {
    const { buildApp } = await import('../../app.js');
    app = await buildApp();
    const name = 'perk_' + randomUUID().slice(0, 6);
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

  it('opens information at Known, warnings at Trusted and the nudge at Connected', async () => {
    const { player } = await fixture();
    const read = async () => {
      const page = await HandcraftedQuestService.page(app.prisma, player.id, ruleset);
      return page.factions!.find((faction) => faction.key === 'CARTEL_LINE')!.perks!;
    };
    let perks = await read();
    expect([perks.information.open, perks.warnings.open, perks.nudge?.open]).toEqual([false, false, false]);
    expect(perks.information.lines).toEqual([]);
    expect(perks.nudge).toMatchObject({ tierName: 'Connected', percent: 5, title: "Pip's product costs 5% less" });

    await standWith(player.id, 'CARTEL_LINE', ruleset.factionStanding.tiers.known);
    perks = await read();
    expect([perks.information.open, perks.warnings.open, perks.nudge?.open]).toEqual([true, false, false]);
    expect(perks.information.lines.length).toBeGreaterThan(0);
    expect(perks.warnings.lines).toEqual([]);

    await standWith(player.id, 'CARTEL_LINE', ruleset.factionStanding.tiers.connected);
    perks = await read();
    expect([perks.information.open, perks.warnings.open, perks.nudge?.open]).toEqual([true, true, true]);
  });

  it('cuts Tommy\'s guns for the Outfit at Connected, never his thugs, and logs it once', async () => {
    const { player } = await fixture();
    const before = await StoreService.trade(app.prisma, player.id, { store: 'TOMMY', item: 'PISTOL', direction: 'buy', quantity: 2, actionId: randomUUID() });
    expect(before.result.unitCents).toBe(ruleset.stores.TOMMY.items.PISTOL.buyCents);
    expect(before.result.factionDiscount).toBeUndefined();

    await standWith(player.id, 'OUTFIT', ruleset.factionStanding.tiers.connected);
    const actionId = randomUUID();
    const bought = await StoreService.trade(app.prisma, player.id, { store: 'TOMMY', item: 'PISTOL', direction: 'buy', quantity: 2, actionId });
    expect(bought.result.unitCents).toBe(ruleset.stores.TOMMY.items.PISTOL.buyCents * 0.95);
    expect(bought.result.factionDiscount).toMatchObject({ factionKey: 'OUTFIT', percent: 5, savedCents: ruleset.stores.TOMMY.items.PISTOL.buyCents * 0.05 * 2 });
    await StoreService.trade(app.prisma, player.id, { store: 'TOMMY', item: 'PISTOL', direction: 'buy', quantity: 2, actionId });

    const thug = await StoreService.trade(app.prisma, player.id, { store: 'TOMMY', item: 'THUG', direction: 'buy', quantity: 1, actionId: randomUUID() });
    expect(thug.result.factionDiscount).toBeUndefined();

    const uses = await app.prisma.playerFactionPerkUse.findMany({ where: { roundPlayerId: player.id } });
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ factionKey: 'OUTFIT', kind: 'TOMMY_WEAPONS', percent: 5, saved: { cents: 500 } });
  });

  it('cuts Pip\'s product for the Cartel Line at Connected', async () => {
    const { player } = await fixture();
    await standWith(player.id, 'CARTEL_LINE', ruleset.factionStanding.tiers.connected);
    const bought = await StoreService.trade(app.prisma, player.id, { store: 'PIP', item: 'CRACK', direction: 'buy', quantity: 10, actionId: randomUUID() });
    expect(bought.result.factionDiscount).toMatchObject({ factionKey: 'CARTEL_LINE', percent: 5 });
    expect(bought.result.unitCents).toBeLessThan(ruleset.stores.PIP.items.CRACK.buyCents);
    expect(await app.prisma.playerFactionPerkUse.count({ where: { roundPlayerId: player.id, kind: 'PIP_PRODUCT' } })).toBe(1);
  });

  it('cuts Pip\'s price in other cities on a run for the Cartel Line, and logs it once', async () => {
    const { round, player } = await fixture(ruleset, { lowRiders: 2, cashCents: 50_000_000n, turns: 144, heat: 0, lastTurnCalculationAt: new Date() });
    await standWith(player.id, 'CARTEL_LINE', ruleset.factionStanding.tiers.connected);
    const launched = await TravelService.launch(app.prisma, player.id, { to: 'detroit', route: 0, lowRiders: 2, escortThugs: 0, cashCents: 20_000_000, cargo: {}, actionId: randomUUID() });
    expect(launched.success).toBe(true);
    // Drive it into Detroit.
    const run = await app.prisma.run.findFirstOrThrow({ where: { roundPlayerId: player.id, status: 'ACTIVE' }, include: { stops: true } });
    const back = run.stops[0]!.arriveAt.getTime() - Date.now() + 60_000;
    for (const stop of run.stops) {
      await app.prisma.runStop.update({ where: { id: stop.id }, data: {
        departAt: new Date(stop.departAt.getTime() - back), arriveAt: new Date(stop.arriveAt.getTime() - back),
        leaveAt: stop.leaveAt ? new Date(stop.leaveAt.getTime() - back) : null,
      } });
    }
    const now = new Date();
    const product = Object.keys(ruleset.products).find((key) => liveCounter(ruleset, round.id, 'detroit', key, now)?.supply !== 'OUT' && liveCounter(ruleset, round.id, 'detroit', key, now))!;
    const counter = liveCounter(ruleset, round.id, 'detroit', product, now)!;
    const actionId = randomUUID();
    const traded = await TravelService.trade(app.prisma, player.id, { runId: run.id, product, direction: 'buy', venue: 'pip', quantity: 5, actionId }, () => 0.99);
    expect(traded.result.unitCents).toBe(cutCityBuyCents(counter, 5));
    expect(traded.result.unitCents).toBeLessThan(counter.buyCents);
    expect(traded.result.factionDiscount).toMatchObject({ factionKey: 'CARTEL_LINE', percent: 5, savedCents: (counter.buyCents - traded.result.unitCents) * 5 });
    await TravelService.trade(app.prisma, player.id, { runId: run.id, product, direction: 'buy', venue: 'pip', quantity: 5, actionId }, () => 0.99);
    expect(await app.prisma.playerFactionPerkUse.count({ where: { roundPlayerId: player.id, kind: 'PIP_PRODUCT' } })).toBe(1);
  });

  it('cuts bodyguard tickets for Road Saints on a real launch, never the boss\'s own', async () => {
    const extra = { thugs: 40, cashCents: 80_000_000n, turns: 144, heat: 0, lastTurnCalculationAt: new Date() };
    const plain = await fixture(ruleset, extra);
    const connected = await fixture(ruleset, extra);
    await standWith(connected.player.id, 'ROAD_SAINTS', ruleset.factionStanding.tiers.connected);
    const trips = ruleset.travel.trips!;
    const fly = (playerId: string, bodyguards: number) => BossTripService.launch(app.prisma, playerId, { to: 'las-vegas', stayMinutes: trips.stayMinutes[0]!, bankrollCents: 0, bodyguards, actionId: randomUUID() });
    const full = await fly(plain.player.id, 3);
    const cut = await fly(connected.player.id, 3);
    const perGuard = trips.bodyguards!.ticketCents;
    expect(full.result.ticketCents - cut.result.ticketCents).toBe(3 * Math.floor(perGuard / 10));
    expect(await app.prisma.playerFactionPerkUse.findMany({ where: { roundPlayerId: connected.player.id } })).toMatchObject([
      { kind: 'BODYGUARD_TICKETS', factionKey: 'ROAD_SAINTS', percent: 10, saved: { cents: 3 * Math.floor(perGuard / 10) } },
    ]);
    const page = await BossTripService.page(app.prisma, await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: connected.player.id }, include: { city: true } }), ruleset, connected.round.endsAt, new Date());
    expect(page?.rules.bodyguards?.factionDiscount).toMatchObject({ percent: 10, fullTicketCents: perGuard });
  });

  it('takes Civic Handshake\'s cut off each official favor\'s exposure', async () => {
    const { player, city } = await fixture();
    const now = new Date();
    const hire = { roundPlayerId: player.id, cityId: city.id, hiredAt: now, paidUntil: new Date(now.getTime() + 7 * 24 * HOUR) };
    const plain = await app.prisma.playerOfficial.create({ data: { ...hire, role: 'CAPTAIN' } });
    await LawOfficialService.favor(app.prisma, ruleset, plain, 'captainWindow', now);
    expect((await app.prisma.playerOfficial.findUniqueOrThrow({ where: { id: plain.id } })).exposure).toBe(10);

    await standWith(player.id, 'CIVIC_HANDSHAKE', ruleset.factionStanding.tiers.connected);
    const judge = await app.prisma.playerOfficial.create({ data: { ...hire, role: 'JUDGE' } });
    await LawOfficialService.favor(app.prisma, ruleset, judge, 'judgeServe', now);
    expect((await app.prisma.playerOfficial.findUniqueOrThrow({ where: { id: judge.id } })).exposure).toBe(14);
    const uses = await app.prisma.playerFactionPerkUse.findMany({ where: { roundPlayerId: player.id } });
    expect(uses).toMatchObject([{ kind: 'OFFICIAL_EXPOSURE', saved: { exposure: 1 } }]);
    const law = await LawService.page(app.prisma, player.id, city.id, ruleset);
    const decorated = await LawOfficialService.decoratePage(app.prisma, law!, player.id);
    expect(decorated.payroll?.exposureDiscount).toEqual({ factionKey: 'CIVIC_HANDSHAKE', factionName: 'Civic Handshake', percent: 10 });
  });

  it('burns less corner upkeep for the Kings at Connected, logged per block and settle', async () => {
    const thugs = 200;
    const { round, city, player } = await fixture(ruleset, { thugs: 400, postedThugs: thugs, beer: 5_000, crack: 5_000 });
    await TurfService.ensureRound(app.prisma, round.id, ruleset);
    await standWith(player.id, 'KINGS', ruleset.factionStanding.tiers.connected);
    const block = await app.prisma.turf.findFirstOrThrow({ where: { roundId: round.id, cityId: city.id } });
    const now = new Date();
    await app.prisma.turf.update({ where: { id: block.id }, data: { holderId: player.id, cornerThugs: thugs, heldSince: new Date(now.getTime() - 10 * HOUR), upkeepAt: new Date(now.getTime() - 10 * HOUR) } });

    await app.prisma.$transaction((tx) => TurfService.settlePlayer(tx, player.id, ruleset, now, () => 0.99));
    const after = await app.prisma.roundPlayer.findUniqueOrThrow({ where: { id: player.id } });
    const cut = cornerUpkeep(ruleset, thugs, 10, 10);
    const full = cornerUpkeep(ruleset, thugs, 10);
    expect(after.beer).toBe(5_000 - cut.beer);
    expect(cut.beer).toBeLessThan(full.beer);
    const uses = await app.prisma.playerFactionPerkUse.findMany({ where: { roundPlayerId: player.id } });
    expect(uses).toMatchObject([{ kind: 'CORNER_UPKEEP', factionKey: 'KINGS', saved: { beer: full.beer - cut.beer, product: full.product - cut.product } }]);

    const view = await TurfService.byCity(app.prisma, player.id, ruleset);
    expect(view?.get(city.slug)?.upkeepDiscount).toEqual({ factionKey: 'KINGS', factionName: 'The Kings', percent: 10 });

    // Settling again with nothing new to burn logs nothing more.
    await app.prisma.$transaction((tx) => TurfService.settlePlayer(tx, player.id, ruleset, now, () => 0.99));
    expect(await app.prisma.playerFactionPerkUse.count({ where: { roundPlayerId: player.id } })).toBe(1);
  });

  it('sends each Trusted warning to the bell once, and none below Trusted', async () => {
    const trusted = await fixture();
    const known = await fixture();
    for (const { player, city } of [trusted, known]) {
      // 17 points: 3 short of Noticed.
      await app.prisma.playerCase.create({ data: { roundPlayerId: player.id, cityId: city.id, caseHundredths: 1_700, lastEvidenceAt: new Date() } });
    }
    await standWith(trusted.player.id, 'CIVIC_HANDSHAKE', ruleset.factionStanding.tiers.trusted);
    await standWith(known.player.id, 'CIVIC_HANDSHAKE', ruleset.factionStanding.tiers.known);

    await FactionWarningService.sweep(app.prisma);
    await FactionWarningService.sweep(app.prisma);

    const activity = await app.prisma.playerActivity.findMany({ where: { roundPlayerId: trusted.player.id, type: 'FACTION_WARNING' } });
    expect(activity).toHaveLength(1);
    expect(activity[0]!.payload).toMatchObject({ factionKey: 'CIVIC_HANDSHAKE', factionName: 'Civic Handshake', href: '/game#case' });
    expect(String((activity[0]!.payload as Record<string, unknown>).text)).toMatch(/3 points from Noticed/);
    expect(await app.prisma.inAppNotification.count({ where: { activityId: activity[0]!.id } })).toBe(1);
    expect(await app.prisma.playerFactionWarning.count({ where: { roundPlayerId: trusted.player.id } })).toBe(1);

    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: known.player.id, type: 'FACTION_WARNING' } })).toBe(0);
  });

  it('can be muted in the bell, and reaches push once for players who switch factions on', async () => {
    expect(BELL_CATEGORIES).toContain('factions');
    expect(bellMutedActivityTypes(['factions'])).toEqual(['FACTION_WARNING']);

    await app.prisma.pushSubscription.create({ data: { accountId, endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, p256dh: 'p', auth: 'a' } });
    await app.prisma.notificationSettings.upsert({
      where: { accountId },
      create: { accountId, pushEnabled: true, factionsEnabled: true },
      update: { pushEnabled: true, factionsEnabled: true },
    });
    const { player, city } = await fixture();
    await app.prisma.playerCase.create({ data: { roundPlayerId: player.id, cityId: city.id, caseHundredths: 1_700, lastEvidenceAt: new Date() } });
    await standWith(player.id, 'CIVIC_HANDSHAKE', ruleset.factionStanding.tiers.trusted);
    await FactionWarningService.sweep(app.prisma);
    // The collector's faction source alone: the full pass would also close other suites' rounds.
    const pushOnly = { discord: false, push: true };
    const rows = [
      ...await app.prisma.$transaction((tx) => factionWarnings(tx, new Date(), pushOnly)),
      ...await app.prisma.$transaction((tx) => factionWarnings(tx, new Date(), pushOnly)),
    ].filter((row) => row.accountId === accountId);
    const warning = await app.prisma.playerFactionWarning.findFirstOrThrow({ where: { roundPlayerId: player.id } });
    const mine = rows.filter((row) => row.dedupeKey.startsWith(`faction-warning:${warning.id}:`));
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ channel: 'PUSH', category: 'factions', payload: { category: 'factions', notice: { title: 'Word from Civic Handshake', body: 'Your Case in New York City is 3 points from Noticed.', url: expect.stringContaining('/game#case') } } });
    expect(await app.prisma.playerFactionWarning.count({ where: { roundPlayerId: player.id, alertsCollectedAt: null } })).toBe(0);
  });

  it('gives 1.4.0-C2 rounds no perks and no nudges', async () => {
    const { player } = await fixture(classicOgV14C2);
    await FactionService.grant(app.prisma, player.id, classicOgV14C2, 'OUTFIT', 300, 'JOB', `test:${randomUUID()}`);
    const page = await HandcraftedQuestService.page(app.prisma, player.id, classicOgV14C2);
    expect(page.factions!.every((faction) => faction.perks === undefined)).toBe(true);
    const bought = await StoreService.trade(app.prisma, player.id, { store: 'TOMMY', item: 'PISTOL', direction: 'buy', quantity: 1, actionId: randomUUID() });
    expect(bought.result.unitCents).toBe(classicOgV14C2.stores.TOMMY.items.PISTOL.buyCents);
    const view = await TurfService.byCity(app.prisma, player.id, classicOgV14C2);
    expect([...(view?.values() ?? [])].every((city) => city.upkeepDiscount === undefined)).toBe(true);
    expect(await app.prisma.playerFactionPerkUse.count({ where: { roundPlayerId: player.id } })).toBe(0);
    await FactionWarningService.sweep(app.prisma);
    expect(await app.prisma.playerActivity.count({ where: { roundPlayerId: player.id, type: 'FACTION_WARNING' } })).toBe(0);
  });
});
