import type { AdvisorSignalSnapshot } from '@streets/shared';

export const advisorFixtures: Record<string, AdvisorSignalSnapshot> = {
  zeroCash: {
    cashCents: 0, turns: 5, turnCap: 20, crewSize: 2, heat: null, heatMax: null,
    products: [{ key: 'BEER', quantity: 0 }], holdingsAvailable: false, quest: null, paused: false,
    rules: { heat: false, holdings: false, quests: false },
  },
  noTurns: {
    cashCents: 1000, turns: 0, turnCap: 20, crewSize: 2, heat: null, heatMax: null,
    products: null, holdingsAvailable: false, quest: null, paused: false,
    rules: { heat: false, holdings: false, quests: false },
  },
  maxedLateGame: {
    cashCents: 10_000_000, turns: 20, turnCap: 20, crewSize: 20, heat: 0, heatMax: 100,
    products: [{ key: 'BEER', quantity: 100 }], holdingsAvailable: false, quest: null, paused: false,
    rules: { heat: true, holdings: true, quests: true },
  },
  paused: {
    cashCents: 1000, turns: 0, turnCap: 20, crewSize: 2, heat: null, heatMax: null,
    products: [{ key: 'BEER', quantity: 0 }], holdingsAvailable: false, quest: null, paused: true,
    rules: { heat: false, holdings: false, quests: false },
  },
};
