import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  formatCentsExact,
  formatNumber,
  type PlayerBoardDto,
  type PlayerBoardFilterDto,
  type PlayerBoardListableDto,
  type PlayerBoardOfferDto,
  type PlayerBoardRowDto,
  type ProductStockDto,
  type ProductsDto,
  type StoreDto,
} from '@streets/shared';
import { ApiError, api } from '../api/client.js';
import { storesApi } from '../api/stores.js';
import { questsApi } from '../api/quests.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { confirmAction } from '../stores/confirm.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import { formatDuration } from '../utils/time.js';
import '../styles/stores.css';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { ItemLabel, ShelfArt } from './ItemTile.js';

/** The posting fee the server will charge: the ruleset's percent of book, rounded up, never under the minimum. */
export function boardPostingFeeCents(bookCents: number, quantity: number, rules: PlayerBoardDto['rules']): number {
  return Math.max(rules.postingFeeMinCents, Math.ceil((bookCents * quantity * rules.postingFeePercent) / 100));
}

/** What a seller keeps from a fill: the share after tax, rounded down, as the server pays it. */
export function boardSellerProceedsCents(totalCents: number, rules: PlayerBoardDto['rules']): number {
  return totalCents;
}

/** Dollars typed into the price box, as whole cents, or null when it is not a price. */
export function parseDollarsToCents(value: string): number | null {
  const match = /^\s*\$?(\d{1,9})(?:\.(\d{1,2}))?\s*$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

const FILTERS: ReadonlyArray<readonly [PlayerBoardFilterDto, string]> = [['ALL', 'All items'], ['PRODUCTS', 'Drugs'], ['KEEPER', 'Guns & cars'], ['PARTS', 'Parts']];
const STATUS_LABEL: Record<PlayerBoardOfferDto['status'], string> = { OPEN: 'Up', SOLD: 'Sold', CANCELLED: 'Cancelled', EXPIRED: 'Expired' };
const BOARD_UNLOCK_QUEST_KEYS = ['ML_M09_TWO_BUYERS', 'ML_M10_FAVOR_ALREADY_PAID'] as const;
function closesIn(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  return ms > 0 ? formatDuration(ms) : 'closing';
}

/**
 * The cash a barter's buyer adds, as the server prices it: the gap between the Board value taken
 * and the goods handed over, at the cash weight, rounded up to whole dollars. Zero when the goods
 * are worth as much or more.
 */
export function boardBarterTopUpCents(offerBookCents: number, askBookCents: number, rules: PlayerBoardDto['rules']): number {
  const gap = offerBookCents - askBookCents;
  if (gap <= 0) return 0;
  return Math.ceil(Math.ceil((gap * 100) / rules.cashWeightPercent) / 100) * 100;
}

const ceilToDollar = (cents: number) => (cents <= 0 ? 0 : Math.ceil(cents / 100) * 100);

/** Listing tax for a cash price above the fair range, as the server charges it at posting. */
export function boardCashListingTaxCents(unitPriceCents: number, bookCents: number, quantity: number, rules: PlayerBoardDto['rules']): number {
  const proceeds = Math.floor((unitPriceCents * quantity * (100 - rules.taxPercent)) / 100);
  return ceilToDollar(proceeds - Math.floor((bookCents * quantity * 100) / rules.cashWeightPercent));
}

/** The Board fee a buyer pays for `units` at a cash price below the fair range, as the server charges it. */
export function boardCashBuyerFeeCents(unitPriceCents: number, bookCents: number, units: number, rules: PlayerBoardDto['rules']): number {
  return ceilToDollar(Math.ceil((bookCents * units * 100) / rules.cashWeightPercent) - unitPriceCents * units);
}

/** Listing tax for a barter asking for more than its lots are worth, as the server charges it. */
export function boardBarterListingTaxCents(lotBookCents: number, askBookCents: number, lots: number, rules: PlayerBoardDto['rules']): number {
  const gain = (askBookCents - lotBookCents) * lots;
  return gain <= 0 ? 0 : ceilToDollar(Math.ceil((gain * 100) / rules.cashWeightPercent));
}

/** What a barter's price line says about its lot: "each", or "per 10". */
export function lotLabel(lotSize: number): string {
  return lotSize === 1 ? 'each' : `per ${formatNumber(lotSize)}`;
}

/** The Board's extra for taking `units` of a row: a barter's top-up, or the fee on a cash price below the fair range. */
export function boardRowTopUpCents(row: PlayerBoardRowDto, units: number, rules: PlayerBoardDto['rules']): number {
  if (row.priceKind === 'CASH') return boardCashBuyerFeeCents(row.unitPriceCents, row.lotBookCents, units, rules);
  return boardBarterTopUpCents(row.lotBookCents, row.askBookCents, rules);
}

/** "2 × Radio + 1 × Cloth". */
export function askSummary(ask: ReadonlyArray<{ name: string; quantity: number }>): string {
  return ask.map((line) => `${formatNumber(line.quantity)} × ${line.name}`).join(' + ');
}

export interface ListForm {
  key: string;
  quantity: string;
  mode: 'CASH' | 'BARTER';
  price: string;
  ask: Array<{ key: string; quantity: string }>;
  /** Barter: units the ask buys, as typed. 1 means the ask is per unit. */
  lot: string;
  hours: number;
}

export interface PlayerBoardViewProps {
  book: PlayerBoardDto;
  now: number;
  busy: boolean;
  form: ListForm;
  onFilter: (filter: PlayerBoardFilterDto) => void;
  onForm: (form: ListForm) => void;
  onPost: () => void;
  onCancel: (offer: PlayerBoardOfferDto) => void;
  /** How many the viewer wants from each cash offer, by offer id, as typed. Missing means all of it. */
  buyQuantities: Readonly<Record<string, string>>;
  onBuyQuantity: (offerId: string, value: string) => void;
  onBuy: (row: PlayerBoardRowDto, quantity: number) => void;
  traderStores?: StoreDto[];
  traderQuantities?: Readonly<Record<string, string>>;
  onTraderQuantity?: (key: string, value: string) => void;
  onTraderBuy?: (store: StoreDto, item: StoreDto['items'][number], quantity: number) => void;
  pipProducts?: ProductStockDto[];
  onPipBuy?: (product: ProductStockDto, quantity: number) => void;
}

/** Units the viewer has asked for from an offer: all that is left unless they typed a number. Null when it is not a valid amount. */
export function boardBuyUnits(row: PlayerBoardRowDto, typed: string | undefined): number | null {
  if (row.priceKind === 'BARTER') return typed === undefined || typed === '' || Number(typed) === row.quantity ? row.quantity : null;
  if (typed === undefined || typed === '') return row.quantity;
  const units = Number(typed);
  return Number.isInteger(units) && units >= 1 && units <= row.quantity && units % row.lotSize === 0 ? units : null;
}

function ItemOptions({ rows }: { rows: ReadonlyArray<{ key: string; name: string; category: 'PART' | 'PRODUCT' | 'KEEPER'; label?: string }> }) {
  return (
    <>
      {([['PRODUCT', 'Drugs'], ['KEEPER', 'Guns & cars'], ['PART', 'Parts']] as const).map(([category, label]) => {
        const group = rows.filter((row) => row.category === category);
        return group.length ? (
          <optgroup key={category} label={label}>
            {group.map((row) => <option key={row.key} value={row.key}>{row.label ?? row.name}</option>)}
          </optgroup>
        ) : null;
      })}
    </>
  );
}

function ListPanel({ book, busy, form, onForm, onPost }: Pick<PlayerBoardViewProps, 'book' | 'busy' | 'form' | 'onForm' | 'onPost'>) {
  const part: PlayerBoardListableDto | undefined = book.listable.find((row) => row.key === form.key) ?? book.listable[0];
  if (!part) {
    return <p className="se-board-empty">You have nothing to list. Drugs come from cooking and Pip; parts come from scouting.</p>;
  }
  const quantity = Number(form.quantity);
  const quantityOk = Number.isInteger(quantity) && quantity >= 1 && quantity <= part.held;
  const fee = quantityOk ? boardPostingFeeCents(part.bookCents, quantity, book.rules) : null;
  const full = book.openOffers >= book.rules.maxOpenOffers;
  const barter = form.mode === 'BARTER';

  const price = parseDollarsToCents(form.price);
  const priceOk = price !== null && price >= 1;
  const listingTax = !barter && priceOk && quantityOk ? boardCashListingTaxCents(price!, part.bookCents, quantity, book.rules) : 0;
  const underRange = !barter && priceOk && price! < part.floorCents;

  const askable = book.askable.filter((row) => row.key !== part.key);
  const askLines = form.ask.map((line) => ({ ...line, item: askable.find((row) => row.key === line.key), units: Number(line.quantity) }));
  const askLinesOk = askLines.length > 0 && askLines.every((line) => line.item && Number.isInteger(line.units) && line.units >= 1)
    && new Set(askLines.map((line) => line.key)).size === askLines.length;
  const lotOk = quantityOk;
  const lots = lotOk ? 1 : null;
  const lotBook = lotOk ? part.bookCents * quantity : 0;
  const askBook = askLines.reduce((sum, line) => sum + (line.item?.bookCents ?? 0) * (Number.isInteger(line.units) ? Math.max(0, line.units) : 0), 0);
  const ready = askLinesOk && quantityOk;
  const topUp = ready ? boardBarterTopUpCents(lotBook, askBook, book.rules) : null;
  const barterTax = ready ? boardBarterListingTaxCents(lotBook, askBook, 1, book.rules) : 0;
  const tax = barter ? barterTax : listingTax;

  const reason = full ? `You already have ${book.rules.maxOpenOffers} offers up.`
    : !quantityOk ? `List from 1 to ${formatNumber(part.held)}.`
      : barter
        ? !askLinesOk ? 'Ask for whole numbers of different things.'
             : busy ? 'Your last change is still going through.' : null
        : !priceOk ? 'Set a price of at least one cent each.'
          : busy ? 'Your last change is still going through.' : null;

  const setAsk = (index: number, change: Partial<{ key: string; quantity: string }>) =>
    onForm({ ...form, ask: form.ask.map((line, at) => (at === index ? { ...line, ...change } : line)) });
  const firstFree = askable.find((row) => !form.ask.some((line) => line.key === row.key));

  return (
    <form className="se-board-list" onSubmit={(event) => { event.preventDefault(); if (!reason) onPost(); }}>
      <div className="se-field">
        <label className="se-label" htmlFor="board-part">Item</label>
        <select id="board-part" className="se-input" value={part.key}
          onChange={(event) => {
            const next = book.listable.find((row) => row.key === event.target.value)!;
            onForm({
              ...form, key: next.key, quantity: String(Math.min(Number(form.quantity) || 1, next.held)), price: (next.floorCents / 100).toFixed(2),
              ask: form.ask.filter((line) => line.key !== next.key),
            });
          }}>
          <ItemOptions rows={book.listable.map((row) => ({ ...row, label: `${row.name} (${formatNumber(row.held)} held)` }))} />
        </select>
      </div>
      <div className="se-field">
        <label className="se-label" htmlFor="board-quantity">How many</label>
        <input id="board-quantity" className="se-input" type="number" inputMode="numeric" min={1} max={part.held} step={1}
          value={form.quantity} onChange={(event) => onForm({ ...form, quantity: event.target.value })} />
      </div>
      <div className="se-field">
        <span className="se-label" id="board-mode-label">Sell for</span>
        <div className="se-seg" role="group" aria-labelledby="board-mode-label">
          {([['CASH', 'Cash'], ['BARTER', 'Barter']] as const).map(([mode, label]) => (
            <button key={mode} type="button" className={`se-seg__btn${form.mode === mode ? ' se-seg__btn--on' : ''}`} aria-pressed={form.mode === mode}
              onClick={() => onForm({ ...form, mode, ask: mode === 'BARTER' && form.ask.length === 0 && firstFree ? [{ key: firstFree.key, quantity: '1' }] : form.ask })}>{label}</button>
          ))}
        </div>
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

      {barter ? (
        <fieldset className="se-board-ask">
          <legend className="se-label">Ask in trade</legend>
          <p className="se-hint">The buyer hands over this basket for the entire {formatNumber(quantity || 0)} {part.name.toLowerCase()}.</p>
          {form.ask.map((line, index) => (
            <div className="se-board-ask__line" key={index}>
              <select className="se-input" aria-label={`Trade item ${index + 1}`} value={line.key} onChange={(event) => setAsk(index, { key: event.target.value })}>
                <ItemOptions rows={askable.filter((row) => row.key === line.key || !form.ask.some((other) => other.key === row.key))} />
              </select>
              <input className="se-input" type="number" inputMode="numeric" min={1} step={1} aria-label={`How many of trade item ${index + 1}`}
                value={line.quantity} onChange={(event) => setAsk(index, { quantity: event.target.value })} />
              <Button size="sm" variant="ghost" onClick={() => onForm({ ...form, ask: form.ask.filter((_, at) => at !== index) })}>Remove</Button>
            </div>
          ))}
          {form.ask.length < book.rules.maxAskItems && firstFree ? (
            <Button size="sm" onClick={() => onForm({ ...form, ask: [...form.ask, { key: firstFree.key, quantity: '1' }] })}>Add an item</Button>
          ) : null}
          <p className="se-hint">
             Asking {formatCentsExact(askBook)} for the full {formatCentsExact(lotBook)} Board value.
            {barterTax > 0 ? ` That is more than they are worth, so posting costs ${formatCentsExact(barterTax)} of tax.` : topUp ? ` Buying all of them, the buyer adds ${formatCentsExact(topUp)} to the Board to even it out.` : topUp === 0 ? ' An even swap.' : ''}
             {' '}The basket is all-or-nothing.
          </p>
        </fieldset>
      ) : (
        <div className="se-field">
          <label className="se-label" htmlFor="board-price">Price each</label>
          <input id="board-price" className="se-input" inputMode="decimal" value={form.price}
            onChange={(event) => onForm({ ...form, price: event.target.value })} aria-describedby="board-price-hint" />
          <p className="se-hint" id="board-price-hint">
            Fair range {formatCentsExact(part.floorCents)} to {formatCentsExact(part.capCents)}: no extra charge.
            {listingTax > 0 ? ` Above it you pay ${formatCentsExact(listingTax)} of tax to post.` : underRange ? ' Below it, buyers pay the Board extra.' : ''}
          </p>
        </div>
      )}

      <p className="se-board-list__terms">
        {fee !== null ? <>Posting fee <strong>{formatCentsExact(fee)}</strong>{tax > 0 ? <> plus <strong>{formatCentsExact(tax)}</strong> of tax</> : null}, kept even if it does not sell. </> : null}
         {!barter && quantityOk && priceOk ? <>A sale pays you <strong>{formatCentsExact(boardSellerProceedsCents(price! * quantity, book.rules))}</strong>. The only charge is the posting fee.</> : null}
        {barter && ready ? <>Selling all of it hands you <strong>{askSummary(askLines.map((line) => ({ name: line.item!.name, quantity: line.units * lots! })))}</strong>.</> : null}
      </p>
      <Button type="submit" variant="primary" disabledReason={reason}>Post offer</Button>
    </form>
  );
}

/** Why the viewer cannot take this offer right now, or null when they can. */
function buyBlocker(row: PlayerBoardRowDto, book: PlayerBoardDto, busy: boolean, units: number | null): string | null {
  if (busy) return 'Your last change is still going through.';
  if (units === null) {
    return row.lotSize > 1 ? `Take lots of ${formatNumber(row.lotSize)}, up to ${formatNumber(row.quantity)}.` : `Buy from 1 to ${formatNumber(row.quantity)}.`;
  }
  const cash = (row.priceKind === 'BARTER' ? 0 : row.unitPriceCents * units) + boardRowTopUpCents(row, units, book.rules);
  if (cash > book.cashCents) return `You need ${formatCentsExact(cash)} on hand.`;
  const lots = units / row.lotSize;
  const short = row.ask.find((line) => (book.holdings[line.key] ?? 0) < line.quantity * lots);
  return short ? `You need ${formatNumber(short.quantity * lots)} ${short.name.toLowerCase()} to trade.` : null;
}

/** The Street Market's player listings and selling desk. */
export function PlayerBoardView({ book, now, busy, form, onFilter, onForm, onPost, onCancel, buyQuantities, onBuyQuantity, onBuy, traderStores = [], traderQuantities = {}, onTraderQuantity, onTraderBuy, pipProducts = [], onPipBuy }: PlayerBoardViewProps) {
  const [section, setSection] = useState<'browse' | 'listings' | 'sell'>('browse');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'price-low' | 'price-high' | 'quantity' | 'ending'>('price-low');
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const visibleRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return book.rows
      .filter((row) => !needle || row.name.toLocaleLowerCase().includes(needle) || row.sellerName.toLocaleLowerCase().includes(needle))
      .sort((a, b) => {
        if (sort === 'price-low' || sort === 'price-high') {
          if (a.priceKind !== b.priceKind) return a.priceKind === 'BARTER' ? 1 : -1;
          return sort === 'price-high' ? b.unitPriceCents - a.unitPriceCents : a.unitPriceCents - b.unitPriceCents;
        }
        if (sort === 'quantity') return b.quantity - a.quantity;
        if (sort === 'ending') return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
        return 0;
      });
  }, [book.rows, query, sort]);
  const selectedRow = visibleRows.find((row) => row.id === selectedOfferId) ?? visibleRows[0] ?? null;
  const selectedUnits = selectedRow ? boardBuyUnits(selectedRow, buyQuantities[selectedRow.id]) : null;
  const selectedFee = selectedRow && selectedUnits ? boardRowTopUpCents(selectedRow, selectedUnits, book.rules) : 0;
  const selectedCash = selectedRow && selectedUnits
    ? (selectedRow.priceKind === 'BARTER' ? 0 : selectedRow.unitPriceCents * selectedUnits) + selectedFee
    : 0;
  return (
    <>
      <section className="se-stores-market se-board-market" aria-label="Board market">
        <div className="se-stores-market__main">
          <div className="se-market-tabs" role="group" aria-label="Market sections">
            {([['browse', 'Browse market'], ['listings', `My listings (${book.mine.length})`], ['sell', 'Sell an item']] as const).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={section === key}
                className={`se-market-tabs__tab${section === key ? ' is-active' : ''}`} onClick={() => setSection(key)}>{label}</button>
            ))}
          </div>

          {section === 'browse' ? <>
            <div className="se-market-layout">
              <aside className="se-market-categories" aria-label="Listing categories">
                <span className="se-eyebrow">Browse goods</span>
                {FILTERS.map(([value, label]) => (
                  <button key={value} type="button" className={`se-market-category${book.filter === value ? ' is-active' : ''}`}
                    aria-pressed={book.filter === value} onClick={() => onFilter(value)}>
                    <span>{label}</span>
                  </button>
                ))}
              </aside>

              <section className="se-market-results" aria-labelledby="market-listings-heading">
                <div className="se-market-controls">
                  <label className="se-field se-market-search">
                    <span className="se-sr-only">Search item or seller</span>
                    <input className="se-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item or seller" />
                  </label>
                  <label className="se-field se-market-sort">
                    <span className="se-sr-only">Sort listings</span>
                    <select className="se-input" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
                      <option value="price-low">Lowest price</option><option value="price-high">Highest price</option>
                      <option value="quantity">Largest stack</option><option value="ending">Ending soon</option>
                    </select>
                  </label>
                </div>
                <div className="se-market-results__heading">
                  <div><span className="se-eyebrow">{formatNumber(visibleRows.length)} listings</span><h2 id="market-listings-heading">On the street</h2></div>
                  <span>City-wide offers</span>
                </div>
                {visibleRows.length === 0 ? (
                  <p className="se-board-empty">{query ? 'No listings match that search.' : 'Nothing is listed in this category yet.'}</p>
                ) : (
                  <div className="se-tablewrap se-market-tablewrap">
                    <table className="se-table se-board-book se-market-table">
                      <thead><tr><th>Item</th><th>Seller</th><th className="se-table__number">Available</th><th>Price / unit</th><th>Ends</th></tr></thead>
                      <tbody>
                        {visibleRows.map((row) => (
                          <tr key={row.id} className={`${row.mine ? 'se-board-book__mine ' : ''}${selectedRow?.id === row.id ? 'se-market-listing--selected' : ''}`}>
                            <td data-label="Item">
                              <button type="button" className="se-market-rowpick" aria-pressed={selectedRow?.id === row.id} onClick={() => setSelectedOfferId(row.id)}>
                                <ItemLabel itemKey={row.itemKey} zoomable={false}>
                                  <span className={`se-board-rarity se-board-rarity--${row.category === 'PRODUCT' ? 'product' : row.category === 'KEEPER' ? 'keeper' : (row.rarity ?? 'common').toLowerCase()}`}>{row.name}</span>
                                </ItemLabel>
                              </button>
                            </td>
                            <td data-label="Seller"><span>{row.sellerName}{row.mine ? <span className="se-board-you"> (you)</span> : null}</span></td>
                            <td className="se-table__number se-num" data-label="Available">{formatNumber(row.quantity)}</td>
                            <td className="se-board-trade" data-label="Price / unit">
                              {row.priceKind === 'BARTER' ? <span className="se-board-trade__tag">Trade offer</span> : <><span className="se-num">{formatCentsExact(row.unitPriceCents)}</span><small className="se-market-row-note"> each</small></>}
                            </td>
                            <td data-label="Ends">{closesIn(row.expiresAt, now)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <aside className="se-market-inspector" aria-label="Selected listing details" aria-live="polite">
                {selectedRow ? <>
                  <div className="se-market-inspector__art"><ShelfArt itemKey={selectedRow.itemKey} locked={false} soldOut={false} size="lg" /></div>
                  <div className="se-market-inspector__body">
                    <span className="se-eyebrow">Offer details</span>
                    <h2>{selectedRow.name}</h2>
                    <p className="se-market-inspector__seller">Listed by <strong>{selectedRow.sellerName}{selectedRow.mine ? ' · you' : ''}</strong></p>
                    <div className="se-market-inspector__price">
                      <span>{selectedRow.priceKind === 'BARTER' ? 'Trade terms' : 'Price per unit'}</span>
                      <strong>{selectedRow.priceKind === 'BARTER' ? 'Trade' : formatCentsExact(selectedRow.unitPriceCents)}</strong>
                    </div>
                    {selectedRow.priceKind === 'BARTER' ? <p className="se-market-inspector__terms">{askSummary(selectedRow.ask)}{selectedFee > 0 ? ` + ${formatCentsExact(selectedFee)} Board fee` : ''}</p> : null}
                    <div className="se-market-inspector__detail"><span>Available</span><strong>{formatNumber(selectedRow.quantity)}</strong></div>
                    <div className="se-market-inspector__detail"><span>Listing ends</span><strong>{closesIn(selectedRow.expiresAt, now)}</strong></div>
                    {!selectedRow.mine && selectedRow.priceKind === 'CASH' && selectedRow.quantity > selectedRow.lotSize ? (
                      <label className="se-field se-market-inspector__quantity">
                        <span>Quantity to buy · increments of {formatNumber(selectedRow.lotSize)}</span>
                        <input className="se-input" type="number" inputMode="numeric" min={selectedRow.lotSize} max={selectedRow.quantity} step={selectedRow.lotSize}
                          aria-label={`How many ${selectedRow.name.toLowerCase()} to buy from ${selectedRow.sellerName}`}
                          placeholder={String(selectedRow.quantity)} value={buyQuantities[selectedRow.id] ?? ''}
                          onChange={(event) => onBuyQuantity(selectedRow.id, event.target.value)} />
                      </label>
                    ) : null}
                    {!selectedRow.mine && selectedUnits !== null ? <p className="se-market-inspector__total">You pay <strong>{formatCentsExact(selectedCash)}</strong>{selectedFee > 0 ? ' including Board fee' : ''}</p> : null}
                    {selectedRow.mine ? <p className="se-hint">This is your listing. Manage it under My listings.</p> : (
                      <Button variant="primary" disabledReason={buyBlocker(selectedRow, book, busy, selectedUnits)} onClick={() => onBuy(selectedRow, selectedUnits!)}>
                        {selectedRow.priceKind === 'BARTER' ? 'Complete trade' : 'Buy listing'}
                      </Button>
                    )}
                  </div>
                </> : <p className="se-board-empty">Select a listing to inspect the offer.</p>}
              </aside>
            </div>

            {traderStores.length > 0 || pipProducts.length > 0 ? <section className="se-board-section se-market-traders" aria-labelledby="board-traders">
              <div className="se-stores-sectionhead">
                <div><span className="se-eyebrow">Trader shelves</span><h2 id="board-traders">Buy from traders</h2></div>
                <p>Fixed-price stock from the city&rsquo;s shops.</p>
              </div>
              <div className="se-tablewrap"><table className="se-table se-table--cards"><thead><tr><th>Trader</th><th>Item</th><th>Price</th><th>Stock</th><th /></tr></thead><tbody>
                {traderStores.flatMap((store) => store.items.filter((item) => item.maxBuy > 0).map((item) => {
                  const key = `${store.key}:${item.key}`;
                  const max = Math.min(item.maxBuy, item.buyCents > 0 ? Math.floor(book.cashCents / item.buyCents) : item.maxBuy);
                  const quantity = Number(traderQuantities[key] ?? '1');
                  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= max;
                  return <tr key={key}>
                    <td data-label="Trader">{store.name}</td><td data-label="Item">{store.key === 'PIP' && item.key === 'CRACK' ? 'Crack' : item.name}</td><td data-label="Price" className="se-num">{formatCentsExact(item.buyCents)}</td>
                    <td data-label="Stock" className="se-num">{formatNumber(item.maxBuy)}</td><td data-label="" className="se-market-buy-controls">
                      <input className="se-input se-board-buy__qty" type="number" inputMode="numeric" min={1} max={max} step={1} aria-label={`Quantity of ${item.name} to buy`} value={traderQuantities[key] ?? '1'} onChange={(event) => onTraderQuantity?.(key, event.target.value)} />
                      <Button size="sm" variant="primary" disabledReason={busy || !onTraderBuy ? 'Unavailable' : !valid ? max < 1 ? 'Not enough cash for one' : `Enter 1 to ${formatNumber(max)}` : null} onClick={() => onTraderBuy?.(store, item, quantity)}>Buy {formatNumber(valid ? quantity : 1)}</Button>
                    </td>
                  </tr>;
                }) )}
                {pipProducts.filter((product) => product.pip?.purchaseUnlocked && product.pip.maxBuy > 0).map((product) => {
                  const pip = product.pip!;
                  const key = `PIP:${product.key}`;
                  const max = Math.min(pip.maxBuy, pip.buyCents > 0 ? Math.floor(book.cashCents / pip.buyCents) : pip.maxBuy);
                  const quantity = Number(traderQuantities[key] ?? '1');
                  const valid = Number.isInteger(quantity) && quantity >= 1 && quantity <= max;
                  return <tr key={key}>
                    <td data-label="Trader">Pip&rsquo;s Deals on Wheels</td><td data-label="Item">{product.name}</td><td data-label="Price" className="se-num">{formatCentsExact(pip.buyCents)}</td>
                    <td data-label="Stock" className="se-num">{formatNumber(pip.maxBuy)}</td><td data-label="" className="se-market-buy-controls">
                      <input className="se-input se-board-buy__qty" type="number" inputMode="numeric" min={1} max={max} step={1} aria-label={`Quantity of ${product.name} to buy`} value={traderQuantities[key] ?? '1'} onChange={(event) => onTraderQuantity?.(key, event.target.value)} />
                      <Button size="sm" variant="primary" disabledReason={busy || !onPipBuy ? 'Unavailable' : !valid ? max < 1 ? 'Not enough cash for one' : `Enter 1 to ${formatNumber(max)}` : null} onClick={() => onPipBuy?.(product, quantity)}>Buy {formatNumber(valid ? quantity : 1)}</Button>
                    </td>
                  </tr>;
                })}
              </tbody></table></div>
            </section> : null}
          </> : null}

          {section === 'listings' ?
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
                  <thead><tr><th>Item</th><th className="se-table__number">Qty</th><th>Price</th><th>Status</th><th><span className="se-sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {book.mine.map((offer) => (
                      <tr key={offer.id}>
                        <td data-label="Item">{offer.name}</td>
                        <td className="se-table__number se-num" data-label="Qty">
                          {offer.remainingQuantity < offer.quantity ? `${formatNumber(offer.remainingQuantity)} of ${formatNumber(offer.quantity)} left` : formatNumber(offer.quantity)}
                        </td>
                        <td className="se-board-trade" data-label="Price">
                          <span>{offer.priceKind === 'BARTER' ? <><span className="se-board-trade__tag">Trade</span> {askSummary(offer.ask)} {lotLabel(offer.lotSize)}</> : <><span className="se-num">{formatCentsExact(offer.unitPriceCents)}</span> each</>}</span>
                        </td>
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
          : null}

          {section === 'sell' ?
          <section className="se-board-section" aria-labelledby="board-post">
            <div className="se-stores-sectionhead">
              <div><span className="se-eyebrow">Sell</span><h2 id="board-post">List goods</h2></div>
              <p>The stack leaves your stash while it is up.</p>
            </div>
            <ListPanel book={book} busy={busy} form={form} onForm={onForm} onPost={onPost} />
          </section>
          : null}
        </div>
      </section>
    </>
  );
}

/** The city-wide player market. Rounds without the Board keep the legacy unavailable state. */
export function PlayerBoard() {
  const me = useSession((s) => s.me);
  const [book, setBook] = useState<PlayerBoardDto | null>(null);
  const [stores, setStores] = useState<StoreDto[]>([]);
  const [pipProducts, setPipProducts] = useState<ProductStockDto[]>([]);
  const [traderQuantities, setTraderQuantities] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<PlayerBoardFilterDto>('ALL');
  const [closed, setClosed] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unlockQuest, setUnlockQuest] = useState<{ key: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [buyQuantities, setBuyQuantities] = useState<Record<string, string>>({});
  const [form, setForm] = useState<ListForm>({ key: '', quantity: '1', mode: 'CASH', price: '', ask: [], lot: '1', hours: 12 });
  const [now, setNow] = useState(() => Date.now());
  const requestId = useRef(0);

  const load = useCallback(async (which: PlayerBoardFilterDto) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await storesApi.board(which);
      if (currentRequest !== requestId.current) return;
      setBook(data);
      setClosed(false);
      setLocked(false);
      setUnlockQuest(null);
      setError(null);
      setForm((current) => {
        if (data.listable.some((row) => row.key === current.key)) return current;
        const first = data.listable[0];
        return { ...current, key: first?.key ?? '', price: first ? (first.floorCents / 100).toFixed(2) : '', hours: data.rules.listingHours[0] ?? 12 };
      });
    } catch (caught) {
      if (currentRequest !== requestId.current) return;
      if (caught instanceof ApiError && caught.code === 'BOARD_CLOSED') {
        setBook(null);
        setClosed(true);
        setLocked(false);
        setUnlockQuest(null);
      } else if (caught instanceof ApiError && caught.code === 'BOARD_LOCKED') {
        setBook(null);
        setClosed(false);
        setLocked(true);
        setError(null);
        void questsApi.page().then((questPage) => {
          const actTwoTraderQuest = (candidate: typeof questPage.quests[number]) => candidate.status !== 'COMPLETED'
            && (candidate.contactKey === 'VIC' || candidate.contactKey === 'LEDGER')
            && candidate.story?.chapter.startsWith('Act II');
          const quest = BOARD_UNLOCK_QUEST_KEYS.map((key) => questPage.quests.find((candidate) => candidate.key === key && actTwoTraderQuest(candidate)))
            .find((candidate) => candidate !== undefined)
            ?? questPage.quests.find(actTwoTraderQuest);
          setUnlockQuest(quest ? { key: quest.key, title: quest.title } : null);
        }).catch(() => setUnlockQuest(null));
      } else {
        setLocked(false);
        setError(caught instanceof ApiError ? caught.message : 'Could not load the Board.');
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);
  useEffect(() => {
    let active = true;
    storesApi.catalog().then((data) => { if (active) setStores(data.stores); }).catch(() => undefined);
    api.get<ProductsDto>('/game/products').then((data) => { if (active) setPipProducts(data.products); }).catch(() => undefined);
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
    const barter = form.mode === 'BARTER';
    const price = parseDollarsToCents(form.price);
    if (!barter && price === null) return;
    void change(async () => {
      const result = await storesApi.boardPost(barter
        ? { itemKey: form.key, quantity: Number(form.quantity), priceKind: 'BARTER', lotSize: Number(form.lot || '1'), askItems: form.ask.map((line) => ({ key: line.key, quantity: Number(line.quantity) })), durationHours: form.hours }
        : { itemKey: form.key, quantity: Number(form.quantity), priceKind: 'CASH', unitPriceCents: price!, durationHours: form.hours });
       const terms = barter ? `for the full basket: ${askSummary(result.offer.ask)}` : `at ${formatCentsExact(result.offer.unitPriceCents)} each`;
      return `Posted ${formatNumber(result.offer.quantity)} × ${result.offer.name} ${terms}. Fee ${formatCentsExact(result.feeCents)}${result.listingTaxCents > 0 ? `, tax ${formatCentsExact(result.listingTaxCents)}` : ''}.`;
    });
  }

  async function buy(row: PlayerBoardRowDto, units: number) {
    const barter = row.priceKind === 'BARTER';
    const boardFee = boardRowTopUpCents(row, units, book!.rules);
    const cost = (barter ? 0 : row.unitPriceCents * units) + boardFee;
    const topUp = barter ? boardFee : 0;
    const ok = await confirmAction(barter ? {
      title: `Trade for ${formatNumber(units)} × ${row.name}?`,
       body: `You hand ${row.sellerName} ${askSummary(row.ask)}${topUp > 0 ? `, and the Board takes ${formatCentsExact(topUp)} to even out the trade` : ''}.`,
      confirmLabel: 'Trade',
    } : {
      title: `Buy ${formatNumber(units)} × ${row.name}?`,
      body: `You pay ${formatCentsExact(cost)}${boardFee > 0 ? `, ${formatCentsExact(boardFee)} of it to the Board because the price is under the fair range` : ` to ${row.sellerName}`}${units < row.quantity ? `; ${formatNumber(row.quantity - units)} stay on the Board` : ' for everything left'}.`,
      confirmLabel: `Pay ${formatCentsExact(cost)}`,
    });
    if (!ok) return;
    // One id per click: a retried request after a dropped connection cannot buy twice.
    const actionId = newActionId();
    void change(async () => {
      const result = await storesApi.boardBuy(row.id, actionId, units);
      setBuyQuantities((current) => { const next = { ...current }; delete next[row.id]; return next; });
      const paid = [...(result.gave.length ? [askSummary(result.gave)] : []), ...(result.paidCents > 0 || !result.gave.length ? [formatCentsExact(result.paidCents)] : [])].join(' and ');
      return `Got ${formatNumber(result.quantity)} × ${result.name} from ${result.sellerName} for ${paid}.`;
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
      <div className="se-stores se-stores--board se-market-page" aria-busy={loading}>
        <header className="se-market-hero">
          <div>
            <span className="se-eyebrow">City-wide exchange{me ? ` · ${me.city.name}` : ''}</span>
            <h1>The Street Market</h1>
            <p>Compare crew offers and find the right price for your next move.</p>
          </div>
          <div className="se-market-open"><span className="se-market-open__dot" />Market open <strong>{book ? formatNumber(book.openOffers) : '—'} live offers</strong></div>
        </header>

        {closed ? <Alert>The Street Market is closed for this round. <Link to="/game/stores">Visit the stores</Link>.</Alert> : null}
        {locked ? (
          <Alert tone="info" title="Market access pending" className="se-board-lock">
            <div className="se-board-lock__content">
              <span className="se-board-lock__mark" aria-hidden="true">◆</span>
              <div>
                <p>Complete the Act II favor in the Missing Line and the Board will open its listings, trades, and selling desk to you.</p>
                <Link className="se-btn se-btn--primary se-board-lock__action"
                  to={unlockQuest ? `/game/quests?focus=${encodeURIComponent(unlockQuest.key)}` : '/game/quests#contact-standing'}>
                  {unlockQuest ? `Open ${unlockQuest.title}` : 'Choose a trader favor'}
                </Link>
              </div>
            </div>
          </Alert>
        ) : null}
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <p className="se-salvage-receipt" role="status">{notice}</p> : null}
         {loading ? <div className="se-stores-loading se-board-loading" role="status" aria-live="polite">
           <span className="se-board-loading__mark" aria-hidden="true" />
           <span>Checking the Board...</span>
         </div> : null}
        {book && !closed ? (
          <PlayerBoardView book={book} now={now} busy={busy} form={form}
            onFilter={setFilter} onForm={setForm} onPost={post} onCancel={cancel}
            buyQuantities={buyQuantities} onBuyQuantity={(id, value) => setBuyQuantities((current) => ({ ...current, [id]: value }))}
            onBuy={(row, units) => void buy(row, units)} traderStores={stores} pipProducts={pipProducts}
            traderQuantities={traderQuantities} onTraderQuantity={(key, value) => setTraderQuantities((current) => ({ ...current, [key]: value }))}
            onTraderBuy={(store, item, quantity) => void change(async () => { await storesApi.checkout({ lines: [{ store: store.key, item: item.key, direction: 'buy', quantity }], actionId: newActionId() }); return `Bought ${formatNumber(quantity)} × ${store.key === 'PIP' && item.key === 'CRACK' ? 'Crack' : item.name} from ${store.name}.`; })}
            onPipBuy={(product, quantity) => void change(async () => {
              await api.post('/game/products/trade', { product: product.key, direction: 'buy', quantity, actionId: newActionId() });
              const catalog = await api.get<ProductsDto>('/game/products');
              setPipProducts(catalog.products);
              return `Bought ${formatNumber(quantity)} × ${product.name} from Pip’s Deals on Wheels.`;
            })} />
        ) : null}
      </div>
    </GameLayout>
  );
}
