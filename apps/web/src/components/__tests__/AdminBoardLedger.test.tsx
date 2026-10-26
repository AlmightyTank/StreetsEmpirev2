import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { AdminPlayerBoardDto } from '@streets/shared';
import { AdminBoardLedger } from '../AdminBoardLedger.js';

const ace = { id: 'p1', displayName: 'Ace', publicPimpId: 1, accountId: 'a1' };
const bo = { id: 'p2', displayName: 'Bo', publicPimpId: 2, accountId: 'a2' };

const report: AdminPlayerBoardDto = {
  roundId: 'r', enabled: true, generatedAt: '2026-10-25T12:00:00.000Z', windowHours: 24,
  totals: { posts: 2, fills: 1, cancels: 0, expiries: 1, openOffers: 1, unitsSold: 3, paidCents: 1_650, proceedsCents: 1_518, deletedCents: 334 },
  events: [
    { id: 'fill:f', kind: 'FILL', at: '2026-10-25T11:00:00.000Z', offerId: 'o1', seller: ace, buyer: bo, itemKey: 'SCRAP_METAL', item: 'Scrap metal', quantity: 3, priceKind: 'CASH', unitPriceCents: 550, ask: null, paidCents: 1_650, proceedsCents: 1_518, deletedCents: 132 },
    { id: 'post:o2', kind: 'POST', at: '2026-10-25T10:00:00.000Z', offerId: 'o2', seller: ace, buyer: null, itemKey: 'CRACK', item: 'Crack', quantity: 20, priceKind: 'BARTER', unitPriceCents: 0, ask: '1 Radio per 10', paidCents: 0, proceedsCents: 0, deletedCents: 100 },
  ],
  problems: [],
};

const render = (dto: AdminPlayerBoardDto) => renderToStaticMarkup(<MemoryRouter><AdminBoardLedger board={dto} /></MemoryRouter>);

describe('The Board H: staff ledger', () => {
  it('shows the totals and every event with who, what and the cash', () => {
    const html = render(report);
    expect(html).toContain('The Board');
    expect(html).toContain('1 open offers');
    expect(html).toContain('Bought · Scrap metal');
    expect(html).toContain('Posted · Crack');
    expect(html).toContain('Trade: 1 Radio per 10');
    expect(html).toContain('/game/admin/players/p2');
    expect(html).not.toContain('Escrow does not match');
  });

  it('calls out escrow that does not match the open offers', () => {
    const html = render({ ...report, problems: [{ player: ace, itemKey: 'RADIO', escrow: 3, offers: 2 }] });
    expect(html).toContain('Escrow does not match open offers for Ace (RADIO: 3 held, 2 on offers)');
  });

  it('says so when nothing happened', () => {
    expect(render({ ...report, events: [] })).toContain('Nothing on the Board in this window.');
  });
});
