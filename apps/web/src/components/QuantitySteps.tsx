import { formatNumber } from '@streets/shared';

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
  label = 'Max',
}: {
  value: number | '';
  onChange: (value: number) => void;
  max: number;
  steps: readonly number[];
  disabled?: boolean;
  label?: string;
}) {
  const current = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const atMax = current >= max;

  return (
    <>
      {steps
        .filter((step) => step <= max)
        .map((step) => (
          <button
            type="button"
            key={step}
            className="se-btn se-btn--sm"
            disabled={disabled || atMax}
            onClick={() => onChange(Math.min(max, current + step))}
          >
            +{formatNumber(step)}
          </button>
        ))}

      <button
        type="button"
        className="se-btn se-btn--sm"
        disabled={disabled || max < 1 || atMax}
        onClick={() => onChange(max)}
      >
        {label}
      </button>
    </>
  );
}
