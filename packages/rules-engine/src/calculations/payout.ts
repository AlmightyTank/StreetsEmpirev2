import { classicOgV01, type Ruleset } from '@streets/rulesets';

export type PayoutValidation =
  | { ok: true; percent: number }
  | { ok: false; message: string };

/** Section 31. 1..99 inclusive, whole numbers only. */
export function validatePayoutPercent(
  percent: unknown,
  ruleset: Ruleset = classicOgV01,
): PayoutValidation {
  const { min, max } = ruleset.economy.payout;

  if (typeof percent !== 'number' || !Number.isInteger(percent)) {
    return { ok: false, message: 'Payout must be a whole percentage.' };
  }
  if (percent < min || percent > max) {
    return { ok: false, message: `Payout must be between ${min}% and ${max}%.` };
  }
  return { ok: true, percent };
}
