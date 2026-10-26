import { useCallback, useEffect, useState, type FormEvent } from 'react';
import '../styles/drop.css';
import type {
  AdminCrownWalletDto,
  AdminDropDashboardDto,
  AdminDropEntryDto,
  AdminDropSettingsDto,
  CrownPackOrderDto,
  DropItemDetailDto,
} from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { adminDropApi } from '../api/drop.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { confirmAction } from '../stores/confirm.js';
import { adminWhen } from '../utils/admin.js';

const STATES = ['DRAFT', 'QA', 'SCHEDULED', 'LIVE', 'VAULTED', 'ARCHIVED'] as const;
const POLICIES = [['MAY_RETURN', 'May return'], ['PERMANENT', 'Permanent'], ['NEVER_RETURNING', 'Never returning']] as const;
const SLOTS = ['FEATURED', 'DAILY', 'CATALOG'] as const;
const BADGES = ['FEATURED', 'DAILY', 'RETURNING', 'PERMANENT', 'DROP_EXCLUSIVE'] as const;
const SWITCHES: { key: keyof Pick<AdminDropSettingsDto, 'storefront' | 'purchases' | 'earning' | 'checkout' | 'streetPassSkips'>; label: string; hint: string }[] = [
  { key: 'storefront', label: 'Storefront', hint: 'Players can browse The Drop.' },
  { key: 'purchases', label: 'Crown purchases', hint: 'Players can spend Crowns on items.' },
  { key: 'earning', label: 'Crown earning', hint: 'Contracts and milestones pay Crowns.' },
  { key: 'checkout', label: 'Crown pack checkout', hint: 'Real-money Crown packs through Stripe.' },
  { key: 'streetPassSkips', label: 'Street Pass skips', hint: 'Players can skip Street Pass tiers with Crowns.' },
];

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong.';
}

/** Admin → The Drop: kill switches, catalog workflow, offers, wallets and reconciliation. */
export function AdminDropPage() {
  const [data, setData] = useState<AdminDropDashboardDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DropItemDetailDto | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await adminDropApi.dashboard());
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const reasonReady = reason.trim().length >= 4;
  const needReason = reasonReady ? null : 'Write a reason at the top first.';

  async function run(label: string, task: () => Promise<unknown>) {
    setBusy(true);
    try {
      await task();
      setNotice(label);
      setError(null);
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return <GameLayout><Panel title="The Drop" loading={!error}>{error ? <Alert>{error}</Alert> : null}</Panel></GameLayout>;
  }

  return (
    <GameLayout>
      <div className="se-admin-drop">
        <header className="se-game-pagehead">
          <div className="se-game-pagehead__copy">
            <div className="se-eyebrow">Admin · Economy</div>
            <h1>The Drop</h1>
            <p>Crowns, the cosmetic catalog, offers and Crown packs. Every change needs a reason and goes to the audit log.</p>
          </div>
        </header>
        {!data.envEnabled ? <Alert tone="warning" title="Off by environment">DROP_ENABLED is off on this server: players see nothing, whatever the switches below say.</Alert> : null}
        {data.mismatches.length ? <Alert title="Ledger mismatch">{data.mismatches.length} wallet(s) do not match their ledger: {data.mismatches.map((row) => `${row.accountId} (${row.balance} vs ${row.ledger})`).join(', ')}</Alert> : null}
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        <label className="se-admin-drop__reason">
          <span>Reason for changes (required, audited)</span>
          <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Winter Heist launch QA on beta" maxLength={500} />
        </label>

        <div className="se-drop-stats">
          <Stat label="Wallets" value={formatNumber(data.totals.wallets)} sub={`${formatNumber(data.totals.heldWallets)} on hold`} />
          <Stat label="Crowns held" value={formatNumber(data.totals.balance)} />
          <Stat label="Earned" value={formatNumber(data.totals.earned)} />
          <Stat label="Paid grants" value={formatNumber(data.totals.paidGranted)} />
          <Stat label="Spent" value={formatNumber(data.totals.spent)} sub={`${formatNumber(data.orders.total)} orders · ${formatNumber(data.orders.last24h)} in 24h`} />
          <Stat label="Adjusted / reversed" value={`${formatNumber(data.totals.adjusted)} / ${formatNumber(data.totals.reversed)}`} />
        </div>

        <Panel title="Kill switches and tuning" subtitle={data.checkoutConfigured ? 'Crown packs are configured on this server.' : 'Crown packs are not configured (DROP_CROWN_PACKS_ENABLED and Stripe keys).'}>
          <div className="se-admin-drop__switches">
            {SWITCHES.map((entry) => (
              <div key={entry.key} className="se-admin-drop__switch">
                <span><strong>{entry.label}</strong><small>{entry.hint}</small></span>
                <span className={`se-tag${data.settings[entry.key] ? ' se-tag--good' : ' se-tag--bad'}`}>{data.settings[entry.key] ? 'On' : 'Off'}</span>
                <Button size="sm" variant={data.settings[entry.key] ? 'danger' : 'default'} disabledReason={needReason} loading={busy}
                  onClick={() => void run(`${entry.label} ${data.settings[entry.key] ? 'off' : 'on'}.`, () => adminDropApi.settings({ [entry.key]: !data.settings[entry.key], reason }))}>
                  Turn {data.settings[entry.key] ? 'off' : 'on'}
                </Button>
              </div>
            ))}
          </div>
          <TuningForm settings={data.settings} disabledReason={needReason} onSave={(patch) => run('Tuning saved.', () => adminDropApi.settings({ ...patch, reason }))} />
        </Panel>

        <Panel title="Catalog" subtitle="Draft → QA → Scheduled → Live → Vaulted/Archived. Archiving and Never returning are irreversible." flush>
          <div className="se-admin-drop__table-wrap">
            <table className="se-table">
              <thead><tr><th scope="col">Item</th><th scope="col">State</th><th scope="col">Price</th><th scope="col">Returns</th><th scope="col">Daily pool</th><th scope="col">Owners</th><th scope="col" /></tr></thead>
              <tbody>
                {data.entries.map((entry) => (
                  <EntryRow key={entry.key} entry={entry} disabledReason={needReason} busy={busy} onPreview={(key) => void adminDropApi.preview(key).then(setPreview).catch((caught) => setError(errorText(caught)))} onSave={async (patch) => {
                    const irreversible = (patch.state === 'ARCHIVED' && entry.state !== 'ARCHIVED') || (patch.returnPolicy === 'NEVER_RETURNING' && entry.returnPolicy !== 'NEVER_RETURNING');
                    if (irreversible && !(await confirmAction({ title: 'Make an irreversible change?', body: `${entry.name}: archiving or promising Never returning can't be undone.`, confirmLabel: 'Yes, make it permanent', tone: 'danger' }))) return;
                    await run(`${entry.name} saved.`, () => adminDropApi.entry(entry.key, { ...patch, confirmIrreversible: irreversible, reason }));
                  }} />
                ))}
            </tbody>
            </table>
          </div>
          {preview ? <PreviewPanel preview={preview} onClose={() => setPreview(null)} /> : null}
        </Panel>

        <OfferPanel data={data} disabledReason={needReason} busy={busy}
          onCreate={(input) => run('Offer scheduled.', () => adminDropApi.createOffer({ ...input, reason }))}
          onCancel={(id) => run('Offer cancelled.', () => adminDropApi.cancelOffer(id, reason))} />

        <WalletPanel reason={reason} disabledReason={needReason} onChanged={load} />

        <Panel title="Crown adjustments waiting for a second admin">
          {data.pendingAdjustments.length ? (
            <ul className="se-drop-receipts">
              {data.pendingAdjustments.map((row) => (
                <li key={row.id}>
                  <span><strong>{row.username ?? row.accountId}</strong> {row.delta > 0 ? '+' : ''}{formatNumber(row.delta)} · {row.reason} · asked by {row.requestedBy}</span>
                  <span className="se-admin-drop__actions">
                    <Button size="sm" variant="primary" disabledReason={needReason} loading={busy} onClick={() => void run('Adjustment approved.', () => adminDropApi.decide(row.id, true, reason))}>Approve</Button>
                    <Button size="sm" variant="ghost" disabledReason={needReason} loading={busy} onClick={() => void run('Adjustment rejected.', () => adminDropApi.decide(row.id, false, reason))}>Reject</Button>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="se-hint">Nothing waiting.</p>}
          {data.recentAdjustments.length ? (
            <details><summary>Recent decisions</summary>
              <ul className="se-drop-receipts">
                {data.recentAdjustments.map((row) => <li key={row.id}><span>{row.username ?? row.accountId} {row.delta > 0 ? '+' : ''}{formatNumber(row.delta)} · {row.status.toLowerCase()} by {row.decidedBy ?? '—'}</span><small>{adminWhen(row.createdAt)} · {row.reason}</small></li>)}
              </ul>
            </details>
          ) : null}
        </Panel>

        <Panel title="Crowns by source" flush>
          <table className="se-table">
            <thead><tr><th scope="col">Source</th><th scope="col">Entries</th><th scope="col">Net Crowns</th></tr></thead>
            <tbody>{data.bySource.map((row) => <tr key={row.source}><td>{row.source}</td><td>{formatNumber(row.entries)}</td><td>{formatNumber(row.crowns)}</td></tr>)}</tbody>
          </table>
        </Panel>

        <PackOrdersPanel summary={data.packOrders} disabledReason={needReason} reason={reason} onChanged={load} />
      </div>
    </GameLayout>
  );
}

function TuningForm({ settings, disabledReason, onSave }: { settings: AdminDropSettingsDto; disabledReason: string | null; onSave: (patch: Partial<AdminDropSettingsDto>) => Promise<void> }) {
  const [values, setValues] = useState({
    dailyOfferCount: settings.dailyOfferCount,
    dailyResetHourUtc: settings.dailyResetHourUtc,
    roundEarnCap: settings.roundEarnCap,
    largeAdjustmentThreshold: settings.largeAdjustmentThreshold,
    autoFeatured: settings.autoFeatured,
  });
  const field = (key: 'dailyOfferCount' | 'dailyResetHourUtc' | 'roundEarnCap' | 'largeAdjustmentThreshold', label: string) => (
    <label className="se-admin-drop__field"><span>{label}</span>
      <input type="number" value={values[key]} onChange={(event) => setValues({ ...values, [key]: Number(event.target.value) })} />
    </label>
  );
  return (
    <form className="se-admin-drop__tuning" onSubmit={(event: FormEvent) => { event.preventDefault(); void onSave(values); }}>
      {field('dailyOfferCount', 'Daily offers')}
      {field('dailyResetHourUtc', 'Daily reset hour (UTC)')}
      {field('roundEarnCap', 'Crowns earnable per round')}
      {field('largeAdjustmentThreshold', 'Second-admin threshold')}
      <label className="se-admin-drop__check"><input type="checkbox" checked={values.autoFeatured} onChange={(event) => setValues({ ...values, autoFeatured: event.target.checked })} /> Rotate the featured collection weekly</label>
      <Button type="submit" disabledReason={disabledReason}>Save tuning</Button>
    </form>
  );
}

function EntryRow({ entry, disabledReason, busy, onPreview, onSave }: {
  entry: AdminDropEntryDto;
  disabledReason: string | null;
  busy: boolean;
  onPreview: (key: string) => void;
  onSave: (patch: { state: string; priceCrowns: number | null; returnPolicy: string; inDailyPool: boolean }) => Promise<void>;
}) {
  const [state, setState] = useState(entry.state);
  const [price, setPrice] = useState(entry.priceCrowns === entry.defaultPriceCrowns ? '' : String(entry.priceCrowns));
  const [policy, setPolicy] = useState(entry.returnPolicy);
  const [pool, setPool] = useState(entry.inDailyPool);
  const dirty = state !== entry.state || policy !== entry.returnPolicy || pool !== entry.inDailyPool
    || (price === '' ? entry.priceCrowns !== entry.defaultPriceCrowns : Number(price) !== entry.priceCrowns);
  return (
    <tr>
      <th scope="row"><strong>{entry.name}</strong><small className="se-admin-drop__key">{entry.key} · {entry.category.toLowerCase()}</small></th>
      <td><select aria-label={`${entry.name} state`} value={state} onChange={(event) => setState(event.target.value as typeof state)}>{STATES.map((value) => <option key={value} value={value}>{value}</option>)}</select></td>
      <td><input aria-label={`${entry.name} price`} type="number" min={1} placeholder={String(entry.defaultPriceCrowns)} value={price} onChange={(event) => setPrice(event.target.value)} /></td>
      <td><select aria-label={`${entry.name} return policy`} value={policy} disabled={entry.returnPolicy === 'NEVER_RETURNING'} onChange={(event) => setPolicy(event.target.value as typeof policy)}>{POLICIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>
      <td>{entry.kind === 'ITEM' ? <input aria-label={`${entry.name} in daily pool`} type="checkbox" checked={pool} onChange={(event) => setPool(event.target.checked)} /> : '—'}</td>
      <td>{formatNumber(entry.owners)}</td>
       <td className="se-admin-drop__actions"><Button size="sm" variant="ghost" onClick={() => onPreview(entry.key)}>Preview</Button><Button size="sm" loading={busy} disabledReason={!dirty ? 'No changes.' : disabledReason} onClick={() => void onSave({ state, priceCrowns: price === '' ? null : Number(price), returnPolicy: policy, inDailyPool: pool })}>Save</Button></td>
    </tr>
  );
}

function PreviewPanel({ preview, onClose }: { preview: DropItemDetailDto; onClose: () => void }) {
  const item = preview.item;
  const bundle = preview.bundle;
  return <div className="se-drop-preview" role="status">
    <div className="se-admin-drop__actions"><strong>Unpublished preview</strong><Button size="sm" variant="ghost" onClick={onClose}>Close</Button></div>
    <p>{item?.name ?? bundle?.name} · {item?.description ?? bundle?.description}</p>
    <small>{item?.kind ?? 'BUNDLE'} · {item?.rarity ?? `${bundle?.items.length ?? 0} items`} · {item?.priceCrowns ?? bundle?.priceCrowns} Crowns</small>
  </div>;
}

function OfferPanel({ data, disabledReason, busy, onCreate, onCancel }: {
  data: AdminDropDashboardDto;
  disabledReason: string | null;
  busy: boolean;
  onCreate: (input: { refKey: string; slot: string; badge: string; priceCrowns: number | null; startsAt: string; endsAt: string | null; note: string | null }) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
}) {
  const [form, setForm] = useState({ refKey: data.entries[0]?.key ?? '', slot: 'FEATURED', badge: 'FEATURED', price: '', startsAt: '', endsAt: '', note: '' });
  const set = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  return (
    <Panel title="Scheduled offers" subtitle="Admin offers sit beside the automatic rotation. A live Featured offer replaces the weekly feature.">
      <form className="se-admin-drop__tuning" onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void onCreate({
          refKey: form.refKey, slot: form.slot, badge: form.badge,
          priceCrowns: form.price ? Number(form.price) : null,
          startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : new Date().toISOString(),
          endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
          note: form.note || null,
        });
      }}>
        <label className="se-admin-drop__field"><span>Item or bundle</span>
          <select value={form.refKey} onChange={(event) => set('refKey', event.target.value)}>{data.entries.map((entry) => <option key={entry.key} value={entry.key}>{entry.name}</option>)}</select>
        </label>
        <label className="se-admin-drop__field"><span>Slot</span><select value={form.slot} onChange={(event) => set('slot', event.target.value)}>{SLOTS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="se-admin-drop__field"><span>Badge</span><select value={form.badge} onChange={(event) => set('badge', event.target.value)}>{BADGES.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="se-admin-drop__field"><span>Price (blank = catalog)</span><input type="number" min={1} value={form.price} onChange={(event) => set('price', event.target.value)} /></label>
        <label className="se-admin-drop__field"><span>Starts (local)</span><input type="datetime-local" value={form.startsAt} onChange={(event) => set('startsAt', event.target.value)} /></label>
        <label className="se-admin-drop__field"><span>Ends (local, blank = never)</span><input type="datetime-local" value={form.endsAt} onChange={(event) => set('endsAt', event.target.value)} /></label>
        <label className="se-admin-drop__field"><span>Note</span><input value={form.note} maxLength={300} onChange={(event) => set('note', event.target.value)} /></label>
        <Button type="submit" variant="primary" loading={busy} disabledReason={disabledReason}>Schedule offer</Button>
      </form>
      {data.offers.length ? (
        <ul className="se-drop-receipts">
          {data.offers.map((offer) => (
            <li key={offer.id}>
              <span><strong>{data.entries.find((entry) => entry.key === offer.refKey)?.name ?? offer.refKey}</strong> · {offer.slot} · {offer.badge}{offer.priceCrowns ? ` · ${formatNumber(offer.priceCrowns)}` : ''}</span>
              <small>{adminWhen(offer.startsAt)} → {offer.endsAt ? adminWhen(offer.endsAt) : 'no end'} · by {offer.createdBy}{offer.cancelledAt ? ' · cancelled' : ''}</small>
              {!offer.cancelledAt ? <Button size="sm" variant="ghost" loading={busy} disabledReason={disabledReason} onClick={() => void onCancel(offer.id)}>Cancel</Button> : null}
            </li>
          ))}
        </ul>
      ) : <p className="se-hint">No admin offers yet. The rotation runs on its own.</p>}
    </Panel>
  );
}

function WalletPanel({ reason, disabledReason, onChanged }: { reason: string; disabledReason: string | null; onChanged: () => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [wallet, setWallet] = useState<AdminCrownWalletDto | null>(null);
  const [delta, setDelta] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    try {
      setWallet(await adminDropApi.walletByUsername(username.trim()));
      setError(null);
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  async function adjust() {
    if (!wallet) return;
    const amount = Number(delta);
    if (!Number.isInteger(amount) || amount === 0) { setError('Enter a whole, non-zero number of Crowns.'); return; }
    if (!(await confirmAction({ title: `${amount > 0 ? 'Grant' : 'Remove'} ${formatNumber(Math.abs(amount))} Crowns?`, body: `${wallet.username}. Large amounts wait for a second admin.`, confirmLabel: 'Submit', tone: amount < 0 ? 'danger' : 'normal' }))) return;
    try {
      const result = await adminDropApi.adjust(wallet.accountId, amount, reason);
      setNotice(result.status === 'PENDING' ? 'Sent for a second admin to approve.' : 'Applied.');
      setWallet(await adminDropApi.wallet(wallet.accountId));
      setDelta('');
      await onChanged();
    } catch (caught) {
      setError(errorText(caught));
    }
  }

  return (
    <Panel title="Wallets" subtitle="Look up an account, review its ledger, adjust Crowns or clear a hold.">
      <form className="se-admin-drop__tuning" onSubmit={(event) => void lookup(event)}>
        <label className="se-admin-drop__field"><span>Username</span><input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <Button type="submit">Look up</Button>
      </form>
      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {wallet ? (
        <div className="se-admin-drop__wallet">
          <p><strong>{wallet.username}</strong> · {formatNumber(wallet.wallet.balance)} Crowns · earned {formatNumber(wallet.wallet.earnedThisRound)} this round{wallet.wallet.held ? ` · ON HOLD: ${wallet.wallet.holdReason}` : ''}</p>
          <div className="se-admin-drop__tuning">
            <label className="se-admin-drop__field"><span>Crowns (+ grant, − remove)</span><input type="number" value={delta} onChange={(event) => setDelta(event.target.value)} /></label>
            <Button disabledReason={disabledReason} onClick={() => void adjust()}>Adjust</Button>
            {wallet.wallet.held ? <Button variant="ghost" disabledReason={disabledReason} onClick={() => void adminDropApi.release(wallet.accountId, reason).then(setWallet).catch((caught) => setError(errorText(caught)))}>Clear hold</Button> : null}
          </div>
          <table className="se-table">
            <thead><tr><th scope="col">When</th><th scope="col">Kind</th><th scope="col">What</th><th scope="col">Crowns</th><th scope="col">After</th></tr></thead>
            <tbody>{wallet.history.map((entry) => <tr key={entry.id}><td>{adminWhen(entry.createdAt)}</td><td>{entry.kind}</td><td>{entry.label}</td><td>{entry.delta > 0 ? '+' : ''}{formatNumber(entry.delta)}</td><td>{formatNumber(entry.balanceAfter)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

function PackOrdersPanel({ summary, reason, disabledReason, onChanged }: {
  summary: AdminDropDashboardDto['packOrders'];
  reason: string;
  disabledReason: string | null;
  onChanged: () => Promise<void>;
}) {
  const [status, setStatus] = useState('pending');
  const [orders, setOrders] = useState<(CrownPackOrderDto & { accountId: string | null })[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => {
    adminDropApi.packOrders(status || undefined).then((result) => setOrders(result.orders)).catch((caught) => setMessage(errorText(caught)));
  }, [status]);
  useEffect(() => { load(); }, [load]);
  return (
    <Panel title="Crown pack orders" subtitle={summary.map((row) => `${row.status}: ${row.count} ($${(row.amountCents / 100).toFixed(2)})`).join(' · ') || 'No orders yet.'}>
      <label className="se-admin-drop__field"><span>Status</span>
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          {['pending', 'credited', 'refund_review', 'disputed', 'refunded', 'failed', 'expired', ''].map((value) => <option key={value} value={value}>{value || 'all'}</option>)}
        </select>
      </label>
      {message ? <Alert tone="info">{message}</Alert> : null}
      {orders.length ? (
        <ul className="se-drop-receipts">
          {orders.map((order) => (
            <li key={order.id}>
              <span>#{order.id.slice(-8)} · {order.packId} · {formatNumber(order.crowns)} Crowns · ${(order.amountCents / 100).toFixed(2)} · {order.status}</span>
              <small>{adminWhen(order.createdAt)} · account {order.accountId ?? 'deleted'}</small>
              {order.status === 'pending' ? (
                <Button size="sm" variant="ghost" disabledReason={disabledReason} onClick={() => void adminDropApi.reconcile(order.id, reason)
                  .then((result) => { setMessage(`Reconcile: ${result.outcome}.`); load(); void onChanged(); })
                  .catch((caught) => setMessage(errorText(caught)))}>Reconcile with Stripe</Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="se-hint">No orders with that status.</p>}
    </Panel>
  );
}
