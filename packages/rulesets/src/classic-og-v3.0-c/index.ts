import { classicOgV30B } from '../classic-og-v3.0-b/index.js';
import type { Ruleset } from '../types.js';
import { originStoryQuests } from './origin-story.js';

/** Empire Story origin content layered on the latest 3.0 ruleset. */
export const classicOgV30C = {
  ...classicOgV30B,
  meta: { id: 'classic-og-v3.0-c', version: '3.0.0-C', name: 'Classic OG - Empire Story' },
  questDefinitions: { ...classicOgV30B.questDefinitions, ...originStoryQuests },
} satisfies Ruleset;
