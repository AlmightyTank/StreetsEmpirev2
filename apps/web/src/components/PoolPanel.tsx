import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  formatCents,
  type CasinoPageDto,
  type CasinoPoolFinishDto,
  type CasinoPoolGameDto,
  type CasinoPoolShotEventDto,
  type CasinoPoolShotKindDto,
  type CasinoPoolStateDto,
} from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { ActionDock, deltaChip } from './ActionDock.js';
import { CasinoBetControl } from './CasinoExperience.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { newActionId } from '../utils/actionId.js';
import { restoreScrollPosition } from '../utils/scrollPosition.js';
import { formatWhen } from '../utils/time.js';
import { casinoSoundEnabled, playCasinoSound, setCasinoSoundEnabled } from '../lib/casinoAudio.js';

function dollarsToCents(value: string): number | null {
  const clean = value.trim().replaceAll(',', '').replace(/^\$/, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const [whole = '0', fraction = ''] = clean.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function signedMoney(value: number): string {
  if (value === 0) return '$0.00';
  return (value > 0 ? '+' : '−') + formatCents(Math.abs(value));
}

function pct(bps: number): string {
  return Math.round(bps / 100) + '%';
}

function times(bps: number): string {
  const value = bps / 10_000;
  return (Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, '')) + 'x';
}

const SHOT_LABEL: Record<CasinoPoolShotKindDto, string> = { STEADY: 'Steady', POWER: 'Power', SAFETY: 'Safety' };
const SHOT_HINT: Record<CasinoPoolShotKindDto, string> = {
  STEADY: 'Pot one ball. On the 8, this is the money shot.',
  POWER: 'Try to drop two at once. Misses more and scratches more.',
  SAFETY: 'Leave the hustler nothing. Their next shot is much harder and they foul often.',
};

function finishLabel(finish: CasinoPoolFinishDto | null, hustler: string): string {
  switch (finish) {
    case 'GOLDEN_BREAK': return '8 on the break';
    case 'BREAK_AND_RUN': return 'Break and run';
    case 'EIGHT': return 'You sank the 8';
    case 'HUSTLER_SCRATCHED_EIGHT': return hustler + ' scratched on the 8';
    case 'HUSTLER_EIGHT': return hustler + ' sank the 8';
    case 'SCRATCHED_EIGHT': return 'Scratched on the 8';
    default: return '';
  }
}

function eventText(event: CasinoPoolShotEventDto, hustler: string): string {
  const who = event.shooter === 'PLAYER' ? 'You' : hustler;
  const balls = event.balls.length ? ' the ' + event.balls.join(' and ') : '';
  if (event.shot === 'BREAK') {
    if (event.result === 'DRY') return 'You break. Nothing drops.';
    if (event.result === 'SCRATCH') return 'You scratch on the break.';
    return 'You break and drop' + balls + '.';
  }
  if (event.shot === 'SAFETY') return event.result === 'FOUL' ? 'Your safety fouls. Ball in hand for ' + hustler + '.' : 'You play safe and leave nothing.';
  if (event.result === 'POT') return who + (event.shot === 'POWER' ? ' power through' + balls : ' sink' + (event.shooter === 'PLAYER' ? '' : 's') + balls) + '.';
  if (event.result === 'SCRATCH') return who + ' scratch' + (event.shooter === 'PLAYER' ? '' : 'es') + (event.shot === 'EIGHT' ? ' on the 8.' : '. Ball in hand.');
  return who + ' miss' + (event.shooter === 'PLAYER' ? '' : 'es') + (event.shot === 'EIGHT' ? ' the 8.' : '.');
}

function PoolBall({ n, gone = false }: { n: number; gone?: boolean }) {
  return (
    <span className={'se-pool__ball is-' + n + (n > 8 ? ' is-stripe' : '') + (gone ? ' is-gone' : '')} role="img" aria-label={(gone ? 'Pocketed ' : '') + n + ' ball'}>
      <span>{n}</span>
    </span>
  );
}

function BallRow({ group, left }: { group: number[]; left: number[] }) {
  return (
    <div className="se-pool__balls">
      {group.map((n) => <PoolBall key={n} n={n} gone={!left.includes(n)} />)}
    </div>
  );
}

const SOLIDS = [1, 2, 3, 4, 5, 6, 7];
const STRIPES = [9, 10, 11, 12, 13, 14, 15];

type Props = {
  casinoPage: CasinoPageDto;
  onPageChange: (page: CasinoPageDto) => void;
};

export function PoolPanel({ casinoPage, onPageChange }: Props) {
  const [state, setState] = useState<CasinoPoolStateDto | null>(null);
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [wager, setWager] = useState('10');
  const [lastGame, setLastGame] = useState<CasinoPoolGameDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabledState] = useState(() => casinoSoundEnabled());
  const [error, setError] = useState<string | null>(null);
  const rackAction = useRef(newActionId());
  const shotAction = useRef(newActionId());
  const pressAction = useRef(newActionId());

  function load() {
    void casinoApi.pool()
      .then((next) => {
        setState(next);
        setLastGame(next.activeGame);
        setError(null);
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not find the pool tables.'));
  }

  useEffect(load, [casinoPage.currentCitySlug, casinoPage.openSession?.id]);

  useEffect(() => {
    if (!state?.enabled || !state.tables.length) return;
    if (state.activeGame) {
      setSelectedTableKey(state.activeGame.tableKey);
      return;
    }
    if (state.tables.some((table) => table.key === selectedTableKey)) return;
    const next = state.tables.find((table) => table.availableHere) ?? state.tables[0]!;
    setSelectedTableKey(next.key);
    setWager(String(next.minBetCents / 100));
    rackAction.current = newActionId();
  }, [state, selectedTableKey]);

  const selectedTable = useMemo(
    () => state?.tables.find((table) => table.key === selectedTableKey) ?? null,
    [state, selectedTableKey],
  );
  const shownGame = state?.activeGame ?? lastGame;
  const settled = shownGame && shownGame.status !== 'ACTIVE' ? shownGame : null;
  const wagerCents = dollarsToCents(wager);
  const wagerValid = Boolean(
    selectedTable
      && wagerCents
      && wagerCents >= selectedTable.minBetCents
      && wagerCents <= selectedTable.maxBetCents
      && wagerCents % selectedTable.betStepCents === 0,
  );

  function playResult(game: CasinoPoolGameDto): void {
    if (game.status === 'ACTIVE') return;
    if (game.finish === 'GOLDEN_BREAK' || game.finish === 'BREAK_AND_RUN') playCasinoSound('BIG_WIN', soundEnabled);
    else if (game.status === 'WON') playCasinoSound('SMALL_WIN', soundEnabled);
    else playCasinoSound('LOSS', soundEnabled);
  }

  function apply(result: { page: CasinoPageDto; pool: CasinoPoolStateDto; game: CasinoPoolGameDto }, scrollTop: number) {
    onPageChange(result.page);
    setState(result.pool);
    setLastGame(result.game);
    restoreScrollPosition(scrollTop);
    playCasinoSound('BALL_DROP', soundEnabled);
    playResult(result.game);
  }

  async function rack(event: FormEvent) {
    event.preventDefault();
    if (!selectedTable || !wagerCents) return;
    const scrollTop = window.scrollY;
    setBusy('rack');
    setError(null);
    setLastGame(null);
    playCasinoSound('CHIP_PLACE', soundEnabled);
    try {
      const result = await casinoApi.poolRack({ tableKey: selectedTable.key, wagerCents, actionId: rackAction.current });
      apply(result, scrollTop);
      rackAction.current = newActionId();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The table could not be racked.');
    } finally {
      setBusy(null);
    }
  }

  async function shoot(shot: CasinoPoolShotKindDto) {
    if (!shownGame) return;
    const scrollTop = window.scrollY;
    setBusy(shot);
    setError(null);
    try {
      const result = await casinoApi.poolShot({ gameId: shownGame.id, shot, actionId: shotAction.current });
      apply(result, scrollTop);
      shotAction.current = newActionId();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That shot did not go off.');
    } finally {
      setBusy(null);
    }
  }

  async function press() {
    if (!shownGame) return;
    const scrollTop = window.scrollY;
    setBusy('press');
    setError(null);
    playCasinoSound('CHIP_PLACE', soundEnabled);
    try {
      const result = await casinoApi.poolPress({ gameId: shownGame.id, actionId: pressAction.current });
      onPageChange(result.page);
      setState(result.pool);
      setLastGame(result.game);
      restoreScrollPosition(scrollTop);
      pressAction.current = newActionId();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The hustler would not take the press.');
    } finally {
      setBusy(null);
    }
  }

  const rackBlock = !selectedTable
    ? 'Pick a table first.'
    : !selectedTable.availableHere
      ? selectedTable.lockedReason ?? 'Travel to a casino that carries this table.'
      : !casinoPage.openSession
        ? 'Open a casino bankroll first.'
        : casinoPage.openSession.citySlug !== casinoPage.currentCitySlug
          ? 'Your open bankroll belongs to another casino.'
          : !wagerValid
            ? 'Use one of this table\'s posted stakes.'
            : wagerCents && casinoPage.openSession.bankrollCents < wagerCents
              ? 'There are not enough chips in the bankroll.'
              : busy ? 'The table is busy.' : null;

  const stepWager = (deltaCents: number) => {
    if (!selectedTable) return;
    const current = wagerCents ?? selectedTable.minBetCents;
    const next = Math.max(selectedTable.minBetCents, Math.min(selectedTable.maxBetCents, current + deltaCents));
    setWager(String(next / 100));
    rackAction.current = newActionId();
  };

  const hustler = shownGame?.hustlerName ?? selectedTable?.hustlerName ?? 'The hustler';
  const recent = shownGame ? shownGame.log.slice(-8) : [];
  const active = shownGame?.status === 'ACTIVE' ? shownGame : null;

  return (
    <Panel title="Pool" aside={state?.activeGame ? 'Rack in progress' : undefined}>
      {error ? <Alert>{error}</Alert> : null}
      {!state ? <p className="se-muted">Chalking the cues...</p> : null}
      {state && !state.enabled ? <p className="se-muted">Pool is not enabled in this round.</p> : null}

      {state?.enabled ? (
        <div className="se-pool">
          <div className="se-casino-picker" role="group" aria-label="Pool tables">
            {state.tables.map((table) => (
              <button
                key={table.key}
                type="button"
                disabled={busy !== null || Boolean(state.activeGame)}
                aria-pressed={selectedTableKey === table.key}
                title={table.availableHere ? undefined : table.lockedReason ?? 'Not in this room'}
                className={'se-casino-picker__opt' + (selectedTableKey === table.key ? ' is-selected' : '') + (table.availableHere ? '' : ' is-away')}
                onClick={() => {
                  setSelectedTableKey(table.key);
                  setWager(String(table.minBetCents / 100));
                  setLastGame(null);
                  rackAction.current = newActionId();
                }}
              >
                <strong>{table.name}{table.room === 'VIP' ? <em className="se-casino-vip-badge">VIP</em> : null}</strong>
                <small>vs {table.hustlerName} · win pays {times(table.winReturnBps)}{table.availableHere ? '' : ' · not here'}</small>
              </button>
            ))}
          </div>

          {selectedTable ? (
            <>
              <div className="se-blackjack__intro">
                <div className="se-blackjack__intro-head">
                  <p>{selectedTable.blurb}</p>
                  <button
                    type="button"
                    className="se-btn se-btn--ghost se-blackjack__sound"
                    aria-pressed={soundEnabled}
                    onClick={() => {
                      const next = !soundEnabled;
                      setSoundEnabledState(next);
                      setCasinoSoundEnabled(next);
                      if (next) playCasinoSound('CHIP_PLACE', true);
                    }}
                  >
                    {soundEnabled ? 'Sound on' : 'Muted'}
                  </button>
                </div>
                <details className="se-slots__rules">
                  <summary>Table rules</summary>
                  <p className="se-hint">
                    Eight-ball. You break and shoot solids; {selectedTable.hustlerName} shoots stripes and pots {pct(selectedTable.hustlerPotBps)} of shots.
                    Clear your group, then sink the 8. Scratch on the 8 and you lose; the same goes for the hustler.
                  </p>
                  <p className="se-hint">
                    A win returns {times(selectedTable.winReturnBps)} your stake. Break and run (the hustler never shoots) returns {times(selectedTable.breakAndRunReturnBps)}.
                    The 8 on the break returns {times(selectedTable.goldenBreakReturnBps)}.
                  </p>
                  <p className="se-hint">
                    Press once per rack to double your stake, on your shot, while the hustler is ahead and you do not have ball in hand.
                    Stakes {formatCents(selectedTable.minBetCents)}–{formatCents(selectedTable.maxBetCents)} in {formatCents(selectedTable.betStepCents)} steps. A rack in play is saved if you leave.
                  </p>
                </details>
              </div>

              <div className={'se-pool__table' + (settled ? ' is-settled' : '') + (busy ? ' is-busy' : '')}>
                {busy ? <div className="se-blackjack__table-status" role="status">{busy === 'rack' ? 'BREAKING' : busy === 'press' ? 'PRESSING' : 'SHOOTING'}</div> : null}
                <div className="se-pool__side">
                  <div className="se-blackjack__label"><span>{hustler}</span><strong>{shownGame ? (shownGame.hustlerBalls.length ? shownGame.hustlerBalls.length + ' left' : 'On the 8') : 'Stripes'}</strong></div>
                  <BallRow group={STRIPES} left={shownGame?.hustlerBalls ?? STRIPES} />
                </div>
                <div className="se-pool__eight">
                  <PoolBall n={8} gone={settled?.finish != null} />
                  {active?.ballInHand ? <span className="se-pool__tag">Ball in hand</span> : null}
                  {shownGame?.pressed ? <span className="se-pool__tag is-press">Pressed</span> : null}
                </div>
                <div className="se-pool__side">
                  <div className="se-blackjack__label"><span>You</span><strong>{shownGame ? (shownGame.playerBalls.length ? shownGame.playerBalls.length + ' left' : 'On the 8') : 'Solids'}</strong></div>
                  <BallRow group={SOLIDS} left={shownGame?.playerBalls ?? SOLIDS} />
                </div>
                {recent.length ? (
                  <ol className="se-pool__log" aria-label="Recent shots">
                    {recent.map((event, index) => (
                      <li key={(shownGame?.log.length ?? 0) - recent.length + index} className={event.shooter === 'PLAYER' ? 'is-you' : 'is-them'}>
                        {eventText(event, hustler)}
                      </li>
                    ))}
                  </ol>
                ) : <p className="se-pool__log-empty">Rack them up. You have the break.</p>}
              </div>

              <ActionDock
                label={state.activeGame ? 'Take your shot' : 'Rack them up'}
                onSubmit={(event) => {
                  if (state.activeGame) {
                    event.preventDefault();
                    return;
                  }
                  void rack(event);
                }}
                outcome={settled ? {
                  id: settled.id,
                  title: settled.status === 'WON'
                    ? finishLabel(settled.finish, settled.hustlerName) + ' · ' + signedMoney(settled.netCents)
                    : finishLabel(settled.finish, settled.hustlerName) + ' · ' + signedMoney(settled.netCents),
                  tone: settled.status === 'WON' ? 'good' : 'bad',
                  chips: [
                    { key: 'you', label: 'You', text: settled.playerBalls.length + ' left', tone: 'muted' as const },
                    { key: 'them', label: settled.hustlerName, text: settled.hustlerBalls.length + ' left', tone: 'muted' as const },
                    deltaChip('Net', settled.netCents, { money: true }),
                    { key: 'bankroll', label: 'Floor', text: formatCents(settled.bankrollAfterCents), tone: 'muted' as const },
                  ],
                  receipt: (
                    <div className="se-rows">
                      <div className="se-row"><span className="se-row__label">{settled.tableName} vs {settled.hustlerName}</span><span className="se-row__value">{finishLabel(settled.finish, settled.hustlerName)}</span></div>
                      <div className="se-row"><span className="se-row__label">Staked{settled.pressed ? ' (pressed)' : ''}</span><span className="se-row__value">{formatCents(settled.totalWagerCents)} → {formatCents(settled.totalReturnCents)}</span></div>
                      <div className="se-row se-row--strong"><span className="se-row__label">Net</span><span className={'se-row__value ' + (settled.netCents > 0 ? 'se-good' : settled.netCents < 0 ? 'se-bad' : '')}>{signedMoney(settled.netCents)}</span></div>
                      <div className="se-row"><span className="se-row__label">Floor bankroll</span><span className="se-row__value">{formatCents(settled.bankrollAfterCents)}</span></div>
                    </div>
                  ),
                  onDismiss: () => setLastGame(null),
                } : null}
              >
                {active ? (
                  <>
                    <div>
                      <span className="se-dock__label">{active.playerBalls.length ? 'Your shot' : 'Shooting the 8'}</span>
                      <strong>{active.playerBalls.length} vs {active.hustlerBalls.length}{active.ballInHand ? ' · ball in hand' : ''}</strong>
                      <span>{formatCents(active.totalWagerCents)} on the table</span>
                    </div>
                    <div className="se-pool__shots">
                      {active.shots.map((option) => (
                        <Button
                          key={option.shot}
                          type="button"
                          className={'se-btn' + (option.shot === 'STEADY' ? ' se-btn--primary' : '')}
                          title={SHOT_HINT[option.shot]}
                          disabledReason={busy ? 'The table is busy.' : null}
                          onClick={() => void shoot(option.shot)}
                        >
                          {busy === option.shot ? 'Shooting...' : (
                            <>
                              {option.shot === 'STEADY' && !active.playerBalls.length ? 'Sink the 8' : SHOT_LABEL[option.shot]}
                              <small>{option.shot === 'SAFETY' ? pct(option.scratchBps) + ' foul' : pct(option.potBps) + ' · ' + pct(option.scratchBps) + ' scratch'}</small>
                            </>
                          )}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        className="se-btn se-btn--ghost"
                        title="Double your stake. Once per rack, only while the hustler is ahead."
                        disabledReason={!active.canPress ? (active.pressed ? 'You already pressed this rack.' : 'Press is open while the hustler is ahead and you do not have ball in hand.') : busy ? 'The table is busy.' : null}
                        onClick={() => void press()}
                      >
                        {busy === 'press' ? 'Pressing...' : <>Press<small>+{formatCents(active.wagerCents)}</small></>}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="se-dock__label">{selectedTable.name}</span>
                      <strong>Stake {wagerCents ? formatCents(wagerCents) : '—'}</strong>
                      <span>{casinoPage.openSession ? 'Floor ' + formatCents(casinoPage.openSession.bankrollCents) : 'No session open'}</span>
                    </div>
                    <CasinoBetControl
                      id="pool-stake"
                      label="Stake"
                      className="se-slots__dock-bet"
                      value={wager}
                      disabled={busy !== null}
                      decreaseLabel="Lower the stake"
                      increaseLabel="Raise the stake"
                      onDecrease={() => stepWager(-selectedTable.betStepCents)}
                      onIncrease={() => stepWager(selectedTable.betStepCents)}
                      onChange={(value) => {
                        setWager(value);
                        rackAction.current = newActionId();
                      }}
                      onMax={() => {
                        const bankroll = casinoPage.openSession?.bankrollCents ?? 0;
                        const max = Math.min(selectedTable.maxBetCents, bankroll);
                        const stepped = Math.floor(max / selectedTable.betStepCents) * selectedTable.betStepCents;
                        setWager(String(Math.max(selectedTable.minBetCents, stepped) / 100));
                        rackAction.current = newActionId();
                      }}
                    />
                    <Button type="submit" className="se-btn se-btn--primary" disabledReason={rackBlock}>
                      {busy === 'rack' ? 'Breaking...' : settled ? 'Rack again' : 'Rack & break'}
                    </Button>
                  </>
                )}
              </ActionDock>

              {state.history.length ? (
                <details className="se-blackjack__history">
                  <summary>Rack history · last {state.history.length}</summary>
                  <div className="se-blackjack__history-list">
                    {state.history.map((game) => (
                      <article key={game.id}>
                        <span>
                          <strong>{game.tableName}</strong>
                          <small>{formatWhen(game.settledAt ?? game.createdAt)}</small>
                        </span>
                        <span>{finishLabel(game.finish, game.hustlerName)}</span>
                        <strong className={game.netCents > 0 ? 'is-win' : game.netCents < 0 ? 'is-loss' : ''}>{signedMoney(game.netCents)}</strong>
                      </article>
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
