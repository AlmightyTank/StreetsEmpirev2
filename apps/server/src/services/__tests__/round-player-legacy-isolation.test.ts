import { describe, expect, it } from 'vitest';
import { buildRoundStartingResources } from '../round-player-seed.js';

describe('Empire Legacy fresh-round isolation', () => {
  it('builds the same fresh resources regardless of cosmetic legacy history', () => {
    const start = {
      whores: 2, thugs: 3, condoms: 4, medicine: 5, crack: 6, beer: 7,
      pistols: 8, shotguns: 9, tek9s: 10, ak47s: 11, lowRiders: 1,
      payoutPercent: 20, cashCents: 25_000, turns: 15,
    } as any;
    const accountWithoutLegacy = buildRoundStartingResources(start, 0n);
    // LegacyEntry count/contents are intentionally absent from the initializer API.
    const accountWithLegacy = buildRoundStartingResources(start, 0n);

    expect(accountWithLegacy).toEqual(accountWithoutLegacy);
    expect(accountWithLegacy.cashCents).toBe(25_000n);
  });
});
