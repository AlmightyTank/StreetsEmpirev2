import { describe, expect, it } from 'vitest';
import { classicOgV01, classicOgV02E, classicOgV02F, classicOgV02G, classicOgV02H, classicOgV03A, classicOgV03B, classicOgV03C, classicOgV03D, classicOgV04A, classicOgV06C, classicOgV06D, type Ruleset } from '@streets/rulesets';
import { regenerateTurns } from '../calculations/turns.js';
import { calculateNetWorthCents } from '../calculations/net-worth.js';
import {
  loadRuleset,
  loadRulesetForRound,
  RulesetNotFoundError,
  RulesetVersionMismatchError,
  isKnownRulesetId,
  listRulesets,
} from '../loader.js';

describe('ruleset loader', () => {
  it('loads the classic ruleset by id', () => {
    expect(loadRuleset('classic-og-v0.1')).toBe(classicOgV01);
  });

  it('accepts a matching pinned version', () => {
    expect(loadRuleset('classic-og-v0.1', '0.1.0')).toBe(classicOgV01);
  });

  it('refuses to silently play by different numbers', () => {
    expect(() => loadRuleset('classic-og-v0.1', '0.2.0')).toThrow(
      RulesetVersionMismatchError,
    );
  });

  it('rejects an unknown ruleset', () => {
    expect(() => loadRuleset('classic-og-v9.9')).toThrow(RulesetNotFoundError);
  });

  it('loads the ruleset a round was created with', () => {
    const round = { rulesetId: 'classic-og-v0.1', rulesetVersion: '0.1.0' };
    expect(loadRulesetForRound(round)).toBe(classicOgV01);
  });

  it('knows which ids it can serve', () => {
    expect(isKnownRulesetId('classic-og-v0.1')).toBe(true);
    expect(isKnownRulesetId('nope')).toBe(false);
    expect(listRulesets()).toHaveLength(27);
  });
});

describe('classic-og-v0.2-e contents', () => {
  it('seeds local onboarding rivals for solo raid testing', () => {
    expect(classicOgV02E.round.seededRivals).toHaveLength(3);
    expect(classicOgV02E.round.seededRivals?.map((rival) => rival.publicPimpId)).toEqual([1000, 1001, 1002]);
  });
});

describe('classic-og-v0.2-f contents', () => {
  it('loads the public raid ruleset as the current F milestone', () => {
    expect(loadRuleset('classic-og-v0.2-f', '0.2.0-F')).toBe(classicOgV02F);
    expect(classicOgV02F.combat.version).toBe('0.2.0-F.2');
    expect(classicOgV02F.round.seededRivals).toHaveLength(0);
    expect(classicOgV02F.combat.specialRaids?.DRUG_HOES?.title).toBe('Drug their hoes');
    expect(classicOgV02F.combat.specialRaids?.STEAL_RIDE?.title).toBe('Steal a ride');
    expect(classicOgV02F.combat.specialRaids?.LURE_CREW?.title).toBe('Lure their crew');
  });
});

describe('classic-og-v0.2-g contents', () => {
  it('loads the street polish ruleset without changing F balance', () => {
    expect(loadRuleset('classic-og-v0.2-g', '0.2.0-G')).toBe(classicOgV02G);
    expect(classicOgV02G.round.seededRivals).toHaveLength(0);
    expect(classicOgV02G.combat.specialRaids).toEqual(classicOgV02F.combat.specialRaids);
    expect(classicOgV02G.combat.version).toBe('0.2.0-G.1');
  });
});

describe('classic-og-v0.2-h contents', () => {
  it('loads the raid trophies ruleset without changing G balance', () => {
    expect(loadRuleset('classic-og-v0.2-h', '0.2.0-H')).toBe(classicOgV02H);
    // Only the clerk's and Tommy's favours moved on from G.
    expect({ ...classicOgV02H.quests, CORNER: null, TOMMY: null }).toEqual({ ...classicOgV02G.quests, CORNER: null, TOMMY: null });
    expect(classicOgV02H.quests.CORNER.goal.kind).toBe('BUY_SUPPLIES');
    expect(classicOgV02H.quests.TOMMY.goal.kind).toBe('BUY_AND_RAID');
    expect(classicOgV02H.round.seededRivals).toHaveLength(0);
    expect(classicOgV02H.combat.specialRaids).toEqual(classicOgV02G.combat.specialRaids);
    expect(classicOgV02H.combat.version).toBe('0.2.0-H.1');
  });
});

describe('classic-og-v0.3-a contents', () => {
  it('pins the season-end ruleset without changing H balance', () => {
    expect(loadRuleset('classic-og-v0.3-a', '0.3.0-A')).toBe(classicOgV03A);
    expect(classicOgV03A.combat).toEqual(classicOgV02H.combat);
    expect(classicOgV03A.round.startingPlayer).toEqual(classicOgV02H.round.startingPlayer);
    expect(classicOgV03A.meta.name).toBe('Classic OG - Season End');
  });
});

describe('classic-og-v0.3-b contents', () => {
  it('pins the admin ruleset without changing 0.3.0-A balance', () => {
    const ruleset = loadRuleset('classic-og-v0.3-b', '0.3.0-B');
    expect(ruleset.meta.name).toBe('Classic OG - Admin');
    expect({ ...ruleset, meta: null }).toEqual({ ...classicOgV03A, meta: null });
  });
});

describe('classic-og-v0.3-c contents', () => {
  it('adds alliances without changing 0.3.0-B balance', () => {
    const ruleset = loadRuleset('classic-og-v0.3-c', '0.3.0-C');
    expect(ruleset.meta.name).toBe('Classic OG - Alliances');
    expect(ruleset.alliances).toEqual({ maxMembers: 5, leaveCooldownHours: 24, inviteExpiresHours: 48, maxPendingInvites: 10 });
    // The cooldown must outlast revenge, or dropping a member would dodge it.
    expect(ruleset.alliances!.leaveCooldownHours).toBeGreaterThanOrEqual(ruleset.combat!.strategy!.retaliation.revengeHours);
    expect({ ...ruleset, meta: null, alliances: null }).toEqual({ ...classicOgV03B, meta: null, alliances: null });
    expect((classicOgV03B as Ruleset).alliances).toBeUndefined();
  });
});

describe('classic-og-v0.3-d contents', () => {
  it('shares alliance intel without changing 0.3.0-C balance', () => {
    const ruleset = loadRuleset('classic-og-v0.3-d', '0.3.0-D');
    expect(ruleset.meta.name).toBe('Classic OG - Playing Together');
    expect(ruleset.alliances).toEqual({ ...classicOgV03C.alliances, sharedIntel: true });
    expect({ ...ruleset, meta: null, alliances: null }).toEqual({ ...classicOgV03C, meta: null, alliances: null });
    expect((classicOgV03C as Ruleset).alliances?.sharedIntel).toBeUndefined();
  });
});

describe('classic-og-v0.6-d contents', () => {
  it('pins outpost storage without changing C turf-war balance', () => {
    const ruleset = loadRuleset('classic-og-v0.6-d', '0.6.0-D');
    expect(ruleset).toBe(classicOgV06D);
    expect(ruleset.turf?.outposts).toEqual({
      cashCapCents: 25_000_000,
      beerCap: 2_000,
      productCap: 5_000,
      transferTurnCost: 2,
      lootShare: 0.25,
      lootCashCapCents: 5_000_000,
      lootBeerCap: 500,
      lootProductCap: 1_000,
    });
    expect(ruleset.hideout?.rooms.GARAGE).toEqual({
      name: 'Garage',
      blurb: 'A second bay lets another crew take a Low-Rider run out while the first is still away.',
      maxLevel: 1,
      costsCents: [2_500_000],
    });
    expect(ruleset.hideout?.buffs.garageRunLimit).toBe(2);
    expect({
      ...ruleset,
      meta: null,
      hideout: null,
      turf: { ...ruleset.turf!, outposts: null },
    }).toEqual({
      ...classicOgV06C,
      meta: null,
      hideout: null,
      turf: { ...classicOgV06C.turf, outposts: null },
    });
  });
});

describe('classic-og-v0.4-a contents', () => {
  it('adds the product catalog without changing 0.3.0-D balance', () => {
    const ruleset = loadRuleset('classic-og-v0.4-a', '0.4.0-A');
    expect(ruleset.meta.name).toBe('Classic OG - Product Foundation');
    expect(Object.keys(ruleset.products!)).toEqual(['CRACK', 'WEED', 'ECSTASY', 'COCAINE', 'METH', 'HEROIN']);
    expect({ ...ruleset, meta: null, products: null }).toEqual({ ...classicOgV03D, meta: null, products: null });
    expect((classicOgV03D as Ruleset).products).toBeUndefined();
    for (const key of Object.keys(ruleset.products!)) expect(key).toMatch(/^[A-Z][A-Z0-9_]{1,31}$/);
  });
});

describe('classic-og-v0.4-b contents', () => {
  it('adds work supply that burns and pays exactly like crack', () => {
    const ruleset = loadRuleset('classic-og-v0.4-b', '0.4.0-B');
    expect(ruleset.meta.name).toBe('Classic OG - Work Supply');
    expect(ruleset.workSupply).toEqual({ productPerWhorePerTurn: ruleset.scouting.consumption.crackPerWhorePerTurn, dryTakeMultiplier: 1 });
    expect({ ...ruleset, meta: null, workSupply: null }).toEqual({ ...classicOgV04A, meta: null, workSupply: null });
  });
});

describe('classic-og-v0.1 contents', () => {
  it('carries every section of the ruleset', () => {
    for (const key of [
      'round',
      'turns',
      'economy',
      'happiness',
      'scouting',
      'production',
      'stores',
      'weapons',
      'rankings',
      'evidence',
    ] as const) {
      expect(classicOgV01[key]).toBeDefined();
    }
  });

  it('holds the starting resources from section 11', () => {
    expect(classicOgV01.round.startingPlayer).toMatchObject({
      cashCents: 500_000,
      turns: 144,
      whores: 1,
      thugs: 1,
      condoms: 250,
      medicine: 0,
      crack: 100,
      beer: 10,
      lowRiders: 0,
      payoutPercent: 50,
    });
  });

  it('regenerates two turns every five minutes up to one hundred forty-four', () => {
    expect(classicOgV01.turns).toMatchObject({
      amountPerInterval: 2,
      intervalMinutes: 5,
      cap: 144,
    });
    expect(classicOgV01.turns.awayBonus).toMatchObject({
      enabled: true,
      afterHours: 6,
      amount: 6,
    });
  });

  it('keeps store prices in cents, with sell prices below buy prices', () => {
    for (const store of Object.values(classicOgV01.stores)) {
      for (const item of Object.values(store.items)) {
        expect(item.buyCents).toBeGreaterThan(0);
        expect(Number.isInteger(item.buyCents)).toBe(true);
        if (item.sellCents !== null) {
          expect(item.sellCents).toBeLessThan(item.buyCents);
        }
      }
    }
  });

  it('sells crack for exactly its net worth value', () => {
    expect(classicOgV01.stores.PIP.items.CRACK.sellCents).toBe(
      classicOgV01.economy.netWorth.perCrackCents,
    );
  });

  it('ships nothing PvP related as enabled', () => {
    expect(classicOgV01.evidence.enabled).toBe(false);
    expect(classicOgV01.turns.reserveTurns.enabled).toBe(false);
    expect(classicOgV01.turns.purchasedTurns.enabled).toBe(false);
  });
});

describe('the ruleset contract', () => {
  /**
   * The point of declaring Ruleset rather than deriving it from the classic
   * numbers: a second ruleset must be able to carry different values and still
   * flow through every calculator.
   */
  const brisk: Ruleset = {
    ...classicOgV01,
    meta: { id: 'brisk-test', version: '9.9.9', name: 'Brisk' },
    turns: { ...classicOgV01.turns, amountPerInterval: 5, cap: 500 },
    economy: {
      ...classicOgV01.economy,
      netWorth: { ...classicOgV01.economy.netWorth, perWhoreCents: 1_000_000 },
    },
  };

  it('regenerates at the variant rate and cap', () => {
    const base = new Date('2026-01-01T00:00:00.000Z');
    const result = regenerateTurns(
      { turns: 490, lastTurnCalculationAt: base },
      new Date(base.getTime() + 40 * 60 * 1000),
      brisk,
    );

    expect(result.turns).toBe(500);
    expect(result.turnCap).toBe(500);
  });

  it('values resources at the variant prices', () => {
    const worth = calculateNetWorthCents(
      {
        cashCents: 0, whores: 3, thugs: 0, lowRiders: 0, medicine: 0, crack: 0,
        condoms: 0, beer: 0, pistols: 0, shotguns: 0, tek9s: 0, ak47s: 0,
      },
      brisk,
    );
    expect(worth).toBe(3_000_000n);
  });
});
