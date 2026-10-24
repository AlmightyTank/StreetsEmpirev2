import { defineQuestCatalog } from '../quest-definitions.js';
import type { QuestObjectiveDefinition } from '../types.js';

/**
 * 2.6.0-A. The Missing Line, Act I: A Name in the Rain. The first five chapters of the story
 * campaign (docs/STORY-QUEST-CAMPAIGN-SPINE.md). Story jobs teach nothing, so they carry no
 * lesson text; evidence follows docs/STORY-QUEST-OBJECTIVE-PLAY-MAP.md and the Slice A contract.
 */

const CHAPTER = 'Act I · A Name in the Rain';

function sceneObjective(questKey: string, sceneKey: string, description: string): QuestObjectiveDefinition {
  return {
    id: sceneKey,
    kind: 'EVENT_COUNT',
    description,
    target: 1,
    params: { eventTypes: ['QUEST_STORY_SCENE'], where: { questKey, sceneKey } },
  };
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

export const missingLineActOne = defineQuestCatalog({
  ML_M01_NIGHT_RECEIPT: {
    ...campaign,
    key: 'ML_M01_NIGHT_RECEIPT',
    title: 'The Night Receipt',
    description: 'Mama wants a paid receipt walked back to a shuttered corner shop tonight. No speech, no collection.',
    contactKey: 'MAMA_KING',
    prerequisites: [],
    objectives: [sceneObjective('ML_M01_NIGHT_RECEIPT', 'night_receipt_handled', 'Decide what to do with Mama’s receipt.')],
    rewards: [
      { kind: 'CASH', amount: 100_000 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 3 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Rain worked the avenue into a blur of red signs and black windows. Mama King had left the porch light off, which meant she wanted the conversation kept small.\n\n“One envelope,” she says. “One shop. You walk in, you walk out.”',
      inProgress: 'Mama slides the envelope across the table with two fingers, careful not to touch the damp corner.\n\n“Mrs. Alvarez paid on Friday,” she says. “Tonight you take her receipt back. No speech, no collection. Just make sure the paper gets home.”',
      ready: 'The envelope is sealed again, and the shop is two blocks away. Mama has gone back to her ledger, but she has not put the pen down.',
      completed: 'Mama pays you for an easy night and keeps the receipt. She does not file it with the others. She slips it into her coat.',
      actionHint: 'The receipt is in the scene below. Decide what to do with it, then collect from Mama.',
      scenes: [{
        key: 'night_receipt_handled',
        title: 'The receipt',
        prose: 'The amount is right. The date is right. On the last line, somebody pressed a pen hard enough to score the paper, then rubbed the name away.\n\nMama watches you read it. “You know whose name that was?”\n\nFor a moment, the rain fills the room.',
        responses: [
          {
            key: 'return_unopened',
            label: 'Fold it back into the envelope',
            outcome: '“Good,” Mama says, and something in her shoulders lets go. “I know who wants us asking. That’s why you’re taking it back.”',
          },
          {
            key: 'examine_line',
            label: 'Tilt it to the lamp and read the scored line',
            outcome: 'Four letters survive the eraser, pressed into the paper like a bruise. Mama sees you count them.\n\n“I know who wants us asking,” she says. “That’s why you’re taking it back.”',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M02_SMALL_FAVOR'],
  },

  ML_M02_SMALL_FAVOR: {
    ...campaign,
    key: 'ML_M02_SMALL_FAVOR',
    title: 'A Small Favor',
    description: 'Mrs. Alvarez is still in her shuttered shop after closing. She says she paid months ago, and not to the name on the receipt.',
    contactKey: 'MAMA_KING',
    prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'ML_M01_NIGHT_RECEIPT' } }],
    objectives: [sceneObjective('ML_M02_SMALL_FAVOR', 'alvarez_statement_taken', 'Hear Mrs. Alvarez’s account.')],
    rewards: [
      { kind: 'CASH', amount: 100_000 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 3 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'The corner shop has been dark since spring. Tonight a coat moves behind the glass.',
      inProgress: 'Mrs. Alvarez sits in the dark with her coat on indoors, as if she has not decided whether to stay. She takes the envelope without opening it.\n\n“I paid that debt months ago,” she says. “Ask me who I paid.”',
      ready: 'Mrs. Alvarez locks the shop behind you. Through the glass you see her sit back down in the dark.',
      completed: 'Mama listens to all of it without interrupting. When you finish she says, “A man in a good coat,” as if she is filing it somewhere you cannot see.',
      actionHint: 'Hear Mrs. Alvarez out in the scene below, then collect from Mama.',
      scenes: [{
        key: 'alvarez_statement_taken',
        title: 'The woman at closing',
        prose: 'She keeps her hands folded over the envelope. Mama’s name is on the receipt, she says, but Mama never came to the shop. A man in a good coat did, twice, polite both times. He counted the money on her counter and wrote nothing down.\n\n“I thought Mama sent him,” she says. “Everybody thinks Mama sends everybody.”',
        responses: [
          {
            key: 'show_receipt',
            label: 'Show her the receipt',
            outcome: 'She reads it twice, then puts one finger on the blank last line. “That is not the man who came,” she says. “That line had a name on it when I signed.”',
          },
          {
            key: 'ask_who_collected',
            label: 'Ask who took the money',
            outcome: '“He never said a name,” she says. “He said the account was being moved, and that moving it was a kindness.” She laughs once, without any pleasure in it.',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M03_OTHER_DOOR'],
  },

  ML_M03_OTHER_DOOR: {
    ...campaign,
    key: 'ML_M03_OTHER_DOOR',
    title: 'The Other Door',
    description: 'Pip’s delivery to the corner shop never arrived. He wants his goods found, and he keeps a slip for every sale.',
    contactKey: 'PIP',
    prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'ML_M02_SMALL_FAVOR' } }],
    objectives: [{
      id: 'pip_sale',
      kind: 'EVENT_COUNT',
      description: 'Make one sale to Pip.',
      target: 1,
      params: { eventTypes: ['STORE_SELL'], where: { storeKey: 'PIP' } },
    }],
    rewards: [
      { kind: 'CASH', amount: 150_000 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Pip does not like stories about doors. Doors are either locked or they are not.',
      inProgress: 'Pip’s driver was meant to reach the corner shop the same night as Mama’s envelope. The back door was open before he got there. No lock forced, no guard paid.\n\n“Do business with me,” Pip says, “and I’ll show you what I show my customers. Every sale gets a slip. Every slip has a route.”',
      ready: 'Pip pulls the slip from your sale and lays it beside his copy from the night of the delivery. The same route is printed at the top of both. On his copy, someone has crossed it out and written a different one underneath, in a hand that is not his.',
      completed: '“I don’t write like that,” Pip says, and puts both slips in his breast pocket. “Nobody who works for me writes like that.”',
      actionHint: 'Sell anything at Pip’s counter.',
    },
    followUpKeys: ['ML_M04_ROLL_CALL'],
  },

  ML_M04_ROLL_CALL: {
    ...campaign,
    key: 'ML_M04_ROLL_CALL',
    title: 'Roll Call',
    description: 'Eli, Mama’s young runner, has missed two check-ins. Mama wants him found before Tommy goes looking.',
    contactKey: 'MAMA_KING',
    prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'ML_M03_OTHER_DOOR' } }],
    objectives: [{
      id: 'run_home',
      kind: 'EVENT_COUNT',
      description: 'Bring one intercity run home.',
      target: 1,
      params: { eventTypes: ['RUN_RETURNED'] },
    }],
    rewards: [
      { kind: 'CASH', amount: 200_000 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Mama counts her runners every night, the way some people count their keys.',
      inProgress: 'Eli has missed two check-ins. Mama called it a bad habit until she found his last note, folded into the crew ledger: “Don’t let them close the account for me.”\n\n“Eli ran the north road for Wheels,” she says. “Send a car out the way he went and bring it back. I want to know what the road remembers.”',
      ready: 'When the car comes back, Wheels is waiting at the curb. He takes the driver’s copy of the route, reads it, and goes quiet. Halfway down the page is a small hooked mark in the margin. It is how Eli used to sign his runs.',
      completed: '“That mark’s on a road Eli never drove for me,” Wheels says. Mama writes the date of the run under Eli’s name in the ledger and does not cross anything out.',
      actionHint: 'Launch any intercity run and bring it home. Runs need a car, and Charlie sells them.',
    },
    followUpKeys: ['ML_M05_MISSING_LINE'],
  },

  ML_M05_MISSING_LINE: {
    ...campaign,
    key: 'ML_M05_MISSING_LINE',
    title: 'The Missing Line',
    description: 'Ledger compares Mrs. Alvarez’s receipt with Pip’s slip. Both copies have the same narrow blank where a name should be.',
    contactKey: 'LEDGER',
    prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'ML_M04_ROLL_CALL' } }],
    objectives: [sceneObjective('ML_M05_MISSING_LINE', 'missing_line_compared', 'Compare the copies with Ledger.')],
    rewards: [
      { kind: 'CASH', amount: 250_000 },
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Marisol Pike kept the precinct’s case files for twenty-two years. She still reads paper the way other people read faces.',
      inProgress: 'Ledger lays the shop receipt and Pip’s slip side by side under a desk lamp and does not touch either one.\n\n“Two documents, two businesses, same blank,” she says. “Printers don’t fail in the same place twice. People do.”',
      ready: 'The name is on an index card in Ledger’s handwriting now, the only place in the city it is written out in full.',
      completed: 'Ledger keeps the carbon. “Pip lost a load and Wheels lost a road,” she says. “Tommy will be next, if he isn’t already. Three people, three pieces. Start wherever you like.”',
      actionHint: 'Ledger’s comparison is in the scene below. Hear her out, then collect.',
      scenes: [{
        key: 'missing_line_compared',
        title: 'The carbon',
        prose: 'She slides a sheet of carbon paper out of an evidence sleeve. It came from the original receipt book, she says, the one copy nobody thought to clean. Held to the lamp, the missing line comes back in reverse, one letter at a time.\n\nMara Venn.\n\n“I’ve heard that name twice in thirty years,” Ledger says. “Both times from people who wished they hadn’t said it.”',
        responses: [
          {
            key: 'keep_the_name',
            label: 'Keep the name to yourself for now',
            outcome: 'Ledger nods and slides the carbon back into its sleeve. “Good. A name is evidence until you say it out loud. After that it’s a rumor.”',
          },
          {
            key: 'share_the_name',
            label: 'Tell Mama, Pip, and Wheels',
            outcome: '“Then tell them carefully,” Ledger says. “By tomorrow somebody will know you’re asking. Make sure it’s somebody you chose.”',
          },
        ],
      }],
    },
    followUpKeys: [],
  },
});
