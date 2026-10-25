import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatCents, type CasinoPageDto, type CasinoPokerCardDto, type CasinoPokerHandDto, type CasinoPokerStateDto, type CasinoPokerTableViewDto } from '@streets/shared';
import { casinoApi } from '../api/casino.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel } from './Panel.js';
import { newActionId } from '../utils/actionId.js';
import {
  casinoSoundEnabled,
  playCasinoSound,
  setCasinoSoundEnabled,
} from '../lib/casinoAudio.js';

type Props = { casinoPage: CasinoPageDto; onPageChange: (page: CasinoPageDto) => void };
const suits: Record<CasinoPokerCardDto['suit'], string> = { C: '♣', D: '♦', H: '♥', S: '♠' };
const rankLabel = (rank: number) => rank <= 10 ? String(rank) : ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[rank] ?? '?');

function PlayingCard({ card, delay = 0 }: { card?: CasinoPokerCardDto; delay?: number }) {
  const style = { '--se-card-delay': `${delay}ms` } as CSSProperties;
  if (!card) return <span className="se-poker-card se-poker-card--back is-dealt" style={style} aria-label="Hidden card">✦</span>;
  const red = card.suit === 'H' || card.suit === 'D';
  return <span className={'se-poker-card is-dealt' + (red ? ' is-red' : '')} style={style} aria-label={rankLabel(card.rank) + ' ' + suits[card.suit]}>
    <strong>{rankLabel(card.rank)}</strong><span>{suits[card.suit]}</span>
  </span>;
}

function dollarsToCents(value: string): number | null {
  const clean = value.trim().replaceAll(',', '').replace(/^\$/, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(clean)) return null;
  const [whole = '0', fraction = ''] = clean.split('.');
  const cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function pokerOutcome(outcome: string | null, rakeCents: number) {
  const clean = (outcome ?? 'Hand complete.').replace(' House rake taken.', '');
  return rakeCents ? `${clean} House rake: ${formatCents(rakeCents)}.` : clean;
}

function cardKey(card: CasinoPokerCardDto | undefined, index: number): string {
  return card ? `${card.rank}${card.suit}` : `hidden-${index}`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isHumanWin(outcome: string | null): boolean {
  return Boolean(outcome && /\byou (?:win|take|split)\b|opponents folded/i.test(outcome));
}

export function PokerPanel({ casinoPage, onPageChange }: Props) {
  const [state, setState] = useState<CasinoPokerStateDto | null>(null);
  const [lastHand, setLastHand] = useState<CasinoPokerHandDto | null>(null);
  const [buyIn, setBuyIn] = useState('100');
  const [busy, setBusy] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(() => casinoSoundEnabled());
  const [tablePulse, setTablePulse] = useState<'action' | 'win' | 'loss' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tableName, setTableName] = useState('High Stakes Hold’em');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteTableId, setInviteTableId] = useState('');
  const [newInvite, setNewInvite] = useState<string | null>(null);
  const [activeTableId, setActiveTableId] = useState<string | null>(null);
  const [tableView, setTableView] = useState<CasinoPokerTableViewDto | null>(null);
  const tableTransition = useRef<{ handId: string; boardCount: number; myTurn: boolean; outcome: string | null } | null>(null);

  function reducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  async function cardTimeline(cardCount: number): Promise<void> {
    if (reducedMotion()) {
      if (cardCount) playCasinoSound('CARD_DEAL', soundEnabled);
      return;
    }
    for (let index = 0; index < cardCount; index++) {
      playCasinoSound('CARD_DEAL', soundEnabled, index);
      await wait(115);
    }
  }

  function pulse(kind: 'action' | 'win' | 'loss'): void {
    setTablePulse(kind);
    window.setTimeout(() => setTablePulse(null), 520);
  }

  function playPokerResult(outcome: string | null, humanWon = isHumanWin(outcome)): void {
    if (!outcome) return;
    playCasinoSound(humanWon ? 'SMALL_WIN' : 'LOSS', soundEnabled);
    pulse(humanWon ? 'win' : 'loss');
  }

  function playPokerAction(action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN'): void {
    if (action === 'FOLD') playCasinoSound('POKER_FOLD', soundEnabled);
    else if (action === 'CHECK') playCasinoSound('POKER_CHECK', soundEnabled);
    else if (action === 'ALL_IN') playCasinoSound('POKER_ALL_IN', soundEnabled);
    else playCasinoSound('CHIP_PLACE', soundEnabled, action === 'RAISE' ? 2 : 1);
    pulse('action');
  }

  useEffect(() => {
    void casinoApi.poker().then((next) => {
      setState(next);
      setLastHand(next.activeHand ?? next.history[0] ?? null);
      if (!activeTableId) setActiveTableId(next.tables.find((t) => t.seats.some((s) => s.isYou))?.id ?? null);
      setError(null);
    }).catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : "Could not open the Texas Hold'em table."));
  }, [casinoPage.currentCitySlug, casinoPage.openSession?.id]);

  useEffect(() => {
    if (!activeTableId) { setTableView(null); return; }
    let alive = true;
    const refresh = async () => {
      try {
        const [view, poker] = await Promise.all([casinoApi.pokerTable(activeTableId), casinoApi.poker()]);
        if (alive) { setTableView(view); setState(poker); }
      }
      catch (caught) {
        if (!alive) return;
        if (caught instanceof ApiError && caught.status === 404) {
          setActiveTableId(null); setTableView(null); setError(null);
          void casinoApi.poker().then(setState).catch(() => undefined);
        } else setError(caught instanceof ApiError ? caught.message : "Could not reconnect to that Texas Hold'em table.");
      }
    };
    void refresh();
    const refreshWhenVisible = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(refreshWhenVisible, 2_500);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [activeTableId]);

  useEffect(() => {
    const nextHand = tableView?.hand;
    if (!nextHand) return;
    const previous = tableTransition.current;
    if (previous?.handId === nextHand.id) {
      const dealt = Math.max(0, nextHand.board.length - previous.boardCount);
      if (dealt > 0) {
        for (let index = 0; index < dealt; index++) {
          window.setTimeout(() => playCasinoSound('CARD_DEAL', soundEnabled, index), index * 95);
        }
      }
      if (!previous.myTurn && nextHand.myTurn) playCasinoSound('POKER_CHECK', soundEnabled);
      if (!previous.outcome && nextHand.outcome) {
        const yourSeat = nextHand.seats.find((seat) => seat.isYou);
        if (yourSeat) playPokerResult(nextHand.outcome, nextHand.outcome.includes(yourSeat.displayName));
      }
    }
    tableTransition.current = {
      handId: nextHand.id,
      boardCount: nextHand.board.length,
      myTurn: nextHand.myTurn,
      outcome: nextHand.outcome,
    };
  }, [tableView, soundEnabled]);

  useEffect(() => {
    tableTransition.current = null;
  }, [activeTableId]);

  const active = state?.activeHand ?? null;
  const hand = active ?? lastHand;
  const human = hand?.seats.find((seat) => seat.isHuman) ?? null;
  const amount = dollarsToCents(buyIn);
  const canDeal = Boolean(state?.enabled && amount && amount >= state.minBuyInCents && amount <= state.maxBuyInCents
    && casinoPage.openSession && casinoPage.openSession.citySlug === casinoPage.currentCitySlug
    && amount <= casinoPage.openSession.bankrollCents && !active && !busy);

  async function deal() {
    if (!amount) return;
    setBusy(true); setError(null); setNotice(null);
    playCasinoSound('CHIP_PLACE', soundEnabled);
    try {
      const result = await casinoApi.pokerDeal({ buyInCents: amount, actionId: newActionId() });
      await cardTimeline(4);
      setState(result.poker); setLastHand(result.hand); onPageChange(result.page);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not deal this Texas Hold'em hand.");
    } finally { setBusy(false); }
  }

  async function act(action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN') {
    if (!active) return;
    setBusy(true); setError(null); setNotice(null);
    playPokerAction(action);
    try {
      const result = await casinoApi.pokerAction({ handId: active.id, action, actionId: newActionId() });
      const newBoardCards = Math.max(0, result.hand.board.length - active.board.length);
      await cardTimeline(newBoardCards);
      if (result.hand.status === 'SETTLED' && result.hand.seats.some((seat) => !seat.isHuman && seat.cards.length)) {
        playCasinoSound('CARD_FLIP', soundEnabled);
        if (!reducedMotion()) await wait(160);
      }
      setState(result.poker); setLastHand(result.hand); onPageChange(result.page);
      if (result.hand.status === 'SETTLED') {
        setNotice(pokerOutcome(result.hand.outcome, result.hand.rakeCents));
        playPokerResult(result.hand.outcome);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "That Texas Hold'em action could not be completed.");
    } finally { setBusy(false); }
  }

  async function createTable() {
    if (!amount) return;
    setBusy(true); setError(null); setNewInvite(null);
    try {
      const result = await casinoApi.pokerCreateTable({ name: tableName, visibility, buyInCents: amount, maxPlayers: 6, actionId: newActionId() });
      setState(await casinoApi.poker()); onPageChange(result.page);
      setActiveTableId(result.table.id);
      if (result.inviteCode) setNewInvite(result.inviteCode);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not create the table.'); }
    finally { setBusy(false); }
  }
  async function joinTable(id: string) {
    setBusy(true); setError(null);
    try {
      const result = await casinoApi.pokerJoinTable(id, { actionId: newActionId(), ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}) });
      setInviteCode(''); setState(await casinoApi.poker()); onPageChange(await casinoApi.page()); setActiveTableId(result.table.id);
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not join that table.'); }
    finally { setBusy(false); }
  }
  async function leaveTable(id: string) {
    setBusy(true); setError(null);
    try { const result = await casinoApi.pokerLeaveTable(id, newActionId()); setState(result.poker); onPageChange(result.page); setActiveTableId(null); setTableView(null); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not leave the table.'); }
    finally { setBusy(false); }
  }
  async function startTable(id: string) {
    setActiveTableId(id);
    setBusy(true); setError(null);
    playCasinoSound('CHIP_PLACE', soundEnabled);
    try { const result = await casinoApi.pokerStartTable(id, newActionId()); await cardTimeline(4); setTableView(result.table); onPageChange(result.page); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not deal a hand at that table.'); }
    finally { setBusy(false); }
  }
  async function playTable(id: string, action: 'FOLD' | 'CHECK' | 'CALL' | 'RAISE' | 'ALL_IN') {
    setBusy(true); setError(null);
    playPokerAction(action);
    try { const result = await casinoApi.pokerTableAction(id, { action, actionId: newActionId() }); setTableView(result.table); onPageChange(result.page); if (result.table.hand?.outcome) setNotice(result.table.hand.outcome); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "That Texas Hold'em action could not be completed."); }
    finally { setBusy(false); }
  }
  async function skipIdle(id: string) {
    setBusy(true); setError(null);
    try { const result = await casinoApi.pokerTableTimeout(id, newActionId()); setTableView(result.table); onPageChange(result.page); if (result.table.hand?.outcome) setNotice(result.table.hand.outcome); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not skip that turn.'); }
    finally { setBusy(false); }
  }

  const waitingOn = tableView?.hand?.seats.find((seat) => seat.seatNo === tableView.hand?.turnSeatNo) ?? null;
  const canSkipIdle = Boolean(tableView?.hand?.turnExpiresAt && !tableView.hand.myTurn
    && tableView.hand.seats.some((seat) => seat.isYou) && Date.parse(tableView.hand.turnExpiresAt) <= Date.now());

  return <Panel title="Texas Hold’em" aside="SOLO + MULTIPLAYER">
    {error ? <Alert tone="error">{error}</Alert> : null}
    {notice ? <Alert tone="success">{notice}</Alert> : null}
    {!state ? <p className="se-muted">Opening the poker room...</p> : null}
    {state && !state.enabled ? <Alert tone="info">Texas Hold'em is not enabled in this casino round.</Alert> : null}
    {!casinoPage.openSession ? <p>Open a casino bankroll before sitting at the card table.</p> : null}
    {state?.enabled ? (
      <div className="se-poker-split">
        <div className="se-poker-toolbar">
          <span>{busy ? 'TABLE ACTION' : tableView?.hand?.myTurn ? 'YOUR TURN' : active ? active.street : "TEXAS HOLD'EM ROOM"}</span>
          <button
            type="button"
            className="se-btn se-btn--ghost"
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
        <section className={'se-poker-box se-poker-box--solo' + (tablePulse ? ` is-${tablePulse}` : '')}>
          <div className="se-poker-box__head">
            <div>
              <span className="se-eyebrow">House table</span>
              <h3>Texas Hold'em</h3>
            </div>
            <small>Against Mack and Rico</small>
          </div>

          {hand ? <div className="se-poker-table">
            <div className="se-poker-table__meta"><span>{hand.street === 'SHOWDOWN' ? 'SHOWDOWN' : hand.street}</span><strong>Pot {formatCents(hand.potCents)}</strong></div>
            <div className="se-poker-table__board" aria-label="Community cards">
              {Array.from({ length: 5 }, (_, i) => <PlayingCard key={cardKey(hand.board[i], i)} card={hand.board[i]} delay={i * 65} />)}
            </div>
            <div className="se-poker-table__seats">
              {hand.seats.map((seat) => <article className={'se-poker-seat' + (seat.isHuman ? ' is-human' : '') + (seat.folded ? ' is-folded' : '')} key={seat.id}>
                <div className="se-poker-seat__heading"><strong>{seat.name}{seat.isHuman ? ' (you)' : ''}</strong><span>{seat.folded ? 'FOLDED' : formatCents(seat.stackCents) + ' stack'}</span></div>
                <div className="se-poker-seat__cards">{[0, 1].map((i) => <PlayingCard key={cardKey(seat.cards[i], i)} card={seat.cards[i]} delay={i * 70} />)}</div>
                {seat.handName ? <span className="se-poker-seat__hand">{seat.handName}</span> : null}
                <small>In pot: {formatCents(seat.contributionCents)}</small>
              </article>)}
            </div>
            {active ? <div className="se-poker-actions">
              <span>{active.amountToCallCents ? 'Call ' + formatCents(active.amountToCallCents) + ' or fold.' : 'Check, raise, or fold.'}</span>
              <div>
                <Button className="se-btn se-btn--ghost" disabled={busy} onClick={() => void act('FOLD')}>Fold</Button>
                {active.amountToCallCents === 0
                  ? <Button className="se-btn se-btn--ghost" disabled={busy} onClick={() => void act('CHECK')}>Check</Button>
                  : <Button className="se-btn se-btn--ghost" disabled={busy || !human || human.stackCents === 0} onClick={() => void act('CALL')}>{human && human.stackCents < active.amountToCallCents ? `All-in call ${formatCents(human.stackCents)}` : 'Call'}</Button>}
                <Button className="se-btn se-btn--ghost" disabled={busy || !human || human.stackCents === 0} onClick={() => void act('ALL_IN')}>All in</Button>
                <Button className="se-btn se-btn--primary" disabled={busy || !human || human.stackCents < active.amountToCallCents + (state.raiseCents ?? 200)} onClick={() => void act('RAISE')}>Raise {formatCents(state.raiseCents ?? 200)}</Button>
              </div>
            </div> : <div className="se-poker-actions"><span>{pokerOutcome(hand.outcome, hand.rakeCents)}</span>
              <label>Buy-in ($)<input inputMode="decimal" value={buyIn} onChange={(event) => setBuyIn(event.target.value)} disabled={busy} /></label>
              <Button className="se-btn se-btn--primary" disabled={!canDeal || busy} onClick={() => void deal()}>{busy ? 'Dealing...' : 'Deal another hand'}</Button>
            </div>}
          </div> : <div className="se-poker-lobby">
            <p>Play a hand of Texas Hold’em against Mack and Rico. Your hole cards stay private; bot cards are revealed only at showdown.</p>
            <label>Buy-in ($)<input inputMode="decimal" value={buyIn} onChange={(event) => setBuyIn(event.target.value)} disabled={busy} /></label>
            <small>Buy-in: {formatCents(state.minBuyInCents)}–{formatCents(state.maxBuyInCents)}. Blinds: {formatCents(state.smallBlindCents)} / {formatCents(state.bigBlindCents)}; the button moves every hand, so you post them in turn. Flopped pots take {(state.rakeBps / 100).toFixed(2)}% house rake, capped at {formatCents(state.rakeCapCents)}. Your remaining stack returns to the casino bankroll when the hand ends.</small>
            <Button className="se-btn se-btn--primary" disabled={!canDeal || busy} onClick={() => void deal()}>{busy ? 'Dealing...' : 'Sit down and deal'}</Button>
          </div>}
        </section>

        <section className="se-poker-box se-poker-box--multiplayer">
          <div className="se-poker-box__head">
            <div>
              <span className="se-eyebrow">Player tables</span>
              <h3>Multiplayer Tables</h3>
            </div>
            <small>{state.tables.length} open</small>
          </div>

          <div className="se-poker-lobby se-poker-lobby--multiplayer">
            <p>Join an open table in its city or open a new table. Blinds are {formatCents(state.bigBlindCents / 2)} / {formatCents(state.bigBlindCents)}; flopped pots take {state.rakeBps / 100}% rake, capped at {formatCents(state.rakeCapCents)}. Buy-ins stay escrowed until you leave.</p>
            {newInvite ? <Alert tone="success">Share both values with your guests: invite code <strong>{newInvite}</strong> and table ID <code>{state.tables.find((t) => t.visibility === 'PRIVATE' && t.seats.some((s) => s.isYou))?.id}</code>.</Alert> : null}
            <div className="se-poker-formgrid">
              <label>Table name<input value={tableName} maxLength={32} onChange={(event) => setTableName(event.target.value)} disabled={busy} /></label>
              <label>Table visibility<select value={visibility} onChange={(event) => setVisibility(event.target.value as 'PUBLIC' | 'PRIVATE')} disabled={busy}><option value="PUBLIC">Public</option><option value="PRIVATE">Private invite</option></select></label>
              <label>Buy-in ($)<input inputMode="decimal" value={buyIn} onChange={(event) => setBuyIn(event.target.value)} disabled={busy} /></label>
              <Button className="se-btn se-btn--primary" disabled={!canDeal || busy || tableName.trim().length < 3} onClick={() => void createTable()}>Create table</Button>
              <label>Private invite code<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} disabled={busy} autoCapitalize="characters" /></label>
              <label>Invite table ID<input value={inviteTableId} onChange={(event) => setInviteTableId(event.target.value)} disabled={busy} /></label>
              <Button className="se-btn se-btn--ghost" disabled={busy || !inviteTableId.trim() || !inviteCode.trim()} onClick={() => void joinTable(inviteTableId.trim())}>Join private table</Button>
            </div>
            <div className="se-poker-table-list">{state.tables.length ? state.tables.map((table) => {
              const yours = table.seats.some((seat) => seat.isYou);
              return <article key={table.id}><strong>{table.name}</strong><span>{table.cityName} · {table.visibility.toLowerCase()} · {formatCents(table.buyInCents)} · {table.seats.length}/{table.maxPlayers} seats</span>
                <small>{table.seats.map((seat) => seat.displayName + (seat.isYou ? ' (you)' : '')).join(' · ')}</small>
                {yours ? <div className="se-poker-table-list__actions">
                  <Button className="se-btn se-btn--ghost" disabled={busy} onClick={() => setActiveTableId(table.id)}>{table.status === 'PLAYING' ? 'Open live table' : 'View table'}</Button>
                  {table.status === 'WAITING' ? <><Button className="se-btn se-btn--primary" disabled={busy || table.seats.filter((seat) => seat.stackCents > 0).length < 2} onClick={() => void startTable(table.id)}>Deal hand</Button><Button className="se-btn se-btn--ghost" disabled={busy} onClick={() => void leaveTable(table.id)}>Leave and refund</Button></> : null}
                </div> : <Button className="se-btn se-btn--ghost" disabled={busy || table.status !== 'WAITING' || table.seats.length >= table.maxPlayers || !casinoPage.openSession || casinoPage.openSession.citySlug !== table.citySlug || casinoPage.openSession.bankrollCents < table.buyInCents} onClick={() => void joinTable(table.id)}>Join table</Button>}
              </article>;
            }) : <p>No open tables. Create one and invite a friend.</p>}</div>
          </div>

          {tableView ? <section className={'se-poker-table se-poker-table--multiplayer' + (tablePulse ? ` is-${tablePulse}` : '')}>
            <div className="se-poker-table__meta"><span>{tableView.name} · {tableView.hand ? `HAND ${tableView.hand.handNo} · ${tableView.hand.street}` : tableView.status}</span><strong>Pot {formatCents(tableView.hand?.potCents ?? 0)}</strong></div>
            <div className="se-poker-table__board" aria-label="Community cards">{Array.from({ length: 5 }, (_, i) => <PlayingCard key={cardKey(tableView.hand?.board[i], i)} card={tableView.hand?.board[i]} delay={i * 65} />)}</div>
            {tableView.hand ? <><div className="se-poker-table__seats">{tableView.hand.seats.map((seat) => <article key={seat.seatNo} className={'se-poker-seat' + (seat.isYou ? ' is-human' : '') + (seat.folded ? ' is-folded' : '') + (tableView.hand?.turnSeatNo === seat.seatNo ? ' is-turn' : '')}>
              <div className="se-poker-seat__heading"><strong>{seat.displayName}{seat.isYou ? ' (you)' : ''}</strong><span>{seat.folded ? 'FOLDED' : seat.allIn ? 'ALL IN' : formatCents(seat.stackCents) + ' stack'}</span></div>
              <div className="se-poker-seat__cards">{[0, 1].map((i) => <PlayingCard key={cardKey(seat.cards[i], i)} card={seat.cards[i]} delay={i * 70} />)}</div>
              {seat.handName ? <span className="se-poker-seat__hand">{seat.handName}</span> : null}<small>In pot: {formatCents(seat.contributionCents)}</small>
            </article>)}</div>
            {tableView.hand.outcome ? <Alert tone="success">{pokerOutcome(tableView.hand.outcome, tableView.hand.rakeCents)}</Alert> : null}
            {tableView.hand.myTurn ? <div className="se-poker-actions"><span>{tableView.hand.amountToCallCents ? `Call ${formatCents(tableView.hand.amountToCallCents)}, go all-in, or fold.` : 'Check, raise, go all-in, or fold.'}</span><div>
              {(() => { const mySeat = tableView.hand?.seats.find((seat) => seat.isYou); return <>
              <Button className="se-btn se-btn--ghost" disabled={busy} onClick={() => void playTable(tableView.id, 'FOLD')}>Fold</Button>
              {tableView.hand.amountToCallCents ? <Button className="se-btn se-btn--ghost" disabled={busy || !mySeat || mySeat.stackCents === 0} onClick={() => void playTable(tableView.id, 'CALL')}>{mySeat && mySeat.stackCents < tableView.hand!.amountToCallCents ? 'Call all in' : 'Call'}</Button> : <Button className="se-btn se-btn--ghost" disabled={busy} onClick={() => void playTable(tableView.id, 'CHECK')}>Check</Button>}
              <Button className="se-btn se-btn--ghost" disabled={busy || !mySeat || mySeat.stackCents === 0} onClick={() => void playTable(tableView.id, 'ALL_IN')}>All in</Button>
              <Button className="se-btn se-btn--primary" disabled={busy || !mySeat || mySeat.stackCents < tableView.hand.amountToCallCents + state.raiseCents} onClick={() => void playTable(tableView.id, 'RAISE')}>Raise {formatCents(state.raiseCents)}</Button>
              </>; })()}
            </div></div> : tableView.status === 'PLAYING' ? <div className="se-poker-actions"><small>Waiting for {waitingOn?.displayName ?? 'the next player'}... This table refreshes automatically.</small>
              {canSkipIdle ? <Button className="se-btn se-btn--ghost" disabled={busy} onClick={() => void skipIdle(tableView.id)}>Skip idle player</Button> : null}</div> : null}
            </> : tableView.status === 'WAITING' ? <p>Waiting for a player to deal the next hand.</p> : null}
          </section> : null}
        </section>
      </div>
    ) : null}
  </Panel>;
}
