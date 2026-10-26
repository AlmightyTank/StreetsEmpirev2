import { missingLineActOne } from '../classic-og-v2.6-a/missing-line-act-1.js';
import { missingLineActTwo } from '../classic-og-v2.6-b/missing-line-act-2.js';
import type { QuestDefinition, QuestDefinitionCatalog, QuestObjectiveDefinition } from '../types.js';

/**
 * 2.6.0-C. The Missing Line depth pass over Acts I and II. Each chapter now asks for a real piece
 * of work that fits the contact's job, and a reveal that used to sit in the ready text is played
 * as a scene once that work is done. Keys, rewards and the chain are unchanged; only objectives and
 * story copy are re-issued. Evidence is limited to events verified in Slice A and R3.
 */

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

function reissue(base: QuestDefinition, changes: Pick<QuestDefinition, 'objectives'> & { story: Partial<NonNullable<QuestDefinition['story']>> }): QuestDefinition {
  return { ...base, objectives: changes.objectives, story: { ...base.story!, ...changes.story } };
}

const one = missingLineActOne as QuestDefinitionCatalog;
const two = missingLineActTwo;

export const missingLineDepth: QuestDefinitionCatalog = {
  ML_M01_NIGHT_RECEIPT: reissue(one.ML_M01_NIGHT_RECEIPT!, {
    objectives: [
      scene('ML_M01_NIGHT_RECEIPT', 'night_receipt_handled', 'Decide what to do with Mama’s receipt.'),
      {
        id: 'walk_it_back',
        kind: 'EVENT_COUNT',
        description: 'Walk the receipt back: scout your city’s working-class district.',
        target: 1,
        params: { eventTypes: ['SCOUT'], where: { districtKey: 'LOW_RENT' } },
      },
    ],
    story: {
      ready: 'The envelope is through Mrs. Alvarez’s mail slot. On the walk back you passed the shop twice. The second time, a coat moved behind the dark glass.',
      actionHint: 'Decide what to do with the receipt in the scene below, then scout your city’s working-class district to walk it back to the shop.',
    },
  }),

  ML_M02_SMALL_FAVOR: reissue(one.ML_M02_SMALL_FAVOR!, {
    objectives: [
      sum('corner_beer', 'Bring Mrs. Alvarez 10 beer from the Corner.', 10, ['STORE_BUY'], { storeKey: 'CORNER', itemKey: 'BEER' }),
      scene('ML_M02_SMALL_FAVOR', 'alvarez_statement_taken', 'Hear Mrs. Alvarez’s account.'),
    ],
    story: {
      inProgress: 'Mrs. Alvarez sits in the dark with her coat on indoors, as if she has not decided whether to stay. Her shelves are bare. She will not talk to someone who walks in with empty hands.\n\n“I paid that debt months ago,” she says. “Bring something for the shelf, and ask me who I paid.”',
      actionHint: 'Buy 10 beer at the Corner for her shelf. Then hear her out in the scene below.',
      scenes: [{ ...one.ML_M02_SMALL_FAVOR!.story!.scenes![0]!, after: ['corner_beer'] }],
    },
  }),

  ML_M03_OTHER_DOOR: reissue(one.ML_M03_OTHER_DOOR!, {
    objectives: [
      sum('pip_sale', 'Sell Pip 10 units of anything.', 10, ['STORE_SELL'], { storeKey: 'PIP' }),
      scene('ML_M03_OTHER_DOOR', 'route_slip', 'Look at the slips with Pip.'),
    ],
    story: {
      inProgress: 'Pip’s driver was meant to reach the corner shop the same night as Mama’s envelope. The back door was open before he got there. No lock forced, no guard paid.\n\n“Bring me a real order,” Pip says, “and I’ll show you what I show my customers. Every sale gets a slip. Every slip has a route.”',
      ready: 'Pip folds both slips into his breast pocket and pats it once, the way other people check for a wallet.',
      actionHint: 'Sell Pip 10 units at his counter, then look at the slips in the scene below.',
      scenes: [{
        key: 'route_slip',
        title: 'Two slips',
        after: ['pip_sale'],
        prose: 'Pip pulls the slip from your sale and lays it beside his copy from the night of the delivery. The same route is printed at the top of both.\n\nOn his copy, someone has crossed it out and written a different one underneath, in a hand that is not his.',
        responses: [
          {
            key: 'ask_who_writes',
            label: 'Ask Pip who writes like that',
            outcome: '“I don’t write like that,” Pip says. “Nobody who works for me writes like that.” He says it twice, as if the second time might make it true.',
          },
          {
            key: 'keep_a_copy',
            label: 'Ask to keep a copy of the slip',
            outcome: 'Pip hesitates, then copies the crossed-out route onto the back of your slip in his own careful hand. “So you know what mine looks like,” he says.',
          },
        ],
      }],
    },
  }),

  ML_M04_ROLL_CALL: reissue(one.ML_M04_ROLL_CALL!, {
    objectives: [
      { ...one.ML_M04_ROLL_CALL!.objectives[0]! },
      scene('ML_M04_ROLL_CALL', 'eli_mark', 'Read the route with Wheels.'),
    ],
    story: {
      ready: 'Mama writes the date of the run under Eli’s name in the ledger and does not cross anything out.',
      actionHint: 'Launch any intercity run and bring it home. Runs need a car, and Charlie sells them. Then read the route with Wheels in the scene below.',
      scenes: [{
        key: 'eli_mark',
        title: 'A mark in the margin',
        after: ['run_home'],
        prose: 'When the car comes back, Wheels is waiting at the curb. He takes the driver’s copy of the route, reads it, and goes quiet.\n\nHalfway down the page is a small hooked mark in the margin. It is how Eli used to sign his runs.',
        responses: [
          {
            key: 'ask_wheels',
            label: 'Ask Wheels where that road goes',
            outcome: '“Nowhere I ever sent him,” Wheels says. “That mark’s on a road Eli never drove for me.”',
          },
          {
            key: 'tell_mama_first',
            label: 'Take the route straight to Mama',
            outcome: 'Mama looks at the mark for a long time. “He signed it,” she says. “He wanted somebody to see where he went.”',
          },
        ],
      }],
    },
  }),

  ML_M06_PIPS_COUNT: reissue(two.ML_M06_PIPS_COUNT!, {
    objectives: [
      { id: 'fresh_batch', kind: 'EVENT_COUNT', description: 'Cook one fresh batch of product.', target: 1, params: { eventTypes: ['PRODUCE_CRACK'] } },
      sum('pip_sale', 'Sell Pip 10 units of anything.', 10, ['STORE_SELL'], { storeKey: 'PIP' }),
      scene('ML_M06_PIPS_COUNT', 'count_sheet', 'Go through the count with Pip.'),
    ],
    story: {
      inProgress: 'Pip’s books say the corner-shop load left complete. His scale says it was short before it ever reached the street.\n\n“Cook me something fresh and sell it to me,” he says. “A clean batch, a clean count. Then we’ll see which of my books is lying.”',
      ready: '“I signed it without reading it,” Pip says. “Everybody signs those without reading them. That’s what they’re for.”',
      completed: 'Pip squares his two books on the counter and, for the first time since you met him, closes both.',
      actionHint: 'Cook one batch on Produce and sell Pip 10 units. Then go through the count in the scene below.',
      scenes: [{
        key: 'count_sheet',
        title: 'The count sheet',
        after: ['fresh_batch', 'pip_sale'],
        prose: 'Pip lays your receipt beside his count sheet and runs a finger down both. Your batch weighs what it should. The old load did not, and it was short before it ever left his door.\n\nHe blames his supplier, out loud, until he turns the page and finds a debt transfer with the supplier’s initials on it. His own signature is underneath.',
        responses: [
          {
            key: 'ask_about_supplier',
            label: 'Ask about the supplier',
            outcome: '“Twelve years,” Pip says. “Twelve years and he never shorted me a gram. Until somebody gave him a reason.”',
          },
          {
            key: 'point_to_signature',
            label: 'Put your finger on his signature',
            outcome: 'Pip looks at his own name for a long time. “That’s mine,” he says finally. “I don’t remember the page. I remember the pen.”',
          },
        ],
      }],
    },
  }),

  ML_M07_NORTH_ROAD: reissue(two.ML_M07_NORTH_ROAD!, {
    objectives: [
      { ...two.ML_M07_NORTH_ROAD!.objectives[0]! },
      scene('ML_M07_NORTH_ROAD', 'route_split', 'Lay the routes over each other with Wheels.'),
    ],
    story: {
      ready: '“I thought I was being careful,” Wheels says. “Turns out I was being told where to go.”',
      completed: 'Wheels folds the old driver notes into the glove box of his own car and locks it.',
      actionHint: 'Launch any intercity run and bring it home, then lay the routes over each other in the scene below.',
      scenes: [{
        key: 'route_split',
        title: 'Where the road splits',
        after: ['run_home'],
        prose: 'Your route and the old one line up until the river, then split. Wheels stares at the split for a long time.\n\nHe approved that turn himself. A caller told him the main road was watched that night, and the caller knew the crew’s name.',
        responses: [
          {
            key: 'ask_about_caller',
            label: 'Ask what the caller sounded like',
            outcome: '“Calm,” Wheels says. “Like somebody reading off a list. Like my crew was a line item.”',
          },
          {
            key: 'drive_it_yourself',
            label: 'Say you’ll drive the north road yourself next time',
            outcome: 'Wheels almost smiles. “Next time,” he says, “nobody calls me. I call them.”',
          },
        ],
      }],
    },
  }),

  ML_M08_TOMMYS_SERIAL: reissue(two.ML_M08_TOMMYS_SERIAL!, {
    objectives: [
      sum('tommy_pistols', 'Buy 5 pistols from Tommy.', 5, ['STORE_BUY'], { storeKey: 'TOMMY', itemKey: 'PISTOL' }),
      scene('ML_M08_TOMMYS_SERIAL', 'tally_book', 'Check the tally book with Tommy.'),
    ],
    story: {
      inProgress: 'A crate turned up behind the shuttered shop with a number stenciled on the lid that Tommy recognizes as his own.\n\n“I sold that lot clean,” he says. “Buy a proper order. I’ll write you a receipt the way I wrote that one, and you can tell me where the difference is.”',
      ready: '“Somebody used my word as a receipt,” Tommy says, and closes the tally book harder than he needs to.',
      completed: 'Tommy pins your receipt to the wall behind the counter, next to the license he never shows anyone.',
      actionHint: 'Buy 5 pistols from Tommy, then check the tally book in the scene below.',
      scenes: [{
        key: 'tally_book',
        title: 'The tally book',
        after: ['tommy_pistols'],
        prose: 'Tommy pulls his old tally book and finds the crate. The buyer paid in full, with a debt that had already been marked settled somewhere else.\n\nOn paper, Tommy was paid twice. In his hand, he was paid nothing.',
        responses: [
          {
            key: 'ask_who_paid',
            label: 'Ask who made the payment',
            outcome: '“A runner,” Tommy says. “Polite. Good coat. Paid with a paper from a house I’d never heard of and I took it, because the paper was good.”',
          },
          {
            key: 'check_the_crate',
            label: 'Ask to see the crate itself',
            outcome: 'The lid has been opened and nailed shut again with new nails. Tommy runs his thumb over them. “Not my nails,” he says.',
          },
        ],
      }],
    },
  }),
};
