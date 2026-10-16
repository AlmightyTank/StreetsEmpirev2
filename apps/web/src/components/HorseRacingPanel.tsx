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

type Props = { casinoPage: CasinoPageDto; onPageChange: (page: CasinoPageDto) => void };
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const dollars = (value: string) => { const number = Number(value); return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null; };

export function HorseRacingPanel({ casinoPage, onPageChange }: Props) {
  const [state, setState] = useState<CasinoHorseRaceStateDto | null>(null);
  const [horseKey, setHorseKey] = useState<string | null>(null);
  const [wager, setWager] = useState('25');
  const [race, setRace] = useState<CasinoHorseRaceDto | null>(null);
  const [racing, setRacing] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(() => casinoSoundEnabled());
  const [error, setError] = useState<string | null>(null);
  const actionId = useRef(newActionId());

  useEffect(() => {
    void casinoApi.horseRacing().then((next) => { setState(next); setHorseKey((key) => key && next.horses.some((horse) => horse.key === key) ? key : next.horses[0]?.key ?? null); setRace(next.history[0] ?? null); }).catch((cause) => setError(cause instanceof ApiError ? cause.message : 'Could not open the race book.'));
  }, [casinoPage.currentCitySlug, casinoPage.openSession?.id]);

  const wagerCents = dollars(wager);
  const horse = state?.horses.find((runner) => runner.key === horseKey) ?? null;
  const bankroll = casinoPage.openSession?.bankrollCents ?? 0;
  const blocked = !state || !horse ? 'Pick a horse first.' : !casinoPage.openSession ? 'Open a casino bankroll first.' : !wagerCents || wagerCents < state.minBetCents || wagerCents > state.maxBetCents || wagerCents % state.betStepCents !== 0 ? 'Use the posted bet limits and increment.' : wagerCents > bankroll ? 'There are not enough chips for that ticket.' : racing ? 'The race is already under way.' : null;
  const order = useMemo(() => race ? new Map(race.finishOrder.map((key, index) => [key, index])) : new Map<string, number>(), [race]);

  async function run() {
    if (!horse || !wagerCents || blocked) return;
    setRacing(true); setRace(null); setError(null);
    playCasinoSound('RACE_GATE', soundEnabled);
    try {
      const result = await casinoApi.horseRace({ horseKey: horse.key, wagerCents, actionId: actionId.current });
      actionId.current = newActionId();
      onPageChange(result.page); setState(result.horseRacing); setRace(result.race);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!reduced) { playCasinoSound('HOOFBEATS', soundEnabled); await wait(4_100); }
      playCasinoSound('PHOTO_FINISH', soundEnabled);
      if (result.race.returnCents > 0) playCasinoSound(result.race.netCents >= result.race.wagerCents * 4 ? 'BIG_WIN' : 'SMALL_WIN', soundEnabled); else playCasinoSound('LOSS', soundEnabled);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'The race ticket could not be placed.'); }
    finally { setRacing(false); }
  }

  return <Panel title="Horse Racing" aside="Fixed odds · six runners">
    <div className={`se-horse-racing${racing ? ' is-racing' : ''}${race && !racing && race.returnCents > 0 ? ' is-win' : ''}`}>
      <div className="se-horse-racing__toolbar"><span>{racing ? 'THEY’RE OFF' : race ? `${race.winnerName.toUpperCase()} WINS` : 'NEXT RACE'}</span><button type="button" className="se-btn se-btn--ghost" aria-pressed={soundEnabled} onClick={() => { const next = !soundEnabled; setSoundEnabledState(next); setCasinoSoundEnabled(next); if (next) playCasinoSound('RACE_GATE', true); }}>{soundEnabled ? 'Sound on' : 'Muted'}</button></div>
      {error ? <Alert>{error}</Alert> : null}
      {!state ? <p className="se-muted">Posting the field…</p> : null}
      {state && !state.enabled ? <p className="se-muted">Horse racing is not enabled in this round.</p> : null}
      {state?.enabled ? <>
        <div className="se-horse-racing__board" role="radiogroup" aria-label="Pick a horse">
          {state.horses.map((runner, index) => <button key={runner.key} type="button" role="radio" aria-checked={horseKey === runner.key} disabled={racing} className={horseKey === runner.key ? 'is-selected' : ''} onClick={() => { setHorseKey(runner.key); actionId.current = newActionId(); playCasinoSound('SPORTS_PICK', soundEnabled, index); }}><i style={{ background: runner.color }} /><span><b>#{index + 1} {runner.name}</b><small>Win ticket pays {runner.oddsLabel} profit</small></span><strong>{runner.oddsLabel}</strong></button>)}
        </div>
        <div className="se-horse-racing__track" aria-live="polite">
          <div className="se-horse-racing__rail">STREETS EMPIRE DOWNS <span>FINISH</span></div>
          {state.horses.map((runner, index) => { const rank = order.get(runner.key); return <div className={`se-horse-racing__lane${race && runner.key === race.winnerKey ? ' is-winner' : ''}`} key={runner.key}><span>{index + 1}</span><div className="se-horse-racing__runner" style={{ '--runner-color': runner.color, '--rank': rank ?? index } as CSSProperties}><b aria-hidden="true">🏇</b><small>{runner.name}</small></div>{race && !racing && rank !== undefined ? <em>{rank + 1}</em> : null}</div>; })}
        </div>
        {race && !racing ? <div className={`se-horse-racing__result${race.returnCents > 0 ? ' is-win' : ' is-loss'}`}><span>Official: {race.finishOrder.slice(0, 3).map((key) => state.horses.find((item) => item.key === key)?.name ?? key).join(' · ')}</span><strong>{race.returnCents > 0 ? `Your ${race.horseName} ticket paid ${formatCents(race.returnCents)}` : `${race.horseName} finished #${race.finishOrder.indexOf(race.horseKey) + 1}`}</strong></div> : null}
        <div className="se-horse-racing__bet"><CasinoBetControl id="horse-wager" label="Win bet" ariaLabel="Horse race wager" value={wager} disabled={racing} onChange={(value) => { setWager(value); actionId.current = newActionId(); }} onDecrease={() => setWager(String(Math.max(state.minBetCents, (wagerCents ?? state.minBetCents) - state.betStepCents) / 100))} onIncrease={() => setWager(String(Math.min(state.maxBetCents, (wagerCents ?? state.minBetCents) + state.betStepCents) / 100))} onMax={() => setWager(String(Math.floor(Math.min(state.maxBetCents, bankroll) / state.betStepCents) * state.betStepCents / 100))} /><Button type="button" className="se-btn se-btn--primary" disabledReason={blocked} onClick={() => void run()}>{racing ? 'Race in progress…' : `Bet ${horse?.name ?? 'runner'}`}</Button></div>
        <p className="se-hint">Your win ticket and the full finish order are settled on the server before the animation starts. The race presentation cannot change the result.</p>
      </> : null}
    </div>
  </Panel>;
}
