import { classicOgV05A } from '../classic-og-v0.5-a/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.5.0-B keeps 0.5.0-A balance and puts crews on the road. A run takes Low-Riders,
 * escorts, cash and product out of home stock, drives the real roads to Pip's
 * counter in other cities, and brings back whatever it holds. What it took is all
 * it has.
 *
 * Runs trade at Pip's counters only here: the shared high market, supply swings,
 * road stops and Heat from selling arrive in 0.5.0-C, so a 0.5.0-B run earns the
 * street counters' small margins and learns what each city really has.
 */
export const classicOgV05B = {
  ...classicOgV05A,
  meta: { id: 'classic-og-v0.5-b', version: '0.5.0-B', name: 'Classic OG - Travel' },
  travel: {
    ...classicOgV05A.travel,
    runs: {
      // Two hours in town: long enough to catch between sessions, short enough that a
      // run left alone comes home rather than sitting in Miami all day.
      townWindowMinutes: 120,
    },
  },
} as const satisfies Ruleset;
