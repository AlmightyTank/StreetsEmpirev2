import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoanAcceptResult, LoanOfferDto, LoanSharkPageDto } from '@streets/shared';
import { formatCents } from '@streets/shared';
import { loansApi } from '../api/loans.js';
import { ApiError } from '../api/client.js';
import { ActionResult } from '../components/ActionResult.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { newActionId } from '../utils/actionId.js';
import '../styles/supply.css';
import '../styles/loans.css';

/**
 * 1.6.5-B. The Loan Shark. Every offer shows the cash, the fee, the full payback, the
 * schedule, what is owed now and the room left, and what missing a payment costs, before
 * anything is accepted. Acceptance is retry-safe: an unconfirmed attempt keeps its request
 * key across reloads, and the form stays locked until the server says what happened.
 */

const PENDING_KEY = 'streets.loans.pending-accept.v1';

interface PendingAccept {
  requestKey: string;
  actionId: string | null;
  offerKey: string;
  /** 1.6.5-C. The fee the player saw when they accepted. */
  quotedFeeCents: number;
}

function readPending(): PendingAccept | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingAccept> | null;
    if (!value || typeof value.requestKey !== 'string' || typeof value.offerKey !== 'string' || !Number.isSafeInteger(value.quotedFeeCents)) return null;
    return {
      requestKey: value.requestKey,
      offerKey: value.offerKey,
      actionId: typeof value.actionId === 'string' ? value.actionId : null,
      quotedFeeCents: value.quotedFeeCents as number,
    };
  } catch {
    return null;
  }
}

function writePending(value: PendingAccept | null): void {
  try {
    if (value) window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Private windows can refuse storage; the in-memory intent still guards this visit.
  }
}

export function hoursLabel(hours: number): string {
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (days === 0) return `${rest}h`;
  return rest === 0 ? `${days}d` : `${days}d ${rest}h`;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const STANDING: Record<string, string> = {
  CLEAR: 'In good standing',
  DELINQUENT: 'Delinquent',
  COLLECTIONS: 'In collections',
};

export function surchargeSummary(offer: Pick<LoanOfferDto, 'pricing'>): string {
  const parts: string[] = [];
  if (offer.pricing.tierSurchargePercent > 0) parts.push(`+${offer.pricing.tierSurchargePercent}% for what you owe`);
  if (offer.pricing.historySurchargePercent > 0) parts.push(`+${offer.pricing.historySurchargePercent}% for missed installments`);
  if (offer.pricing.capped) parts.push('capped');
  return parts.join(', ');
}

export function missedPaymentText(offer: Pick<LoanOfferDto, 'lateFeeCents' | 'lateFeeCapCents'>): string {
  return `If you cannot cover an installment when it falls due, the loan shark takes whatever cash you have toward it, adds a ${formatCents(offer.lateFeeCents)} late fee (at most ${formatCents(offer.lateFeeCapCents)} on this loan), and marks you delinquent until it is paid. Late fees never earn interest.`;
}

function OfferCard({ offer, selected, locked, onSelect }: { offer: LoanOfferDto; selected: boolean; locked: boolean; onSelect: () => void }) {
  return (
    <article className={`se-loans__offer${selected ? ' se-loans__offer--selected' : ''}${offer.available ? '' : ' se-loans__offer--unavailable'}`}>
      <div className="se-supply__order-head">
        <div><strong>{offer.name}</strong><span>{offer.description}</span></div>
        <span className="se-supply__status">{offer.available ? `${offer.feePercent}% fee` : 'Unavailable'}</span>
      </div>
      <Row label="Cash you receive" value={formatCents(offer.principalCents)} strong />
      <Row label="Contract fee" value={formatCents(offer.contractFeeCents)} />
      {offer.pricing.surchargeCents > 0 ? <p className="se-loans__reason">Includes {formatCents(offer.contractFeeCents - offer.pricing.baseFeeCents)} on top of the listed {formatCents(offer.pricing.baseFeeCents)}: {surchargeSummary(offer)}.</p> : null}
      <Row label="Total payback" value={formatCents(offer.obligationCents)} strong />
      <Row label="Schedule" value={`${offer.installmentCount} × every ${hoursLabel(offer.installmentIntervalHours)}`} />
      {offer.minNetWorthCents ? <Row label="Needs net worth" value={formatCents(offer.minNetWorthCents)} /> : null}
      {offer.unavailableReason ? <p className="se-loans__reason">{offer.unavailableReason}</p> : null}
      <Button className={`se-btn ${selected ? 'se-btn--primary' : ''} se-btn--block`} onClick={onSelect} disabled={locked || !offer.available} disabledReason={locked ? null : offer.unavailableReason}>
        {selected ? 'Reviewing this offer' : 'Review terms'}
      </Button>
    </article>
  );
}

export function LoanSharkPage() {
  const [restored] = useState(readPending);
  const pending = useRef<PendingAccept | null>(restored);
  const me = useSession((state) => state.me);
  const action = useGameAction<LoanAcceptResult>();
  const [data, setData] = useState<LoanSharkPageDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(restored?.offerKey ?? null);
  const [uncertain, setUncertain] = useState(Boolean(restored));
  const reviewRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(() => {
    let active = true;
    loansApi.page()
      .then((next) => {
        if (!active) return;
        setData(next);
        setLoadError(null);
      })
      .catch((caught: unknown) => {
        if (active) setLoadError(caught instanceof ApiError ? caught.message : 'Could not reach the loan shark. Try again.');
      });
    return () => { active = false; };
  }, []);

  useEffect(load, [load, reload, me?.id]);

  useEffect(() => {
    if (!action.result) return;
    pending.current = null;
    writePending(null);
    setUncertain(false);
    setSelectedKey(null);
    setReload((value) => value + 1);
  }, [action.result]);

  const selected = data?.offers.find((offer) => offer.key === selectedKey) ?? null;
  const account = data?.account ?? null;

  function choose(key: string) {
    if (uncertain || action.busy) return;
    pending.current = null;
    writePending(null);
    action.clear();
    setSelectedKey((current) => (current === key ? null : key));
    // On a phone the review sits above the offers: bring it into view.
    window.requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  async function accept() {
    if (!selected || (!uncertain && !selected.available)) return;
    const saved = pending.current;
    // An unconfirmed attempt is retried exactly as it was sent, price included.
    const intent: PendingAccept = saved && saved.offerKey === selected.key && (uncertain || saved.quotedFeeCents === selected.contractFeeCents)
      ? saved
      : { requestKey: newActionId(), actionId: null, offerKey: selected.key, quotedFeeCents: selected.contractFeeCents };
    pending.current = intent;
    writePending(intent);
    await action.run(async (actionId) => {
      intent.actionId = actionId;
      writePending(intent);
      try {
        return await loansApi.accept({ offerKey: intent.offerKey, quotedFeeCents: intent.quotedFeeCents, requestKey: intent.requestKey, actionId });
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.isUncertain) setUncertain(true);
        else {
          pending.current = null;
          writePending(null);
          setUncertain(false);
          setReload((value) => value + 1);
        }
        throw caught;
      }
    }, { actionId: intent.actionId ?? undefined });
  }

  const cashCents = me?.resources.cashCents ?? data?.cashCents ?? 0;

  return (
    <GameLayout>
      <div className="se-supply se-loans">
        <header className="se-supply__hero">
          <span className="se-eyebrow">Fast money</span>
          <h1>Loan Shark</h1>
          <p>Cash now, paid back on a schedule. Every offer shows exactly what it costs before you take it. What you owe is capped, and paying off early only costs the part of the fee you have used.</p>
        </header>

        {loadError ? <Alert>{loadError}</Alert> : null}
        {action.error ? <Alert>{action.error}</Alert> : null}
        {uncertain ? <Alert tone="warning">We could not confirm whether the loan went through. Retry the same offer to check it safely: it can never pay out twice. The offers are locked until the result is known.</Alert> : null}
        {data && !data.enabled ? <Alert tone="info">Nobody is lending this season.</Alert> : null}

        {action.result ? (
          <ActionResult
            title={action.result.result.replayed ? 'Loan already taken' : 'Loan taken'}
            subtitle={`${data?.offers.find((offer) => offer.key === action.result!.result.loan.offerKey)?.name ?? 'Loan'} · ${action.result.result.loan.installments.length} installments`}
            result={action.result}
            onDismiss={action.clear}
            lines={[
              { label: 'Cash received', delta: action.result.result.creditedCents, money: true },
              { label: 'Total payback', value: formatCents(action.result.result.loan.obligationCents) },
              { label: 'You now owe', value: formatCents(action.result.result.account.debtCents) },
              { label: 'First installment', value: action.result.result.loan.installments[0] ? `${formatCents(action.result.result.loan.installments[0].amountCents)} · ${when(action.result.result.loan.installments[0].dueAt)}` : '—' },
            ]}
          />
        ) : null}

        {data?.enabled && account ? (
          <div className="se-supply__grid">
            <Panel title="What you owe" aside={STANDING[account.collectionState] ?? account.collectionState} className="se-loans__account">
              <div className="se-loans__meter" role="meter" aria-label="Debt against the limit" aria-valuemin={0} aria-valuemax={account.debtCeilingCents} aria-valuenow={account.debtCents}>
                <span style={{ width: `${Math.min(100, account.debtCeilingCents ? (account.debtCents / account.debtCeilingCents) * 100 : 0)}%` }} />
              </div>
              <Row label="Outstanding debt" value={formatCents(account.debtCents)} strong />
              <Row label="Most you can owe" value={formatCents(account.debtCeilingCents)} />
              <Row label="Room left" value={formatCents(account.availableCents)} />
              <Row label="Late fees charged this round" value={`${formatCents(account.feesAssessedCents)} of ${formatCents(account.feeCapCents)} max`} />
              <Row label="Cash on hand" value={formatCents(cashCents)} />
              {data.credit ? (
                <>
                  <Row label="How the shark sees you" value={`${data.credit.tierLabel ?? 'Clean'}${data.credit.tierSurchargePercent ? ` · +${data.credit.tierSurchargePercent}% on new loans` : ''}`} />
                  <Row label="Installments missed this round" value={`${data.credit.missedInstallments}${data.credit.historySurchargePercent ? ` · +${data.credit.historySurchargePercent}% on new loans` : ''}`} />
                  <p className="se-loans__reason">
                    {data.credit.nextTier
                      ? `New loans get dearer as you owe more: from ${data.credit.nextTier.fromPercent}% of your limit (${data.credit.nextTier.label}) they cost ${data.credit.nextTier.surchargePercent} more points of the cash advanced.`
                      : 'You are in the shark\'s most expensive tier.'}
                    {' '}Every missed installment adds to the price of new loans too. Loans you already have keep their price.
                  </p>
                </>
              ) : null}
            </Panel>

            <div ref={reviewRef} className="se-loans__review-anchor">
            <Panel title="Review the deal" className="se-loans__review">
              {!selected ? <p className="se-muted">Pick an offer below to see its full terms before you take it.</p> : (
                <div className="se-supply__form">
                  <div className="se-supply__quote">
                    <Row label="Offer" value={selected.name} strong />
                    <Row label="Cash you receive now" value={formatCents(selected.principalCents)} strong />
                    {selected.pricing.surchargeCents > 0 ? (
                      <>
                        <Row label="Listed fee" value={formatCents(selected.pricing.baseFeeCents)} />
                        {selected.pricing.tierSurchargePercent > 0 ? <Row label={`Debt surcharge · ${selected.pricing.tierLabel ?? ''} (${selected.pricing.utilizationPercent}% of your limit)`} value={`+${selected.pricing.tierSurchargePercent}%`} /> : null}
                        {selected.pricing.historySurchargePercent > 0 ? <Row label={`Missed-payment surcharge · ${selected.pricing.missedInstallments} missed`} value={`+${selected.pricing.historySurchargePercent}%`} /> : null}
                        {selected.pricing.capped ? <Row label="Capped at the most a fee can be" value={`${data?.credit?.maxFeePercent ?? selected.feePercent}%`} /> : null}
                      </>
                    ) : null}
                    <Row label="Fixed contract fee" value={`${formatCents(selected.contractFeeCents)} (${selected.feePercent}%)`} />
                    <Row label="Total payback on schedule" value={formatCents(selected.obligationCents)} strong />
                    {selected.installments.map((row) => (
                      <Row key={row.sequence} label={`Installment ${row.sequence} · ${hoursLabel(row.dueAfterHours)} after you accept`} value={formatCents(row.amountCents)} />
                    ))}
                    <Row label="You owe now" value={formatCents(account.debtCents)} />
                    <Row label="You would owe" value={formatCents(selected.debtAfterCents)} strong />
                    <Row label="Room left after" value={formatCents(selected.availableAfterCents)} />
                    <Row label="Cash after" value={formatCents(cashCents + selected.principalCents)} />
                    <p>Installments are collected from your cash when they fall due. Pay off early and you only owe the part of the fee earned so far; the rest is waived. This price is fixed once you take it: borrowing again later never reprices this loan.</p>
                    <p className="se-loans__warning">{missedPaymentText(selected)}</p>
                  </div>
                  <Button className="se-btn se-btn--primary se-btn--block" onClick={() => void accept()} disabled={action.busy} disabledReason={uncertain ? null : selected.unavailableReason}>
                    {action.busy ? 'Taking the cash…' : uncertain ? 'Retry and check' : `Take ${formatCents(selected.principalCents)}`}
                  </Button>
                  {!uncertain ? <Button className="se-btn se-btn--block" onClick={() => setSelectedKey(null)} disabled={action.busy}>Not now</Button> : null}
                </div>
              )}
            </Panel>
            </div>

            <Panel title="Offers" aside={`${data.offers.filter((offer) => offer.available).length} of ${data.offers.length} open to you`} className="se-loans__offers-panel">
              {data.offers.length === 0 ? <p className="se-muted">The loan shark has nothing on offer right now.</p> : (
                <div className="se-loans__offers">
                  {data.offers.map((offer) => (
                    <OfferCard key={offer.key} offer={offer} selected={offer.key === selectedKey} locked={uncertain || action.busy} onSelect={() => choose(offer.key)} />
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Active loans" aside={`${data.activeLoans.length} open`}>
              {data.activeLoans.length === 0 ? <p className="se-muted">You do not owe the loan shark anything.</p> : (
                <div className="se-supply__orders">
                  {data.activeLoans.map((loan) => (
                    <article className="se-supply__order" key={loan.id}>
                      <div className="se-supply__order-head">
                        <div><strong>{loan.offerName} · {formatCents(loan.principalCents)}</strong><span>Taken {when(loan.acceptedAt)}</span></div>
                        <span className={`se-supply__status${loan.status === 'DELINQUENT' ? ' se-loans__status--late' : ''}`}>{loan.status === 'DELINQUENT' ? 'Delinquent' : 'Active'}</span>
                      </div>
                      <Row label="Still owed on schedule" value={formatCents(loan.outstandingCents)} strong />
                      <Row label="Pay off now for" value={formatCents(loan.payoffCents)} />
                      {loan.nextDueAt ? <Row label={`Next due ${when(loan.nextDueAt)}`} value={formatCents(loan.nextDueCents)} /> : null}
                      {loan.lateFeesAssessedCents > 0 ? <Row label="Late fees charged" value={`${formatCents(loan.lateFeesAssessedCents)} of ${formatCents(loan.lateFeeCapCents)} max`} /> : null}
                      <ol className="se-loans__schedule">
                        {loan.installments.map((row) => (
                          <li key={row.sequence} className={`se-loans__installment se-loans__installment--${row.status.toLowerCase()}`}>
                            <span>{when(row.dueAt)}</span>
                            <span>{row.status === 'PAID' ? 'Paid' : row.status === 'MISSED' ? `Missed · ${formatCents(row.remainingCents)} owed` : formatCents(row.remainingCents)}</span>
                          </li>
                        ))}
                      </ol>
                    </article>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Recent history" className="se-supply__history-panel">
              {data.history.length === 0 ? <p className="se-muted">Loans you take, and every payment on them, will appear here.</p> : (
                <div className="se-supply__history">
                  {data.history.map((row) => (
                    <div className="se-supply__history-row" key={row.id}>
                      <div><strong>{row.label}</strong><span>{when(row.createdAt)} · owed after: {formatCents(row.debtAfterCents)}</span></div>
                      {row.debtDeltaCents !== 0 ? <strong>{row.debtDeltaCents > 0 ? '+' : '−'}{formatCents(Math.abs(row.debtDeltaCents))}</strong> : null}
                    </div>
                  ))}
                </div>
              )}
              {data.closedLoans.length ? (
                <p className="se-muted se-loans__closed">Paid off this round: {data.closedLoans.map((loan) => `${loan.offerName} (${formatCents(loan.principalCents)})`).join(', ')}.</p>
              ) : null}
            </Panel>
          </div>
        ) : null}
      </div>
    </GameLayout>
  );
}
