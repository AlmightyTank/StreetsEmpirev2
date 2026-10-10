import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { RoundPlayer } from '@prisma/client';
import { classicOgV165G, classicOgV17A } from '@streets/rulesets';
import { startingStock, type Ruleset } from '@streets/rules-engine';
import type { CrewRosterDto } from '@streets/shared';
import { ActionService } from '../action.service.js';
import { CrewRosterService } from '../crew-roster.service.js';
import { DealerCrewService } from '../dealer-crew.service.js';
import { DealerStaffService } from '../dealer-staff.service.js';
import { NetWorthService } from '../net-worth.service.js';
import { PlayerStateService } from '../player-state.service.js';
import { ReputationService } from '../reputation.service.js';
import { RoundService } from '../round.service.js';

/**
 * 1.7.0-A gate, live: migrating a crew into members keeps every count, assignment,
 * happiness and net worth exactly as it was; running it again (or racing it) creates
 * nobody twice; 1.6 dealer careers keep their ids and experience; members follow the
 * counts as actions change them; and an earlier ruleset never builds a roster.
 * Opt in with CREW_INTEGRATION=1.
 */
describe.runIf(process.env.CREW_INTEGRATION === '1')('1.7.0-A crew roster with PostgreSQL', () => {
  let app: FastifyInstance;
  let accountId = '';
  let cookie = '';
  const rounds: string[] = [];
  let currentRoundId = '';
  let homeCityId = '';

  beforeAll(async () => {
    app = await (await import('../../app.js')).buildApp();
    const name = `roster_${randomUUID().slice(0, 8)}`;
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { username: name, email: `${name}@example.invalid`, password: randomUUID() } });
    accountId = registered.json().account.id;
    cookie = registered.cookies.map((entry) => `${entry.name}=${entry.value}`).join('; ');
    const current = async () => app.prisma.round.findUniqueOrThrow({ where: { id: currentRoundId } });
    vi.spyOn(RoundService, 'requireCurrent').mockImplementation(current);
    vi.spyOn(RoundService, 'getCurrent').mockImplementation(current);
    homeCityId = (await app.prisma.city.findUniqueOrThrow({ where: { slug: classicOgV17A.round.startingCitySlug } })).id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    for (const id of rounds) await app.prisma.round.delete({ where: { id } });
    if (accountId) await app.prisma.account.delete({ where: { id: accountId } });
    await app?.close();
  });

  /** A player mid-season: wounded, on runs, on corners, in businesses and dealing. */
  async function seasonedPlayer(rules: Ruleset): Promise<RoundPlayer> {
    const round = await app.prisma.round.create({
      data: {
        name: `Roster ${rules.meta.version}`, slug: `roster-${randomUUID()}`,
        rulesetId: rules.meta.id, rulesetVersion: rules.meta.version, status: 'ACTIVE',
        startsAt: new Date('2000-01-01'), endsAt: new Date(Date.now() + 86_400_000),
      },
    });
    rounds.push(round.id);
    currentRoundId = round.id;
    const data = {
      ...rules.round.startingPlayer, ...startingStock(rules),
      thugs: 60, woundedThugs: 4, busyThugs: 3, postedThugs: 0, businessThugs: 0, dealerThugs: 0,
      whores: 45, businessWhores: 0, turns: 500, cashCents: 900_000_000n, heat: 0,
    };
    return app.prisma.roundPlayer.create({
      data: {
        ...data, roundId: round.id, accountId, cityId: homeCityId, displayName: `roster${rounds.length}`, publicPimpId: 9100 + rounds.length,
        netWorthCents: NetWorthService.calculate(data, rules),
        reputation: { create: ReputationService.seedFor(rules) },
      },
    });
  }

  /** Give the player a working 1.6 dealer operation and staffed corners and businesses, as 1.6 left them. */
  async function withOperations(rules: Ruleset, player: RoundPlayer) {
    const home = rules.round.startingCitySlug;
    const crew = (await DealerCrewService.establish(app.prisma, player.id, { citySlug: home, districtKey: 'NIGHTCLUB', dealers: 3, actionId: randomUUID() })).result.crew!;
    // One dealer is released: his career waits, with experience, for a rehire.
    const staff = await app.prisma.dealerStaff.findMany({ where: { dealerCrewId: crew.id }, orderBy: { id: 'asc' } });
    await app.prisma.dealerStaff.update({ where: { id: staff[0]!.id }, data: { experiencePoints: 1_400 } });
    await app.prisma.dealerStaff.update({ where: { id: staff[1]!.id }, data: { experiencePoints: 4_200 } });
    await app.prisma.dealerStaff.update({ where: { id: staff[2]!.id }, data: { experiencePoints: 260 } });
    await DealerStaffService.release(app.prisma, player.id, staff[0]!.id, { actionId: randomUUID() });
    const turf = await app.prisma.turf.findFirstOrThrow({ where: { roundId: player.roundId, cityId: homeCityId, district: 'URBAN_GHETTO' } }).catch(async () => app.prisma.turf.create({
      data: { roundId: player.roundId, cityId: homeCityId, district: 'URBAN_GHETTO', localsThugs: 5 },
    }));
    await app.prisma.turf.update({ where: { id: turf.id }, data: { holderId: player.id, cornerThugs: 5, heldSince: new Date() } });
    const thugBusiness = Object.entries(rules.business!.catalog).find(([, entry]) => entry.staff === 'THUGS')![0];
    const girlBusiness = Object.entries(rules.business!.catalog).find(([, entry]) => entry.staff === 'WHORES')![0];
    for (const [lot, kind, staff] of [[1, thugBusiness, 2], [2, girlBusiness, 6]] as const) {
      const data = { kind, level: 1, staff, staffTarget: staff, staffOwnerId: player.id };
      await app.prisma.business.upsert({ where: { turfId_lot: { turfId: turf.id, lot } }, create: { roundId: player.roundId, turfId: turf.id, lot, ...data }, update: data });
    }
    await app.prisma.roundPlayer.update({ where: { id: player.id }, data: { postedThugs: 5, businessThugs: 2, businessWhores: 6 } });
    return { crew, staff };
  }

  const fresh = (id: string) => app.prisma.roundPlayer.findUniqueOrThrow({ where: { id } });
  const settled = async (id: string) => (await PlayerStateService.settle(app.prisma, id, { markActive: false })).player;
  const members = (roundPlayerId: string) => app.prisma.crewMember.findMany({ where: { roundPlayerId }, orderBy: { serial: 'asc' } });
  const active = async (roundPlayerId: string, role: 'THUG' | 'WORKER') => (await members(roundPlayerId)).filter((row) => row.role === role && row.status !== 'RELEASED');
  const place = (rows: Array<{ status: string; assignmentKind: string | null }>, status: string, kind: string | null = null) => rows.filter((row) => row.status === status && row.assignmentKind === kind).length;
  const sync = (id: string, rules: Ruleset) => app.prisma.$transaction((tx) => CrewRosterService.sync(tx, id, rules, new Date()));
  /** A live 1.6.5 round moved onto 1.7.0-A, as Admin → Rounds does it. */
  const upgrade = (roundId: string) => app.prisma.round.update({ where: { id: roundId }, data: { rulesetId: classicOgV17A.meta.id, rulesetVersion: classicOgV17A.meta.version } });

  beforeEach(() => {
    currentRoundId = '';
  });

  it('migrates a seasoned crew without changing totals, assignments, happiness or net worth', async () => {
    const rules = classicOgV17A;
    const player = await seasonedPlayer(classicOgV165G);
    const { crew, staff } = await withOperations(classicOgV165G, player);
    expect(await app.prisma.crewMember.count({ where: { roundPlayerId: player.id } })).toBe(0);
    await upgrade(player.roundId);
    const before = await settled(player.id);
    const beforeRow = await fresh(player.id);

    const result = await sync(player.id, rules);
    expect(result).toMatchObject({ migrated: true });

    const afterRow = await fresh(player.id);
    const after = await settled(player.id);
    // Nothing on the player moved: not a count, not happiness, not net worth.
    const { updatedAt: _a, ...beforeFields } = beforeRow;
    const { updatedAt: _b, ...afterFields } = afterRow;
    expect(afterFields).toEqual(beforeFields);
    expect(after.netWorthCents).toBe(before.netWorthCents);
    expect(after.whoreHappiness).toBe(before.whoreHappiness);
    expect(after.thugHappiness).toBe(before.thugHappiness);

    // One member for every counted thug and worker, each in the place the counts give.
    const thugs = await active(player.id, 'THUG');
    const workers = await active(player.id, 'WORKER');
    expect(thugs).toHaveLength(afterRow.thugs);
    expect(workers).toHaveLength(afterRow.whores);
    expect(place(thugs, 'RECOVERING')).toBe(afterRow.woundedThugs);
    expect(place(thugs, 'IN_TRANSIT')).toBe(afterRow.busyThugs);
    expect(place(thugs, 'ASSIGNED', 'TURF')).toBe(afterRow.postedThugs);
    expect(place(thugs, 'ASSIGNED', 'BUSINESS')).toBe(afterRow.businessThugs);
    expect(place(thugs, 'ASSIGNED', 'DEALER')).toBe(afterRow.dealerThugs);
    expect(place(workers, 'ASSIGNED', 'BUSINESS')).toBe(afterRow.businessWhores);
    expect(place(thugs, 'AVAILABLE')).toBe(afterRow.thugs - afterRow.woundedThugs - afterRow.busyThugs - afterRow.postedThugs - afterRow.businessThugs - afterRow.dealerThugs);
    expect(place(workers, 'AVAILABLE')).toBe(afterRow.whores - afterRow.businessWhores);

    // 1.6 careers keep their ids and experience: working dealers on their crew, the released one at home.
    for (const career of staff.slice(1)) {
      expect(await app.prisma.crewMember.findUnique({ where: { id: career.id } })).toMatchObject({
        dealerStaffId: career.id, status: 'ASSIGNED', assignmentKind: 'DEALER', assignmentRef: crew.id,
      });
    }
    expect(await app.prisma.crewMember.findUnique({ where: { id: staff[0]!.id } })).toMatchObject({ dealerStaffId: staff[0]!.id, status: 'AVAILABLE', experiencePoints: 1_400 });
    expect((await app.prisma.crewMember.findUnique({ where: { id: staff[1]!.id } }))!.experiencePoints).toBe(4_200);
    // Dealer tiers and cuts are read from the 1.6 careers, which are untouched.
    expect((await app.prisma.dealerStaff.findUniqueOrThrow({ where: { id: staff[1]!.id } })).experiencePoints).toBe(4_200);

    // Audited once, with the counts it read.
    const audit = await app.prisma.crewRosterMigration.findUniqueOrThrow({ where: { roundPlayerId: player.id } });
    expect(audit).toMatchObject({ rulesetId: rules.meta.id, membersCreated: afterRow.thugs + afterRow.whores, dealerCareers: 3 });
    expect(audit.before).toMatchObject({ thugs: afterRow.thugs, whores: afterRow.whores, dealerThugs: 2 });
    expect(await app.prisma.crewMemberEvent.count({ where: { roundPlayerId: player.id, kind: 'MIGRATED' } })).toBe(afterRow.thugs + afterRow.whores);
  });

  it('creates nobody twice when the migration is retried or raced', async () => {
    const rules = classicOgV17A;
    const player = await seasonedPlayer(classicOgV165G);
    await withOperations(classicOgV165G, player);
    await upgrade(player.roundId);
    const results = await Promise.allSettled([sync(player.id, rules), sync(player.id, rules), sync(player.id, rules)]);
    expect(results.every((entry) => entry.status === 'fulfilled')).toBe(true);
    expect(results.filter((entry) => entry.status === 'fulfilled' && entry.value?.migrated)).toHaveLength(1);
    const count = await app.prisma.crewMember.count({ where: { roundPlayerId: player.id } });
    expect(await sync(player.id, rules)).toEqual({ migrated: false, created: 0, moved: 0, released: 0 });
    expect(await app.prisma.crewMember.count({ where: { roundPlayerId: player.id } })).toBe(count);
    expect(await app.prisma.crewRosterMigration.count({ where: { roundPlayerId: player.id } })).toBe(1);
    // The round-wide ops run finds everyone already migrated and in step.
    expect(await CrewRosterService.syncRound(app.prisma, player.roundId, rules)).toEqual({ players: 1, migrated: 0, created: 0, released: 0 });
    const row = await fresh(player.id);
    expect(await active(player.id, 'THUG')).toHaveLength(row.thugs);
    expect(await active(player.id, 'WORKER')).toHaveLength(row.whores);
  });

  it('migrates on the first action, and keeps members in step as actions change the crew', async () => {
    const rules = classicOgV17A;
    const player = await seasonedPlayer(rules);
    // Any action builds the roster.
    await ActionService.run(app.prisma, player.id, { action: 'TEST_NOOP', execute: ({ current }) => ({ next: current, result: null }) });
    const audit = await app.prisma.crewRosterMigration.findUniqueOrThrow({ where: { roundPlayerId: player.id } });
    expect(Object.keys(audit.before as object).sort()).toEqual(['businessThugs', 'businessWhores', 'busyThugs', 'dealerThugs', 'postedThugs', 'thugs', 'whores', 'woundedThugs']);
    const original = new Set((await active(player.id, 'THUG')).map((row) => row.id));

    // A thug goes dealing: the same people, one of them now on a crew.
    const crew = (await DealerCrewService.establish(app.prisma, player.id, { citySlug: rules.round.startingCitySlug, districtKey: 'CASINO', dealers: 2, actionId: randomUUID() })).result.crew!;
    let thugs = await active(player.id, 'THUG');
    expect(new Set(thugs.map((row) => row.id))).toEqual(original);
    const dealers = thugs.filter((row) => row.assignmentKind === 'DEALER');
    expect(dealers).toHaveLength(2);
    expect(dealers.every((row) => row.assignmentRef === crew.id && row.dealerStaffId)).toBe(true);
    expect(await app.prisma.crewMemberEvent.count({ where: { memberId: { in: dealers.map((row) => row.id) }, kind: 'ASSIGNED', assignmentKind: 'DEALER' } })).toBe(2);

    // Released, and rehired by career: the same member comes back with his experience.
    const career = dealers[0]!.dealerStaffId!;
    await app.prisma.dealerStaff.update({ where: { id: career }, data: { experiencePoints: 777 } });
    await app.prisma.crewMember.update({ where: { id: dealers[0]!.id }, data: { experiencePoints: 777 } });
    await DealerStaffService.release(app.prisma, player.id, career, { actionId: randomUUID() });
    expect(await app.prisma.crewMember.findUniqueOrThrow({ where: { id: dealers[0]!.id } })).toMatchObject({ status: 'AVAILABLE', experiencePoints: 777, dealerStaffId: career });
    await DealerStaffService.assign(app.prisma, player.id, crew.id, { staffId: career, actionId: randomUUID() });
    expect(await app.prisma.crewMember.findUniqueOrThrow({ where: { id: dealers[0]!.id } })).toMatchObject({ status: 'ASSIGNED', assignmentKind: 'DEALER', experiencePoints: 777 });

    // The crew shrinks and grows: members are released and join to match, never more.
    await ActionService.run(app.prisma, player.id, { action: 'TEST_LOSS', execute: ({ current }) => ({ next: { ...current, thugs: current.thugs - 10 }, result: null }) });
    let row = await fresh(player.id);
    expect(await active(player.id, 'THUG')).toHaveLength(row.thugs);
    expect(await app.prisma.crewMember.count({ where: { roundPlayerId: player.id, role: 'THUG', status: 'RELEASED' } })).toBe(10);
    await ActionService.run(app.prisma, player.id, { action: 'TEST_HIRE', execute: ({ current }) => ({ next: { ...current, thugs: current.thugs + 4, whores: current.whores + 2 }, result: null }) });
    row = await fresh(player.id);
    thugs = await active(player.id, 'THUG');
    expect(thugs).toHaveLength(row.thugs);
    expect(await active(player.id, 'WORKER')).toHaveLength(row.whores);
    expect(await app.prisma.crewMemberEvent.count({ where: { roundPlayerId: player.id, kind: 'JOINED' } })).toBe(6);
    // The dealers kept their places through all of it.
    expect(thugs.filter((entry) => entry.assignmentKind === 'DEALER').map((entry) => entry.id).sort()).toEqual(dealers.map((entry) => entry.id).sort());
  });

  it('reads the roster through the API, in step with the counts', async () => {
    const rules = classicOgV17A;
    const player = await seasonedPlayer(rules);
    await app.prisma.roundPlayer.update({ where: { id: player.id }, data: { thugs: 25 } });
    const response = await app.inject({ method: 'GET', url: '/api/game/crew?limit=10', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const view = response.json<CrewRosterDto>();
    expect(view.enabled).toBe(true);
    expect(view.migratedAt).not.toBeNull();
    // Wounded with no injury on record heal as the roster is read: the members follow.
    const row = await fresh(player.id);
    expect(view.totals.find((entry) => entry.role === 'THUG')).toMatchObject({
      members: 25, byStatus: { RECOVERING: row.woundedThugs, IN_TRANSIT: 3, AVAILABLE: 25 - 3 - row.woundedThugs, ASSIGNED: 0 },
    });
    expect(view.totals.find((entry) => entry.role === 'WORKER')).toMatchObject({ members: 45 });
    expect(view.members).toHaveLength(10);
    expect(view.total).toBe(70);
    const workers = (await app.inject({ method: 'GET', url: '/api/game/crew?role=WORKER&status=AVAILABLE&limit=200&offset=40', headers: { cookie } })).json<CrewRosterDto>();
    expect(workers.total).toBe(45);
    expect(workers.members).toHaveLength(5);
  });

  it('leaves earlier rulesets alone: no roster, and actions behave as before', async () => {
    const rules: Ruleset = classicOgV165G;
    expect(rules.crewRoster).toBeUndefined();
    const player = await seasonedPlayer(rules);
    await ActionService.run(app.prisma, player.id, { action: 'TEST_NOOP', execute: ({ current }) => ({ next: current, result: null }) });
    await DealerCrewService.establish(app.prisma, player.id, { citySlug: rules.round.startingCitySlug, districtKey: 'CASINO', dealers: 1, actionId: randomUUID() });
    expect(await sync(player.id, rules)).toBeNull();
    expect(await app.prisma.crewMember.count({ where: { roundPlayerId: player.id } })).toBe(0);
    expect(await app.prisma.crewRosterMigration.count({ where: { roundPlayerId: player.id } })).toBe(0);
    expect(await CrewRosterService.view(app.prisma, player.id, rules, { limit: 10, offset: 0 })).toEqual({ enabled: false, migratedAt: null, totals: [], members: [], total: 0 });
  });
});
