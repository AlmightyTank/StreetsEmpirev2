import { classicOgV11F } from '../classic-og-v1.1-f/index.js';
import type { Ruleset } from '../types.js';

/** 1.2.0-A — Casino Foundation. No resolved gambling games ship in this slice. */
export const classicOgV12A = {
  ...classicOgV11F,
  meta: { id: 'classic-og-v1.2-a', version: '1.2.0-A', name: 'Classic OG - Casino Foundation' },
  casino: {
    enabled: true,
    chipUnitCents: 100,
    cashier: { minExchangeCents: 10_000, maxExchangeCents: 500_000_000 },
    session: { minBankrollCents: 10_000, maxBankrollCents: 100_000_000 },
    venues: {
      'new-york-city': { name: 'Five Boroughs Card Room', blurb: 'Private tables above the noise of Midtown. The room remembers every face and every dollar.', kind: 'UNDERGROUND' },
      detroit: { name: 'Motor City Dice House', blurb: 'A hard room with loud dice, short tempers and cash moving under the table.', kind: 'UNDERGROUND' },
      'miami-beach': { name: 'Ocean Crown', blurb: 'Hotel lights, velvet ropes and late-night action a block off the beach.', kind: 'NIGHTLIFE' },
      seattle: { name: 'Emerald Rooms', blurb: 'Quiet private gaming with a patient crowd and a low profile.', kind: 'PRIVATE_CLUB' },
      'beverly-hills': { name: 'Rodeo Private Club', blurb: 'Invitation energy, old money and tables where nobody asks what you do for a living.', kind: 'PRIVATE_CLUB' },
      'las-vegas': { name: 'Empire Grand', blurb: 'The full floor: cages, tables, high-limit rooms and the biggest action in the country.', kind: 'FULL_CASINO' },
      'los-angeles': { name: 'Sunset Palace', blurb: 'Industry money, private booths and a casino floor built to be seen.', kind: 'NIGHTLIFE' },
      atlanta: { name: 'Peachtree Club', blurb: 'A polished club where road money and nightlife money meet after dark.', kind: 'PRIVATE_CLUB' },
    },
  },
} as const satisfies Ruleset;
