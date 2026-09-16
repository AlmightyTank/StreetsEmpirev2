import { classicOgV03A } from '../classic-og-v0.3-a/index.js';
import type { Ruleset } from '../types.js';

/** 0.3.0-B keeps 0.3.0-A combat and economy. It adds admin tools and reworks two favours. */
export const classicOgV03B = {
  ...classicOgV03A,
  meta: { id: 'classic-og-v0.3-b', version: '0.3.0-B', name: 'Classic OG - Admin' },
  /**
   * BALANCE_APPROXIMATION. The clerk and Tommy stop asking for a clean
   * streak and a hundred rocks and start asking you to be a customer.
   *
   * Only purchases made this round count, and the goods stay yours. None of
   * the clerk's stock sells back, so the order has to be supply you mean to
   * use. Tommy wants his guns bought and put to work: any raid form counts,
   * won or lost, while drive-bys stay Charlie's.
   */
  quests: {
    ...classicOgV03A.quests,
    CORNER: {
      title: 'Stock the house',
      description:
        'The clerk has a delivery nobody came for. Buy 2,000 condoms, 15 medicine and ' +
        '2,000 beers over the counter this round and you are a regular.',
      goal: { kind: 'BUY_SUPPLIES', condoms: 2_000, medicine: 15, beer: 2_000 },
    },
    TOMMY: {
      title: 'Put them to use',
      description:
        'Tommy does not sell to collectors. Buy 5 pistols from him and take a crew on ' +
        'a raid, won or lost, and he will start taking your calls.',
      goal: { kind: 'BUY_AND_RAID', pistols: 5, raids: 1 },
    },
  },
} as const satisfies Ruleset;
