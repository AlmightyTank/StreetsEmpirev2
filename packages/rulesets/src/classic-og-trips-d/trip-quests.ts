import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Trips D: jobs that only happen in person. Every objective listens to an event only a
 * real trip or a run with the boss aboard can produce (TRIP_RETURNED, RUN_RETURNED with
 * `bossAboard`), so nobody finishes one from home.
 */
export const tripQuests = {
  VIC_FACE_TO_FACE: {
    key: 'VIC_FACE_TO_FACE',
    title: 'Face to Face',
    description: 'Vic says the people worth knowing do not answer the phone. Get on a plane, show your face somewhere that is not home, and come back in one piece.',
    contactKey: 'VIC',
    type: 'SIDE',
    category: 'TRAVEL',
    difficulty: 'CONTRACT',
    prerequisites: [],
    objectives: [
      {
        id: 'trip_home',
        kind: 'EVENT_COUNT',
        description: 'Take a trip to another city and fly home.',
        target: 1,
        params: { eventTypes: ['TRIP_RETURNED'] },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 1500000 },
      { kind: 'CONTACT_REP', key: 'VIC', amount: 15 },
    ],
    followUpKeys: ['TOMMY_OUT_OF_TOWN_IRON', 'VIC_SCOPE_THE_STRIP'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  TOMMY_OUT_OF_TOWN_IRON: {
    key: 'TOMMY_OUT_OF_TOWN_IRON',
    title: 'Out-of-Town Iron',
    description: 'Tommy has cousins in Detroit who move more metal than he does. Go meet them yourself. After that, wherever you land, someone will have something for your people to carry.',
    contactKey: 'TOMMY',
    type: 'SIDE',
    category: 'TRAVEL',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'VIC_FACE_TO_FACE' } },
    ],
    objectives: [
      {
        id: 'detroit_trip',
        kind: 'EVENT_COUNT',
        description: 'Fly to Detroit and come home.',
        target: 1,
        params: { eventTypes: ['TRIP_RETURNED'], where: { city: 'detroit' } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'PERMANENT_UNLOCK', key: 'OUT_OF_TOWN_IRON' },
      { kind: 'CONTACT_REP', key: 'TOMMY', amount: 20 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  VIC_SCOPE_THE_STRIP: {
    key: 'VIC_SCOPE_THE_STRIP',
    title: 'Scope the Strip',
    description: 'Las Vegas moves money faster than anywhere. Vic wants you to walk the Strip yourself before anyone else decides who runs the tables there.',
    contactKey: 'VIC',
    type: 'SIDE',
    category: 'TRAVEL',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'VIC_FACE_TO_FACE' } },
    ],
    objectives: [
      {
        id: 'vegas_trip',
        kind: 'EVENT_COUNT',
        description: 'Fly to Las Vegas and come home.',
        target: 1,
        params: { eventTypes: ['TRIP_RETURNED'], where: { city: 'las-vegas' } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 3000000 },
      { kind: 'CONTACT_REP', key: 'VIC', amount: 20 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  WHEELS_RIDING_SHOTGUN: {
    key: 'WHEELS_RIDING_SHOTGUN',
    title: 'Riding Shotgun',
    description: 'Wheels respects a boss who sits in the car. Ride along with your own runs and bring them home.',
    contactKey: 'WHEELS',
    type: 'SIDE',
    category: 'TRAVEL',
    difficulty: 'CONTRACT',
    prerequisites: [],
    objectives: [
      {
        id: 'ride_home',
        kind: 'EVENT_COUNT',
        description: 'Bring 2 runs home with the boss aboard.',
        target: 2,
        params: { eventTypes: ['RUN_RETURNED'], where: { bossAboard: true } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 2000000 },
      { kind: 'ITEM', key: 'lowRiders', amount: 1 },
      { kind: 'CONTACT_REP', key: 'WHEELS', amount: 15 },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },
} as const satisfies QuestDefinitionCatalog;
