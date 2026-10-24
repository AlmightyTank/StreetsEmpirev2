import { missingLineActFour } from '../classic-og-v2.6-e/missing-line-act-4.js';
import type { QuestDefinition, QuestDefinitionCatalog, QuestStoryVariant } from '../types.js';

/**
 * 2.6.0-F. The Missing Line remembers. Act IV chapters now speak to what the crew chose before:
 * the stance taken in Your Name in the Margin, what was done at the depot, whether Mr. Alvarez's
 * name went into the record, and how Mama settled her debt. Only story lines change; objectives,
 * rewards and the chain are as in 2.6.0-E, and every line keeps its default for players without
 * that history.
 */

function remember(base: QuestDefinition, variants: readonly QuestStoryVariant[]): QuestDefinition {
  return { ...base, story: { ...base.story!, variants } };
}

const four = missingLineActFour;
const GO_NORTH = '“Send a car out past the split and bring it back,” Wheels says. “I want to know what the road keeps for itself.”';
const REACH_ELI = '“First we reach him,” Wheels says. “Then we get him out in something nobody has ever seen us in.”';

export const missingLineEchoes: QuestDefinitionCatalog = {
  ML_M16_MILE_MARKER_NINE: remember(four.ML_M16_MILE_MARKER_NINE!, [
    {
      when: { kind: 'BRANCH_CHOSEN', questKey: 'ML_M15_NAME_IN_THE_MARGIN', branchKey: 'DISPUTE_THE_ENTRY' },
      inProgress: `Ledger filed the crew’s dispute on a Monday. By Wednesday a car nobody knew was parked across from Wheels’ garage, engine off, nobody inside.\n\n“They know we’re reading their books now,” Wheels says. “Fine. Let’s go read another one.” ${GO_NORTH}`,
    },
    {
      when: { kind: 'BRANCH_CHOSEN', questKey: 'ML_M15_NAME_IN_THE_MARGIN', branchKey: 'LEAVE_IT_FOR_NOW' },
      inProgress: `Vic has spent a week making the crew look like it has noticed nothing. Wheels says it is the best acting he has ever seen Vic do, and the most tired he has ever seen him.\n\n“While they think we’re asleep,” Wheels says, “we drive.” ${GO_NORTH}`,
    },
    {
      when: { kind: 'BRANCH_CHOSEN', questKey: 'ML_M15_NAME_IN_THE_MARGIN', branchKey: 'KEEP_A_COPY' },
      inProgress: `Mama keeps the copied page in her coat with the two receipts. Wheels keeps a road atlas older than both of you, with the altered turn marked in pencil.\n\n“Paper in Mama’s pocket, roads in mine,” he says. ${GO_NORTH}`,
    },
  ]),

  ML_M17_PASSENGER_NINE: remember(four.ML_M17_PASSENGER_NINE!, [
    {
      when: { kind: 'SCENE_RESPONSE', questKey: 'ML_M16_MILE_MARKER_NINE', sceneKey: 'depot_found', responseKey: 'photograph_the_list' },
      inProgress: `Wheels has the photograph of the passenger list pinned above his workbench, the ninth name circled twice. The man answering to it works the depot’s loading bay under a borrowed one.\n\n${REACH_ELI}`,
    },
    {
      when: { kind: 'SCENE_RESPONSE', questKey: 'ML_M16_MILE_MARKER_NINE', sceneKey: 'depot_found', responseKey: 'watch_the_drivers' },
      inProgress: `You watched the drivers sign for every book. One of the signatures had a small hooked mark at the end of it. Eli works the depot’s loading bay under a borrowed name, and he still signs like Eli.\n\n${REACH_ELI}`,
    },
  ]),

  ML_M18_WHAT_MAMA_BOUGHT: remember(four.ML_M18_WHAT_MAMA_BOUGHT!, [
    {
      when: { kind: 'SCENE_RESPONSE', questKey: 'ML_M14_WOMAN_AT_CLOSING', sceneKey: 'second_receipt_returned', responseKey: 'include_his_name' },
      intro: 'Mama has made tea and not drunk it. Mr. Alvarez’s name is in the record now, because his wife wanted it there. Mama says it made her think about what her own name was doing in somebody else’s.',
    },
    {
      when: { kind: 'SCENE_RESPONSE', questKey: 'ML_M14_WOMAN_AT_CLOSING', sceneKey: 'second_receipt_returned', responseKey: 'leave_him_out' },
      intro: 'Mama has made tea and not drunk it. She kept Mr. Alvarez’s name out of the record, the way his wife asked. She says it is the first time in years she has protected a name instead of spending one.',
    },
    {
      when: { kind: 'SCENE_RESPONSE', questKey: 'ML_M18_WHAT_MAMA_BOUGHT', sceneKey: 'mama_debt_reckoned', responseKey: 'repay_quietly' },
      completed: 'Mama settles it the quiet way: one envelope a week, through a lawyer she does not like, to an account with no name on it. “Never again,” she says, every Friday, like a prayer.',
    },
    {
      when: { kind: 'SCENE_RESPONSE', questKey: 'ML_M18_WHAT_MAMA_BOUGHT', sceneKey: 'mama_debt_reckoned', responseKey: 'tell_the_families' },
      completed: 'On Sunday the families from Delancey come to Mama’s door. Some of them are angry. All of them bring food. By evening the kitchen is too full to close the door, and nobody tries.',
    },
  ]),
};
