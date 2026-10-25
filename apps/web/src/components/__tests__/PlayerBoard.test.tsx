import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { PlayerBoardDto } from '@streets/shared';
import { StoreTabs } from '../StoreTabs.js';
import { PlayerBoardView, askSummary, boardBarterListingTaxCents, boardBuyUnits, boardCashBuyerFeeCents, boardCashListingTaxCents, boardRowTopUpCents, lotLabel, boardBarterTopUpCents, boardPostingFeeCents, boardSellerProceedsCents, parseDollarsToCents, type ListForm } from '../PlayerBoard.js';

const stores = [
  { key: 'CORNER', slug: 'corner', name: 'Corner Store' },
  { key: 'TOMMY', slug: 'tommy', name: 'Tommy' },
  { key: 'CHARLIE', slug: 'charlie', name: 'Charlie' },
  { key: 'PIP', slug: 'pip', name: 'Pip' },
] as const;

const rules: PlayerBoardDto['rules'] = { maxOpenOffers: 6, listingHours: [12, 48], postingFeePercent: 1, postingFeeMinCents: 100, taxPercent: 8, maxAskItems: 3, cashWeightPercent: 75 };
const NOW = Date.parse('2030-01-01T12:00:00Z');
const later = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();
const askable: PlayerBoardDto['askable'] = [
  { key: 'CRACK', name: 'Crack', category: 'PRODUCT', bookCents: 300 },
  { key: 'SCRAP_METAL', name: 'Scrap metal', category: 'PART', bookCents: 400 },
  { key: 'RADIO', name: 'Radio', category: 'PART', bookCents: 2_500 },
  { key: 'MOTOR_ASSEMBLY', name: 'Motor assembly', category: 'PART', bookCents: 8_000 },
];
const empty: PlayerBoardDto = { filter: 'ALL', rows: [], mine: [], listable: [], openOffers: 0, cashCents: 10_000, holdings: {}, askable, rules };
const noop = () => undefined;
const form: ListForm = { key: 'SCRAP_METAL', quantity: '10', mode: 'CASH', price: '5.50', ask: [], lot: '1', hours: 12 };
const render = (book: PlayerBoardDto, busy = false, current = form, buyQuantities: Record<string, string> = {}) => renderToStaticMarkup(
  <MemoryRouter><PlayerBoardView book={book} now={NOW} busy={busy} form={current} onFilter={noop} onForm={noop} onPost={noop} onCancel={noop}
    buyQuantities={buyQuantities} onBuyQuantity={noop} onBuy={noop} /></MemoryRouter>,
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
        { id: 'a', itemKey: 'SCRAP_METAL', name: 'Scrap metal', category: 'PART', rarity: 'COMMON', priceKind: 'CASH', ask: [], lotSize: 1, lotBookCents: 0, askBookCents: 0, quantity: 10, unitPriceCents: 534, totalCents: 5_340, sellerName: 'Ace', mine: false, expiresAt: later(3) },
        { id: 'b', itemKey: 'SCRAP_METAL', name: 'Scrap metal', category: 'PART', rarity: 'COMMON', priceKind: 'CASH', ask: [], lotSize: 1, lotBookCents: 0, askBookCents: 0, quantity: 4, unitPriceCents: 579, totalCents: 2_316, sellerName: 'Me', mine: true, expiresAt: later(47.5) },
        { id: 'c', itemKey: 'RADIO', name: 'Radio', category: 'PART', rarity: 'UNCOMMON', priceKind: 'CASH', ask: [], lotSize: 1, lotBookCents: 0, askBookCents: 0, quantity: 1, unitPriceCents: 3_334, totalCents: 3_334, sellerName: 'Bo', mine: false, expiresAt: later(1) },
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
    expect(html.match(/>Buy all</g)).toHaveLength(2);
    const poor = render({ ...empty, cashCents: 3_000, rows: [{ id: 'z', itemKey: 'RADIO', name: 'Radio', category: 'PART', rarity: 'UNCOMMON', priceKind: 'CASH', ask: [], lotSize: 1, lotBookCents: 0, askBookCents: 0, quantity: 1, unitPriceCents: 3_334, totalCents: 3_334, sellerName: 'Bo', mine: false, expiresAt: later(1) }] });
    expect(poor).toContain('You need $33.34 on hand.');
  });

  it('offers cancel only on open offers and says when a stack is waiting on room', () => {
    const offer = { itemKey: 'RADIO', name: 'Radio', quantity: 2, remainingQuantity: 2, priceKind: 'CASH' as const, ask: [], lotSize: 1, unitPriceCents: 3_400, feeCents: 100, listingTaxCents: 0, durationHours: 12, postedAt: later(-1) };
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
    expect(ok).toContain('Fair range $5.34 to $5.79: no extra charge.');
    expect(ok).toContain('Posting fee <strong>$1.00</strong>');
    expect(ok).toContain('A sale pays you <strong>$50.60</strong>');
    expect(ok).toContain('12 hours');
    expect(ok).toContain('48 hours');

    // Any price can be posted; above the fair range the seller pays a tax to post, below it buyers pay the Board.
    const above = render({ ...empty, listable }, false, { ...form, price: '7.00' });
    expect(above).toContain('Above it you pay $12.00 of tax to post.'); // ten at $7: $64.40 of proceeds against $53.33
    expect(above).toContain('plus <strong>$12.00</strong> of tax');
    expect(above).not.toContain('Set a price');
    const below = render({ ...empty, listable }, false, { ...form, price: '2.00' });
    expect(below).toContain('Below it, buyers pay the Board extra.');
    expect(render({ ...empty, listable }, false, { ...form, price: '0' })).toContain('Set a price of at least one cent each.');
    const full = render({ ...empty, listable, openOffers: 6 });
    expect(full).toContain('You already have 6 offers up.');
  });
});

describe('The Board with drugs', () => {
  it('offers a Drugs filter, marks drug rows, and groups the listing form', () => {
    const html = render({
      ...empty,
      filter: 'PRODUCTS',
      rows: [{ id: 'k', itemKey: 'CRACK', name: 'Crack', category: 'PRODUCT', rarity: null, priceKind: 'CASH', ask: [], lotSize: 1, lotBookCents: 0, askBookCents: 0, quantity: 100, unitPriceCents: 400, totalCents: 40_000, sellerName: 'Pip2', mine: false, expiresAt: later(5) }],
      listable: [
        { key: 'CRACK', name: 'Crack', category: 'PRODUCT', rarity: null, held: 50, bookCents: 300, floorCents: 400, capCents: 434 },
        { key: 'RADIO', name: 'Radio', category: 'PART', rarity: 'UNCOMMON', held: 2, bookCents: 2_500, floorCents: 3_334, capCents: 3_623 },
      ],
    }, false, { ...form, key: 'CRACK', quantity: '10', price: '4.00' });
    expect(html).toMatch(/se-seg__btn--on" aria-pressed="true">Drugs</);
    expect(html).toContain('se-board-rarity--product');
    expect(html).toContain('<optgroup label="Drugs">');
    expect(html).toContain('<optgroup label="Parts">');
    expect(html.indexOf('optgroup label="Drugs"')).toBeLessThan(html.indexOf('optgroup label="Parts"'));
    expect(html).toContain('Fair range $4.00 to $4.34');
    expect(html).toContain('A sale pays you <strong>$36.80</strong>');
  });
});

describe('The Board barters', () => {
  const listable = [{ key: 'MOTOR_ASSEMBLY', name: 'Motor assembly', category: 'PART' as const, rarity: 'RARE' as const, held: 4, bookCents: 8_000, floorCents: 10_667, capCents: 11_594 }];
  const trade = { id: 't', itemKey: 'MOTOR_ASSEMBLY', name: 'Motor assembly', category: 'PART' as const, rarity: 'RARE' as const, priceKind: 'BARTER' as const,
    ask: [{ key: 'RADIO', name: 'Radio', quantity: 2 }, { key: 'SCRAP_METAL', name: 'Scrap metal', quantity: 5 }], lotSize: 1, lotBookCents: 8_000, askBookCents: 7_000,
    quantity: 4, unitPriceCents: 0, totalCents: 5_400, sellerName: 'Swapper', mine: false, expiresAt: later(4) };

  it('prices a barter per unit, and buying some hands over that many times the ask', () => {
    const html = render({ ...empty, rows: [trade], holdings: { RADIO: 8, SCRAP_METAL: 20 } });
    expect(html).toContain('2 × Radio + 5 × Scrap metal each');
    expect(html).toContain('+ $54.00');
    expect(html).toContain('>Trade all<');
    expect(html).toContain('se-board-buy__qty');
    const two = render({ ...empty, rows: [trade], holdings: { RADIO: 4, SCRAP_METAL: 10 }, cashCents: 2_700 }, false, form, { t: '2' });
    expect(two).toContain('>Trade 2<');
    expect(two).not.toContain('to trade.');
    const short = render({ ...empty, rows: [trade], holdings: { RADIO: 3, SCRAP_METAL: 10 } }, false, form, { t: '2' });
    expect(short).toContain('You need 4 radio to trade.');
    const poor = render({ ...empty, rows: [trade], holdings: { RADIO: 4, SCRAP_METAL: 10 }, cashCents: 2_600 }, false, form, { t: '2' });
    expect(poor).toContain('You need $27.00 on hand.'); // two together: a $20 gap is $26.67, up to $27
  });

  it('takes a lotted barter in whole lots only', () => {
    const lotted = { ...trade, itemKey: 'CRACK', name: 'Crack', category: 'PRODUCT' as const, rarity: null, ask: [{ key: 'RADIO', name: 'Radio', quantity: 1 }], lotSize: 10, lotBookCents: 3_000, askBookCents: 2_500, quantity: 30, totalCents: 2_000 };
    const html = render({ ...empty, rows: [lotted], holdings: { RADIO: 3 } }, false, form, { t: '15' });
    expect(html).toContain('1 × Radio per 10');
    expect(html).toContain('step="10"');
    expect(html).toContain('Take lots of 10, up to 30.');
    expect(boardBuyUnits(lotted, '20')).toBe(20);
    expect(boardBuyUnits(lotted, '15')).toBeNull();
  });

  it('builds a barter with a per-unit ask, the value meter and the buyer top-up for the whole stack', () => {
    const barter: ListForm = { ...form, key: 'MOTOR_ASSEMBLY', quantity: '4', mode: 'BARTER', ask: [{ key: 'RADIO', quantity: '2' }, { key: 'SCRAP_METAL', quantity: '5' }] };
    const html = render({ ...empty, listable }, false, barter);
    expect(html).toContain('For every');
    expect(html).toContain('Asking $70.00 of $80.00 Board value each.');
    expect(html).toContain('Buying all of them, the buyer adds $54.00 to the Board to even it out.');
    expect(html).toContain('Selling all of it hands you <strong>8 × Radio + 20 × Scrap metal</strong>');
    expect(html).not.toContain('Price each');

    const greedy = render({ ...empty, listable }, false, { ...barter, ask: [{ key: 'RADIO', quantity: '4' }] });
    // 4 motors each asking $100 for $80: $80 of gain is $106.67 of tax, up to $107.
    expect(greedy).toContain('That is more than they are worth, so posting costs $107.00 of tax.');
    expect(greedy).toContain('plus <strong>$107.00</strong> of tax');
    const even = render({ ...empty, listable }, false, { ...barter, ask: [{ key: 'SCRAP_METAL', quantity: '20' }] });
    expect(even).toContain('An even swap.');
    const lots = render({ ...empty, listable }, false, { ...barter, quantity: '3', lot: '2', ask: [{ key: 'RADIO', quantity: '6' }] });
    expect(lots).toContain('List a whole number of lots of 2.');
  });

  it('prices the top-up the way the server does', () => {
    expect(boardBarterTopUpCents(8_000, 7_000, rules)).toBe(1_400); // $10 gap / 75% = $13.34, up to $14
    expect(boardBarterTopUpCents(32_000, 28_000, rules)).toBe(5_400); // four together, not 4 × $14
    expect(boardBarterTopUpCents(8_000, 8_000, rules)).toBe(0);
    expect(boardBarterTopUpCents(8_000, 8_001, rules)).toBe(0);
    expect(boardRowTopUpCents(trade, 2, rules)).toBe(2_700);
    expect(lotLabel(1)).toBe('each');
    expect(lotLabel(10)).toBe('per 10');
    expect(askSummary([{ name: 'Radio', quantity: 3 }, { name: 'Crack', quantity: 1_000 }])).toBe('3 × Radio + 1,000 × Crack');
  });
});

describe('The Board partial buys', () => {
  const row = { id: 'p', itemKey: 'CRACK', name: 'Crack', category: 'PRODUCT' as const, rarity: null, priceKind: 'CASH' as const, ask: [], lotSize: 1, lotBookCents: 0, askBookCents: 0, quantity: 12, unitPriceCents: 400, totalCents: 4_800, sellerName: 'Rocky', mine: false, expiresAt: later(6) };

  it('lets a buyer take part of a cash offer and prices just that part', () => {
    const all = render({ ...empty, rows: [row] });
    expect(all).toContain('placeholder="12"');
    expect(all).toContain('>Buy all<');
    const three = render({ ...empty, rows: [row], cashCents: 1_300 }, false, form, { p: '3' });
    expect(three).toContain('>Buy 3<');
    expect(three).not.toContain('on hand.');
    const poor = render({ ...empty, rows: [row], cashCents: 1_100 }, false, form, { p: '3' });
    expect(poor).toContain('You need $12.00 on hand.');
    const tooMany = render({ ...empty, rows: [row] }, false, form, { p: '13' });
    expect(tooMany).toContain('Buy from 1 to 12.');
  });

  it('shows a seller how much of their offer is left', () => {
    const mine = render({ ...empty, openOffers: 1, mine: [{ id: 'm', itemKey: 'CRACK', name: 'Crack', quantity: 12, remainingQuantity: 9, priceKind: 'CASH', ask: [], lotSize: 1, unitPriceCents: 400, feeCents: 100, listingTaxCents: 0, durationHours: 12, postedAt: later(-1), expiresAt: later(11), status: 'OPEN', returned: true }] });
    expect(mine).toContain('9 of 12 left');
  });

  it('reads the typed amount, defaulting to everything left', () => {
    expect(boardBuyUnits(row, undefined)).toBe(12);
    expect(boardBuyUnits(row, '')).toBe(12);
    expect(boardBuyUnits(row, '3')).toBe(3);
    expect(boardBuyUnits(row, '0')).toBeNull();
    expect(boardBuyUnits(row, '2.5')).toBeNull();
    expect(boardBuyUnits(row, '13')).toBeNull();
  });
});

describe('The Board off-range prices', () => {
  it('marks a cash offer under the fair range and prices its Board fee into the buy', () => {
    const cheap = { id: 'c', itemKey: 'SCRAP_METAL', name: 'Scrap metal', category: 'PART' as const, rarity: 'COMMON' as const, priceKind: 'CASH' as const, ask: [],
      lotSize: 1, lotBookCents: 400, askBookCents: 0, quantity: 10, unitPriceCents: 200, totalCents: 5_400, sellerName: 'Cheapo', mine: false, expiresAt: later(3) };
    const html = render({ ...empty, rows: [cheap], cashCents: 2_100 }, false, form, { c: '4' });
    expect(html).toContain('+ Board fee');
    // Four for $8 plus a $14 Board fee: $22.
    expect(html).toContain('You need $22.00 on hand.');
    expect(boardRowTopUpCents(cheap, 4, rules)).toBe(1_400);
    const fair = { ...cheap, unitPriceCents: 550, totalCents: 5_500 };
    expect(render({ ...empty, rows: [fair] })).not.toContain('+ Board fee');
  });

  it('matches the server on every extra', () => {
    expect(boardCashListingTaxCents(450, 300, 100, rules)).toBe(1_400);
    expect(boardCashListingTaxCents(434, 300, 100, rules)).toBe(0);
    expect(boardCashBuyerFeeCents(200, 300, 100, rules)).toBe(20_000);
    expect(boardCashBuyerFeeCents(400, 300, 100, rules)).toBe(0);
    expect(boardBarterListingTaxCents(8_000, 10_000, 1, rules)).toBe(2_700);
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
