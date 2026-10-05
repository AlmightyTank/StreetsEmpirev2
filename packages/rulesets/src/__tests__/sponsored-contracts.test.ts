import { describe, expect, it } from 'vitest';
import { classicOgV14B2 } from '../classic-og-v1.4-b2/index.js';
import { classicOgV14C } from '../classic-og-v1.4-c/index.js';
import { contactFaction, contractBoard, factionProblems, sponsorCandidates } from '../faction-definitions.js';
import type { QuestDefinition, Ruleset } from '../types.js';

const all = Object.values(classicOgV14C.questDefinitions) as QuestDefinition[];
const boards = all.filter((definition) => contractBoard(definition));

describe('1.4.0-C sponsored contracts ruleset', () => {
  it('adds sponsor rules on top of 1.4.0-B2 and changes nothing else', () => {
    expect(classicOgV14C.meta).toEqual({ id: 'classic-og-v1.4-c', version: '1.4.0-C', name: 'Classic OG - Sponsored Contracts' });
    expect({ ...classicOgV14C, meta: null, contractSponsors: null }).toEqual({ ...classicOgV14B2, meta: null, contractSponsors: null });
    expect((classicOgV14B2 as Ruleset).contractSponsors).toBeUndefined();
    expect(factionProblems(classicOgV14C)).toEqual([]);
  });

  it('pays every board, more for longer windows', () => {
    const { DAILY, WEEKLY, CITY_CONTRACT, SEASON, ALLIANCE } = classicOgV14C.contractSponsors.standing;
    expect(CITY_CONTRACT).toBeLessThanOrEqual(DAILY);
    expect(DAILY).toBeLessThan(WEEKLY);
    expect(WEEKLY).toBeLessThanOrEqual(ALLIANCE);
    expect(ALLIANCE).toBeLessThan(SEASON);
  });

  it('sponsors a contract by its giver’s faction, or by its lane when the giver works for none', () => {
    for (const definition of boards) {
      const giver = contactFaction(classicOgV14C, definition.contactKey);
      const candidates = sponsorCandidates(classicOgV14C, definition);
      if (giver) expect(candidates).toEqual([giver]);
    }
    const sponsor = (key: string) => sponsorCandidates(classicOgV14C, classicOgV14C.questDefinitions[key as keyof typeof classicOgV14C.questDefinitions]);
    // Vic brokers for whoever's lane it is; Ace's casino work and Ledger's law work have no sponsor.
    expect(sponsor('DAILY_COOL_DOWN')).toEqual(['CIVIC_HANDSHAKE']);
    expect(sponsor('DAILY_REGISTER_RUN')).toEqual(['OUTFIT', 'KINGS']);
    expect(sponsor('DAILY_FLY_OUT')).toEqual(['ROAD_SAINTS', 'CIVIC_HANDSHAKE']);
    expect(sponsor('DAILY_HOUSE_MONEY')).toEqual([]);
    expect(sponsor('DAILY_EAR_TO_THE_GROUND')).toEqual([]);
    expect(sponsor('SEASON_CLEAN_BOOKS')).toEqual([]);
    expect(sponsor('ALLIANCE_WAR_CHEST')).toEqual(['CARTEL_LINE']);
    // City contracts by kind.
    const city = classicOgV14C.questDefinitions.CITY_MARKET_ORDER_A;
    expect(sponsorCandidates(classicOgV14C, city, 'SELL')).toEqual(['CARTEL_LINE', 'ROAD_SAINTS']);
    expect(sponsorCandidates(classicOgV14C, city, 'TRIP')).toEqual(['ROAD_SAINTS', 'CIVIC_HANDSHAKE']);
    expect(sponsorCandidates(classicOgV14C, city, 'CASINO')).toEqual([]);
  });

  it('gives every faction board work, and never sponsors a Job', () => {
    const sponsoring = new Set(boards.flatMap((definition) => sponsorCandidates(classicOgV14C, definition)));
    expect([...sponsoring].sort()).toEqual(Object.keys(classicOgV14C.factions).sort());
    for (const job of all.filter((definition) => !contractBoard(definition))) expect(sponsorCandidates(classicOgV14C, job)).toEqual([]);
    expect(boards.every((definition) => sponsorCandidates(classicOgV14B2, definition).length === 0)).toBe(true);
  });

  it('flags lanes that name unknown factions or bad amounts', () => {
    const broken = {
      ...classicOgV14C,
      contractSponsors: { ...classicOgV14C.contractSponsors, standing: { DAILY: 0 }, lanes: { STREET: ['NOBODY'], TURF: [] } },
    } as unknown as Ruleset;
    expect(factionProblems(broken)).toEqual([
      'Sponsored DAILY standing must be a positive whole number.',
      'Sponsor lane STREET names unknown faction NOBODY.',
      'Sponsor lane TURF names no faction; leave it out instead.',
    ]);
  });
});
