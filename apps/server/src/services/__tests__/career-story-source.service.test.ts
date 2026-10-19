import { describe, expect, it } from 'vitest';
import { careerStorySourceFromActivity } from '../career-story-source.service.js';

describe('career story source adapters', () => {
  it.each([
    ['COMBAT_SETTLED', 'COMBAT'], ['TURF_PUSH_SETTLED', 'TURF'], ['TRAVEL_ARRIVED', 'TRAVEL'],
    ['SUPPLY_PURCHASED', 'SUPPLY'], ['CONTACT_JOB_SETTLED', 'CONTACT'], ['BUSINESS_SALE_SETTLED', 'BUSINESS'],
    ['SCOUT_SETTLED', 'SCOUT'], ['CASE_CLOSED', 'CASE'], ['CREW_SHIFT_SETTLED', 'CREW'], ['FACTION_CONTRACT_SETTLED', 'FACTION'],
  ])('maps %s to %s with a stable source id', (type, sourceKind) => {
    const receipt = careerStorySourceFromActivity({ id: 'abc', type: type as never, payload: {}, createdAt: '2030-01-01T00:00:00.000Z' });
    expect(receipt).toMatchObject({ sourceKind, sourceId: 'activity:abc' });
    expect(receipt?.settledAt).toEqual(new Date('2030-01-01T00:00:00.000Z'));
  });
  it('ignores non-settlement activity', () => expect(careerStorySourceFromActivity({ id: 'x', type: 'CAREER_CHOSEN' as never, payload: {}, createdAt: new Date().toISOString() })).toBeNull());
  it('maps public receipts without copying private payload fields', () => expect(careerStorySourceFromActivity({ id: 'public-1', type: 'PUBLIC_MILESTONE' as never, payload: { rival: 'private' }, createdAt: '2030-01-01T00:00:00.000Z' })).toEqual({ sourceKind: 'PUBLIC_ACTIVITY', sourceId: 'activity:public-1', settledAt: new Date('2030-01-01T00:00:00.000Z') }));
});
