import type { QuestDefinitionCatalog } from '../types.js';

/** Theo thresholds for Ace's status jobs: the 1.2.0-E Regular and High Roller tiers. */
export const ACE_REGULAR_THEO_CENTS = 25_000;
export const ACE_HIGH_ROLLER_THEO_CENTS = 2_500_000;

/**
 * 1.2.0-F. Ace's casino Jobs.
 *
 * Every objective is driven by normal casino play: the `CASINO_WAGER` and
 * `CASINO_RESULT` signals the casino games emit, plus the existing
 * `CASINO_SESSION_OPENED` and `CASINO_COMP_HOTEL` activities. Nothing here adds a
 * quest-only button.
 *
 * Guardrail: casino Jobs pay contact standing and cosmetics only. They never pay
 * cash, items, product or turns, so a Job can never make gambling a better way to
 * earn seasonal money.
 */
export const casinoJobs = {
  ACE_HOUSE_RULES: {
    key: 'ACE_HOUSE_RULES',
    title: 'House Rules',
    description: 'Ace runs the guest list for every casino on the circuit. Before she vouches for anyone, she wants to see them buy in and play like they belong.',
    story: {
      chapter: 'Casino: First night',
      intro: 'Ace looks you over from behind the host stand. "Everybody wants to be a high roller. Nobody wants to be a regular first. Sit down. Play. Let the room see you."',
      inProgress: 'Ace wants a floor bankroll opened and a few real wagers on the table. The game does not matter. Showing up does.',
      ready: '"Good," Ace says, without looking up from her list. "Now the dealers have seen you twice."',
      completed: 'Ace writes your name on a card and slides it into her pocket. It is the first time she has kept anything of yours.',
      lesson: 'Buy chips at the cage, open a floor bankroll, then play any casino game. Status grows from the posted house edge of each wager, win or lose.',
      actionHint: 'Open the Casino, open a session bankroll and place five wagers.',
    },
    contactKey: 'ACE',
    type: 'SIDE',
    category: 'CASINO',
    difficulty: 'STREET_JOB',
    prerequisites: [],
    objectives: [
      {
        id: 'open_bankroll',
        kind: 'EVENT_COUNT',
        description: 'Open a casino floor bankroll.',
        target: 1,
        params: { eventTypes: ['CASINO_SESSION_OPENED'] },
      },
      {
        id: 'wagers',
        kind: 'EVENT_COUNT',
        description: 'Place 5 casino wagers.',
        target: 5,
        params: { eventTypes: ['CASINO_WAGER'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'first_win',
        kind: 'WIN_EVENTS',
        description: 'Walk away from one hand, spin or roll ahead.',
        target: 1,
        params: { eventTypes: ['CASINO_RESULT'] },
      },
    ],
    rewards: [
      { kind: 'CONTACT_REP', key: 'ACE', amount: 10 },
    ],
    followUpKeys: ['ACE_FLOOR_TOUR', 'ACE_KNOWN_FACE', 'ACE_NATURAL'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  ACE_FLOOR_TOUR: {
    key: 'ACE_FLOOR_TOUR',
    title: 'Tour of the Floor',
    description: 'Ace wants guests who know the whole room, not one machine. Sit down at the different games the house runs.',
    contactKey: 'ACE',
    type: 'SIDE',
    category: 'CASINO',
    difficulty: 'STREET_JOB',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_HOUSE_RULES' } },
    ],
    objectives: [
      {
        id: 'games',
        kind: 'UNIQUE_VALUES',
        description: 'Wager on 4 different casino games.',
        target: 4,
        params: { eventTypes: ['CASINO_WAGER'], field: 'game' },
      },
    ],
    bonusObjectives: [
      {
        id: 'every_game',
        kind: 'UNIQUE_VALUES',
        description: 'Wager on all 5 casino games.',
        target: 5,
        params: { eventTypes: ['CASINO_WAGER'], field: 'game' },
      },
    ],
    rewards: [
      { kind: 'CONTACT_REP', key: 'ACE', amount: 15 },
      { kind: 'COSMETIC_UNLOCK', key: 'ace-floor-walker' },
    ],
    followUpKeys: ['ACE_ROAD_GAME'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  ACE_KNOWN_FACE: {
    key: 'ACE_KNOWN_FACE',
    title: 'Known Face',
    description: 'The rooms rate every guest. Ace wants you rated as a Regular before she starts making calls for you.',
    contactKey: 'ACE',
    type: 'SIDE',
    category: 'CASINO',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_HOUSE_RULES' } },
    ],
    objectives: [
      {
        id: 'regular',
        kind: 'STATE_AT_LEAST',
        description: 'Reach Regular casino status ($250 of rated theo).',
        target: ACE_REGULAR_THEO_CENTS,
        params: { eventTypes: ['CASINO_WAGER'], field: 'casinoTheoCents', display: 'CURRENCY' },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CONTACT_REP', key: 'ACE', amount: 15 },
    ],
    followUpKeys: ['ACE_VELVET_ROPE', 'ACE_ON_THE_HOUSE'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  ACE_NATURAL: {
    key: 'ACE_NATURAL',
    title: 'Natural Talent',
    description: 'Ace says every regular remembers their first natural. Sit at a blackjack table until the shoe gives you one.',
    contactKey: 'ACE',
    type: 'SIDE',
    category: 'CASINO',
    difficulty: 'STREET_JOB',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_HOUSE_RULES' } },
    ],
    objectives: [
      {
        id: 'natural',
        kind: 'EVENT_COUNT',
        description: 'Be dealt a natural blackjack.',
        target: 1,
        params: { eventTypes: ['CASINO_RESULT'], where: { highlight: 'NATURAL' } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CONTACT_REP', key: 'ACE', amount: 10 },
      { kind: 'COSMETIC_UNLOCK', key: 'ace-natural' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  ACE_ROAD_GAME: {
    key: 'ACE_ROAD_GAME',
    title: 'Road Game',
    description: 'A regular in one room is a local. Ace wants you known on the circuit. Take a trip and play somewhere new.',
    contactKey: 'ACE',
    type: 'SIDE',
    category: 'CASINO',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_FLOOR_TOUR' } },
    ],
    objectives: [
      {
        id: 'cities',
        kind: 'UNIQUE_VALUES',
        description: 'Wager at casinos in 3 different cities.',
        target: 3,
        params: { eventTypes: ['CASINO_WAGER'], field: 'citySlug' },
      },
    ],
    bonusObjectives: [
      {
        id: 'comped',
        kind: 'EVENT_COUNT',
        description: 'Let the house comp your hotel on a trip.',
        target: 1,
        params: { eventTypes: ['CASINO_COMP_HOTEL'] },
      },
    ],
    rewards: [
      { kind: 'CONTACT_REP', key: 'ACE', amount: 20 },
      { kind: 'COSMETIC_UNLOCK', key: 'ace-road-gambler' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  ACE_ON_THE_HOUSE: {
    key: 'ACE_ON_THE_HOUSE',
    title: 'On the House',
    description: 'Regulars do not pay for their rooms. Ace wants to see you spend comps on a hotel stay while you are out on a trip.',
    contactKey: 'ACE',
    type: 'SIDE',
    category: 'CASINO',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_KNOWN_FACE' } },
    ],
    objectives: [
      {
        id: 'comp_hotel',
        kind: 'EVENT_COUNT',
        description: 'Use comps to extend a trip’s hotel stay in a casino city.',
        target: 1,
        params: { eventTypes: ['CASINO_COMP_HOTEL'] },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CONTACT_REP', key: 'ACE', amount: 15 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  ACE_VELVET_ROPE: {
    key: 'ACE_VELVET_ROPE',
    title: 'Behind the Velvet Rope',
    description: 'Ace has put in a word with the door. Get into a VIP room and play where the regulars play.',
    contactKey: 'ACE',
    type: 'SIDE',
    category: 'CASINO',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_KNOWN_FACE' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'ACE', points: 30 } },
    ],
    objectives: [
      {
        id: 'vip_wagers',
        kind: 'EVENT_COUNT',
        description: 'Place 5 wagers at VIP room tables.',
        target: 5,
        params: { eventTypes: ['CASINO_WAGER'], where: { room: 'VIP' } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CONTACT_REP', key: 'ACE', amount: 20 },
      { kind: 'COSMETIC_UNLOCK', key: 'ace-velvet-rope' },
    ],
    followUpKeys: ['ACE_BLACK_ROOM'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  ACE_BLACK_ROOM: {
    key: 'ACE_BLACK_ROOM',
    title: 'The Black Room',
    description: 'One room is left on Ace’s list: the Empire Black Room in Las Vegas. High Rollers only, and visitors walk in with respect.',
    story: {
      chapter: 'Casino: The Black Room',
      intro: 'Ace hands you a black card with no name on it. "Vegas. The back of the Empire. If they let you sit, you never needed me."',
      inProgress: 'Ace wants you at High Roller status and seated in the Empire Black Room. Fly in with bodyguards: the door asks visitors for respect.',
      ready: 'Ace hears about your night before you tell her. "They asked who sent you," she says. "I told them nobody did."',
      completed: 'Ace takes her card back and gives you a rose-colored one in its place. Every door on the circuit opens to it.',
      lesson: 'High Roller status opens the Black Room. A visiting boss also needs two fit bodyguards, or a Casino Front in Las Vegas.',
      actionHint: 'Reach High Roller status, then play three wagers at Black Room or Salon tables in Las Vegas.',
    },
    contactKey: 'ACE',
    type: 'SIDE',
    category: 'CASINO',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_VELVET_ROPE' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'ACE_ROAD_GAME' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'ACE', points: 80 } },
    ],
    objectives: [
      {
        id: 'high_roller',
        kind: 'STATE_AT_LEAST',
        description: 'Reach High Roller casino status ($25,000 of rated theo).',
        target: ACE_HIGH_ROLLER_THEO_CENTS,
        params: { eventTypes: ['CASINO_WAGER'], field: 'casinoTheoCents', display: 'CURRENCY' },
      },
      {
        id: 'black_room',
        kind: 'EVENT_COUNT',
        description: 'Place 3 wagers in the Empire Black Room in Las Vegas.',
        target: 3,
        params: { eventTypes: ['CASINO_WAGER'], where: { room: 'VIP', citySlug: 'las-vegas' } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CONTACT_REP', key: 'ACE', amount: 40 },
      { kind: 'COSMETIC_UNLOCK', key: 'ace-black-room' },
      { kind: 'COSMETIC_UNLOCK', key: 'ace-velvet-rose' },
      { kind: 'COSMETIC_UNLOCK', key: 'ace-velvet-rope-frame' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },
} as const satisfies QuestDefinitionCatalog;
