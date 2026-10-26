import { missingLineActThree } from '../classic-og-v2.6-d/missing-line-act-3.js';
import type { QuestDefinitionCatalog, QuestObjectiveDefinition, QuestPrerequisiteDefinition } from '../types.js';

/**
 * 2.6.0-E. The Missing Line, Act IV: The Road Keeps Its Own Books. Written to the R3 standard.
 * Wheels follows the altered route to a depot and to Eli; Mama answers for the page Eli kept;
 * Pip squares his scale; Blocks shows what the debts were buying. Nothing here needs turf or a
 * fight.
 *
 * It re-issues Your Name in the Margin so every choice leads here, so it is only valid merged
 * into the 2.6.0-D catalog; the ruleset validates the whole catalog.
 */

const CHAPTER = 'Act IV · The Road Keeps Its Own Books';

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

const campaign = {
  type: 'STORY',
  category: 'CAMPAIGN',
  difficulty: 'STREET_JOB',
  bonusObjectives: [],
  repeatability: 'ONCE',
  expiresAfterMinutes: null,
  availability: {},
} as const;

const margin = missingLineActThree.ML_M15_NAME_IN_THE_MARGIN!;

export const missingLineActFour: QuestDefinitionCatalog = {
  // Act III's last chapter now opens Act IV, whichever way the crew chose.
  ML_M15_NAME_IN_THE_MARGIN: {
    ...margin,
    followUpKeys: ['ML_M16_MILE_MARKER_NINE'],
    branches: margin.branches!.map((branch) => ({ ...branch, followUpKeys: ['ML_M16_MILE_MARKER_NINE'] })),
  },

  ML_M16_MILE_MARKER_NINE: {
    ...campaign,
    key: 'ML_M16_MILE_MARKER_NINE',
    title: 'Mile Marker Nine',
    description: 'Wheels wants to drive the altered route to the end and see what is waiting there.',
    contactKey: 'WHEELS',
    prerequisites: after('ML_M15_NAME_IN_THE_MARGIN'),
    objectives: [
      { id: 'run_home', kind: 'EVENT_COUNT', description: 'Bring one intercity run home.', target: 1, params: { eventTypes: ['RUN_RETURNED'] } },
      scene('ML_M16_MILE_MARKER_NINE', 'depot_found', 'See what the road leads to.'),
    ],
    rewards: [
      { kind: 'CASH', amount: 650_000 },
      { kind: 'CONTACT_REP', key: 'WHEELS', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Wheels has been driving the north road in his head every night since he found the split.',
      inProgress: 'Wheels has marked the altered turn on a road atlas older than both of you. Past the river, the road keeps going. The atlas says it stops at mile marker nine.\n\n“Send a car out past the split and bring it back,” he says. “I want to know what the road keeps for itself.”',
      ready: 'Wheels tears the page with mile marker nine out of the atlas and folds it into his wallet, behind his license.',
      completed: '“I taught Eli that road,” Wheels says. “I taught him how to drive it without being seen. I just never thought to ask who else he drove it for.”',
      actionHint: 'Launch any intercity run and bring it home, then see where the route leads in the scene below.',
      scenes: [{
        key: 'depot_found',
        title: 'The depot at mile marker nine',
        after: ['run_home'],
        prose: 'Past the split, the route ends at a depot that no longer appears on any city map: a loading bay, a dead sign, three trucks with clean plates.\n\nThe drivers are not hiding stolen product. They are moving sealed account books, one at a time, between people who never meet. On the clipboard by the bay door is a passenger list. The ninth name is Eli’s.',
        responses: [
          {
            key: 'photograph_the_list',
            label: 'Photograph the passenger list',
            outcome: 'Wheels keeps the engine running while you do it. “Nine names,” he says on the way out. “Nine people who think they’re just making a delivery.”',
          },
          {
            key: 'watch_the_drivers',
            label: 'Watch the drivers load',
            outcome: 'They handle the books like explosives: two hands, no talking, a signature for each one. Wheels counts the signatures. “Everybody signs,” he says. “Nobody reads.”',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M17_PASSENGER_NINE'],
  },

  ML_M17_PASSENGER_NINE: {
    ...campaign,
    key: 'ML_M17_PASSENGER_NINE',
    title: 'Passenger No. 9',
    description: 'Eli is alive, working at the depot under a borrowed name. Getting him out takes a car nobody connects to the crew.',
    contactKey: 'WHEELS',
    prerequisites: after('ML_M16_MILE_MARKER_NINE'),
    objectives: [
      scene('ML_M17_PASSENGER_NINE', 'eli_located', 'Reach Eli at the depot.'),
      {
        id: 'clean_car',
        kind: 'EVENT_SUM',
        description: 'Buy a Low-Rider from Charlie that nobody connects to the crew.',
        target: 1,
        params: { eventTypes: ['STORE_BUY'], field: 'quantity', where: { storeKey: 'CHARLIE', itemKey: 'LOW_RIDER' } },
      },
    ],
    rewards: [
      { kind: 'CASH', amount: 650_000 },
      { kind: 'CONTACT_REP', key: 'WHEELS', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Eli’s name on a passenger list means Eli is alive. Wheels has said it out loud four times, to make sure.',
      inProgress: 'Eli works the depot’s loading bay under a borrowed name. The drivers there know every car the crew owns.\n\n“First we reach him,” Wheels says. “Then we get him out in something nobody has ever seen us in.”',
      ready: 'The Low-Rider pulls out of the depot lot with its lights off and Eli lying flat across the back seat.',
      completed: 'Eli sleeps for fourteen hours on Mama’s couch. When he wakes up, the first thing he asks for is the torn page.',
      actionHint: 'Reach Eli in the scene below, then buy a Low-Rider from Charlie to get him out.',
      scenes: [{
        key: 'eli_located',
        title: 'Passenger No. 9',
        prose: 'Eli admits it before you ask. He carried one book, once, because Mara promised to clear his mother’s debt if he did. He did not know the book had other people’s names in it until the seal split in the rain.\n\nWhen he saw what it was, he tore out one page and kept it. He has been waiting at the depot ever since, too scared to run and too ashamed to call.',
        responses: [
          {
            key: 'talk_to_eli_directly',
            label: 'Talk to Eli yourself',
            outcome: 'Eli does not look at you for the first minute. Then he says, “Mama’s name is on the page,” and starts crying like he has been holding it since spring.',
          },
          {
            key: 'let_wheels_introduce',
            label: 'Let Wheels do the talking',
            outcome: 'Wheels puts a hand on the back of Eli’s neck the way he used to when teaching him to park. “You signed your runs,” he says. “You wanted somebody to find you. We found you.”',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M18_WHAT_MAMA_BOUGHT'],
  },

  ML_M18_WHAT_MAMA_BOUGHT: {
    ...campaign,
    key: 'ML_M18_WHAT_MAMA_BOUGHT',
    title: 'What Mama Bought',
    description: 'The page Eli kept has Mama’s name on it. She has a story to tell before anyone else tells it for her.',
    contactKey: 'MAMA_KING',
    prerequisites: after('ML_M17_PASSENGER_NINE'),
    objectives: [scene('ML_M18_WHAT_MAMA_BOUGHT', 'mama_debt_reckoned', 'Hear what Mama owes.')],
    rewards: [
      { kind: 'CASH', amount: 700_000 },
      { kind: 'CONTACT_REP', key: 'MAMA_KING', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Mama has made tea and not drunk it. In thirty years, nobody has seen her do that.',
      inProgress: 'Eli’s torn page is on Mama’s table, under the teapot, where she can see it and not touch it.\n\n“Sit,” she says. “I’m not going to tell you I didn’t know. I’m going to tell you why I wanted to believe the receipt.”',
      ready: 'Mama folds the torn page into the same coat pocket as the two receipts. “That’s everything,” she says. “That’s all of it now.”',
      completed: 'Mama does not tell you she was innocent. She tells you she was tired, and that a debt that looks paid is the most restful thing in the world.',
      actionHint: 'Hear Mama out in the scene below.',
      scenes: [{
        key: 'mama_debt_reckoned',
        title: 'The fire on Delancey',
        prose: 'Years ago a fire took half a block on Delancey and left eleven families with nowhere to sleep. Mama needed money that night, more than she had, faster than anyone legal would lend it. Somebody offered. She took it.\n\nShe repaid it over four years and thought it ended there. The page says otherwise: the debt was moved, sold, and moved again, and Mama’s name has been underwriting other people’s trouble ever since.',
        responses: [
          {
            key: 'repay_quietly',
            label: 'Help her settle it quietly',
            outcome: '“Quiet’s how I got here,” Mama says. But she nods. “Quiet, then. One more time. And then never again.”',
          },
          {
            key: 'tell_the_families',
            label: 'Tell her the families deserve to know',
            outcome: 'Mama closes her eyes. “They do,” she says. “They’ll hate me for a week and then they’ll bring food, because that’s what that block does. I’d rather be hated by them than protected by her.”',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M19_HONEST_SCALE'],
  },

  ML_M19_HONEST_SCALE: {
    ...campaign,
    key: 'ML_M19_HONEST_SCALE',
    title: 'The Honest Scale',
    description: 'Pip has found the account entry for the original shipment. Fixing it means admitting what his own books hid.',
    contactKey: 'PIP',
    prerequisites: after('ML_M18_WHAT_MAMA_BOUGHT'),
    objectives: [
      { id: 'pip_sale', kind: 'EVENT_SUM', description: 'Sell Pip 20 units of anything.', target: 20, params: { eventTypes: ['STORE_SELL'], field: 'quantity', where: { storeKey: 'PIP' } } },
      scene('ML_M19_HONEST_SCALE', 'honest_scale', 'Decide how Pip squares it.'),
    ],
    rewards: [
      { kind: 'CASH', amount: 700_000 },
      { kind: 'CONTACT_REP', key: 'PIP', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Pip has bought a new scale. He says the old one was fine. He says it too quickly.',
      inProgress: 'Pip found the entry for the corner-shop load. The shortage was real, and the missing goods went to cover somebody else’s debt, through his books, with his signature.\n\n“I want to fix it with my supplier,” he says. “First I need a week of honest numbers to show him. Sell to me like you mean it.”',
      ready: 'Pip weighs your last sale twice on the new scale, then writes the number down in pen.',
      completed: '“Twelve years,” Pip says. “And the first honest thing I ever showed him was proof I’d been lying.”',
      actionHint: 'Sell Pip 20 units at his counter, then decide in the scene below how he squares it.',
      scenes: [{
        key: 'honest_scale',
        title: 'The honest scale',
        after: ['pip_sale'],
        prose: 'Pip lays the old entry and the new numbers side by side. His supplier never shorted him. Pip’s own books did, to cover a debt that belonged to someone else, and Pip signed every page.\n\nHe can repair it. It means telling his supplier that the books that called him a thief were Pip’s.',
        responses: [
          {
            key: 'tell_him_in_person',
            label: 'Go with Pip to tell the supplier in person',
            outcome: 'The supplier listens to all of it standing in his doorway. Then he steps back and lets Pip in. Neither of them says anything about it again.',
          },
          {
            key: 'send_the_books',
            label: 'Send the corrected books and a letter',
            outcome: 'Pip writes the letter four times. The fourth is two sentences long. The supplier’s reply comes the next morning, and it is one: “Come by Thursday.”',
          },
        ],
      }],
    },
    followUpKeys: ['ML_M20_MAP_IN_THE_MARGINS'],
  },

  ML_M20_MAP_IN_THE_MARGINS: {
    ...campaign,
    key: 'ML_M20_MAP_IN_THE_MARGINS',
    title: 'The Map in the Margins',
    description: 'Blocks lays Eli’s torn page over his turf map. The marks are not a drug route.',
    contactKey: 'BLOCKS',
    prerequisites: after('ML_M19_HONEST_SCALE'),
    objectives: [
      {
        id: 'walk_the_corridor',
        kind: 'UNIQUE_VALUES',
        description: 'Walk the corridor: scout 3 different districts.',
        target: 3,
        params: { eventTypes: ['SCOUT'], field: 'districtKey' },
      },
      scene('ML_M20_MAP_IN_THE_MARGINS', 'corridor_map_matched', 'Lay the page over Blocks’ map.'),
    ],
    rewards: [
      { kind: 'CASH', amount: 800_000 },
      { kind: 'CONTACT_REP', key: 'BLOCKS', amount: 5 },
    ],
    story: {
      chapter: CHAPTER,
      intro: 'Blocks knows every corner in the city by who owns it, who wants it and who is about to lose it.',
      inProgress: 'Blocks has Eli’s torn page and a turf map with thirty years of pencil on it. He will not lay one over the other until you have walked the ground yourself.\n\n“Paper lies,” he says. “Streets don’t. Go see three of them, then come back.”',
      ready: 'Blocks rolls the map up with the page still inside it, like he is afraid the page might wander off.',
      completed: '“She’s not buying corners,” Blocks says. “She’s buying the debts under them. When the owners fall behind, the same buyer takes the whole strip, and nobody fired a shot.”',
      actionHint: 'Scout 3 different districts, then lay the page over the map in the scene below.',
      scenes: [{
        key: 'corridor_map_matched',
        title: 'The corridor',
        after: ['walk_the_corridor'],
        prose: 'Laid over the turf map, the marks on Eli’s page line up with a row of businesses and blocks: the corner shop, the laundromat, the depot road, Mama’s side of Delancey. Not a drug route. A corridor.\n\nThe Clearinghouse has been buying the old debts attached to every property along it.',
        responses: [
          {
            key: 'count_the_properties',
            label: 'Count what she already holds',
            outcome: 'Blocks counts with a pencil. Fourteen properties. Sixteen with the shop and Mama’s block. “She needs four more,” he says, “and she owns the street.”',
          },
          {
            key: 'find_the_gap',
            label: 'Look for the one she doesn’t have',
            outcome: 'There is one. Blocks taps it twice. “The man who signed that one signed two different papers,” he says. “He’s either our way in or her last piece.”',
          },
        ],
      }],
    },
    followUpKeys: [],
  },
};
