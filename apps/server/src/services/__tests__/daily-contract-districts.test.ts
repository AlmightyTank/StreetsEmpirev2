import { describe, expect, it, vi } from 'vitest';
import { classicOgV18O } from '@streets/rulesets';
import type { Db } from '../../utils/db.js';
import {
  DAILY_CONTRACT_SLOTS,
  districtLockedDailyKeys,
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
const NIGHTCLUB_CARD = 'DAILY_NIGHTCLUB_ROUNDS';
const ALL_UNLOCKS = [
  'PRODUCT_ECSTASY_RECIPE', 'PRODUCT_METH_RECIPE', 'PRODUCT_WEED_RECIPE', 'PRODUCT_COCAINE_RECIPE', 'PRODUCT_HEROIN_RECIPE',
  'DISTRICT_NIGHTCLUB_ACCESS', 'DISTRICT_CASINO_ACCESS',
];

/** The first day this round's shared board deals the Nightclub card. */
function dayWithNightclubCard(): Date {
  const start = new Date('2026-10-12T15:00:00.000Z');
  for (let day = 0; day < 60; day += 1) {
    const now = new Date(start.getTime() + day * DAY_MS);
    if (selectedDailyContractKeys(classicOgV18O, now, undefined, ROUND).includes(NIGHTCLUB_CARD)) return now;
  }
  throw new Error('No board in sixty days dealt the Nightclub card.');
}

function fakeDb(unlocks: Set<string>) {
  const definitions = Object.values(classicOgV18O.questDefinitions)
    .filter((definition) => definition.type === 'DAILY')
    .map((definition, index) => ({ id: 'definition-' + index, key: definition.key }));
  type Row = { id: string; questDefinitionId: string; attempt: number; status: string; expiresAt: Date | null };
  const rows: Row[] = [];
  const db = {
    questDefinition: { findMany: async () => definitions },
    roundPlayer: { findUnique: async () => ({ roundId: ROUND }) },
    playerUnlock: { findMany: async () => [...unlocks].map((key) => ({ key })) },
    npcGang: { findUnique: async () => null },
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

describe('1.8.0-O daily board around locked districts', () => {
  it('names the dailies that scout a locked district', () => {
    expect([...districtLockedDailyKeys(classicOgV18O, new Set(['NIGHTCLUB', 'CASINO']))]).toEqual([NIGHTCLUB_CARD]);
    expect(districtLockedDailyKeys(classicOgV18O, new Set(['CASINO'])).size).toBe(0);
    expect(districtLockedDailyKeys(classicOgV18O, new Set()).size).toBe(0);
  });

  it('deals a new player a full board without the Nightclub card', async () => {
    const now = dayWithNightclubCard();
    const { db, keys } = fakeDb(new Set());
    await syncDailyContractAttempts(db, 'player-1', classicOgV18O, now);

    expect(keys()).toHaveLength(DAILY_CONTRACT_SLOTS);
    expect(keys()).not.toContain(NIGHTCLUB_CARD);
  });

  it('deals the shared board once the Nightclub is open', async () => {
    const now = dayWithNightclubCard();
    const { db, keys } = fakeDb(new Set(ALL_UNLOCKS));
    await syncDailyContractAttempts(db, 'player-1', classicOgV18O, now);

    expect(keys()).toEqual(selectedDailyContractKeys(classicOgV18O, now, undefined, ROUND).sort());
    expect(keys()).toContain(NIGHTCLUB_CARD);
  });

  it('never deals a fourth card when the Nightclub opens mid-day', async () => {
    const now = dayWithNightclubCard();
    const unlocks = new Set<string>();
    const { db, keys } = fakeDb(unlocks);
    await syncDailyContractAttempts(db, 'player-1', classicOgV18O, now);
    const morning = keys();

    for (const key of ALL_UNLOCKS) unlocks.add(key);
    await syncDailyContractAttempts(db, 'player-1', classicOgV18O, new Date(now.getTime() + 60_000));
    expect(keys()).toEqual(morning);
  });
});
