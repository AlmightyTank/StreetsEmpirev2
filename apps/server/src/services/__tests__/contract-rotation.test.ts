import { describe, expect, it } from 'vitest';
import { advanceQuestObjective, classicOgV14B, classicOgV14B2 } from '@streets/rulesets';
import {
  CITY_JOB_CASINO_WAGERS,
  cityContractObjectives,
  cityContractOffers,
  cityContractRewards,
  cityContractSlots,
  cityContractState,
  cityContractWindow,
} from '../city-contract.service.js';
import { deckOrder } from '../contract-rotation.js';
import { DAILY_CONTRACT_SLOTS, selectedDailyContractKeys } from '../daily-contract.service.js';
import {
  SEASON_CONTRACT_SLOTS,
  selectedSeasonContractKeys,
  syncSeasonContractAttempts,
} from '../season-contract.service.js';
import type { Db } from '../../utils/db.js';
import { WEEKLY_CONTRACT_SLOTS, selectedWeeklyContractKeys } from '../weekly-contract.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const start = new Date('2026-10-05T15:00:00.000Z');

function poolSize(type: 'DAILY' | 'WEEKLY'): number {
  return Object.values(classicOgV14B2.questDefinitions).filter((quest) => quest.type === type).length;
}

describe('contract deck rotation', () => {
  it('deals every card once before any card repeats', () => {
    const keys = Array.from({ length: 12 }, (_, index) => `K${index}`);
    const dealt = [0, 1, 2, 3].flatMap((board) => deckOrder(keys, 'seed', board, 3).slice(0, 3));
    expect(new Set(dealt).size).toBe(12);
    expect(deckOrder(keys, 'seed', 4, 3).slice(0, 3)).not.toEqual(deckOrder(keys, 'seed', 0, 3).slice(0, 3));
  });

  it('deals every daily contract once a cycle and never twice within six days', () => {
    const cycleDays = poolSize('DAILY') / DAILY_CONTRACT_SLOTS;
    const lastSeen = new Map<string, number>();
    const counts = new Map<string, number>();
    for (let day = 0; day < cycleDays * 10; day += 1) {
      const board = selectedDailyContractKeys(classicOgV14B2, new Date(start.getTime() + day * DAY_MS), undefined, 'round-one');
      expect(new Set(board).size).toBe(DAILY_CONTRACT_SLOTS);
      for (const key of board) {
        if (lastSeen.has(key)) expect(day - lastSeen.get(key)!, key).toBeGreaterThanOrEqual(6);
        lastSeen.set(key, day);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(poolSize('DAILY'));
    for (const count of counts.values()) expect(count).toBeGreaterThanOrEqual(9);
  });

  it('gives a new round a different daily and weekly board', () => {
    const rounds = ['round-one', 'round-two', 'round-three'];
    const dailies = rounds.map((round) => selectedDailyContractKeys(classicOgV14B2, start, undefined, round).join());
    const weeklies = rounds.map((round) => selectedWeeklyContractKeys(classicOgV14B2, start, undefined, round).join());
    expect(new Set(dailies).size).toBe(3);
    expect(new Set(weeklies).size).toBe(3);
    expect(selectedDailyContractKeys(classicOgV14B2, start, undefined, 'round-one'))
      .toEqual(selectedDailyContractKeys(classicOgV14B2, start, undefined, 'round-one'));
  });

  it('deals every weekly contract once a cycle, never within five weeks, on mixed boards', () => {
    const cycleWeeks = poolSize('WEEKLY') / WEEKLY_CONTRACT_SLOTS;
    const categoryOf = (key: string) => classicOgV14B2.questDefinitions[key as keyof typeof classicOgV14B2.questDefinitions].category;
    for (const round of ['round-one', 'round-two', 'round-three']) {
      const lastSeen = new Map<string, number>();
      let mixed = 0;
      const weeks = cycleWeeks * 6;
      for (let week = 0; week < weeks; week += 1) {
        const board = selectedWeeklyContractKeys(classicOgV14B2, new Date(start.getTime() + week * WEEK_MS), undefined, round);
        expect(new Set(board).size).toBe(WEEKLY_CONTRACT_SLOTS);
        if (categoryOf(board[0]!) !== categoryOf(board[1]!)) mixed += 1;
        for (const key of board) {
          if (lastSeen.has(key)) expect(week - lastSeen.get(key)!, `${round} ${key}`).toBeGreaterThanOrEqual(5);
          lastSeen.set(key, week);
        }
      }
      expect(lastSeen.size).toBe(poolSize('WEEKLY'));
      expect(mixed / weeks).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('leaves the shared rotation of older rulesets untouched', () => {
    expect(selectedDailyContractKeys(classicOgV14B, start, undefined, 'round-one'))
      .toEqual(selectedDailyContractKeys(classicOgV14B, start));
    expect(selectedWeeklyContractKeys(classicOgV14B, start, undefined, 'round-one'))
      .toEqual(selectedWeeklyContractKeys(classicOgV14B, start));
    const window = cityContractWindow(start);
    expect(cityContractOffers(classicOgV14B, 'round-one', window)).toHaveLength(2);
  });

  it('never posts two city orders in one city and leans away from the last board', () => {
    let repeats = 0;
    let boards = 0;
    for (const round of ['round-one', 'round-two', 'round-three']) {
      let previous: string[] = [];
      for (let window = 0; window < 14; window += 1) {
        const offers = cityContractOffers(classicOgV14B2, round, cityContractWindow(new Date(start.getTime() + window * DAY_MS / 2)));
        expect(offers).toHaveLength(3);
        const cities = offers.slice(0, 2).map((offer) => offer.city);
        expect(new Set(cities).size).toBe(2);
        if (window > 0) {
          boards += 1;
          if (cities.some((city) => previous.includes(city))) repeats += 1;
        }
        previous = cities;
      }
    }
    expect(repeats / boards).toBeLessThan(0.25);
  });

  it('adds a third city job slot in a city the market orders did not pick', () => {
    expect(cityContractSlots(classicOgV14B2)).toBe(3);
    expect(cityContractSlots(classicOgV14B)).toBe(2);
    const kinds = new Set<string>();
    for (let window = 0; window < 40; window += 1) {
      const offers = cityContractOffers(classicOgV14B2, 'round-one', cityContractWindow(new Date(start.getTime() + window * DAY_MS / 2)));
      const job = offers[2]!;
      expect(offers.slice(0, 2).every((offer) => offer.kind === undefined)).toBe(true);
      expect(['TRIP', 'CASINO']).toContain(job.kind);
      expect(job.city).not.toBe(classicOgV14B2.round.startingCitySlug);
      expect(offers.slice(0, 2).map((offer) => offer.city)).not.toContain(job.city);
      kinds.add(job.kind!);
    }
    expect([...kinds].sort()).toEqual(['CASINO', 'TRIP']);
  });

  it('tracks a fly-in on a trip home from that city only', () => {
    const job = { kind: 'TRIP', windowStart: 'w', windowEnd: 'w', city: 'detroit', cityName: 'Detroit', product: '', productName: '', condition: 'Fly-In', title: 'Detroit: Fly-In Meeting', description: 'd', target: 1, expectedUnitCents: 0, expectedSaleCents: 0, bonusCents: 2_000_000, payoutMultiplier: 1 };
    const objective = cityContractObjectives({ cityContract: job })![0]!;
    expect(advanceQuestObjective(objective, { type: 'TRIP_RETURNED', payload: { city: 'detroit' } }).amount).toBe(1);
    expect(advanceQuestObjective(objective, { type: 'TRIP_RETURNED', payload: { city: 'seattle' } }).amount).toBe(0);
    expect(advanceQuestObjective(objective, { type: 'RUN_TRADE', payload: { city: 'detroit', quantity: 5 } }).amount).toBe(0);
    expect(cityContractRewards({ cityContract: job })).toEqual([{ kind: 'CASH', amount: 2_000_000 }]);
  });

  it('tracks a casino job on wagers in that city only', () => {
    const job = { kind: 'CASINO', windowStart: 'w', windowEnd: 'w', city: 'las-vegas', cityName: 'Las Vegas', product: '', productName: '', condition: 'House Guest', title: 't', description: 'd', target: CITY_JOB_CASINO_WAGERS, expectedUnitCents: 0, expectedSaleCents: 0, bonusCents: 1_500_000, payoutMultiplier: 1 };
    const objective = cityContractObjectives({ cityContract: job })![0]!;
    expect(objective.target).toBe(CITY_JOB_CASINO_WAGERS);
    expect(advanceQuestObjective(objective, { type: 'CASINO_WAGER', payload: { citySlug: 'las-vegas', game: 'ROULETTE' } }).amount).toBe(1);
    expect(advanceQuestObjective(objective, { type: 'CASINO_WAGER', payload: { citySlug: 'detroit', game: 'ROULETTE' } }).amount).toBe(0);
  });

  it('still reads pre-B2 city orders as market sales and rejects unknown kinds', () => {
    const legacy = { windowStart: 'w', windowEnd: 'w', city: 'detroit', cityName: 'Detroit', product: 'METH', productName: 'Meth', condition: 'Shortage', title: 't', description: 'd', target: 250, expectedUnitCents: 100, expectedSaleCents: 20_000, bonusCents: 7_000, payoutMultiplier: 1.35 };
    expect(cityContractState({ cityContract: legacy })?.kind).toBeUndefined();
    expect(cityContractObjectives({ cityContract: legacy })![0]!.params?.eventTypes).toEqual(['RUN_TRADE', 'STORE_SELL']);
    expect(cityContractState({ cityContract: { ...legacy, kind: 'HEIST' } })).toBeNull();
  });

  it('deals each round its own season board of three different categories', () => {
    const categoryOf = (key: string) => classicOgV14B2.questDefinitions[key as keyof typeof classicOgV14B2.questDefinitions].category;
    const boards = Array.from({ length: 12 }, (_, index) => selectedSeasonContractKeys(classicOgV14B2, `round-${index}`));
    for (const board of boards) {
      expect(board).toHaveLength(SEASON_CONTRACT_SLOTS);
      expect(new Set(board.map(categoryOf)).size).toBe(SEASON_CONTRACT_SLOTS);
    }
    expect(new Set(boards.map((board) => [...board].sort().join())).size).toBeGreaterThanOrEqual(8);
    expect(new Set(boards.flat()).size).toBe(9);
    expect(selectedSeasonContractKeys(classicOgV14B, 'round-1')).toEqual([]);
  });

  it('offers the season board once and never re-offers a finished contract', async () => {
    const definitionRows = Object.values(classicOgV14B2.questDefinitions)
      .filter((quest) => quest.type === 'SEASON')
      .map((quest, index) => ({ id: 'season-' + index, key: quest.key }));
    const quests: Array<{ questDefinitionId: string; status: string }> = [];
    const db = {
      roundPlayer: { findUnique: async () => ({ roundId: 'round-one' }) },
      questDefinition: { findMany: async () => definitionRows },
      playerQuest: {
        findMany: async () => quests.map((row) => ({ questDefinitionId: row.questDefinitionId })),
        create: async ({ data }: { data: { questDefinitionId: string; status: string } }) => {
          quests.push({ questDefinitionId: data.questDefinitionId, status: data.status });
          return data;
        },
      },
    } as unknown as Db;

    const first = await syncSeasonContractAttempts(db, 'player-1', classicOgV14B2);
    expect(first).toEqual(selectedSeasonContractKeys(classicOgV14B2, 'round-one', new Set(definitionRows.map((row) => row.key))));
    expect(quests.every((row) => row.status === 'AVAILABLE')).toBe(true);
    quests[0]!.status = 'COMPLETED';
    expect(await syncSeasonContractAttempts(db, 'player-1', classicOgV14B2)).toEqual([]);
    expect(quests).toHaveLength(SEASON_CONTRACT_SLOTS);
  });
});
