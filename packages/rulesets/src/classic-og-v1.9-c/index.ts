import { classicOgV19B } from '../classic-og-v1.9-b/index.js';
import type { Ruleset } from '../types.js';
import { originStoryQuests } from './origin-story.js';

/** Empire Story origin content layered on 1.9.0-B. */
export const classicOgV19C = {
  ...classicOgV19B,
  meta: { id: 'classic-og-v1.9-c', version: '1.9.0-C', name: 'Classic OG - Empire Story' },
  questDefinitions: { ...classicOgV19B.questDefinitions, ...originStoryQuests },
} satisfies Ruleset;
