import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatCentsExact,
  formatNumber,
  type PlayerBoardDto,
  type PlayerBoardFilterDto,
  type PlayerBoardListableDto,
  type PlayerBoardOfferDto,
  type PlayerBoardRowDto,
  type StoreDto,
} from '@streets/shared';
import { ApiError } from '../api/client.js';
import { storesApi } from '../api/stores.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { confirmAction } from '../stores/confirm.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { formatDuration } from '../utils/time.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { StoreTabs } from './StoreTabs.js';

/** The posting fee the server will charge: the ruleset's percent of book, rounded up, never under the minimum. */
export function boardPostingFeeCents(bookCents: number, quantity: number, rules: PlayerBoardDto['rules']): number {
  return Math.max(rules.postingFeeMinCents, Math.ceil((bookCents * quantity * rules.postingFeePercent) / 100));
}

/** What a seller keeps from a fill: the share after tax, rounded down, as the server pays it. */
export function boardSellerProceedsCents(totalCents: number, rules: PlayerBoardDto['rules']): number {
  return Math.floor((totalCents * (100 - rules.taxPercent)) / 100);
}

/** Dollars typed into the price box, as whole cents, or null when it is not a price. */
export function parseDollarsToCents(value: string): number | null {
  const match = /^\s*\$?(\d{1,9})(?:\.(\d{1,2}))?\s*$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

const FILTERS: ReadonlyArray<readonly [PlayerBoardFilterDto, string]> = [['ALL', 'All'], ['PARTS', 'Parts']];
const STATUS_LABEL: Record<PlayerBoardOfferDto['status'], string> = { OPEN: 'Up', SOLD: 'Sold', CANCELLED: 'Cancelled', EXPIRED: 'Expired' };

function closesIn(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  return ms > 0 ? formatDuration(ms) : 'closing';
}

interface ListForm { key: string; quantity: string; price: string; hours: number }

export interface PlayerBoardViewProps {
  book: PlayerBoardDto;
  now: number;
  busy: boolean;
  form: ListForm;
  onFilter: (filter: PlayerBoardFilterDto) => void;
  onForm: (form: ListForm) => void;
  onPost: () => void;
  onCancel: (offer: PlayerBoardOfferDto) => void;
  onBuy: (row: PlayerBoardRowDto) => void;
}

function ListPanel({ book, busy, form, onForm, onPost }: Pick<PlayerBoardViewProps, 'book' | 'busy' | 'form' | 'onForm' | 'onPost'>) {
  const part: PlayerBoardListableDto | undefined = book.listable.find((row) => row.key === form.key) ?? book.listable[0];
  if (!part) {
    return <p className="se-board-empty">You have no parts to list. Scouting turns them up; the Salvage Yard sells the everyday ones.</p>;
  }
  const quantity = Number(form.quantity);
  const price = parseDollarsToCents(form.price);
  const quantityOk = Number.isInteger(quantity) && quantity >= 1 && quantity <= part.held;
  const priceOk = price !== null && price >= part.floorCents && price <= part.capCents;
  const fee = quantityOk ? boardPostingFeeCents(part.bookCents, quantity, book.rules) : null;
  const full = book.openOffers >= book.rules.maxOpenOffers;
  const reason = full ? `You already have ${book.rules.maxOpenOffers} offers up.`
    : !quantityOk ? `List from 1 to ${formatNumber(part.held)}.`
      : !priceOk ? `Price each from ${formatCentsExact(part.floorCents)} to ${formatCentsExact(part.capCents)}.`
        : busy ? 'Your last change is still going through.' : null;
  return (
    <form className="se-board-list" onSubmit={(event) => { event.preventDefault(); if (!reason) onPost(); }}>
      <div className="se-field">
        <label className="se-label" htmlFor="board-part">Part</label>
        <select id="board-part" className="se-input" value={part.key}
          onChange={(event) => {
            const next = book.listable.find((row) => row.key === event.target.value)!;
            onForm({ ...form, key: next.key, quantity: String(Math.min(Number(form.quantity) || 1, next.held)), price: (next.floorCents / 100).toFixed(2) });
          }}>
          {book.listable.map((row) => <option key={row.key} value={row.key}>{row.name} ({formatNumber(row.held)} held)</option>)}
        </select>
      </div>
      <div className="se-field">
        <label className="se-label" htmlFor="board-quantity">How many</label>
        <input id="board-quantity" className="se-input" type="number" inputMode="numeric" min={1} max={part.held} step={1}
          value={form.quantity} onChange={(event) => onForm({ ...form, quantity: event.target.value })} />
      </div>
      <div className="se-field">
        <label className="se-label" htmlFor="board-price">Price each</label>
        <input id="board-price" className="se-input" inputMode="decimal" value={form.price}
          onChange={(event) => onForm({ ...form, price: event.target.value })} aria-describedby="board-price-hint" />
        <p className="se-hint" id="board-price-hint">From {formatCentsExact(part.floorCents)} to {formatCentsExact(part.capCents)}.</p>
      </div>
      <div className="se-field">
        <span className="se-label" id="board-hours-label">Up for</span>
        <div className="se-seg" role="group" aria-labelledby="board-hours-label">
          {book.rules.listingHours.map((hours) => (
            <button key={hours} type="button" className={`se-seg__btn${form.hours === hours ? ' se-seg__btn--on' : ''}`}
              aria-pressed={form.hours === hours} onClick={() => onForm({ ...form, hours })}>{hours} hours</button>
          ))}
        </div>
      </div>
      <p className="se-board-list__terms">
        {fee !== null ? <>Posting fee <strong>{formatCentsExact(fee)}</strong>, kept even if it does not sell. </> : null}
        {quantityOk && priceOk ? <>A sale pays you <strong>{formatCentsExact(boardSellerProceedsCents(price! * quantity, book.rules))}</strong> after the {book.rules.taxPercent}% cut.</> : null}
      </p>
      <Button type="submit" variant="primary" disabledReason={reason}>Post offer</Button>
    </form>
  );
}

/** The Board tab's content. Pure, so it renders the same in tests as in the game. */
export function PlayerBoardView({ book, now, busy, form, onFilter, onForm, onPost, onCancel, onBuy }: PlayerBoardViewProps) {
  return (
    <>
      <div className="se-filter-group se-board-filters">
        <span className="se-filter-label">Show</span>
        <div className="se-seg" role="group" aria-label="Board goods">
          {FILTERS.map(([value, label]) => (
            <button key={value} type="button" className={`se-seg__btn${book.filter === value ? ' se-seg__btn--on' : ''}`}
              aria-pressed={book.filter === value} onClick={() => onFilter(value)}>{label}</button>
          ))}
        </div>
      </div>

      <section className="se-board-section" aria-labelledby="board-book">
        <div className="se-stores-sectionhead">
          <div><span className="se-eyebrow">City-wide</span><h2 id="board-book">On the Board</h2></div>
          <p>Cheapest first for each item. A buy takes the whole offer and pays on the spot.</p>
        </div>
        {book.rows.length === 0 ? (
          <p className="se-board-empty">Nothing is up right now.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards se-board-book">
              <thead><tr><th>Item</th><th>Seller</th><th className="se-table__number">Qty</th><th className="se-table__number">Each</th><th className="se-table__number">Total</th><th>Closes</th><th><span className="se-sr-only">Actions</span></th></tr></thead>
              <tbody>
                {book.rows.map((row) => (
                  <tr key={row.id} className={row.mine ? 'se-board-book__mine' : undefined}>
                    <td data-label="Item"><span className={`se-board-rarity se-board-rarity--${(row.rarity ?? 'common').toLowerCase()}`}>{row.name}</span></td>
                    <td data-label="Seller"><span>{row.sellerName}{row.mine ? <span className="se-board-you"> (you)</span> : null}</span></td>
                    <td className="se-table__number se-num" data-label="Qty">{formatNumber(row.quantity)}</td>
                    <td className="se-table__number se-num" data-label="Each">{formatCentsExact(row.unitPriceCents)}</td>
                    <td className="se-table__number se-num" data-label="Total">{formatCentsExact(row.totalCents)}</td>
                    <td data-label="Closes">{closesIn(row.expiresAt, now)}</td>
                    <td data-label="">
                      {row.mine ? null : (
                        <Button size="sm" variant="primary"
                          disabledReason={busy ? 'Your last change is still going through.' : row.totalCents > book.cashCents ? `You need ${formatCentsExact(row.totalCents)} on hand.` : null}
                          onClick={() => onBuy(row)}>Buy</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="se-board-section" aria-labelledby="board-mine">
        <div className="se-stores-sectionhead">
          <div><span className="se-eyebrow">{formatNumber(book.openOffers)} of {formatNumber(book.rules.maxOpenOffers)} up</span><h2 id="board-mine">Your offers</h2></div>
          <p>Cancel brings the stack home. The posting fee stays spent.</p>
        </div>
        {book.mine.length === 0 ? (
          <p className="se-board-empty">You have not listed anything.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards se-board-mine">
              <thead><tr><th>Item</th><th className="se-table__number">Qty</th><th className="se-table__number">Each</th><th>Status</th><th><span className="se-sr-only">Actions</span></th></tr></thead>
              <tbody>
                {book.mine.map((offer) => (
                  <tr key={offer.id}>
                    <td data-label="Item">{offer.name}</td>
                    <td className="se-table__number se-num" data-label="Qty">{formatNumber(offer.quantity)}</td>
                    <td className="se-table__number se-num" data-label="Each">{formatCentsExact(offer.unitPriceCents)}</td>
                    <td data-label="Status">
                      {offer.status === 'OPEN' ? `Up · ${closesIn(offer.expiresAt, now)}` : STATUS_LABEL[offer.status]}
                      {offer.returned ? null : ' · waiting on stash room'}
                    </td>
                    <td data-label="">
                      {offer.status === 'OPEN' ? (
                        <Button size="sm" disabledReason={busy ? 'Your last change is still going through.' : null} onClick={() => onCancel(offer)}>Cancel</Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="se-board-section" aria-labelledby="board-post">
        <div className="se-stores-sectionhead">
          <div><span className="se-eyebrow">Sell</span><h2 id="board-post">List parts</h2></div>
          <p>The stack leaves your stash while it is up.</p>
        </div>
        <ListPanel book={book} busy={busy} form={form} onForm={onForm} onPost={onPost} />
      </section>
    </>
  );
}

/** The Board: the player listings tab on Stores. Rounds without the Board never show it. */
export function PlayerBoard() {
  const me = useSession((s) => s.me);
  const [book, setBook] = useState<PlayerBoardDto | null>(null);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [filter, setFilter] = useState<PlayerBoardFilterDto>('ALL');
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ListForm>({ key: '', quantity: '1', price: '', hours: 12 });
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (which: PlayerBoardFilterDto) => {
    try {
      const data = await storesApi.board(which);
      setBook(data);
      setForm((current) => {
        if (data.listable.some((row) => row.key === current.key)) return current;
        const first = data.listable[0];
        return { ...current, key: first?.key ?? '', price: first ? (first.floorCents / 100).toFixed(2) : '', hours: data.rules.listingHours[0] ?? 12 };
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'BOARD_CLOSED') setClosed(true);
      else setError(caught instanceof ApiError ? caught.message : 'Could not load the Board.');
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);
  useEffect(() => {
    let active = true;
    storesApi.catalog().then((data) => { if (active) setStores(data.stores); }).catch(() => undefined);
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  async function change(run: () => Promise<string>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await run());
      await load(filter);
      void useSession.getState().refreshSnapshot({ background: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not go through. Refresh and try again.');
    } finally {
      setBusy(false);
    }
  }

  function post() {
    if (!book) return;
    const price = parseDollarsToCents(form.price);
    if (price === null) return;
    void change(async () => {
      const result = await storesApi.boardPost({ itemKey: form.key, quantity: Number(form.quantity), unitPriceCents: price, durationHours: form.hours });
      return `Posted ${formatNumber(result.offer.quantity)} × ${result.offer.name} at ${formatCentsExact(result.offer.unitPriceCents)} each. Fee ${formatCentsExact(result.feeCents)}.`;
    });
  }

  async function buy(row: PlayerBoardRowDto) {
    const ok = await confirmAction({
      title: `Buy ${formatNumber(row.quantity)} × ${row.name}?`,
      body: `You pay ${formatCentsExact(row.totalCents)} to ${row.sellerName} for the whole stack.`,
      confirmLabel: `Pay ${formatCentsExact(row.totalCents)}`,
    });
    if (!ok) return;
    // One id per click: a retried request after a dropped connection cannot buy twice.
    const actionId = newActionId();
    void change(async () => {
      const result = await storesApi.boardBuy(row.id, actionId);
      return `Bought ${formatNumber(result.quantity)} × ${result.name} from ${result.sellerName} for ${formatCentsExact(result.paidCents)}.`;
    });
  }

  function cancel(offer: PlayerBoardOfferDto) {
    void change(async () => {
      const result = await storesApi.boardCancel(offer.id);
      return `${formatNumber(result.returnedQuantity)} × ${result.offer.name} back in your stash.`;
    });
  }

  return (
    <GameLayout>
      <div className="se-stores">
        <header className="se-stores-hero se-stores-hero--board">
          <div className="se-stores-hero__copy">
            <span className="se-eyebrow">Player listings{me ? ` · ${me.city.name}` : ''}</span>
            <h1>The Board</h1>
            <p>Stacks other crews have put up. Prices stay inside a set range for each item, and the Board keeps a cut of every sale.</p>
          </div>
        </header>

        <StoreTabs stores={stores} slug="board" board={!closed} />

        {closed ? <Alert>That store is not open. <Link to="/game/stores/corner">Visit the Corner Store</Link>.</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <p className="se-salvage-receipt" role="status">{notice}</p> : null}
        {!book && !closed && !error ? <div className="se-stores-loading" role="status">Loading the Board...</div> : null}
        {book && !closed ? (
          <PlayerBoardView book={book} now={now} busy={busy} form={form}
            onFilter={setFilter} onForm={setForm} onPost={post} onCancel={cancel} onBuy={(row) => void buy(row)} />
        ) : null}
      </div>
    </GameLayout>
  );
}
