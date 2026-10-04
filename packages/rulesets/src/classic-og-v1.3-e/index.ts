import { classicOgV13D } from '../classic-og-v1.3-d/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.3.0-E — City Identity & the Feds.
 *
 * Every city's police work a Case their own way: how fast they build one, how fast it goes
 * cold, and how much warning a warrant gives. At the Federal stage warrants come quicker, the
 * federal sweep writes more against the player, and relocating takes the federal case along.
 * Heat, busts, arrests and bribes are unchanged. See docs/ROADMAP-1.3.0.md.
 */
export const classicOgV13E = {
  ...classicOgV13D,
  meta: { id: 'classic-og-v1.3-e', version: '1.3.0-E', name: 'Classic OG - City Identity & the Feds' },
  law: {
    ...classicOgV13D.law,
    cities: {
      'new-york-city': { blurb: 'By the book: the precinct every other city is measured against.', caseSpeed: 1, coolingSpeed: 1, warningHoursMultiplier: 1 },
      detroit: { blurb: 'Stretched thin: files build slower and go cold quicker.', caseSpeed: 0.9, coolingSpeed: 1.25, warningHoursMultiplier: 1 },
      'miami-beach': { blurb: 'Busy and watchful: cases build fast on the beachfront.', caseSpeed: 1.2, coolingSpeed: 1, warningHoursMultiplier: 1 },
      seattle: { blurb: 'Patient: slow to open a file, and they give plenty of warning.', caseSpeed: 0.8, coolingSpeed: 1, warningHoursMultiplier: 1.5 },
      'beverly-hills': { blurb: 'Police on every corner: cases build fast and stay warm.', caseSpeed: 1.4, coolingSpeed: 0.75, warningHoursMultiplier: 1 },
      'las-vegas': { blurb: 'They look away for a long time, then move all at once: slow files, slow to cool, short warnings.', caseSpeed: 0.7, coolingSpeed: 0.5, warningHoursMultiplier: 0.5 },
      'los-angeles': { blurb: 'Quick to open a case on anyone who draws attention.', caseSpeed: 1.25, coolingSpeed: 1, warningHoursMultiplier: 1 },
      atlanta: { blurb: 'They look the other way: files build slowly and go cold fast.', caseSpeed: 0.7, coolingSpeed: 1.25, warningHoursMultiplier: 1 },
    },
    federal: {
      warningHoursMultiplier: 0.5,
      sweepPoints: 10,
      transfer: { oldCityCase: 40 },
    },
  },
} as const satisfies Ruleset;
