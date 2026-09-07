import { departures } from './departures.js';
import { districts } from './districts.js';
import { economy } from './economy.js';
import { evidence } from './evidence.js';
import { happiness } from './happiness.js';
import { production } from './production.js';
import { rankings } from './rankings.js';
import { round } from './round.js';
import { scouting } from './scouting.js';
import { lowRiderThugCapacity, storeBulkHelpers, stores } from './stores.js';
import { turns } from './turns.js';
import { weapons } from './weapons.js';
import { weaponUnlocks } from './weapon-unlocks.js';
import { work } from './work.js';
import type { Ruleset } from '../types.js';

/**
 * classic-og-v0.1
 *
 * The frozen 0.1.0 ruleset. Nothing in apps/server may hard-code a balance
 * number: if a formula needs a constant, it belongs in one of these files.
 */
export const classicOgV01 = {
  meta: {
    id: 'classic-og-v0.1',
    version: '0.1.0',
    name: 'Classic OG v0.1',
  },
  round,
  turns,
  economy,
  happiness,
  districts,
  scouting,
  work,
  production,
  departures,
  stores,
  storeBulkHelpers,
  lowRiderThugCapacity,
  weapons,
  weaponUnlocks,
  rankings,
  evidence,
} as const satisfies Ruleset;

export {
  departures,
  districts,
  economy,
  evidence,
  happiness,
  lowRiderThugCapacity,
  production,
  rankings,
  round,
  scouting,
  storeBulkHelpers,
  stores,
  turns,
  weapons,
  weaponUnlocks,
  work,
};
