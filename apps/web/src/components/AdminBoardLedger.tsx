import { Link } from 'react-router-dom';
import type { AdminPlayerBoardDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminWhen } from '../utils/admin.js';
import { Alert } from './Alert.js';
import { Panel, Stat } from './Panel.js';

const BOARD_KIND: Record<AdminPlayerBoardDto['events'][number]['kind'], string> = { POST: 'Posted', FILL: 'Bought', CANCEL: 'Cancelled', EXPIRE: 'Expired' };

/** The Board H. The staff ledger: every post, fill, cancel and expiry in the window, and escrow mismatches. */
export function AdminBoardLedger({ board }: { board: AdminPlayerBoardDto }) {
  const { totals } = board;
  return (
    <Panel title="The Board" aside={`${formatNumber(totals.openOffers)} open offers`} flush className="se-mb">
      <div className="se-stats se-admin-pad">
        <Stat label="Posts" value={formatNumber(totals.posts)} />
        <Stat label="Fills" value={formatNumber(totals.fills)} tooltip={`${formatNumber(totals.unitsSold)} units sold`} />
        <Stat label="Cancels / expiries" value={`${formatNumber(totals.cancels)} / ${formatNumber(totals.expiries)}`} />
        <Stat label="Buyers paid" value={formatCents(totals.paidCents)} />
        <Stat label="Sellers got" value={formatCents(totals.proceedsCents)} />
        <Stat label="Deleted" value={formatCents(totals.deletedCents)} tooltip="Posting fees, listing tax, sale tax, Board fees and barter top-ups." />
      </div>
      {board.problems.length ? (
        <Alert>
          Escrow does not match open offers for {board.problems.map((row) => `${row.player.displayName} (${row.itemKey}: ${formatNumber(row.escrow)} held, ${formatNumber(row.offers)} on offers)`).join('; ')}.
        </Alert>
      ) : null}
      <div className="se-tablewrap">
        <table className="se-table se-table--cards">
          <thead><tr><th>Event</th><th>Seller</th><th>Buyer</th><th className="se-table__number">Units</th><th>Price</th><th className="se-table__number">Paid</th><th className="se-table__number">Deleted</th><th>When</th></tr></thead>
          <tbody>
            {board.events.length === 0 ? (
              <tr><td colSpan={8} className="se-muted">Nothing on the Board in this window.</td></tr>
            ) : board.events.map((row) => (
              <tr key={row.id}>
                <td className="se-td--title"><span>{BOARD_KIND[row.kind]} · {row.item}</span></td>
                <td data-label="Seller"><Link to={`/game/admin/players/${row.seller.id}`}>{row.seller.displayName}</Link></td>
                <td data-label="Buyer">{row.buyer ? <Link to={`/game/admin/players/${row.buyer.id}`}>{row.buyer.displayName}</Link> : '-'}</td>
                <td className="se-table__number se-num" data-label="Units">{formatNumber(row.quantity)}</td>
                <td data-label="Price">{row.priceKind === 'BARTER' ? `Trade: ${row.ask ?? '-'}` : `${formatCents(row.unitPriceCents)} each`}</td>
                <td className="se-table__number se-num" data-label="Paid">{row.kind === 'FILL' ? formatCents(row.paidCents) : '-'}</td>
                <td className="se-table__number se-num" data-label="Deleted">{row.deletedCents ? formatCents(row.deletedCents) : '-'}</td>
                <td data-label="When">{adminWhen(row.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
