import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatCents,
  type CasinoPageDto,
  type CasinoRouletteBetKindDto,
  type CasinoRouletteSpinDto,
  type CasinoRouletteStateDto,
} from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
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

function pocketTone(pocket: string): 'red' | 'black' | 'green' {
  if (pocket === '0' || pocket === '00') return 'green';
  return RED.has(Number(pocket)) ? 'red' : 'black';
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

function outsideLabel(kind: CasinoRouletteBetKindDto, selection: string): string {
  if (kind === 'DOZEN') return selection;
  if (kind === 'COLUMN') return 'Column ' + selection;
  if (kind === 'LOW') return '1–18';
  if (kind === 'HIGH') return '19–36';
  return kind.charAt(0) + kind.slice(1).toLowerCase();
}

export function RoulettePanel({ casinoPage, onPageChange }: Props) {
  const [state, setState] = useState<CasinoRouletteStateDto | null>(null);
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [chipCents, setChipCents] = useState(500);
  const [bets, setBets] = useState<PendingBet[]>([]);
  const [insideKind, setInsideKind] = useState<'SPLIT' | 'STREET' | 'CORNER' | 'SIX_LINE'>('SPLIT');
  const [insideSelection, setInsideSelection] = useState('');
  const [lastSpin, setLastSpin] = useState<CasinoRouletteSpinDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
    setNotice(null);
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
    setSpinning(true);
    setError(null);
    setNotice(null);
    try {
      const result = await casinoApi.rouletteSpin({
        tableKey: table.key,
        bets,
        actionId: actionId.current,
      });
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) await wait(850);
      onPageChange(result.page);
      setState(result.roulette);
      setLastSpin(result.spin);
      setNotice(
        result.spin.netCents > 0
          ? result.spin.pocket + ' hit · won ' + formatCents(result.spin.netCents) + '.'
          : result.spin.netCents < 0
            ? result.spin.pocket + ' hit · lost ' + formatCents(Math.abs(result.spin.netCents)) + '.'
            : result.spin.pocket + ' hit · push.',
      );
      actionId.current = newActionId();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The roulette dealer could not complete that spin.');
    } finally {
      setSpinning(false);
      setBusy(false);
    }
  }

  const outside: Array<[CasinoRouletteBetKindDto, string]> = [
    ['LOW', 'LOW'],
    ['EVEN', 'EVEN'],
    ['RED', 'RED'],
    ['BLACK', 'BLACK'],
    ['ODD', 'ODD'],
    ['HIGH', 'HIGH'],
    ['DOZEN', '1-12'],
    ['DOZEN', '13-24'],
    ['DOZEN', '25-36'],
    ['COLUMN', '1'],
    ['COLUMN', '2'],
    ['COLUMN', '3'],
  ];

  return (
    <Panel title="Roulette" aside="1.2.0-D">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone={lastSpin?.netCents && lastSpin.netCents > 0 ? 'success' : 'info'}>{notice}</Alert> : null}
      {!state ? <p className="se-muted">Opening the roulette room...</p> : null}
      {state && !state.enabled ? <p className="se-muted">Roulette is not enabled in this round.</p> : null}

      {state?.enabled ? (
        <div className="se-roulette">
          <div className="se-roulette__tables" role="group" aria-label="Roulette tables">
            {state.tables.map((candidate) => (
              <button
                key={candidate.key}
                type="button"
                className={'se-roulette__table' + (candidate.key === table?.key ? ' is-selected' : '')}
                aria-pressed={candidate.key === table?.key}
                disabled={busy}
                onClick={() => {
                  setSelectedTableKey(candidate.key);
                  setChipCents(candidate.betStepCents);
                  setBets([]);
                  setLastSpin(null);
                  actionId.current = newActionId();
                }}
              >
                <span><strong>{candidate.name}</strong><small>{candidate.wheel === 'AMERICAN' ? '0 + 00' : 'Single 0'}</small></span>
                <small>{formatCents(candidate.minBetCents)}–{formatCents(candidate.maxBetCents)} per position</small>
              </button>
            ))}
          </div>

          {table ? (
            <>
              <div className="se-roulette__stage">
                <div className={'se-roulette__wheel' + (spinning ? ' is-spinning' : '')} aria-label="Roulette wheel">
                  <div className="se-roulette__wheel-ring" aria-hidden="true" />
                  <div className={'se-roulette__wheel-result is-' + (lastSpin ? lastSpin.color.toLowerCase() : 'idle')}>
                    <small>{spinning ? 'Spinning' : lastSpin ? 'Last' : table.wheel === 'AMERICAN' ? 'American' : 'European'}</small>
                    <strong>{spinning ? '•' : lastSpin?.pocket ?? '◉'}</strong>
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

              <div className="se-roulette__board">
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

                <div className="se-roulette__outside">
                  {outside.map(([kind, selection]) => {
                    const amount = betAt(kind, selection);
                    return (
                      <button
                        key={kind + selection}
                        type="button"
                        className={kind === 'RED' ? 'is-red' : kind === 'BLACK' ? 'is-black' : ''}
                        disabled={busy}
                        onClick={() => addBet(kind, selection)}
                      >
                        <strong>{outsideLabel(kind, selection)}</strong>
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
                      <span>{outsideLabel(bet.kind, bet.selection === bet.kind ? bet.kind : bet.selection)}</span>
                      <strong>{formatCents(bet.amountCents)}</strong>
                      <small>×</small>
                    </button>
                  ))}
                </div>
              ) : <p className="se-hint">Pick a chip, then tap numbers or outside bets. Tap a listed position to remove it.</p>}

              <div className="se-roulette__controls">
                <button
                  type="button"
                  className="se-btn se-btn--ghost"
                  disabled={!bets.length || busy}
                  onClick={() => {
                    setBets([]);
                    setLastSpin(null);
                    actionId.current = newActionId();
                  }}
                >
                  Clear
                </button>
                <Button
                  type="button"
                  className="se-btn se-roulette__spin"
                  disabledReason={
                    !table.availableHere
                      ? 'This wheel is not available in this casino.'
                      : !casinoPage.openSession
                        ? 'Open a casino bankroll first.'
                        : !bets.length
                          ? 'Place at least one bet.'
                          : totalBetCents > table.maxTotalBetCents
                            ? 'This layout is over the table maximum.'
                            : totalBetCents > bankrollCents
                              ? 'There are not enough chips in the bankroll.'
                              : busy ? 'Wheel is spinning.' : null
                  }
                  onClick={() => void spin()}
                >
                  {spinning ? 'SPINNING…' : 'SPIN WHEEL · ' + formatCents(totalBetCents)}
                </Button>
              </div>

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
