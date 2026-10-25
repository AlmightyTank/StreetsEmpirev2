import { missingLineActTwo } from '../classic-og-v2.6-b/missing-line-act-2.js';
import type { ContactKey, QuestBranchDefinition, QuestDefinitionCatalog, QuestObjectiveDefinition, QuestPrerequisiteDefinition } from '../types.js';

/**
 * 2.6.0-D. The Missing Line, Act III: The Price of Keeping Quiet. Written to the R3 standard: each
 * chapter asks for work that fits its contact, then plays its reveal as a scene. Your Name in the
 * Margin closes the act with the campaign's first turn-in choice; every option pays the same and
 * only shifts which contact trusts the crew a little more.
 *
 * It re-issues A Favor Already Paid to open the act, so it is only valid merged into the 2.6.0-C
 * catalog; the ruleset validates the whole catalog.
 */

const CHAPTER = 'Act III · The Price of Keeping Quiet';

function scene(questKey: string, sceneKey: string, description: string): QuestObjectiveDefinition {
  return {
    id: sceneKey,
    kind: 'EVENT_COUNT',
    description,
    target: 1,
    params: { eventTypes: ['QUEST_STORY_SCENE'], where: { questKey, sceneKey } },
  };
}

function sum(id: string, description: string, target: number, eventTypes: string[], where: Record<string, string>): QuestObjectiveDefinition {
  return { id, kind: 'EVENT_SUM', description, target, params: { eventTypes, field: 'quantity', where } };
}

function after(questKey: string): QuestPrerequisiteDefinition[] {
  return [{ kind: 'QUEST_COMPLETED', params: { questKey } }];
}

const campaign = {
  type: 'STORY',
  category: 'CAMPAIGN',
  difficulty: 'STREET_JOB',
  repeatability: 'ONCE',
  expiresAfterMinutes: null,
  availability: {},
} as const;

function stance(key: string, title: string, description: string, contactKey: ContactKey): QuestBranchDefinition {
  return { key, title, description, rewards: [], reputationDeltas: [{ contactKey, amount: 2 }], followUpKeys: [] };
}

export const missingLineActThree: QuestDefinitionCatalog = {
  // Act II's last chapter now opens Act III.
  ML_M10_FAVOR_ALREADY_PAID: { ...missingLineActTwo.ML_M10_FAVOR_ALREADY_PAID!, followUpKeys: ['ML_M11_TERMS_OF_QUIET'] },

  ML_M11_TERMS_OF_QUIET: {
    ...campaign,
    key: 'ML_M11_TERMS_OF_QUIET',
    title: 'Terms of Quiet',
    description: 'Vic takes you to the place where his police notice was supposed to disappear.',
    contactKey: 'VIC',
    prerequisites: after('ML_M10_FAVOR_ALREADY_PAID'),
    objectives: [
      {
        id: 'old_drop',
        kind: 'EVENT_COUNT',
        description: 'Reach the old drop: scout Urban Ghetto.',
        target: 1,
        params: { eventTypes: ['SCOUT'], where: { districtKey: 'URBAN_GHETTO' } },
      },
      scene('ML_M11_TERMS_OF_QUIET', 'notice_examined', 'Find the notice.'),
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 450_000 },
      { kind: 'CONTACT_REP', key: 'VIC', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Vic does not like returning to places. He says it teaches them to expect you.',
      inProgress: 'The drop was a laundromat in Urban Ghetto, back when it still took coins. Vic has not been inside in eleven years.\n\n“Walk me there,” he says. “If I go alone, I’ll find a reason to turn around.”',
      ready: 'Vic locks the laundromat door behind you with a key he should not still have.',
      completed: '“I didn’t sell anybody out,” Vic says on the curb. “I made a deal I couldn’t control. Turns out that’s worse. Selling out at least has a price you can read.”',
      actionHint: 'Scout Urban Ghetto to reach the old drop, then find the notice in the scene below.',
      scenes: [{
        key: 'notice_examined',
        title: 'Behind the radiator',
        after: ['old_drop'],
        prose: 'The notice is still there, folded behind the radiator where Vic left it for collection eleven years ago. Nobody collected it.\n\nThe signature at the bottom is old. The date at the top is fresh, written last month in a different ink. Somebody has been keeping this paper alive.',
        responses: [
          {
            key: 'burn_it',
            label: 'Burn it in the sink',
            outcome: 'It catches slowly, the way old paper does. Vic watches until it is ash and then keeps watching. “That was a copy,” he says finally. “She’d never keep the original somewhere I could reach.”',
          },
          {
            key: 'take_to_ledger',
            label: 'Fold it into your coat for Ledger',
            outcome: 'Vic nods once. “The fresh date,” he says. “Make sure she sees the fresh date. That’s the part that means somebody’s still collecting.”',
          },
          {
            key: 'hand_it_to_vic',
            label: 'Hand it back to Vic',
            outcome: 'Vic holds it the way people hold a letter from someone who died. Then he puts it in his inside pocket. “Thank you,” he says, which is not a thing Vic says.',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M12_CLERK_ON_THE_STAIRS'],
  },

  ML_M12_CLERK_ON_THE_STAIRS: {
    ...campaign,
    key: 'ML_M12_CLERK_ON_THE_STAIRS',
    title: 'The Clerk on the Stairs',
    description: 'Ledger knows a retired bookkeeper who once kept the Clearinghouse’s accounts. He is old, and he does not come downstairs anymore.',
    contactKey: 'LEDGER',
    prerequisites: after('ML_M11_TERMS_OF_QUIET'),
    objectives: [
      sum('hales_medicine', 'Bring Mr. Hales 5 medicine from the Corner.', 5, ['STORE_BUY'], { storeKey: 'CORNER', itemKey: 'MEDICINE' }),
      scene('ML_M12_CLERK_ON_THE_STAIRS', 'hales_copy_compared', 'Compare Mr. Hales’s copy with Ledger.'),
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 450_000 },
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Ledger calls him the last honest bookkeeper in the city. She says it like a diagnosis.',
      inProgress: 'Mr. Hales lives at the top of four flights of stairs and has not been down them since winter. Ledger says he will talk, but not to anyone who arrives empty-handed.\n\n“He won’t ask for anything,” she says. “Bring his medicine anyway.”',
      ready: 'Mr. Hales sees you to the top of the stairs and no further. Ledger waits at the bottom with the carbon in an evidence sleeve.',
      completed: '“People think the books are about money,” Ledger says. “They’re about permission. Who agreed to what, and when. Hales kept the one page where somebody didn’t.”',
      actionHint: 'Buy 5 medicine at the Corner for Mr. Hales, then compare his copy in the scene below.',
      scenes: [{
        key: 'hales_copy_compared',
        title: 'The carbon in the bread box',
        after: ['hales_medicine'],
        prose: 'Mr. Hales recognizes Mara’s mark before Ledger finishes unfolding the receipt. The Clearinghouse used to erase debts, he says, when both sides agreed to it. That was the whole business. Then people started paying to move a debt without telling the person who owed it.\n\nHe kept one carbon from those years, in a bread box above the stove, because his daughter’s name was on it.',
        responses: [
          {
            key: 'ask_about_daughter',
            label: 'Ask about his daughter',
            outcome: '“She paid it,” Hales says. “Twice. Once to the man who lent it, once to whoever bought it from him. She never knew there were two of them.” He does not say where she is now.',
          },
          {
            key: 'ask_about_the_mark',
            label: 'Ask what Mara’s mark means',
            outcome: '“It means the debt was moved through her,” Hales says. “Not bought. Moved. She never owned a debt in her life. She just decided who did.”',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M13_DATE_CHANGED_IN_INK'],
  },

  ML_M13_DATE_CHANGED_IN_INK: {
    ...campaign,
    key: 'ML_M13_DATE_CHANGED_IN_INK',
    title: 'A Date Changed in Ink',
    description: 'Tommy has a raid report and a crew roster that do not agree about the night the rival crew came.',
    contactKey: 'TOMMY',
    prerequisites: after('ML_M12_CLERK_ON_THE_STAIRS'),
    objectives: [
      sum('crew_ammo', 'Buy 2 ammo boxes from Tommy.', 2, ['STORE_BUY'], { storeKey: 'TOMMY', itemKey: 'AMMO_BOX' }),
      scene('ML_M13_DATE_CHANGED_IN_INK', 'raid_report_reviewed', 'Read the raid report with Tommy.'),
    ],
    bonusObjectives: [
      { id: 'recon_a_rival', kind: 'EVENT_COUNT', description: 'Bonus: recon a rival in your city, the way the report claims someone did.', target: 1, params: { eventTypes: ['COMBAT_RECON'] } },
    ],
    rewards: [
      { kind: 'CASH', amount: 500_000 },
      { kind: 'CONTACT_REP', key: 'TOMMY', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Tommy reads police paperwork the way other people read horoscopes: skeptically, and every week.',
      inProgress: 'Tommy has a copy of the raid report from the night the rival crew hit the corner, and the roster of who was working it.\n\n“I don’t talk raids with a crew that can’t answer one,” he says. “Stock up first. Then we read.”',
      ready: 'Tommy folds the report into quarters and then into eighths, until it is too small to be a document anymore.',
      completed: '“Somebody wanted a warning,” Tommy says. “Somebody else wanted a fight. They used the same piece of paper for both.”',
      actionHint: 'Buy 2 ammo boxes from Tommy, then read the report in the scene below. A recon is a bonus, not a requirement.',
      scenes: [{
        key: 'raid_report_reviewed',
        title: 'Filed before the fact',
        after: ['crew_ammo'],
        prose: 'Tommy lays the crew roster beside the raid report. The report describes the rival crew arriving at the corner, the shots, the time. It is stamped as received the afternoon before any of it happened.\n\nThe rival crew was paid to show up at the right time. Whoever wrote the report expected nobody to get hurt. Somebody between the report and the street made sure somebody did.',
        responses: [
          {
            key: 'ask_who_wrote_it',
            label: 'Ask who signs reports like this',
            outcome: '“A precinct clerk who owed somebody,” Tommy says. “They always owe somebody. That’s why they’re clerks.”',
          },
          {
            key: 'ask_who_got_hurt',
            label: 'Ask who got hurt that night',
            outcome: 'Tommy names two of his own, and a kid from the rival crew who did not know there was supposed to be no shooting. He says the third name the slowest.',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M14_WOMAN_AT_CLOSING'],
  },

  ML_M14_WOMAN_AT_CLOSING: {
    ...campaign,
    key: 'ML_M14_WOMAN_AT_CLOSING',
    title: 'The Woman at Closing',
    description: 'Mrs. Alvarez has something she has been hiding since the night of the receipt. Mama wants someone on her door before she brings it out.',
    contactKey: 'MAMA_KING',
    prerequisites: after('ML_M13_DATE_CHANGED_IN_INK'),
    objectives: [
      sum('door_muscle', 'Hire a thug from Tommy to watch Mrs. Alvarez’s door.', 1, ['STORE_BUY'], { storeKey: 'TOMMY', itemKey: 'THUG' }),
      scene('ML_M14_WOMAN_AT_CLOSING', 'second_receipt_returned', 'Hear what Mrs. Alvarez was hiding.'),
    ],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 500_000 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'The corner shop has its lights on for the first time since spring.',
      inProgress: 'Mrs. Alvarez sent word through Mama: she has another receipt, and she will hand it over, but not while the door is open to the street.\n\n“Put somebody on that door,” Mama says. “Somebody who stays.”',
      ready: 'The thug on the door has not moved. Mrs. Alvarez makes him coffee anyway.',
      completed: 'Mama keeps both receipts now, the first and the second, in the same coat pocket. “I knew they were in trouble,” she says. “I didn’t know who owned the paper. That’s not an excuse. It’s just what happened.”',
      actionHint: 'Hire a thug at Tommy’s for the door, then hear Mrs. Alvarez out in the scene below.',
      scenes: [{
        key: 'second_receipt_returned',
        title: 'The second receipt',
        after: ['door_muscle'],
        prose: 'Mrs. Alvarez puts a second receipt on the counter, the original this time, the one she hid on the night you first came.\n\nThe erased line was her husband’s name. He did not run off with the money, as the street said. He signed their shop away to cover a debt he believed was already paid, and then he could not face her.',
        responses: [
          {
            key: 'include_his_name',
            label: 'Ask if his name can go in the record',
            outcome: 'She thinks about it for a long time. “Put it in,” she says. “If they get to write him out, they win twice.”',
          },
          {
            key: 'leave_him_out',
            label: 'Tell her his name can stay out of it',
            outcome: '“Thank you,” she says. “He was a fool. He wasn’t a thief. I don’t want those to end up on the same page.”',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M15_NAME_IN_THE_MARGIN'],
  },

  ML_M15_NAME_IN_THE_MARGIN: {
    ...campaign,
    key: 'ML_M15_NAME_IN_THE_MARGIN',
    title: 'Your Name in the Margin',
    description: 'Ledger has seen the newest book. Your crew is in it.',
    contactKey: 'LEDGER',
    prerequisites: after('ML_M14_WOMAN_AT_CLOSING'),
    objectives: [scene('ML_M15_NAME_IN_THE_MARGIN', 'crew_entry_read', 'Read your crew’s entry with Ledger.')],
    bonusObjectives: [],
    rewards: [
      { kind: 'CASH', amount: 600_000 },
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 5 },
    ],
    branches: [
      stance('DISPUTE_THE_ENTRY', 'Dispute the entry', 'You never agreed to owe anything. Ledger will write that down where it counts.', 'LEDGER'),
      stance('LEAVE_IT_FOR_NOW', 'Leave it for now', 'Let the Clearinghouse think the crew hasn’t noticed. Vic knows how to make that look natural.', 'VIC'),
      stance('KEEP_A_COPY', 'Keep a copy', 'Copy the page and say nothing. Mama keeps it with the two receipts.', 'MAMA_KING'),
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Ledger does not call. She sends a note with an address and the word “now.”',
      inProgress: 'Ledger has a photograph of a page from the newest book, the one the Clearinghouse is still writing in. She does not hand it over right away.\n\n“Sit down first,” she says. “People always want to stand up for this part, and then they want to sit down halfway through.”',
      ready: 'Ledger waits. She has seen people make this choice before, she says, and the ones who rushed it all regretted the speed more than the choice.',
      completed: 'Ledger writes your decision on an index card and files it under your crew’s name, in her own book, which is the only one in the city you are sure is honest.',
      actionHint: 'Read the entry in the scene below. When you collect, choose what the crew does about it.',
      scenes: [{
        key: 'crew_entry_read',
        title: 'Your name in the margin',
        prose: 'Your crew’s name is in the newest book, in the margin, in Mara’s hand. It is not a debt you remember taking.\n\nIt is a value: so many routes, so much muscle, so many nights of silence, priced in advance. The Clearinghouse has started collecting on favors the crew has not done yet, from people it has not met.',
        responses: [
          {
            key: 'count_the_favors',
            label: 'Count what they think you owe',
            outcome: 'Ledger watches you add it up. “That’s not a debt,” she says. “That’s a forecast. She’s betting on what you’ll become.”',
          },
          {
            key: 'check_the_date',
            label: 'Check when it was entered',
            outcome: 'The entry is dated the night of the receipt. Mara wrote your name in the book before you knew hers.',
          },
        ],
      }],
    },
    followUpKeys: [],
  },
};
