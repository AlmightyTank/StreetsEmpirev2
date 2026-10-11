import { describe, expect, it, vi } from 'vitest';
import { classicOgV17E, classicOgV17G } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import {
  DAILY_CONTRACT_SLOTS,
  recipeLockedDailyKeys,
  selectedDailyContractKeys,
  syncDailyContractAttempts,
} from '../daily-contract.service.js';

// Sponsors are dealt per board; they play no part in which cards a player gets.
vi.mock('../contract-sponsor.js', () => ({
  dealSponsors: async (_db: unknown, _id: string, _ruleset: unknown, offers: unknown[]) => offers.map(() => null),
  sponsorState: () => ({}),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const ROUND = 'round-one';
const LOCKED = ['DAILY_METH_COOK', 'DAILY_PARTY_PACK'];
const ALL_RECIPES = ['PRODUCT_ECSTASY_RECIPE', 'PRODUCT_METH_RECIPE', 'PRODUCT_WEED_RECIPE', 'PRODUCT_COCAINE_RECIPE', 'PRODUCT_HEROIN_RECIPE'];

/** The first day this round's shared board deals a card that cooks a gated product. */
function dayWithLockedCard(): Date {
  const start = new Date('2026-10-12T15:00:00.000Z');
  for (let day = 0; day < 60; day += 1) {
    const now = new Date(start.getTime() + day * DAY_MS);
    if (selectedDailyContractKeys(classicOgV17G, now, undefined, ROUND).some((key) => LOCKED.includes(key))) return now;
  }
  throw new Error('No board in sixty days dealt a gated card.');
}

function fakeDb(unlocks: Set<string>) {
  const definitions = Object.values(classicOgV17G.questDefinitions)
    .filter((definition) => definition.type === 'DAILY')
    .map((definition, index) => ({ id: 'definition-' + index, key: definition.key }));
  type Row = { id: string; questDefinitionId: string; attempt: number; status: string; expiresAt: Date | null };
  const rows: Row[] = [];
  const db = {
    questDefinition: { findMany: async () => definitions },
    roundPlayer: { findUnique: async () => ({ roundId: ROUND }) },
    playerUnlock: { findMany: async () => [...unlocks].map((key) => ({ key })) },
    playerQuest: {
      updateMany: async () => ({ count: 0 }),
      findMany: async () => rows.map((row) => ({ ...row })),
      create: async ({ data }: { data: Row }) => {
        const row = { ...data, id: 'attempt-' + (rows.length + 1) };
        rows.push(row);
        return { ...row };
      },
    },
  } as unknown as Db;
  const keys = () => rows.map((row) => definitions.find((definition) => definition.id === row.questDefinitionId)!.key).sort();
  return { db, keys };
}

describe('1.7.0-G daily board around locked recipes', () => {
  it('names the dailies that cook a locked product', () => {
    expect([...recipeLockedDailyKeys(classicOgV17G, new Set(['METH', 'ECSTASY', 'WEED', 'COCAINE', 'HEROIN']))].sort()).toEqual(LOCKED);
    expect([...recipeLockedDailyKeys(classicOgV17G, new Set(['METH']))]).toEqual(['DAILY_METH_COOK']);
    expect(recipeLockedDailyKeys(classicOgV17G, new Set()).size).toBe(0);
  });

  it('swaps a locked card for the next one in the deck and keeps the rest of the board shared', () => {
    const now = dayWithLockedCard();
    const shared = selectedDailyContractKeys(classicOgV17G, now, undefined, ROUND);
    const locked = selectedDailyContractKeys(classicOgV17G, now, undefined, ROUND, new Set(LOCKED));

    expect(locked).toHaveLength(DAILY_CONTRACT_SLOTS);
    expect(locked.some((key) => LOCKED.includes(key))).toBe(false);
    for (const key of shared.filter((card) => !LOCKED.includes(card))) expect(locked).toContain(key);
    expect(selectedDailyContractKeys(classicOgV17G, now, undefined, ROUND, new Set())).toEqual(shared);
  });

  it('deals a Crack-only player a full board with no locked card', async () => {
    const now = dayWithLockedCard();
    const { db, keys } = fakeDb(new Set());
    await syncDailyContractAttempts(db, 'player-1', classicOgV17G, now);

    expect(keys()).toHaveLength(DAILY_CONTRACT_SLOTS);
    expect(keys().some((key) => LOCKED.includes(key))).toBe(false);
  });

  it('deals the shared board to a player who holds every recipe', async () => {
    const now = dayWithLockedCard();
    const { db, keys } = fakeDb(new Set(ALL_RECIPES));
    await syncDailyContractAttempts(db, 'player-1', classicOgV17G, now);

    expect(keys()).toEqual(selectedDailyContractKeys(classicOgV17G, now, undefined, ROUND).sort());
  });

  it('never deals a fourth card when a recipe opens mid-day', async () => {
    const now = dayWithLockedCard();
    const unlocks = new Set<string>();
    const { db, keys } = fakeDb(unlocks);
    await syncDailyContractAttempts(db, 'player-1', classicOgV17G, now);
    const morning = keys();

    for (const key of ALL_RECIPES) unlocks.add(key);
    await syncDailyContractAttempts(db, 'player-1', classicOgV17G, new Date(now.getTime() + 60_000));
    expect(keys()).toEqual(morning);

    // The next day's board deals normally again.
    const tomorrow = new Date(now.getTime() + DAY_MS);
    await syncDailyContractAttempts(db, 'player-1', classicOgV17G, tomorrow);
    expect(keys()).toHaveLength(DAILY_CONTRACT_SLOTS * 2);
  });

  it('keeps an ungated ruleset on the shared board without reading unlocks', async () => {
    const now = new Date('2026-10-12T15:00:00.000Z');
    const { db, keys } = fakeDb(new Set());
    (db as unknown as { playerUnlock: unknown }).playerUnlock = {
      findMany: async () => { throw new Error('An ungated ruleset has no unlocks to read.'); },
    };
    const ruleset = { ...classicOgV17E, questDefinitions: classicOgV17G.questDefinitions };
    await syncDailyContractAttempts(db, 'player-1', ruleset, now);
    expect(keys()).toEqual(selectedDailyContractKeys(ruleset, now, undefined, ROUND).sort());
  });
});
