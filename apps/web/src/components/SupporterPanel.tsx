import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SupporterStatusDto } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { supporterApi } from '../api/supporter.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';

/** How long the page waits for Stripe's webhook after a checkout, checking every few seconds. */
const CONFIRM_POLL_MS = 3_000;
const CONFIRM_POLL_TRIES = 20;

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
}

/**
 * Account → Supporting. Supporting is cosmetic only: the Midnight Chrome
 * collection and the Signature Profile Card, kept for good. Payment happens on
 * Stripe's own pages; the rewards unlock as soon as Stripe confirms it.
 */
export function SupporterPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const returned = searchParams.get('supporter');
  const [status, setStatus] = useState<SupporterStatusDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(returned === 'thanks');

  const load = useCallback(async () => {
    try {
      const next = await supporterApi.status();
      setStatus(next);
      return next;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your supporter status.');
      return null;
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Coming back from Stripe lands on the account page; bring this panel into view.
  useEffect(() => {
    if (returned) document.getElementById('supporting')?.scrollIntoView({ block: 'start' });
  }, [returned]);

  // Back from Stripe: the webhook usually lands within seconds, so check until the rewards show.
  useEffect(() => {
    if (returned !== 'thanks') return;
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries += 1;
      const next = await load();
      if (next?.hasRewards || tries >= CONFIRM_POLL_TRIES) {
        window.clearInterval(timer);
        setWaiting(false);
      }
    }, CONFIRM_POLL_MS);
    return () => window.clearInterval(timer);
  }, [returned, load]);

  async function go(to: 'checkout' | 'portal') {
    setBusy(true);
    setError(null);
    try {
      const { url } = await (to === 'checkout' ? supporterApi.checkout() : supporterApi.portal());
      window.location.assign(url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reach Stripe. Try again in a moment.');
      setBusy(false);
    }
  }

  function dismissReturn() {
    const next = new URLSearchParams(searchParams);
    next.delete('supporter');
    setSearchParams(next, { replace: true });
  }

  const membership = status?.membership ?? null;
  const running = Boolean(membership && (membership.active || membership.paymentFailing));
  const working = 'Opening Stripe...';

  return (
    <Panel title="Supporting" id="supporting">
      {returned === 'thanks' ? (
        <Alert tone="success">
          {status?.hasRewards
            ? 'Thank you for supporting StreetsEmpire. Your Midnight Chrome rewards are unlocked: pick them in Cosmetics below.'
            : waiting
              ? 'Thank you! Stripe is confirming your payment. Your rewards unlock as soon as it does, usually within a minute.'
              : 'Thank you! Stripe has not confirmed the payment yet. Your rewards unlock as soon as it does; refresh this page in a few minutes.'}
          {' '}<button type="button" className="se-linkbtn" onClick={dismissReturn}>Dismiss</button>
        </Alert>
      ) : null}
      {returned === 'cancelled' ? (
        <Alert tone="info">
          Checkout was cancelled and nothing was charged.{' '}
          <button type="button" className="se-linkbtn" onClick={dismissReturn}>Dismiss</button>
        </Alert>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}

      <p>
        Supporting keeps StreetsEmpire running. It is cosmetic only: no cash, turns, product, weapons or anything else that
        changes play. Supporters get the <strong>Midnight Chrome collection</strong> (looks for the Thug, Hoe, Sedan, Van
        and Low-Rider) and the <strong>Signature Profile Card</strong>, and keep them for good, even after they stop.
      </p>

      {!status ? (
        <p className="se-muted">Loading...</p>
      ) : running && membership ? (
        <>
          {membership.paymentFailing ? (
            <Alert tone="warning">Your last supporter payment did not go through. Update your card in Manage support so Stripe can retry it.</Alert>
          ) : (
            <p>
              <strong>You are supporting StreetsEmpire.</strong>{' '}
              {membership.cancelAtPeriodEnd
                ? `It is set to end on ${day(membership.currentPeriodEnd)}.`
                : membership.currentPeriodEnd ? `It renews on ${day(membership.currentPeriodEnd)}.` : null}
            </p>
          )}
          <Button type="button" className="se-btn se-btn--ghost" onClick={() => void go('portal')} disabledReason={busy ? working : null}>
            {busy ? working : 'Manage support'}
          </Button>
          <p className="se-hint">Change your card, see receipts or cancel on Stripe&apos;s billing page.</p>
        </>
      ) : (
        <>
          {status.hasRewards ? (
            <p>Thank you for supporting{status.since ? ` since ${day(status.since)}` : ''}. Your rewards are yours to keep.</p>
          ) : null}
          {status.checkoutEnabled ? (
            <>
              <Button type="button" className="se-btn se-btn--primary" onClick={() => void go('checkout')} disabledReason={busy ? working : null}>
                {busy ? working : status.hasRewards ? 'Support again' : 'Support StreetsEmpire'}
              </Button>
              <p className="se-hint">Payment is handled by Stripe. The price and billing period are shown there before you pay, and you can cancel any time.</p>
            </>
          ) : (
            <p className="se-hint">Supporting opens soon.</p>
          )}
          {membership ? (
            <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => void go('portal')} disabledReason={busy ? working : null}>
              Billing history
            </Button>
          ) : null}
        </>
      )}
    </Panel>
  );
}
