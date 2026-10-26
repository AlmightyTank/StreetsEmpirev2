import { missingLineActOne } from '../classic-og-v2.6-a/missing-line-act-1.js';
import type { QuestDefinitionCatalog, QuestObjectiveDefinition } from '../types.js';

/**
 * 2.6.0-B. The Missing Line, Act II: Three Ways to Lose a Load. Three leads open together after
 * Act I and can be followed in any order; Two Buyers, One Load waits for all three, then Vic's
 * confession carries the story into Act III. Evidence follows the Slice A contract.
 *
 * It re-issues Act I's last chapter, so it is only valid merged into the 2.6.0-A catalog; the
 * ruleset validates the whole catalog.
 */

const CHAPTER = 'Act II · Three Ways to Lose a Load';
const LEADS = ['ML_M06_PIPS_COUNT', 'ML_M07_NORTH_ROAD', 'ML_M08_TOMMYS_SERIAL'] as const;

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

const afterActOne = [{ kind: 'QUEST_COMPLETED', params: { questKey: 'ML_M05_MISSING_LINE' } }] as const;

export const missingLineActTwo: QuestDefinitionCatalog = {
  // Act I's last chapter now opens the three leads.
  ML_M05_MISSING_LINE: { ...missingLineActOne.ML_M05_MISSING_LINE, followUpKeys: [...LEADS] },

  ML_M06_PIPS_COUNT: {
    ...campaign,
    key: 'ML_M06_PIPS_COUNT',
    title: 'Pip’s Count',
    description: 'One of three leads, in any order. Pip’s books say the shipment was complete. His scale says otherwise.',
    contactKey: 'PIP',
    prerequisites: [...afterActOne],
    objectives: [{
      id: 'pip_trade',
      kind: 'EVENT_COUNT',
      description: 'Buy from or sell to Pip.',
      target: 1,
      params: { eventTypes: ['STORE_BUY', 'STORE_SELL'], where: { storeKey: 'PIP' } },
    }],
    rewards: [
      { kind: 'CASH', amount: 250_000 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Pip keeps two books. One is for customers. The other is for Pip, and he has started reading it twice.',
      inProgress: 'Pip’s books say the corner-shop load left complete. His scale says it was short before it ever reached the street.\n\n“Trade with me,” he says. “I want a fresh receipt beside the old count, so I can see which one is lying.”',
      ready: 'Pip lays your receipt beside his count sheet and runs a finger down both. The shortage is real, and it was there before the load left his door. He blames his supplier, out loud, until he turns the page and finds a debt transfer with the supplier’s initials on it. His own signature is underneath.',
      completed: '“I signed it without reading it,” Pip says. “Everybody signs those without reading them. That’s what they’re for.”',
      actionHint: 'Make any trade at Pip’s counter.',
    },
    followUpKeys: ['ML_M09_TWO_BUYERS'],
  },

  ML_M07_NORTH_ROAD: {
    ...campaign,
    key: 'ML_M07_NORTH_ROAD',
    title: 'The North Road',
    description: 'One of three leads, in any order. Wheels is rebuilding the delivery route from old driver notes.',
    contactKey: 'WHEELS',
    prerequisites: [...afterActOne],
    objectives: [{
      id: 'run_home',
      kind: 'EVENT_COUNT',
      description: 'Bring one intercity run home.',
      target: 1,
      params: { eventTypes: ['RUN_RETURNED'] },
    }],
    rewards: [
      { kind: 'CASH', amount: 300_000 },
      { kind: 'CONTACT_REP', key: 'WHEELS', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Wheels does not trust maps. He trusts drivers, and he trusts the notes they leave in the door pocket.',
      inProgress: 'Wheels has the old driver notes spread across a car hood under a work light. The truck that never reached the shop took a turn that was never on the dispatch map.\n\n“Run a car north and bring it back,” he says. “I want a clean route to lay over the dirty one.”',
      ready: 'Your route and the old one line up until the river, then split. Wheels stares at the split for a long time. He approved that turn himself. A caller told him the main road was watched that night, and the caller knew the crew’s name.',
      completed: '“I thought I was being careful,” Wheels says. “Turns out I was being told where to go.”',
      actionHint: 'Launch any intercity run and bring it home.',
    },
    followUpKeys: ['ML_M09_TWO_BUYERS'],
  },

  ML_M08_TOMMYS_SERIAL: {
    ...campaign,
    key: 'ML_M08_TOMMYS_SERIAL',
    title: 'Tommy’s Serial',
    description: 'One of three leads, in any order. A weapons crate found near the shuttered shop came out of Tommy’s inventory.',
    contactKey: 'TOMMY',
    prerequisites: [...afterActOne],
    objectives: [{
      id: 'tommy_buy',
      kind: 'EVENT_COUNT',
      description: 'Buy anything from Tommy.',
      target: 1,
      params: { eventTypes: ['STORE_BUY'], where: { storeKey: 'TOMMY' } },
    }],
    rewards: [
      { kind: 'CASH', amount: 300_000 },
      { kind: 'CONTACT_REP', key: 'TOMMY', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Tommy sells clean and says so before anyone asks.',
      inProgress: 'A crate turned up behind the shuttered shop with a number stenciled on the lid that Tommy recognizes as his own.\n\n“I sold that lot clean,” he says. “Buy something. I’ll write you a receipt the way I wrote that one, and you can tell me where the difference is.”',
      ready: 'Tommy pulls his old tally book and finds the crate. The buyer paid in full, with a debt that had already been marked settled somewhere else. On paper, Tommy was paid twice. In his hand, he was paid nothing.',
      completed: '“Somebody used my word as a receipt,” Tommy says, and closes the tally book harder than he needs to.',
      actionHint: 'Buy anything from Tommy.',
    },
    followUpKeys: ['ML_M09_TWO_BUYERS'],
  },

  ML_M09_TWO_BUYERS: {
    ...campaign,
    key: 'ML_M09_TWO_BUYERS',
    title: 'Two Buyers, One Load',
    description: 'With all three leads in hand, Ledger lays them side by side. The same load was sold twice.',
    contactKey: 'LEDGER',
    prerequisites: LEADS.map((questKey) => ({ kind: 'QUEST_COMPLETED', params: { questKey } })),
    objectives: [sceneObjective('ML_M09_TWO_BUYERS', 'two_buyers_briefed', 'Lay out the three leads with Ledger.')],
    rewards: [
      { kind: 'CASH', amount: 350_000 },
      { kind: 'CONTACT_REP', key: 'LEDGER', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Ledger has cleared a table for three pieces of paper and nothing else.',
      inProgress: 'Pip’s count, Wheels’ route, and Tommy’s tally sit in a row under Ledger’s lamp.\n\n“Three people,” she says, “and each of them thinks they were the only one who got careless.”',
      ready: 'Ledger squares the three papers into one stack. On top she writes a single line in pencil: one load, two buyers, no thief.',
      completed: '“Now you can see the shape of it,” Ledger says. “You still can’t see the hand. Somebody is going to come to you about that before you go looking.”',
      actionHint: 'The three leads are laid out in the scene below. Decide who hears it first, then collect.',
      scenes: [{
        key: 'two_buyers_briefed',
        title: 'One load, two buyers',
        prose: 'Laid side by side, the three accounts point to one transfer. The same goods were promised to two buyers, then routed so each one believed the other had stolen them. Nobody had to steal anything. Everyone just had to be angry at the right person.\n\nYou can see the shape of the trick. You cannot see who ordered it. Somebody has to hear this first.',
        responses: [
          {
            key: 'brief_pip',
            label: 'Tell Pip first',
            outcome: 'Pip hears it standing up and sits down halfway through. “Then my supplier didn’t rob me,” he says. “He was robbed with me.”',
          },
          {
            key: 'brief_wheels',
            label: 'Tell Wheels first',
            outcome: 'Wheels listens with his keys in his hand. When you finish he puts them on the table, which is the closest he comes to saying thank you.',
          },
          {
            key: 'brief_tommy',
            label: 'Tell Tommy first',
            outcome: 'Tommy says nothing for a full minute. Then he says, “Two buyers. One of them came back to me angry. I sold him a gun.”',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M10_FAVOR_ALREADY_PAID'],
  },

  ML_M10_FAVOR_ALREADY_PAID: {
    ...campaign,
    key: 'ML_M10_FAVOR_ALREADY_PAID',
    title: 'A Favor Already Paid',
    description: 'Vic finds you before you find him. He once asked Mara Venn for a favor, and he thought he had paid for it.',
    contactKey: 'VIC',
    prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'ML_M09_TWO_BUYERS' } }],
    objectives: [sceneObjective('ML_M10_FAVOR_ALREADY_PAID', 'vic_favor_answered', 'Hear what Vic owes.')],
    rewards: [
      { kind: 'CASH', amount: 400_000 },
      { kind: 'CONTACT_REP', key: 'VIC', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Vic trades in favors, and he never comes to you first. Tonight he does.',
      inProgress: 'Vic is waiting in your booth when you arrive, with two coffees he has not touched.\n\n“You’ve been saying a name,” he says. “I’d like to tell you how I know it before somebody else tells you for me.”',
      ready: 'Vic finishes his coffee cold and leaves money on the table, more than the coffee costs. With Vic, that is a sentence.',
      completed: '“I paid cash,” Vic says at the door. “I want you to remember I paid cash. She just never wrote it down.”',
      actionHint: 'Vic’s confession is in the scene below. Decide what to do with it, then collect.',
      scenes: [{
        key: 'vic_favor_answered',
        title: 'Paid in cash',
        prose: 'Years ago, Vic asked Mara Venn to bury a police notice before it reached a crew he was protecting. She did. He paid her in cash, that night, in full.\n\nShe entered it anyway, as an open debt with his name on it. Now the name is worth more than the favor ever was, and Vic wants the record gone before anyone it touches gets hurt.',
        responses: [
          {
            key: 'take_to_ledger',
            label: 'Take his story to Ledger',
            outcome: 'Vic flinches at the name, then nods. “She’ll write it down,” he says. “Fine. At least this time it’ll be written down right.”',
          },
          {
            key: 'protect_the_name',
            label: 'Keep the name on the notice between you',
            outcome: 'Vic looks at you for a long moment. “Then we both owe somebody now,” he says. “Try to keep better books than I did.”',
          },
        ],
      }],
    },
    followUpKeys: [],
  },
};
