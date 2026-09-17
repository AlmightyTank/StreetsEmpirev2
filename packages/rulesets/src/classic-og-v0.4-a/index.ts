import { classicOgV03D } from '../classic-og-v0.3-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.4.0-A keeps 0.3.0-D balance and lays down the product catalog. Crack keeps
 * every number it has today. The other products exist in the inventory but
 * cannot be acquired, used or valued until later 0.4.0 stages give them rules.
 */
export const classicOgV04A = {
  ...classicOgV03D,
  meta: { id: 'classic-og-v0.4-a', version: '0.4.0-A', name: 'Classic OG - Product Foundation' },
  products: {
    CRACK: { name: 'Crack', blurb: 'Cheap and dependable. The street product every crew runs on.', sortOrder: 1 },
    WEED: { name: 'Weed', blurb: 'Keeps a crew calm and steady. Easy on the block, easy on the nerves.', sortOrder: 2 },
    ECSTASY: { name: 'Ecstasy', blurb: 'Party product for the Casino and Nightclub crowds. Pricey and particular.', sortOrder: 3 },
    COCAINE: { name: 'Cocaine', blurb: 'High-end product for high-end blocks. Costs a lot and draws attention.', sortOrder: 4 },
    METH: { name: 'Meth', blurb: 'Keeps thugs cooking and standing guard. Trouble follows it.', sortOrder: 5 },
    HEROIN: { name: 'Heroin', blurb: 'Holds a desperate crew together until it runs out, then it does not.', sortOrder: 6 },
  },
} as const satisfies Ruleset;
