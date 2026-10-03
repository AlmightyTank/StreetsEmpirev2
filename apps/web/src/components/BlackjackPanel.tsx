import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  formatCents,
  type CasinoBlackjackHandDto,
  type CasinoBlackjackStateDto,
  type CasinoPageDto,
} from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { newActionId } from '../utils/actionId.js';
import { formatWhen } from '../utils/time.js';

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

type Props = {
  casinoPage: CasinoPageDto;
  onPageChange: (page: CasinoPageDto) => void;
};

export function BlackjackPanel({ casinoPage, onPageChange }: Props) {
  const [state, setState] = useState<CasinoBlackjackStateDto | null>(null);
  const [selectedTableKey, setSelectedTableKey] = useState<string | null>(null);
  const [wager, setWager] = useState('10');
  const [lastHand, setLastHand] = useState<CasinoBlackjackHandDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dealAction = useRef(newActionId());
  const hitAction = useRef(newActionId());
  const standAction = useRef(newActionId());
  const doubleAction = useRef(newActionId());
  const splitAction = useRef(newActionId());

  function resetActionIds() {
    dealAction.current = newActionId();
    hitAction.current = newActionId();
    standAction.current = newActionId();
    doubleAction.current = newActionId();
    splitAction.current = newActionId();
  }

  function load() {
    void casinoApi.blackjack()
      .then((next) => {
        setState(next);
        setLastHand(next.activeHand);
        setError(null);
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not open the blackjack pit.'));
  }

  useEffect(load, [casinoPage.currentCitySlug, casinoPage.openSession?.id]);

  useEffect(() => {
    if (!state?.enabled || !state.tables.length) return;
    if (state.activeHand) {
      setSelectedTableKey(state.activeHand.tableKey);
      return;
    }
    const current = state.tables.find((table) => table.key === selectedTableKey);
    if (current) return;
    const next = state.tables.find((table) => table.availableHere) ?? state.tables[0]!;
    setSelectedTableKey(next.key);
    setWager(String(next.minBetCents / 100));
    dealAction.current = newActionId();
  }, [state, selectedTableKey]);

  const selectedTable = useMemo(
    () => state?.tables.find((table) => table.key === selectedTableKey) ?? null,
    [state, selectedTableKey],
  );
  const shownHand = state?.activeHand ?? lastHand;
  const currentPlayerHand = shownHand?.status === 'ACTIVE'
    ? shownHand.playerHands[shownHand.activeHandIndex] ?? null
    : null;
  const wagerCents = dollarsToCents(wager);
  const wagerValid = Boolean(
    selectedTable
      && wagerCents
      && wagerCents >= selectedTable.minBetCents
      && wagerCents <= selectedTable.maxBetCents
      && wagerCents % selectedTable.betStepCents === 0,
  );

  async function deal(event: FormEvent) {
    event.preventDefault();
    if (!selectedTable || !wagerCents) return;
    setBusy('deal');
    setError(null);
    setNotice(null);
    try {
      const result = await casinoApi.blackjackDeal({
        tableKey: selectedTable.key,
        wagerCents,
        actionId: dealAction.current,
      });
      onPageChange(result.page);
      setState(result.blackjack);
      setLastHand(result.hand);
      setNotice(
        result.hand.status === 'SETTLED'
          ? result.hand.playerHands[0]?.outcome === 'BLACKJACK'
            ? 'Blackjack! Natural 21 paid immediately.'
            : 'Opening hand settled.'
          : 'Cards are out. Your move.',
      );
      resetActionIds();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The dealer could not start that hand.');
    } finally {
      setBusy(null);
    }
  }

  async function act(kind: 'hit' | 'stand' | 'double' | 'split') {
    if (!shownHand) return;
    setBusy(kind);
    setError(null);
    setNotice(null);
    const actionRef = kind === 'hit' ? hitAction
      : kind === 'stand' ? standAction
        : kind === 'double' ? doubleAction
          : splitAction;
    try {
      const input = { handId: shownHand.id, actionId: actionRef.current };
      const result = kind === 'hit'
        ? await casinoApi.blackjackHit(input)
        : kind === 'stand'
          ? await casinoApi.blackjackStand(input)
          : kind === 'double'
            ? await casinoApi.blackjackDouble(input)
            : await casinoApi.blackjackSplit(input);
      onPageChange(result.page);
      setState(result.blackjack);
      setLastHand(result.hand);
      setNotice(
        result.hand.status === 'SETTLED'
          ? 'Hand settled · ' + signedMoney(result.hand.netCents) + '.'
          : kind === 'split'
            ? 'Hand split. Play each hand in order.'
            : kind === 'double'
              ? 'Double down locked in.'
              : kind === 'hit' ? 'Card dealt.' : 'Standing.',
      );
      actionRef.current = newActionId();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The dealer could not complete that action.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="Blackjack" aside={state?.activeHand ? 'Hand in progress' : '1.2.0-C'}>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {!state ? <p className="se-muted">Checking the blackjack pit...</p> : null}
      {state && !state.enabled ? <p className="se-muted">Blackjack is not enabled in this round.</p> : null}

      {state?.enabled ? (
        <div className={'se-blackjack' + (state.activeHand ? ' has-active-hand' : '')}>
          <div className="se-blackjack__tables" role="group" aria-label="Blackjack tables">
            {state.tables.map((table) => (
              <button
                key={table.key}
                type="button"
                disabled={busy !== null || Boolean(state.activeHand)}
                aria-pressed={selectedTableKey === table.key}
                className={'se-blackjack__table' + (selectedTableKey === table.key ? ' is-selected' : '')}
                onClick={() => {
                  setSelectedTableKey(table.key);
                  setWager(String(table.minBetCents / 100));
                  setLastHand(null);
                  dealAction.current = newActionId();
                }}
              >
                <span><strong>{table.name}</strong><small>{table.availableHere ? 'Available here' : 'Not in this room'}</small></span>
                <small>{formatCents(table.minBetCents)}–{formatCents(table.maxBetCents)} · {table.decks} deck{table.decks === 1 ? '' : 's'}</small>
              </button>
            ))}
          </div>

          {selectedTable ? (
            <>
              <div className="se-blackjack__rules">
                <div>
                  <h3>{selectedTable.name}</h3>
                  <p>{selectedTable.blurb}</p>
                </div>
                <div className="se-blackjack__rule-grid">
                  <span><small>Blackjack</small><strong>{selectedTable.blackjackPays}</strong></span>
                  <span><small>Dealer</small><strong>{selectedTable.dealerHitsSoft17 ? 'Hits soft 17' : 'Stands soft 17'}</strong></span>
                  <span><small>Splits</small><strong>Up to {selectedTable.maxSplitHands} hands</strong></span>
                  <span><small>Double after split</small><strong>{selectedTable.allowDoubleAfterSplit ? 'Yes' : 'No'}</strong></span>
                  <span><small>Split aces</small><strong>{selectedTable.splitAcesOneCard ? 'One card each' : 'Normal play'}</strong></span>
                </div>
              </div>

              {shownHand ? (
                <div className={'se-blackjack__felt' + (shownHand.status === 'SETTLED' ? ' is-settled' : '')}>
                  <div className="se-blackjack__dealer">
                    <div className="se-blackjack__label">
                      <span>Dealer</span>
                      <strong>{shownHand.dealerTotal === null ? 'Showing ' + (shownHand.dealerCards[0]?.label ?? '—') : shownHand.dealerTotal + (shownHand.dealerSoft ? ' soft' : '')}</strong>
                    </div>
                    <div className="se-blackjack__cards">
                      {shownHand.dealerCards.map((card, index) => (
                        <div key={index} className={'se-blackjack__card' + (card.hidden ? ' is-hidden' : '')}>
                          <span>{card.hidden ? '◆' : card.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="se-blackjack__hands">
                    {shownHand.playerHands.map((hand) => (
                      <article
                        key={hand.index}
                        className={
                          'se-blackjack__hand'
                          + (shownHand.status === 'ACTIVE' && shownHand.activeHandIndex === hand.index ? ' is-active' : '')
                          + (hand.outcome ? ' is-' + hand.outcome.toLowerCase() : '')
                        }
                      >
                        <div className="se-blackjack__label">
                          <span>{shownHand.playerHands.length > 1 ? 'Hand ' + (hand.index + 1) : 'Your hand'}</span>
                          <strong>{hand.total}{hand.soft ? ' soft' : ''}{hand.outcome ? ' · ' + hand.outcome : ''}</strong>
                        </div>
                        <div className="se-blackjack__cards">
                          {hand.cards.map((card, index) => (
                            <div key={index} className="se-blackjack__card"><span>{card.label}</span></div>
                          ))}
                        </div>
                        <div className="se-blackjack__hand-meta">
                          <span>Wager <strong>{formatCents(hand.wagerCents)}</strong></span>
                          {hand.outcome ? <span>Returned <strong>{formatCents(hand.returnCents)}</strong></span> : null}
                        </div>
                      </article>
                    ))}
                  </div>

                  <div className="se-blackjack__meter">
                    <span><small>Bankroll</small><strong>{formatCents(shownHand.bankrollAfterCents)}</strong></span>
                    <span><small>Total wager</small><strong>{formatCents(shownHand.totalWagerCents)}</strong></span>
                    <span><small>Return</small><strong>{formatCents(shownHand.totalReturnCents)}</strong></span>
                    <span>
                      <small>{shownHand.status === 'ACTIVE' ? 'At risk' : 'Net'}</small>
                      <strong>{shownHand.status === 'ACTIVE' ? formatCents(shownHand.totalWagerCents) : signedMoney(shownHand.netCents)}</strong>
                    </span>
                    <span><small>Shoe</small><strong>{shownHand.shoeRemainingCards} cards · #{shownHand.shuffleNumber}</strong></span>
                  </div>

                  {shownHand.status === 'ACTIVE' && currentPlayerHand ? (
                    <div className="se-blackjack__actions">
                      <Button type="button" className="se-btn" disabledReason={!currentPlayerHand.canHit ? 'Hit is not available on this hand.' : busy ? 'Dealer is working.' : null} onClick={() => void act('hit')}>
                        {busy === 'hit' ? 'Hitting...' : 'Hit'}
                      </Button>
                      <Button type="button" className="se-btn se-btn--ghost" disabledReason={!currentPlayerHand.canStand ? 'Stand is not available on this hand.' : busy ? 'Dealer is working.' : null} onClick={() => void act('stand')}>
                        {busy === 'stand' ? 'Standing...' : 'Stand'}
                      </Button>
                      <Button type="button" className="se-btn se-btn--ghost" disabledReason={!currentPlayerHand.canDouble ? 'Double needs two cards and enough bankroll.' : busy ? 'Dealer is working.' : null} onClick={() => void act('double')}>
                        {busy === 'double' ? 'Doubling...' : 'Double'}
                      </Button>
                      <Button type="button" className="se-btn se-btn--ghost" disabledReason={!currentPlayerHand.canSplit ? 'Split needs a matching pair, room for another hand, and enough bankroll.' : busy ? 'Dealer is working.' : null} onClick={() => void act('split')}>
                        {busy === 'split' ? 'Splitting...' : 'Split'}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {!state.activeHand ? (
                <form className="se-blackjack__deal" onSubmit={deal}>
                  <label>
                    <span>Bet ($)</span>
                    <div className="se-blackjack__bet">
                      <button
                        className="se-btn se-btn--ghost"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          const current = wagerCents ?? selectedTable.minBetCents;
                          setWager(String(Math.max(selectedTable.minBetCents, current - selectedTable.betStepCents) / 100));
                          dealAction.current = newActionId();
                        }}
                      >−</button>
                      <input
                        className="se-input"
                        inputMode="decimal"
                        value={wager}
                        disabled={busy !== null}
                        onChange={(event) => {
                          setWager(event.target.value);
                          dealAction.current = newActionId();
                        }}
                      />
                      <button
                        className="se-btn se-btn--ghost"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          const current = wagerCents ?? selectedTable.minBetCents;
                          setWager(String(Math.min(selectedTable.maxBetCents, current + selectedTable.betStepCents) / 100));
                          dealAction.current = newActionId();
                        }}
                      >+</button>
                      <button
                        className="se-btn se-btn--ghost"
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          const bankroll = casinoPage.openSession?.bankrollCents ?? 0;
                          const max = Math.min(selectedTable.maxBetCents, bankroll);
                          const stepped = Math.floor(max / selectedTable.betStepCents) * selectedTable.betStepCents;
                          setWager(String(Math.max(selectedTable.minBetCents, stepped) / 100));
                          dealAction.current = newActionId();
                        }}
                      >Max</button>
                    </div>
                  </label>
                  <p className="se-hint">
                    Table limits {formatCents(selectedTable.minBetCents)}–{formatCents(selectedTable.maxBetCents)}
                    {' · '}step {formatCents(selectedTable.betStepCents)}
                  </p>
                  <Button
                    type="submit"
                    className="se-btn se-blackjack__deal-button"
                    disabledReason={
                      !selectedTable.availableHere
                        ? 'Travel to a casino that carries this table.'
                        : !casinoPage.openSession
                          ? 'Open a casino bankroll first.'
                          : casinoPage.openSession.citySlug !== casinoPage.currentCitySlug
                            ? 'Your open bankroll belongs to another casino.'
                            : !wagerValid
                              ? 'Use one of this table\'s posted wagers.'
                              : wagerCents && casinoPage.openSession.bankrollCents < wagerCents
                                ? 'There are not enough chips in the bankroll.'
                                : busy ? 'Dealer is working.' : null
                    }
                  >
                    {busy === 'deal' ? 'Dealing...' : 'Deal blackjack'}
                  </Button>
                </form>
              ) : (
                <p className="se-hint se-blackjack__resume-hint">This hand is saved on the server. Refreshing or reconnecting brings you back to these exact cards.</p>
              )}

              {state.history.length ? (
                <details className="se-blackjack__history">
                  <summary>Blackjack hand history · last {state.history.length}</summary>
                  <div className="se-blackjack__history-list">
                    {state.history.map((hand) => (
                      <article key={hand.id}>
                        <span>
                          <strong>{hand.tableName}</strong>
                          <small>{formatWhen(hand.settledAt ?? hand.createdAt)}</small>
                        </span>
                        <span>{hand.playerHands.map((playerHand) => playerHand.outcome).join(' / ')}</span>
                        <strong className={hand.netCents > 0 ? 'is-win' : hand.netCents < 0 ? 'is-loss' : ''}>{signedMoney(hand.netCents)}</strong>
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
