import { describe, expect, it } from 'vitest';
import { classicOgV06C, classicOgV06D, classicOgV06E } from '@streets/rulesets';
import { localsThugs } from '@streets/rules-engine';
import { controlFromRows, localsOnBlock, localsReclaimAt, outpostBoxWorthCents, settleOutpostSupplies } from '../turf.service.js';
import { recordTerritoryControlChange } from '../turf-territory.service.js';

const ruleset = classicOgV06C;
const block = { citySlug: 'atlanta', district: 'LOW_RENT' } as const;

describe('0.6.0-C local turf reclaim', () => {
  it('leaves a released corner vacant for the reclaim window, then lets locals grow back', () => {
    const releasedAt = new Date('2026-09-20T12:00:00.000Z');
    const reclaimAt = localsReclaimAt(ruleset, releasedAt);
    expect(reclaimAt.getTime() - releasedAt.getTime()).toBe(ruleset.turf.locals.reclaimHours * 3_600_000);

    expect(localsOnBlock(ruleset, {
      holderId: null,
      ...block,
      localsThugs: 0,
      localsAt: releasedAt,
      localsReclaimAt: reclaimAt,
    }, new Date(releasedAt.getTime() + 5 * 3_600_000))).toBe(0);

    expect(localsOnBlock(ruleset, {
      holderId: null,
      ...block,
      localsThugs: 0,
      localsAt: releasedAt,
      localsReclaimAt: reclaimAt,
    }, new Date(releasedAt.getTime() + 7 * 3_600_000))).toBe(
      Math.round(ruleset.turf.locals.regrowPerHour * 7),
    );
  });

  it('shows seeded locals immediately, and never counts locals while a player holds the block', () => {
    const now = new Date('2026-09-20T12:00:00.000Z');
    const full = localsThugs(ruleset, block);
    expect(localsOnBlock(ruleset, {
      holderId: null,
      ...block,
      localsThugs: full,
      localsAt: now,
      localsReclaimAt: null,
    }, now)).toBe(full);
    expect(localsOnBlock(ruleset, {
      holderId: 'holder',
      ...block,
      localsThugs: full,
      localsAt: now,
      localsReclaimAt: null,
    }, now)).toBe(0);
  });
});


describe('0.6.0-E alliance city control', () => {
  const alliance = (id: string, name: string, tag: string) => ({
    holder: { allianceId: id, alliance: { name, tag } },
  });
  const solo = { holder: { allianceId: null, alliance: null } };
  const locals = { holder: null };

  it('requires three of five blocks at the 60% control threshold', () => {
    expect(controlFromRows(classicOgV06E, [
      alliance('a', 'Aces', 'ACE'),
      alliance('a', 'Aces', 'ACE'),
      solo,
      locals,
      locals,
    ])).toBeNull();

    expect(controlFromRows(classicOgV06E, [
      alliance('a', 'Aces', 'ACE'),
      alliance('a', 'Aces', 'ACE'),
      alliance('a', 'Aces', 'ACE'),
      alliance('b', 'Kings', 'KNG'),
      locals,
    ])).toMatchObject({
      allianceId: 'a',
      alliance: { name: 'Aces', tag: 'ACE' },
      blocksHeld: 3,
      blocksTotal: 5,
      share: 0.6,
    });
  });

  it('does not enable territory control on the D ruleset', () => {
    expect(controlFromRows(classicOgV06D, [
      alliance('a', 'Aces', 'ACE'),
      alliance('a', 'Aces', 'ACE'),
      alliance('a', 'Aces', 'ACE'),
      locals,
      locals,
    ])).toBeNull();
  });
});

describe('0.6.0-E durable territory control changes', () => {
  it('writes one event when control flips, and none when the controller is unchanged', async () => {
    const before = controlFromRows(classicOgV06E, [
      { holder: { allianceId: 'a', alliance: { name: 'Aces', tag: 'ACE' } } },
      { holder: { allianceId: 'a', alliance: { name: 'Aces', tag: 'ACE' } } },
      { holder: { allianceId: 'a', alliance: { name: 'Aces', tag: 'ACE' } } },
      { holder: { allianceId: 'b', alliance: { name: 'Kings', tag: 'KNG' } } },
      { holder: { allianceId: 'b', alliance: { name: 'Kings', tag: 'KNG' } } },
    ]);
    const afterRows = [
      { holder: { allianceId: 'a', alliance: { name: 'Aces', tag: 'ACE' } } },
      { holder: { allianceId: 'a', alliance: { name: 'Aces', tag: 'ACE' } } },
      { holder: { allianceId: 'b', alliance: { name: 'Kings', tag: 'KNG' } } },
      { holder: { allianceId: 'b', alliance: { name: 'Kings', tag: 'KNG' } } },
      { holder: { allianceId: 'b', alliance: { name: 'Kings', tag: 'KNG' } } },
    ];
    const created: any[] = [];
    const db: any = {
      turf: { findMany: async () => afterRows },
      turfControlEvent: { create: async ({ data }: any) => { created.push(data); return { id: 'event-1', ...data }; } },
    };
    const at = new Date('2026-09-20T18:00:00.000Z');

    await recordTerritoryControlChange(db, {
      roundId: 'round', cityId: 'detroit', ruleset: classicOgV06E, before, at,
    });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      previousAllianceId: 'a',
      previousAllianceTag: 'ACE',
      nextAllianceId: 'b',
      nextAllianceTag: 'KNG',
      previousBlocksHeld: 3,
      nextBlocksHeld: 3,
      blocksTotal: 5,
      happenedAt: at,
    });

    const kings = controlFromRows(classicOgV06E, afterRows);
    await recordTerritoryControlChange(db, {
      roundId: 'round', cityId: 'detroit', ruleset: classicOgV06E, before: kings, at,
    });
    expect(created).toHaveLength(1);
  });
});

describe('0.6.0-D outpost box settlement', () => {
  it('burns upkeep from the remote box and leaves a fully supplied corner intact', () => {
    const settled = settleOutpostSupplies(classicOgV06D, {
      thugs: 20,
      hours: 5,
      beer: 10,
      products: { CRACK: 5, WEED: 9 },
      order: ['CRACK'],
    });

    expect(settled.beerUsed).toBe(5);
    expect(settled.productUsed).toBe(2);
    expect(settled.beer).toBe(5);
    expect(settled.products.CRACK).toBe(3);
    expect(settled.products.WEED).toBe(9);
    expect(settled.leaving).toBe(0);
  });

  it('walks thugs when the outpost box is dry instead of borrowing home supplies', () => {
    const settled = settleOutpostSupplies(classicOgV06D, {
      thugs: 20,
      hours: 5,
      beer: 0,
      products: {},
      order: ['CRACK', 'WEED'],
    });

    expect(settled.beerUsed).toBe(0);
    expect(settled.productUsed).toBe(0);
    expect(settled.leaving).toBe(5);
  });

  it('values only what is physically stored in the outpost box', () => {
    const worth = outpostBoxWorthCents(classicOgV06D, {
      cashCents: 100_000n,
      beer: 10,
      products: { CRACK: 4 },
    });
    expect(worth).toBeGreaterThan(100_000n * BigInt(classicOgV06D.economy.netWorth.cashWeightPercent) / 100n);
  });
});
