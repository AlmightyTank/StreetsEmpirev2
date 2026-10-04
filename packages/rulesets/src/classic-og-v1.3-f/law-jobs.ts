import type { QuestDefinitionCatalog } from '../types.js';

/**
 * 1.3.0-F. Ledger's law Jobs.
 *
 * Every objective is driven by the law system working normally: the activities a Case, a
 * warrant, a lawyer or an official already write (`CASE_STAGE_UP`, `WARRANT_LAWYERED`,
 * `WARRANT_QUASHED`, `LAWYER_RETAINED`, `OFFICIAL_HIRED`, `OFFICIAL_CUT`, `INFORMANT_TIP`,
 * `CAPTAIN_TIP`), plus the `CASE_COOLED` signal a Case sends when it falls a stage. Nothing
 * here adds a quest-only button.
 *
 * Guardrail: law Jobs pay contact standing and cosmetics only. They never pay cash, turns,
 * items, protection or Case points, so a Job is never a way to clear a Case.
 */
export const lawJobs = {
  LEDGER_OPEN_FILE: {
    key: 'LEDGER_OPEN_FILE',
    title: 'Open File',
    description: 'Ledger kept the precinct’s files for twenty-two years. She will teach you how one gets built, but only once a city has started one on you.',
    story: {
      chapter: 'Law: The file',
      intro: 'Ledger stirs her coffee and does not drink it. "Every crew thinks the cops are dice. They are not. They are paperwork. Go make some noise somewhere, and then come tell me what they wrote."',
      inProgress: 'Ledger wants a city’s police to notice you. Heat in a city builds a Case there.',
      ready: '"There it is," Ledger says. "Noticed. That is a folder with your name on it, and it is very thin. Keep it that way."',
      completed: 'Ledger tears a page from her notebook and writes the stages on it, Quiet to Federal, in a tidy hand.',
      lesson: 'Each city keeps its own Case on you, built from the Heat you draw there and from what the police see. Only you can see it, on the Case panel.',
      actionHint: 'Work a city until its police notice you. The Case panel shows each city’s stage.',
    },
    contactKey: 'LEDGER',
    type: 'SIDE',
    category: 'LAW',
    difficulty: 'STREET_JOB',
    prerequisites: [],
    objectives: [
      {
        id: 'noticed',
        kind: 'EVENT_COUNT',
        description: 'Have a city’s police notice you (any Case stage rise).',
        target: 1,
        params: { eventTypes: ['CASE_STAGE_UP'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'tip',
        kind: 'EVENT_COUNT',
        description: 'Buy a tip from an informant.',
        target: 1,
        params: { eventTypes: ['INFORMANT_TIP'] },
      },
    ],
    rewards: [
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 10 },
    ],
    followUpKeys: ['LEDGER_COOLING_OFF', 'LEDGER_FRIENDS_DOWNTOWN', 'LEDGER_RIGHT_TO_COUNSEL'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  LEDGER_COOLING_OFF: {
    key: 'LEDGER_COOLING_OFF',
    title: 'Cooling Off',
    description: 'A file nobody adds to goes to the bottom of the pile. Ledger wants to see you let one go cold.',
    contactKey: 'LEDGER',
    type: 'SIDE',
    category: 'LAW',
    difficulty: 'STREET_JOB',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_OPEN_FILE' } },
    ],
    objectives: [
      {
        id: 'cooled',
        kind: 'EVENT_COUNT',
        description: 'Let a city’s Case cool down a stage.',
        target: 1,
        params: { eventTypes: ['CASE_COOLED'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'quiet',
        kind: 'EVENT_COUNT',
        description: 'Let a Case cool all the way back to Quiet.',
        target: 1,
        params: { eventTypes: ['CASE_COOLED'], where: { cleared: true } },
      },
    ],
    rewards: [
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 15 },
      { kind: 'COSMETIC_UNLOCK', key: 'ledger-cool-head' },
    ],
    followUpKeys: ['LEDGER_CASE_CLOSED'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  LEDGER_FRIENDS_DOWNTOWN: {
    key: 'LEDGER_FRIENDS_DOWNTOWN',
    title: 'Friends Downtown',
    description: 'Ledger never took an envelope, but she watched plenty change hands. She wants you to learn what one buys, and what it costs.',
    contactKey: 'LEDGER',
    type: 'SIDE',
    category: 'LAW',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_OPEN_FILE' } },
    ],
    objectives: [
      {
        id: 'hire',
        kind: 'EVENT_COUNT',
        description: 'Put an official on your payroll.',
        target: 1,
        params: { eventTypes: ['OFFICIAL_HIRED'], where: { renewed: false } },
      },
    ],
    bonusObjectives: [
      {
        id: 'two_cities',
        kind: 'UNIQUE_VALUES',
        description: 'Have officials on your payroll in 2 different cities.',
        target: 2,
        params: { eventTypes: ['OFFICIAL_HIRED'], where: { renewed: false }, field: 'cityName' },
      },
    ],
    rewards: [
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 15 },
    ],
    followUpKeys: ['LEDGER_CLEAN_HANDS', 'LEDGER_BEAT_THE_RAP'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  LEDGER_RIGHT_TO_COUNSEL: {
    key: 'LEDGER_RIGHT_TO_COUNSEL',
    title: 'Right to Counsel',
    description: 'The crews Ledger saw walk out of the precinct all had one thing in common: a lawyer who picked up the phone.',
    contactKey: 'LEDGER',
    type: 'SIDE',
    category: 'LAW',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_OPEN_FILE' } },
    ],
    objectives: [
      {
        id: 'lawyer',
        kind: 'EVENT_COUNT',
        description: 'Retain a lawyer, or lawyer up against a warrant.',
        target: 1,
        params: { eventTypes: ['LAWYER_RETAINED', 'WARRANT_LAWYERED'] },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 15 },
      { kind: 'COSMETIC_UNLOCK', key: 'ledger-lawyered-up' },
    ],
    followUpKeys: ['LEDGER_BEAT_THE_RAP'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  LEDGER_CLEAN_HANDS: {
    key: 'LEDGER_CLEAN_HANDS',
    title: 'Clean Hands',
    description: 'Every official on the take gets looked at sooner or later. Ledger wants to know you can let one go before Internal Affairs makes it your problem.',
    contactKey: 'LEDGER',
    type: 'SIDE',
    category: 'LAW',
    difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_FRIENDS_DOWNTOWN' } },
    ],
    objectives: [
      {
        id: 'cut_under_ia',
        kind: 'EVENT_COUNT',
        description: 'Cut an official loose while Internal Affairs is looking at them.',
        target: 1,
        params: { eventTypes: ['OFFICIAL_CUT'], where: { underInvestigation: true } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 20 },
      { kind: 'COSMETIC_UNLOCK', key: 'ledger-clean-hands' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  LEDGER_BEAT_THE_RAP: {
    key: 'LEDGER_BEAT_THE_RAP',
    title: 'Beat the Rap',
    description: 'A warrant is only paper until somebody serves it. Ledger has seen a District Attorney make paper disappear.',
    contactKey: 'LEDGER',
    type: 'SIDE',
    category: 'LAW',
    difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_FRIENDS_DOWNTOWN' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_RIGHT_TO_COUNSEL' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'LEDGER', points: 30 } },
    ],
    objectives: [
      {
        id: 'quashed',
        kind: 'EVENT_COUNT',
        description: 'Have a District Attorney on your payroll quash a warrant.',
        target: 1,
        params: { eventTypes: ['WARRANT_QUASHED'] },
      },
    ],
    bonusObjectives: [
      {
        id: 'captain_tip',
        kind: 'EVENT_COUNT',
        description: 'Get a heads-up from a Precinct Captain on your payroll.',
        target: 1,
        params: { eventTypes: ['CAPTAIN_TIP'] },
      },
    ],
    rewards: [
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 20 },
      { kind: 'COSMETIC_UNLOCK', key: 'ledger-teflon' },
    ],
    followUpKeys: ['LEDGER_CASE_CLOSED'],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },

  LEDGER_CASE_CLOSED: {
    key: 'LEDGER_CASE_CLOSED',
    title: 'Case Closed',
    description: 'Ledger’s last lesson: a Case that got as far as a warrant, closed without a single door kicked in.',
    story: {
      chapter: 'Law: Case closed',
      intro: '"Anybody can stay quiet," Ledger says. "Getting quiet again, after they have a warrant drawn up on you, without them ever coming through the door? I saw that twice in twenty-two years."',
      inProgress: 'Ledger wants a Case that reached the Warrant stage brought all the way back to Quiet, with no warrant served in that city along the way.',
      ready: 'Ledger opens an old manila folder, looks at it for a long time, and stamps it CLOSED.',
      completed: 'She gives you the folder. It is empty. "That is what a clean record looks like," she says.',
      lesson: 'A lawyer or a District Attorney can stop a warrant being served; a quiet spell lets the Case cool. Warrants served on you in that city since its Case opened do not count.',
      actionHint: 'Beat a warrant with a lawyer or a DA, then let that city go quiet.',
    },
    contactKey: 'LEDGER',
    type: 'SIDE',
    category: 'LAW',
    difficulty: 'KINGPIN_CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_COOLING_OFF' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'LEDGER_BEAT_THE_RAP' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'LEDGER', points: 80 } },
    ],
    objectives: [
      {
        id: 'closed',
        kind: 'EVENT_COUNT',
        description: 'Cool a Case that reached the Warrant stage back to Quiet, with no warrant served in that city.',
        target: 1,
        params: { eventTypes: ['CASE_COOLED'], where: { cleared: true, peakWarrant: true, raided: false } },
      },
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 40 },
      { kind: 'COSMETIC_UNLOCK', key: 'ledger-case-closed' },
      { kind: 'COSMETIC_UNLOCK', key: 'ledger-case-file-frame' },
    ],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  },
} as const satisfies QuestDefinitionCatalog;
