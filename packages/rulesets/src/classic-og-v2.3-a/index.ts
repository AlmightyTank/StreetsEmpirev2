import { classicOgV22A } from '../classic-og-v2.2-a/index.js';
import { STREET_SKILLS_V1 } from '../street-skills.js';
import type { Ruleset } from '../types.js';

export const classicOgV23A = {
  ...classicOgV22A,
  meta: { ...classicOgV22A.meta, id: 'classic-og-v2.3-a', version: '2.3.0-A', name: 'Classic OG - Street Skills' },
  streetSkills: STREET_SKILLS_V1,
} satisfies Ruleset;
