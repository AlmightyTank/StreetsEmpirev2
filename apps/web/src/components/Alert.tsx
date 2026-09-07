import type { ReactNode } from 'react';

export function Alert({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'info';
}) {
  return (
    <div className={`se-alert${tone === 'info' ? ' se-alert--info' : ''}`} role="alert">
      {children}
    </div>
  );
}
