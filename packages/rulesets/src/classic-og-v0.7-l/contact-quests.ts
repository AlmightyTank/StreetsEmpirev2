import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Quest roadmap Phase M: deeper side work for Wheels, Vic and Blocks.
 *
 * Every objective listens to an existing authoritative gameplay event. These
 * jobs do not add quest-only actions.
 */
export const contactExpansionQuests = {
  WHEELS_ROAD_TEST: {
    key: 'WHEELS_ROAD_TEST',
    title: 'Road Test',
    description: 'Wheels has seen one crew leave town. He wants to know whether you can make running the road part of the business instead of a one-off stunt.',
    contactKey: 'WHEELS',
    type: 'SIDE',
    category: 'TRAVEL',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'PACK_YOUR_BAGS' } },
    ],
    objectives: [
      {
        id: 'launch_runs',
        kind: 'EVENT_COUNT',
        description: 'Launch 3 intercity runs.',
        target: 3,
        params: { eventTypes: ['RUN_LAUNCHED'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'move_rides',
        kind: 'EVENT_SUM',
        description: 'Bonus: put 6 Low-Riders on the road across those launches.',
        target: 6,
        params: { eventTypes: ['RUN_LAUNCHED'], field: 'lowRiders' },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1500000 },
      { kind: 'ITEM', key: 'lowRiders', amount: 1 },
      { kind: 'CONTACT_REP', key: 'WHEELS', amount: 15 },
    ],
    followUpKeys: ['WHEELS_HEAVY_HAUL'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  WHEELS_HEAVY_HAUL: {
    key: 'WHEELS_HEAVY_HAUL',
    title: 'Heavy Haul',
    description: 'A couple of cars and an empty trunk do not impress Wheels. Put muscle and real capacity on the road and bring the crews back.',
    contactKey: 'WHEELS',
    type: 'SIDE',
    category: 'TRAVEL',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'WHEELS_ROAD_TEST' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'WHEELS', points: 30 } },
    ],
    objectives: [
      {
        id: 'escort_thugs',
        kind: 'EVENT_SUM',
        description: 'Launch runs carrying a total of 20 escort thugs.',
        target: 20,
        params: { eventTypes: ['RUN_LAUNCHED'], field: 'escortThugs' },
      },
      {
        id: 'low_riders',
        kind: 'EVENT_SUM',
        description: 'Launch runs using a total of 6 Low-Riders.',
        target: 6,
        params: { eventTypes: ['RUN_LAUNCHED'], field: 'lowRiders' },
      },
    ],
    bonusObjectives: [
      {
        id: 'returns',
        kind: 'EVENT_COUNT',
        description: 'Bonus: bring 2 runs all the way home.',
        target: 2,
        params: { eventTypes: ['RUN_RETURNED'] },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 2000000 },
      { kind: 'ITEM', key: 'beer', amount: 25 },
      { kind: 'CONTACT_REP', key: 'WHEELS', amount: 20 },
    ],
    followUpKeys: ['WHEELS_HOME_SAFE'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  WHEELS_HOME_SAFE: {
    key: 'WHEELS_HOME_SAFE',
    title: 'Home Safe',
    description: 'Wheels cares less about leaving than coming back. Put enough miles under the crew that a round trip feels routine.',
    contactKey: 'WHEELS',
    type: 'SIDE',
    category: 'TRAVEL',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'WHEELS_HEAVY_HAUL' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'WHEELS', points: 50 } },
    ],
    objectives: [
      {
        id: 'return_runs',
        kind: 'EVENT_COUNT',
        description: 'Bring 3 intercity runs home.',
        target: 3,
        params: { eventTypes: ['RUN_RETURNED'] },
      },
      {
        id: 'road_turns',
        kind: 'EVENT_SUM',
        description: 'Accumulate 30 turns of road travel on returned runs.',
        target: 30,
        params: { eventTypes: ['RUN_RETURNED'], field: 'turnsSpent' },
      },
    ],
    bonusObjectives: [
      {
        id: 'clean_return',
        kind: 'EVENT_COUNT',
        description: 'Bonus: bring one run home without a road incident.',
        target: 1,
        params: { eventTypes: ['RUN_RETURNED'], where: { incidents: [] } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 2500000 },
      { kind: 'ITEM', key: 'lowRiders', amount: 2 },
      { kind: 'CONTACT_REP', key: 'WHEELS', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  VIC_GREASE_THE_WHEEL: {
    key: 'VIC_GREASE_THE_WHEEL',
    title: 'Grease the Wheel',
    description: 'Vic says Heat is just another bill if you know who takes the envelope. Pay enough pressure down to prove you understand the arrangement.',
    contactKey: 'VIC',
    type: 'SIDE',
    category: 'HEAT',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'PAYDAY' } },
    ],
    objectives: [
      {
        id: 'bribe_points',
        kind: 'EVENT_SUM',
        description: 'Bribe away 10 Heat.',
        target: 10,
        params: { eventTypes: ['HEAT_BRIBE'], field: 'points' },
      },
    ],
    bonusObjectives: [
      {
        id: 'clear_heat',
        kind: 'EVENT_COUNT',
        description: 'Bonus: make one bribe that leaves you at 0 Heat.',
        target: 1,
        params: { eventTypes: ['HEAT_BRIBE'], where: { heatAfter: 0 } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1000000 },
      { kind: 'ITEM', key: 'medicine', amount: 5 },
      { kind: 'CONTACT_REP', key: 'VIC', amount: 15 },
    ],
    followUpKeys: ['VIC_PRICE_OF_SILENCE'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  VIC_PRICE_OF_SILENCE: {
    key: 'VIC_PRICE_OF_SILENCE',
    title: 'Price of Silence',
    description: 'One envelope is panic. Vic wants a client who knows how to keep pressure from becoming a crisis.',
    contactKey: 'VIC',
    type: 'SIDE',
    category: 'HEAT',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'VIC_GREASE_THE_WHEEL' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'VIC', points: 15 } },
    ],
    objectives: [
      {
        id: 'bribe_count',
        kind: 'EVENT_COUNT',
        description: 'Make 3 successful Heat bribes.',
        target: 3,
        params: { eventTypes: ['HEAT_BRIBE'] },
      },
      {
        id: 'bribe_points',
        kind: 'EVENT_SUM',
        description: 'Remove a total of 15 Heat with those bribes.',
        target: 15,
        params: { eventTypes: ['HEAT_BRIBE'], field: 'points' },
      },
    ],
    bonusObjectives: [
      {
        id: 'clean_finish',
        kind: 'EVENT_COUNT',
        description: 'Bonus: finish one of those bribes at 0 Heat.',
        target: 1,
        params: { eventTypes: ['HEAT_BRIBE'], where: { heatAfter: 0 } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1500000 },
      { kind: 'ITEM', key: 'medicine', amount: 10 },
      { kind: 'CONTACT_REP', key: 'VIC', amount: 20 },
    ],
    followUpKeys: ['VIC_CLEAN_SLATE'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  VIC_CLEAN_SLATE: {
    key: 'VIC_CLEAN_SLATE',
    title: 'Clean Slate',
    description: 'Vic wants the whole board quiet. Work off real pressure, then make the final envelope leave nobody looking for you.',
    contactKey: 'VIC',
    type: 'SIDE',
    category: 'HEAT',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'VIC_PRICE_OF_SILENCE' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'VIC', points: 35 } },
    ],
    objectives: [
      {
        id: 'remove_heat',
        kind: 'EVENT_SUM',
        description: 'Bribe away 20 Heat.',
        target: 20,
        params: { eventTypes: ['HEAT_BRIBE'], field: 'points' },
      },
      {
        id: 'zero_heat',
        kind: 'EVENT_COUNT',
        description: 'Make a successful bribe that leaves you at 0 Heat.',
        target: 1,
        params: { eventTypes: ['HEAT_BRIBE'], where: { heatAfter: 0 } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2000000 },
      { kind: 'ITEM', key: 'medicine', amount: 15 },
      { kind: 'CONTACT_REP', key: 'VIC', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  BLOCKS_FORTIFY: {
    key: 'BLOCKS_FORTIFY',
    title: 'Fortify the Corner',
    description: 'Taking a block gets attention. Blocks wants to see whether you know how to put enough muscle on a corner to keep it from looking cheap.',
    contactKey: 'BLOCKS',
    type: 'SIDE',
    category: 'TURF',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'PLANT_THE_FLAG' } },
    ],
    objectives: [
      {
        id: 'post_thugs',
        kind: 'EVENT_SUM',
        description: 'Post 15 thugs onto turf you already hold.',
        target: 15,
        params: { eventTypes: ['TURF_POST'], field: 'thugs' },
      },
    ],
    bonusObjectives: [
      {
        id: 'posted_total',
        kind: 'STATE_AT_LEAST',
        description: 'Bonus: have at least 25 thugs posted on turf.',
        target: 25,
        params: { eventTypes: ['TURF_POST'], field: 'postedThugs' },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 1500000 },
      { kind: 'ITEM', key: 'beer', amount: 25 },
      { kind: 'CONTACT_REP', key: 'BLOCKS', amount: 15 },
    ],
    followUpKeys: ['BLOCKS_TAKE_SOMETHING'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  BLOCKS_TAKE_SOMETHING: {
    key: 'BLOCKS_TAKE_SOMETHING',
    title: 'Take Something',
    description: 'Blocks is done watching you bully locals. Take ground from crews who know what the block is worth.',
    contactKey: 'BLOCKS',
    type: 'SIDE',
    category: 'TURF',
    difficulty: 'HIGH_RISK',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'BLOCKS_FORTIFY' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'BLOCKS', points: 35 } },
    ],
    objectives: [
      {
        id: 'push_wins',
        kind: 'WIN_EVENTS',
        description: 'Win 2 settled turf pushes as the attacker.',
        target: 2,
        params: { eventTypes: ['TURF_PUSH_ATTACK'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'posted_attackers',
        kind: 'EVENT_SUM',
        description: 'Bonus: leave a total of 20 attacking thugs posted after won pushes.',
        target: 20,
        params: { eventTypes: ['TURF_PUSH_ATTACK'], field: 'posted', where: { won: true } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 2500000 },
      { kind: 'ITEM', key: 'medicine', amount: 10 },
      { kind: 'CONTACT_REP', key: 'BLOCKS', amount: 20 },
    ],
    followUpKeys: ['BLOCKS_OUT_OF_TOWN'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  BLOCKS_OUT_OF_TOWN: {
    key: 'BLOCKS_OUT_OF_TOWN',
    title: 'Out-of-Town Box',
    description: 'Blocks wants proof your name carries past your home city. Put a funded outpost on an away block and make it worth defending.',
    contactKey: 'BLOCKS',
    type: 'SIDE',
    category: 'TURF',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'BLOCKS_TAKE_SOMETHING' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'BLOCKS', points: 55 } },
    ],
    objectives: [
      {
        id: 'establish_outpost',
        kind: 'WIN_EVENTS',
        description: 'Successfully establish one away-city turf outpost.',
        target: 1,
        params: { eventTypes: ['TURF_OUTPOST_ESTABLISH'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'seed_cash',
        kind: 'EVENT_SUM',
        description: 'Bonus: seed that successful outpost with at least $10,000 cash.',
        target: 1000000,
        params: { eventTypes: ['TURF_OUTPOST_ESTABLISH'], field: 'cashCents', where: { won: true } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 3000000 },
      { kind: 'ITEM', key: 'beer', amount: 50 },
      { kind: 'ITEM', key: 'medicine', amount: 15 },
      { kind: 'CONTACT_REP', key: 'BLOCKS', amount: 25 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },
} as const satisfies QuestDefinitionCatalog;
