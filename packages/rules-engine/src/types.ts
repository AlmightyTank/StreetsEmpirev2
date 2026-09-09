/**
 * Structural inputs for the pure calculators.
 *
 * These are deliberately loose so a Prisma RoundPlayer, a test fixture or a
 * half-built projection all satisfy them without adapters.
 */

export interface NetWorthInput {
  cashCents: bigint | number;
  whores: number;
  thugs: number;
  lowRiders: number;
  medicine: number;
  crack: number;
  condoms: number;
  beer: number;
  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;
}

export interface ThugHappinessInput {
  thugs: number;
  beer: number;
  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;
}

export interface WhoreHappinessInput {
  whores: number;
  thugs: number;
  condoms: number;
  crack: number;
  payoutPercent: number;
}

export interface TurnState {
  turns: number;
  lastTurnCalculationAt: Date;
}

export interface TurnRegeneration {
  /** Turns after settling every whole elapsed interval. */
  turns: number;
  /** Advanced by exactly the intervals consumed, never to `now`. */
  lastTurnCalculationAt: Date;
  /** Turns actually gained after the cap was applied. */
  gained: number;
  intervalsProcessed: number;
  /** When the next tick lands. Display only; the server stays authoritative. */
  nextTurnAt: Date;
  turnsGeneratedNextTick: number;
  turnCap: number;
}

export interface AwayBonusInput {
  turns: number;
  lastActiveAt: Date;
  lastAwayBonusAt: Date | null;
}

export interface AwayBonusResult {
  awarded: boolean;
  amount: number;
  turns: number;
}
