import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { formatCents, type CasinoPageDto, type CasinoSlotSpinDto, type CasinoTournamentPageDto } from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { ActionDock, deltaChip } from '../components/ActionDock.js';
import { Alert } from '../components/Alert.js';
import { BlackjackPanel } from '../components/BlackjackPanel.js';
import { RoulettePanel } from '../components/RoulettePanel.js';
import { StreetDicePanel } from '../components/StreetDicePanel.js';
import { PokerPanel } from '../components/PokerPanel.js';
import { CasinoStatusPanel } from '../components/CasinoStatusPanel.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import {
  casinoSoundEnabled,
  playCasinoSound,
  setCasinoSoundEnabled,
} from '../lib/casinoAudio.js';
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type CasinoGameKey = 'slots' | 'blackjack' | 'roulette' | 'street-dice' | 'poker';

const CASINO_GAMES: readonly {
  key: CasinoGameKey;
  label: string;
  icon: string;
  status: string;
  live: boolean;
  title: string;
  description: string;
}[] = [
  {
    key: 'slots',
    label: 'Slots',
    icon: '🎰',
    status: 'LIVE',
    live: true,
    title: 'Slots',
    description: 'Three machines with paylines, free spins and the Empire progressive.',
  },
  {
    key: 'blackjack',
    label: 'Blackjack',
    icon: '♠',
    status: 'LIVE',
    live: true,
    title: 'Blackjack',
    description: 'Casino blackjack with table limits, splits and doubles.',
  },
  {
    key: 'roulette',
    label: 'Roulette',
    icon: '◉',
    status: 'LIVE',
    live: true,
    title: 'Roulette',
    description: 'American and European roulette with straight-up, inside-combination and outside bets.',
  },
  {
    key: 'street-dice',
    label: 'Street Dice',
    icon: '⚄',
    status: 'LIVE',
    live: true,
    title: 'Street Dice',
    description: 'Pass-line street craps with persistent points and true-odds backing.',
  },
  {
    key: 'poker',
    label: 'Poker',
    icon: '♣',
    status: 'SOLO',
    live: true,
    title: 'Solo Poker',
    description: 'Texas Hold’em against two house players. Multiplayer tables are planned for a later slice.',
  },
];

function CasinoGamePlaceholder({
  icon,
  title,
  status,
  description,
}: {
  icon: string;
  title: string;
  status: string;
  description: string;
}) {
  return (
    <Panel title={title} aside={status}>
      <div className="se-casino-placeholder">
        <div className="se-casino-placeholder__mark" aria-hidden="true">{icon}</div>
        <div className="se-casino-placeholder__copy">
          <span className="se-eyebrow">Reserved casino room</span>
          <h3>{title} is coming soon</h3>
          <p>{description}</p>
          <div className="se-casino-placeholder__features" aria-label={title + ' placeholder features'}>
            <span>Shared bankroll</span>
            <span>Server-authoritative play</span>
            <span>Casino history</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TournamentBoard() {
  const [board, setBoard] = useState<CasinoTournamentPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let active = true;
    setRefreshing(true);
    setError(null);
    void casinoApi.tournaments().then((next) => {
      if (active) setBoard(next);
    }).catch(() => {
      if (active) setError('Tournament standings are temporarily unavailable.');
    }).finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, [refreshKey]);

  if (board && !board.available) return null;
  const signed = (amount: number) => (amount > 0 ? '+' : amount < 0 ? '−' : '') + formatCents(Math.abs(amount));
  const recordValue = (key: string, value: number) => {
    if (key === 'best_return') return `${(value / 100).toFixed(2)}%`;
    if (key === 'biggest_cashout') return signed(value);
    return String(value);
  };

  return (
    <Panel title="Weekly Poker Circuit" aside="1.2.0-G">
      <div className="se-casino-tournament">
        <p className="se-muted">Every table starts with the same buy-in for every seat. Weekly standings compare each player’s net result with their total buy-ins, so larger stakes do not automatically score higher. The board adds no prize; table buy-ins and poker winnings still use your casino bankroll.</p>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {board ? (
          <>
            <div className="se-casino-tournament__meta">
              <span>Week of {new Date(board.weekStartsAt).toLocaleDateString()}</span>
              <span>Your completed tables this season: <strong>{board.yourEntries}</strong></span>
              <button className="se-btn se-btn--small" type="button" disabled={refreshing} onClick={() => setRefreshKey((value) => value + 1)}>
                {refreshing ? 'Refreshing…' : 'Refresh standings'}
              </button>
            </div>
            {board.standings.length ? (
              <div className="se-casino-tournament__table-wrap">
                <table className="se-table se-casino-tournament__table">
                  <thead><tr><th scope="col">Place</th><th scope="col">Player</th><th scope="col">Tables</th><th scope="col">Buy-ins</th><th scope="col">Net</th><th scope="col">Return</th></tr></thead>
                  <tbody>{board.standings.map((row) => (
                    <tr className={row.isYou ? 'is-you' : undefined} key={`${row.place}-${row.displayName}`}>
                      <td>{row.place}</td><td>{row.displayName}</td><td>{row.entries}</td><td>{formatCents(row.buyInCents)}</td>
                      <td className={row.netCents >= 0 ? 'text-success' : 'text-danger'}>{signed(row.netCents)}</td><td>{(row.returnBps / 100).toFixed(2)}%</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="se-muted">Completed multiplayer tables will appear here. Your results update when you leave a table.</p>}
            <div className="se-casino-tournament__records" aria-label="Season casino records">
              {board.records.map((row) => (
                <article className="se-casino-tournament__record" key={row.key}>
                  <span className="se-eyebrow">{row.label}</span>
                  <strong>{row.displayName ?? 'No record yet'}</strong>
                  <span>{row.displayName ? recordValue(row.key, row.value) : row.detail}</span>
                </article>
              ))}
            </div>
          </>
        ) : !error ? <p className="se-muted" role="status">Loading the weekly board…</p> : null}
      </div>
    </Panel>
  );
}

export function CasinoPage() {
  const { game: routeGame } = useParams<{ game: string }>();
  const activeGame = CASINO_GAMES.some((game) => game.key === routeGame) ? routeGame as CasinoGameKey : null;
  const me = useSession((state) => state.me);
  const refreshSnapshot = useSession((state) => state.refreshSnapshot);
  const [data, setData] = useState<CasinoPageDto | null>(null);
  const [cashierAmount, setCashierAmount] = useState('1000');
  const [sessionAmount, setSessionAmount] = useState('1000');
  const [selectedMachineKey, setSelectedMachineKey] = useState<string | null>(null);
  const [slotBetPerLine, setSlotBetPerLine] = useState('1');
  const [selectedPaylineKeys, setSelectedPaylineKeys] = useState<string[]>([]);
  const [lastSpin, setLastSpin] = useState<CasinoSlotSpinDto | null>(null);
  const [revealedReels, setRevealedReels] = useState(99);
  const [displayedWinCents, setDisplayedWinCents] = useState(0);
  const [displayedCreditsCents, setDisplayedCreditsCents] = useState<number | null>(null);
  const [activeWinLineIndex, setActiveWinLineIndex] = useState(0);
  const [bonusFlash, setBonusFlash] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabledState] = useState(() => casinoSoundEnabled());
  const [reducedMotion, setReducedMotion] = useState(false);
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
      .then((next) => {
        setData(next);
        setDisplayedCreditsCents(next.openSession?.bankrollCents ?? null);
        setError(null);
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not open the casino.'));
  }

  useEffect(load, [me?.id]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!data?.slotMachines.length) return;
    const bonus = data.freeSpinBonus;
    if (bonus) {
      if (selectedMachineKey !== bonus.machineKey) {
        setSelectedMachineKey(bonus.machineKey);
        setSlotBetPerLine(String(bonus.betPerLineCents / 100));
        setSelectedPaylineKeys([...bonus.activePaylineKeys]);
        setLastSpin(null);
        setDisplayedWinCents(0);
        spinAction.current = newActionId();
      }
      return;
    }
    const current = data.slotMachines.find((machine) => machine.key === selectedMachineKey);
    if (current) return;
    const next = data.slotMachines.find((machine) => machine.availableHere) ?? data.slotMachines[0]!;
    setSelectedMachineKey(next.key);
    setSlotBetPerLine(String(next.minBetPerLineCents / 100));
    setSelectedPaylineKeys(next.paylines.map((line) => line.key));
    setLastSpin(null);
    setDisplayedWinCents(0);
    spinAction.current = newActionId();
  }, [data, selectedMachineKey]);

  useEffect(() => {
    if (!lastSpin?.winningLines.length) {
      setActiveWinLineIndex(0);
      return;
    }
    setActiveWinLineIndex(0);
    if (reducedMotion || lastSpin.winningLines.length === 1) return;
    const timer = window.setInterval(() => {
      setActiveWinLineIndex((current) => (current + 1) % lastSpin.winningLines.length);
    }, 700);
    return () => window.clearInterval(timer);
  }, [lastSpin?.actionId, lastSpin?.winningLines.length, reducedMotion]);

  async function run(key: string, work: () => Promise<CasinoPageDto>, success: string): Promise<boolean> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const next = await work();
      setData(next);
      setDisplayedCreditsCents(next.openSession?.bankrollCents ?? null);
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

  /**
   * Cash to a playable bankroll in one press: buy whatever chips are missing at
   * this cage (no fee, 1:1), then open the session for the bankroll amount.
   */
  async function quickStart() {
    if (!data?.currentVenue) return;
    const amountCents = dollarsToCents(sessionAmount);
    if (!amountCents) {
      setError('Enter a bankroll amount, such as 1000.');
      return;
    }
    const missing = amountCents - data.currentVenue.walletChipsCents;
    if (missing > 0) {
      const buyCents = Math.max(missing, data.limits?.cashierMinCents ?? 0);
      const bought = await run('buy', () => casinoApi.buy({ amountCents: buyCents, actionId: buyAction.current }), 'Chips are waiting at the cage.');
      if (!bought) return;
      buyAction.current = newActionId();
    }
    const opened = await run('open', () => casinoApi.openSession({ amountCents, actionId: openAction.current }), formatCents(amountCents) + ' is on the floor. Pick a game.');
    if (opened) openAction.current = newActionId();
  }

  async function spinSlots(event: FormEvent) {
    event.preventDefault();
    if (!data || !selectedMachineKey) return;
    const machine = data.slotMachines.find((candidate) => candidate.key === selectedMachineKey);
    if (!machine) return;
    const bonus = data.freeSpinBonus;
    const useFreeSpin = Boolean(bonus && bonus.machineKey === machine.key);
    const betPerLineCents = useFreeSpin ? bonus!.betPerLineCents : dollarsToCents(slotBetPerLine);
    const activePaylineKeys = useFreeSpin ? bonus!.activePaylineKeys : selectedPaylineKeys;

    if (!betPerLineCents) {
      setError('Enter a valid bet per line.');
      return;
    }
    if (!activePaylineKeys.length) {
      setError('Select at least one payline.');
      return;
    }

    setBusy('spin');
    setError(null);
    setNotice(null);
    setBonusFlash(null);
    setLastSpin(null);
    setRevealedReels(0);
    setDisplayedWinCents(0);
    setDisplayedCreditsCents(data.openSession?.bankrollCents ?? null);
    playCasinoSound('SPIN', soundEnabled);

    try {
      const result = await casinoApi.spin({
        machineKey: machine.key,
        betPerLineCents,
        activePaylineKeys,
        useFreeSpin,
        actionId: spinAction.current,
      });
      setLastSpin(result.spin);

      if (reducedMotion) {
        setRevealedReels(machine.reels);
      } else {
        const reelDelay = machine.reels === 3 ? 250 : machine.reels === 4 ? 225 : 205;
        for (let reel = 0; reel < machine.reels; reel++) {
          if (result.spin.nearMiss?.reel === reel) {
            playCasinoSound('ANTICIPATION', soundEnabled);
            await wait(520);
          }
          await wait(reelDelay);
          setRevealedReels(reel + 1);
          playCasinoSound('REEL_STOP', soundEnabled, reel);
        }
      }

      setData(result.page);

      if (result.spin.freeSpinsAwarded > 0) {
        setBonusFlash(result.spin.freeSpinsAwarded);
        playCasinoSound('FREE_SPINS', soundEnabled);
        if (!reducedMotion) await wait(650);
        setBonusFlash(null);
      }

      const creditsBeforePayout = result.spin.bankrollAfterCents - result.spin.payoutCents;
      if (result.spin.payoutCents > 0) {
        const sound = result.spin.winTier === 'JACKPOT'
          ? 'JACKPOT'
          : result.spin.winTier === 'MEGA'
            ? 'MEGA_WIN'
            : result.spin.winTier === 'BIG'
              ? 'BIG_WIN'
              : 'SMALL_WIN';
        playCasinoSound(sound, soundEnabled);
        if (reducedMotion) {
          setDisplayedWinCents(result.spin.payoutCents);
          setDisplayedCreditsCents(result.spin.bankrollAfterCents);
        } else {
          const duration = result.spin.winTier === 'JACKPOT' ? 1_600 : result.spin.winTier === 'MEGA' ? 1_250 : 850;
          const steps = 28;
          for (let step = 1; step <= steps; step++) {
            await wait(duration / steps);
            const progress = step / steps;
            setDisplayedWinCents(Math.round(result.spin.payoutCents * progress));
            setDisplayedCreditsCents(Math.round(creditsBeforePayout + result.spin.payoutCents * progress));
          }
        }
      } else {
        setDisplayedCreditsCents(result.spin.bankrollAfterCents);
      }

      spinAction.current = newActionId();
      await refreshSnapshot({ background: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The slot machine could not complete that spin.');
      setRevealedReels(99);
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

  if (routeGame && !activeGame) return <Navigate to="/game/casino" replace />;
  const activeInfo = activeGame ? CASINO_GAMES.find((game) => game.key === activeGame)! : null;
  const venue = data?.currentVenue ?? null;
  const session = data?.openSession ?? null;
  const floorCents = session ? (displayedCreditsCents ?? session.bankrollCents) : null;

  return (
    <GameLayout>
      <div className={'se-casino' + (activeGame ? ' se-casino--table' : ' se-casino--lobby')}>
        {activeInfo ? (
          <header className="se-casino-tablehead">
            <Link className="se-casino-tablehead__back" to="/game/casino">&larr; Lobby</Link>
            <div className="se-casino-tablehead__title">
              <span className="se-eyebrow">{venue ? venue.name + ' · ' + venue.cityName : 'Casino floor'}</span>
              <h1>{activeInfo.title}</h1>
            </div>
            <nav className="se-casino-switch" aria-label="Switch game">
              {CASINO_GAMES.map((game) => (
                <Link
                  key={game.key}
                  to={'/game/casino/' + game.key}
                  aria-current={activeGame === game.key ? 'page' : undefined}
                  title={game.label}
                  className={'se-casino-switch__game' + (activeGame === game.key ? ' is-active' : '')}
                >
                  <span aria-hidden="true">{game.icon}</span>
                  <small>{game.label}</small>
                </Link>
              ))}
            </nav>
          </header>
        ) : (
          <header className="se-casino-lobbyhead">
            <span className="se-eyebrow">Casino · {venue ? venue.cityName : 'No casino in reach'}</span>
            <h1>{venue ? venue.name : 'No casino in reach'}</h1>
            <p>{venue ? venue.blurb : 'The boss has to be standing in a casino city to buy chips or play. Pick a destination below and travel there.'}</p>
          </header>
        )}

        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}
        {!data ? <p className="se-muted">Checking the cage...</p> : null}

        {data && !data.enabled ? (
          <Panel title="Casino closed"><p className="se-muted">This round predates the 1.2 casino ruleset.</p></Panel>
        ) : null}

        {data?.enabled ? (
          <>
            <section className="se-casino-wallet" aria-label="Casino wallet">
              <dl className="se-casino-wallet__stats">
                <div>
                  <dt>Cash here</dt>
                  <dd>{formatCents(data.cashCents)}</dd>
                </div>
                <div>
                  <dt>Chips at the cage</dt>
                  <dd>{venue ? formatCents(venue.walletChipsCents) : '—'}</dd>
                </div>
                <div className={session ? 'is-live' : undefined}>
                  <dt>On the floor</dt>
                  <dd>{floorCents !== null ? formatCents(floorCents) : 'No session'}</dd>
                </div>
              </dl>

              <div className="se-casino-wallet__actions">
                {!venue && !session ? (
                  <Link className="se-btn se-btn--primary" to="/game/travel">Travel to a casino</Link>
                ) : session ? (
                  <Button className="se-btn" type="button" disabled={busy !== null} onClick={() => void closeSession()}>
                    {busy === 'close' ? 'Cashing out...' : 'Cash out session'}
                  </Button>
                ) : (
                  <form className="se-casino-wallet__start" onSubmit={(event) => { event.preventDefault(); void quickStart(); }}>
                    <label className="se-casino-wallet__amount">
                      <span aria-hidden="true">$</span>
                      <input
                        className="se-input"
                        inputMode="decimal"
                        aria-label="Bankroll in dollars"
                        value={sessionAmount}
                        onChange={(event) => {
                          setSessionAmount(event.target.value);
                          openAction.current = newActionId();
                          buyAction.current = newActionId();
                        }}
                      />
                    </label>
                    <Button className="se-btn se-btn--primary" type="submit" disabledReason={busy !== null ? 'Another casino action is running.' : null}>
                      {busy === 'buy' ? 'Buying chips...' : busy === 'open' ? 'Opening...' : 'Get on the floor'}
                    </Button>
                  </form>
                )}
                {venue ? (
                  <details className="se-casino-wallet__cashier">
                    <summary>Cashier</summary>
                    <form className="se-casino__form" onSubmit={submitBuy}>
                      <label>
                        <span>Exchange amount ($)</span>
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
                      {data.limits ? (
                        <p className="se-hint">
                          Cage {formatCents(data.limits.cashierMinCents)} – {formatCents(data.limits.cashierMaxCents)} · sessions {formatCents(data.limits.sessionMinCents)} – {formatCents(data.limits.sessionMaxCents)}.
                          {session ? ' Cashing out returns the floor bankroll to ' + session.cityName + '’s chips.' : ' Get on the floor buys only the chips you are missing.'}
                        </p>
                      ) : null}
                    </form>
                  </details>
                ) : null}
              </div>
              {session && (!venue || session.venueName !== venue.name) ? (
                <p className="se-hint se-casino-wallet__note">Your open session is at {session.venueName}, {session.cityName}.</p>
              ) : null}
            </section>

            {!activeGame ? (
              <>
                <section className="se-casino-lobby" aria-label="Casino games">
                  {CASINO_GAMES.map((game) => (
                    <Link key={game.key} to={'/game/casino/' + game.key} className={'se-casino-gamecard se-casino-gamecard--' + game.key}>
                      <span className="se-casino-gamecard__icon" aria-hidden="true">{game.icon}</span>
                      <span className="se-casino-gamecard__copy">
                        <strong>{game.title}</strong>
                        <small>{game.description}</small>
                      </span>
                      <span className="se-casino-gamecard__meta">
                        {game.key === 'slots' && data.freeSpinBonus ? (
                          <em className="se-casino-gamecard__badge">Free spins waiting</em>
                        ) : (
                          <em className={'se-casino-gamecard__status' + (game.live ? ' is-live' : '')}>{game.status}</em>
                        )}
                        <span className="se-casino-gamecard__play">Play &rarr;</span>
                      </span>
                    </Link>
                  ))}
                </section>

                <CasinoStatusPanel
                  page={data}
                  busy={busy !== null}
                  onPage={async (next, success) => {
                    setData(next);
                    setDisplayedCreditsCents(next.openSession?.bankrollCents ?? null);
                    setError(null);
                    setNotice(success);
                    await refreshSnapshot({ background: false });
                  }}
                  onError={(message) => {
                    setNotice(null);
                    setError(message);
                  }}
                />

                <TournamentBoard />

            <Panel title="Casino destinations" aside={String(data.venues.length) + ' cities'}>
              <div className="se-casino__venues">
                {data.venues.map((venue) => (
                  <article
                    key={venue.citySlug}
                    className={'se-casino__venue' + (venue.here ? ' is-here' : '') + (venue.identity ? ' se-casino__venue--' + venue.identity.accent.toLowerCase() : '')}
                  >
                    <span className="se-eyebrow">{venue.cityName}{venue.here ? ' · you are here' : ''}{data.status?.homeRoomCitySlug === venue.citySlug ? ' · your room' : ''}</span>
                    <h3>{venue.name}</h3>
                    <p>{venue.identity?.tagline ?? venue.blurb}</p>
                    {venue.vipRoom ? <small className="se-casino__venue-vip">VIP: {venue.vipRoom.name} · {venue.vipRoom.minTierName}+</small> : null}
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
                        {entry.kind === 'SLOT_SPIN' || entry.kind === 'BLACKJACK' || entry.kind === 'ROULETTE' || entry.kind === 'STREET_DICE' ? (
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
            ) : (
            <section className="se-casino-floor se-casino-table" aria-label={activeInfo!.title}>
              <div className="se-casino-game-stage" id={'casino-game-panel-' + activeGame}>
                {activeGame === 'slots' ? (
            <Panel title="Slots" aside="Casino-style paylines">
              {data.slotMachines.length ? (
                <div className="se-slots">
                  <div className="se-casino-picker" role="group" aria-label="Slot machines">
                    {data.slotMachines.map((machine) => (
                      <button
                        key={machine.key}
                        type="button"
                        disabled={busy !== null || data.freeSpinBonus !== null}
                        aria-pressed={selectedMachineKey === machine.key}
                        className={'se-casino-picker__opt' + (selectedMachineKey === machine.key ? ' is-selected' : '') + (machine.availableHere ? '' : ' is-away')}
                        title={machine.availableHere ? undefined : 'Not in this room'}
                        onClick={() => {
                          setSelectedMachineKey(machine.key);
                          setSlotBetPerLine(String(machine.minBetPerLineCents / 100));
                          setSelectedPaylineKeys(machine.paylines.map((line) => line.key));
                          setLastSpin(null);
                          setDisplayedWinCents(0);
                          spinAction.current = newActionId();
                        }}
                      >
                        <strong>{machine.name}</strong>
                        <small>{machine.reels}×{machine.rows} · {machine.paylines.length} lines{machine.availableHere ? '' : ' · not here'}</small>
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const machine = data.slotMachines.find((candidate) => candidate.key === selectedMachineKey);
                    if (!machine) return null;
                    const result = lastSpin?.machineKey === machine.key ? lastSpin : null;
                    const bonus = data.freeSpinBonus;
                    const bonusActive = Boolean(bonus && bonus.machineKey === machine.key);
                    const selectedLines = bonusActive ? bonus!.activePaylineKeys : selectedPaylineKeys;
                    const lineBetCents = bonusActive ? bonus!.betPerLineCents : dollarsToCents(slotBetPerLine);
                    const totalWagerCents = lineBetCents ? lineBetCents * selectedLines.length : 0;
                    const sessionHere = Boolean(data.openSession && data.currentVenue && data.openSession.citySlug === data.currentVenue.citySlug);
                    const bonusHere = !bonusActive || data.currentVenue?.citySlug === bonus!.citySlug;
                    const lineBetValid = Boolean(
                      lineBetCents
                      && lineBetCents >= machine.minBetPerLineCents
                      && lineBetCents <= machine.maxBetPerLineCents
                      && lineBetCents % machine.betStepCents === 0
                    );
                    const disabledReason = !machine.availableHere
                      ? 'Travel to a casino that carries this machine.'
                      : !bonusHere
                        ? 'Return to ' + bonus!.cityName + ' to use these free spins.'
                        : !data.openSession
                          ? 'Open a session bankroll first.'
                          : !sessionHere
                            ? 'Your open bankroll belongs to another casino.'
                            : !selectedLines.length
                              ? 'Select at least one payline.'
                              : !lineBetValid
                                ? 'Use one of this machine\'s posted line-bet increments.'
                                : !bonusActive && data.openSession && totalWagerCents > data.openSession.bankrollCents
                                  ? 'There are not enough credits in this bankroll for that spin.'
                                  : busy !== null
                                    ? 'Another casino action is running.'
                                    : null;

                    const outcomeVisible = Boolean(result && revealedReels >= machine.reels);
                    const currentWin = outcomeVisible && result?.winningLines.length
                      ? result.winningLines[activeWinLineIndex % result.winningLines.length]!
                      : null;
                    const winningPositions = new Set(
                      currentWin?.positions.map((position) => position.reel + ':' + position.row) ?? [],
                    );
                    const winningLineKeys = new Set(outcomeVisible ? result?.winningLines.map((win) => win.paylineKey) ?? [] : []);
                    const activeWinKey = currentWin?.paylineKey ?? null;
                    const baseGrid = result?.grid ?? Array.from({ length: machine.rows }, () =>
                      Array.from({ length: machine.reels }, () => ({ key: 'READY', glyph: '?', label: 'ready' })),
                    );
                    const cabinetTone = machine.key.toLowerCase().replaceAll('_', '-');

                    const setLineBet = (nextCents: number) => {
                      const bounded = Math.max(machine.minBetPerLineCents, Math.min(machine.maxBetPerLineCents, nextCents));
                      setSlotBetPerLine(String(bounded / 100));
                      setLastSpin(null);
                      setDisplayedWinCents(0);
                      spinAction.current = newActionId();
                    };
                    const setPaylines = (nextKeys: string[]) => {
                      setSelectedPaylineKeys(nextKeys);
                      setLastSpin(null);
                      setDisplayedWinCents(0);
                      spinAction.current = newActionId();
                    };
                    const setPaylineCount = (nextCount: number) => {
                      const bounded = Math.max(1, Math.min(machine.paylines.length, nextCount));
                      setPaylines(machine.paylines.slice(0, bounded).map((line) => line.key));
                    };

                    return (
                      <div className={'se-slots__stage se-slots__stage--' + cabinetTone}>
                        <div className="se-slots__copy">
                          <div className="se-slots__title-row">
                            <div>
                              <h3>{machine.name}</h3>
                              <p>{machine.blurb}</p>
                            </div>
                            <button
                              type="button"
                              className="se-btn se-btn--ghost se-slots__sound"
                              aria-pressed={soundEnabled}
                              onClick={() => {
                                const next = !soundEnabled;
                                setSoundEnabledState(next);
                                setCasinoSoundEnabled(next);
                                if (next) playCasinoSound('REEL_STOP', true);
                              }}
                            >
                              {soundEnabled ? 'Sound on' : 'Muted'}
                            </button>
                          </div>
                          <details className="se-slots__rules">
                            <summary>How it pays</summary>
                            <p className="se-hint">
                              {machine.reels} reels × {machine.rows} rows · wins run left-to-right from reel 1 · 3+ matching symbols
                            </p>
                            <p className="se-hint">
                              Line bet {formatCents(machine.minBetPerLineCents)} – {formatCents(machine.maxBetPerLineCents)}
                              {' · '}step {formatCents(machine.betStepCents)}
                              {' · '}free-spin feature included
                            </p>
                            {machine.freeSpins ? (
                              <p className="se-hint">
                                Paid spins can randomly award {machine.freeSpins.possibleAwards.join('/')} free spins. The machine, lines and line bet stay locked for the bonus.
                              </p>
                            ) : null}
                          </details>
                          {machine.progressive ? (
                            <p className="se-slots__jackpot">
                              Progressive <strong>{formatCents(machine.progressive.poolCents)}</strong>
                              {' · '}qualifies at {formatCents(machine.progressive.eligibleBetPerLineCents)} per line
                              {machine.progressive.requiresAllPaylines ? ' with every line active' : ''}
                            </p>
                          ) : null}
                        </div>

                        {bonusActive ? (
                          <div className="se-slots__bonus-banner" role="status">
                            <span>{bonus!.presentationLabel}</span>
                            <strong>{bonus!.remainingSpins} FREE SPIN{bonus!.remainingSpins === 1 ? '' : 'S'} LEFT</strong>
                            <small>
                              {bonus!.activePaylineKeys.length} lines × {formatCents(bonus!.betPerLineCents)}
                              {' · '}casino covers {formatCents(bonus!.activePaylineKeys.length * bonus!.betPerLineCents)} each spin
                            </small>
                          </div>
                        ) : null}

                        <div
                          className={'se-slots__cabinet is-' + cabinetTone + (outcomeVisible && result ? ' is-' + result.winTier.toLowerCase() : '')}
                          style={{ '--se-slot-reels': machine.reels } as CSSProperties}
                        >
                          <div className="se-slots__cabinet-marquee">
                            <span className="se-slots__cabinet-brand">STREETS <strong>EMPIRE</strong></span>
                            <strong className="se-slots__cabinet-name">{machine.name}</strong>
                            <span className="se-slots__cabinet-prize">
                              {machine.progressive
                                ? 'JACKPOT ' + formatCents(machine.progressive.poolCents)
                                : 'LUCKY 7S · GOOD FORTUNE'}
                            </span>
                          </div>
                          <div
                            className={'se-slots__reels' + (busy === 'spin' ? ' is-spinning' : '')}
                            style={{ gridTemplateColumns: `repeat(${machine.reels}, minmax(0, 1fr))` }}
                            aria-live="polite"
                            aria-label={machine.reels + ' reel by ' + machine.rows + ' row slot result'}
                          >
                            {currentWin ? (
                              <svg
                                className="se-slots__line-overlay"
                                viewBox={`0 0 ${machine.reels * 100} ${machine.rows * 100}`}
                                preserveAspectRatio="none"
                                aria-hidden="true"
                              >
                                {(() => {
                                  const line = machine.paylines.find((candidate) => candidate.key === currentWin.paylineKey);
                                  if (!line) return null;
                                  const points = line.rows
                                    .map((row, reel) => (reel * 100 + 50) + ',' + (row * 100 + 50))
                                    .join(' ');
                                  return <polyline points={points} vectorEffect="non-scaling-stroke" />;
                                })()}
                              </svg>
                            ) : null}

                            {baseGrid.flatMap((row, rowIndex) =>
                              row.map((cell, reelIndex) => {
                                const reelSpinning = busy === 'spin' && reelIndex >= revealedReels;
                                const winning = outcomeVisible && winningPositions.has(reelIndex + ':' + rowIndex);
                                const anticipating = reelSpinning && result?.nearMiss?.reel === reelIndex;
                                const strip = machine.reelStrips[reelIndex] ?? [];
                                const preview = strip.length
                                  ? Array.from({ length: 7 }, (_, index) => strip[(index * 7 + rowIndex * 3 + reelIndex) % strip.length]!)
                                  : [];
                                return (
                                  <div
                                    key={rowIndex + '-' + reelIndex}
                                    className={
                                      'se-slots__reel'
                                      + (reelSpinning ? ' is-spinning-cell' : '')
                                      + (winning ? ' is-winning' : '')
                                      + (anticipating ? ' is-anticipating' : '')
                                    }
                                    aria-label={reelSpinning ? 'reel spinning' : cell.label + (winning ? ', winning symbol' : '')}
                                  >
                                    {reelSpinning ? (
                                      <div className="se-slots__strip-track" aria-hidden="true">
                                        {preview.map((symbol, index) => <span key={index}>{symbol.glyph}</span>)}
                                      </div>
                                    ) : <span>{cell.glyph}</span>}
                                  </div>
                                );
                              }),
                            )}

                            {bonusFlash ? (
                              <div className="se-slots__bonus-award" role="status">
                                <strong>{bonusFlash} FREE SPIN{bonusFlash === 1 ? '' : 'S'}!</strong>
                                <span>Same bet. Same lines. On the house.</span>
                              </div>
                            ) : null}

                            {outcomeVisible && result?.winTier !== 'NONE' ? (
                              <div className={'se-slots__win-flash is-' + result!.winTier.toLowerCase()} aria-hidden="true">
                                {result!.winTier === 'JACKPOT' ? 'JACKPOT' : result!.winTier === 'MEGA' ? 'MEGA WIN' : result!.winTier === 'BIG' ? 'BIG WIN' : 'WIN'}
                              </div>
                            ) : null}
                          </div>
                          <div className="se-slots__cabinet-footer">
                            <span>CHERRY</span><span>BAR</span><strong>7</strong><span>BAR</span><span>CHERRY</span>
                          </div>
                        </div>

                        <ActionDock
                          label="Spin the slot"
                          onSubmit={spinSlots}
                          outcome={result && outcomeVisible ? {
                            id: result.actionId,
                            title: result.jackpotAwardCents > 0
                              ? 'Jackpot ' + formatCents(result.jackpotAwardCents)
                              : result.payoutCents > 0
                                ? 'Won ' + formatCents(result.payoutCents)
                                : result.freeSpinsAwarded > 0
                                  ? result.freeSpinsAwarded + ' free spin' + (result.freeSpinsAwarded === 1 ? '' : 's')
                                  : result.nearMiss ? 'So close' : 'No win',
                            tone: result.payoutCents > 0 || result.freeSpinsAwarded > 0 ? 'good' : 'bad',
                            chips: [
                              result.isFreeSpin
                                ? { key: 'stake', label: 'Free spin', text: result.freeSpinsRemainingAfter + ' left', tone: 'muted' as const }
                                : deltaChip('Stake', -result.chargedWagerCents, { money: true }),
                              ...(result.payoutCents > 0 ? [deltaChip('Paid', result.payoutCents, { money: true })] : []),
                              ...(result.winningLines.length ? [{ key: 'lines', label: 'Lines hit', text: String(result.winningLines.length), tone: 'good' as const }] : []),
                              ...(result.freeSpinsAwarded > 0 ? [deltaChip('Free spins', result.freeSpinsAwarded)] : []),
                              ...(result.nearMiss && result.payoutCents === 0 ? [{ key: 'near', label: 'Near miss', text: result.nearMiss.symbolLabel, tone: 'muted' as const }] : []),
                              { key: 'floor', label: 'Floor', text: formatCents(result.bankrollAfterCents), tone: 'muted' as const },
                            ],
                            receipt: (
                              <div className="se-rows">
                                <div className="se-row"><span className="se-row__label">Spin</span><span className="se-row__value">{result.activePaylineKeys.length} lines × {formatCents(result.betPerLineCents)}{result.isFreeSpin ? ' · free' : ''}</span></div>
                                {result.winningLines.map((win) => (
                                  <div className="se-row" key={win.paylineKey}>
                                    <span className="se-row__label">{win.paylineName} · {win.matchCount}× {win.symbolLabel}</span>
                                    <span className="se-row__value se-good">+{formatCents(win.payoutCents)}</span>
                                  </div>
                                ))}
                                {result.jackpotAwardCents > 0 ? <div className="se-row"><span className="se-row__label">Progressive jackpot</span><span className="se-row__value se-good">+{formatCents(result.jackpotAwardCents)}</span></div> : null}
                                {result.nearMiss ? <div className="se-row"><span className="se-row__label">Near miss</span><span className="se-row__value">{result.nearMiss.symbolLabel} one stop off the line</span></div> : null}
                                <div className="se-row se-row--strong"><span className="se-row__label">Net</span><span className={'se-row__value ' + (result.netCents >= 0 ? 'se-good' : 'se-bad')}>{result.netCents >= 0 ? '+' : '−'}{formatCents(Math.abs(result.netCents))}</span></div>
                                <div className="se-row"><span className="se-row__label">Floor bankroll</span><span className="se-row__value">{formatCents(result.bankrollAfterCents)}</span></div>
                              </div>
                            ),
                            onDismiss: () => {
                              setLastSpin(null);
                              setDisplayedWinCents(0);
                            },
                          } : null}
                        >
                          <div>
                            <span className="se-dock__label">{bonusActive ? 'Free spins · ' + bonus!.remainingSpins + ' left' : machine.name}</span>
                            <strong>
                              {selectedLines.length} line{selectedLines.length === 1 ? '' : 's'} × {lineBetCents ? formatCents(lineBetCents) : '—'}
                              {' = '}{totalWagerCents ? formatCents(totalWagerCents) : '—'}
                            </strong>
                            <span>{bonusActive ? 'The casino covers this spin' : data.openSession ? 'Floor ' + formatCents(displayedCreditsCents ?? data.openSession.bankrollCents) : 'No session open'}</span>
                          </div>
                          <div className="se-dock__amount se-slots__dock-bet" role="group" aria-label="Bet per line">
                            <label htmlFor="slot-line-bet">Bet/line</label>
                            <button
                              type="button"
                              className="se-btn se-btn--sm"
                              disabled={busy !== null || bonusActive}
                              aria-label="Decrease bet per line"
                              onClick={() => setLineBet((lineBetCents ?? machine.minBetPerLineCents) - machine.betStepCents)}
                            >−</button>
                            <input
                              id="slot-line-bet"
                              className="se-input"
                              inputMode="decimal"
                              value={bonusActive ? String(bonus!.betPerLineCents / 100) : slotBetPerLine}
                              disabled={busy !== null || bonusActive}
                              onChange={(event) => {
                                setSlotBetPerLine(event.target.value);
                                setLastSpin(null);
                                setDisplayedWinCents(0);
                                spinAction.current = newActionId();
                              }}
                            />
                            <button
                              type="button"
                              className="se-btn se-btn--sm"
                              disabled={busy !== null || bonusActive}
                              aria-label="Increase bet per line"
                              onClick={() => setLineBet((lineBetCents ?? machine.minBetPerLineCents) + machine.betStepCents)}
                            >+</button>
                            <button
                              type="button"
                              className="se-btn se-btn--sm"
                              disabled={busy !== null || bonusActive}
                              onClick={() => {
                                setLineBet(machine.maxBetPerLineCents);
                                setPaylines(machine.paylines.map((line) => line.key));
                              }}
                            >Max</button>
                          </div>
                          <div className="se-dock__amount se-slots__dock-lines" role="group" aria-label="Active paylines">
                            <button
                              type="button"
                              className="se-btn se-btn--sm"
                              disabled={busy !== null || bonusActive || selectedLines.length <= 1}
                              aria-label="Fewer paylines"
                              onClick={() => setPaylineCount(selectedLines.length - 1)}
                            >−</button>
                            <span className="se-slots__dock-count"><strong>{selectedLines.length}</strong> line{selectedLines.length === 1 ? '' : 's'}</span>
                            <button
                              type="button"
                              className="se-btn se-btn--sm"
                              disabled={busy !== null || bonusActive || selectedLines.length >= machine.paylines.length}
                              aria-label="More paylines"
                              onClick={() => setPaylineCount(selectedLines.length + 1)}
                            >+</button>
                          </div>
                          <Button className="se-btn se-btn--primary" type="submit" disabledReason={disabledReason}>
                            {busy === 'spin'
                              ? 'Spinning...'
                              : bonusActive
                                ? 'Free spin · ' + bonus!.remainingSpins
                                : result ? 'Spin again' : 'Pull to spin'}
                          </Button>
                        </ActionDock>

                        <details className="se-slots__payline-panel">
                          <summary>
                            Paylines · {selectedLines.length} of {machine.paylines.length}
                            {bonusActive ? <small> · locked for the bonus</small> : null}
                          </summary>
                          <div className="se-slots__payline-head">
                            <div>
                              <small>{bonusActive ? 'Locked to the wager that earned the bonus.' : 'Pick the exact lines you want to cover.'}</small>
                            </div>
                            <div className="se-slots__line-tools">
                              <div className="se-slots__presets">
                                <button
                                  type="button"
                                  className="se-btn se-btn--ghost"
                                  disabled={busy !== null || bonusActive}
                                  onClick={() => setPaylines([machine.paylines[0]!.key])}
                                >1 line</button>
                                {machine.paylines.length >= 5 ? (
                                  <button
                                    type="button"
                                    className="se-btn se-btn--ghost"
                                    disabled={busy !== null || bonusActive}
                                    onClick={() => setPaylines(machine.paylines.slice(0, 5).map((line) => line.key))}
                                  >5 lines</button>
                                ) : null}
                                <button
                                  type="button"
                                  className="se-btn se-btn--ghost"
                                  disabled={busy !== null || bonusActive}
                                  onClick={() => setPaylines(machine.paylines.map((line) => line.key))}
                                >Max lines</button>
                              </div>
                            </div>
                          </div>
                          <div className="se-slots__paylines" role="group" aria-label="Select active paylines">
                            {machine.paylines.map((line, index) => {
                              const selected = selectedLines.includes(line.key);
                              const won = winningLineKeys.has(line.key);
                              const activeWin = activeWinKey === line.key;
                              return (
                                <button
                                  key={line.key}
                                  type="button"
                                  disabled={busy !== null || bonusActive}
                                  aria-pressed={selected}
                                  className={
                                    'se-slots__payline'
                                    + (selected ? ' is-selected' : '')
                                    + (won ? ' is-winning' : '')
                                    + (activeWin ? ' is-active-win' : '')
                                  }
                                  onClick={() => {
                                    setSelectedPaylineKeys((current) => {
                                      if (current.includes(line.key)) {
                                        if (current.length === 1) return current;
                                        return current.filter((key) => key !== line.key);
                                      }
                                      return machine.paylines.filter((candidate) =>
                                        candidate.key === line.key || current.includes(candidate.key)
                                      ).map((candidate) => candidate.key);
                                    });
                                    setLastSpin(null);
                                    setDisplayedWinCents(0);
                                    spinAction.current = newActionId();
                                  }}
                                >
                                  <strong>L{index + 1}</strong>
                                  <span>{paylinePath(line.rows)}</span>
                                </button>
                              );
                            })}
                          </div>
                        </details>

                        <details className="se-slots__paytable">
                          <summary>Paytable &amp; machine info</summary>
                          <p className="se-hint">
                            Payouts are multiples of one winning line bet. Free spins do not retrigger.
                          </p>
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

                        {outcomeVisible && result ? (
                          <div className={'se-slots__result is-' + result.winTier.toLowerCase()}>
                            <Row label={result.isFreeSpin ? 'Nominal wager' : 'Wager'} value={formatCents(result.wagerCents)} />
                            {result.isFreeSpin ? <Row label="Charged" value="$0.00 · casino covered it" strong /> : null}
                            <Row label="Lines played" value={String(result.activePaylineKeys.length)} />
                            <Row label="Payout" value={formatCents(displayedWinCents || result.payoutCents)} strong />
                            <Row label="Net" value={signedMoney(result.netCents)} />
                            <Row label="Bankroll after" value={formatCents(result.bankrollAfterCents)} />
                            {result.freeSpinsAwarded > 0 ? <Row label="Bonus awarded" value={result.freeSpinsAwarded + ' free spin' + (result.freeSpinsAwarded === 1 ? '' : 's')} strong /> : null}
                            {result.freeSpinsRemainingAfter > 0 && result.isFreeSpin ? <Row label="Free spins left" value={String(result.freeSpinsRemainingAfter)} strong /> : null}
                            {result.jackpotAwardCents > 0 ? <Row label="Progressive jackpot" value={'+' + formatCents(result.jackpotAwardCents)} strong /> : null}
                            {result.nearMiss && !result.winningLines.length ? (
                              <p className="se-slots__near-miss">One stop away: {result.nearMiss.symbolLabel} was adjacent to {result.nearMiss.paylineKey.replace('LINE_', 'line ')}.</p>
                            ) : null}
                            {result.winningLines.length ? (
                              <div className="se-slots__wins" aria-label="Winning paylines">
                                {result.winningLines.map((win) => (
                                  <div key={win.paylineKey} className={'se-slots__win' + (activeWinKey === win.paylineKey ? ' is-active' : '')}>
                                    <strong>{win.paylineName}</strong>
                                    <span>{win.matchCount}× {win.symbolLabel}</span>
                                    <strong>{win.payoutCents > 0 ? '+' + formatCents(win.payoutCents) : 'Jackpot line'}</strong>
                                  </div>
                                ))}
                              </div>
                            ) : <p className="se-muted">{result.isFreeSpin ? 'No payout on this free spin.' : 'No selected payline hit.'}</p>}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              ) : <p className="se-muted">Slots are not enabled in this round.</p>}
            </Panel>
                ) : null}

                {activeGame === 'blackjack' ? (
            <BlackjackPanel
              casinoPage={data}
              onPageChange={(next) => {
                setData(next);
                setDisplayedCreditsCents(next.openSession?.bankrollCents ?? null);
              }}
            />
                ) : null}

                {activeGame === 'roulette' ? (
            <RoulettePanel
              casinoPage={data}
              onPageChange={(next) => {
                setData(next);
                setDisplayedCreditsCents(next.openSession?.bankrollCents ?? null);
              }}
            />
                ) : null}

                {activeGame === 'street-dice' ? (
            <StreetDicePanel
              casinoPage={data}
              onPageChange={(next) => {
                setData(next);
                setDisplayedCreditsCents(next.openSession?.bankrollCents ?? null);
              }}
            />
                ) : null}

                {activeGame === 'poker' ? (
            <PokerPanel
              casinoPage={data}
              onPageChange={(next) => {
                setData(next);
                setDisplayedCreditsCents(next.openSession?.bankrollCents ?? null);
              }}
            />
                ) : null}

                {activeGame !== 'slots' && activeGame !== 'blackjack' && activeGame !== 'roulette' && activeGame !== 'street-dice' && activeGame !== 'poker' ? (() => {
                  const game = CASINO_GAMES.find((candidate) => candidate.key === activeGame)!;
                  return (
                    <CasinoGamePlaceholder
                      icon={game.icon}
                      title={game.title}
                      status={game.status}
                      description={game.description}
                    />
                  );
                })() : null}
              </div>
            </section>

            )}
          </>
        ) : null}
      </div>
    </GameLayout>
  );
}
