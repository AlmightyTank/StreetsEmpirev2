import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * Why this button cannot be pressed right now, or null when it can. Giving a
   * reason is what turns the button off, so the state and the explanation can
   * never disagree. One short sentence, in the player's words.
   */
  disabledReason?: string | null | false;
};

/**
 * A button that says why it is off.
 *
 * A disabled button swallows its own mouse events, so the reason hangs off a
 * wrapper around it - the same trick tooltip libraries use. The wrapper only
 * exists while there is something to explain, and the reason stays in the page
 * for screen readers, which never see a hover.
 */
export function Button({ disabledReason, disabled, title, className, children, ...rest }: ButtonProps) {
  const reason = disabledReason || null;
  const off = disabled === true || reason !== null;
  const button = (
    <button {...rest} className={className} disabled={off} title={off && reason ? reason : title}>
      {children}
    </button>
  );

  if (!off || !reason) return button;

  return (
    <span className={`se-why${(className ?? '').includes('se-btn--block') ? ' se-why--block' : ''}`}>
      {button}
      <span className="se-why__text">{reason}</span>
    </span>
  );
}
