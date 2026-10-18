import type { ReactNode } from 'react';

/** Reusable visual lock cover for choices that the player cannot select yet. */
export function LockedChoiceOverlay({
  requirement,
  children,
}: {
  requirement: string;
  children?: ReactNode;
}) {
  return (
    <span className="se-locked-choice" role="note">
      <svg className="se-locked-choice__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      <strong className="se-locked-choice__banner">Locked</strong>
      <span className="se-locked-choice__requirement">{requirement}</span>
      {children ? <span className="se-locked-choice__action">{children}</span> : null}
    </span>
  );
}
