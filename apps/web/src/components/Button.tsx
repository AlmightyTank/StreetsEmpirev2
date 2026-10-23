import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /**
   * Why this button cannot be pressed right now, or null when it can. Giving a
   * reason is what turns the button off, so the state and the explanation can
   * never disagree. One short sentence, in the player's words.
   */
  disabledReason?: string | null | false;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
};

/**
 * A button that says why it is off.
 *
 * A disabled button swallows its own mouse events, so the reason hangs off a
 * wrapper around it - the same trick tooltip libraries use. The wrapper only
 * exists while there is something to explain, and the reason stays in the page
 * for screen readers, which never see a hover.
 */
export function Button({
  disabledReason,
  disabled,
  title,
  className,
  children,
  variant = 'default',
  size = 'md',
  block,
  loading,
  ...rest
}: ButtonProps) {
  const reason = disabledReason || null;
  const off = disabled === true || reason !== null || loading === true;
  const classes = [
    'se-btn',
    variant !== 'default' ? `se-btn--${variant}` : '',
    size !== 'md' ? `se-btn--${size}` : '',
    block ? 'se-btn--block' : '',
    className ?? '',
  ].filter(Boolean).join(' ');
  const button = (
    <button {...rest} className={classes} disabled={off} aria-busy={loading || undefined} title={off && reason ? reason : title}>
      {loading ? <span className="se-btn__spinner" aria-hidden="true" /> : null}
      {loading ? <span className="se-sr">Loading: </span> : null}
      {children}
    </button>
  );

  if (!off || !reason) return button;

  return (
    <span className={`se-why${block || classes.includes('se-btn--block') ? ' se-why--block' : ''}`}>
      {button}
      <span className="se-why__text">{reason}</span>
    </span>
  );
}
