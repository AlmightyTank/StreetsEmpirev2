import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  formatCents,
  type CasinoBlackjackCardDto,
  type CasinoBlackjackHandDto,
  type CasinoBlackjackStateDto,
  type CasinoPageDto,
} from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { ActionDock, deltaChip } from './ActionDock.js';
import { CasinoBetControl } from './CasinoExperience.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { newActionId } from '../utils/actionId.js';
import { formatWhen } from '../utils/time.js';
import {
  casinoSoundEnabled,
  playCasinoSound,
  setCasinoSoundEnabled,
} from '../lib/casinoAudio.js';

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function blackjackOutcomeLabel(outcome: string | null): string {
  if (!outcome) return '';
  if (outcome === 'BLACKJACK') return 'Blackjack';
  if (outcome === 'WIN') return 'Won';
  if (outcome === 'LOSE') return 'Lost';
  if (outcome === 'PUSH') return 'Push';
  return outcome;
}

const SUIT_GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

/** A card as it lies on the felt: rank and suit in the corners, the suit large in the middle. */
function PlayingCard({ card }: { card: CasinoBlackjackCardDto }) {
  if (card.hidden || !card.code) {
    return <div className="se-blackjack__card is-hidden" role="img" aria-label="Face-down card" />;
  }
  const suit = card.code.slice(-1);
  const rank = card.code.slice(0, -1);
  const glyph = SUIT_GLYPH[suit] ?? '';
  return (
    <div className={'se-blackjack__card' + (suit === 'H' || suit === 'D' ? ' is-red' : '')} role="img" aria-label={card.label}>
      <span className="se-blackjack__corner">{rank}<i>{glyph}</i></span>
      <span className="se-blackjack__pip" aria-hidden="true">{glyph}</span>
      <span className="se-blackjack__corner is-flipped" aria-hidden="true">{rank}<i>{glyph}</i></span>
    </div>
  );
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
  const [soundEnabled, setSoundEnabledState] = useState(() => casinoSoundEnabled());
  const [error, setError] = useState<string | null>(null);
  const dealAction = useRef(newActionId());
  const hitAction = useRef(newActionId());
  const standAction = useRef(newActionId());
  const doubleAction = useRef(newActionId());
  const splitAction = useRef(newActionId());

  async function dealSounds(count: number, flipFirst = false, reveal?: () => void): Promise<void> {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (flipFirst) playCasinoSound('CARD_FLIP', soundEnabled);
    if (reducedMotion) {
      if (count > 0) playCasinoSound('CARD_DEAL', soundEnabled);
      reveal?.();
      return;
    }
    if (flipFirst) await wait(130);
    if (count === 0) reveal?.();
    for (let index = 0; index < count; index++) {
      playCasinoSound('CARD_DEAL', soundEnabled, index);
      if (index === 0) reveal?.();
      await wait(145);
    }
  }

  function playHandResult(hand: CasinoBlackjackHandDto): void {
    if (hand.status !== 'SETTLED') return;
    if (hand.playerHands.some((playerHand) => playerHand.outcome === 'BLACKJACK')) {
      playCasinoSound('BLACKJACK', soundEnabled);
    } else if (hand.netCents > 0) {
      playCasinoSound('SMALL_WIN', soundEnabled);
    } else if (hand.netCents === 0) {
      playCasinoSound('TABLE_PUSH', soundEnabled);
    } else {
      playCasinoSound('LOSS', soundEnabled);
    }
  }

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
    setLastHand(null);
    playCasinoSound('CHIP_PLACE', soundEnabled);
    try {
      const result = await casinoApi.blackjackDeal({
        tableKey: selectedTable.key,
        wagerCents,
        actionId: dealAction.current,
      });
      await dealSounds(4, false, () => {
        onPageChange(result.page);
        setState(result.blackjack);
        setLastHand(result.hand);
      });
      playHandResult(result.hand);
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
    const actionRef = kind === 'hit' ? hitAction
      : kind === 'stand' ? standAction
        : kind === 'double' ? doubleAction
          : splitAction;
    try {
      if (kind === 'double' || kind === 'split') playCasinoSound('CHIP_PLACE', soundEnabled);
      const input = { handId: shownHand.id, actionId: actionRef.current };
      const result = kind === 'hit'
        ? await casinoApi.blackjackHit(input)
        : kind === 'stand'
          ? await casinoApi.blackjackStand(input)
          : kind === 'double'
            ? await casinoApi.blackjackDouble(input)
            : await casinoApi.blackjackSplit(input);
      const beforeCards = shownHand.dealerCards.length
        + shownHand.playerHands.reduce((sum, hand) => sum + hand.cards.length, 0);
      const afterCards = result.hand.dealerCards.length
        + result.hand.playerHands.reduce((sum, hand) => sum + hand.cards.length, 0);
      const dealerRevealed = shownHand.dealerCards.some((card) => card.hidden)
        && result.hand.dealerCards.every((card) => !card.hidden);
      await dealSounds(Math.max(0, afterCards - beforeCards), dealerRevealed, () => {
        onPageChange(result.page);
        setState(result.blackjack);
        setLastHand(result.hand);
      });
      playHandResult(result.hand);
      actionRef.current = newActionId();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The dealer could not complete that action.');
    } finally {
      setBusy(null);
    }
  }

  const settledHand = shownHand?.status === 'SETTLED' ? shownHand : null;
  const dealBlock = !selectedTable
    ? 'Pick a table first.'
    : !selectedTable.availableHere
      ? selectedTable.lockedReason ?? 'Travel to a casino that carries this table.'
      : !casinoPage.openSession
        ? 'Open a casino bankroll first.'
        : casinoPage.openSession.citySlug !== casinoPage.currentCitySlug
          ? 'Your open bankroll belongs to another casino.'
          : !wagerValid
            ? 'Use one of this table\'s posted wagers.'
            : wagerCents && casinoPage.openSession.bankrollCents < wagerCents
              ? 'There are not enough chips in the bankroll.'
              : busy ? 'Dealer is working.' : null;
  const stepWager = (deltaCents: number) => {
    if (!selectedTable) return;
    const current = wagerCents ?? selectedTable.minBetCents;
    const next = Math.max(selectedTable.minBetCents, Math.min(selectedTable.maxBetCents, current + deltaCents));
    setWager(String(next / 100));
    dealAction.current = newActionId();
  };

  return (
    <Panel title="Blackjack" aside={state?.activeHand ? 'Hand in progress' : undefined}>
      {error ? <Alert>{error}</Alert> : null}
      {!state ? <p className="se-muted">Checking the blackjack pit...</p> : null}
      {state && !state.enabled ? <p className="se-muted">Blackjack is not enabled in this round.</p> : null}

      {state?.enabled ? (
        <div className={'se-blackjack' + (state.activeHand ? ' has-active-hand' : '')}>
          <div className="se-casino-picker" role="group" aria-label="Blackjack tables">
            {state.tables.map((table) => (
              <button
                key={table.key}
                type="button"
                disabled={busy !== null || Boolean(state.activeHand)}
                aria-pressed={selectedTableKey === table.key}
                title={table.availableHere ? undefined : table.lockedReason ?? 'Not in this room'}
                className={'se-casino-picker__opt' + (selectedTableKey === table.key ? ' is-selected' : '') + (table.availableHere ? '' : ' is-away')}
                onClick={() => {
                  setSelectedTableKey(table.key);
                  setWager(String(table.minBetCents / 100));
                  setLastHand(null);
                  dealAction.current = newActionId();
                }}
              >
                <strong>{table.name}{table.room === 'VIP' ? <em className="se-casino-vip-badge">VIP</em> : null}</strong>
                <small>{formatCents(table.minBetCents)}–{formatCents(table.maxBetCents)}{table.availableHere ? '' : ' · not here'}</small>
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
                    Blackjack pays {selectedTable.blackjackPays}
                    {' · '}dealer {selectedTable.dealerHitsSoft17 ? 'hits' : 'stands on'} soft 17
                    {' · '}{selectedTable.decks} deck{selectedTable.decks === 1 ? '' : 's'}
                  </p>
                  <p className="se-hint">
                    Split up to {selectedTable.maxSplitHands} hands
                    {' · '}double after split {selectedTable.allowDoubleAfterSplit ? 'allowed' : 'not allowed'}
                    {' · '}split aces {selectedTable.splitAcesOneCard ? 'get one card each' : 'play normally'}
                  </p>
                  <p className="se-hint">Bets {formatCents(selectedTable.minBetCents)}–{formatCents(selectedTable.maxBetCents)} in {formatCents(selectedTable.betStepCents)} steps. A hand in play is saved if you leave or reconnect.</p>
                </details>
              </div>

              <div className={'se-blackjack__felt' + (shownHand?.status === 'SETTLED' ? ' is-settled' : '') + (shownHand ? '' : ' is-empty') + (busy ? ' is-dealing' : '')}>
                {busy ? <div className="se-blackjack__table-status" role="status">{busy === 'deal' ? 'DEALING' : busy === 'stand' ? 'DEALER PLAYS' : busy.toUpperCase()}</div> : null}
                <div className="se-blackjack__dealer">
                  <div className="se-blackjack__label">
                    <span>Dealer</span>
                    <strong>
                      {!shownHand
                        ? selectedTable.dealerHitsSoft17 ? 'Hits soft 17' : 'Stands on soft 17'
                        : shownHand.dealerTotal === null
                          ? 'Showing ' + (shownHand.dealerCards[0]?.label ?? '—')
                          : shownHand.dealerTotal + (shownHand.dealerSoft ? ' soft' : '')}
                    </strong>
                  </div>
                  <div className="se-blackjack__cards">
                    {shownHand
                      ? shownHand.dealerCards.map((card, index) => (
                          <PlayingCard key={(card.code ?? 'hidden') + ':' + card.hidden + ':' + index} card={card} />
                        ))
                      : [0, 1].map((slot) => <div key={slot} className="se-blackjack__card is-slot" aria-hidden="true" />)}
                  </div>
                </div>

                <p className="se-blackjack__pays">Blackjack pays {selectedTable.blackjackPays}</p>

                {shownHand ? (
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
                        <div className="se-blackjack__cards">
                          {hand.cards.map((card, index) => (
                            <PlayingCard key={(card.code ?? 'hidden') + ':' + card.hidden + ':' + index} card={card} />
                          ))}
                        </div>
                        <div className="se-blackjack__label">
                          <span>{shownHand.playerHands.length > 1 ? 'Hand ' + (hand.index + 1) : 'You'} · {formatCents(hand.wagerCents)}</span>
                          <strong>{hand.total}{hand.soft ? ' soft' : ''}{hand.outcome ? ' · ' + blackjackOutcomeLabel(hand.outcome) : ''}</strong>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="se-blackjack__hands">
                    <article className="se-blackjack__hand is-waiting">
                      <div className="se-blackjack__cards">
                        {[0, 1].map((slot) => <div key={slot} className="se-blackjack__card is-slot" aria-hidden="true" />)}
                      </div>
                      <div className="se-blackjack__label"><span>You</span><strong>Place your bet</strong></div>
                    </article>
                  </div>
                )}

                {shownHand ? (
                  <p className="se-blackjack__shoe">Shoe {shownHand.shoeRemainingCards} cards · shuffle #{shownHand.shuffleNumber}</p>
                ) : null}
              </div>

              <ActionDock
                label={state.activeHand ? 'Play the hand' : 'Deal blackjack'}
                onSubmit={(event) => {
                  if (state.activeHand) {
                    event.preventDefault();
                    return;
                  }
                  void deal(event);
                }}
                outcome={settledHand ? {
                  id: settledHand.id,
                  title: settledHand.netCents > 0
                    ? (settledHand.playerHands.some((hand) => hand.outcome === 'BLACKJACK') ? 'Blackjack ' : 'Won ') + signedMoney(settledHand.netCents)
                    : settledHand.netCents < 0
                      ? 'Lost ' + signedMoney(settledHand.netCents)
                      : 'Push',
                  tone: settledHand.netCents >= 0 ? 'good' : 'bad',
                  chips: [
                    { key: 'dealer', label: 'Dealer', text: settledHand.dealerTotal === null ? '—' : String(settledHand.dealerTotal), tone: 'muted' as const },
                    ...settledHand.playerHands.map((hand) => ({
                      key: 'hand' + hand.index,
                      label: settledHand.playerHands.length > 1 ? 'Hand ' + (hand.index + 1) : 'You',
                      text: hand.total + (hand.outcome ? ' ' + blackjackOutcomeLabel(hand.outcome).toLowerCase() : ''),
                      tone: hand.outcome === 'WIN' || hand.outcome === 'BLACKJACK' ? 'good' as const : hand.outcome === 'PUSH' ? 'muted' as const : 'bad' as const,
                    })),
                    deltaChip('Net', settledHand.netCents, { money: true }),
                    { key: 'bankroll', label: 'Floor', text: formatCents(settledHand.bankrollAfterCents), tone: 'muted' as const },
                  ],
                  receipt: (
                    <div className="se-rows">
                      <div className="se-row"><span className="se-row__label">{settledHand.tableName}</span><span className="se-row__value">Dealer {settledHand.dealerTotal ?? '—'}{settledHand.dealerSoft ? ' soft' : ''}</span></div>
                      {settledHand.playerHands.map((hand) => (
                        <div className="se-row" key={hand.index}>
                          <span className="se-row__label">{settledHand.playerHands.length > 1 ? 'Hand ' + (hand.index + 1) : 'Your hand'} · {hand.total}{hand.soft ? ' soft' : ''} · {blackjackOutcomeLabel(hand.outcome)}</span>
                          <span className="se-row__value">{formatCents(hand.wagerCents)} → {formatCents(hand.returnCents)}</span>
                        </div>
                      ))}
                      <div className="se-row se-row--strong"><span className="se-row__label">Net</span><span className={'se-row__value ' + (settledHand.netCents > 0 ? 'se-good' : settledHand.netCents < 0 ? 'se-bad' : '')}>{signedMoney(settledHand.netCents)}</span></div>
                      <div className="se-row"><span className="se-row__label">Floor bankroll</span><span className="se-row__value">{formatCents(settledHand.bankrollAfterCents)}</span></div>
                    </div>
                  ),
                  onDismiss: () => setLastHand(null),
                } : null}
              >
                {shownHand?.status === 'ACTIVE' && currentPlayerHand ? (
                  <>
                    <div>
                      <span className="se-dock__label">{shownHand.playerHands.length > 1 ? 'Hand ' + (currentPlayerHand.index + 1) + ' of ' + shownHand.playerHands.length : 'Your move'}</span>
                      <strong>{currentPlayerHand.total}{currentPlayerHand.soft ? ' soft' : ''} vs {shownHand.dealerCards[0]?.label ?? '—'}</strong>
                      <span>{formatCents(shownHand.totalWagerCents)} on the table</span>
                    </div>
                    <div className="se-blackjack__moves">
                      <Button type="button" className="se-btn se-btn--primary" disabledReason={!currentPlayerHand.canHit ? 'Hit is not available on this hand.' : busy ? 'Dealer is working.' : null} onClick={() => void act('hit')}>
                        {busy === 'hit' ? 'Hitting...' : 'Hit'}
                      </Button>
                      <Button type="button" className="se-btn" disabledReason={!currentPlayerHand.canStand ? 'Stand is not available on this hand.' : busy ? 'Dealer is working.' : null} onClick={() => void act('stand')}>
                        {busy === 'stand' ? 'Standing...' : 'Stand'}
                      </Button>
                      <Button type="button" className="se-btn" disabledReason={!currentPlayerHand.canDouble ? 'Double needs two cards and enough bankroll.' : busy ? 'Dealer is working.' : null} onClick={() => void act('double')}>
                        {busy === 'double' ? 'Doubling...' : 'Double'}
                      </Button>
                      <Button type="button" className="se-btn" disabledReason={!currentPlayerHand.canSplit ? 'Split needs a matching pair, room for another hand, and enough bankroll.' : busy ? 'Dealer is working.' : null} onClick={() => void act('split')}>
                        {busy === 'split' ? 'Splitting...' : 'Split'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="se-dock__label">{selectedTable.name}</span>
                      <strong>Bet {wagerCents ? formatCents(wagerCents) : '—'}</strong>
                      <span>{casinoPage.openSession ? 'Floor ' + formatCents(casinoPage.openSession.bankrollCents) : 'No session open'}</span>
                    </div>
                    <CasinoBetControl
                      id="blackjack-bet"
                      label="Bet"
                      className="se-slots__dock-bet"
                      value={wager}
                      disabled={busy !== null}
                      decreaseLabel="Lower the bet"
                      increaseLabel="Raise the bet"
                      onDecrease={() => stepWager(-selectedTable.betStepCents)}
                      onIncrease={() => stepWager(selectedTable.betStepCents)}
                      onChange={(value) => {
                        setWager(value);
                        dealAction.current = newActionId();
                      }}
                      onMax={() => {
                        const bankroll = casinoPage.openSession?.bankrollCents ?? 0;
                        const max = Math.min(selectedTable.maxBetCents, bankroll);
                        const stepped = Math.floor(max / selectedTable.betStepCents) * selectedTable.betStepCents;
                        setWager(String(Math.max(selectedTable.minBetCents, stepped) / 100));
                        dealAction.current = newActionId();
                      }}
                    />
                    <Button type="submit" className="se-btn se-btn--primary" disabledReason={dealBlock}>
                      {busy === 'deal' ? 'Dealing...' : settledHand ? 'Deal again' : 'Deal'}
                    </Button>
                  </>
                )}
              </ActionDock>

              {state.history.length ? (
                <details className="se-blackjack__history">
                  <summary>Hand history · last {state.history.length}</summary>
                  <div className="se-blackjack__history-list">
                    {state.history.map((hand) => (
                      <article key={hand.id}>
                        <span>
                          <strong>{hand.tableName}</strong>
                          <small>{formatWhen(hand.settledAt ?? hand.createdAt)}</small>
                        </span>
                        <span>{hand.playerHands.map((playerHand) => blackjackOutcomeLabel(playerHand.outcome)).join(' / ')}</span>
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
