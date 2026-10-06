import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  formatCents,
  type CasinoPageDto,
  type CasinoRouletteBetKindDto,
  type CasinoRouletteSpinDto,
  type CasinoRouletteStateDto,
} from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { ActionDock, deltaChip } from './ActionDock.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { newActionId } from '../utils/actionId.js';

type Props = {
  casinoPage: CasinoPageDto;
  onPageChange: (page: CasinoPageDto) => void;
};

type PendingBet = {
  kind: CasinoRouletteBetKindDto;
  selection: string;
  amountCents: number;
};

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const EUROPEAN_WHEEL = ['0', '32', '15', '19', '4', '21', '2', '25', '17', '34', '6', '27', '13', '36', '11', '30', '8', '23', '10', '5', '24', '16', '33', '1', '20', '14', '31', '9', '22', '18', '29', '7', '28', '12', '35', '3', '26'];
const AMERICAN_WHEEL = ['0', '28', '9', '26', '30', '11', '7', '20', '32', '17', '5', '22', '34', '15', '3', '24', '36', '13', '1', '00', '27', '10', '25', '29', '12', '8', '19', '31', '18', '6', '21', '33', '16', '4', '23', '35', '14', '2'];
const DEFAULT_BALL_ANGLE = -90;
const SPIN_ANIMATION_MS = 4200;

function pocketTone(pocket: string): 'red' | 'black' | 'green' {
  if (pocket === '0' || pocket === '00') return 'green';
  return RED.has(Number(pocket)) ? 'red' : 'black';
}

function ballAngleForPocket(wheelPockets: string[], pocket?: string | null): number {
  const index = pocket ? wheelPockets.indexOf(pocket) : -1;
  if (index < 0) return DEFAULT_BALL_ANGLE;
  return index * (360 / wheelPockets.length) + DEFAULT_BALL_ANGLE;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function insideOptions(kind: 'SPLIT' | 'STREET' | 'CORNER' | 'SIX_LINE'): string[] {
  if (kind === 'STREET') {
    return Array.from({ length: 12 }, (_, row) => {
      const start = row * 3 + 1;
      return [start, start + 1, start + 2].join('-');
    });
  }
  if (kind === 'CORNER') {
    const values: string[] = [];
    for (let start = 1; start <= 32; start++) {
      if (start % 3 === 0) continue;
      values.push([start, start + 1, start + 3, start + 4].join('-'));
    }
    return values;
  }
  if (kind === 'SIX_LINE') {
    return Array.from({ length: 11 }, (_, row) => {
      const start = row * 3 + 1;
      return Array.from({ length: 6 }, (__, index) => start + index).join('-');
    });
  }

  const values = new Set<string>();
  for (let value = 1; value <= 36; value++) {
    const row = Math.floor((value - 1) / 3);
    const col = (value - 1) % 3;
    if (col < 2) values.add(value + '-' + (value + 1));
    if (row < 11) values.add(value + '-' + (value + 3));
  }
  return [...values];
}

function betLabel(kind: CasinoRouletteBetKindDto, selection: string): string {
  if (kind === 'STRAIGHT') return selection;
  if (kind === 'SPLIT') return 'Split ' + selection;
  if (kind === 'STREET') return 'Street ' + selection;
  if (kind === 'CORNER') return 'Corner ' + selection;
  if (kind === 'SIX_LINE') return 'Six line ' + selection;
  if (kind === 'DOZEN') return selection;
  if (kind === 'COLUMN') return 'Column ' + selection;
  if (kind === 'LOW') return '1–18';
  if (kind === 'HIGH') return '19–36';
  return kind.charAt(0) + kind.slice(1).toLowerCase();
}

function signedMoney(value: number): string {
  if (value === 0) return '$0.00';
  return (value > 0 ? '+' : '−') + formatCents(Math.abs(value));
}

export function RoulettePanel({ casinoPage, onPageChange }: Props) {
  const [state, setState] = useState<CasinoRouletteStateDto | null>(null);
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [chipCents, setChipCents] = useState(500);
  const [bets, setBets] = useState<PendingBet[]>([]);
  const [insideKind, setInsideKind] = useState<'SPLIT' | 'STREET' | 'CORNER' | 'SIX_LINE'>('SPLIT');
  const [insideSelection, setInsideSelection] = useState('');
  const [lastSpin, setLastSpin] = useState<CasinoRouletteSpinDto | null>(null);
  const [wheelSpin, setWheelSpin] = useState<CasinoRouletteSpinDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinStartAngle, setSpinStartAngle] = useState(DEFAULT_BALL_ANGLE);
  const [spinEndAngle, setSpinEndAngle] = useState(DEFAULT_BALL_ANGLE + 2520);
  const [error, setError] = useState<string | null>(null);
  const actionId = useRef(newActionId());

  useEffect(() => {
    void casinoApi.roulette()
      .then((next) => {
        setState(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : 'Could not open the roulette room.');
      });
  }, [casinoPage.currentCitySlug, casinoPage.openSession?.id]);

  useEffect(() => {
    if (!state?.enabled || !state.tables.length) return;
    const current = state.tables.find((table) => table.key === selectedTableKey);
    if (current) return;
    const next = state.tables.find((table) => table.availableHere) ?? state.tables[0]!;
    setSelectedTableKey(next.key);
    setChipCents(next.betStepCents);
    setBets([]);
    actionId.current = newActionId();
  }, [state, selectedTableKey]);

  const table = useMemo(
    () => state?.tables.find((candidate) => candidate.key === selectedTableKey) ?? null,
    [state, selectedTableKey],
  );
  const totalBetCents = bets.reduce((sum, bet) => sum + bet.amountCents, 0);
  const bankrollCents = casinoPage.openSession?.bankrollCents ?? 0;
  const comboOptions = useMemo(() => insideOptions(insideKind), [insideKind]);
  const wheelPockets = table?.wheel === 'AMERICAN' ? AMERICAN_WHEEL : EUROPEAN_WHEEL;
  const visibleWheelSpin = wheelSpin ?? lastSpin;
  const ballAngle = ballAngleForPocket(wheelPockets, visibleWheelSpin?.pocket);
  const wheelStyle = {
    '--se-ball-angle': `${ballAngle}deg`,
    '--se-ball-start-angle': `${spinStartAngle}deg`,
    '--se-ball-end-angle': `${spinEndAngle}deg`,
  } as CSSProperties;

  useEffect(() => {
    setInsideSelection(comboOptions[0] ?? '');
  }, [comboOptions]);

  const chipChoices = useMemo(() => {
    if (!table) return [];
    const raw = [1, 2, 5, 10, 25, 50].map((multiple) => table.betStepCents * multiple);
    return [...new Set(raw.filter((value) => value <= table.maxBetCents))];
  }, [table]);

  function addBet(kind: CasinoRouletteBetKindDto, selection: string) {
    if (!table || busy) return;
    setBets((current) => {
      const index = current.findIndex((bet) => bet.kind === kind && bet.selection === selection);
      if (index < 0) {
        if (chipCents > table.maxBetCents) return current;
        return [...current, { kind, selection, amountCents: chipCents }];
      }
      const existing = current[index]!;
      const nextAmount = Math.min(table.maxBetCents, existing.amountCents + chipCents);
      const next = [...current];
      next[index] = { ...existing, amountCents: nextAmount };
      return next;
    });
    setLastSpin(null);
    setWheelSpin(null);
    actionId.current = newActionId();
  }

  function removeBet(kind: CasinoRouletteBetKindDto, selection: string) {
    setBets((current) => current.filter((bet) => bet.kind !== kind || bet.selection !== selection));
    actionId.current = newActionId();
  }

  function betAt(kind: CasinoRouletteBetKindDto, selection: string): number {
    return bets.find((bet) => bet.kind === kind && bet.selection === selection)?.amountCents ?? 0;
  }

  async function spin() {
    if (!table || !bets.length) return;
    setBusy(true);
    setError(null);
    try {
      const startAngle = ballAngleForPocket(wheelPockets, lastSpin?.pocket);
      const result = await casinoApi.rouletteSpin({
        tableKey: table.key,
        bets,
        actionId: actionId.current,
      });
      const landingAngle = ballAngleForPocket(wheelPockets, result.spin.pocket);
      setSpinStartAngle(startAngle);
      setSpinEndAngle(landingAngle + 2520);
      setWheelSpin(result.spin);
      setSpinning(true);
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await wait(SPIN_ANIMATION_MS);
      onPageChange(result.page);
      setState(result.roulette);
      setLastSpin(result.spin);
      setWheelSpin(null);
      actionId.current = newActionId();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The roulette dealer could not complete that spin.');
    } finally {
      setSpinning(false);
      setBusy(false);
    }
  }

  const columns: Array<[CasinoRouletteBetKindDto, string]> = [['COLUMN', '1'], ['COLUMN', '2'], ['COLUMN', '3']];
  const dozens: Array<[CasinoRouletteBetKindDto, string]> = [['DOZEN', '1-12'], ['DOZEN', '13-24'], ['DOZEN', '25-36']];
  const evenMoney: Array<[CasinoRouletteBetKindDto, string]> = [
    ['LOW', 'LOW'],
    ['EVEN', 'EVEN'],
    ['RED', 'RED'],
    ['BLACK', 'BLACK'],
    ['ODD', 'ODD'],
    ['HIGH', 'HIGH'],
  ];
  const spinBlock = !table
    ? 'Pick a wheel first.'
    : !table.availableHere
      ? table.lockedReason ?? 'This wheel is not available in this casino.'
      : !casinoPage.openSession
        ? 'Open a casino bankroll first.'
        : casinoPage.openSession.citySlug !== casinoPage.currentCitySlug
          ? 'Your open bankroll belongs to another casino.'
          : !bets.length
            ? 'Place at least one bet.'
            : totalBetCents > table.maxTotalBetCents
              ? 'This layout is over the table maximum.'
              : totalBetCents > bankrollCents
                ? 'There are not enough chips in the bankroll.'
                : busy ? 'Wheel is spinning.' : null;

  return (
    <Panel title="Roulette" aside="1.2.0-D">
      {error ? <Alert>{error}</Alert> : null}
      {!state ? <p className="se-muted">Opening the roulette room...</p> : null}
      {state && !state.enabled ? <p className="se-muted">Roulette is not enabled in this round.</p> : null}

      {state?.enabled ? (
        <div className="se-roulette">
          <div className="se-casino-picker" role="group" aria-label="Roulette tables">
            {state.tables.map((candidate) => (
              <button
                key={candidate.key}
                type="button"
                className={'se-casino-picker__opt' + (candidate.key === table?.key ? ' is-selected' : '') + (candidate.availableHere ? '' : ' is-away')}
                aria-pressed={candidate.key === table?.key}
                disabled={busy}
                title={candidate.availableHere ? undefined : candidate.lockedReason ?? 'Not in this room'}
                onClick={() => {
                  setSelectedTableKey(candidate.key);
                  setChipCents(candidate.betStepCents);
                  setBets([]);
                  setLastSpin(null);
                  setWheelSpin(null);
                  actionId.current = newActionId();
                }}
              >
                <strong>{candidate.name}{candidate.room === 'VIP' ? <em className="se-casino-vip-badge">VIP</em> : null}</strong>
                <small>{candidate.wheel === 'AMERICAN' ? '0 + 00' : 'Single 0'} · {formatCents(candidate.minBetCents)}–{formatCents(candidate.maxBetCents)}</small>
              </button>
            ))}
          </div>

          {table ? (
            <>
              <div className="se-roulette__stage">
                <div
                  className={'se-roulette__wheel' + (spinning ? ' is-spinning' : '')}
                  style={wheelStyle}
                  aria-label={spinning ? 'Roulette wheel spinning' : visibleWheelSpin ? `Roulette wheel, last pocket ${visibleWheelSpin.pocket}` : 'Roulette wheel'}
                >
                  <span className="se-sr">
                    {spinning ? 'Spinning' : visibleWheelSpin ? `Last pocket ${visibleWheelSpin.pocket}, ${visibleWheelSpin.color.toLowerCase()}` : table.wheel === 'AMERICAN' ? 'American wheel' : 'European wheel'}
                  </span>
                  <div className="se-roulette__wheel-bowl" aria-hidden="true" />
                  <div className="se-roulette__pockets" aria-hidden="true">
                    {wheelPockets.map((pocket, index) => (
                      <span
                        key={pocket}
                        className={'se-roulette__pocket is-' + pocketTone(pocket)}
                        style={{
                          transform: `translate(-50%, -50%) rotate(${index * (360 / wheelPockets.length)}deg) translateY(calc(var(--se-wheel-pocket-radius) * -1))`,
                        }}
                      >
                        {pocket}
                      </span>
                    ))}
                  </div>
                  <div className="se-roulette__wheel-ring" aria-hidden="true" />
                  <div className="se-roulette__ball-track" aria-hidden="true">
                    <span className="se-roulette__ball" />
                  </div>
                  <div className="se-roulette__wheel-hub" aria-hidden="true">
                    <span className="se-roulette__spoke" />
                    <span className="se-roulette__spoke" />
                    <span className="se-roulette__spoke" />
                    <span className="se-roulette__spoke" />
                  </div>
                </div>

                <div className="se-roulette__readout">
                  <span><small>Bankroll</small><strong>{formatCents(bankrollCents)}</strong></span>
                  <span><small>On table</small><strong>{formatCents(totalBetCents)}</strong></span>
                  <span><small>Positions</small><strong>{bets.length}</strong></span>
                  <span><small>Table max</small><strong>{formatCents(table.maxTotalBetCents)}</strong></span>
                </div>

                {state.history.length ? (
                  <div className="se-roulette__history-strip" aria-label="Recent roulette results">
                    {state.history.slice(0, 12).map((spin) => (
                      <span key={spin.actionId} className={'is-' + spin.color.toLowerCase()}>{spin.pocket}</span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="se-roulette__chips">
                <strong>Chip</strong>
                <div role="group" aria-label="Roulette chip value">
                  {chipChoices.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={chipCents === value}
                      className={'se-roulette__chip' + (chipCents === value ? ' is-selected' : '')}
                      disabled={busy}
                      onClick={() => setChipCents(value)}
                    >
                      {formatCents(value)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="se-roulette__felt" aria-label="Roulette betting layout">
                <div className="se-roulette__zeroes">
                  <button type="button" className="is-green" onClick={() => addBet('STRAIGHT', '0')}>
                    <strong>0</strong>{betAt('STRAIGHT', '0') ? <small>{formatCents(betAt('STRAIGHT', '0'))}</small> : null}
                  </button>
                  {table.wheel === 'AMERICAN' ? (
                    <button type="button" className="is-green" onClick={() => addBet('STRAIGHT', '00')}>
                      <strong>00</strong>{betAt('STRAIGHT', '00') ? <small>{formatCents(betAt('STRAIGHT', '00'))}</small> : null}
                    </button>
                  ) : null}
                </div>

                <div className="se-roulette__number-table">
                  <div className="se-roulette__numbers">
                    {Array.from({ length: 36 }, (_, index) => String(index + 1)).map((pocket) => {
                      const amount = betAt('STRAIGHT', pocket);
                      return (
                        <button
                          key={pocket}
                          type="button"
                          className={'is-' + pocketTone(pocket)}
                          disabled={busy}
                          onClick={() => addBet('STRAIGHT', pocket)}
                        >
                          <strong>{pocket}</strong>
                          {amount ? <small>{formatCents(amount)}</small> : null}
                        </button>
                      );
                    })}
                  </div>

                  <div className="se-roulette__columns" aria-label="Column bets">
                    {columns.map(([kind, selection]) => {
                      const amount = betAt(kind, selection);
                      return (
                        <button
                          key={kind + selection}
                          type="button"
                          disabled={busy}
                          onClick={() => addBet(kind, selection)}
                        >
                          <strong>2 to 1</strong>
                          {amount ? <small>{formatCents(amount)}</small> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="se-roulette__dozens" aria-label="Dozen bets">
                  {dozens.map(([kind, selection]) => {
                    const amount = betAt(kind, selection);
                    return (
                      <button
                        key={kind + selection}
                        type="button"
                        disabled={busy}
                        onClick={() => addBet(kind, selection)}
                      >
                        <strong>{selection}</strong>
                        {amount ? <small>{formatCents(amount)}</small> : null}
                      </button>
                    );
                  })}
                </div>

                <div className="se-roulette__even-money" aria-label="Even money bets">
                  {evenMoney.map(([kind, selection]) => {
                    const amount = betAt(kind, selection);
                    return (
                      <button
                        key={kind + selection}
                        type="button"
                        className={kind === 'RED' ? 'is-red' : kind === 'BLACK' ? 'is-black' : ''}
                        disabled={busy}
                        onClick={() => addBet(kind, selection)}
                      >
                        <strong>{betLabel(kind, selection)}</strong>
                        {amount ? <small>{formatCents(amount)}</small> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <details className="se-roulette__inside-builder">
                <summary>Inside combinations · split / street / corner / six line</summary>
                <div>
                  <label>
                    <span>Bet type</span>
                    <select
                      className="se-input"
                      value={insideKind}
                      disabled={busy}
                      onChange={(event) => setInsideKind(event.target.value as typeof insideKind)}
                    >
                      <option value="SPLIT">Split · 17:1</option>
                      <option value="STREET">Street · 11:1</option>
                      <option value="CORNER">Corner · 8:1</option>
                      <option value="SIX_LINE">Six line · 5:1</option>
                    </select>
                  </label>
                  <label>
                    <span>Pockets</span>
                    <select
                      className="se-input"
                      value={insideSelection}
                      disabled={busy}
                      onChange={(event) => setInsideSelection(event.target.value)}
                    >
                      {comboOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <Button
                    type="button"
                    className="se-btn se-btn--ghost"
                    disabledReason={!insideSelection ? 'Pick a valid inside combination.' : busy ? 'Wheel is spinning.' : null}
                    onClick={() => addBet(insideKind, insideSelection)}
                  >
                    Add {formatCents(chipCents)}
                  </Button>
                </div>
              </details>

              {bets.length ? (
                <div className="se-roulette__bets">
                  {bets.map((bet) => (
                    <button
                      key={bet.kind + ':' + bet.selection}
                      type="button"
                      disabled={busy}
                      onClick={() => removeBet(bet.kind, bet.selection)}
                      title="Tap to remove this position"
                    >
                      <span>{betLabel(bet.kind, bet.selection === bet.kind ? bet.kind : bet.selection)}</span>
                      <strong>{formatCents(bet.amountCents)}</strong>
                      <small>×</small>
                    </button>
                  ))}
                </div>
              ) : <p className="se-hint">Pick a chip, then tap numbers or outside bets. Tap a listed position to remove it.</p>}

              <ActionDock
                label="Spin the roulette wheel"
                onSubmit={(event) => {
                  event.preventDefault();
                  void spin();
                }}
                outcome={lastSpin ? {
                  id: lastSpin.actionId,
                  title: lastSpin.netCents > 0
                    ? lastSpin.pocket + ' hit · won ' + formatCents(lastSpin.netCents)
                    : lastSpin.netCents < 0
                      ? lastSpin.pocket + ' hit · lost ' + formatCents(Math.abs(lastSpin.netCents))
                      : lastSpin.pocket + ' hit · push',
                  tone: lastSpin.netCents >= 0 ? 'good' : 'bad',
                  chips: [
                    { key: 'pocket', label: 'Pocket', text: lastSpin.pocket, tone: 'muted' as const },
                    deltaChip('Net', lastSpin.netCents, { money: true }),
                    { key: 'floor', label: 'Floor', text: formatCents(lastSpin.bankrollAfterCents), tone: 'muted' as const },
                  ],
                  receipt: (
                    <div className="se-rows">
                      <div className="se-row"><span className="se-row__label">Wheel</span><span className="se-row__value">{lastSpin.tableName}</span></div>
                      <div className="se-row"><span className="se-row__label">Pocket</span><span className="se-row__value">{lastSpin.pocket} · {lastSpin.color.toLowerCase()}</span></div>
                      <div className="se-row"><span className="se-row__label">Positions</span><span className="se-row__value">{lastSpin.bets.length}</span></div>
                      <div className="se-row se-row--strong"><span className="se-row__label">Net</span><span className={'se-row__value ' + (lastSpin.netCents >= 0 ? 'se-good' : 'se-bad')}>{signedMoney(lastSpin.netCents)}</span></div>
                      <div className="se-row"><span className="se-row__label">Floor bankroll</span><span className="se-row__value">{formatCents(lastSpin.bankrollAfterCents)}</span></div>
                    </div>
                  ),
                  onDismiss: () => {
                    setLastSpin(null);
                  },
                } : null}
              >
                <div>
                  <span className="se-dock__label">{table.name}</span>
                  <strong>{bets.length} position{bets.length === 1 ? '' : 's'} · {formatCents(totalBetCents)}</strong>
                  <span>{casinoPage.openSession ? 'Floor ' + formatCents(bankrollCents) : 'No session open'}</span>
                </div>
                <button
                  type="button"
                  className="se-btn se-btn--ghost"
                  disabled={!bets.length || busy}
                  onClick={() => {
                    setBets([]);
                    setLastSpin(null);
                    setWheelSpin(null);
                    actionId.current = newActionId();
                  }}
                >
                  Clear
                </button>
                <Button type="submit" className="se-btn se-btn--primary se-roulette__spin" disabledReason={spinBlock}>
                  {spinning ? 'Spinning...' : 'Spin wheel'}
                </Button>
              </ActionDock>

              <details className="se-roulette__paytable">
                <summary>Roulette payouts</summary>
                <p>Straight 35:1 · Split 17:1 · Street 11:1 · Corner 8:1 · Six line 5:1 · Dozen/Column 2:1 · Red/Black/Odd/Even/Low/High 1:1.</p>
              </details>
            </>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
