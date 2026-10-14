import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SupporterPollsDto, SupporterStatusDto } from '@streets/shared';
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
  * Supporter page controls. Supporting is cosmetic only: the Midnight Chrome
 * collection, Signature Profile Card, monthly drops, tenure badges and
 * convenience limits are kept cosmetic-only. Payment happens on Stripe's own
 * pages; the rewards unlock as soon as Stripe confirms it.
 */
export function SupporterPanel() {
  const [searchParams, setSearchParams] = useSearchParams();
  const returned = searchParams.get('supporter');
  const [status, setStatus] = useState<SupporterStatusDto | null>(null);
  const [polls, setPolls] = useState<SupporterPollsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState('');
  const [waiting, setWaiting] = useState(returned === 'thanks');
  const [listingBusy, setListingBusy] = useState(false);

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

  const loadPolls = useCallback(async () => {
    try {
      setPolls(await supporterApi.polls());
    } catch {
      setPolls(null);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadPolls(); }, [loadPolls]);

  // Coming back from Stripe lands on this page; bring the controls into view.
  useEffect(() => {
    if (returned) document.getElementById('supporting')?.scrollIntoView({ block: 'start' });
  }, [returned]);

  // Back from Stripe: the webhook usually lands within seconds, so check until the rewards show.
  useEffect(() => {
    if (returned !== 'thanks') return;
    let tries = 0;
    const timer = window.setInterval(async () => {
      if (document.hidden) return;
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

  async function gift() {
    const recipientAccountId = giftRecipient.trim();
    if (!recipientAccountId) return;
    setGiftBusy(true);
    setError(null);
    try {
      const { url } = await supporterApi.giftCheckout(recipientAccountId);
      window.location.assign(url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not start the gift checkout. Try again in a moment.');
      setGiftBusy(false);
    }
  }

  async function vote(pollId: string, optionKey: string) {
    setError(null);
    try {
      setPolls(await supporterApi.vote(pollId, optionKey));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save your vote.');
    }
  }

  async function setListed(listed: boolean) {
    setListingBusy(true);
    setError(null);
    try {
      setStatus(await supporterApi.setListed(listed));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that choice.');
    } finally {
      setListingBusy(false);
    }
  }

  async function setReleaseCredit(optIn: boolean) {
    setListingBusy(true);
    setError(null);
    try {
      setStatus(await supporterApi.setReleaseCredit(optIn));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that choice.');
    } finally {
      setListingBusy(false);
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
      {returned === 'gift-thanks' ? (
        <Alert tone="success">
          Thank you. Stripe is confirming the gift, then the recipient gets this month&apos;s supporter bundle.{' '}
          <button type="button" className="se-linkbtn" onClick={dismissReturn}>Dismiss</button>
        </Alert>
      ) : null}
      {returned === 'gift-cancelled' ? (
        <Alert tone="info">
          Gift checkout was cancelled and nothing was charged.{' '}
          <button type="button" className="se-linkbtn" onClick={dismissReturn}>Dismiss</button>
        </Alert>
      ) : null}
      {error ? <Alert>{error}</Alert> : null}

      <p>
        Supporting keeps StreetsEmpire running. It is cosmetic only: no cash, turns, product, weapons or anything else that
        changes play. Supporters get the <strong>Midnight Chrome collection</strong> (looks for the Thug, Hoe, Sedan, Van
        and Low-Rider), the <strong>Signature Profile Card</strong>, a supporter banner accent, and keep them for good, even after they stop.
        Every month you support also brings that month&apos;s supporter badge, and cumulative paid months unlock tenure badges.
      </p>
      <p className="se-hint">
        Permanent supporter rewards also expand account conveniences: 4 profile presets, 4 cosmetic loadout slots,
        5 notification rule slots, a 100-row activity view, and a 100-row bell history. Free accounts keep 1 preset,
        1 loadout, 1 notification rule slot, a 50-row activity view, and a 40-row bell history.
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

      {status?.drop || status?.dropsHeld.length || status?.supporterPreview ? (
        <div className="se-panel-section">
          <h3 className="se-label">Monthly drops</h3>
          {status.drop ? (
            <p>
              This month: <strong>{status.drop.name}</strong>{' '}
              {status.drop.held
                ? <span className="se-tag se-tag--good">Yours</span>
                : <span className="se-muted">· given to everyone supporting this month</span>}
            </p>
          ) : null}
          {status.dropsHeld.length ? (
            <p className="se-hint">
              You have {status.dropsHeld.map((drop) => drop.name).join(', ')}. Wear one as a title or feature it as a badge in Cosmetics below.
            </p>
          ) : null}
          {status.supporterPreview ? (
            <div className="se-callout">
              <strong>Supporter preview: {status.supporterPreview.name}</strong>
              <p className="se-hint">
                Next month&apos;s drop opens {day(status.supporterPreview.availableAt)}. Preview only — no gameplay access or early grants.
              </p>
              <ul className="se-list-plain">
                {status.supporterPreview.items.map((item) => (
                  <li key={`${status.supporterPreview!.month}-${item.name}`}>
                    <strong>{item.name}</strong> <span className="se-muted">· {item.kind.toLowerCase().replaceAll('_', ' ')} · {item.rarity}</span>
                    <br /><span className="se-hint">{item.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {status?.hasRewards ? (
        <div className="se-panel-section">
          <label className="se-checkrow se-checkrow--inline">
            <input
              type="checkbox"
              checked={status.listed}
              disabled={listingBusy}
              onChange={(event) => void setListed(event.target.checked)}
            />
            <span>
              <strong>Thank me on the public supporter list</strong>
              <small>Shows your name and the month you started supporting on the StreetsEmpire site. Nothing about payments. Off unless you turn it on.</small>
            </span>
          </label>
          <label className="se-checkrow se-checkrow--inline">
            <input
              type="checkbox"
              checked={status.releaseNotesCreditOptIn}
              disabled={listingBusy}
              onChange={(event) => void setReleaseCredit(event.target.checked)}
            />
            <span>
              <strong>Credit me in supporter release notes</strong>
              <small>Optional thank-you credit when supporter-funded drops ship. Off by default and never shows billing details.</small>
            </span>
          </label>
        </div>
      ) : null}

      <div className="se-panel-section">
        <h3 className="se-label">Gift a supporter month</h3>
        <p className="se-hint">Gift checkout grants the recipient this month&apos;s supporter bundle only. Your paid month counts toward tenure; expired monthly bundles are never minted.</p>
        <div className="se-inline-fields">
          <input
            className="se-input"
            value={giftRecipient}
            onChange={(event) => setGiftRecipient(event.target.value)}
            placeholder="Recipient account ID"
            aria-label="Recipient account ID"
          />
          <Button type="button" className="se-btn se-btn--ghost" onClick={() => void gift()} disabledReason={giftBusy ? 'Opening Stripe...' : giftRecipient.trim() ? null : 'Enter a recipient account ID'}>
            {giftBusy ? 'Opening Stripe...' : 'Gift month'}
          </Button>
        </div>
      </div>

      {polls?.poll ? (
        <div className="se-panel-section">
          <h3 className="se-label">Supporter vote</h3>
          <p><strong>{polls.poll.title}</strong></p>
          {polls.poll.description ? <p className="se-hint">{polls.poll.description}</p> : null}
          <div className="se-stack-sm">
            {polls.poll.options.map((option) => (
              <Button
                key={option.key}
                type="button"
                className={polls.poll?.myVote === option.key ? 'se-btn se-btn--primary' : 'se-btn se-btn--ghost'}
                onClick={() => void vote(polls.poll!.id, option.key)}
                disabledReason={polls.poll?.myVote ? 'You already voted in this poll' : null}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {polls.poll.myVote ? <p className="se-hint">Vote recorded. Thanks for helping pick the next drop theme.</p> : null}
        </div>
      ) : null}
    </Panel>
  );
}
