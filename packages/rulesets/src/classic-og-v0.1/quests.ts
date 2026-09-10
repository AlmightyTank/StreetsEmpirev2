/**
 * One favour per trader. BALANCE_APPROXIMATION.
 *
 * These are the spine of reputation, and each is priced in a different
 * resource on purpose - discipline, product, capital, production - so a rich
 * player cannot buy through all four the way they could buy through one.
 *
 *   the clerk   ten clean shifts        upkeep you have to keep up
 *   Tommy       a hundred rocks         product, and a crew to have earned it
 *   Charlie     a Low-Rider             capital, and eight hours of his time
 *   Pip         five hundred rocks      turns and thugs, because cooking is
 *                                       the only sane way to get them
 *
 * Pip's is self-enforcing and worth the note: rock costs $10 at his counter
 * and he pays $3, so supplying him from stock you bought loses $7 a rock. Cook
 * it at $5 and the same delivery costs $2. Nothing has to check where the rocks
 * came from - the prices already answer it.
 */

import type { QuestKey, QuestRule } from '../types.js';

export const quests = {
  CORNER: {
    title: 'Keep them covered',
    description:
      'The clerk has seen what happens to a house that runs out. Work ten trips ' +
      'straight without sending anyone out short on condoms.',
    goal: { kind: 'CLEAN_SHIFTS', trips: 10 },
  },

  TOMMY: {
    title: 'A favour for Tommy',
    description:
      'Prove you can run a crew, then deliver rock to Tommy’s contacts.',
    goal: { kind: 'DELIVER_CRACK', crack: 100, thugs: 10 },
  },

  CHARLIE: {
    title: 'Back on the lot',
    description:
      'Charlie is a car short for a buyer who will not wait. Put one of yours ' +
      'back on his lot and he will remember it.',
    goal: { kind: 'HAND_OVER_LOW_RIDER', lowRiders: 1 },
  },

  PIP: {
    title: 'Supply the corners',
    description:
      'Pip’s corners are dry. Sell him five hundred rocks and he will start ' +
      'treating you like supply rather than a customer.',
    goal: { kind: 'SUPPLY_ROCKS', crackSold: 500 },
  },
} as const satisfies { [K in QuestKey]: QuestRule };
