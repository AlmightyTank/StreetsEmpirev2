import { useCallback, useEffect, useRef, useState } from 'react';
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
  type StoreItemDto,
  type StoresDto,
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
import { ItemLabel } from './ItemTile.js';
import { QuantityStepper } from './QuantityStepper.js';

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

const FILTERS: ReadonlyArray<readonly [PlayerBoardFilterDto, string]> = [['ALL', 'All items'], ['PRODUCTS', 'Drugs'], ['SUPPLIES', 'Supplies'], ['KEEPER', 'Guns & cars'], ['PARTS', 'Parts']];
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
  pipProducts?: ProductStockDto[];
  marketQuantities?: Readonly<Record<string, string>>;
  onMarketQuantity?: (key: string, value: string) => void;
  onMarketTrade?: (product: ProductStockDto, direction: 'buy' | 'sell', quantity: number, venue: 'market' | 'store') => void;
  storeCatalog?: StoresDto;
  onStoreTrade?: (storeKey: string, item: StoreItemDto, direction: 'buy' | 'sell', quantity: number) => void;
}

type TraderOffer = {
  key: string;
  product?: ProductStockDto;
  item?: StoreItemDto;
  storeKey?: string;
  category: 'PRODUCTS' | 'KEEPER' | 'PARTS' | 'SUPPLIES';
  venue: 'market' | 'store';
  seller: string;
  buyCents: number;
  sellCents: number;
  depth: number;
  locked: boolean;
  unlockLabel?: string | null;
  maxBuy?: number;
};

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
  async function confirmPost() {
    if (reason) return;
    const breakdown = barter
      ? `You offer ${askSummary(askLines.map((line) => ({ name: line.item!.name, quantity: line.units })))} for ${formatNumber(quantity)} × ${part!.name}. Posting fee: ${formatCentsExact(fee ?? 0)}${tax > 0 ? `; tax: ${formatCentsExact(tax)}` : ''}.`
      : `You list ${formatNumber(quantity)} × ${part!.name} at ${formatCentsExact(price!)} each. Gross sale: ${formatCentsExact(price! * quantity)}. Posting fee: ${formatCentsExact(fee ?? 0)}${tax > 0 ? `; tax: ${formatCentsExact(tax)}` : ''}.`;
    if (await confirmAction({ title: 'Post this market offer?', body: breakdown, confirmLabel: 'Post offer' })) onPost();
  }

  return (
    <form className="se-board-list" onSubmit={(event) => { event.preventDefault(); void confirmPost(); }}>
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
        <QuantityStepper value={Number(form.quantity) || 1} min={1} max={part.held} unitLabel={part.name.toLowerCase()}
          onChange={(value) => onForm({ ...form, quantity: String(value) })} />
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
              <QuantityStepper value={Number(line.quantity) || 1} min={1} unitLabel="trade items"
                onChange={(value) => setAsk(index, { quantity: String(value) })} />
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
export function PlayerBoardView({ book, now, busy, form, onFilter, onForm, onPost, onCancel, buyQuantities, onBuyQuantity, onBuy, pipProducts = [], marketQuantities = {}, onMarketQuantity, onMarketTrade, storeCatalog, onStoreTrade }: PlayerBoardViewProps) {
  const [section, setSection] = useState<'browse' | 'listings' | 'sell'>('browse');
  const visibleRows = book.rows;
  // High-market quotes are product listings, so they belong to All items and Drugs,
  // but should not remain visible when the player switches to keepers or parts.
  const productTraderRows: TraderOffer[] = (book.filter === 'ALL' || book.filter === 'PRODUCTS')
    ? pipProducts.flatMap((product) => [
      ...(product.market ? [{ key: `market:${product.key}`, product, category: 'PRODUCTS' as const, venue: 'market' as const, seller: 'High market', buyCents: product.market.buyCents, sellCents: product.market.sellCents, depth: product.market.depth, locked: false }] : []),
      ...(product.pip ? [{ key: `store:${product.key}`, product, category: 'PRODUCTS' as const, venue: 'store' as const, seller: "Pip's counter", buyCents: product.pip.buyCents, sellCents: product.pip.sellCents, depth: product.pip.stock, locked: !product.pip.purchaseUnlocked, unlockLabel: product.pip.unlockName, maxBuy: product.pip.maxBuy }] : []),
    ])
    : [];
  const listableCategories = new Map(book.listable.map((row) => [row.key, row.category]));
  const storeRows: TraderOffer[] = (storeCatalog?.stores ?? []).flatMap((store) => store.items.flatMap((item) => {
    const category = listableCategories.get(item.key) ?? (['PISTOL', 'SHOTGUN', 'TEK9', 'AK47', 'LOW_RIDER', 'SEDAN', 'VAN'].includes(item.key) ? 'KEEPER' : 'SUPPLY');
    const filter = category === 'PART' ? 'PARTS' : category === 'PRODUCT' ? 'PRODUCTS' : category === 'KEEPER' ? 'KEEPER' : 'SUPPLIES';
    if (book.filter !== 'ALL' && book.filter !== filter) return [];
    const units = item.unitsPerOrder ?? 1;
    return [{ key: `store-item:${store.key}:${item.key}`, item, storeKey: store.key, category: category === 'KEEPER' ? 'KEEPER' as const : category === 'PART' ? 'PARTS' as const : 'SUPPLIES' as const, venue: 'store' as const, seller: store.name, buyCents: item.buyCents, sellCents: item.sellCents ?? 0, depth: item.restock ? Math.floor(item.restock.stock / units) : item.maxBuy, locked: item.questLock?.unlocked === false || item.unlock?.unlocked === false, unlockLabel: item.questLock?.unlockName ?? item.unlock?.title, maxBuy: item.maxBuy }];
  }));
  const traderRows = [...productTraderRows, ...storeRows];
  async function confirmMarketTrade(itemName: string, direction: 'buy' | 'sell', quantity: number, unitPriceCents: number, trade: () => void) {
    const total = quantity * unitPriceCents;
    const ok = await confirmAction({
      title: `${direction === 'buy' ? 'Buy' : 'Sell'} ${formatNumber(quantity)} × ${itemName}?`,
      body: `${formatNumber(quantity)} × ${itemName} at ${formatCentsExact(unitPriceCents)} each. ${direction === 'buy' ? `Total: ${formatCentsExact(total)}.` : `You receive: ${formatCentsExact(total)}.`}`,
      confirmLabel: direction === 'buy' ? `Pay ${formatCentsExact(total)}` : `Sell for ${formatCentsExact(total)}`,
    });
    if (ok) trade();
  }

  async function confirmListingPurchase(row: PlayerBoardRowDto, units: number) {
    const fee = boardRowTopUpCents(row, units, book.rules);
    const goods = row.priceKind === 'BARTER'
      ? `Trade: ${askSummary(row.ask.map((line) => ({ name: line.name, quantity: line.quantity * (units / row.lotSize) })))}${fee > 0 ? ` plus ${formatCentsExact(fee)} Board top-up` : ''}.`
      : `${formatNumber(units)} × ${row.name} at ${formatCentsExact(row.unitPriceCents)} each. Total: ${formatCentsExact(row.unitPriceCents * units + fee)}${fee > 0 ? ` including ${formatCentsExact(fee)} Board fee` : ''}.`;
    if (await confirmAction({ title: `Buy ${formatNumber(units)} × ${row.name}?`, body: goods, confirmLabel: 'Confirm purchase' })) onBuy(row, units);
  }

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
                <div className="se-market-results__heading">
                   <div><span className="se-eyebrow">{formatNumber(visibleRows.length + traderRows.length)} listings</span><h2 id="market-listings-heading">On the street</h2></div>
                  <span>City-wide offers</span>
                </div>
                 {visibleRows.length === 0 && traderRows.length === 0 ? (
                   <p className="se-board-empty">Nothing is listed in this category yet.</p>
                ) : (
                  <div className="se-tablewrap se-market-tablewrap">
                    <table className="se-table se-board-book se-market-table">
                       <thead><tr><th>Item</th><th>Seller</th><th className="se-table__number">Available</th><th>Price / unit</th><th>Ends</th><th><span className="se-sr-only">Action</span></th></tr></thead>
                      <tbody>
                        {visibleRows.map((row) => (
                           <tr key={row.id} className={row.mine ? 'se-board-book__mine' : undefined}>
                             <td data-label="Item">
                               <ItemLabel itemKey={row.itemKey} zoomable={false}><span className={`se-board-rarity se-board-rarity--${row.category === 'PRODUCT' ? 'product' : row.category === 'KEEPER' ? 'keeper' : (row.rarity ?? 'common').toLowerCase()}`}>{row.name}</span></ItemLabel>
                            </td>
                            <td data-label="Seller"><span>{row.sellerName}{row.mine ? <span className="se-board-you"> (you)</span> : null}</span></td>
                            <td className="se-table__number se-num" data-label="Available">{formatNumber(row.quantity)}</td>
                            <td className="se-board-trade" data-label="Price / unit">
                              {row.priceKind === 'BARTER' ? <span className="se-board-trade__tag">Trade offer</span> : <><span className="se-num">{formatCentsExact(row.unitPriceCents)}</span><small className="se-market-row-note"> each</small></>}
                            </td>
                             <td data-label="Ends">{closesIn(row.expiresAt, now)}</td>
                             <td data-label="Action">
                               {!row.mine ? <>
                                 {row.priceKind === 'CASH' ? <input className="se-input se-board-buy__qty" type="number" min={row.lotSize} max={row.quantity} step={row.lotSize} aria-label={`Quantity of ${row.name} to buy`} value={buyQuantities[row.id] ?? ''} placeholder={String(row.quantity)} onChange={(event) => onBuyQuantity(row.id, event.target.value)} /> : null}
                                 <Button size="sm" variant="primary" disabledReason={buyBlocker(row, book, busy, boardBuyUnits(row, buyQuantities[row.id]))} onClick={() => { const units = boardBuyUnits(row, buyQuantities[row.id]); if (units !== null) void confirmListingPurchase(row, units); }}>{row.priceKind === 'BARTER' ? 'Trade' : 'Buy'}</Button>
                               </> : <span className="se-muted">Your listing</span>}
                             </td>
                         </tr>
                       ))}
                        {traderRows.map((offer) => {
                          const productName = offer.product?.name ?? offer.item!.name;
                          const itemKey = offer.product?.key ?? offer.item!.key;
                          const typed = marketQuantities[offer.key] ?? '1';
                          const quantity = Number(typed);
                          const buyMax = offer.buyCents > 0 ? Math.min(offer.depth, offer.maxBuy ?? Number.MAX_SAFE_INTEGER, Math.floor(book.cashCents / offer.buyCents)) : 0;
                          const sellMax = offer.product?.quantity ?? offer.item!.owned;
                          const validBuy = Number.isInteger(quantity) && quantity >= 1 && quantity <= buyMax;
                          const validSell = offer.sellCents > 0 && Number.isInteger(quantity) && quantity >= 1 && quantity <= sellMax;
                          const trade = (direction: 'buy' | 'sell') => offer.product
                            ? onMarketTrade?.(offer.product, direction, quantity, offer.venue)
                            : onStoreTrade?.(offer.storeKey!, offer.item!, direction, quantity);
                          return <tr key={offer.key} className={`se-market-trader-row${offer.locked ? ' se-market-trader-row--locked' : ''}`}>
                            <td data-label="Item"><ItemLabel itemKey={itemKey} zoomable={false}><span className={`se-board-rarity se-board-rarity--${offer.category === 'PRODUCTS' ? 'product' : offer.category === 'KEEPER' ? 'keeper' : 'common'}`}>{productName}</span></ItemLabel>{offer.locked ? <small className="se-market-lock" title={offer.unlockLabel ?? 'Complete the required quest or mission'}>🔒 {offer.unlockLabel ? `Unlock: ${offer.unlockLabel}` : 'Locked'}</small> : null}</td>
                            <td data-label="Seller">{offer.seller}</td>
                            <td className="se-table__number se-num" data-label="Available">{formatNumber(offer.depth)}</td>
                            <td data-label="Price / unit"><span className="se-num">Buy {formatCentsExact(offer.buyCents)}</span><br /><span className="se-num">Sell {formatCentsExact(offer.sellCents)}</span></td>
                            <td data-label="Action" className="se-market-buy-controls">
                              <div className="se-market-trader-quantity"><input className="se-input se-board-buy__qty" type="number" inputMode="numeric" min={1} max={Math.max(buyMax, sellMax)} step={1} aria-label={`Quantity of ${productName} to trade with ${offer.seller}`} value={typed} onChange={(event) => onMarketQuantity?.(offer.key, event.target.value)} /><QuantityStepper value={Number.isFinite(quantity) && quantity > 0 ? quantity : 1} min={1} max={Math.max(buyMax, sellMax, 1)} onChange={(value) => onMarketQuantity?.(offer.key, String(value))} showMax /></div>
                              <Button size="sm" variant="primary" disabledReason={busy || (offer.product ? !onMarketTrade : !onStoreTrade) ? 'Unavailable' : offer.locked ? `Locked${offer.unlockLabel ? ` · ${offer.unlockLabel}` : ''}` : !validBuy ? buyMax < 1 ? 'Not enough stock or cash for one' : `Buy 1 to ${formatNumber(buyMax)}` : null} onClick={() => void confirmMarketTrade(productName, 'buy', quantity, offer.buyCents, () => trade('buy'))}>Buy</Button>
                              <Button size="sm" disabledReason={busy || (offer.product ? !onMarketTrade : !onStoreTrade) ? 'Unavailable' : !validSell ? sellMax < 1 ? 'You have none to sell' : offer.sellCents <= 0 ? 'This trader does not buy it' : `Sell 1 to ${formatNumber(sellMax)}` : null} onClick={() => void confirmMarketTrade(productName, 'sell', quantity, offer.sellCents, () => trade('sell'))}>Sell</Button>
                            </td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

            </div>

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
  const [pipProducts, setPipProducts] = useState<ProductStockDto[]>([]);
  const [storeCatalog, setStoreCatalog] = useState<StoresDto | null>(null);
  const [marketQuantities, setMarketQuantities] = useState<Record<string, string>>({});
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
    api.get<ProductsDto>('/game/products').then((data) => { if (active) setPipProducts(data.products); }).catch(() => undefined);
    storesApi.catalog().then((data) => { if (active) setStoreCatalog(data); }).catch(() => undefined);
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
             onBuy={(row, units) => void buy(row, units)} pipProducts={pipProducts} storeCatalog={storeCatalog ?? undefined} marketQuantities={marketQuantities}
             onMarketQuantity={(key, value) => setMarketQuantities((current) => ({ ...current, [key]: value }))}
             onStoreTrade={(storeKey, item, direction, quantity) => void change(async () => {
               const result = await storesApi.trade({ store: storeKey, item: item.key, direction, quantity, actionId: newActionId() });
               const catalog = await storesApi.catalog();
               setStoreCatalog(catalog);
               return `${direction === 'buy' ? 'Bought' : 'Sold'} ${formatNumber(quantity)} × ${item.name} ${direction === 'buy' ? 'from' : 'to'} ${result.result.storeName} for ${formatCentsExact(Math.abs(result.result.totalCents ?? 0))}.`;
             })}
              onMarketTrade={(product, direction, quantity, venue) => void change(async () => {
                const payload = venue === 'market'
                  ? { product: product.key, direction, venue, quantity, quoteCents: direction === 'buy' ? product.market?.buyCents : product.market?.sellCents, actionId: newActionId() }
                  : { product: product.key, direction, quantity, actionId: newActionId() };
                const result = await api.post<{ result: ProductStockDto & { productName?: string; quantity?: number; totalCents?: number; direction?: string }; cashChangeCents?: number }>('/game/products/trade', payload);
                const catalog = await api.get<ProductsDto>('/game/products');
                setPipProducts(catalog.products);
                const trader = venue === 'market' ? 'on the high market' : "from Pip's counter";
                return `${direction === 'buy' ? 'Bought' : 'Sold'} ${formatNumber(quantity)} × ${product.name} ${trader} for ${formatCentsExact(Math.abs(result.result?.totalCents ?? result.cashChangeCents ?? 0))}.`;
              })} />
        ) : null}
      </div>
    </GameLayout>
  );
}
