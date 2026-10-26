import type { QuestDefinitionCatalog } from '../types.js';

const after = (...questKeys: string[]) => questKeys.map((questKey) => ({
  kind: 'QUEST_COMPLETED' as const,
  params: { questKey },
}));

/** Current-round epilogues for the two contacts who carry the city's public face. */
export const contactSideStories: QuestDefinitionCatalog = {
  ML_A01_HOUSE_REMEMBERS: {
    key: 'ML_A01_HOUSE_REMEMBERS',
    title: 'The House Remembers',
    description: 'Ace wants to know whether the casino floor remembers you for your play, or only for the money you left behind.',
    contactKey: 'ACE',
    type: 'SIDE', category: 'CAMPAIGN', difficulty: 'STREET_JOB',
    prerequisites: after('ML_M25_MISSING_LINE'),
    objectives: [
      { id: 'session', kind: 'EVENT_COUNT', description: 'Open a casino session for Ace.', target: 1, params: { eventTypes: ['CASINO_SESSION_OPENED'] } },
      { id: 'wagers', kind: 'EVENT_COUNT', description: 'Place three casino wagers.', target: 3, params: { eventTypes: ['CASINO_WAGER'] } },
    ],
    bonusObjectives: [],
    rewards: [{ kind: 'CASH', amount: 400000 }, { kind: 'CONTACT_REP', key: 'ACE', amount: 8 }],
    story: {
      chapter: 'After the book closes',
      intro: 'Ace turns the guest list around. Your name is there, but the ink has not dried.',
      inProgress: 'Ace wants a clean read on your reputation. Open a session and put three real wagers on the floor; the game does not matter as much as showing up and staying visible.',
      ready: 'The dealer nods before you give your name. Ace closes the list. “That is recognition. Do not mistake it for trust.”',
      completed: 'Ace adds a second mark beside your name. The first says you arrived. The second says the house expects you back.',
      lesson: 'Ace’s standing follows ordinary casino play; the quest never changes the odds or rewards of the games.',
      actionHint: 'Open the Casino, start a session and place three wagers.',
    },
    followUpKeys: ['ML_A02_SEAT_AT_THE_TABLE'],
    repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },

  ML_A02_SEAT_AT_THE_TABLE: {
    key: 'ML_A02_SEAT_AT_THE_TABLE',
    title: 'A Seat at the Table',
    description: 'Ace has kept one seat open for the person who can take a bad night without making it everyone else’s problem.',
    contactKey: 'ACE',
    type: 'SIDE', category: 'CAMPAIGN', difficulty: 'SERIOUS_BUSINESS',
    prerequisites: after('ML_A01_HOUSE_REMEMBERS'),
    objectives: [{ id: 'result', kind: 'EVENT_COUNT', description: 'Finish a casino game session.', target: 1, params: { eventTypes: ['CASINO_RESULT'] } }],
    bonusObjectives: [],
    rewards: [{ kind: 'CASH', amount: 600000 }, { kind: 'CONTACT_REP', key: 'ACE', amount: 12 }],
    story: {
      chapter: 'After the book closes',
      intro: 'The seat beside the high-limit rail is empty. Ace does not point at it. She waits to see whether you notice.',
      inProgress: 'Finish a game session without chasing the room’s approval. Ace is watching how you leave as much as how you play.',
      ready: 'Ace takes your empty glass and sets it beside the guest list. “You came back with the same name you walked in with. That is rarer than a win.”',
      completed: 'The seat stays open when you leave. It is not a promise, but it is no longer an invitation meant for somebody else.',
      lesson: 'The house can recognize a player without changing the result of a game.',
      actionHint: 'Finish one casino game session, then return to Ace.',
    },
    followUpKeys: [],
    repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },

  ML_C01_KEEP_THE_HEAT_DOWN: {
    key: 'ML_C01_KEEP_THE_HEAT_DOWN',
    title: 'Keep the Heat Down',
    description: 'The Commissioner wants to know whether you can lower the temperature before the city decides to do it for you.',
    contactKey: 'COMMISSIONER',
    type: 'SIDE', category: 'CAMPAIGN', difficulty: 'STREET_JOB',
    prerequisites: after('ML_M25_MISSING_LINE'),
    objectives: [{ id: 'heat', kind: 'EVENT_COUNT', description: 'Pay down some Heat with a bribe.', target: 1, params: { eventTypes: ['HEAT_BRIBE'] } }],
    bonusObjectives: [],
    rewards: [{ kind: 'CASH', amount: 400000 }, { kind: 'CONTACT_REP', key: 'COMMISSIONER', amount: 8 }],
    story: {
      chapter: 'After the book closes',
      intro: 'The Commissioner looks at your heat total instead of offering a seat. “A city does not need a file to notice you.”',
      inProgress: 'Lower your Heat through the existing bribe action. He wants to see whether you can solve a problem before it becomes an arrest.',
      ready: 'He checks the new number. “Better. Not safe. Better.”',
      completed: 'The Commissioner makes one note: you paid to quiet the street before it had to get loud.',
      lesson: 'Heat is the live pressure that connects ordinary street work to arrests and busts.',
      actionHint: 'Open the Heat controls and pay down Heat with a bribe.',
    },
    followUpKeys: ['ML_C02_AFTER_THE_BUST'],
    repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },

  ML_C02_AFTER_THE_BUST: {
    key: 'ML_C02_AFTER_THE_BUST',
    title: 'After the Bust',
    description: 'The Commissioner wants to know what you do after the street collects its debt: disappear, panic, or come back with the truth.',
    contactKey: 'COMMISSIONER',
    type: 'SIDE', category: 'CAMPAIGN', difficulty: 'SERIOUS_BUSINESS',
    prerequisites: after('ML_C01_KEEP_THE_HEAT_DOWN'),
    objectives: [{ id: 'incident', kind: 'EVENT_COUNT', description: 'Live through an arrest or bust.', target: 1, params: { eventTypes: ['RUN_INCIDENT'] } }],
    bonusObjectives: [],
    rewards: [{ kind: 'CASH', amount: 600000 }, { kind: 'CONTACT_REP', key: 'COMMISSIONER', amount: 12 }],
    story: {
      chapter: 'After the book closes',
      intro: 'The Commissioner leaves the office door unlocked. “The street collected its debt,” he says. “Now we can discuss what you learned.”',
      inProgress: 'Take the lesson from an arrest or bust and come back. The Commissioner is not asking you to seek trouble; he is asking whether trouble changed how you operate.',
      ready: 'He listens to the account without interrupting. “Good. You remember the part that costs.”',
      completed: 'The Commissioner writes your name beside a short note: knows what a bust costs, and came back anyway.',
      lesson: 'Arrests and busts are live run incidents; they are not case or evidence records.',
      actionHint: 'Complete a run that ends in an arrest, then return to the Commissioner.',
    },
    followUpKeys: [],
    repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },
};
