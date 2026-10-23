import type { QuestDefinition, QuestDefinitionCatalog } from '../types.js';

/**
 * Slice 4: the Commissioner's current-round law arc.
 *
 * These jobs deliberately listen to events emitted by the existing case, law,
 * informant, and official systems. They do not add a second heat or evidence
 * model, and they never make law work mandatory for the rest of the board.
 */
export const commissionerArcs = {
  BOARD_COMMISSIONER_BADGE_IN_DARK: {
    key: 'BOARD_COMMISSIONER_BADGE_IN_DARK',
    title: 'A Badge in the Dark',
    description: 'The Commissioner will not protect a crew from a record it refuses to read. Let one city notice your operation, then bring him the first page before the story gets embellished.',
    contactKey: 'COMMISSIONER',
    type: 'SIDE', category: 'LAW', difficulty: 'STREET_JOB',
    prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'BOARD_REFERRAL_COMMISSIONER' } }],
    objectives: [{ id: 'case_started', kind: 'EVENT_COUNT', description: 'Have a city raise a Case stage.', target: 1, params: { eventTypes: ['CASE_STAGE_UP'] } }],
    bonusObjectives: [{ id: 'evidence', kind: 'EVENT_COUNT', description: 'Collect one informant tip while the Case is open.', target: 1, params: { eventTypes: ['INFORMANT_TIP'] } }],
    rewards: [{ kind: 'CASH', amount: 150000 }, { kind: 'CONTACT_REP', key: 'COMMISSIONER', amount: 10 }],
    story: {
      chapter: 'The record that remains',
      intro: 'The Commissioner opens a blank folder. “Facts are not protection. They are the only material protection can use.”',
      inProgress: 'Let one city notice your operation. A Case stage rise is the first mark in the file; the Case panel shows where it happened.',
      ready: 'He reads the new entry twice. “Good. Now you know what the city believes happened. That is different from what happened.”',
      completed: 'The Commissioner dates the page and returns it to the folder. Your name is no longer a rumor in that city; it is a record.',
      lesson: 'Heat creates a city-specific Case. Evidence and protection are managed from the existing law systems, not from quest-only actions.',
      actionHint: 'Work a city until its Case stage rises, then review the Case panel.',
    },
    followUpKeys: ['BOARD_COMMISSIONER_NO_NAMES_NO_FAVORS', 'BOARD_COMMISSIONER_KEEP_HEAT_DOWN'],
    repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },

  BOARD_COMMISSIONER_KEEP_HEAT_DOWN: {
    key: 'BOARD_COMMISSIONER_KEEP_HEAT_DOWN',
    title: 'Keep the Heat Down',
    description: 'A loud crew thinks every problem needs another move. The Commissioner wants proof you can stop adding pages and let a city forget the last one.',
    contactKey: 'COMMISSIONER',
    type: 'SIDE', category: 'LAW', difficulty: 'CONTRACT',
    prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'BOARD_COMMISSIONER_BADGE_IN_DARK' } }],
    objectives: [{ id: 'case_cooled', kind: 'EVENT_COUNT', description: 'Let a city’s Case cool by one stage.', target: 1, params: { eventTypes: ['CASE_COOLED'] } }],
    bonusObjectives: [{ id: 'quiet', kind: 'EVENT_COUNT', description: 'Let a Case return to Quiet.', target: 1, params: { eventTypes: ['CASE_COOLED'], where: { cleared: true } } }],
    rewards: [{ kind: 'CASH', amount: 200000 }, { kind: 'CONTACT_REP', key: 'COMMISSIONER', amount: 15 }],
    story: {
      chapter: 'The record that remains',
      intro: 'He closes the folder without locking it. “The street rewards motion. The law rewards the gap between incidents.”',
      inProgress: 'Stop feeding one city’s Case and give it time to cool. Do not confuse waiting with safety; watch the stage on the Case panel.',
      ready: 'The Commissioner finds the old stage and crosses it out. “A quiet file is not an innocent file. It is a file nobody is adding to.”',
      completed: 'The page is moved to the back of the cabinet. The city has not forgotten you, but it has stopped learning new details.',
      lesson: 'Heat is city-specific and can cool when the operation stops generating new evidence against itself.',
      actionHint: 'Give an open Case time to cool one stage, then check its updated stage.',
    },
    followUpKeys: ['BOARD_COMMISSIONER_CITY_HAS_LIMITS'],
    repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },

  BOARD_COMMISSIONER_NO_NAMES_NO_FAVORS: {
    key: 'BOARD_COMMISSIONER_NO_NAMES_NO_FAVORS',
    title: 'No Names, No Favors',
    description: 'The first Case tells the Commissioner where the city is looking. He wants the name of the person who told it where to look, before that name disappears into somebody else’s report.',
    contactKey: 'COMMISSIONER',
    type: 'SIDE', category: 'LAW', difficulty: 'CONTRACT',
    prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'BOARD_COMMISSIONER_BADGE_IN_DARK' } }],
    objectives: [{ id: 'informant', kind: 'EVENT_COUNT', description: 'Buy an informant tip about the operation.', target: 1, params: { eventTypes: ['INFORMANT_TIP'] } }],
    bonusObjectives: [{ id: 'recon', kind: 'EVENT_COUNT', description: 'Confirm one lead through a recon report.', target: 1, params: { eventTypes: ['COMBAT_RECON'] } }],
    rewards: [{ kind: 'CASH', amount: 200000 }, { kind: 'CONTACT_REP', key: 'COMMISSIONER', amount: 15 }],
    story: {
      chapter: 'The record that remains',
      intro: 'A pencil mark appears beside a street name. “Evidence is not only what the police collect,” the Commissioner says. “Sometimes it is what the frightened are willing to sell.”',
      inProgress: 'Buy one informant tip through the existing informant system. The tip, not a conversation with this quest, is the evidence.',
      ready: 'He compares the tip to the Case file. “One source is a rumor. Two independent records are a direction.”',
      completed: 'The margin now carries a name and a date. The Commissioner does not tell you whether the source is brave or simply expensive.',
      lesson: 'Informant tips and recon reports are evidence-producing actions that can change how you understand a Case.',
      actionHint: 'Use the existing informant option to buy one tip, then review the resulting record.',
    },
    followUpKeys: ['BOARD_COMMISSIONER_CITY_HAS_LIMITS'],
    repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },

  BOARD_COMMISSIONER_CITY_HAS_LIMITS: {
    key: 'BOARD_COMMISSIONER_CITY_HAS_LIMITS',
    title: 'The City Has Limits',
    description: 'The Commissioner will not call himself your shield. He will show you where a lawyer belongs before the next warrant turns a rumor into a door knock.',
    contactKey: 'COMMISSIONER',
    type: 'SIDE', category: 'LAW', difficulty: 'CONTRACT',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'BOARD_COMMISSIONER_KEEP_HEAT_DOWN' } },
      { kind: 'QUEST_COMPLETED', params: { questKey: 'BOARD_COMMISSIONER_NO_NAMES_NO_FAVORS' } },
    ],
    objectives: [{ id: 'counsel', kind: 'EVENT_COUNT', description: 'Retain counsel or lawyer up against a warrant.', target: 1, params: { eventTypes: ['LAWYER_RETAINED', 'WARRANT_LAWYERED'] } }],
    bonusObjectives: [{ id: 'quash', kind: 'EVENT_COUNT', description: 'Have a warrant quashed.', target: 1, params: { eventTypes: ['WARRANT_QUASHED'] } }],
    rewards: [{ kind: 'CASH', amount: 300000 }, { kind: 'CONTACT_REP', key: 'COMMISSIONER', amount: 20 }],
    story: {
      chapter: 'Protection has a price',
      intro: 'The Commissioner puts a lawyer’s card on top of the file. “Protection is not innocence. It is time to make the facts legible.”',
      inProgress: 'Retain counsel through the existing Law screen, or lawyer up against an active warrant. The transaction must resolve successfully.',
      ready: 'He taps the card once. “Now the file has a witness who knows procedure. That is more useful than a friend who promises to make a call.”',
      completed: 'Your counsel is recorded. The Commissioner’s protection is procedural, expensive, and real only when the law system confirms it.',
      lesson: 'Lawyers and warrant actions use the canonical law state; a quest never grants protection merely for being accepted.',
      actionHint: 'Open Law and retain counsel, or lawyer up against a warrant.',
    },
    followUpKeys: ['BOARD_COMMISSIONER_UNOFFICIAL_ARRANGEMENT'],
    repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },

  BOARD_COMMISSIONER_UNOFFICIAL_ARRANGEMENT: {
    key: 'BOARD_COMMISSIONER_UNOFFICIAL_ARRANGEMENT',
    title: 'An Unofficial Arrangement',
    description: 'A warrant has made the file dangerous enough to matter. Close it without pretending the record never existed, and the Commissioner will trust you with work that cannot be taken back.',
    contactKey: 'COMMISSIONER',
    type: 'CONTRACT', category: 'LAW', difficulty: 'SERIOUS_BUSINESS',
    prerequisites: [
      { kind: 'QUEST_COMPLETED', params: { questKey: 'BOARD_COMMISSIONER_CITY_HAS_LIMITS' } },
      { kind: 'CONTACT_REP_AT_LEAST', params: { contactKey: 'COMMISSIONER', points: 45 } },
    ] as QuestDefinition['prerequisites'],
    objectives: [{ id: 'quashed', kind: 'EVENT_COUNT', description: 'Have the active warrant quashed through the law system.', target: 1, params: { eventTypes: ['WARRANT_QUASHED'] } }],
    bonusObjectives: [{ id: 'captain', kind: 'EVENT_COUNT', description: 'Receive one captain’s tip.', target: 1, params: { eventTypes: ['CAPTAIN_TIP'] } }],
    rewards: [{ kind: 'CASH', amount: 500000 }, { kind: 'CONTACT_REP', key: 'COMMISSIONER', amount: 25 }],
    story: {
      chapter: 'Protection has a price',
      intro: 'The Commissioner locks the folder, then slides the key across the desk. “This is the part where protection stops being a service and becomes a test.”',
      inProgress: 'Use counsel or a District Attorney to quash an active warrant. This is a high-risk contract: the law system must confirm the warrant was actually cleared.',
      ready: 'The warrant stamp is crossed out. “You did not erase the record. You answered it.”',
      completed: 'The folder is archived without a red tab. The Commissioner will offer harder investigations now, but never promise they are safe.',
      lesson: 'High-risk law work resolves through existing warrants, lawyers, officials, and evidence; rewards never fabricate a clean record.',
      actionHint: 'Open Law and resolve an active warrant with counsel or a District Attorney.',
    },
    followUpKeys: [], repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },
} satisfies QuestDefinitionCatalog;
