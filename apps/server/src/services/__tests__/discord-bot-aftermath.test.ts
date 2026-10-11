import { describe, expect, it } from 'vitest';
import { roundRecapDto } from '../discord-bot.service.js';

describe('roundRecapDto', () => {
  it('projects rankings and supported champions from the frozen report without account data', () => {
    const recap = roundRecapDto('round-1', {
      participants: 4,
      eligibleCompetitors: 3,
      citiesInRound: 2,
      finalNetWorthCents: '9007199254740993123',
      finalCrewMembers: 11,
      playerHeldTurfBlocks: 7,
      activeBusinessesHeld: 5,
      crimeActions: 26,
    }, [
      { roundPlayerId: 'rp-2', accountId: 'private-account', publicPimpId: 2002, displayName: 'Second', cityName: 'Detroit', eligibleCompetitor: true, nationalRank: 2, netWorthCents: '50' },
      { roundPlayerId: 'rp-1', accountId: 'private-account', publicPimpId: 2001, displayName: 'First', cityName: 'Tulsa', eligibleCompetitor: true, nationalRank: 1, netWorthCents: '9007199254740993000' },
      { roundPlayerId: 'rp-3', publicPimpId: 2003, displayName: 'Third', cityName: 'Detroit', eligibleCompetitor: true, nationalRank: 3, netWorthCents: '25' },
      { roundPlayerId: 'rp-4', publicPimpId: 2004, displayName: 'Unranked', cityName: 'Tulsa', eligibleCompetitor: false, nationalRank: null, netWorthCents: '0' },
    ], [{ tag: 'ONE' }, { tag: 'TWO' }], {
      wealth: { status: 'AVAILABLE', valueCents: '9007199254740993000', roundPlayerIds: ['rp-1'] },
      drugUnitsHeld: { status: 'AVAILABLE', value: 15, ids: ['rp-1', 'rp-2'], unit: 'drug units held at cutoff' },
      crime: { status: 'AVAILABLE', ids: ['rp-1'], value: 99 },
    });

    expect(recap.aftermathUrl).toContain('/game/rounds/round-1/aftermath');
    expect(recap).toMatchObject({
      participants: 4,
      eligibleCompetitors: 3,
      cities: 2,
      alliances: 2,
      finalNetWorthCents: '9007199254740993123',
      crimeActionsAttempted: 26,
      topPlayers: [
        { rank: 1, publicPimpId: 2001, netWorthCents: '9007199254740993000' },
        { rank: 2, publicPimpId: 2002, netWorthCents: '50' },
        { rank: 3, publicPimpId: 2003, netWorthCents: '25' },
      ],
      champions: [
        { title: 'Round Champion', value: '9007199254740993000', winners: [{ publicPimpId: 2001 }] },
        { title: 'Wealth King', value: '9007199254740993000', winners: [{ publicPimpId: 2001 }] },
        { title: 'Drug Kingpin', value: 15, winners: [{ publicPimpId: 2001 }, { publicPimpId: 2002 }] },
      ],
    });
    expect(JSON.stringify(recap)).not.toContain('private-account');
    expect(recap.champions.some((award) => award.title === 'Most Feared')).toBe(false);
  });

  it('does not turn missing alliance data or malformed champions into fabricated zeroes', () => {
    const recap = roundRecapDto('round-2', { participants: 0 }, [], null, {
      wealth: { status: 'AVAILABLE', roundPlayerIds: [], value: 0 },
    });

    expect(recap.alliances).toBeNull();
    expect(recap.champions).toEqual([]);
    expect(recap.topPlayers).toEqual([]);
  });
});
