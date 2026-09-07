import { formatNumber } from '@streets/shared';

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
}) {
  const tooMany = typeof value === 'number' && value > available;

  return (
    <div className="se-spend">
      <label className="se-label" htmlFor="turns-to-spend">
        Turns to spend
      </label>

      <div className="se-spend__row">
        <input
          id="turns-to-spend"
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

        {[10, 25, 100].map((amount) => (
          <button
            type="button"
            key={amount}
            className="se-btn se-btn--sm"
            disabled={disabled || available < amount}
            onClick={() => onChange(amount)}
          >
            {amount}
          </button>
        ))}

        <button
          type="button"
          className="se-btn se-btn--sm"
          disabled={disabled || available < 1}
          onClick={() => onChange(available)}
        >
          Max
        </button>
      </div>

      {tooMany ? (
        <p className="se-error">You only have {formatNumber(available)} turns.</p>
      ) : (
        <p className="se-hint">{formatNumber(available)} available.</p>
      )}
    </div>
  );
}
