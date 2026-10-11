import { describe, expect, it } from 'vitest';
import { buildRoundAftermathAggregates, type AftermathPlayerSource } from '../round-aftermath.service.js';
import { buildRoundAftermathLeaderboard, type PlayerSnapshot } from '../round-aftermath-query.service.js';

function player(overrides: Partial<AftermathPlayerSource> = {}): AftermathPlayerSource {
  return {
    id: 'player-1',
    accountId: 'account-1',
    publicPimpId: 1001,
    displayName: 'Player',
    cityId: 'city-a',
    cityName: 'City A',
    netWorthCents: 123n,
    nationalRank: 1,
    localRank: 1,
    thugs: 3,
    whores: 2,
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
      player({ id: 'p2', accountId: 'a2', publicPimpId: 1002, cityId: 'city-b', cityName: 'City B', netWorthCents: highValue, thugs: 4, whores: 1, nationalRank: 1, localRank: 1, raidsDone: 1, driveBysDone: 2 }),
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
      expect.objectContaining({ roundPlayerId: 'npc', eligibleCompetitor: false, netWorthCents: highValue.toString(), crewMembers: 198 }),
    ]));
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
});
