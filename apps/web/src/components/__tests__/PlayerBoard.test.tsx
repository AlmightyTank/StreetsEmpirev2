import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { PlayerBoardDto } from '@streets/shared';
import { StoreTabs } from '../StoreTabs.js';
import { PlayerBoardView, boardPostingFeeCents, boardSellerProceedsCents, parseDollarsToCents } from '../PlayerBoard.js';

const stores = [
  { key: 'CORNER', slug: 'corner', name: 'Corner Store' },
  { key: 'TOMMY', slug: 'tommy', name: 'Tommy' },
  { key: 'CHARLIE', slug: 'charlie', name: 'Charlie' },
  { key: 'PIP', slug: 'pip', name: 'Pip' },
] as const;

const rules: PlayerBoardDto['rules'] = { maxOpenOffers: 6, listingHours: [12, 48], postingFeePercent: 1, postingFeeMinCents: 100, taxPercent: 8 };
const NOW = Date.parse('2030-01-01T12:00:00Z');
const later = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();
const empty: PlayerBoardDto = { filter: 'ALL', rows: [], mine: [], listable: [], openOffers: 0, cashCents: 10_000, rules };
const noop = () => undefined;
const form = { key: 'SCRAP_METAL', quantity: '10', price: '5.50', hours: 12 };
const render = (book: PlayerBoardDto, busy = false, current = form) => renderToStaticMarkup(
  <MemoryRouter><PlayerBoardView book={book} now={NOW} busy={busy} form={current} onFilter={noop} onForm={noop} onPost={noop} onCancel={noop} onBuy={noop} /></MemoryRouter>,
);

describe('Stores tab strip', () => {
  it('keeps the four shops and the Salvage Yard, and no Board, while the flag is off', () => {
    const html = renderToStaticMarkup(<MemoryRouter><StoreTabs stores={stores} slug="corner" /></MemoryRouter>);
    for (const name of ['Corner', 'Tommy’s', 'Charlie’s', 'Pip’s', 'Salvage Yard']) expect(html).toContain(`>${name}</a>`);
    expect(html).not.toContain('The Board');
    expect(html).not.toContain('/game/stores/board');
  });

  it('adds the Board last when the round has it, and marks it active on its own page', () => {
    const html = renderToStaticMarkup(<MemoryRouter><StoreTabs stores={stores} slug="board" board /></MemoryRouter>);
    for (const name of ['Corner', 'Tommy’s', 'Charlie’s', 'Pip’s', 'Salvage Yard']) expect(html).toContain(`>${name}</a>`);
    expect(html.lastIndexOf('/game/stores/board')).toBeGreaterThan(html.indexOf('/game/stores/salvage'));
    expect(html).toMatch(/se-storetabs__tab--active" href="\/game\/stores\/board"/);
  });
});

describe('The Board view', () => {
  it('shows an empty book as an empty book', () => {
    const html = render(empty);
    expect(html).toContain('Nothing is up right now.');
    expect(html).toContain('You have not listed anything.');
    expect(html).toContain('You have nothing to list.');
    expect(html).not.toContain('<tbody>');
  });

  it('lists offers in the order the server ranks them, marks your own, and shows totals', () => {
    const html = render({
      ...empty,
      rows: [
        { id: 'a', itemKey: 'SCRAP_METAL', name: 'Scrap metal', category: 'PART', rarity: 'COMMON', quantity: 10, unitPriceCents: 534, totalCents: 5_340, sellerName: 'Ace', mine: false, expiresAt: later(3) },
        { id: 'b', itemKey: 'SCRAP_METAL', name: 'Scrap metal', category: 'PART', rarity: 'COMMON', quantity: 4, unitPriceCents: 579, totalCents: 2_316, sellerName: 'Me', mine: true, expiresAt: later(47.5) },
        { id: 'c', itemKey: 'RADIO', name: 'Radio', category: 'PART', rarity: 'UNCOMMON', quantity: 1, unitPriceCents: 3_334, totalCents: 3_334, sellerName: 'Bo', mine: false, expiresAt: later(1) },
      ],
    });
    const seller = (name: string) => html.indexOf(`data-label="Seller"><span>${name}`);
    expect(seller('Ace')).toBeGreaterThan(-1);
    expect(seller('Ace')).toBeLessThan(seller('Me'));
    expect(seller('Me')).toBeLessThan(seller('Bo'));
    expect(html).toContain('$5.34');
    expect(html).toContain('$53.40');
    expect(html).toContain('(you)');
    expect(html).toContain('se-board-rarity--uncommon');
    expect(html).toContain('3h 00m');
    // Buy on others' offers only, and a stack you cannot afford says so.
    expect(html.match(/>Buy</g)).toHaveLength(2);
    const poor = render({ ...empty, cashCents: 3_000, rows: [{ id: 'z', itemKey: 'RADIO', name: 'Radio', category: 'PART', rarity: 'UNCOMMON', quantity: 1, unitPriceCents: 3_334, totalCents: 3_334, sellerName: 'Bo', mine: false, expiresAt: later(1) }] });
    expect(poor).toContain('You need $33.34 on hand.');
  });

  it('offers cancel only on open offers and says when a stack is waiting on room', () => {
    const offer = { itemKey: 'RADIO', name: 'Radio', quantity: 2, unitPriceCents: 3_400, feeCents: 100, durationHours: 12, postedAt: later(-1) };
    const html = render({
      ...empty,
      openOffers: 1,
      mine: [
        { ...offer, id: 'o1', expiresAt: later(11), status: 'OPEN', returned: true },
        { ...offer, id: 'o2', expiresAt: later(-2), status: 'EXPIRED', returned: false },
        { ...offer, id: 'o3', expiresAt: later(-2), status: 'CANCELLED', returned: true },
      ],
    });
    expect(html.match(/>Cancel</g)).toHaveLength(1);
    expect(html).toContain('Up · 11h 00m');
    expect(html).toContain('Expired · waiting on stash room');
    expect(html).toContain('1 of 6 up');
  });

  it('prices the listing form with the fee and the seller share the server will use', () => {
    const listable = [{ key: 'SCRAP_METAL', name: 'Scrap metal', category: 'PART' as const, rarity: 'COMMON' as const, held: 30, bookCents: 400, floorCents: 534, capCents: 579 }];
    const ok = render({ ...empty, listable });
    expect(ok).toContain('From $5.34 to $5.79.');
    expect(ok).toContain('Posting fee <strong>$1.00</strong>');
    expect(ok).toContain('A sale pays you <strong>$50.60</strong>');
    expect(ok).toContain('12 hours');
    expect(ok).toContain('48 hours');

    const outside = render({ ...empty, listable }, false, { ...form, price: '5.80' });
    expect(outside).toContain('Price each from $5.34 to $5.79.');
    const full = render({ ...empty, listable, openOffers: 6 });
    expect(full).toContain('You already have 6 offers up.');
  });
});

describe('The Board with drugs', () => {
  it('offers a Drugs filter, marks drug rows, and groups the listing form', () => {
    const html = render({
      ...empty,
      filter: 'PRODUCTS',
      rows: [{ id: 'k', itemKey: 'CRACK', name: 'Crack', category: 'PRODUCT', rarity: null, quantity: 100, unitPriceCents: 400, totalCents: 40_000, sellerName: 'Pip2', mine: false, expiresAt: later(5) }],
      listable: [
        { key: 'CRACK', name: 'Crack', category: 'PRODUCT', rarity: null, held: 50, bookCents: 300, floorCents: 400, capCents: 434 },
        { key: 'RADIO', name: 'Radio', category: 'PART', rarity: 'UNCOMMON', held: 2, bookCents: 2_500, floorCents: 3_334, capCents: 3_623 },
      ],
    }, false, { key: 'CRACK', quantity: '10', price: '4.00', hours: 12 });
    expect(html).toMatch(/se-seg__btn--on" aria-pressed="true">Drugs</);
    expect(html).toContain('se-board-rarity--product');
    expect(html).toContain('<optgroup label="Drugs">');
    expect(html).toContain('<optgroup label="Parts">');
    expect(html.indexOf('optgroup label="Drugs"')).toBeLessThan(html.indexOf('optgroup label="Parts"'));
    expect(html).toContain('From $4.00 to $4.34.');
    expect(html).toContain('A sale pays you <strong>$36.80</strong>');
  });
});

describe('The Board money helpers', () => {
  it('match the server fee, tax and price parsing', () => {
    expect(boardPostingFeeCents(400, 10, rules)).toBe(100);
    expect(boardPostingFeeCents(400, 30, rules)).toBe(120);
    expect(boardPostingFeeCents(250_000, 1, rules)).toBe(2_500);
    expect(boardSellerProceedsCents(434, rules)).toBe(399);
    expect(parseDollarsToCents('5.5')).toBe(550);
    expect(parseDollarsToCents('$3,623.18')).toBeNull();
    expect(parseDollarsToCents('3623.18')).toBe(362_318);
    expect(parseDollarsToCents('5.555')).toBeNull();
    expect(parseDollarsToCents('')).toBeNull();
  });
});
