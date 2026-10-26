import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { formatCents, type CasinoHorseRaceDto, type CasinoHorseRaceStateDto, type CasinoPageDto } from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { CasinoBetControl } from './CasinoExperience.js';
import { casinoSoundEnabled, playCasinoSound, setCasinoSoundEnabled } from '../lib/casinoAudio.js';
import { newActionId } from '../utils/actionId.js';
import { CASINO_RECEIPT_LABELS } from '../receipts/casinoReceiptChips.js';

type Props = { casinoPage: CasinoPageDto; onPageChange: (page: CasinoPageDto) => void };
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));
const dollars = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null;
};

function signedMoney(value: number): string {
  if (value === 0) return '$0.00';
  return `${value > 0 ? '+' : '−'}${formatCents(Math.abs(value))}`;
}

const RACE_DURATION_MS = 7200;
const GATE_ENTRY_END = 0.085;
const LATE_RACE_START = 0.58;
const START_PROGRESS = 0.035;
const FINISH_LINE_RATIO = 0.76;
const FIRST_FINISH_POSITION = FINISH_LINE_RATIO + 0.20;
const FINISH_POSITION_GAP = 0.034;

interface RunnerStyle extends CSSProperties {
  '--runner-color': string;
  '--bob-delay': string;
}

export function HorseRacingPanel({ casinoPage, onPageChange }: Props) {
  const [state, setState] = useState<CasinoHorseRaceStateDto | null>(null);
  const [horseKey, setHorseKey] = useState<string | null>(null);
  const [wager, setWager] = useState('25');
  const [race, setRace] = useState<CasinoHorseRaceDto | null>(null);
  const [racing, setRacing] = useState(false);
  const [positions, setPositions] = useState<number[]>([]);
  const [raceProgress, setRaceProgress] = useState(0);
  const [soundEnabled, setSoundEnabledState] = useState(() => casinoSoundEnabled());
  const [error, setError] = useState<string | null>(null);
  const actionId = useRef(newActionId());
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const positionsRef = useRef<number[]>([]);

  useEffect(() => {
    void casinoApi.horseRacing().then((next) => {
      setState(next);
      setHorseKey((key) => key && next.horses.some((horse) => horse.key === key) ? key : next.horses[0]?.key ?? null);
      setRace(next.history[0] ?? null);
      setPositions(new Array(next.horses.length).fill(0));
    }).catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Could not open the race book.'));
  }, [casinoPage.currentCitySlug, casinoPage.openSession?.id]);

  useEffect(() => {
    if (!state?.enabled || racing) return;
    const refresh = window.setInterval(() => {
      void casinoApi.horseRacing().then((next) => {
        setState(next);
        setHorseKey((key) => key && next.horses.some((horse) => horse.key === key) ? key : next.horses[0]?.key ?? null);
      }).catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(refresh);
  }, [state?.enabled, racing, casinoPage.currentCitySlug, casinoPage.openSession?.id]);

  const wagerCents = dollars(wager);
  const horse = state?.horses.find((runner) => runner.key === horseKey) ?? null;
  const bankroll = casinoPage.openSession?.bankrollCents ?? 0;
  const blocked = !state || !horse ? 'Pick a horse first.'
    : !casinoPage.openSession ? 'Open a casino bankroll first.'
    : !wagerCents || wagerCents < state.minBetCents || wagerCents > state.maxBetCents || wagerCents % state.betStepCents !== 0 ? 'Use the posted bet limits and increment.'
    : wagerCents > bankroll ? 'There are not enough chips for that ticket.'
    : racing ? 'The race is already under way.' : null;
  const order = useMemo(() => race ? new Map(race.finishOrder.map((key, index) => [key, index])) : new Map<string, number>(), [race]);
  const officialWinnerKey = race?.finishOrder[0] ?? race?.winnerKey ?? null;
  const officialWinner = state?.horses.find((runner) => runner.key === officialWinnerKey);
  const leaderIndex = positions.reduce((best, position, index) => position > (positions[best] ?? -1) ? index : best, 0);
  const liveLeader = state?.horses[leaderIndex];
  const raceCall = !racing ? `${(officialWinner?.name ?? race?.winnerName ?? 'Next race').toUpperCase()} WINS`
    : raceProgress < 0.03 ? 'THE GATES ARE OPENING'
      : raceProgress < 0.18 ? 'THEY’RE OFF'
        : raceProgress < 0.62 ? `${liveLeader?.name.toUpperCase() ?? 'THE FIELD'} SETS THE PACE`
          : raceProgress < 0.88 ? `${liveLeader?.name.toUpperCase() ?? 'THE FIELD'} LEADS INTO THE TURN`
            : 'DOWN THE STRETCH · PHOTO FINISH';

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  function startRace(result: { finishOrder: string[] }): Promise<void> {
    const horseCount = state?.horses.length ?? 6;
    const finishOrder = result.finishOrder;
    const rankOf = new Map<string, number>();
    finishOrder.forEach((key, index) => rankOf.set(key, index));

    const field = Array.from({ length: horseCount }, (_, index) => {
      const rank = rankOf.get(state?.horses[index]?.key ?? '') ?? index;
      return {
        // The final coordinates are the same ones used by the settled result.
        // All runners keep moving through the wire and finish at slightly
        // different distances, so crossing never freezes a horse in place.
        finishPosition: FIRST_FINISH_POSITION - rank * FINISH_POSITION_GAP,
        phase: Math.random() * Math.PI * 2,
        phaseTwo: Math.random() * Math.PI * 2,
        speed: (Math.random() - 0.5) * 0.025,
      };
    });

    // The track clips the runner at its left edge, so -0.12 stages every horse
    // just outside the visible track before the field enters together.
    const startingPositions = new Array(horseCount).fill(-0.12);
    positionsRef.current = startingPositions;
    setPositions(startingPositions);
    setRaceProgress(0);

    startTimeRef.current = performance.now();
    cancelAnimationFrame(rafRef.current);

    return new Promise((resolve) => {
      const tick = (now: number) => {
        const elapsed = now - startTimeRef.current;
        const rawProgress = Math.min(elapsed / RACE_DURATION_MS, 1);

        const newPositions = field.map((runner) => {
          if (rawProgress < GATE_ENTRY_END) {
            // All runners break together and enter from off the left side.
            const entry = rawProgress / GATE_ENTRY_END;
            return -0.12 + (START_PROGRESS + 0.12) * (entry * entry * (3 - 2 * entry));
          }

          // Keep one continuous pace curve for the whole run. The old two-stage
          // curve changed each horse's speed abruptly at the stretch and pulled
          // them into rigid finish slots. Now the field keeps flowing while
          // small pace changes create passes and the official order emerges
          // gradually in the last part of the race.
          const raceProgress = Math.min((rawProgress - GATE_ENTRY_END) / (1 - GATE_ENTRY_END), 1);
          const trackProgress = START_PROGRESS + raceProgress * (FIRST_FINISH_POSITION - START_PROGRESS - (2.5 * FINISH_POSITION_GAP));
          const envelope = Math.sin(Math.PI * raceProgress);
          const swing = (Math.sin(raceProgress * Math.PI * 4.5 + runner.phase) - Math.sin(runner.phase)) * 0.018
            + (Math.sin(raceProgress * Math.PI * 8 + runner.phaseTwo) - Math.sin(runner.phaseTwo)) * 0.006;
          const paceDrift = runner.speed * raceProgress;
          const stretch = Math.max(0, Math.min(1, (raceProgress - LATE_RACE_START) / (1 - LATE_RACE_START)));
          const stretchEase = stretch * stretch * (3 - 2 * stretch);
          const rankOffset = (2.5 - rank) * FINISH_POSITION_GAP;
          return Math.max(START_PROGRESS, Math.min(FIRST_FINISH_POSITION, trackProgress + (swing + paceDrift) * envelope + rankOffset * stretchEase));
        });

        positionsRef.current = newPositions;
        setPositions(newPositions);
        setRaceProgress(rawProgress);

        if (rawProgress < 1) rafRef.current = requestAnimationFrame(tick);
        else {
          const finalPositions = field.map((runner) => runner.finishPosition);
          positionsRef.current = finalPositions;
          setPositions(finalPositions);
          setRaceProgress(1);
          resolve();
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    });
  }

  async function run() {
    if (!horse || !wagerCents || blocked) return;
    setRacing(true); setRace(null); setError(null);
    playCasinoSound('RACE_GATE', soundEnabled);
    try {
      const result = await casinoApi.horseRace({ horseKey: horse.key, wagerCents, actionId: actionId.current });
      actionId.current = newActionId();
      onPageChange(result.page); setState(result.horseRacing); setRace(result.race);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        playCasinoSound('PHOTO_FINISH', soundEnabled);
        if (result.race.returnCents > 0) playCasinoSound(result.race.netCents >= result.race.wagerCents * 4 ? 'BIG_WIN' : 'SMALL_WIN', soundEnabled); else playCasinoSound('LOSS', soundEnabled);
      } else {
        playCasinoSound('HOOFBEATS', soundEnabled);
        await startRace(result.race);
        await wait(300);
        playCasinoSound('PHOTO_FINISH', soundEnabled);
        if (result.race.returnCents > 0) playCasinoSound(result.race.netCents >= result.race.wagerCents * 4 ? 'BIG_WIN' : 'SMALL_WIN', soundEnabled); else playCasinoSound('LOSS', soundEnabled);
      }
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'The race ticket could not be placed.'); }
    finally { setRacing(false); }
  }

  return <Panel title="Horse Racing" aside="Live odds · six runners">
    <div className={`se-horse-racing${racing ? ' is-racing' : ''}${race && !racing && race.returnCents > 0 ? ' is-win' : ''}`}>
      <div className="se-horse-racing__toolbar">
        <span>{raceCall}</span>
        <button type="button" className="se-btn se-btn--ghost" aria-pressed={soundEnabled} onClick={() => { const next = !soundEnabled; setSoundEnabledState(next); setCasinoSoundEnabled(next); if (next) playCasinoSound('RACE_GATE', true); }}>{soundEnabled ? 'Sound on' : 'Muted'}</button>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      {!state ? <p className="se-muted">Posting the field…</p> : null}
      {state && !state.enabled ? <p className="se-muted">Horse racing is not enabled in this round.</p> : null}
      {state?.enabled ? <>
        <div className="se-horse-racing__board" role="radiogroup" aria-label="Pick a horse">
          {state.horses.map((runner, i) => (
            <button key={runner.key} type="button" role="radio" aria-checked={horseKey === runner.key} disabled={racing}
              className={horseKey === runner.key ? 'is-selected' : ''}
              onClick={() => { setHorseKey(runner.key); actionId.current = newActionId(); playCasinoSound('SPORTS_PICK', soundEnabled, i); }}>
              <i style={{ background: runner.color }} />
              <span><b>#{i + 1} {runner.name}</b><small>Win ticket pays {runner.oddsLabel} profit</small></span>
              <strong>{runner.oddsLabel}</strong>
            </button>
          ))}
        </div>
        <div className="se-horse-racing__track" aria-live="polite">
          <div className="se-horse-racing__rail">
            <strong>STREETS EMPIRE DOWNS</strong>
            <span>{racing ? 'LIVE RACE' : race ? 'OFFICIAL RESULT' : 'FINISH'}</span>
          </div>
          {racing ? <div className="se-horse-racing__progress" aria-hidden="true"><span style={{ width: `${raceProgress * 100}%` }} /></div> : null}
          <div className="se-horse-racing__dirt" aria-hidden="true" />
          <div className="se-horse-racing__rails" aria-hidden="true" />
          <div className="se-horse-racing__finish" aria-hidden="true" />
          <div className="se-horse-racing__lanes">
            {state.horses.map((runner, index) => {
              const rank = order.get(runner.key);
              // Keep the official finish order visible after the animation. Previously
              // every settled runner used `1`, which stacked all six horses on the
              // finish marker and made the winner look corrupted.
              const pos = racing ? (positions[index] ?? START_PROGRESS) : (race ? FIRST_FINISH_POSITION - (rank ?? index) * FINISH_POSITION_GAP : START_PROGRESS);
              const winner = race && runner.key === officialWinnerKey;
              const leading = racing && index === leaderIndex;
              const style: RunnerStyle = {
                '--runner-color': runner.color,
                '--bob-delay': `${index * 0.12}s`,
              };
              return (
                <div className={`se-horse-racing__lane${winner && !racing ? ' is-winner' : ''}${leading ? ' is-leading' : ''}`} key={runner.key}>
                  <span>{index + 1}</span>
                  <div className="se-horse-racing__runner" style={style}>
                    <div className={`se-horse-racing__horse${winner && !racing ? ' is-winner' : ''}${leading ? ' is-leading' : ''}`} style={{ left: `${pos * 100}%` }}>
                      <small>{runner.name}</small>
                      <b aria-hidden="true">🏇</b>
                    </div>
                  </div>
                  {race && !racing && rank !== undefined ? <em>{rank + 1}</em> : null}
                </div>
              );
            })}
          </div>
        </div>
        {race && !racing ? <div className={`se-horse-racing__result${race.returnCents > 0 ? ' is-win' : ' is-loss'}`}>
          <span>Official finish: {race.finishOrder.slice(0, 3).map((key, index) => `${index + 1}. ${state.horses.find((item) => item.key === key)?.name ?? key}`).join(' · ')}</span>
          <strong>{race.horseName} finished #{Math.max(1, race.finishOrder.indexOf(race.horseKey) + 1)}</strong>
          <span>{CASINO_RECEIPT_LABELS.wager} {formatCents(race.wagerCents)} · {CASINO_RECEIPT_LABELS.returned} {formatCents(race.returnCents)} · {CASINO_RECEIPT_LABELS.net} {signedMoney(race.netCents)}</span>
        </div> : null}
        <div className="se-horse-racing__bet">
          <CasinoBetControl id="horse-wager" label="Win bet" ariaLabel="Horse race wager" value={wager} disabled={racing} onChange={(value) => { setWager(value); actionId.current = newActionId(); }} onDecrease={() => setWager(String(Math.max(state.minBetCents, (wagerCents ?? state.minBetCents) - state.betStepCents) / 100))} onIncrease={() => setWager(String(Math.min(state.maxBetCents, (wagerCents ?? state.minBetCents) + state.betStepCents) / 100))} onMax={() => setWager(String(Math.floor(Math.min(state.maxBetCents, bankroll) / state.betStepCents) * state.betStepCents / 100))} />
          <Button type="button" className="se-btn se-btn--primary" disabledReason={blocked} onClick={() => void run()}>{racing ? 'Race in progress…' : `Bet ${horse?.name ?? 'runner'}`}</Button>
        </div>
        <p className="se-hint">Live odds react to recent volume, winners, and casino status. Odds are locked by the server when your ticket is settled; the animation cannot change the result.</p>
      </> : null}
    </div>
  </Panel>;
}
