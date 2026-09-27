import type { ReactNode } from 'react';

export type AlertTone = 'error' | 'warning' | 'info' | 'success';

/**
 * The one message box. 1.0.0-G: four tones, each with a text label for screen readers
 * and anyone who does not see the colour. Problems (error, warning) interrupt a screen
 * reader; news (info, success) waits its turn.
 */
export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: AlertTone }) {
  const urgent = tone === 'error' || tone === 'warning';
  return (
    <div className={`se-alert${tone === 'error' ? '' : ` se-alert--${tone}`}`} role={urgent ? 'alert' : 'status'}>
      {tone === 'error' || tone === 'warning' ? <span className="se-sr">{tone === 'error' ? 'Error: ' : 'Warning: '}</span> : null}
      {children}
    </div>
  );
}
