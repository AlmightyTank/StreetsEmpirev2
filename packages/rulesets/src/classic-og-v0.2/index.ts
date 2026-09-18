import { classicOgV01 } from '../classic-og-v0.1/index.js';
import type { Ruleset } from '../types.js';

/** 0.2.0-B cash raids. Values are pinned separately from the A experiment. */
export const classicOgV02 = {
  ...classicOgV01,
  meta: { id: 'classic-og-v0.2', version: '0.2.0', name: 'Classic OG - Cash Raids' },
  combat: {
    version: '0.2.0-B.1', weapons: classicOgV01.weapons,
    squadCap: 100, turnCost: 10,
    strength: { perThug: 1, weaponPowerExponent: 0.5, moraleFloor: 0.75, defenseMultiplier: 1.1, variance: 0.1 },
    wounds: { winnerFraction: 0, loserFraction: 0, maxFraction: 0, recoveryMinutes: 120 },
    loot: { protectedCashCents: 500_000, exposedCashPercent: 5, perFitAttackerCents: 10_000 },
    newcomerHours: 24, protectionHours: 6, cooldownMinutes: 30,
    minimumTargetStrengthRatio: 0.5,
  },
} as const satisfies Ruleset;
