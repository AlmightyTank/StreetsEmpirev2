import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  formatCents,
  type CasinoPageDto,
  type CasinoStreetDiceRoundDto,
  type CasinoStreetDiceStateDto,
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

const DIE = ['','⚀','⚁','⚂','⚃','⚄','⚅'];

function outcomeCopy(round: CasinoStreetDiceRoundDto): string {
  if (round.outcome === 'POINT') return 'Point is ' + round.point + '. Roll it again before a 7.';
  if (round.outcome === 'CONTINUE') return 'No decision. Point stays ' + round.point + '.';
  if (round.outcome === 'WIN') return round.point ? 'Point made. Street wins.' : 'Natural winner on the come-out.';
  if (round.outcome === 'LOSE') return round.point ? 'Seven out. House takes the line.' : 'Craps on the come-out.';
  return 'Put a line bet down and throw the dice.';
}

export function StreetDicePanel({ casinoPage, onPageChange }: Props) {
  const [state, setState] = useState<CasinoStreetDiceStateDto | null>(null);
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [wager, setWager] = useState('10');
  const [odds, setOdds] = useState('10');
  const [lastRound, setLastRound] = useState<CasinoStreetDiceRoundDto | null>(null);
  const [busy, setBusy] = useState<'start' | 'roll' | 'odds' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const startAction = useRef(newActionId());
  const rollAction = useRef(newActionId());
  const oddsAction = useRef(newActionId());

  useEffect(() => {
    void casinoApi.streetDice()
      .then((next) => {
        setState(next);
        if (next.activeRound) setLastRound(next.activeRound);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : 'Could not open the Street Dice table.');
      });
  }, [casinoPage.currentCitySlug, casinoPage.openSession?.id]);

  useEffect(() => {
    if (!state?.enabled || !state.tables.length) return;
    if (state.activeRound) {
      setSelectedTableKey(state.activeRound.tableKey);
      return;
    }
    const current = state.tables.find((table) => table.key === selectedTableKey);
    if (current) return;
    const next = state.tables.find((table) => table.availableHere) ?? state.tables[0]!;
    setSelectedTableKey(next.key);
    setWager(String(next.minBetCents / 100));
    setOdds(String(next.betStepCents / 100));
  }, [state, selectedTableKey]);

  const table = useMemo(
    () => state?.tables.find((candidate) => candidate.key === selectedTableKey) ?? null,
    [state, selectedTableKey],
  );
  const shownRound = state?.activeRound ?? lastRound ?? state?.history[0] ?? null;
  const wagerCents = dollarsToCents(wager);
  const oddsCents = dollarsToCents(odds);
  const bankrollCents = casinoPage.openSession?.bankrollCents ?? 0;
  const active = state?.activeRound ?? null;
  const wagerValid = Boolean(
    table
    && wagerCents
    && wagerCents >= table.minBetCents
    && wagerCents <= table.maxBetCents
    && wagerCents % table.betStepCents === 0
  );
  const remainingOddsCents = active
    ? Math.max(0, active.maxOddsCents - active.oddsWagerCents)
    : 0;

  function resetActions() {
    startAction.current = newActionId();
    rollAction.current = newActionId();
    oddsAction.current = newActionId();
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    if (!table || !wagerCents) return;
    setBusy('start');
    setError(null);
    setNotice(null);
    try {
      const result = await casinoApi.streetDiceStart({
        tableKey: table.key,
        wagerCents,
        actionId: startAction.current,
      });
      onPageChange(result.page);
      setState(result.streetDice);
      setLastRound(result.round);
      setNotice(outcomeCopy(result.round));
      resetActions();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The dice table could not start that round.');
    } finally {
      setBusy(null);
    }
  }

  async function roll() {
    if (!active) return;
    setBusy('roll');
    setError(null);
    setNotice(null);
    try {
      const result = await casinoApi.streetDiceRoll({
        roundId: active.id,
        actionId: rollAction.current,
      });
      onPageChange(result.page);
      setState(result.streetDice);
      setLastRound(result.round);
      setNotice(outcomeCopy(result.round));
      rollAction.current = newActionId();
      if (result.round.status === 'SETTLED') {
        startAction.current = newActionId();
        oddsAction.current = newActionId();
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The shooter could not complete that roll.');
    } finally {
      setBusy(null);
    }
  }

  async function addOdds() {
    if (!active || !oddsCents) return;
    setBusy('odds');
    setError(null);
    setNotice(null);
    try {
      const result = await casinoApi.streetDiceOdds({
        roundId: active.id,
        amountCents: oddsCents,
        actionId: oddsAction.current,
      });
      onPageChange(result.page);
      setState(result.streetDice);
      setLastRound(result.round);
      setNotice('Backed point ' + result.round.point + ' with ' + formatCents(result.round.oddsWagerCents) + ' total odds.');
      oddsAction.current = newActionId();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The table could not add those odds.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Street Dice" aside="1.2.0-D">
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone={shownRound?.outcome === 'WIN' ? 'success' : 'info'}>{notice}</Alert> : null}
      {!state ? <p className="se-muted">Finding a shooter...</p> : null}
      {state && !state.enabled ? <p className="se-muted">Street Dice is not enabled in this round.</p> : null}

      {state?.enabled ? (
        <div className={'se-street-dice' + (active ? ' has-active-point' : '')}>
          <div className="se-street-dice__tables" role="group" aria-label="Street Dice tables">
            {state.tables.map((candidate) => (
              <button
                key={candidate.key}
                type="button"
                disabled={busy !== null || Boolean(active)}
                aria-pressed={candidate.key === table?.key}
                className={'se-street-dice__table' + (candidate.key === table?.key ? ' is-selected' : '')}
                onClick={() => {
                  setSelectedTableKey(candidate.key);
                  setWager(String(candidate.minBetCents / 100));
                  setOdds(String(candidate.betStepCents / 100));
                  setLastRound(null);
                  resetActions();
                }}
              >
                <span><strong>{candidate.name}</strong><small>Up to {candidate.maxOddsMultiple}× odds</small></span>
                <small>{formatCents(candidate.minBetCents)}–{formatCents(candidate.maxBetCents)} line</small>
              </button>
            ))}
          </div>

          {table ? (
            <>
              <div className="se-street-dice__felt">
                <div className="se-street-dice__point">
                  <small>POINT</small>
                  <strong>{shownRound?.point ?? 'OFF'}</strong>
                </div>

                <div className={'se-street-dice__dice' + (busy === 'roll' || busy === 'start' ? ' is-rolling' : '')}>
                  <span aria-label={shownRound?.dice ? 'Die one: ' + shownRound.dice[0] : 'Die one'}>
                    {shownRound?.dice ? DIE[shownRound.dice[0]] : '⚄'}
                  </span>
                  <span aria-label={shownRound?.dice ? 'Die two: ' + shownRound.dice[1] : 'Die two'}>
                    {shownRound?.dice ? DIE[shownRound.dice[1]] : '⚂'}
                  </span>
                </div>

                <div className="se-street-dice__call">
                  <span>{shownRound?.total ? 'ROLL ' + shownRound.total : 'COME OUT'}</span>
                  <strong>{shownRound ? outcomeCopy(shownRound) : '7 or 11 wins. 2, 3 or 12 loses. Other box numbers set the point.'}</strong>
                </div>

                <div className="se-street-dice__meter">
                  <span><small>Bankroll</small><strong>{formatCents(bankrollCents)}</strong></span>
                  <span><small>Line</small><strong>{shownRound ? formatCents(shownRound.lineWagerCents) : '—'}</strong></span>
                  <span><small>Odds</small><strong>{shownRound?.oddsWagerCents ? formatCents(shownRound.oddsWagerCents) : '—'}</strong></span>
                  <span><small>{shownRound?.status === 'SETTLED' ? 'Net' : 'At risk'}</small><strong>{shownRound ? shownRound.status === 'SETTLED' ? signedMoney(shownRound.netCents) : formatCents(shownRound.lineWagerCents + shownRound.oddsWagerCents) : '—'}</strong></span>
                </div>

                {active ? (
                  <>
                    {active.canAddOdds ? (
                      <div className="se-street-dice__odds">
                        <div>
                          <span>True odds behind point {active.point}</span>
                          <small>{formatCents(active.oddsWagerCents)} / {formatCents(active.maxOddsCents)} backed</small>
                        </div>
                        <div className="se-street-dice__odds-controls">
                          <button
                            type="button"
                            className="se-btn se-btn--ghost"
                            disabled={busy !== null}
                            onClick={() => {
                              const current = oddsCents ?? table.betStepCents;
                              setOdds(String(Math.max(table.betStepCents, current - table.betStepCents) / 100));
                            }}
                          >−</button>
                          <input
                            className="se-input"
                            inputMode="decimal"
                            value={odds}
                            disabled={busy !== null}
                            onChange={(event) => setOdds(event.target.value)}
                          />
                          <button
                            type="button"
                            className="se-btn se-btn--ghost"
                            disabled={busy !== null}
                            onClick={() => {
                              const current = oddsCents ?? table.betStepCents;
                              setOdds(String(Math.min(remainingOddsCents, current + table.betStepCents) / 100));
                            }}
                          >+</button>
                          <button
                            type="button"
                            className="se-btn se-btn--ghost"
                            disabled={busy !== null || remainingOddsCents <= 0}
                            onClick={() => setOdds(String(remainingOddsCents / 100))}
                          >Max</button>
                          <Button
                            type="button"
                            className="se-btn"
                            disabledReason={
                              !oddsCents
                                ? 'Enter an odds amount.'
                                : oddsCents > remainingOddsCents
                                  ? 'That exceeds the remaining odds limit.'
                                  : oddsCents > bankrollCents
                                    ? 'There are not enough chips in the bankroll.'
                                    : oddsCents % table.betStepCents !== 0
                                      ? 'Use the table chip increment.'
                                      : busy ? 'Dice are moving.' : null
                            }
                            onClick={() => void addOdds()}
                          >
                            {busy === 'odds' ? 'Backing…' : 'Add odds'}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="se-street-dice__actions">
                      <Button
                        type="button"
                        className="se-btn se-street-dice__roll"
                        disabledReason={!active.canRoll ? 'There is no point waiting for a roll.' : busy ? 'Dice are moving.' : null}
                        onClick={() => void roll()}
                      >
                        {busy === 'roll' ? 'ROLLING…' : 'ROLL DICE'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <form className="se-street-dice__start" onSubmit={start}>
                    <label>
                      <span>Pass line bet ($)</span>
                      <div>
                        <button
                          type="button"
                          className="se-btn se-btn--ghost"
                          disabled={busy !== null}
                          onClick={() => {
                            const current = wagerCents ?? table.minBetCents;
                            setWager(String(Math.max(table.minBetCents, current - table.betStepCents) / 100));
                            startAction.current = newActionId();
                          }}
                        >−</button>
                        <input
                          className="se-input"
                          inputMode="decimal"
                          value={wager}
                          disabled={busy !== null}
                          onChange={(event) => {
                            setWager(event.target.value);
                            startAction.current = newActionId();
                          }}
                        />
                        <button
                          type="button"
                          className="se-btn se-btn--ghost"
                          disabled={busy !== null}
                          onClick={() => {
                            const current = wagerCents ?? table.minBetCents;
                            setWager(String(Math.min(table.maxBetCents, current + table.betStepCents) / 100));
                            startAction.current = newActionId();
                          }}
                        >+</button>
                        <button
                          type="button"
                          className="se-btn se-btn--ghost"
                          disabled={busy !== null}
                          onClick={() => {
                            const max = Math.min(table.maxBetCents, bankrollCents);
                            const stepped = Math.floor(max / table.betStepCents) * table.betStepCents;
                            setWager(String(Math.max(table.minBetCents, stepped) / 100));
                            startAction.current = newActionId();
                          }}
                        >Max</button>
                      </div>
                    </label>
                    <Button
                      type="submit"
                      className="se-btn se-street-dice__comeout"
                      disabledReason={
                        !table.availableHere
                          ? 'This dice table is not available in this casino.'
                          : !casinoPage.openSession
                            ? 'Open a casino bankroll first.'
                            : casinoPage.openSession.citySlug !== casinoPage.currentCitySlug
                              ? 'Your open bankroll belongs to another casino.'
                              : !wagerValid
                              ? 'Use one of this table\'s posted line bets.'
                              : wagerCents && wagerCents > bankrollCents
                                ? 'There are not enough chips in the bankroll.'
                                : busy ? 'Dice are moving.' : null
                      }
                    >
                      {busy === 'start' ? 'THROWING…' : 'COME-OUT ROLL'}
                    </Button>
                  </form>
                )}
              </div>

              <details className="se-street-dice__rules">
                <summary>Street Dice rules &amp; true odds</summary>
                <p>Come-out 7 or 11 wins. 2, 3 or 12 loses. 4, 5, 6, 8, 9 or 10 becomes the point. Make the point before a 7 to win the line. Odds pay true odds: 4/10 at 2:1, 5/9 at 3:2 and 6/8 at 6:5.</p>
              </details>

              {state.history.length ? (
                <details className="se-street-dice__history">
                  <summary>Street Dice history · last {state.history.length}</summary>
                  <div>
                    {state.history.map((round) => (
                      <article key={round.id}>
                        <span><strong>{round.tableName}</strong><small>{round.rollCount} roll{round.rollCount === 1 ? '' : 's'} · point {round.point ?? 'off'}</small></span>
                        <strong className={round.netCents > 0 ? 'is-win' : round.netCents < 0 ? 'is-loss' : ''}>{signedMoney(round.netCents)}</strong>
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
