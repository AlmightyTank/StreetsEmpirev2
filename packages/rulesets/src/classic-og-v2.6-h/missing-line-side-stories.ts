import { missingLineActFive } from '../classic-og-v2.6-g/missing-line-act-5.js';
import type {
  ContactKey,
  QuestDefinition,
  QuestDefinitionCatalog,
  QuestObjectiveDefinition,
  QuestPrerequisiteDefinition,
  QuestStoryDefinition,
  QuestStorySceneDefinition,
  QuestStoryVariant,
} from '../types.js';

/**
 * 2.6.0-H. The Missing Line side stories: five three-quest arcs that follow the people the main
 * story leaves behind. Each opens from a main chapter and never gates the main chain or its
 * ending. Each arc, once finished, changes one line of the finale, and every arc echoes in a
 * different line so they combine.
 *
 * It re-issues three finale chapters to add those echoes, so it is only valid merged into the
 * 2.6.0-G catalog; the ruleset validates the whole catalog.
 */

function sceneObjective(questKey: string, sceneKey: string, description: string): QuestObjectiveDefinition {
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

function count(id: string, description: string, eventTypes: string[], where?: Record<string, string>): QuestObjectiveDefinition {
  return { id, kind: 'EVENT_COUNT', description, target: 1, params: { eventTypes, ...(where ? { where } : {}) } };
}

const after = (...questKeys: string[]): QuestPrerequisiteDefinition[] =>
  questKeys.map((questKey) => ({ kind: 'QUEST_COMPLETED', params: { questKey } }));

interface SideStory {
  key: string;
  title: string;
  description: string;
  contactKey: ContactKey;
  opensAfter: string[];
  work: QuestObjectiveDefinition[];
  bonus?: QuestObjectiveDefinition[];
  cash: number;
  chapter: string;
  story: Omit<QuestStoryDefinition, 'chapter' | 'scenes' | 'variants'>;
  scene: Omit<QuestStorySceneDefinition, 'after'> & { description: string };
  followUpKeys?: string[];
}

/** A side quest: the work (if any), then its scene once the work is done. */
function side(definition: SideStory): QuestDefinition {
  const workIds = definition.work.map((objective) => objective.id);
  const { description: sceneDescription, ...scene } = definition.scene;
  return {
    key: definition.key,
    title: definition.title,
    description: definition.description,
    contactKey: definition.contactKey,
    type: 'SIDE',
    category: 'CAMPAIGN',
    difficulty: 'STREET_JOB',
    prerequisites: after(...definition.opensAfter),
    objectives: [...definition.work, sceneObjective(definition.key, scene.key, sceneDescription)],
    bonusObjectives: definition.bonus ?? [],
    rewards: [
      { kind: 'CASH', amount: definition.cash },
      { kind: 'CONTACT_REP', key: definition.contactKey, amount: 3 },
    ],
    story: {
      chapter: definition.chapter,
      ...definition.story,
      scenes: [{ ...scene, ...(workIds.length ? { after: workIds } : {}) }],
    },
    followUpKeys: definition.followUpKeys ?? [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
  };
}

const SHOP = 'Side story · Mrs. Alvarez’s Shop';
const COUNT = 'Side story · Pip’s Honest Count';
const RACK = 'Side story · The Apprentice';
const ROADS = 'Side story · Wheels’ Drivers';
const PAGES = 'Side story · The Signed Pages';

export const missingLineSideQuests: QuestDefinitionCatalog = {
  // Mrs. Alvarez's shop (Slice M) --------------------------------------------------------------
  ML_S01_KEY_UNDER_MAT: side({
    key: 'ML_S01_KEY_UNDER_MAT', title: 'A Key Under the Mat', contactKey: 'MAMA_KING', chapter: SHOP,
    description: 'Eli left a key with Mrs. Alvarez before he disappeared. Not with a rival. With her.',
    opensAfter: ['ML_M04_ROLL_CALL'], cash: 250_000, followUpKeys: ['ML_S02_RENT_ENVELOPE'],
    work: [count('back_to_the_shop', 'Go back to the shop: scout Low Rent.', ['SCOUT'], { districtKey: 'LOW_RENT' })],
    story: {
      intro: 'Mama heard about the key from Mrs. Alvarez’s neighbor, who heard it from the woman who sweeps the stoop.',
      inProgress: 'Mrs. Alvarez has a key Eli gave her months ago. She has not told anyone because nobody asked.\n\n“Go see her,” Mama says. “Ask nicely. She remembers who asks nicely.”',
      ready: 'The key is on a string around your wrist now. Mrs. Alvarez tied it there herself.',
      completed: 'The locker the key opened held a coat, a bus ticket and Eli’s first copied receipt, folded small. Mama keeps the receipt. Mrs. Alvarez keeps the coat, in case he comes back for it.',
      actionHint: 'Scout Low Rent to go back to the shop, then hear about the key in the scene below.',
    },
    scene: {
      key: 'eli_key_examined', title: 'The key', description: 'Hear about Eli’s key.',
      prose: 'Eli left the key with Mrs. Alvarez, not with a rival or a friend. He said he would come back for the coat he had left on her chair. He never did.\n\nShe kept the key because a promise to come back is still a promise, even when it is late.',
      responses: [
        { key: 'open_the_locker', label: 'Ask if you can open the locker it fits', outcome: 'She hesitates, then nods. “Bring back the coat,” she says. “Whatever else is in there, you can keep.”' },
        { key: 'let_her_keep_it', label: 'Tell her to keep it for Eli', outcome: '“He’ll want it from my hand,” she says, and closes her fingers around it. Then, after a moment, she gives it to you anyway. “Bring it back,” she says. “With him.”' },
      ],
    },
  }),
  ML_S02_RENT_ENVELOPE: side({
    key: 'ML_S02_RENT_ENVELOPE', title: 'The Rent Envelope', contactKey: 'MAMA_KING', chapter: SHOP,
    description: 'The shop’s rent kept getting paid after its owner disappeared, in small envelopes. Mama remembers carrying one.',
    opensAfter: ['ML_S01_KEY_UNDER_MAT'], cash: 250_000, work: [],
    story: {
      intro: 'Mama is quiet in the way she gets when she has remembered something she would rather not have.',
      inProgress: 'After Mr. Alvarez left, the shop’s rent was paid in small envelopes, every month, by somebody. Mama delivered one of them herself, years ago, as a favor to a friend.\n\n“I never opened it,” she says. “I never asked whose money it was. I’m asking now.”',
      ready: 'Mama sets an empty envelope on Mrs. Alvarez’s counter and leaves it there, like an apology.',
      completed: 'Mrs. Alvarez decides for herself what goes in the record about the rent. Mama does not argue with any of it.',
      actionHint: 'Compare the envelope with the shop receipt in the scene below.',
    },
    scene: {
      key: 'rent_envelope_compared', title: 'Small envelopes', description: 'Compare the envelope with the receipt.',
      prose: 'Side by side, the rent envelope and the shop receipt carry the same narrow handwriting: the hand that rewrote Pip’s route. The rent was never charity. It was interest, paid to keep the shop from being sold before the corridor was ready.\n\nMrs. Alvarez reads them twice. Then she asks whether her name belongs in the record.',
      responses: [
        { key: 'her_name_in', label: 'Tell her it’s her choice, and her name can go in', outcome: '“Then put it in,” she says. “Twenty years behind that counter. I want it written down that I was here.”' },
        { key: 'her_name_out', label: 'Offer to keep her name out of it', outcome: '“Thank you,” she says. “I’ve been somebody’s line item long enough.”' },
      ],
    },
  }),
  ML_S03_WARM_ROOM: side({
    key: 'ML_S03_WARM_ROOM', title: 'A Warm Room', contactKey: 'MAMA_KING', chapter: SHOP,
    description: 'Mama and Eli go back to the families the fire on Delancey left without a place to sleep.',
    opensAfter: ['ML_M18_WHAT_MAMA_BOUGHT'], cash: 500_000,
    work: [sum('relief_medicine', 'Bring the families 5 medicine from the Corner.', 5, ['STORE_BUY'], { storeKey: 'CORNER', itemKey: 'MEDICINE' })],
    story: {
      intro: 'Delancey has been rebuilt twice since the fire. The families on it remember both times.',
      inProgress: 'Mama wants to go back to the families the fire left without a home, and she wants Eli with her. She will not go empty-handed.\n\n“Medicine,” she says. “Somebody on that block is always sick. That hasn’t changed.”',
      ready: 'Eli carries the medicine. Mama carries nothing, so her hands are free when people want to shake them, or not.',
      completed: 'Mama makes the repayment public on the block where it started. It costs her pride. She says pride is the cheapest thing she owns.',
      actionHint: 'Buy 5 medicine at the Corner for the families, then face them in the scene below.',
    },
    scene: {
      key: 'relief_repaid_or_explained', title: 'A warm room', description: 'Face the families with Mama.',
      prose: 'The Clearinghouse used the relief money as proof that Mama had taken a much larger loan. The families have been paying interest on her kindness for years without knowing it.\n\nThey are gathered in the community room, the warm one, the one Mama paid to heat the winter after the fire.',
      responses: [
        { key: 'deliver_the_repayment', label: 'Hand over the repayment yourself', outcome: 'The oldest woman on the block takes the envelope, counts it, and hands it back to Mama. “Pay it to the right people,” she says. “Not to us. We were never the ones who were owed.”' },
        { key: 'let_mama_explain', label: 'Let Mama tell it herself', outcome: 'Mama talks for ten minutes without stopping. Nobody interrupts. When she finishes, somebody puts a plate of food in front of her, and that is the answer.' },
      ],
    },
  }),

  // Pip's honest count (Slice K) ----------------------------------------------------------------
  ML_S04_WEIGHT_ON_THE_SCALE: side({
    key: 'ML_S04_WEIGHT_ON_THE_SCALE', title: 'The Weight on the Scale', contactKey: 'PIP', chapter: COUNT,
    description: 'Pip goes back to his supplier with a fresh delivery to weigh, and finds two scales.',
    opensAfter: ['ML_M06_PIPS_COUNT'], cash: 300_000, followUpKeys: ['ML_S05_BOX_WITH_NO_LABEL'],
    work: [sum('fresh_delivery', 'Buy 10 units from Pip to weigh at the supplier.', 10, ['STORE_BUY'], { storeKey: 'PIP' })],
    story: {
      intro: 'Pip has not been to his supplier’s in person in six years. He has called. It is not the same.',
      inProgress: 'Pip wants to weigh a fresh delivery at the supplier’s own counter, in front of him.\n\n“Buy a load from me,” he says. “We’ll carry it in and see whose scale flinches.”',
      ready: 'The supplier puts both scales on the counter himself. He does not try to explain them.',
      completed: '“He wasn’t stealing,” Pip says outside. “He was hiding. There’s a difference, and I’m going to spend a long time learning it.”',
      actionHint: 'Buy 10 units from Pip, then weigh them at the supplier’s in the scene below.',
    },
    scene: {
      key: 'two_scales', title: 'Two scales', description: 'Weigh the delivery at the supplier’s.',
      prose: 'The supplier has two scales: one on the counter for customers, one in the back for the books. Your delivery weighs true on the first and short on the second.\n\nHe did not steal Pip’s load. He hid a shortage, because his own family was being charged for it, by people he had never met.',
      responses: [
        { key: 'ask_about_family', label: 'Ask who was charging his family', outcome: '“A house I couldn’t find on any map,” he says. “Letters, never faces. Polite letters.”' },
        { key: 'ask_about_the_back_scale', label: 'Ask how long the back scale has lied', outcome: '“Four years,” he says. “Since the first polite letter. I calibrated it myself. It’s the most careful work I’ve ever done.”' },
      ],
    },
  }),
  ML_S05_BOX_WITH_NO_LABEL: side({
    key: 'ML_S05_BOX_WITH_NO_LABEL', title: 'A Box with No Label', contactKey: 'PIP', chapter: COUNT,
    description: 'The supplier kept one crate out of the count. Pip wants a fresh batch to set beside it.',
    opensAfter: ['ML_S04_WEIGHT_ON_THE_SCALE'], cash: 350_000, followUpKeys: ['ML_S06_LAST_HONEST_COUNT'],
    work: [count('fresh_batch', 'Cook one fresh batch to set beside the crate.', ['PRODUCE_CRACK'])],
    bonus: [count('lane_shipment', 'Bonus: receive one supply-lane shipment, the way the crate once arrived.', ['SUPPLY_LANE_ARRIVED'])],
    story: {
      intro: 'The supplier has one crate he never counted. He says he could not bring himself to.',
      inProgress: 'The uncounted crate sits in the supplier’s back room with no label on it. Pip wants a batch of his own beside it before anyone pries it open.\n\n“So we know what clean looks like,” he says. “Cook me something.”',
      ready: 'The crate is open. The fresh batch sits beside it, and next to it the old stock looks tired.',
      completed: 'Pip keeps the burned lid. He says he wants to remember what his own handwriting looks like when it is being used against somebody.',
      actionHint: 'Cook one batch on Produce, then open the crate in the scene below. A supply-lane arrival is a bonus, not a requirement.',
    },
    scene: {
      key: 'box_code_examined', title: 'A box with no label', description: 'Open the crate with Pip.',
      prose: 'Inside is ordinary stock, nothing special, except the debt code burned into the wood of the lid. Pip knows the code. He knows the handwriting on the old order it came from.\n\nIt is his. He passed the code along himself, years ago, without asking what it meant.',
      responses: [
        { key: 'read_the_code', label: 'Ask Pip what the code says', outcome: '“It says this crate pays somebody else’s debt,” Pip says. “It says it in my writing.”' },
        { key: 'burn_the_lid', label: 'Suggest he burn the lid', outcome: 'Pip almost does. Then he wraps the lid in newspaper instead. “Not yet,” he says. “Somebody should see it first.”' },
      ],
    },
  }),
  ML_S06_LAST_HONEST_COUNT: side({
    key: 'ML_S06_LAST_HONEST_COUNT', title: 'The Last Honest Count', contactKey: 'PIP', chapter: COUNT,
    description: 'Pip wants to correct the supplier’s ledger in front of the people it harmed.',
    opensAfter: ['ML_S05_BOX_WITH_NO_LABEL'], cash: 400_000,
    work: [sum('pip_sale', 'Sell Pip 15 units for a clean count.', 15, ['STORE_SELL'], { storeKey: 'PIP' })],
    story: {
      intro: 'Pip has invited everyone the supplier’s back scale cheated. Most of them came.',
      inProgress: 'Pip will correct the supplier’s books in public, line by line, in front of the people who paid for the lies. He wants one clean count of his own to start from.\n\n“Sell to me,” he says. “I want the first line on the new page to be true.”',
      ready: 'The corrected ledger is open on the supplier’s counter, one line long so far, and true.',
      completed: 'Nobody forgives Pip that night. They agree to speak to you, though, because for once the books match the truth, and Pip says that is more than he deserves.',
      actionHint: 'Sell Pip 15 units, then show the corrected count in the scene below.',
    },
    scene: {
      key: 'honest_count_shared', title: 'The last honest count', description: 'Show the corrected count.',
      prose: 'Pip reads the corrected ledger aloud, every line, including the ones with his own signature. The people in the room listen without interrupting. Nobody forgives him on the spot.\n\nAt the end, the supplier stands next to him. That is not forgiveness either, but it is close to it.',
      responses: [
        { key: 'show_the_supplier', label: 'Hand the corrected count to the supplier first', outcome: 'The supplier signs under Pip’s name without reading it. “I trust it,” he says. “It’s the first one I’ve trusted in four years.”' },
        { key: 'show_the_room', label: 'Pass it around the room', outcome: 'It takes an hour to go around. When it comes back, three people have written their own corrections in the margin. Pip leaves them in.' },
      ],
    },
  }),

  // The apprentice (Slice L) --------------------------------------------------------------------
  ML_S07_OTHER_SERIAL: side({
    key: 'ML_S07_OTHER_SERIAL', title: 'The Other Serial', contactKey: 'TOMMY', chapter: RACK,
    description: 'A second number from the same lot leads Tommy to an apprentice he fired years ago.',
    opensAfter: ['ML_M08_TOMMYS_SERIAL'], cash: 300_000, followUpKeys: ['ML_S08_LAST_SHIFT'],
    work: [sum('pistols', 'Buy 3 pistols from Tommy, from the same kind of lot.', 3, ['STORE_BUY'], { storeKey: 'TOMMY', itemKey: 'PISTOL' })],
    story: {
      intro: 'Tommy fired exactly one person in thirty years. He has never said why.',
      inProgress: 'The same lot that held the crate had a second number in it, and Tommy’s old book says it was sold by his youngest apprentice, the one he fired.\n\n“Buy from that lot,” Tommy says. “I want the receipt in my hand when I knock on that door.”',
      ready: 'Tommy holds the receipt for a long time before he knocks.',
      completed: '“I blamed the youngest person in the shop,” Tommy says. “It was easier than blaming my partner. It was always going to be easier.”',
      actionHint: 'Buy 3 pistols from Tommy, then compare the receipts in the scene below.',
    },
    scene: {
      key: 'other_serial', title: 'The other serial', description: 'Compare the receipts with Tommy.',
      prose: 'The apprentice did not sell the crate. The second receipt is in the same hand as the first, and it is not the apprentice’s. It is Tommy’s old partner’s, who sold the same lot twice and pointed at the youngest person on the rack when the numbers did not add up.\n\nTommy believed him. It was easier.',
      responses: [
        { key: 'ask_about_the_partner', label: 'Ask where the partner is now', outcome: '“Retired,” Tommy says. “Comfortable. I send him a card at Christmas.” He stops. “I sent him a card at Christmas.”' },
        { key: 'ask_about_the_apprentice', label: 'Ask what happened to the apprentice', outcome: '“Nobody would hire a kid I’d fired,” Tommy says. “That was the point of firing them. I made sure of it.”' },
      ],
    },
  }),
  ML_S08_LAST_SHIFT: side({
    key: 'ML_S08_LAST_SHIFT', title: 'Last Shift at the Armory', contactKey: 'TOMMY', chapter: RACK,
    description: 'The apprentice still has the original sale book. They want Tommy to explain himself first.',
    opensAfter: ['ML_S07_OTHER_SERIAL'], cash: 350_000, followUpKeys: ['ML_S09_RACK_KEPT_OPEN'], work: [],
    story: {
      intro: 'The apprentice kept the sale book for eight years, in case anyone ever asked.',
      inProgress: 'The apprentice has the original sale book and will hand it over, but not before Tommy answers one question in front of a witness: why he stopped asking questions.\n\n“You’re the witness,” Tommy says. “Don’t help me.”',
      ready: 'The sale book is on the table between them. Neither of them has touched it.',
      completed: 'The sale book gives the staged-raid lead a second witness. It gives Tommy something harder to carry.',
      actionHint: 'Hear Tommy answer the apprentice in the scene below.',
    },
    scene: {
      key: 'apprentice_heard', title: 'Last shift', description: 'Hear Tommy answer the apprentice.',
      prose: 'The apprentice asks Tommy why he stopped asking questions. Tommy takes a long time to answer.\n\n“I needed the shop open more than I needed to be right,” he says finally. It is not an excuse. He does not offer it as one.',
      responses: [
        { key: 'stay_silent', label: 'Say nothing and let it sit', outcome: 'The apprentice slides the sale book across the table. “That’s the first true thing you’ve told me,” they say. “It’s enough to start.”' },
        { key: 'speak_for_tommy', label: 'Tell the apprentice what Tommy found', outcome: 'The apprentice listens, then turns back to Tommy. “I wanted to hear it from you,” they say. “But fine. I’ll take it from your friend.”' },
      ],
    },
  }),
  ML_S09_RACK_KEPT_OPEN: side({
    key: 'ML_S09_RACK_KEPT_OPEN', title: 'A Rack Kept Open', contactKey: 'TOMMY', chapter: RACK,
    description: 'Tommy offers the apprentice their job back. They have terms of their own.',
    opensAfter: ['ML_S08_LAST_SHIFT'], cash: 400_000,
    work: [count('first_sale', 'Buy anything from Tommy on the apprentice’s first day back.', ['STORE_BUY'], { storeKey: 'TOMMY' })],
    story: {
      intro: 'Tommy has cleared a space behind the counter. He says it is for inventory.',
      inProgress: 'The apprentice is back at the rack, on their own terms, and their first day behind the counter needs a first customer.\n\n“Buy something,” Tommy says. “Anything. Let them write the receipt.”',
      ready: 'The apprentice writes your receipt slowly, carefully, and signs it with their own name.',
      completed: 'The weapon trail is closed. Tommy has learned to trust a record he did not write himself, which he says is the hardest thing he has ever learned at his age.',
      actionHint: 'Buy anything from Tommy, then hear the apprentice’s terms in the scene below.',
    },
    scene: {
      key: 'apprentice_terms', title: 'A rack kept open', description: 'Hear the apprentice’s terms.',
      prose: 'Tommy offered the apprentice their old job. They refused the old terms. They will come back only if they run the count themselves: every lot, every number, every receipt, with nobody looking over their shoulder.\n\nTommy agreed before they finished the sentence.',
      responses: [
        { key: 'shake_on_it', label: 'Witness the handshake', outcome: 'It is a short handshake. Tommy holds on a second too long, and the apprentice lets him.' },
        { key: 'ask_for_the_first_count', label: 'Ask the apprentice to count the rack now', outcome: 'They count it twice. It comes out right both times. Tommy pretends not to watch.' },
      ],
    },
  }),

  // Wheels' drivers (Slice N) -------------------------------------------------------------------
  ML_S10_MILE_MARKER_ZERO: side({
    key: 'ML_S10_MILE_MARKER_ZERO', title: 'Mile Marker Zero', contactKey: 'WHEELS', chapter: ROADS,
    description: 'Wheels goes back to the first route he ever taught Eli, and the retired driver who still remembers it.',
    opensAfter: ['ML_M07_NORTH_ROAD'], cash: 300_000,
    work: [count('run_home', 'Bring one intercity run home along Eli’s first route.', ['RUN_RETURNED'])],
    story: {
      intro: 'Wheels taught Eli to drive on a road that is half potholes now. He has not driven it since.',
      inProgress: 'A retired driver who ran Eli’s first route with him still lives at the far end of it.\n\n“Run a car down there and back,” Wheels says. “He won’t talk to a phone. He’ll talk to a car he can hear coming.”',
      ready: 'The retired driver walks out to meet the car before it stops, the way old drivers do.',
      completed: '“Somebody used my voice,” Wheels says on the way home. “My call sign, my way of saying the road was watched. I’d like to know how long they practiced.”',
      actionHint: 'Launch any intercity run and bring it home, then hear the retired driver in the scene below.',
    },
    scene: {
      key: 'first_route', title: 'Mile marker zero', description: 'Hear the retired driver.',
      prose: 'The retired driver remembers the night the road was changed. The voice on the radio used Wheels’ own call sign, and sounded enough like him that nobody questioned it.\n\nHe cannot remember the face. He remembers the driver who was waiting at the end of the road to be paid.',
      responses: [
        { key: 'ask_about_the_voice', label: 'Ask how close the voice was', outcome: '“Close,” he says. “It said ‘clear’ the way Wheels says it. Like it’s two words.”' },
        { key: 'ask_about_the_payment', label: 'Ask about the driver waiting to be paid', outcome: '“Young,” he says. “Nervous. Kept checking an envelope like it might have emptied itself.”' },
      ],
    },
  }),
  ML_S11_PASSENGER_WINDOW: side({
    key: 'ML_S11_PASSENGER_WINDOW', title: 'The Passenger Window', contactKey: 'WHEELS', chapter: ROADS,
    description: 'Eli describes the other drivers on the depot run. Wheels will not let anyone call them all informants.',
    opensAfter: ['ML_M17_PASSENGER_NINE'], cash: 450_000, followUpKeys: ['ML_S12_EVERY_ROAD_HOME'], work: [],
    story: {
      intro: 'Eli has been drawing the depot from memory. He gets the trucks right and the faces wrong.',
      inProgress: 'Eli knows the other three drivers on the depot run. Wheels wants to hear about them before anyone decides what they are.\n\n“They drove,” Wheels says. “That’s all we know yet. That’s all I’m going to say until we know more.”',
      ready: 'Wheels writes three names on the back of a gas receipt and folds it into his wallet.',
      completed: 'Wheels will not let anyone label the drivers. He says labels are how the Clearinghouse turned frightened people into suspects in the first place.',
      actionHint: 'Hear Eli describe the drivers in the scene below.',
    },
    scene: {
      key: 'drivers_identified', title: 'The passenger window', description: 'Hear Eli describe the drivers.',
      prose: 'There were three other drivers on the depot run. One knew exactly what the books were. One only needed the money. One thought it was a normal delivery right up to the end.\n\nWheels listens to all three descriptions without writing anything down.',
      responses: [
        { key: 'name_the_one_who_knew', label: 'Say the one who knew is an informant', outcome: 'Wheels shakes his head. “He knew what he carried,” he says. “He didn’t know who he was carrying it for. Neither did Eli.”' },
        { key: 'label_nobody', label: 'Agree that nobody gets a label yet', outcome: '“Good,” Wheels says. “Then we can still help all three of them.”' },
      ],
    },
  }),
  ML_S12_EVERY_ROAD_HOME: side({
    key: 'ML_S12_EVERY_ROAD_HOME', title: 'Every Road Home', contactKey: 'WHEELS', chapter: ROADS,
    description: 'Wheels meets the three drivers at a neutral stop and offers them a way out of the work.',
    opensAfter: ['ML_S11_PASSENGER_WINDOW'], cash: 500_000,
    work: [count('run_home', 'Bring one intercity run home past the neutral stop.', ['RUN_RETURNED'])],
    story: {
      intro: 'Wheels picked the stop himself: a gas station with good coffee and no cameras.',
      inProgress: 'Wheels has sent word to the three depot drivers. He will meet them at a gas station halfway down the north road.\n\n“Run a car out with me,” he says. “I want them to see we came the long way to talk.”',
      ready: 'The coffee at the gas station is as good as Wheels promised. Only two of the three cups get drunk.',
      completed: 'You leave with the route ledger and without pretending every loose end can be tied. Wheels says that is the most honest delivery he has made all year.',
      actionHint: 'Launch any intercity run and bring it home, then meet the drivers in the scene below.',
    },
    scene: {
      key: 'driver_route_offered', title: 'Every road home', description: 'Meet the drivers with Wheels.',
      prose: 'Wheels offers the three drivers a route out of the work: honest runs, his garage, no questions about the depot. One accepts on the spot. One refuses. One leaves without answering.\n\nThe one who refused hands over the depot’s route ledger anyway, on the way out.',
      responses: [
        { key: 'follow_the_one_who_left', label: 'Let the one who left go', outcome: '“He’ll come back or he won’t,” Wheels says. “Either way it’s his road.”' },
        { key: 'thank_the_one_who_refused', label: 'Thank the one who refused', outcome: 'The driver shrugs. “I said no to the job,” he says. “I didn’t say no to you.”' },
      ],
    },
  }),

  // The signed pages (Slice O) ------------------------------------------------------------------
  ML_S13_COPY_FOR_LEDGER: side({
    key: 'ML_S13_COPY_FOR_LEDGER', title: 'A Copy for Ledger', contactKey: 'LEDGER', chapter: PAGES,
    description: 'Mr. Hales’s daughter has the missing carbon copy. She will not hand it to another fixer.',
    opensAfter: ['ML_M12_CLERK_ON_THE_STAIRS'], cash: 400_000, followUpKeys: ['ML_S15_PLAIN_ENGLISH'], work: [],
    story: {
      intro: 'Hales’s daughter is a nurse on nights. She meets people at the end of her shift or not at all.',
      inProgress: 'Hales’s daughter has the missing carbon copy, the one with her own name on it. She has met fixers before. She did not like them.\n\n“Let me explain what it can prove,” Ledger says. “And what it can’t. People trust you more when you tell them what you can’t do.”',
      ready: 'The carbon is in an evidence sleeve on Ledger’s desk, signed for, with the daughter’s initials beside Ledger’s.',
      completed: 'Ledger files the carbon under the daughter’s name, not her father’s. She says the daughter is the one who paid twice.',
      actionHint: 'Let Ledger explain the evidence in the scene below.',
    },
    scene: {
      key: 'carbon_copy_released', title: 'A copy for Ledger', description: 'Let Ledger explain the evidence.',
      prose: 'Ledger tells Hales’s daughter exactly what the carbon can prove: that her debt was moved without her consent. And what it cannot: who moved it, or why, or whether anyone will ever pay her back.\n\nThe daughter listens all the way to the end. Then she asks one question.',
      responses: [
        { key: 'will_it_help', label: 'Let her ask whether it will help anyone', outcome: '“It will help the next person,” Ledger says. The daughter nods. “That’s enough,” she says, and hands it over.' },
        { key: 'will_it_hurt', label: 'Let her ask whether it will hurt her father', outcome: '“He kept it to protect you,” Ledger says. “Giving it to me finishes what he started.” The daughter hands it over without another word.' },
      ],
    },
  }),
  ML_S14_HOLDING_COMPANY: side({
    key: 'ML_S14_HOLDING_COMPANY', title: 'The Holding Company', contactKey: 'BLOCKS', chapter: PAGES,
    description: 'Blocks follows the corridor’s ownership through three shell businesses.',
    opensAfter: ['ML_M20_MAP_IN_THE_MARGINS'], cash: 500_000, followUpKeys: ['ML_S15_PLAIN_ENGLISH'],
    work: [{ id: 'visit_the_shells', kind: 'UNIQUE_VALUES', description: 'Visit the shells’ addresses: scout 2 different districts.', target: 2, params: { eventTypes: ['SCOUT'], field: 'districtKey' } }],
    story: {
      intro: 'Blocks does not trust anything he cannot stand in front of. He has never stood in front of a company.',
      inProgress: 'The corridor’s properties are owned by three shell businesses. Their addresses are real buildings in two different districts.\n\n“Go stand in front of them,” Blocks says. “A company with no door is a company with something behind it.”',
      ready: 'Blocks pins the shells’ addresses to his turf map with three tacks and connects them with string.',
      completed: '“The papers are legal,” Blocks says. “All of them. It’s what they did to get the signatures that isn’t.”',
      actionHint: 'Scout 2 different districts to visit the shells, then match them in the scene below.',
    },
    scene: {
      key: 'holding_company_matched', title: 'The holding company', description: 'Match the shells to the corridor.',
      prose: 'Each shell business owns a slice of the corridor through a lawful contract. The pressure used to get each signature is in none of them.\n\nThe last parcel traces back to one man, the local rival who sold a signature to keep his crew alive.',
      responses: [
        { key: 'trace_the_rival', label: 'Follow the rival’s parcel', outcome: 'Blocks taps the parcel twice. “Him again,” he says. “He’s either the last piece of her corridor or the first piece of ours.”' },
        { key: 'trace_the_money', label: 'Follow the money between the shells', outcome: 'It goes in a circle: three shells paying each other rent. “She built a merry-go-round,” Blocks says. “Everybody gets dizzy, nobody gets off.”' },
      ],
    },
  }),
  ML_S15_PLAIN_ENGLISH: side({
    key: 'ML_S15_PLAIN_ENGLISH', title: 'Terms in Plain English', contactKey: 'VIC', chapter: PAGES,
    description: 'Vic, Ledger and Blocks sit down with the rival and read every page aloud.',
    opensAfter: ['ML_S13_COPY_FOR_LEDGER', 'ML_S14_HOLDING_COMPANY'], cash: 600_000, work: [],
    story: {
      intro: 'Vic picked the room: neutral, quiet, and with a table long enough to lay every page flat.',
      inProgress: 'Vic, Ledger and Blocks have every page: the carbon, the shell papers, the rival’s two signatures. The rival has agreed to listen while they are read aloud.\n\n“Plain English,” Vic says. “No lawyers, no favors. Just what it says.”',
      ready: 'The rival signs his statement with the same pen as both his old papers. He says that is the point.',
      completed: 'The property and legal-record threads are closed before the final settlement. Vic says it is the first contract he has ever helped write that nobody will regret.',
      actionHint: 'Hear the rival’s statement in the scene below.',
    },
    scene: {
      key: 'statement_attached', title: 'Terms in plain English', description: 'Hear the rival’s statement.',
      prose: 'Every page is read aloud: the carbon, the shells, both signatures. The rival listens to all of it.\n\nAt the end he gives a statement. It is truthful. It is not an apology, and nobody asks him to make it one.',
      responses: [
        { key: 'attach_it', label: 'Attach his statement to the final record', outcome: 'Ledger staples it to the front of the file. “First page,” she says. “Where people will read it before they decide anything.”' },
        { key: 'keep_it_separate', label: 'Keep his statement with the crew', outcome: 'Vic folds it into his coat. “Some things should be in the record,” he says. “Some things should be in a pocket, in case the record burns.”' },
      ],
    },
  }),
};

// The finale remembers each finished arc, each in a line of its own so they combine.
const five = missingLineActFive;

function echo(base: QuestDefinition, added: readonly QuestStoryVariant[]): QuestDefinition {
  return { ...base, story: { ...base.story!, variants: [...(base.story!.variants ?? []), ...added] } };
}

export const missingLineSideEchoes: QuestDefinitionCatalog = {
  ML_M22_NO_ONE_OWES_ALONE: echo(five.ML_M22_NO_ONE_OWES_ALONE!, [{
    when: { kind: 'QUEST_COMPLETED', questKey: 'ML_S06_LAST_HONEST_COUNT' },
    inProgress: 'Pip, Wheels, Tommy, Vic, Blocks and Ledger sit around Mama’s table with their pieces of the story in front of them. Pip’s supplier came too, and sits next to him, which nobody expected, least of all Pip.\n\n“Then I will,” Mama says, when nobody wants to go first. “I took money after a fire. Now somebody else talk.”',
  }]),
  ML_M24_EVERYBODY_AT_THE_TABLE: echo(five.ML_M24_EVERYBODY_AT_THE_TABLE!, [
    {
      when: { kind: 'QUEST_COMPLETED', questKey: 'ML_S09_RACK_KEPT_OPEN' },
      ready: 'The beer is gone and the plan is on one sheet of paper. Tommy’s apprentice counts the empty bottles twice before anyone leaves, and gets the same number both times.',
    },
    {
      when: { kind: 'QUEST_COMPLETED', questKey: 'ML_S12_EVERY_ROAD_HOME' },
      completed: 'Mama folds the plan into the coat pocket with the two receipts and the torn page. Outside, the driver who took Wheels’ offer is waiting to drive everyone home. “Tomorrow,” Mama says. “At the shop. Where it started.”',
    },
  ]),
  ML_M25_MISSING_LINE: echo(five.ML_M25_MISSING_LINE!, [
    {
      when: { kind: 'QUEST_COMPLETED', questKey: 'ML_S15_PLAIN_ENGLISH' },
      intro: 'It is raining again. Mama has left the porch light on this time, and Ledger has brought a folder with the rival’s statement stapled to the front.',
    },
    {
      when: { kind: 'QUEST_COMPLETED', questKey: 'ML_S03_WARM_ROOM' },
      inProgress: 'The corner shop has every light on. Mrs. Alvarez is behind the counter. Eli is by the door. The families from Delancey filled the back of the shop an hour early and brought food. The original book is on the counter, closed.\n\n“Your hand,” Mama says. “Your choice. We’ll live with it.”',
    },
  ]),
};
