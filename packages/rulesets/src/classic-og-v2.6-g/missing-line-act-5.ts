import { missingLineActFour } from '../classic-og-v2.6-e/missing-line-act-4.js';
import type { ContactDefinition, ContactKey, QuestBranchDefinition, QuestDefinitionCatalog, QuestObjectiveDefinition, QuestPrerequisiteDefinition } from '../types.js';

/**
 * 2.6.0-G. The Missing Line, Act V: Who Keeps the Book. The finale: the man who signed twice, the
 * contacts at one table, Mara's offer, and the book itself. Two turn-in choices (Mara's offer and
 * the ending) record the crew's stance; every option pays the same, no option locks a specialty,
 * and the ending is stored as the finale's chosen branch for anything that comes after.
 *
 * It re-issues The Map in the Margins to open the act, so it is only valid merged into the
 * 2.6.0-F catalog; the ruleset validates the whole catalog.
 */

const CHAPTER = 'Act V · Who Keeps the Book';

export const MARA_VENN: ContactDefinition = {
  key: 'MARA_VENN',
  name: 'Mara Venn',
  shortName: 'Mara',
  role: 'The Clearinghouse',
  independent: 'She answers to the book, and the book answers to her.',
  description: 'Mara keeps the Clearinghouse book: debts moved quietly between people who could not use banks or courts. She believes a controlled debt market keeps the peace. She is not wrong about the peace.',
};

function scene(questKey: string, sceneKey: string, description: string): QuestObjectiveDefinition {
  return {
    id: sceneKey,
    kind: 'EVENT_COUNT',
    description,
    target: 1,
    params: { eventTypes: ['QUEST_STORY_SCENE'], where: { questKey, sceneKey } },
  };
}

function after(questKey: string): QuestPrerequisiteDefinition[] {
  return [{ kind: 'QUEST_COMPLETED', params: { questKey } }];
}

function choice(key: string, title: string, description: string, contactKey: ContactKey, followUpKeys: string[]): QuestBranchDefinition {
  return { key, title, description, rewards: [], reputationDeltas: [{ contactKey, amount: 2 }], followUpKeys };
}

const campaign = {
  type: 'STORY',
  category: 'CAMPAIGN',
  difficulty: 'STREET_JOB',
  bonusObjectives: [],
  repeatability: 'ONCE',
  expiresAfterMinutes: null,
  availability: {},
} as const;

const MARGIN = 'ML_M15_NAME_IN_THE_MARGIN';
const APPOINTMENT = 'ML_M23_LAST_APPOINTMENT';
const FINALE = 'ML_M25_MISSING_LINE';

export const missingLineActFive: QuestDefinitionCatalog = {
  // Act IV's last chapter now opens Act V.
  ML_M20_MAP_IN_THE_MARGINS: { ...missingLineActFour.ML_M20_MAP_IN_THE_MARGINS!, followUpKeys: ['ML_M21_SIGNED_TWICE'] },

  ML_M21_SIGNED_TWICE: {
    ...campaign,
    key: 'ML_M21_SIGNED_TWICE',
    title: 'The Man Who Signed Twice',
    description: 'The last property on the corridor belongs to a rival who signed two different settlement papers. Blocks wants to hear him say why.',
    contactKey: 'BLOCKS',
    prerequisites: after('ML_M20_MAP_IN_THE_MARGINS'),
    objectives: [
      { id: 'find_him', kind: 'EVENT_COUNT', description: 'Find him on his own corner: scout Wino Slums.', target: 1, params: { eventTypes: ['SCOUT'], where: { districtKey: 'WINO_SLUMS' } } },
      scene('ML_M21_SIGNED_TWICE', 'rival_statement_taken', 'Hear the man who signed twice.'),
    ],
    rewards: [
      { kind: 'CASH', amount: 850_000 },
      { kind: 'CONTACT_REP', key: 'BLOCKS', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Blocks has spent thirty years calling this man a rival. He says the word less now.',
      inProgress: 'The gap on Blocks’ map belongs to a rival crew boss who signed two different settlement papers for the same corner. He will not come to Blocks. He will not refuse a visitor on his own block.\n\n“Go to him,” Blocks says. “On his corner, where he can’t pretend to be somebody else.”',
      ready: 'The rival walks you to the end of his block and no further. Blocks is waiting in the car with the engine off.',
      completed: '“I called him a traitor for ten years,” Blocks says. “He was just tired, and broke, and scared for his kids. She makes that look like treason. That’s the whole trick.”',
      actionHint: 'Scout Wino Slums to find him on his corner, then hear him out in the scene below.',
      scenes: [{
        key: 'rival_statement_taken',
        title: 'Two papers',
        after: ['find_him'],
        prose: 'He is not Mara’s partner. He says so before you ask and then explains it anyway. He sold one favor to keep his crew alive through a bad winter, and a second to keep his family off the street when the first came due.\n\nTwo papers, two signatures, one corner. Each time, someone told him he was the only one who had ever had to do it.',
        responses: [
          {
            key: 'give_him_time',
            label: 'Let him tell it at his own pace',
            outcome: 'It takes an hour. At the end he gives you the second paper without being asked. “Somebody should hold it,” he says, “who didn’t sign it.”',
          },
          {
            key: 'confront_him',
            label: 'Put the two signatures in front of him',
            outcome: 'He looks at them a long time. “Both mine,” he says. “Both true. That’s what she counts on. Nobody believes you can mean two things at once.”',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M22_NO_ONE_OWES_ALONE'],
  },

  ML_M22_NO_ONE_OWES_ALONE: {
    ...campaign,
    key: 'ML_M22_NO_ONE_OWES_ALONE',
    title: 'No One Owes Alone',
    description: 'For the first time, every contact is in one room. Mama’s kitchen table is big enough. Barely.',
    contactKey: 'MAMA_KING',
    prerequisites: after('ML_M21_SIGNED_TWICE'),
    objectives: [scene('ML_M22_NO_ONE_OWES_ALONE', 'accounts_reconciled', 'Put everyone’s account on one table.')],
    rewards: [
      { kind: 'CASH', amount: 900_000 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Mama has put out every chair she owns, and borrowed four.',
      inProgress: 'Pip, Wheels, Tommy, Vic, Blocks and Ledger sit around Mama’s table with their pieces of the story in front of them. Nobody wants to go first.\n\n“Then I will,” Mama says. “I took money after a fire. Now somebody else talk.”',
      ready: 'The table is covered in paper. For once, nobody is guarding their own pile.',
      completed: '“She didn’t need to run all of it,” Ledger says. “She only had to make sure each of us thought we were the only one who’d bent.”',
      actionHint: 'Bring everyone’s account together in the scene below.',
      scenes: [{
        key: 'accounts_reconciled',
        title: 'One table',
        prose: 'The stories contradict each other, then fit. Pip’s short load paid Vic’s buried notice. Wheels’ altered road carried Eli’s book. Tommy’s crate settled a debt Mama thought she had paid. Blocks’ rival signed the corner that ties it all together.\n\nMara did not command every betrayal. She only had to make sure each person believed they were the only one who had compromised.',
        responses: [
          {
            key: 'say_it_out_loud',
            label: 'Say it out loud: nobody here owes alone',
            outcome: 'Nobody answers. Then Tommy pushes his tally book into the middle of the table, and one by one the others do the same.',
          },
          {
            key: 'let_ledger_write_it',
            label: 'Let Ledger write it down',
            outcome: 'Ledger writes for twenty minutes without looking up. When she finishes, she reads it back, and nobody at the table corrects a word.',
          },
        ],
      }],
    },
    followUpKeys: [APPOINTMENT],
  },

  [APPOINTMENT]: {
    ...campaign,
    key: APPOINTMENT,
    title: 'The Last Appointment',
    description: 'Mara Venn asks to meet. No weapons, no witnesses.',
    contactKey: 'MARA_VENN',
    prerequisites: after('ML_M22_NO_ONE_OWES_ALONE'),
    objectives: [scene(APPOINTMENT, 'mara_offer_heard', 'Hear Mara’s offer.')],
    rewards: [
      { kind: 'CASH', amount: 900_000 },
      { kind: 'CONTACT_REP', key: 'MARA_VENN', amount: 5 },
    ],
    branches: [
      choice('MEET_MARA_ACCEPT', 'Accept her offer', 'Take the crew’s name off the book and leave the others where they are. Vic knows what a bargain like that costs.', 'VIC', ['ML_M24_EVERYBODY_AT_THE_TABLE']),
      choice('MEET_MARA_REFUSE', 'Refuse her', 'Walk out with your name still in her book. Blocks has been refusing people all his life.', 'BLOCKS', ['ML_M24_EVERYBODY_AT_THE_TABLE']),
      choice('MEET_MARA_DEFER', 'Ask for the book first', 'Answer nothing until you have seen the whole book. Ledger would ask the same.', 'LEDGER', ['ML_M24_EVERYBODY_AT_THE_TABLE']),
    ],
    story: {
      chapter: CHAPTER,
      intro: 'The note is handwritten, unsigned, and correct about where you will be at nine o’clock.',
      inProgress: 'Mara Venn is waiting in an empty diner with two cups of coffee and no bodyguard. She is younger than the stories and more tired.\n\n“Sit,” she says. “Nobody here is armed. That’s the point.”',
      ready: 'Mara pays for both coffees and leaves the diner first, so you can watch her go.',
      completed: 'Mara does not argue with your answer. She writes it down.',
      actionHint: 'Hear Mara out in the scene below. When you collect, give her your answer.',
      variants: [
        {
          when: { kind: 'BRANCH_CHOSEN', questKey: MARGIN, branchKey: 'DISPUTE_THE_ENTRY' },
          inProgress: 'Mara Venn is waiting in an empty diner with two cups of coffee and no bodyguard.\n\n“You disputed my entry,” she says. “In writing. Nobody has done that in nine years. Sit. Nobody here is armed. That’s the point.”',
        },
        {
          when: { kind: 'BRANCH_CHOSEN', questKey: MARGIN, branchKey: 'LEAVE_IT_FOR_NOW' },
          inProgress: 'Mara Venn is waiting in an empty diner with two cups of coffee and no bodyguard.\n\n“You let me think you hadn’t noticed,” she says. “Vic’s idea, I assume. It was very good. Sit. Nobody here is armed. That’s the point.”',
        },
        {
          when: { kind: 'BRANCH_CHOSEN', questKey: MARGIN, branchKey: 'KEEP_A_COPY' },
          inProgress: 'Mara Venn is waiting in an empty diner with two cups of coffee and no bodyguard.\n\n“You copied my page,” she says, “and said nothing. That’s what I would have done. Sit. Nobody here is armed. That’s the point.”',
        },
      ],
      scenes: [{
        key: 'mara_offer_heard',
        title: 'The offer',
        prose: 'Mara offers to strike the crew’s name from the book tonight, permanently, with her own pen. In exchange, every other name stays exactly where it is.\n\nShe believes a controlled debt market keeps the city from open war, and she is not lying about the violence it has prevented. She is lying about who gets to control it.',
        responses: [
          {
            key: 'ask_why_us',
            label: 'Ask why the crew’s name was in the book at all',
            outcome: '“Because you were going to be worth something,” Mara says. “I write down what people will become. I am almost never wrong.”',
          },
          {
            key: 'ask_about_the_others',
            label: 'Ask about the other names',
            outcome: '“Mrs. Alvarez. Mama. Hales’s daughter. Eli’s mother,” Mara says, without checking. “I know every one of them. That’s the difference between me and a bank.”',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M24_EVERYBODY_AT_THE_TABLE'],
  },

  ML_M24_EVERYBODY_AT_THE_TABLE: {
    ...campaign,
    key: 'ML_M24_EVERYBODY_AT_THE_TABLE',
    title: 'Everybody at the Table',
    description: 'The crew prepares for the final settlement. Every contact wants something different from it.',
    contactKey: 'MAMA_KING',
    prerequisites: after(APPOINTMENT),
    objectives: [
      { id: 'set_the_table', kind: 'EVENT_SUM', description: 'Set the table: buy 10 beer at the Corner.', target: 10, params: { eventTypes: ['STORE_BUY'], field: 'quantity', where: { storeKey: 'CORNER', itemKey: 'BEER' } } },
      scene('ML_M24_EVERYBODY_AT_THE_TABLE', 'table_priority_chosen', 'Decide whose concern comes first.'),
    ],
    rewards: [
      { kind: 'CASH', amount: 950_000 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Mama says nobody plans anything important on an empty table.',
      inProgress: 'The contacts are back around Mama’s table, and this time they are not comparing what happened. They are deciding what happens next.\n\n“Bring something to drink,” Mama says. “People are kinder with a bottle in front of them.”',
      ready: 'The beer is gone, the plan is on one sheet of paper, and nobody got everything they wanted. Mama says that is how you know it is a real plan.',
      completed: 'Mama folds the plan into the coat pocket with the two receipts and the torn page. “Tomorrow,” she says. “At the shop. Where it started.”',
      actionHint: 'Buy 10 beer at the Corner for the table, then decide in the scene below whose concern comes first.',
      variants: [
        {
          when: { kind: 'BRANCH_CHOSEN', questKey: APPOINTMENT, branchKey: 'MEET_MARA_ACCEPT' },
          intro: 'You took Mara’s offer. Your name is off her book. Everyone else’s is still on it, and everyone at the table knows.',
        },
        {
          when: { kind: 'BRANCH_CHOSEN', questKey: APPOINTMENT, branchKey: 'MEET_MARA_REFUSE' },
          intro: 'You refused Mara to her face. Your name is still in her book, next to everyone else’s. Blocks says that is the only place it was ever going to be safe.',
        },
        {
          when: { kind: 'BRANCH_CHOSEN', questKey: APPOINTMENT, branchKey: 'MEET_MARA_DEFER' },
          intro: 'You told Mara you would answer when you had seen the book. To everyone’s surprise, she agreed. Ledger has not slept since.',
        },
      ],
      scenes: [{
        key: 'table_priority_chosen',
        title: 'Everybody at the table',
        after: ['set_the_table'],
        prose: 'Each of them wants something different. Mama wants the block left standing. Pip wants his supplier’s name cleared. Tommy wants the staged raid acknowledged. Wheels wants his drivers left out of it. Vic wants the notice buried for good. Blocks wants the corridor kept whole.\n\nNo single answer gives everyone what they want. Somebody has to go first.',
        responses: [
          { key: 'mama_first', label: 'The block stays standing', outcome: 'Mama nods once and does not thank you. Later, she puts the kettle on for everyone, which is the same thing.' },
          { key: 'pip_first', label: 'Clear Pip’s supplier', outcome: 'Pip writes the supplier’s name at the top of the plan in block capitals, so nobody can misread it.' },
          { key: 'tommy_first', label: 'Name the staged raid', outcome: 'Tommy reads the three names from that night aloud. Nobody interrupts him.' },
          { key: 'wheels_first', label: 'Keep the drivers out of it', outcome: '“They just drove,” Wheels says. “Somebody has to remember that’s all they did.”' },
          { key: 'vic_first', label: 'Bury Vic’s notice for good', outcome: 'Vic says nothing. He refills everyone’s glass, which he has never done in his life.' },
          { key: 'blocks_first', label: 'Keep the corridor whole', outcome: 'Blocks rolls out the turf map and weighs its corners down with four empty bottles. “Then nobody owns it,” he says. “Good.”' },
        ],
      }],
    },
    followUpKeys: [FINALE],
  },

  [FINALE]: {
    ...campaign,
    key: FINALE,
    title: 'The Missing Line',
    description: 'At the shuttered shop where it started, the original book is on the counter. The people whose names were erased are in the room.',
    contactKey: 'MAMA_KING',
    prerequisites: after('ML_M24_EVERYBODY_AT_THE_TABLE'),
    objectives: [scene(FINALE, 'the_book_opened', 'Open the original book.')],
    rewards: [
      { kind: 'CASH', amount: 1_500_000 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 10 },
    ],
    branches: [
      choice('OPEN_BOOK', 'Open the Book', 'Expose the records and accept the fallout. Every name, every debt, in daylight. Ledger will make sure it is read correctly.', 'LEDGER', []),
      choice('BURN_BOOK', 'Burn the Book', 'Break the debt chain and lose the proof. Nobody owes anybody tonight, and nobody can show what was owed. Vic will light it.', 'VIC', []),
      choice('KEEP_BOOK', 'Keep the Book', 'Take control of the ledger and risk becoming its next keeper. Blocks knows what holding a corridor costs.', 'BLOCKS', []),
    ],
    story: {
      chapter: CHAPTER,
      intro: 'It is raining again. Mama has left the porch light on this time.',
      inProgress: 'The corner shop has every light on. Mrs. Alvarez is behind the counter. Eli is by the door. Hales’s daughter came, and the rival from Wino Slums, and three of Mama’s families from Delancey. The original book is on the counter, closed.\n\n“Your hand,” Mama says. “Your choice. We’ll live with it.”',
      ready: 'Everyone in the shop is looking at you, and then, one by one, they stop, because Mama tells them to.',
      completed: 'The rain stops sometime after midnight. Mama locks the shop with Mrs. Alvarez’s key and gives it back to her.',
      actionHint: 'Open the book in the scene below. When you collect, choose what the crew does with it.',
      variants: [
        {
          when: { kind: 'SCENE_RESPONSE', questKey: 'ML_M18_WHAT_MAMA_BOUGHT', sceneKey: 'mama_debt_reckoned', responseKey: 'tell_the_families' },
          ready: 'Everyone in the shop is looking at you. The families from Delancey stand closest to the counter. They already know what Mama owed; they came anyway.',
        },
        {
          when: { kind: 'SCENE_RESPONSE', questKey: 'ML_M18_WHAT_MAMA_BOUGHT', sceneKey: 'mama_debt_reckoned', responseKey: 'repay_quietly' },
          ready: 'Everyone in the shop is looking at you. Mama stands by the door with her hand on her coat pocket, where the last of her quiet envelopes is waiting.',
        },
        {
          when: { kind: 'BRANCH_CHOSEN', questKey: FINALE, branchKey: 'OPEN_BOOK' },
          completed: 'By morning the book is in forty photocopies across the city. Some debts are forgiven by people too embarrassed to collect them. Some are not. Ledger reads every page aloud to anyone who asks, and the line on Mrs. Alvarez’s receipt is a name again.',
        },
        {
          when: { kind: 'BRANCH_CHOSEN', questKey: FINALE, branchKey: 'BURN_BOOK' },
          completed: 'The book burns slowly, the way old paper does. Nobody in the shop owes anybody anything by the time it is ash, and nobody can prove what they were owed. Vic watches until the last page curls, then puts his coat over the sink.',
        },
        {
          when: { kind: 'BRANCH_CHOSEN', questKey: FINALE, branchKey: 'KEEP_BOOK' },
          completed: 'You put the book under your arm and walk out into the rain. It is lighter than it looked. Blocks falls into step beside you and says nothing for three blocks. Then he says, “Now everybody owes you.” He does not say it like good news.',
        },
      ],
      scenes: [{
        key: 'the_book_opened',
        title: 'The original book',
        prose: 'The original book is heavier than any of the copies. On the first page is the debt Mrs. Alvarez’s husband thought he had paid. On the last is your crew’s name, in the margin, priced in favors not yet done.\n\nBetween them are every person in this room, and dozens who could not come. Somewhere in the middle, a line has been rubbed almost through the paper.',
        responses: [
          {
            key: 'read_the_first_page',
            label: 'Read the first page aloud',
            outcome: 'Mrs. Alvarez closes her eyes when you reach her husband’s name. She does not ask you to stop.',
          },
          {
            key: 'find_the_erased_line',
            label: 'Find the erased line',
            outcome: 'Under the lamp, the missing line comes back one letter at a time. It is the first name in the book. It is Mara’s own.',
          },
        ],
      }],
    },
    followUpKeys: [],
  },
};
