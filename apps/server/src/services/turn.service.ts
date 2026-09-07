import {
  evaluateAwayBonus,
  regenerateTurns,
  type Ruleset,
} from '@streets/rules-engine';

export interface TurnInput {
  turns: number;
  lastTurnCalculationAt: Date;
  lastActiveAt: Date;
  lastAwayBonusAt: Date | null;
}

export interface TurnSettlement {
  turns: number;
  lastTurnCalculationAt: Date;
  /** Turns from regeneration only. */
  regenerated: number;
  awayBonus: { awarded: boolean; amount: number };
  nextTurnAt: Date;
  turnsGeneratedNextTick: number;
  turnCap: number;
  /** True when anything above needs writing back. */
  changed: boolean;
}

/**
 * Sections 13-15. The only place turns are allowed to move on their own.
 *
 * Regeneration is settled first, then the away bonus is considered on top of
 * the regenerated balance so the cap is applied once, to the real total.
 */
export const TurnService = {
  settle(player: TurnInput, now: Date, ruleset: Ruleset): TurnSettlement {
    const regen = regenerateTurns(player, now, ruleset);

    const bonus = evaluateAwayBonus(
      {
        turns: regen.turns,
        lastActiveAt: player.lastActiveAt,
        lastAwayBonusAt: player.lastAwayBonusAt,
      },
      now,
      ruleset,
    );

    const turns = bonus.awarded ? bonus.turns : regen.turns;

    return {
      turns,
      lastTurnCalculationAt: regen.lastTurnCalculationAt,
      regenerated: regen.gained,
      awayBonus: { awarded: bonus.awarded, amount: bonus.amount },
      nextTurnAt: regen.nextTurnAt,
      turnsGeneratedNextTick: turns >= ruleset.turns.cap ? 0 : ruleset.turns.amountPerInterval,
      turnCap: ruleset.turns.cap,
      changed:
        turns !== player.turns ||
        regen.lastTurnCalculationAt.getTime() !== player.lastTurnCalculationAt.getTime(),
    };
  },
};
