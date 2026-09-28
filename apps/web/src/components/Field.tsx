import type { InputHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export function Field({ label, hint, error, id, ...input }: FieldProps) {
  const inputId = id ?? input.name ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="se-field">
      <label className="se-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={`se-input${error ? ' se-input--error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
        // 1.0.0-G: a number box opens the phone's number pad, unless it takes negatives
        // (the number pad on iPhone has no minus key).
        inputMode={input.inputMode ?? (input.type === 'number' && Number(input.min) >= 0 ? 'numeric' : undefined)}
        {...input}
      />
      {error ? (
        <p className="se-error" id={`${inputId}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="se-hint" id={`${inputId}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
