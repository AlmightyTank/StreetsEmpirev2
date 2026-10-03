import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatCents, type CasinoPageDto, type CasinoSlotSpinDto } from '@streets/shared';
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

function paylinePath(rows: number[]): string {
  const names = ['T', 'M', 'B'];
  return rows.map((row) => names[row] ?? '?').join('–');
}

export function CasinoPage() {
  const me = useSession((state) => state.me);
  const refreshSnapshot = useSession((state) => state.refreshSnapshot);
  const [data, setData] = useState<CasinoPageDto | null>(null);
  const [cashierAmount, setCashierAmount] = useState('1000');
  const [sessionAmount, setSessionAmount] = useState('1000');
  const [selectedMachineKey, setSelectedMachineKey] = useState<string | null>(null);
  const [slotBetPerLine, setSlotBetPerLine] = useState('1');
  const [selectedPaylineKeys, setSelectedPaylineKeys] = useState<string[]>([]);
  const [lastSpin, setLastSpin] = useState<CasinoSlotSpinDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const buyAction = useRef(newActionId());
  const redeemAction = useRef(newActionId());
  const openAction = useRef(newActionId());
  const closeAction = useRef(newActionId());
  const spinAction = useRef(newActionId());

  function load() {
    void casinoApi.page()
      .then((next) => { setData(next); setError(null); })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not open the casino.'));
  }

  useEffect(load, [me?.id]);

  useEffect(() => {
    if (!data?.slotMachines.length) return;
    const current = data.slotMachines.find((machine) => machine.key === selectedMachineKey);
    if (current) return;
    const next = data.slotMachines.find((machine) => machine.availableHere) ?? data.slotMachines[0]!;
    setSelectedMachineKey(next.key);
    setSlotBetPerLine(String(next.minBetPerLineCents / 100));
    setSelectedPaylineKeys(next.paylines.map((line) => line.key));
    setLastSpin(null);
    spinAction.current = newActionId();
  }, [data, selectedMachineKey]);

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

  async function spinSlots(event: FormEvent) {
    event.preventDefault();
    if (!data || !selectedMachineKey) return;
    const machine = data.slotMachines.find((candidate) => candidate.key === selectedMachineKey);
    if (!machine) return;
    const betPerLineCents = dollarsToCents(slotBetPerLine);
    if (!betPerLineCents) {
      setError('Enter a valid bet per line.');
      return;
    }
    if (!selectedPaylineKeys.length) {
      setError('Select at least one payline.');
      return;
    }

    setBusy('spin');
    setError(null);
    setNotice(null);
    const spinStartedAt = Date.now();
    try {
      const result = await casinoApi.spin({
        machineKey: machine.key,
        betPerLineCents,
        activePaylineKeys: selectedPaylineKeys,
        actionId: spinAction.current,
      });
      const remainingAnimationMs = Math.max(0, 850 - (Date.now() - spinStartedAt));
      if (remainingAnimationMs > 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, remainingAnimationMs));
      }
      setData(result.page);
      setLastSpin(result.spin);
      setNotice(
        result.spin.jackpotAwardCents > 0
          ? 'JACKPOT! ' + formatCents(result.spin.jackpotAwardCents) + ' hit the bankroll.'
          : result.spin.winningLines.length > 0
            ? result.spin.winningLines.length + ' winning line' + (result.spin.winningLines.length === 1 ? '' : 's') + ' paid ' + formatCents(result.spin.payoutCents) + '.'
            : 'No winning paylines on that spin.',
      );
      spinAction.current = newActionId();
      await refreshSnapshot({ background: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The slot machine could not complete that spin.');
    } finally {
      setBusy(null);
    }
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
            <span className="se-eyebrow">1.2.0-B · Slots</span>
            <h1>Casino</h1>
            <p>Buy chips, open a bankroll, and play server-authoritative Slots. Your browser only animates outcomes the server has already decided.</p>
          </div>
          <div className="se-casino__readout">
            <span><small>Cash here</small><strong>{data ? formatCents(data.cashCents) : '—'}</strong></span>
            <span><small>Casino value</small><strong>{data ? formatCents(data.totalCasinoValueCents) : '—'}</strong></span>
            <span><small>Boss</small><strong>{data?.currentVenue?.cityName ?? (data ? 'On the road' : '—')}</strong></span>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
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

            <Panel title="Slots" aside="Casino-style paylines">
              {data.slotMachines.length ? (
                <div className="se-slots">
                  <div className="se-slots__machines" role="group" aria-label="Slot machines">
                    {data.slotMachines.map((machine) => (
                      <button
                        key={machine.key}
                        type="button"
                        disabled={busy !== null}
                        aria-pressed={selectedMachineKey === machine.key}
                        className={'se-slots__machine' + (selectedMachineKey === machine.key ? ' is-selected' : '')}
                        onClick={() => {
                          setSelectedMachineKey(machine.key);
                          setSlotBetPerLine(String(machine.minBetPerLineCents / 100));
                          setSelectedPaylineKeys(machine.paylines.map((line) => line.key));
                          setLastSpin(null);
                          spinAction.current = newActionId();
                        }}
                      >
                        <span><strong>{machine.name}</strong>{machine.availableHere ? <small>Available here</small> : <small>Not in this room</small>}</span>
                        <small>{machine.reels}×{machine.rows} · {machine.paylines.length} lines · RTP {(machine.baseRtpBps / 100).toFixed(2)}%</small>
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const machine = data.slotMachines.find((candidate) => candidate.key === selectedMachineKey);
                    if (!machine) return null;
                    const result = lastSpin?.machineKey === machine.key ? lastSpin : null;
                    const sessionHere = Boolean(data.openSession && data.currentVenue && data.openSession.citySlug === data.currentVenue.citySlug);
                    const lineBetCents = dollarsToCents(slotBetPerLine);
                    const totalWagerCents = lineBetCents ? lineBetCents * selectedPaylineKeys.length : 0;
                    const lineBetValid = Boolean(
                      lineBetCents
                      && lineBetCents >= machine.minBetPerLineCents
                      && lineBetCents <= machine.maxBetPerLineCents
                      && lineBetCents % machine.betStepCents === 0
                    );
                    const disabledReason = !machine.availableHere
                      ? 'Travel to a casino that carries this machine.'
                      : !data.openSession
                        ? 'Open a session bankroll first.'
                        : !sessionHere
                          ? 'Your open bankroll belongs to another casino.'
                          : !selectedPaylineKeys.length
                            ? 'Select at least one payline.'
                            : !lineBetValid
                              ? 'Use one of this machine\'s posted line-bet increments.'
                              : data.openSession && totalWagerCents > data.openSession.bankrollCents
                                ? 'There are not enough credits in this bankroll for that spin.'
                                : busy !== null
                                  ? 'Another casino action is running.'
                                  : null;
                    const winningPositions = new Set(
                      result?.winningLines.flatMap((win) => win.positions.map((position) => position.reel + ':' + position.row)) ?? [],
                    );
                    const winningLineKeys = new Set(result?.winningLines.map((win) => win.paylineKey) ?? []);
                    const visibleGrid = busy === 'spin'
                      ? Array.from({ length: machine.rows }, () =>
                          Array.from({ length: machine.reels }, () => ({ key: 'SPIN', glyph: '•', label: 'spinning' })),
                        )
                      : result?.grid ?? Array.from({ length: machine.rows }, () =>
                          Array.from({ length: machine.reels }, () => ({ key: 'READY', glyph: '?', label: 'ready' })),
                        );

                    return (
                      <div className="se-slots__stage">
                        <div className="se-slots__copy">
                          <h3>{machine.name}</h3>
                          <p>{machine.blurb}</p>
                          <p className="se-hint">
                            {machine.reels} reels × {machine.rows} rows · wins run left-to-right from reel 1 · 3+ matching symbols
                          </p>
                          <p className="se-hint">
                            Line bet {formatCents(machine.minBetPerLineCents)} – {formatCents(machine.maxBetPerLineCents)}
                            {' · '}step {formatCents(machine.betStepCents)}
                            {' · '}max spin {formatCents(machine.maxTotalWagerCents)}
                          </p>
                          {machine.progressive ? (
                            <p className="se-slots__jackpot">
                              Progressive <strong>{formatCents(machine.progressive.poolCents)}</strong>
                              {' · '}qualifies at {formatCents(machine.progressive.eligibleBetPerLineCents)} per line
                              {machine.progressive.requiresAllPaylines ? ' with every line active' : ''}
                            </p>
                          ) : null}
                        </div>

                        <div className="se-slots__cabinet">
                          <div
                            className={'se-slots__reels' + (busy === 'spin' ? ' is-spinning' : '')}
                            style={{ gridTemplateColumns: `repeat(${machine.reels}, minmax(0, 1fr))` }}
                            aria-live="polite"
                            aria-label={machine.reels + ' reel by ' + machine.rows + ' row slot result'}
                          >
                            {result?.winningLines.length ? (
                              <svg
                                className="se-slots__line-overlay"
                                viewBox={`0 0 ${machine.reels * 100} ${machine.rows * 100}`}
                                preserveAspectRatio="none"
                                aria-hidden="true"
                              >
                                {result.winningLines.map((win) => {
                                  const line = machine.paylines.find((candidate) => candidate.key === win.paylineKey);
                                  if (!line) return null;
                                  const points = line.rows
                                    .map((row, reel) => (reel * 100 + 50) + ',' + (row * 100 + 50))
                                    .join(' ');
                                  return <polyline key={win.paylineKey} points={points} vectorEffect="non-scaling-stroke" />;
                                })}
                              </svg>
                            ) : null}
                            {visibleGrid.flatMap((row, rowIndex) =>
                              row.map((cell, reelIndex) => {
                                const winning = winningPositions.has(reelIndex + ':' + rowIndex);
                                return (
                                  <div
                                    key={rowIndex + '-' + reelIndex}
                                    className={'se-slots__reel' + (winning ? ' is-winning' : '')}
                                    aria-label={cell.label + (winning ? ', winning symbol' : '')}
                                  >
                                    <span>{cell.glyph}</span>
                                  </div>
                                );
                              }),
                            )}
                          </div>

                          <div className="se-slots__meter">
                            <span><small>Credits</small><strong>{data.openSession ? formatCents(data.openSession.bankrollCents) : '—'}</strong></span>
                            <span><small>Lines</small><strong>{selectedPaylineKeys.length}/{machine.paylines.length}</strong></span>
                            <span><small>Per line</small><strong>{lineBetCents ? formatCents(lineBetCents) : '—'}</strong></span>
                            <span><small>Total bet</small><strong>{totalWagerCents ? formatCents(totalWagerCents) : '—'}</strong></span>
                          </div>
                        </div>

                        <div className="se-slots__payline-panel">
                          <div className="se-slots__payline-head">
                            <div>
                              <strong>Active paylines</strong>
                              <small>Pick the exact lines you want to cover.</small>
                            </div>
                            <div className="se-slots__presets">
                              <button
                                type="button"
                                className="se-btn se-btn--ghost"
                                disabled={busy !== null}
                                onClick={() => {
                                  setSelectedPaylineKeys([machine.paylines[0]!.key]);
                                  setLastSpin(null);
                                  spinAction.current = newActionId();
                                }}
                              >
                                1 line
                              </button>
                              {machine.paylines.length >= 5 ? (
                                <button
                                  type="button"
                                  className="se-btn se-btn--ghost"
                                  disabled={busy !== null}
                                  onClick={() => {
                                    setSelectedPaylineKeys(machine.paylines.slice(0, 5).map((line) => line.key));
                                    setLastSpin(null);
                                    spinAction.current = newActionId();
                                  }}
                                >
                                  5 lines
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="se-btn se-btn--ghost"
                                disabled={busy !== null}
                                onClick={() => {
                                  setSelectedPaylineKeys(machine.paylines.map((line) => line.key));
                                  setLastSpin(null);
                                  spinAction.current = newActionId();
                                }}
                              >
                                Max lines
                              </button>
                            </div>
                          </div>
                          <div className="se-slots__paylines" role="group" aria-label="Select active paylines">
                            {machine.paylines.map((line, index) => {
                              const selected = selectedPaylineKeys.includes(line.key);
                              const won = winningLineKeys.has(line.key);
                              return (
                                <button
                                  key={line.key}
                                  type="button"
                                  disabled={busy !== null}
                                  aria-pressed={selected}
                                  className={'se-slots__payline' + (selected ? ' is-selected' : '') + (won ? ' is-winning' : '')}
                                  onClick={() => {
                                    setLastSpin(null);
                                    setSelectedPaylineKeys((current) => {
                                      if (current.includes(line.key)) {
                                        if (current.length === 1) return current;
                                        return current.filter((key) => key !== line.key);
                                      }
                                      return machine.paylines.filter((candidate) =>
                                        candidate.key === line.key || current.includes(candidate.key)
                                      ).map((candidate) => candidate.key);
                                    });
                                    spinAction.current = newActionId();
                                  }}
                                >
                                  <strong>L{index + 1}</strong>
                                  <span>{paylinePath(line.rows)}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <details className="se-slots__paytable">
                          <summary>Paytable &amp; machine info</summary>
                          <p className="se-hint">Payouts are multiples of the bet on one winning line. Only selected lines can pay.</p>
                          <div className="se-slots__paytable-grid">
                            {machine.paytable.map((entry) => (
                              <div key={entry.symbolKey} className="se-slots__paytable-row">
                                <span className="se-slots__paytable-symbol"><strong>{entry.glyph}</strong>{entry.symbolLabel}</span>
                                <span>
                                  {entry.payouts.map((payout) => (
                                    <span key={payout.matches}>{payout.matches}× = {(payout.payoutBps / 10_000).toLocaleString()}×</span>
                                  ))}
                                </span>
                              </div>
                            ))}
                          </div>
                        </details>

                        {result ? (
                          <div className="se-slots__result">
                            <Row label="Bet per line" value={formatCents(result.betPerLineCents)} />
                            <Row label="Lines played" value={String(result.activePaylineKeys.length)} />
                            <Row label="Total wager" value={'−' + formatCents(result.wagerCents)} />
                            <Row label="Payout" value={formatCents(result.payoutCents)} strong />
                            <Row label="Net" value={signedMoney(result.netCents)} />
                            <Row label="Bankroll after" value={formatCents(result.bankrollAfterCents)} />
                            {result.jackpotAwardCents > 0 ? <Row label="Progressive jackpot" value={'+' + formatCents(result.jackpotAwardCents)} strong /> : null}
                            {result.winningLines.length ? (
                              <div className="se-slots__wins" aria-label="Winning paylines">
                                {result.winningLines.map((win) => (
                                  <div key={win.paylineKey} className="se-slots__win">
                                    <strong>{win.paylineName}</strong>
                                    <span>{win.matchCount}× {win.symbolLabel}</span>
                                    <strong>{win.payoutCents > 0 ? '+' + formatCents(win.payoutCents) : 'Jackpot line'}</strong>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="se-muted">No selected payline hit.</p>}
                          </div>
                        ) : null}

                        <form className="se-casino__form se-slots__form" onSubmit={spinSlots}>
                          <label>
                            <span>Bet per line ($)</span>
                            <input
                              className="se-input"
                              inputMode="decimal"
                              value={slotBetPerLine}
                              disabled={busy !== null}
                              onChange={(event) => {
                                setSlotBetPerLine(event.target.value);
                                setLastSpin(null);
                                spinAction.current = newActionId();
                              }}
                            />
                          </label>
                          <p className="se-hint">
                            {selectedPaylineKeys.length} line{selectedPaylineKeys.length === 1 ? '' : 's'} × {lineBetCents ? formatCents(lineBetCents) : '—'}
                            {' = '}<strong>{totalWagerCents ? formatCents(totalWagerCents) : '—'} total spin</strong>
                          </p>
                          <Button className="se-btn" type="submit" disabledReason={disabledReason}>
                            {busy === 'spin' ? 'Spinning...' : 'Spin reels'}
                          </Button>
                        </form>
                      </div>
                    );
                  })()}
                </div>
              ) : <p className="se-muted">Slots are not enabled in this round.</p>}
            </Panel>

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

            <Panel title="Casino history" aside="Last 25">
              {data.recentLedger.length ? (
                <div className="se-casino__ledger">
                  {data.recentLedger.map((entry) => (
                    <article key={entry.id} className={'se-casino__ledgerrow is-' + entry.display.tone}>
                      <div className="se-casino__ledger-main">
                        <div className="se-casino__ledger-title">
                          <strong>{entry.display.title}</strong>
                          <span>{entry.venueName} · {entry.cityName}</span>
                        </div>
                        <p>{entry.display.detail}</p>
                        <time dateTime={entry.createdAt}>{formatWhen(entry.createdAt)}</time>
                      </div>
                      <div className="se-casino__ledger-amount">
                        <small>{entry.display.amountLabel}</small>
                        <strong>
                          {entry.display.tone === 'positive' ? '+' : entry.display.tone === 'negative' ? '−' : ''}
                          {formatCents(entry.display.amountCents)}
                        </strong>
                        {entry.kind === 'SLOT_SPIN' ? (
                          <span>Floor {formatCents(entry.sessionChipsAfterCents)}</span>
                        ) : entry.kind === 'BUY_CHIPS' || entry.kind === 'REDEEM_CHIPS' ? (
                          <span>Wallet {formatCents(entry.walletChipsAfterCents)}</span>
                        ) : (
                          <span>{entry.kind === 'SESSION_OPEN' ? 'Floor ' + formatCents(entry.sessionChipsAfterCents) : 'Wallet ' + formatCents(entry.walletChipsAfterCents)}</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : <p className="se-muted">Your casino history is empty. Buy chips or play a game and it will show up here.</p>}
            </Panel>
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
