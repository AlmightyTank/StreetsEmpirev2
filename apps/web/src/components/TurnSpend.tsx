import { useId } from 'react';
import { formatNumber } from '@streets/shared';
import { QuantityStepper } from './QuantityStepper.js';

/**
 * Sections 25 and 28. Choose how many turns to burn.
 *
 * The MAX button fills in every turn on hand - the server still checks, but
 * the control should never let a player type a number it knows is impossible.
 */
export function TurnSpend({
  value,
  onChange,
  available,
  disabled,
}: {
  value: number | '';
  onChange: (value: number | '') => void;
  available: number;
  disabled?: boolean;
  /** Why turns cannot be spent right now, shown when the helpers are hovered. */
  disabledReason?: string | null;
}) {
  const inputId = useId();
  const tooMany = typeof value === 'number' && value > available;

  return (
    <div className="se-spend">
      <label className="se-label" htmlFor={inputId}>
        Turns to spend
      </label>

      <div className="se-spend__row">
        <input
          id={inputId}
          aria-label="Turns to spend"
          className={`se-input se-spend__input${tooMany ? ' se-input--error' : ''}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={available}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === '' ? '' : Math.max(0, Math.floor(Number(raw) || 0)));
          }}
        />
        <QuantityStepper value={value} onChange={onChange} min={1} max={available} disabled={disabled} unitLabel="turns" showMax />
      </div>

      {tooMany ? (
        <p className="se-error" role="alert">You only have {formatNumber(available)} turns.</p>
      ) : (
        <p className="se-hint">{formatNumber(available)} available.</p>
      )}
    </div>
  );
}
