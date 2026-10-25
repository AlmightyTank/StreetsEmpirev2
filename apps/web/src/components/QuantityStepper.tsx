import { useState } from 'react';
import { formatNumber } from '@streets/shared';
import '../styles/quantity-stepper.css';

const QUANTITY_STEPS = [1, 5, 10, 25, 50, 100, 500] as const;

/** Compact, reusable quantity controls for player-facing game forms. */
export function QuantityStepper({
  value,
  onChange,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  unit = 1,
  unitLabel = 'units',
  disabled = false,
  className = '',
  showMax = false,
}: {
  value: number | '';
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** One step represents this many units, such as a market lot size. */
  unit?: number;
  unitLabel?: string;
  disabled?: boolean;
  className?: string;
  showMax?: boolean;
}) {
  const [stepSize, setStepSize] = useState<number>(1);
  const safeUnit = Math.max(1, Math.floor(unit));
  const safeMin = Math.ceil(Math.max(0, min) / safeUnit) * safeUnit;
  const safeMax = Math.max(safeMin, Math.floor(Math.max(0, max) / safeUnit) * safeUnit);
  const amount = stepSize * safeUnit;
  const current = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const hasRange = max >= min;
  const canDecrease = hasRange && current > safeMin;
  const canIncrease = hasRange && current < safeMax;

  return (
    <div className={`se-quantity-stepper${showMax ? ' se-quantity-stepper--max' : ''}${className ? ` ${className}` : ''}`} role="group" aria-label={`Adjust ${unitLabel}`}>
      <button type="button" className="se-quantity-stepper__button" aria-label={`Decrease by ${formatNumber(amount)} ${unitLabel}`}
        disabled={disabled || !canDecrease} onClick={() => onChange(Math.max(safeMin, current - amount))}>−</button>
      <label className="se-quantity-stepper__select-label">
        <span className="se-sr-only">Change amount in {unitLabel}</span>
        <select className="se-quantity-stepper__select" value={stepSize} disabled={disabled}
          onChange={(event) => setStepSize(Number(event.target.value))}>
          {QUANTITY_STEPS.map((step) => <option key={step} value={step}>{formatNumber(step)}</option>)}
        </select>
      </label>
      <button type="button" className="se-quantity-stepper__button" aria-label={`Increase by ${formatNumber(amount)} ${unitLabel}`}
        disabled={disabled || !canIncrease} onClick={() => onChange(Math.min(safeMax, Math.max(safeMin, current + amount)))}>+</button>
      {showMax ? <button type="button" className="se-quantity-stepper__max" disabled={disabled || !hasRange || current >= safeMax} onClick={() => onChange(safeMax)}>Max</button> : null}
    </div>
  );
}
