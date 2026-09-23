import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Phase Y-F: limited-time holiday jobs.
 *
 * These are real-world seasonal windows, not round-quarter rotations. The
 * server evaluates the window against its authoritative clock before offering
 * or accepting the job.
 */
export const holidayEvents = {
  HALLOWEEN_WITCHING_RUN: {
    key: 'HALLOWEEN_WITCHING_RUN',
    title: 'The Witching Run',
    description: 'The city is dressed for the dead. Run the streets, make a little noise and bring three successful hits home before the moon gives way.',
    contactKey: null,
    type: 'EVENT',
    category: 'HALLOWEEN',
    difficulty: 'HIGH_RISK',
    prerequisites: [],
    objectives: [
      {
        id: 'halloween_scouts',
        kind: 'EVENT_COUNT',
        description: 'Complete 13 scouting actions.',
        target: 13,
        params: { eventTypes: ['SCOUT'] },
      },
      {
        id: 'halloween_wins',
        kind: 'EVENT_COUNT',
        description: 'Win 3 raids as the attacker.',
        target: 3,
        params: { eventTypes: ['RAID_ATTACK'], where: { won: true } },
      },
    ],
    bonusObjectives: [
      {
        id: 'halloween_run',
        kind: 'EVENT_COUNT',
        description: 'Bring an intercity run home during the event.',
        target: 1,
        params: { eventTypes: ['RUN_RETURNED'] },
      },
    ],
    rewards: [
      { kind: 'COSMETIC_UNLOCK', key: 'halloween-moon-2026' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: 72 * 60,
    availability: {
      seasonalEvent: {
        eventKey: 'HALLOWEEN_2026',
        startsAt: '2026-10-15T00:00:00.000Z',
        endsAt: '2026-11-03T00:00:00.000Z',
      },
      eventLabel: 'Halloween 2026',
    },
  },

  CHRISTMAS_MIDNIGHT_DELIVERY: {
    key: 'CHRISTMAS_MIDNIGHT_DELIVERY',
    title: 'Midnight Delivery',
    description: 'The holiday traffic is thick and nobody wants to make the last delivery. Get three runs home, keep the books moving and put ten new hands on the roster.',
    contactKey: null,
    type: 'EVENT',
    category: 'CHRISTMAS',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [],
    objectives: [
      {
        id: 'christmas_runs',
        kind: 'EVENT_COUNT',
        description: 'Bring 3 intercity runs home.',
        target: 3,
        params: { eventTypes: ['RUN_RETURNED'] },
      },
      {
        id: 'christmas_sales',
        kind: 'EVENT_SUM',
        description: 'Earn $100,000 through store sales.',
        target: 10_000_000,
        params: { eventTypes: ['STORE_SELL'], field: 'totalCents', display: 'CURRENCY' },
      },
      {
        id: 'christmas_thugs',
        kind: 'RECRUIT_CREW',
        description: 'Recruit 10 thugs.',
        target: 10,
        params: { eventTypes: ['RECRUIT'], crew: 'THUGS' },
      },
    ],
    bonusObjectives: [
      {
        id: 'christmas_scout',
        kind: 'EVENT_COUNT',
        description: 'Complete a scouting action while the event is active.',
        target: 1,
        params: { eventTypes: ['SCOUT'] },
      },
    ],
    rewards: [
      { kind: 'COSMETIC_UNLOCK', key: 'winter-christmas-2026' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: 72 * 60,
    availability: {
      seasonalEvent: {
        eventKey: 'CHRISTMAS_2026',
        startsAt: '2026-12-15T00:00:00.000Z',
        endsAt: '2027-01-06T00:00:00.000Z',
      },
      eventLabel: 'Christmas 2026',
    },
  },
} as const satisfies QuestDefinitionCatalog;
