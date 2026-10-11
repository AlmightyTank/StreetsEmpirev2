import type { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  buildRoundAftermathAggregates,
  type AftermathAllianceSource,
  type AftermathPlayerSource,
} from '../round-aftermath.service.js';
import {
  buildRoundAftermathCityDetail,
  buildRoundAftermathLeaderboard,
  buildRoundAftermathPersonal,
  buildRoundAftermathRecords,
  type PlayerSnapshot,
} from '../round-aftermath-query.service.js';
import {
  calculateAftermathReward,
  calculateAftermathRewardAmountCents,
} from '../round-aftermath-reward.service.js';

function player(overrides: Partial<AftermathPlayerSource> = {}): AftermathPlayerSource {
  return {
    id: 'player-1',
    accountId: 'account-1',
    publicPimpId: 1001,
    displayName: 'Player',
    cityId: 'city-a',
    cityName: 'City A',
    citySlug: 'city-a',
    allianceId: null,
    netWorthCents: 123n,
    nationalRank: 1,
    localRank: 1,
    thugs: 3,
    whores: 2,
    drugUnitsHeld: 4,
    raidsDone: 2,
    driveBysDone: 1,
    ...overrides,
  };
}

describe('buildRoundAftermathAggregates', () => {
  it('keeps exact cents, tied leaders, cutoff city attribution, and eligible record scope', () => {
    const highValue = 9_007_199_254_740_993_123n;
    const aggregates = buildRoundAftermathAggregates([
      player({ id: 'p1', accountId: 'a1', netWorthCents: highValue }),
      player({ id: 'p2', accountId: 'a2', publicPimpId: 1002, cityId: 'city-b', citySlug: 'city-b', cityName: 'City B', netWorthCents: highValue, thugs: 4, whores: 1, nationalRank: 1, localRank: 1, raidsDone: 1, driveBysDone: 2 }),
      player({ id: 'npc', accountId: 'npc-account', publicPimpId: 1003, displayName: 'NPC', netWorthCents: highValue, nationalRank: null, localRank: null, thugs: 99, whores: 99 }),
    ], [
      { cityId: 'city-a', holderId: 'p1' },
      { cityId: 'city-b', holderId: 'p2' },
      { cityId: 'city-b', holderId: 'npc' },
    ], [
      { cityId: 'city-a', holderId: 'p1' },
      { cityId: 'city-b', holderId: 'p2' },
      { cityId: 'city-b', holderId: 'npc' },
    ]);

    expect(aggregates.globalAggregate).toMatchObject({
      participants: 3,
      eligibleCompetitors: 2,
      citiesInRound: 2,
      finalNetWorthCents: (highValue * 2n).toString(),
      finalCrewMembers: 10,
      playerHeldTurfBlocks: 3,
      activeBusinessesHeld: 3,
      crimeActions: 6,
    });
    expect(aggregates.cityAggregates).toEqual([
      expect.objectContaining({ cityId: 'city-a', cityName: 'City A', participants: 2, netWorthCents: highValue.toString(), turfBlocksHeld: 1 }),
      expect.objectContaining({ cityId: 'city-b', cityName: 'City B', participants: 1, eligibleCompetitors: 1, netWorthCents: highValue.toString(), turfBlocksHeld: 2 }),
    ]);
    expect(JSON.stringify(aggregates.cityAggregates)).not.toContain('"crimeActions"');
    expect(aggregates.playerAggregates).toEqual(expect.arrayContaining([
      expect.objectContaining({ roundPlayerId: 'npc', eligibleCompetitor: false, netWorthCents: highValue.toString(), crewMembers: 198, drugUnitsHeld: 4 }),
      expect.objectContaining({
        roundPlayerId: 'p1',
        turfByCity: [{ citySlug: 'city-a', count: 1 }],
        businessesByCity: [{ citySlug: 'city-a', count: 1 }],
      }),
    ]));
    expect(aggregates.categoryRecords.drugUnitsHeld).toMatchObject({ status: 'AVAILABLE', value: 4, ids: ['p1', 'p2'] });
    expect(aggregates.categoryRecords.wealth).toMatchObject({ status: 'AVAILABLE', valueCents: highValue.toString(), roundPlayerIds: ['p1', 'p2'] });
    expect(aggregates.categoryRecords.crew).toMatchObject({ status: 'AVAILABLE', value: 5, ids: ['p1', 'p2'] });
    expect(aggregates.categoryRecords.turf).toMatchObject({ status: 'AVAILABLE', value: 1, ids: ['p1', 'p2'] });
    expect(aggregates.categoryRecords.moneyEarnedAndSpent).toMatchObject({ status: 'NOT_RECORDED' });
  });

  it('keeps turf-only cities data-driven and does not award records in an empty round', () => {
    const aggregates = buildRoundAftermathAggregates(
      [],
      [{ cityId: 'city-with-no-players', holderId: null }],
      [],
      new Map([['city-with-no-players', 'Turf Only City']]),
    );

    expect(aggregates.globalAggregate).toMatchObject({
      participants: 0,
      eligibleCompetitors: 0,
      citiesInRound: 1,
      finalNetWorthCents: '0',
    });
    expect(aggregates.cityAggregates).toEqual([
      expect.objectContaining({ cityId: 'city-with-no-players', cityName: 'Turf Only City', participants: 0 }),
    ]);
    expect(aggregates.categoryRecords.wealth).toMatchObject({ status: 'NOT_RECORDED' });
    expect(aggregates.categoryRecords.crew).toMatchObject({ status: 'NOT_RECORDED' });
  });

  it('freezes city slugs and cutoff alliance rosters, wealth, and territorial control', () => {
    const players = [
      player({ id: 'member-a', allianceId: 'private-alliance-id', netWorthCents: 400n, publicPimpId: 1001 }),
      player({ id: 'member-b', allianceId: 'private-alliance-id', netWorthCents: 600n, publicPimpId: 1002 }),
      player({ id: 'inactive', allianceId: 'private-alliance-id', netWorthCents: 900n, publicPimpId: 1003, nationalRank: null, localRank: null }),
      player({ id: 'solo', netWorthCents: 1000n, publicPimpId: 1004 }),
    ];
    const alliances: AftermathAllianceSource[] = [
      { id: 'private-alliance-id', name: 'Metro Crew', tag: 'MTC', leaderId: 'member-a' },
    ];
    const snapshot = buildRoundAftermathAggregates(
      players,
      [
        { cityId: 'city-a', holderId: 'member-a' },
        { cityId: 'city-a', holderId: 'member-b' },
        { cityId: 'city-b', holderId: 'solo' },
      ],
      [{ cityId: 'city-a', holderId: 'member-a' }],
      new Map([['city-a', 'City A'], ['city-b', 'City B']]),
      new Map([['city-a', 'city-a'], ['city-b', 'city-b']]),
      alliances,
    );

    expect(snapshot.cityAggregates).toEqual(expect.arrayContaining([
      expect.objectContaining({ citySlug: 'city-a', netWorthCents: '2000', turfBlocksHeld: 2 }),
    ]));
    expect(snapshot.allianceAggregate).toEqual([
      expect.objectContaining({
        name: 'Metro Crew',
        tag: 'MTC',
        rank: 1,
        memberCount: 3,
        eligibleCompetitors: 2,
        combinedNetWorthCents: '1000',
        turfBlocksHeld: 2,
        activeBusinessesHeld: 1,
        leader: { publicPimpId: 1001, displayName: 'Player' },
        members: expect.arrayContaining([
          expect.objectContaining({ publicPimpId: 1001 }),
          expect.objectContaining({ publicPimpId: 1002 }),
        ]),
        cityControl: [{ cityName: 'City A', turfBlocksHeld: 2 }],
      }),
    ]);
    expect(JSON.stringify(snapshot.allianceAggregate)).not.toContain('private-alliance-id');
    expect(JSON.stringify(snapshot.allianceAggregate)).not.toContain('member-a');
  });
});

describe('buildRoundAftermathLeaderboard', () => {
  it('paginates a public projection, keeps tied placement, and omits private snapshot IDs', () => {
    const rows: PlayerSnapshot[] = Array.from({ length: 4 }, (_, index) => ({
      roundPlayerId: `private-round-player-${index}`,
      accountId: `private-account-${index}`,
      publicPimpId: 1004 - index,
      displayName: `Empire ${index + 1}`,
      cityId: 'private-city-id',
      cityName: 'Metro',
      eligibleCompetitor: true,
      nationalRank: index < 2 ? 1 : index + 1,
      localRank: index + 1,
      netWorthCents: index < 2 ? '9007199254740993123' : String(100 - index),
      thugs: index,
      whores: 1,
      crewMembers: index + 1,
      turfBlocksHeld: index === 0 ? 5 : 0,
      activeBusinessesHeld: 0,
      raidsAttempted: 0,
      driveBysAttempted: 0,
    }));

    const first = buildRoundAftermathLeaderboard('wealth', rows, 1, 2, 'READY');
    const second = buildRoundAftermathLeaderboard('wealth', rows, 2, 2, 'READY');

    expect(first).toMatchObject({
      reportStatus: 'READY',
      category: 'wealth',
      page: 1,
      pageSize: 2,
      total: 4,
      totalPages: 2,
      entries: [
        { rank: 1, publicPimpId: 1003, value: '9007199254740993123' },
        { rank: 1, publicPimpId: 1004, value: '9007199254740993123' },
      ],
    });

    expect(second.entries.map((entry) => entry.rank)).toEqual([3, 4]);
    expect(JSON.stringify(first)).not.toContain('private-round-player');
    expect(JSON.stringify(first)).not.toContain('private-account');
    expect(JSON.stringify(first)).not.toContain('private-city-id');
  });

    describe('buildRoundAftermathRecords', () => {
      const snapshot = (overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
        roundPlayerId: 'private-player',
        accountId: 'private-account',
        publicPimpId: 1001,
        displayName: 'Empire',
        cityId: 'private-city',
        cityName: 'Metro',
        citySlug: 'metro',
        eligibleCompetitor: true,
        nationalRank: 1,
        localRank: 1,
        netWorthCents: '1000',
        crewMembers: 10,
        drugUnitsHeld: 4,
        turfBlocksHeld: 4,
        activeBusinessesHeld: 2,
        raidsAttempted: 1,
        driveBysAttempted: 1,
        ...overrides,
      });

      it('uses frozen national rank for global wealth awards and hides snapshot identifiers', () => {
        const result = buildRoundAftermathRecords([
          snapshot({ publicPimpId: 1001, nationalRank: 1, netWorthCents: '1000' }),
          snapshot({ roundPlayerId: 'private-2', publicPimpId: 1002, nationalRank: 1, netWorthCents: '900' }),
          snapshot({ roundPlayerId: 'private-3', publicPimpId: 1003, nationalRank: 3, netWorthCents: '800' }),
        ], 'wealth', 1, 10, 'READY', null, 3);

        expect(result.award).toMatchObject({
          title: 'Wealth King',
          status: 'AVAILABLE',
          leaders: [{ publicPimpId: 1001 }, { publicPimpId: 1002 }],
        });
        expect(result.total).toBe(3);
        expect(JSON.stringify(result)).not.toContain('private-account');
        expect(JSON.stringify(result)).not.toContain('private-player');
        expect(JSON.stringify(result)).not.toContain('private-city');
      });

      it('uses physical city holdings and leaves unsupported crime awards unawarded', () => {
        const cityTurf = buildRoundAftermathRecords([
          snapshot({ publicPimpId: 1001, citySlug: 'metro', turfByCity: [{ citySlug: 'metro', count: 3 }] }),
          snapshot({ roundPlayerId: 'other', publicPimpId: 1002, citySlug: 'uptown', turfByCity: [{ citySlug: 'metro', count: 3 }] }),
        ], 'turf', 1, 10, 'READY', 'metro', 3);
        const crime = buildRoundAftermathRecords([snapshot()], 'crime', 1, 10, 'READY', null, 3);

        expect(cityTurf.award.leaders.map((leader) => leader.publicPimpId)).toEqual([1001, 1002]);
        expect(cityTurf.entries.map((entry) => entry.value)).toEqual(['3', '3']);
        expect(crime.award).toMatchObject({
          status: 'NOT_RECORDED',
          leaders: [],
          formula: expect.stringContaining('Not awarded'),
        });
      });

      it('keeps unsupported drug totals unavailable', () => {
        expect(buildRoundAftermathRecords([
          snapshot({ publicPimpId: 1001, drugUnitsHeld: 20 }),
          snapshot({ roundPlayerId: 'other', publicPimpId: 1002, nationalRank: 2, drugUnitsHeld: 20 }),
          snapshot({ roundPlayerId: 'empty', publicPimpId: 1003, nationalRank: 3, drugUnitsHeld: 0 }),
        ], 'drugs', 1, 10, 'READY', null, 4)).toMatchObject({
          categoryStatus: 'AVAILABLE',
          total: 3,
          award: {
            title: 'Drug Kingpin',
            status: 'AVAILABLE',
            formula: expect.stringContaining('not production or sales'),
            leaders: [{ publicPimpId: 1001 }, { publicPimpId: 1002 }],
          },
        });
        expect(buildRoundAftermathRecords([], 'drugs', 1, 10, 'READY', null, 3)).toMatchObject({
          categoryStatus: 'NOT_RECORDED',
          award: { status: 'NOT_RECORDED', formula: expect.stringContaining('predates') },
        });
      });

      it('supports resident-city drug boards but marks them as recognition-only', () => {
        const result = buildRoundAftermathRecords([
          snapshot({ publicPimpId: 1001, drugUnitsHeld: 12 }),
          snapshot({ roundPlayerId: 'other-city', publicPimpId: 1002, citySlug: 'uptown', drugUnitsHeld: 99 }),
        ], 'drugs', 1, 10, 'READY', 'metro', 4);

        expect(result.award).toMatchObject({
          status: 'AVAILABLE',
          formula: expect.stringContaining('recognition'),
          leaders: [{ publicPimpId: 1001 }],
        });
      });
    });

    describe('calculateAftermathReward', () => {
      const rows: Prisma.JsonValue = [
        {
          accountId: 'winner',
          eligibleCompetitor: true,
          nationalRank: 1,
          crewMembers: 10,
          drugUnitsHeld: 10,
          turfBlocksHeld: 5,
          activeBusinessesHeld: 2,
        },
        {
          accountId: 'tied-winner',
          eligibleCompetitor: true,
          nationalRank: 2,
          crewMembers: 10,
          drugUnitsHeld: 10,
          turfBlocksHeld: 5,
          activeBusinessesHeld: 2,
        },
        {
          accountId: 'inactive',
          eligibleCompetitor: false,
          nationalRank: null,
          crewMembers: 100,
          turfBlocksHeld: 100,
          activeBusinessesHeld: 100,
        },
      ];

      it('awards national top 10 and supported tied global distinctions only', () => {
        expect(calculateAftermathReward(rows, 'winner')).toEqual([
          'NATIONAL_TOP_10',
          'WEALTH_KING',
          'TURF_WARLORD',
          'DRUG_KINGPIN',
          'CREW_COMMANDER',
          'BUSINESS_TYCOON',
          'ROUND_CHAMPION',
        ]);
        expect(calculateAftermathReward(rows, 'tied-winner')).toEqual([
          'NATIONAL_TOP_10',
          'TURF_WARLORD',
          'DRUG_KINGPIN',
          'CREW_COMMANDER',
          'BUSINESS_TYCOON',
        ]);
        expect(calculateAftermathReward(rows, 'inactive')).toEqual([]);
        expect(calculateAftermathReward(rows, 'not-present')).toEqual([]);
      });

      it('pays $500 per distinction up to the $2,500 cap', () => {
        expect(calculateAftermathRewardAmountCents(2)).toBe(100_000n);
        expect(calculateAftermathRewardAmountCents(6)).toBe(250_000n);
      });
    });

  it('returns preparing and unavailable statuses without exposing partial rows', () => {
    const rows: PlayerSnapshot[] = [{
      roundPlayerId: 'private',
      accountId: 'private',
      publicPimpId: 1001,
      displayName: 'Player',
      cityId: 'city',
      cityName: 'City',
      eligibleCompetitor: true,
      nationalRank: 1,
      localRank: 1,
      netWorthCents: '100',
      crewMembers: 1,
      thugs: 1,
      whores: 0,
      turfBlocksHeld: 0,
      activeBusinessesHeld: 0,
      raidsAttempted: 0,
      driveBysAttempted: 0,
    }];
    expect(buildRoundAftermathLeaderboard('wealth', rows, 1, 25, 'PREPARING')).toMatchObject({
      categoryStatus: 'PREPARING',
      total: 0,
      entries: [],
    });
    expect(buildRoundAftermathLeaderboard('wealth', rows, 1, 25, 'UNAVAILABLE')).toMatchObject({
      categoryStatus: 'UNAVAILABLE',
      total: 0,
      entries: [],
    });
    expect(buildRoundAftermathLeaderboard('drugs', rows, 1, 25, 'READY')).toMatchObject({
      categoryStatus: 'NOT_RECORDED',
      total: 0,
      entries: [],
    });
  });

  describe('buildRoundAftermathCityDetail', () => {
    it('uses frozen local ranks and returns only public leaderboard fields', () => {
      const rows: PlayerSnapshot[] = [
        {
          roundPlayerId: 'private-player-2',
          publicPimpId: 1002,
          displayName: 'Second',
          cityName: 'City A',
          citySlug: 'city-a',
          eligibleCompetitor: true,
          nationalRank: 4,
          localRank: 2,
          netWorthCents: '200',
          crewMembers: 2,
          turfBlocksHeld: 1,
          activeBusinessesHeld: 0,
          raidsAttempted: 0,
          driveBysAttempted: 0,
        },
        {
          roundPlayerId: 'private-player-1',
          publicPimpId: 1001,
          displayName: 'First',
          cityName: 'City A',
          citySlug: 'city-a',
          eligibleCompetitor: true,
          nationalRank: 2,
          localRank: 1,
          netWorthCents: '300',
          crewMembers: 3,
          turfBlocksHeld: 0,
          activeBusinessesHeld: 1,
          raidsAttempted: 0,
          driveBysAttempted: 0,
        },
      ];
      const result = buildRoundAftermathCityDetail({
        slug: 'city-a',
        name: 'City A',
        participants: 2,
        eligibleCompetitors: 2,
        netWorthCents: '500',
        crewMembers: 5,
        turfBlocksHeld: 1,
        activeBusinessesHeld: 1,
      }, rows, 'READY');

      expect(result.localStandings.map((row) => row.localRank)).toEqual([1, 2]);
      expect(JSON.stringify(result)).not.toContain('private-player');
    });
  });

  describe('buildRoundAftermathPersonal', () => {
    const records = {
      wealth: { status: 'AVAILABLE', valueCents: '1000', roundPlayerIds: ['player-1'] },
      turf: { status: 'AVAILABLE', value: 4, ids: ['player-1'] },
      crew: { status: 'AVAILABLE', value: 5, ids: ['player-1'] },
      businesses: { status: 'AVAILABLE', value: 2, ids: ['player-1'] },
      crime: { status: 'AVAILABLE', value: 3, ids: ['player-1'] },
      drugsProducedAndSold: { status: 'NOT_RECORDED', reason: 'No complete round total.' },
    } satisfies Prisma.InputJsonObject;

    it('returns only the authenticated player projection, with ties, percentiles, and milestones', () => {
      const rows: PlayerSnapshot[] = [
        {
          roundPlayerId: 'player-1',
          accountId: 'account-secret',
          publicPimpId: 1001,
          displayName: 'My Empire',
          cityName: 'City A',
          citySlug: 'city-a',
          eligibleCompetitor: true,
          nationalRank: 1,
          localRank: 1,
          netWorthCents: '1000',
          crewMembers: 5,
          turfBlocksHeld: 4,
          activeBusinessesHeld: 2,
          raidsAttempted: 2,
          driveBysAttempted: 1,
        },
        {
          roundPlayerId: 'player-2',
          accountId: 'other-account-secret',
          publicPimpId: 1002,
          displayName: 'Rival',
          cityName: 'City A',
          citySlug: 'city-a',
          eligibleCompetitor: true,
          nationalRank: 2,
          localRank: 2,
          netWorthCents: '500',
          crewMembers: 5,
          turfBlocksHeld: 1,
          activeBusinessesHeld: 0,
          raidsAttempted: 0,
          driveBysAttempted: 0,
        },
        {
          roundPlayerId: 'player-3',
          accountId: 'inactive-account-secret',
          publicPimpId: 1003,
          displayName: 'Inactive',
          cityName: 'City A',
          citySlug: 'city-a',
          eligibleCompetitor: false,
          nationalRank: null,
          localRank: null,
          netWorthCents: '9999',
          crewMembers: 9,
          turfBlocksHeld: 99,
          activeBusinessesHeld: 9,
          raidsAttempted: 0,
          driveBysAttempted: 0,
        },
      ];
      const result = buildRoundAftermathPersonal(
        { id: 'round-1', name: 'Round One' },
        'account-secret',
        rows,
        records,
      );

      expect(result).toMatchObject({
        reportStatus: 'READY',
        participation: 'PLAYED',
        player: {
          publicPimpId: 1001,
          nationalRank: 1,
          eligibleCompetitors: 2,
          percentile: 100,
          crimeActions: 3,
        },
      });
      expect(result.metrics.find((metric) => metric.category === 'crew')).toMatchObject({
        status: 'AVAILABLE',
        rank: 1,
        percentile: 100,
        tiedCompetitors: 2,
      });
      expect(result.metrics.find((metric) => metric.category === 'drugs')).toMatchObject({
        status: 'NOT_RECORDED',
        value: null,
        rank: null,
      });
      expect(result.milestones).toEqual(expect.arrayContaining([
        'Round champion',
        'National podium',
        'Local city champion',
        'Wealth category leader',
      ]));
      expect(JSON.stringify(result)).not.toContain('account-secret');
      expect(JSON.stringify(result)).not.toContain('other-account-secret');
      expect(JSON.stringify(result)).not.toContain('player-1');
    });

    it('does not imply participation when the account is absent from the frozen report', () => {
      const result = buildRoundAftermathPersonal(
        { id: 'round-1', name: 'Round One' },
        'nonparticipant-account',
        [player({ accountId: 'another-account' })].map((source) => ({
          roundPlayerId: source.id,
          accountId: source.accountId,
          publicPimpId: source.publicPimpId,
          displayName: source.displayName,
          cityName: source.cityName,
          citySlug: source.citySlug,
          eligibleCompetitor: true,
          nationalRank: source.nationalRank,
          localRank: source.localRank,
          netWorthCents: source.netWorthCents.toString(),
          crewMembers: source.thugs + source.whores,
          turfBlocksHeld: 0,
          activeBusinessesHeld: 0,
          raidsAttempted: source.raidsDone,
          driveBysAttempted: source.driveBysDone,
        })),
        records,
      );
      expect(result).toMatchObject({ participation: 'NOT_PLAYED', player: null, metrics: [], milestones: [] });
    });

    it('shows participation without inventing competitive ranks for an ineligible player', () => {
      const inactive = {
        roundPlayerId: 'inactive-player',
        accountId: 'inactive-account',
        publicPimpId: 1003,
        displayName: 'Inactive Empire',
        cityName: 'City A',
        citySlug: 'city-a',
        eligibleCompetitor: false,
        nationalRank: null,
        localRank: null,
        netWorthCents: '9999',
        crewMembers: 9,
        turfBlocksHeld: 99,
        activeBusinessesHeld: 9,
        raidsAttempted: 0,
        driveBysAttempted: 0,
      };
      const result = buildRoundAftermathPersonal(
        { id: 'round-1', name: 'Round One' },
        'inactive-account',
        [inactive],
        records,
      );
      expect(result.participation).toBe('PLAYED');
      expect(result.player?.nationalRank).toBeNull();
      expect(result.player?.percentile).toBeNull();
      expect(result.metrics.find((metric) => metric.category === 'wealth')).toMatchObject({
        value: '9999',
        rank: null,
        percentile: null,
      });
      expect(result.metrics.find((metric) => metric.category === 'competition')).toMatchObject({
        value: null,
        rank: null,
        percentile: null,
      });
    });
  });
});
