import { classicOgV01, type Ruleset } from '@streets/rulesets';
import type {
  AwayBonusInput,
  AwayBonusResult,
  TurnRegeneration,
  TurnState,
} from '../types.js';

/**
 * Section 13. Lazy regeneration.
 *
 * Only whole intervals are settled, and the clock advances by exactly those
 * intervals. Setting lastTurnCalculationAt to now would throw away the
 * fraction of an interval already served, every single time turns are read.
 *
 * The clock advances even when the player is at the cap, so idling at 200
 * does not bank hours of turns that dump the moment one is spent.
 */
export function regenerateTurns(
  state: TurnState,
  now: Date = new Date(),
  ruleset: Ruleset = classicOgV01,
): TurnRegeneration {
  const t = ruleset.turns;
  const intervalMs = t.intervalMinutes * 60 * 1000;

  const elapsedMs = now.getTime() - state.lastTurnCalculationAt.getTime();
  const intervalsProcessed = elapsedMs > 0 ? Math.floor(elapsedMs / intervalMs) : 0;

  const lastTurnCalculationAt =
    intervalsProcessed > 0
      ? new Date(state.lastTurnCalculationAt.getTime() + intervalsProcessed * intervalMs)
      : state.lastTurnCalculationAt;

  const generated = intervalsProcessed * t.amountPerInterval;
  const turns =
    state.turns >= t.cap ? state.turns : Math.min(t.cap, state.turns + generated);

  return {
    turns,
    lastTurnCalculationAt,
    gained: turns - state.turns,
    intervalsProcessed,
    nextTurnAt: new Date(lastTurnCalculationAt.getTime() + intervalMs),
    turnsGeneratedNextTick: turns >= t.cap ? 0 : t.amountPerInterval,
    turnCap: t.cap,
  };
}

/**
 * Section 15. One away bonus per away period.
 *
 * The bonus can only fire again once the player has actually been active
 * since the last payout, which is what stops refresh spam from farming it.
 */
export function evaluateAwayBonus(
  player: AwayBonusInput,
  now: Date = new Date(),
  ruleset: Ruleset = classicOgV01,
): AwayBonusResult {
  const bonus = ruleset.turns.awayBonus;
  const none: AwayBonusResult = { awarded: false, amount: 0, turns: player.turns };

  if (!bonus.enabled) return none;

  const awayMs = now.getTime() - player.lastActiveAt.getTime();
  if (awayMs < bonus.afterHours * 60 * 60 * 1000) return none;

  if (player.lastAwayBonusAt && player.lastAwayBonusAt >= player.lastActiveAt) {
    return none;
  }

  const room = Math.max(0, ruleset.turns.cap - player.turns);
  const amount = Math.min(bonus.amount, room);
  if (amount <= 0) return none;

  return { awarded: true, amount, turns: player.turns + amount };
}
