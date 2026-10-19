import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BirthdayClaimResultDto, BirthdayStatusDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { birthdayApi } from '../api/birthday.js';
import { dropApi } from '../api/drop.js';
import { formatWhen } from '../utils/time.js';

const DISMISS_KEY = 'se-birthday-later';

function dismissedFor(date: string): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === date;
  } catch {
    return false;
  }
}

/**
 * Birthdays (docs/BIRTHDAYS.md): the gift popup. It opens in the birthday week
 * while this year's gift is unclaimed. "Later" hides it for this visit only, so
 * the next visit in the week offers it again.
 */
export function BirthdayGift() {
  const [status, setStatus] = useState<BirthdayStatusDto | null>(null);
  const [result, setResult] = useState<BirthdayClaimResultDto | null>(null);
  const [dropOn, setDropOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    birthdayApi.status().then((next) => {
      if (!live || !next.claimable || !next.date || dismissedFor(next.date)) return;
      setStatus(next);
      setOpen(true);
      dropApi.status().then((drop) => { if (live) setDropOn(drop.enabled); }).catch(() => undefined);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (open) dialog.current?.focus();
  }, [open]);

  if (!open || !status) return null;

  const later = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, status.date ?? '');
    } catch {
      // Private browsing: it simply asks again next time.
    }
    setOpen(false);
  };
  const close = () => setOpen(false);

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      setResult(await birthdayApi.claim());
    } catch {
      setError('The gift could not be claimed right now. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="se-intro-backdrop" onClick={(event) => { if (event.target === event.currentTarget) (result ? close : later)(); }}>
      <div
        ref={dialog}
        className="se-intro se-birthday-gift"
        role="dialog"
        aria-modal="true"
        aria-labelledby="se-birthday-title"
        tabIndex={-1}
        onKeyDown={(event) => { if (event.key === 'Escape') (result ? close : later)(); }}
      >
        <div className="se-birthday-gift__confetti" aria-hidden="true" />
        <p className="se-eyebrow">🎂 Happy birthday</p>
        <h2 id="se-birthday-title">{result ? 'Your gift is in' : 'The streets got you something'}</h2>
        {result ? (
          <p>
            {result.granted ? `${formatNumber(result.crowns)} Crowns are in your wallet` : 'This year’s gift was already claimed'}, and the
            {' '}<strong>{status.titleName}</strong> title is yours to keep.
          </p>
        ) : (
          <p>To celebrate, here&rsquo;s what&rsquo;s yours this week:</p>
        )}
        <ul className="se-birthday-gift__list">
          <li><strong>{formatNumber(status.giftCrowns)} Crowns</strong> and the <strong>{status.titleName}</strong> title, kept for good.</li>
          <li><strong>{status.discountPercent}% off</strong> every item, bundle and Street Pass skip in The Drop{status.weekEndsAt ? ` until ${formatWhen(status.weekEndsAt)}` : ''}. Crown packs aren&rsquo;t included.</li>
          {status.today ? <li>A <strong>birthday frame</strong> and the <strong>Birthday Bash</strong> theme to wear today{status.dayEndsAt ? `, until ${formatWhen(status.dayEndsAt)}` : ''}.</li> : null}
        </ul>
        {error ? <p className="se-alert se-alert--danger" role="alert">{error}</p> : null}
        <div className="se-intro__actions">
          {result ? (
            <>
              <Link className="se-btn se-btn--ghost se-btn--sm" to="/account" onClick={close}>{status.today ? 'Wear the frame and theme' : 'Equip your title'}</Link>
              <span className="se-intro__nav">
                {dropOn ? <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/drop" onClick={close}>Shop {status.discountPercent}% off</Link> : null}
                <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={close}>Done</button>
              </span>
            </>
          ) : (
            <>
              <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={later}>Later</button>
              <button type="button" className="se-btn se-btn--primary se-btn--sm" disabled={busy} onClick={() => void claim()}>{busy ? 'Opening…' : 'Open my gift'}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
