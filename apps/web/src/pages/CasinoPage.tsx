import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatCents, type CasinoPageDto, type CasinoSlotSpinDto } from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { BlackjackPanel } from '../components/BlackjackPanel.js';
import { RoulettePanel } from '../components/RoulettePanel.js';
import { StreetDicePanel } from '../components/StreetDicePanel.js';
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
    description: 'Three server-authoritative machines with paylines, free spins and the Empire progressive.',
  },
  {
    key: 'blackjack',
    label: 'Blackjack',
    icon: '♠',
    status: 'LIVE',
    live: true,
    title: 'Blackjack',
    description: 'Casino blackjack with persisted shoes, splits, doubles and real table rules.',
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
    status: 'FUTURE',
    live: false,
    title: 'Poker',
    description: 'The card room is reserved for a future casino slice. Tables, stakes and poker rules will live here.',
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

export function CasinoPage() {
  const me = useSession((state) => state.me);
  const refreshSnapshot = useSession((state) => state.refreshSnapshot);
  const [data, setData] = useState<CasinoPageDto | null>(null);
  const [activeGame, setActiveGame] = useState<CasinoGameKey>('slots');
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
      .then(async (next) => {
        setData(next);
        setDisplayedCreditsCents(next.openSession?.bankrollCents ?? null);
        setError(null);

        if (!next.enabled) return;
        try {
          const blackjack = await casinoApi.blackjack();
          if (blackjack.activeHand) setActiveGame('blackjack');
        } catch {
          // Keep the rest of the casino usable if blackjack state cannot be loaded.
          // BlackjackPanel will surface its own error when that game is selected.
        }
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

      setNotice(
        result.spin.jackpotAwardCents > 0
          ? 'JACKPOT! ' + formatCents(result.spin.jackpotAwardCents) + ' hit the bankroll.'
          : result.spin.freeSpinsAwarded > 0
            ? result.spin.freeSpinsAwarded + ' free spin' + (result.spin.freeSpinsAwarded === 1 ? '' : 's') + ' awarded.'
            : result.spin.isFreeSpin && result.spin.freeSpinsRemainingAfter > 0
              ? 'Free spin complete · ' + result.spin.freeSpinsRemainingAfter + ' remaining.'
              : result.spin.winningLines.length > 0
                ? result.spin.winningLines.length + ' winning line' + (result.spin.winningLines.length === 1 ? '' : 's') + ' paid ' + formatCents(result.spin.payoutCents) + '.'
                : result.spin.nearMiss
                  ? 'So close — ' + result.spin.nearMiss.symbolLabel + ' landed one stop off the line.'
                  : result.spin.isFreeSpin ? 'Free spin complete.' : 'No winning paylines on that spin.',
      );
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

  return (
    <GameLayout>
      <div className="se-casino">
        <header className="se-casino__hero">
          <div>
            <span className="se-eyebrow">1.2.0 · Casino floor</span>
            <h1>Casino</h1>
            <p>Buy chips once, open a floor bankroll, then move between casino games without leaving the room. Game outcomes and payouts stay server-authoritative.</p>
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

            <section className="se-casino-floor" aria-label="Casino games">
              <div className="se-casino-floor__head">
                <div>
                  <span className="se-eyebrow">Casino floor</span>
                  <h2>Choose your game</h2>
                  <p>Switch games without leaving the cage, bankroll, destinations or casino history.</p>
                </div>
                <div className="se-casino-floor__bankroll">
                  <small>Floor bankroll</small>
                  <strong>{data.openSession ? formatCents(data.openSession.bankrollCents) : 'No session'}</strong>
                  <span>{data.openSession ? data.openSession.venueName + ' · ' + data.openSession.cityName : 'Open a bankroll to play'}</span>
                </div>
              </div>

              <div className="se-casino-games" role="tablist" aria-label="Casino games">
                {CASINO_GAMES.map((game) => (
                  <button
                    key={game.key}
                    id={'casino-game-tab-' + game.key}
                    type="button"
                    role="tab"
                    aria-selected={activeGame === game.key}
                    aria-controls={'casino-game-panel-' + game.key}
                    className={'se-casino-game-tab' + (activeGame === game.key ? ' is-active' : '') + (game.live ? ' is-live' : ' is-coming')}
                    onClick={() => setActiveGame(game.key)}
                  >
                    <span className="se-casino-game-tab__icon" aria-hidden="true">{game.icon}</span>
                    <span className="se-casino-game-tab__copy">
                      <strong>{game.label}</strong>
                      <small>{game.status}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div
                className="se-casino-game-stage"
                id={'casino-game-panel-' + activeGame}
                role="tabpanel"
                aria-labelledby={'casino-game-tab-' + activeGame}
              >
                {activeGame === 'slots' ? (
            <Panel title="Slots" aside="Casino-style paylines">
              {data.slotMachines.length ? (
                <div className="se-slots">
                  <div className="se-slots__machines" role="group" aria-label="Slot machines">
                    {data.slotMachines.map((machine) => (
                      <button
                        key={machine.key}
                        type="button"
                        disabled={busy !== null || data.freeSpinBonus !== null}
                        aria-pressed={selectedMachineKey === machine.key}
                        className={'se-slots__machine' + (selectedMachineKey === machine.key ? ' is-selected' : '')}
                        onClick={() => {
                          setSelectedMachineKey(machine.key);
                          setSlotBetPerLine(String(machine.minBetPerLineCents / 100));
                          setSelectedPaylineKeys(machine.paylines.map((line) => line.key));
                          setLastSpin(null);
                          setDisplayedWinCents(0);
                          spinAction.current = newActionId();
                        }}
                      >
                        <span><strong>{machine.name}</strong>{machine.availableHere ? <small>Available here</small> : <small>Not in this room</small>}</span>
                        <small>{machine.reels}×{machine.rows} · {machine.paylines.length} lines · RTP {(machine.effectiveRtpBps / 100).toFixed(2)}%</small>
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
                          <p className="se-hint">
                            {machine.reels} reels × {machine.rows} rows · wins run left-to-right from reel 1 · 3+ matching symbols
                          </p>
                          <p className="se-hint">
                            Line bet {formatCents(machine.minBetPerLineCents)} – {formatCents(machine.maxBetPerLineCents)}
                            {' · '}step {formatCents(machine.betStepCents)}
                            {' · '}RTP {(machine.effectiveRtpBps / 100).toFixed(2)}% incl. free spins
                          </p>
                          {machine.freeSpins ? (
                            <p className="se-hint">
                              Paid spins can randomly award {machine.freeSpins.possibleAwards.join('/')} free spins. The machine, lines and line bet stay locked for the bonus.
                            </p>
                          ) : null}
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

                        <div className={'se-slots__cabinet is-' + cabinetTone + (outcomeVisible && result ? ' is-' + result.winTier.toLowerCase() : '')}>
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

                        </div>

                        <div className="se-slots__controls">
                          <form className={'se-casino__form se-slots__form' + (bonusActive ? ' is-free-spin' : '')} onSubmit={spinSlots}>
                            <div className="se-slots__bet-control">
                              <span>Bet per line ($)</span>
                              <div className="se-slots__bet-stepper">
                                <button
                                  type="button"
                                  className="se-btn se-btn--ghost"
                                  disabled={busy !== null || bonusActive}
                                  aria-label="Decrease bet per line"
                                  onClick={() => setLineBet((lineBetCents ?? machine.minBetPerLineCents) - machine.betStepCents)}
                                >−</button>
                                <input
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
                                  className="se-btn se-btn--ghost"
                                  disabled={busy !== null || bonusActive}
                                  aria-label="Increase bet per line"
                                  onClick={() => setLineBet((lineBetCents ?? machine.minBetPerLineCents) + machine.betStepCents)}
                                >+</button>
                                <button
                                  type="button"
                                  className="se-btn se-btn--ghost"
                                  disabled={busy !== null || bonusActive}
                                  onClick={() => {
                                    setLineBet(machine.maxBetPerLineCents);
                                    setPaylines(machine.paylines.map((line) => line.key));
                                  }}
                                >Max bet</button>
                              </div>
                            </div>
                            <div className="se-slots__line-control">
                              <span>Active paylines</span>
                              <div className="se-slots__line-stepper" role="group" aria-label="Adjust active paylines">
                                <button
                                  type="button"
                                  className="se-btn se-btn--ghost"
                                  disabled={busy !== null || bonusActive || selectedLines.length <= 1}
                                  aria-label="Decrease active paylines"
                                  onClick={() => setPaylineCount(selectedLines.length - 1)}
                                >−</button>
                                <span><strong>{selectedLines.length}</strong><small>lines</small></span>
                                <button
                                  type="button"
                                  className="se-btn se-btn--ghost"
                                  disabled={busy !== null || bonusActive || selectedLines.length >= machine.paylines.length}
                                  aria-label="Increase active paylines"
                                  onClick={() => setPaylineCount(selectedLines.length + 1)}
                                >+</button>
                              </div>
                            </div>
                            <p className="se-hint">
                              {selectedLines.length} line{selectedLines.length === 1 ? '' : 's'} × {lineBetCents ? formatCents(lineBetCents) : '—'}
                              {' = '}<strong>{totalWagerCents ? formatCents(totalWagerCents) : '—'} {bonusActive ? 'covered spin' : 'total spin'}</strong>
                            </p>
                            <Button className="se-btn se-slots__spin-button" type="submit" disabledReason={disabledReason}>
                              {busy === 'spin'
                                ? 'Spinning...'
                                : bonusActive
                                  ? 'FREE SPIN · ' + bonus!.remainingSpins
                                  : 'SPIN REELS'}
                            </Button>
                          </form>

                          <div className="se-slots__meter">
                            <span><small>Credits</small><strong>{displayedCreditsCents !== null ? formatCents(displayedCreditsCents) : data.openSession ? formatCents(data.openSession.bankrollCents) : '—'}</strong></span>
                            <span><small>Lines</small><strong>{selectedLines.length}/{machine.paylines.length}</strong></span>
                            <span><small>Per line</small><strong>{lineBetCents ? formatCents(lineBetCents) : '—'}</strong></span>
                            <span><small>{bonusActive ? 'Casino covers' : 'Total bet'}</small><strong>{totalWagerCents ? formatCents(totalWagerCents) : '—'}</strong></span>
                            <span className="se-slots__last-win"><small>Last win</small><strong>{displayedWinCents ? formatCents(displayedWinCents) : '—'}</strong></span>
                          </div>
                        </div>

                        <div className="se-slots__payline-panel">
                          <div className="se-slots__payline-head">
                            <div>
                              <strong>Active paylines</strong>
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
                        </div>

                        <details className="se-slots__paytable">
                          <summary>Paytable &amp; machine info</summary>
                          <p className="se-hint">
                            Payouts are multiples of one winning line bet. Displayed RTP includes the configured free-spin feature; free spins do not retrigger.
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

                {activeGame !== 'slots' && activeGame !== 'blackjack' && activeGame !== 'roulette' && activeGame !== 'street-dice' ? (() => {
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
        ) : null}
      </div>
    </GameLayout>
  );
}
