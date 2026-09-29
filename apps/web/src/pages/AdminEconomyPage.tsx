import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminMarketsDto, AdminShipmentsDto, AdminSuspiciousDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const WINDOWS = [6, 24, 72, 168] as const;

/** 1.0.0-E. Markets, money worth a second look, and stock on its way. Read-only. */
export function AdminEconomyPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [hours, setHours] = useState<number>(24);
  const [markets, setMarkets] = useState<AdminMarketsDto | null>(null);
  const [suspicious, setSuspicious] = useState<AdminSuspiciousDto | null>(null);
  const [shipments, setShipments] = useState<AdminShipmentsDto | null>(null);
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    setError(null);
    Promise.all([adminApi.markets(roundId), adminApi.shipments(roundId)])
      .then(([market, shipping]) => {
        setMarkets(market);
        setShipments(shipping);
        setCity((current) => current || market.cities[0]?.city || '');
      })
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load the economy.'));
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    adminApi.suspicious(roundId, hours)
      .then(setSuspicious)
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load the ledger.'));
  }, [roundId, hours]);

  const shown = markets?.cities.find((row) => row.city === city) ?? markets?.cities[0];

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Economy</h1>
          <p className="se-eyebrow">Admin · markets, suspicious money and shipments</p>
        </div>
        <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
      </div>
      {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}

      <Panel title="Money worth a second look" aside={
        <select className="se-input se-input--sm" value={hours} aria-label="Window" onChange={(event) => setHours(Number(event.target.value))}>
          {WINDOWS.map((value) => <option key={value} value={value}>{value < 48 ? `${value} hours` : `${value / 24} days`}</option>)}
        </select>
      } flush className="se-mb">
        {!suspicious ? <p className="se-muted se-admin-pad">Reading the ledger...</p> : (
          <>
            <div className="se-stats se-admin-pad">
              <Stat label="Large lines" value={formatNumber(suspicious.largest.length)} />
              <Stat label="Surges" value={formatNumber(suspicious.surges.length)} tooltip="Players whose net cash in the window is at least half their net worth." />
              <Stat label="Admin grants" value={formatNumber(suspicious.grants.length)} />
              <Stat label="Open exploit flags" value={formatNumber(suspicious.openFlags)} />
            </div>
            {suspicious.openFlags > 0 ? <p className="se-admin-pad se-hint"><Link className="se-standalone-link" to="/game/admin/combat">Review exploit flags</Link></p> : null}
            {suspicious.surges.length ? (
              <div className="se-tablewrap">
                <table className="se-table se-table--cards">
                  <thead><tr><th>Surge</th><th className="se-table__number">Net cash</th><th className="se-table__number">Net worth</th><th className="se-table__number">Share</th></tr></thead>
                  <tbody>
                    {suspicious.surges.map((row) => (
                      <tr key={row.player.id}>
                        <td className="se-td--title"><Link to={`/game/admin/players/${row.player.id}`}>{row.player.displayName}</Link> <span className="se-muted">#{row.player.publicPimpId}</span></td>
                        <td className="se-table__number se-num" data-label="Net cash">{formatCents(row.netCents)}</td>
                        <td className="se-table__number se-num" data-label="Net worth">{formatCents(row.netWorthCents)}</td>
                        <td className="se-table__number se-num" data-label="Share">{row.sharePercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Largest lines</th><th>Source</th><th className="se-table__number">Amount</th><th>When</th></tr></thead>
                <tbody>
                  {suspicious.largest.length === 0 ? (
                    <tr><td colSpan={4} className="se-muted">No money moved in this window.</td></tr>
                  ) : suspicious.largest.map((row) => (
                    <tr key={row.id}>
                      <td className="se-td--title"><Link to={`/game/admin/players/${row.player.id}`}>{row.player.displayName}</Link> <span className="se-muted">{row.label}</span></td>
                      <td data-label="Source">{row.source}</td>
                      <td className={`se-table__number se-num${row.amountCents < 0 ? ' se-text-bad' : ''}`} data-label="Amount">{formatCents(row.amountCents)}</td>
                      <td data-label="When">{adminWhen(row.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {suspicious.grants.length ? (
              <ul className="se-admin-list se-admin-pad">
                {suspicious.grants.map((row) => <li key={row.id}>{row.actorUsername} granted compensation {adminWhen(row.at)}{row.reason ? `: ${row.reason}` : ''}</li>)}
              </ul>
            ) : null}
          </>
        )}
      </Panel>

      <Panel title="Markets" aside={markets ? `priced ${adminWhen(markets.generatedAt)}` : undefined} flush className="se-mb">
        {!markets ? <p className="se-muted se-admin-pad">Pricing the markets...</p> : markets.cities.length === 0 ? (
          <p className="se-muted se-admin-pad">This ruleset has no cities or high markets.</p>
        ) : (
          <>
            <div className="se-admin-pad se-admin-tabs">
              {markets.cities.map((row) => (
                <button key={row.city} type="button" className={`se-btn se-btn--sm ${row.city === shown?.city ? 'se-btn--primary' : 'se-btn--ghost'}`} onClick={() => setCity(row.city)}>{row.name}</button>
              ))}
            </div>
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Product</th><th>Supply</th><th className="se-table__number">Market buy</th><th className="se-table__number">Market sell</th><th className="se-table__number">Push</th><th className="se-table__number">Pip buy / sell</th></tr></thead>
                <tbody>
                  {shown?.products.map((row) => (
                    <tr key={row.product}>
                      <td className="se-td--title">{row.product}{row.event ? <span className="se-tag se-tag--warn"> {row.event}</span> : null}</td>
                      <td data-label="Supply">{row.supply?.toLowerCase() ?? '-'}</td>
                      <td className="se-table__number se-num" data-label="Market buy">{row.buyCents !== null ? formatCents(row.buyCents) : '-'}</td>
                      <td className="se-table__number se-num" data-label="Market sell">{row.sellCents !== null ? formatCents(row.sellCents) : '-'}</td>
                      <td className="se-table__number se-num" data-label="Push">{row.pushPercent > 0 ? '+' : ''}{row.pushPercent}%</td>
                      <td className="se-table__number se-num" data-label="Pip">{row.pip ? `${formatCents(row.pip.buyCents)} / ${formatCents(row.pip.sellCents)}` : 'not stocked'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      <Panel title="Shipments" aside="Special orders on their way" flush>
        {!shipments ? <p className="se-muted se-admin-pad">Loading shipments...</p> : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead><tr><th>Player</th><th>Order</th><th>Status</th><th>Due</th></tr></thead>
              <tbody>
                {shipments.pending.length + shipments.delivered.length === 0 ? (
                  <tr><td colSpan={4} className="se-muted">No special orders in the last day.</td></tr>
                ) : [
                  ...shipments.pending.map((row) => ({ ...row, status: 'on its way' })),
                  ...shipments.delivered.map((row) => ({ ...row, status: row.deliveredAt ? 'delivered' : 'due, not yet announced' })),
                ].map((row, index) => (
                  <tr key={`${row.player.id}-${row.item}-${index}`}>
                    <td className="se-td--title"><Link to={`/game/admin/players/${row.player.id}`}>{row.player.displayName}</Link></td>
                    <td data-label="Order">{row.store} · {row.item}</td>
                    <td data-label="Status">{row.status}</td>
                    <td data-label="Due">{adminWhen(row.dueAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </GameLayout>
  );
}
