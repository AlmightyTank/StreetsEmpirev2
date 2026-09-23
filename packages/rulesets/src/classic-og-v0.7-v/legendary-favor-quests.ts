import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Mama's endgame path was the one core contact without a Kingpin capstone.
 * The Quiet Hour closes that gap and is the one natural source for Ghost
 * Network. Pip and Tommy receive their Legendary markers from their existing
 * Kingpin capstones in index.ts.
 */
export const legendaryFavorQuests = {
  MAMA_QUIET_HOUR: {
    key: 'MAMA_QUIET_HOUR',
    title: 'The Quiet Hour',
    description: 'Mama wants proof that you can make the whole street move without noise: work hard, make serious money, and keep fresh people coming in while the city thinks nothing happened.',
    contactKey: 'MAMA_KING',
    type: 'SIDE',
    category: 'STREET',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'MAMA_HOUSE_FULL' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'MAMA_KING', points: 80 } },
    ],
    objectives: [
      {
        id: 'quiet_turns',
        kind: 'SPEND_TURNS',
        description: 'Spend 60 turns Scouting the streets.',
        target: 60,
        params: { eventTypes: ['SCOUT'] },
      },
      {
        id: 'quiet_take',
        kind: 'EARN_CASH',
        description: 'Earn $100,000 from Scout trips after accepting the contract.',
        target: 10_000_000,
        params: { eventTypes: ['SCOUT'] },
      },
      {
        id: 'quiet_recruits',
        kind: 'RECRUIT_CREW',
        description: 'Recruit 20 new crew members from Scout trips.',
        target: 20,
        params: { eventTypes: ['SCOUT'], crew: 'ANY' },
      },
    ],
    bonusObjectives: [
      {
        id: 'quiet_muscle',
        kind: 'STATE_AT_LEAST',
        description: 'Bonus: have at least 30 armed, fit thugs when the operation is ready.',
        target: 30,
        params: { field: 'armedThugs' },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 5_000_000 },
      { kind: 'FAVOR_ITEM', key: 'GHOST_NETWORK', amount: 1 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },
} as const satisfies QuestDefinitionCatalog;
