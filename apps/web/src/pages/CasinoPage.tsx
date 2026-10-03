import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatCents, type CasinoPageDto } from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { formatWhen } from '../utils/time.js';
import '../styles/casino.css';

function dollarsToCents(value: string): number | null {
  const clean = value.trim().replaceAll(',', '').replace(/^\$/, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const parts = clean.split('.');
  const whole = parts[0] ?? '0';
  const fraction = parts[1] ?? '';
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function signedMoney(value: number): string {
  if (!value) return '—';
  return (value > 0 ? '+' : '−') + formatCents(Math.abs(value));
}

export function CasinoPage() {
  const me = useSession((state) => state.me);
  const refreshSnapshot = useSession((state) => state.refreshSnapshot);
  const [data, setData] = useState<CasinoPageDto | null>(null);
  const [cashierAmount, setCashierAmount] = useState('1000');
  const [sessionAmount, setSessionAmount] = useState('1000');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const buyAction = useRef(newActionId());
  const redeemAction = useRef(newActionId());
  const openAction = useRef(newActionId());
  const closeAction = useRef(newActionId());

  function load() {
    void casinoApi.page()
      .then((next) => { setData(next); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not open the casino.'));
  }

  useEffect(load, [me?.id]);

  async function run(key: string, work: () => Promise<CasinoPageDto>, success: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const next = await work();
      setData(next);
      setNotice(success);
      await refreshSnapshot({ background: false });
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The casino could not complete that request.');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function exchange(direction: 'buy' | 'redeem') {
    const amountCents = dollarsToCents(cashierAmount);
    if (!amountCents) {
      setError('Enter a dollar amount, such as 1000 or 1000.00.');
      return;
    }
    if (direction === 'buy') {
      const ok = await run('buy', () => casinoApi.buy({ amountCents, actionId: buyAction.current }), 'Chips are waiting at the cage.');
      if (ok) buyAction.current = newActionId();
      return;
    }
    const ok = await run('redeem', () => casinoApi.redeem({ amountCents, actionId: redeemAction.current }), 'The cage paid out your chips.');
    if (ok) redeemAction.current = newActionId();
  }

  async function submitBuy(event: FormEvent) {
    event.preventDefault();
    await exchange('buy');
  }

  async function openSession(event: FormEvent) {
    event.preventDefault();
    const amountCents = dollarsToCents(sessionAmount);
    if (!amountCents) {
      setError('Enter a bankroll amount, such as 1000.');
      return;
    }
    const ok = await run(
      'open',
      () => casinoApi.openSession({ amountCents, actionId: openAction.current }),
      'Bankroll moved onto the casino floor.',
    );
    if (ok) openAction.current = newActionId();
  }

  async function closeSession() {
    if (!data?.openSession) return;
    const sessionId = data.openSession.id;
    const ok = await run(
      'close',
      () => casinoApi.closeSession(sessionId, { actionId: closeAction.current }),
      'Session closed. The bankroll is back in that city\'s chip wallet.',
    );
    if (ok) closeAction.current = newActionId();
  }

  return (
    <GameLayout>
      <div className="se-casino">
        <header className="se-casino__hero">
          <div>
            <span className="se-eyebrow">1.2.0-A · Casino foundation</span>
            <h1>Casino</h1>
            <p>Buy chips at the cage, set a session bankroll, and keep each city&rsquo;s action separate. Games arrive in the next slices.</p>
          </div>
          <div className="se-casino__readout">
            <span><small>Cash</small><strong>{data ? formatCents(data.cashCents) : '—'}</strong></span>
            <span><small>Casino value</small><strong>{data ? formatCents(data.totalCasinoValueCents) : '—'}</strong></span>
            <span><small>Boss</small><strong>{data?.currentVenue?.cityName ?? (data ? 'On the road' : '—')}</strong></span>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert>{notice}</Alert> : null}
        {!data ? <p className="se-muted">Checking the cage...</p> : null}

        {data && !data.enabled ? (
          <Panel title="Casino closed"><p className="se-muted">This round predates the 1.2 casino ruleset.</p></Panel>
        ) : null}

        {data?.enabled ? (
          <>
            <div className="se-casino__grid">
              <Panel title={data.currentVenue ? data.currentVenue.name : 'No casino in reach'} aside={data.currentVenue?.cityName ?? 'Travel'}>
                {data.currentVenue ? (
                  <>
                    <p>{data.currentVenue.blurb}</p>
                    <Row label="Chips at this cage" value={formatCents(data.currentVenue.walletChipsCents)} strong />
                    <Row label="Venue type" value={data.currentVenue.kind.replaceAll('_', ' ').toLowerCase()} />
                    {data.limits ? <Row label="Cage limits" value={formatCents(data.limits.cashierMinCents) + ' – ' + formatCents(data.limits.cashierMaxCents)} /> : null}
                    <form className="se-casino__form" onSubmit={submitBuy}>
                      <label>
                        <span>Cashier amount ($)</span>
                        <input className="se-input" inputMode="decimal" value={cashierAmount} onChange={(event) => {
                          setCashierAmount(event.target.value);
                          buyAction.current = newActionId();
                          redeemAction.current = newActionId();
                        }} />
                      </label>
                      <div className="se-casino__actions">
                        <Button className="se-btn" type="submit" disabled={busy !== null}>{busy === 'buy' ? 'Buying...' : 'Buy chips'}</Button>
                        <Button className="se-btn se-btn--ghost" type="button" disabled={busy !== null} onClick={() => void exchange('redeem')}>
                          {busy === 'redeem' ? 'Cashing out...' : 'Redeem chips'}
                        </Button>
                      </div>
                    </form>
                  </>
                ) : (
                  <p className="se-muted">The boss has to be standing in a casino city. A run driver cannot use the cage for you.</p>
                )}
              </Panel>

              <Panel title="Session bankroll" aside={data.openSession ? 'Open' : 'Ready'}>
                {data.openSession ? (
                  <>
                    <p><strong>{data.openSession.venueName}</strong> · {data.openSession.cityName}</p>
                    <Row label="On the floor" value={formatCents(data.openSession.bankrollCents)} strong />
                    <Row label="Opened" value={formatWhen(data.openSession.openedAt)} />
                    <Button className="se-btn" type="button" disabled={busy !== null} onClick={() => void closeSession()}>
                      {busy === 'close' ? 'Closing...' : 'Close session'}
                    </Button>
                    <p className="se-hint">Closing is always allowed, even after travel. Chips return to this venue&rsquo;s city wallet.</p>
                  </>
                ) : (
                  <form className="se-casino__form" onSubmit={openSession}>
                    <p className="se-muted">Move chips from the current city wallet onto the floor. Later games debit and credit this bankroll.</p>
                    <label>
                      <span>Bankroll ($)</span>
                      <input className="se-input" inputMode="decimal" value={sessionAmount} onChange={(event) => {
                        setSessionAmount(event.target.value);
                        openAction.current = newActionId();
                      }} />
                    </label>
                    {data.limits ? <p className="se-hint">Session limits: {formatCents(data.limits.sessionMinCents)} – {formatCents(data.limits.sessionMaxCents)}</p> : null}
                    <Button
                      className="se-btn"
                      type="submit"
                      disabledReason={!data.currentVenue ? 'Get the boss into a casino city first.' : busy !== null ? 'Another casino action is running.' : null}
                    >
                      {busy === 'open' ? 'Opening...' : 'Open session'}
                    </Button>
                  </form>
                )}
              </Panel>
            </div>

            <Panel title="Casino destinations" aside={String(data.venues.length) + ' cities'}>
              <div className="se-casino__venues">
                {data.venues.map((venue) => (
                  <article key={venue.citySlug} className={'se-casino__venue' + (venue.here ? ' is-here' : '')}>
                    <span className="se-eyebrow">{venue.cityName}{venue.here ? ' · you are here' : ''}</span>
                    <h3>{venue.name}</h3>
                    <p>{venue.blurb}</p>
                    <strong>{formatCents(venue.walletChipsCents)} in chips</strong>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel title="Casino ledger" aside="Last 25">
              {data.recentLedger.length ? (
                <div className="se-casino__ledger">
                  {data.recentLedger.map((entry) => (
                    <div key={entry.id} className="se-casino__ledgerrow">
                      <div>
                        <strong>{entry.kind.replaceAll('_', ' ').toLowerCase()}</strong>
                        <span>{entry.venueName} · {formatWhen(entry.createdAt)}</span>
                      </div>
                      <div className="se-casino__deltas">
                        <span>cash {signedMoney(entry.cashDeltaCents)}</span>
                        <span>wallet {signedMoney(entry.walletChipDeltaCents)}</span>
                        <span>session {signedMoney(entry.sessionChipDeltaCents)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="se-muted">No casino money has moved yet.</p>}
            </Panel>
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
