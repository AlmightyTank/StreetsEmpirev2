import { classicOgV07C } from '../classic-og-v0.7-c/index.js';
import type { Ruleset } from '../types.js';
import { questContacts } from '../quest-contacts.js';
import { storyQuests } from './story-quests.js';

/**
 * 0.7.0-D keeps Lookouts/Security intact and layers Workshop/Garage logistics on top.
 */
export const classicOgV07D = {
  ...classicOgV07C,
  meta: { id: 'classic-og-v0.7-d', version: '0.7.0-D', name: 'Classic OG - Workshop, Garage & Jobs' },
  contacts: questContacts,
  questDefinitions: storyQuests,
} as const satisfies Ruleset;
