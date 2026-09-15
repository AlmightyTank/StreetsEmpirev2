import { formatNumber } from '@streets/shared';
import { Button } from './Button.js';

/**
 * The +1 / +10 / +100 / +1000 / Max row, shared by every quantity input in the
 * game so the store and the action pages cannot drift apart again.
 *
 * The steps ADD to whatever is in the box rather than replacing it, which is
 * what the "+" promises: three taps of +100 is 300. Everything is clamped to
 * `max`, and a step bigger than `max` is simply not offered - there is no
 * point showing "+1000" next to a turn box that caps at 200.
 */
export function QuantitySteps({
  value,
  onChange,
  max,
  steps,
  disabled,
  disabledReason,
  emptyReason,
  label = 'Max',
}: {
  value: number | '';
  onChange: (value: number) => void;
  max: number;
  steps: readonly number[];
  disabled?: boolean;
  /** Why the whole row is off, from whatever is blocking the form around it. */
  disabledReason?: string | null;
  /** Why there is no maximum worth filling in, when the caller knows. */
  emptyReason?: string | null;
  label?: string;
}) {
  const current = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const atMax = current >= max;
  const blocked = disabled ? disabledReason || 'Not right now.' : disabledReason || null;
  const full = `The box is already at ${formatNumber(max)}, the most you can take.`;

  return (
    <>
      {steps
        .filter((step) => step <= max)
        .map((step) => (
          <Button
            type="button"
            key={step}
            className="se-btn se-btn--sm"
            disabledReason={blocked ?? (atMax ? full : null)}
            onClick={() => onChange(Math.min(max, current + step))}
          >
            +{formatNumber(step)}
          </Button>
        ))}

      <Button
        type="button"
        className="se-btn se-btn--sm"
        disabledReason={blocked ?? (max < 1 ? emptyReason || 'There is nothing to fill in.' : atMax ? full : null)}
        onClick={() => onChange(max)}
      >
        {label}
      </Button>
    </>
  );
}
