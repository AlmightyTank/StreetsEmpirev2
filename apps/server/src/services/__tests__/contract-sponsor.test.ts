import { describe, expect, it } from 'vitest';
import { classicOgV14B2, classicOgV14C, type QuestDefinition } from '@streets/rulesets';
import { contractSponsor } from '../contract-sponsor.js';

const definition = (key: string) => classicOgV14C.questDefinitions[key as keyof typeof classicOgV14C.questDefinitions] as QuestDefinition;

describe('1.4.0-C contract sponsors', () => {
  it('sponsors an alliance contract by its giver’s faction, for every contributor alike', () => {
    expect(contractSponsor(classicOgV14C, definition('ALLIANCE_HOLD_THE_CITY'), {})).toBe('KINGS');
    expect(contractSponsor(classicOgV14C, definition('ALLIANCE_REINFORCEMENTS'), { allianceContract: {} })).toBe('OUTFIT');
  });

  it('keeps the sponsor dealt to an open choice, and ignores one that is not a candidate', () => {
    expect(contractSponsor(classicOgV14C, definition('DAILY_REGISTER_RUN'), { sponsor: 'KINGS' })).toBe('KINGS');
    expect(contractSponsor(classicOgV14C, definition('DAILY_REGISTER_RUN'), { sponsor: 'CARTEL_LINE' })).toBe('OUTFIT');
    expect(contractSponsor(classicOgV14C, definition('DAILY_COOK_ORDER'), { sponsor: 'KINGS' })).toBe('CARTEL_LINE');
  });

  it('reads a city contract’s lane from its kind', () => {
    const city = definition('CITY_MARKET_ORDER_A');
    expect(contractSponsor(classicOgV14C, city, { cityContract: { kind: 'TRIP' }, sponsor: 'CIVIC_HANDSHAKE' })).toBe('CIVIC_HANDSHAKE');
    expect(contractSponsor(classicOgV14C, city, { cityContract: {}, sponsor: 'ROAD_SAINTS' })).toBe('ROAD_SAINTS');
    expect(contractSponsor(classicOgV14C, city, { cityContract: { kind: 'CASINO' } })).toBeNull();
  });

  it('sponsors nothing for a Job, unsponsored work or an older round', () => {
    expect(contractSponsor(classicOgV14C, definition('PAYDAY'), {})).toBeNull();
    expect(contractSponsor(classicOgV14C, definition('DAILY_HOUSE_MONEY'), {})).toBeNull();
    expect(contractSponsor(classicOgV14B2, definition('DAILY_COOK_ORDER'), {})).toBeNull();
  });
});
