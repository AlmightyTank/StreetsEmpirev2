import { departures } from './departures.js';
import { districts } from './districts.js';
import { economy } from './economy.js';
import { health } from './health.js';
import { evidence } from './evidence.js';
import { happiness } from './happiness.js';
import { production } from './production.js';
import { quests } from './quests.js';
import { reputation } from './reputation.js';
import { rankings } from './rankings.js';
import { round } from './round.js';
import { scouting } from './scouting.js';
import { lowRiderThugCapacity, storeBulkHelpers, stores } from './stores.js';
import { turns } from './turns.js';
import { weapons } from './weapons.js';
import { weaponUnlocks } from './weapon-unlocks.js';
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
  production,
  departures,
  health,
  stores,
  storeBulkHelpers,
  lowRiderThugCapacity,
  weapons,
  weaponUnlocks,
  reputation,
  quests,
  rankings,
  evidence,
} as const satisfies Ruleset;

export {
  departures,
  health,
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
  reputation,
  quests,
};
