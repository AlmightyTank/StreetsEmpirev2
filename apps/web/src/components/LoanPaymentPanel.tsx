import { useEffect, useRef, useState } from 'react';
import type { GameActionResult, LoanDto, LoanPaymentPreviewDto, LoanPaymentResult } from '@streets/shared';
import { formatCents, formatCentsExact } from '@streets/shared';
import { loansApi } from '../api/loans.js';
import { ApiError } from '../api/client.js';
import { useGameAction } from '../hooks/useGameAction.js';
import { newActionId } from '../utils/actionId.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Row } from './Panel.js';

/**
 * 1.6.5-D. Paying the loan shark from cash: what is overdue, the next installment, a payoff,
 * or any amount. The server previews exactly what the payment would do (late fees first,
 * then installments oldest first, fee share before principal) before anything is confirmed.
 * A payoff is held for a few minutes: the fee keeps earning while the player decides, so the
 * request names the most it may take, and the server takes only the payoff when it lands.
 * Retry-safe like acceptance: an unconfirmed payment keeps its key across reloads.
 */

export type PaymentMode = 'OVERDUE' | 'NEXT' | 'PAYOFF' | 'CUSTOM';

const PENDING_KEY = 'streets.loans.pending-payment.v1';

interface PendingPayment {
  loanId: string;
  amountCents: number;
  requestKey: string;
  actionId: string | null;
}

function readPending(loanId: string): PendingPayment | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingPayment> | null;
    if (!value || value.loanId !== loanId || typeof value.requestKey !== 'string' || !Number.isSafeInteger(value.amountCents)) return null;
    return { loanId, amountCents: value.amountCents as number, requestKey: value.requestKey, actionId: typeof value.actionId === 'string' ? value.actionId : null };
  } catch {
    return null;
  }
}

function writePending(value: PendingPayment | null): void {
  try {
    if (value) window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage can be refused; the in-memory intent still guards this visit.
  }
}

/** Dollars typed by the player, as whole cents; null when it is not a positive amount. */
export function parseDollars(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ''] = cleaned.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/** The amount a mode asks the server to take at most. A payoff asks for its held ceiling. */
export function paymentRequestCents(mode: PaymentMode, loan: Pick<LoanDto, 'overdueCents' | 'payoffCents'> & { nextDueCents: number }, customCents: number | null, payoffHoldCents: number | null): number | null {
  switch (mode) {
    case 'OVERDUE': return loan.overdueCents > 0 ? loan.overdueCents : null;
    case 'NEXT': return loan.nextDueCents > 0 ? loan.nextDueCents : null;
    case 'PAYOFF': return payoffHoldCents ?? loan.payoffCents;
    case 'CUSTOM': return customCents;
  }
}

export function LoanPaymentPanel({ loan, cashCents, onPaid, onRefused }: {
  loan: LoanDto & { offerName: string; nextDueCents: number };
  cashCents: number;
  /** The receipt goes to the page: a payoff takes this loan, and this panel, off the list. */
  onPaid: (result: GameActionResult<LoanPaymentResult>, offerName: string) => void;
  /** A definite refusal: the page reloads so the numbers are current. */
  onRefused: () => void;
}) {
  const [restored] = useState(() => readPending(loan.id));
  const pending = useRef<PendingPayment | null>(restored);
  const action = useGameAction<LoanPaymentResult>();
  const [mode, setMode] = useState<PaymentMode | null>(restored ? 'CUSTOM' : null);
  const [customText, setCustomText] = useState(restored ? (restored.amountCents / 100).toFixed(2) : '');
  const [preview, setPreview] = useState<LoanPaymentPreviewDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(Boolean(restored));

  const customCents = parseDollars(customText);
  // A payoff previews the most it could take; the server answers with the payoff now and its hold.
  const askCents = mode === 'PAYOFF' ? Number.MAX_SAFE_INTEGER : mode ? paymentRequestCents(mode, loan, customCents, null) : null;

  useEffect(() => {
    if (!mode || askCents === null) {
      setPreview(null);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      loansApi.preview(loan.id, askCents)
        .then((next) => { if (active) { setPreview(next); setPreviewError(null); } })
        .catch((caught: unknown) => { if (active) setPreviewError(caught instanceof ApiError ? caught.message : 'Could not price that payment.'); });
    }, mode === 'CUSTOM' ? 350 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [loan.id, mode, askCents, loan.outstandingCents, loan.payoffCents]);

  const { result, clear } = action;
  useEffect(() => {
    if (!result) return;
    pending.current = null;
    writePending(null);
    setUncertain(false);
    setMode(null);
    setPreview(null);
    onPaid(result, loan.offerName);
    clear();
  }, [result, clear, onPaid, loan.offerName]);

  // What the request will name: the hold for a payoff when cash allows, else the payoff itself.
  const sendCents = !preview || !mode
    ? null
    : mode === 'PAYOFF'
      ? Math.min(cashCents, preview.payoffHoldCents) >= preview.payoffCents ? Math.min(cashCents, preview.payoffHoldCents) : null
      : preview.requestedCents;
  const reason = uncertain ? null
    : !mode ? 'Pick what to pay.'
      : mode === 'CUSTOM' && customCents === null ? 'Enter an amount in dollars.'
        : !preview ? 'Working out the payment…'
          : preview.paidCents === 0 ? 'Nothing to pay there.'
            : !preview.enoughCash || sendCents === null ? 'You do not have that much cash on hand.'
              : null;

  async function pay() {
    const amount = uncertain && pending.current ? pending.current.amountCents : sendCents;
    if (amount === null || amount <= 0) return;
    const saved = pending.current;
    const intent: PendingPayment = saved && (uncertain || saved.amountCents === amount)
      ? saved
      : { loanId: loan.id, amountCents: amount, requestKey: newActionId(), actionId: null };
    pending.current = intent;
    writePending(intent);
    await action.run(async (actionId) => {
      intent.actionId = actionId;
      writePending(intent);
      try {
        return await loansApi.pay(loan.id, { amountCents: intent.amountCents, requestKey: intent.requestKey, actionId });
      } catch (caught) {
        if (!(caught instanceof ApiError) || caught.isUncertain) setUncertain(true);
        else {
          pending.current = null;
          writePending(null);
          setUncertain(false);
          onRefused();
        }
        throw caught;
      }
    }, { actionId: intent.actionId ?? undefined });
  }

  function choose(next: PaymentMode) {
    if (uncertain || action.busy) return;
    action.clear();
    setPreview(null);
    setMode((current) => (current === next ? null : next));
  }

  const chip = (key: PaymentMode, label: string, cents: number | null) => (
    <button
      type="button"
      key={key}
      className={`se-loans__chip${mode === key ? ' se-loans__chip--on' : ''}`}
      onClick={() => choose(key)}
      disabled={uncertain || action.busy || (key !== 'CUSTOM' && (cents === null || cents <= 0))}
      aria-pressed={mode === key}
    >
      <span>{label}</span>
      {cents !== null && cents > 0 ? <strong>{formatCents(cents)}</strong> : null}
    </button>
  );

  return (
    <div className="se-loans__pay">
      {action.error ? <Alert>{action.error}</Alert> : null}
      {uncertain ? <Alert tone="warning">We could not confirm that payment. Retry it to check safely: it can never be taken twice.</Alert> : null}
      {previewError ? <Alert>{previewError}</Alert> : null}

      <div className="se-loans__chips" role="group" aria-label={`Pay ${loan.offerName}`}>
        {loan.overdueCents > 0 ? chip('OVERDUE', 'Pay overdue', loan.overdueCents) : null}
        {loan.nextDueCents > 0 && loan.nextDueCents !== loan.overdueCents ? chip('NEXT', loan.overdueCents > 0 ? 'All due by next date' : 'Next installment', loan.nextDueCents) : null}
        {chip('PAYOFF', 'Pay off', loan.payoffCents)}
        {chip('CUSTOM', 'Other amount', null)}
      </div>

      {mode === 'CUSTOM' ? (
        <div className="se-field">
          <label htmlFor={`loan-pay-${loan.id}`}>Amount in dollars</label>
          <input id={`loan-pay-${loan.id}`} className="se-input" inputMode="decimal" placeholder="e.g. 2500" value={customText} disabled={uncertain || action.busy} onChange={(event) => setCustomText(event.target.value)} />
        </div>
      ) : null}

      {mode && preview && preview.paidCents > 0 ? (
        <div className="se-supply__quote">
          <Row label={mode === 'PAYOFF' ? 'Pay off now for' : 'You pay'} value={formatCents(preview.paidCents)} strong />
          {preview.lateFeeCents ? <Row label="Late fees first" value={formatCents(preview.lateFeeCents)} /> : null}
          {preview.contractFeeCents ? <Row label="Contract fee" value={formatCents(preview.contractFeeCents)} /> : null}
          {preview.principalCents ? <Row label="Principal" value={formatCents(preview.principalCents)} /> : null}
          {preview.contractFeeWaivedCents ? <Row label="Unearned fee waived" value={formatCents(preview.contractFeeWaivedCents)} /> : null}
          <Row label="You would owe" value={formatCents(preview.debtAfterCents)} strong />
          <Row label="Cash after" value={formatCents(preview.cashAfterCents)} />
          <p>
            {preview.paysOff ? 'This pays the loan off.' : preview.clearsOverdue && loan.overdueCents > 0 ? 'This clears everything overdue on this loan.' : loan.overdueCents > 0 ? `${formatCents(Math.max(0, loan.overdueCents - preview.paidCents))} would still be overdue.` : 'Applied to the oldest installment first.'}
            {mode === 'PAYOFF' && preview.payoffHoldCents > preview.payoffCents
              ? ` The fee keeps earning while you decide: confirm within a few minutes and it costs at most ${formatCentsExact(preview.payoffHoldCents)}.`
              : ''}
          </p>
        </div>
      ) : null}

      {mode || uncertain ? (
        <Button className="se-btn se-btn--primary se-btn--block" onClick={() => void pay()} disabled={action.busy} disabledReason={reason}>
          {action.busy ? 'Paying…' : uncertain ? 'Retry and check' : preview && preview.paidCents > 0 ? `Pay ${formatCents(preview.paidCents)}` : 'Pay'}
        </Button>
      ) : null}
    </div>
  );
}
