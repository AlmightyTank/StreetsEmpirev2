/**
 * Who Tommy will sell the heavy stuff to. Section 34.
 *
 * BALANCE_APPROXIMATION. Standing across the whole city, not time served.
 *
 *   Shotgun    50 rep   one favour, or a fortnight of being a regular
 *   Tek-9     150 rep   three favours, or two and a change
 *   AK-47     248 rep   every favour, plus the habit to go with them
 *
 * The AK-47 gate sits above the 200 a player can reach by trading alone, so
 * the favours are mandatory for the top gun. It sits below the 264 a
 * weekends-only player reaches by the last day of a round, so showing up twice
 * a week still gets there with a week left to use it. Between those two
 * numbers the exact gate is free: reputation arrives in 50-point quest steps,
 * so anything from 232 to 264 unlocks on the same day for everyone else.
 *
 * Earned access is permanent. Standing can stall, but a shopkeeper who has
 * decided you are worth selling to does not un-decide it because your crew
 * shrank.
 */

import type { WeaponUnlockKey, WeaponUnlockRule } from '../types.js';

export const weaponUnlocks = {
  SHOTGUN: {
    title: 'Worth serving',
    description: 'Do somebody in this city a favour and the shotgun rack opens up.',
    totalRep: 50,
    prerequisite: null,
  },
  TEK9: {
    title: 'Worth trusting',
    description: 'Tommy keeps the Tek-9s for people the whole street speaks well of.',
    totalRep: 150,
    prerequisite: 'SHOTGUN',
  },
  AK47: {
    title: 'Worth the risk',
    description:
      'Every trader in the city has to vouch for you before Tommy hands over an AK-47.',
    totalRep: 248,
    prerequisite: 'TEK9',
  },
} as const satisfies Record<WeaponUnlockKey, WeaponUnlockRule>;
