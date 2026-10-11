import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type {
  AdminAuditEntryDto,
  AdminSupporterGrantResultDto,
  AdminSupporterGrantStatus,
  AdminSupportersDto,
  SupporterMembershipDto,
} from '@streets/shared';
import { ADMIN_SUPPORTER_GRANT_MAX, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AuditEntryList } from '../components/AdminParts.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

const GRANT_ACTION = 'account.grant-supporter';
const RECENT_GRANTS = 10;

/** A thumbnail for each supporter reward, from its existing published art. */
const REWARD_ART: Record<string, string> = {
  'supporter-midnight-chrome': '/items/cosmetics/rides/low-rider-midnight-chrome.webp',
  'midnight-chrome-frame': '/profile-frames/midnight-chrome-avatar.webp',
};

const STATUS: Record<AdminSupporterGrantStatus, { label: string; tone: string }> = {
  new: { label: 'New supporter', tone: 'se-tag--good' },
  'missing-rewards': { label: 'Missing rewards', tone: 'se-tag--warn' },
  already: { label: 'Has every reward', tone: '' },
  'not-found': { label: 'No such account', tone: 'se-tag--bad' },
  self: { label: 'Your own account', tone: 'se-tag--bad' },
  duplicate: { label: 'Listed twice', tone: '' },
};

const PAYMENT_TONE: Record<string, string> = { paid: 'se-tag--good', refunded: 'se-tag--warn', disputed: 'se-tag--bad' };

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** The Stripe subscription in a few words: supporting now, ending, failing or ended. */
function MembershipTag({ membership }: { membership: SupporterMembershipDto | null }) {
  if (!membership) return <span className="se-muted" title="Granted by an admin, no Stripe subscription">Manual</span>;
  const until = membership.currentPeriodEnd ? new Date(membership.currentPeriodEnd).toLocaleDateString(undefined, { dateStyle: 'medium' }) : null;
  if (membership.paymentFailing) return <span className="se-tag se-tag--bad" title={membership.status}>Payment failing</span>;
  if (membership.active) {
    return membership.cancelAtPeriodEnd
      ? <span className="se-tag se-tag--warn">Ends {until ?? 'soon'}</span>
      : <span className="se-tag se-tag--good" title={until ? `Renews ${until}` : undefined}>Active</span>;
  }
  return <span className="se-tag" title={membership.status}>{membership.status === 'canceled' ? 'Ended' : membership.status.replaceAll('_', ' ')}</span>;
}

/** One name per line, or separated by commas or spaces, as pasted from a supporter export. */
function parseNames(text: string): string[] {
  return text.split(/[\s,;]+/).map((name) => name.trim()).filter(Boolean);
}

function message(caught: unknown, fallback: string): string {
  return caught instanceof ApiError ? caught.message : fallback;
}

function GrantRows({ result, rewardName }: { result: AdminSupporterGrantResultDto; rewardName: (key: string) => string }) {
  if (!result.rows.length) return <p className="se-muted se-admin-pad">Nothing to do.</p>;
  return (
    <div className="se-tablewrap">
      <table className="se-table se-table--cards">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>{result.dryRun ? 'Would add' : 'Added'}</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, index) => (
            <tr key={`${row.input}-${index}`}>
              <td className="se-td--title">
                {row.accountId ? <Link to={`/game/admin/accounts/${row.accountId}`}><strong>{row.username}</strong></Link> : <strong>{row.input}</strong>}
              </td>
              <td data-label="Status">
                <span className={`se-tag ${STATUS[row.status].tone}`}>{STATUS[row.status].label}</span>
                {row.error ? <p className="se-error">{row.error}</p> : null}
              </td>
              <td data-label={result.dryRun ? 'Would add' : 'Added'}>
                {row.rewardKeys.length ? row.rewardKeys.map(rewardName).join(', ') : <span className="se-muted">-</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Admin → Supporters. Supporter rewards are cosmetic and permanent: this page
 * lists who has them, grants them by username, and backfills rewards added to
 * the catalogue later. Every grant is the audited account action.
 */
export function AdminSupportersPage() {
  const [data, setData] = useState<AdminSupportersDto | null>(null);
  const [grants, setGrants] = useState<AdminAuditEntryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const [namesText, setNamesText] = useState('');
  const [grantReason, setGrantReason] = useState('');
  const [grantResult, setGrantResult] = useState<{ names: string; result: AdminSupporterGrantResultDto } | null>(null);
  const [grantBusy, setGrantBusy] = useState(false);

  const [backfillReason, setBackfillReason] = useState('');
  const [backfillResult, setBackfillResult] = useState<AdminSupporterGrantResultDto | null>(null);
  const [backfillBusy, setBackfillBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [supporters, audit] = await Promise.all([adminApi.supporters(), adminApi.audit({ action: GRANT_ACTION })]);
      setData(supporters);
      setGrants(audit.entries.slice(0, RECENT_GRANTS));
    } catch (caught) {
      setError(message(caught, 'Could not load supporters.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rewardName = useCallback(
    (key: string) => data?.rewards.find((reward) => reward.key === key)?.name ?? key,
    [data],
  );
  const names = useMemo(() => parseNames(namesText), [namesText]);
  const namesKey = names.join('\n').toLowerCase();
  const preview = grantResult?.result.dryRun && grantResult.names === namesKey ? grantResult.result : null;
  const toGrant = preview?.rows.filter((row) => row.status === 'new' || row.status === 'missing-rewards').length ?? 0;
  const supporters = data?.supporters ?? [];
  const needle = filter.trim().toLowerCase();
  const shown = needle ? supporters.filter((supporter) => supporter.username.toLowerCase().includes(needle)) : supporters;
  const nameById = useMemo(() => new Map(supporters.map((supporter) => [supporter.accountId, supporter.username])), [supporters]);

  async function runGrant(dryRun: boolean) {
    setGrantBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await adminApi.grantSupporters(names, grantReason.trim(), dryRun);
      setGrantResult({ names: namesKey, result });
      if (!dryRun) {
        const failed = result.rows.filter((row) => row.error).length;
        setNotice(`Granted supporter rewards to ${formatNumber(result.granted)} ${result.granted === 1 ? 'account' : 'accounts'}${failed ? `; ${formatNumber(failed)} failed` : ''}.`);
        setNamesText('');
        setGrantReason('');
        await load();
      }
    } catch (caught) {
      setError(message(caught, 'Could not grant supporter rewards.'));
    } finally {
      setGrantBusy(false);
    }
  }

  async function runBackfill(dryRun: boolean) {
    setBackfillBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await adminApi.backfillSupporters(backfillReason.trim(), dryRun);
      setBackfillResult(result);
      if (!dryRun) {
        setNotice(`Backfilled ${formatNumber(result.granted)} ${result.granted === 1 ? 'supporter' : 'supporters'}.`);
        setBackfillReason('');
        await load();
      }
    } catch (caught) {
      setError(message(caught, 'Could not backfill supporter rewards.'));
    } finally {
      setBackfillBusy(false);
    }
  }

  function previewGrant(event: FormEvent) {
    event.preventDefault();
    void runGrant(true);
  }

  const working = 'The last supporter change is still going through.';
  const grantBlocked = grantBusy ? working
    : !preview ? 'Preview this list first.'
      : !toGrant ? 'Nobody in this list needs rewards.'
        : grantReason.trim().length < 5 ? 'Give a reason of at least 5 characters.'
          : null;
  const backfillPreview = backfillResult?.dryRun ? backfillResult : null;
  const backfillBlocked = backfillBusy ? working
    : !backfillPreview ? 'Preview the backfill first.'
      : backfillReason.trim().length < 5 ? 'Give a reason of at least 5 characters.'
        : null;

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Supporters</h1>
          <p className="se-eyebrow">Admin · Stripe supporters and cosmetic rewards, kept for good</p>
        </div>
        <div className="se-cta">
          <Link className="se-btn se-btn--ghost" to={`/game/admin/audit?action=${GRANT_ACTION}`}>All supporter grants</Link>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}
      {data && !data.checkoutEnabled ? (
        <Alert tone="info">
          Stripe checkout is off on this server, so players cannot support yet. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
          and STRIPE_SUPPORTER_PRICE_ID to turn it on. Grants below still work.
        </Alert>
      ) : null}

      <div className="se-stats se-mb">
        <Stat label="Supporters" value={data ? formatNumber(supporters.length) : '-'} />
        <Stat label="Supporting now" value={data ? formatNumber(data.activeCount) : '-'} />
        <Stat label="Wearing the card" value={data ? formatNumber(supporters.filter((supporter) => supporter.wearingCard).length) : '-'} />
        <Stat label="Missing rewards" value={data ? formatNumber(data.missingCount) : '-'} />
      </div>

      <Panel title="Grant rewards" className="se-mb">
        <form onSubmit={previewGrant} noValidate>
          <p className="se-hint">
            Paste usernames, one per line or separated by commas, up to {formatNumber(ADMIN_SUPPORTER_GRANT_MAX)}.
            Preview sorts them first; Grant then gives every listed account the rewards it is missing.
            Rewards are cosmetic and there is no revoke.
          </p>
          <div className="se-field">
            <label className="se-label" htmlFor="admin-supporter-names">Usernames</label>
            <textarea
              id="admin-supporter-names"
              className="se-input se-admin-reason"
              rows={4}
              value={namesText}
              onChange={(event) => setNamesText(event.target.value)}
            />
          </div>
          <div className="se-field">
            <label className="se-label" htmlFor="admin-supporter-reason">Reason</label>
            <textarea
              id="admin-supporter-reason"
              className="se-input se-admin-reason"
              rows={2}
              maxLength={500}
              placeholder="For example: Ko-fi supporter, October"
              value={grantReason}
              onChange={(event) => setGrantReason(event.target.value)}
            />
          </div>
          <div className="se-admin-actions">
            <Button
              type="submit"
              className="se-btn se-btn--ghost"
              disabledReason={grantBusy ? working : !names.length ? 'Add at least one username.' : names.length > ADMIN_SUPPORTER_GRANT_MAX ? `At most ${ADMIN_SUPPORTER_GRANT_MAX} names per grant.` : null}
            >
              Preview
            </Button>
            <Button type="button" className="se-btn se-btn--primary" onClick={() => void runGrant(false)} disabledReason={grantBlocked}>
              {grantBusy ? 'Working...' : toGrant ? `Grant to ${formatNumber(toGrant)}` : 'Grant'}
            </Button>
          </div>
        </form>
        {grantResult ? (
          <div className="se-mt">
            <p className="se-label">{grantResult.result.dryRun ? (preview ? 'Preview' : 'Preview (the list has changed since)') : 'Result'}</p>
            <GrantRows result={grantResult.result} rewardName={rewardName} />
          </div>
        ) : null}
      </Panel>

      <Panel title="Rewards" aside={data ? `${formatNumber(data.rewards.length)} in the catalogue` : undefined} className="se-mb">
        {data ? (
          <ul className="se-admin-rewards">
            {data.rewards.map((reward) => (
              <li key={reward.key}>
                {REWARD_ART[reward.key] ? <img className="se-admin-rewards__art" src={REWARD_ART[reward.key]} alt="" aria-hidden="true" /> : null}
                <span>
                  <strong>{reward.name}</strong>
                  <small className="se-muted">{reward.kind === 'PROFILE_FRAME' ? 'Avatar frame' : 'Item collection'} · {reward.rarity} · <code>{reward.key}</code></small>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="se-muted">Loading rewards...</p>}
        <p className="se-hint">
          {data && data.missingCount
            ? `${formatNumber(data.missingCount)} ${data.missingCount === 1 ? 'supporter is' : 'supporters are'} missing a reward, usually one added after they were granted.`
            : 'Every supporter has every reward. Run a backfill after adding a reward to the catalogue.'}
        </p>
        {data && data.missingCount ? (
          <>
            <div className="se-field">
              <label className="se-label" htmlFor="admin-supporter-backfill-reason">Reason</label>
              <textarea
                id="admin-supporter-backfill-reason"
                className="se-input se-admin-reason"
                rows={2}
                maxLength={500}
                placeholder="For example: new supporter reward released"
                value={backfillReason}
                onChange={(event) => setBackfillReason(event.target.value)}
              />
            </div>
            <div className="se-admin-actions">
              <Button type="button" className="se-btn se-btn--ghost" onClick={() => void runBackfill(true)} disabledReason={backfillBusy ? working : null}>Preview backfill</Button>
              <Button type="button" className="se-btn se-btn--primary" onClick={() => void runBackfill(false)} disabledReason={backfillBlocked}>
                {backfillBusy ? 'Working...' : 'Give missing rewards'}
              </Button>
            </div>
          </>
        ) : null}
        {backfillResult ? (
          <div className="se-mt">
            <p className="se-label">{backfillResult.dryRun ? 'Backfill preview' : 'Backfill result'}</p>
            <GrantRows result={backfillResult} rewardName={rewardName} />
          </div>
        ) : null}
      </Panel>

      <Panel
        title="Supporter roster"
        aside={data ? `${formatNumber(shown.length)} of ${formatNumber(supporters.length)}` : undefined}
        flush
        className="se-mb"
      >
        <div className="se-admin-pad">
          <label className="se-label" htmlFor="admin-supporter-filter">Find a supporter</label>
          <input id="admin-supporter-filter" className="se-input" type="search" value={filter} maxLength={40} onChange={(event) => setFilter(event.target.value)} />
        </div>
        {!data ? (
          <p className="se-muted se-admin-pad">Loading supporters...</p>
        ) : !shown.length ? (
          <p className="se-muted se-admin-pad">{supporters.length ? 'No supporter matches that name.' : 'No supporters yet.'}</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Supporter since</th>
                  <th>Last login</th>
                  <th>Subscription</th>
                  <th>Rewards</th>
                  <th>Card</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((supporter) => (
                  <tr key={supporter.accountId}>
                    <td className="se-td--title">
                      <Link to={`/game/admin/accounts/${supporter.accountId}`}><strong>{supporter.username}</strong></Link>
                      {supporter.isActive ? null : <> <span className="se-tag se-tag--bad">Deactivated</span></>}
                    </td>
                    <td data-label="Supporter since">{adminWhen(supporter.since)}</td>
                    <td data-label="Last login">{adminWhen(supporter.lastLoginAt)}</td>
                    <td data-label="Subscription"><MembershipTag membership={supporter.membership} /></td>
                    <td data-label="Rewards">
                      {formatNumber(supporter.rewardKeys.length)} of {formatNumber(data.rewards.length)}
                      {supporter.missingKeys.length ? <> <span className="se-tag se-tag--warn" title={supporter.missingKeys.map(rewardName).join(', ')}>Missing {formatNumber(supporter.missingKeys.length)}</span></> : null}
                    </td>
                    <td data-label="Card">{supporter.wearingCard ? <span className="se-tag se-tag--good">Wearing</span> : <span className="se-muted">-</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Payments" aside={data ? `Newest ${formatNumber(data.payments.length)}` : undefined} flush className="se-mb">
        {!data ? (
          <p className="se-muted se-admin-pad">Loading payments...</p>
        ) : !data.payments.length ? (
          <p className="se-muted se-admin-pad">No supporter payments yet.</p>
        ) : (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Paid</th>
                  <th className="se-table__number">Amount</th>
                  <th>Status</th>
                  <th>Stripe invoice</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="se-td--title">
                      {payment.accountId
                        ? <Link to={`/game/admin/accounts/${payment.accountId}`}><strong>{payment.username}</strong></Link>
                        : <span className="se-muted">Deleted account</span>}
                    </td>
                    <td data-label="Paid">{adminWhen(payment.paidAt)}</td>
                    <td className="se-table__number" data-label="Amount">{money(payment.amountCents, payment.currency)}</td>
                    <td data-label="Status"><span className={`se-tag ${PAYMENT_TONE[payment.status] ?? ''}`}>{payment.status}</span></td>
                    <td data-label="Stripe invoice"><code>{payment.stripeInvoiceId}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Recent grants" aside={`Last ${RECENT_GRANTS}`} flush>
        {grants === null
          ? <p className="se-muted se-admin-pad">Loading grants...</p>
          : <AuditEntryList entries={grants} names={nameById} empty="No supporter rewards granted yet." />}
      </Panel>
    </GameLayout>
  );
}
