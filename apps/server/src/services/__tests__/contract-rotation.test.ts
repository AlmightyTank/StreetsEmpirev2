import { describe, expect, it } from 'vitest';
import { classicOgV14A, classicOgV14A2 } from '@streets/rulesets';
import { cityContractOffers, cityContractWindow } from '../city-contract.service.js';
import { deckOrder } from '../contract-rotation.js';
import { DAILY_CONTRACT_SLOTS, selectedDailyContractKeys } from '../daily-contract.service.js';
import { WEEKLY_CONTRACT_SLOTS, selectedWeeklyContractKeys } from '../weekly-contract.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const start = new Date('2026-10-05T15:00:00.000Z');

function poolSize(type: 'DAILY' | 'WEEKLY'): number {
  return Object.values(classicOgV14A2.questDefinitions).filter((quest) => quest.type === type).length;
}

describe('contract deck rotation', () => {
  it('deals every card once before any card repeats', () => {
    const keys = Array.from({ length: 12 }, (_, index) => `K${index}`);
    const dealt = [0, 1, 2, 3].flatMap((board) => deckOrder(keys, 'seed', board, 3).slice(0, 3));
    expect(new Set(dealt).size).toBe(12);
    expect(deckOrder(keys, 'seed', 4, 3).slice(0, 3)).not.toEqual(deckOrder(keys, 'seed', 0, 3).slice(0, 3));
  });

  it('deals every daily contract once a cycle and never twice within five days', () => {
    const cycleDays = poolSize('DAILY') / DAILY_CONTRACT_SLOTS;
    const lastSeen = new Map<string, number>();
    const counts = new Map<string, number>();
    for (let day = 0; day < cycleDays * 10; day += 1) {
      const board = selectedDailyContractKeys(classicOgV14A2, new Date(start.getTime() + day * DAY_MS), undefined, 'round-one');
      expect(new Set(board).size).toBe(DAILY_CONTRACT_SLOTS);
      for (const key of board) {
        if (lastSeen.has(key)) expect(day - lastSeen.get(key)!, key).toBeGreaterThanOrEqual(5);
        lastSeen.set(key, day);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(poolSize('DAILY'));
    for (const count of counts.values()) expect(count).toBeGreaterThanOrEqual(9);
  });

  it('gives a new round a different daily and weekly board', () => {
    const rounds = ['round-one', 'round-two', 'round-three'];
    const dailies = rounds.map((round) => selectedDailyContractKeys(classicOgV14A2, start, undefined, round).join());
    const weeklies = rounds.map((round) => selectedWeeklyContractKeys(classicOgV14A2, start, undefined, round).join());
    expect(new Set(dailies).size).toBe(3);
    expect(new Set(weeklies).size).toBe(3);
    expect(selectedDailyContractKeys(classicOgV14A2, start, undefined, 'round-one'))
      .toEqual(selectedDailyContractKeys(classicOgV14A2, start, undefined, 'round-one'));
  });

  it('deals every weekly contract once a cycle, never within four weeks, on mixed boards', () => {
    const cycleWeeks = poolSize('WEEKLY') / WEEKLY_CONTRACT_SLOTS;
    const categoryOf = (key: string) => classicOgV14A2.questDefinitions[key as keyof typeof classicOgV14A2.questDefinitions].category;
    for (const round of ['round-one', 'round-two', 'round-three']) {
      const lastSeen = new Map<string, number>();
      let mixed = 0;
      const weeks = cycleWeeks * 6;
      for (let week = 0; week < weeks; week += 1) {
        const board = selectedWeeklyContractKeys(classicOgV14A2, new Date(start.getTime() + week * WEEK_MS), undefined, round);
        expect(new Set(board).size).toBe(WEEKLY_CONTRACT_SLOTS);
        if (categoryOf(board[0]!) !== categoryOf(board[1]!)) mixed += 1;
        for (const key of board) {
          if (lastSeen.has(key)) expect(week - lastSeen.get(key)!, `${round} ${key}`).toBeGreaterThanOrEqual(4);
          lastSeen.set(key, week);
        }
      }
      expect(lastSeen.size).toBe(poolSize('WEEKLY'));
      expect(mixed / weeks).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('leaves the shared rotation of older rulesets untouched', () => {
    expect(selectedDailyContractKeys(classicOgV14A, start, undefined, 'round-one'))
      .toEqual(selectedDailyContractKeys(classicOgV14A, start));
    expect(selectedWeeklyContractKeys(classicOgV14A, start, undefined, 'round-one'))
      .toEqual(selectedWeeklyContractKeys(classicOgV14A, start));
    const window = cityContractWindow(start);
    expect(cityContractOffers(classicOgV14A, 'round-one', window)).toHaveLength(2);
  });

  it('never posts two city orders in one city and leans away from the last board', () => {
    let repeats = 0;
    let boards = 0;
    for (const round of ['round-one', 'round-two', 'round-three']) {
      let previous: string[] = [];
      for (let window = 0; window < 14; window += 1) {
        const offers = cityContractOffers(classicOgV14A2, round, cityContractWindow(new Date(start.getTime() + window * DAY_MS / 2)));
        expect(offers).toHaveLength(2);
        const cities = offers.map((offer) => offer.city);
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
});
