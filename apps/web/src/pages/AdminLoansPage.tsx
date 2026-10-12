import { useEffect, useState, type FormEvent } from 'react';
import type { AdminLoanCorrectionInput, AdminLoanPlayerDto, AdminLoansDto } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { AdminRoundPicker, useAdminRound } from '../components/AdminRoundPicker.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row, Stat } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen } from '../utils/admin.js';

/** A correction waiting for its reason. */
type PendingCorrection = { kind: 'WAIVE_LATE_FEE'; feeId: string } | { kind: 'EXCUSE_MISS'; installmentId: string };

const STANDING: Record<string, string> = { CLEAR: 'Clear', DELINQUENT: 'Delinquent', COLLECTIONS: 'Collections', RECOVERING: 'Recovering' };

/** What a pending correction is, for the confirmation line. */
export function correctionLabel(target: AdminLoanCorrectionInput['kind'], detail: string): string {
  return target === 'WAIVE_LATE_FEE' ? `Waive the unpaid part of ${detail}` : `Excuse ${detail}: reschedule it one interval from now and waive its late fee`;
}

/**
 * 1.6.5-F. Operator view of the loan shark: a round's debt, standings, fees and collections,
 * with every borrower reconciled and exploit-checked, and one player's loans in full with the
 * two audited corrections: waive a late fee, or excuse a missed installment. Corrections
 * never create cash or erase history, are refused on finished rounds and on your own player,
 * and go to the audit log.
 */
export function AdminLoansPage() {
  const { rounds, roundId, setRoundId, error: roundsError } = useAdminRound();
  const [report, setReport] = useState<AdminLoansDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminLoanPlayerDto | null>(null);
  const [pending, setPending] = useState<{ input: PendingCorrection; label: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setReport(null);
    setPlayerId(null);
    setNotice(null);
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    let active = true;
    setError(null);
    adminApi.loans(roundId)
      .then((next) => { if (active) setReport(next); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load the loan report.'); });
    return () => { active = false; };
  }, [roundId, version]);

  useEffect(() => {
    setDetail(null);
    setPending(null);
    if (!playerId) return;
    let active = true;
    adminApi.playerLoans(playerId)
      .then((next) => { if (active) setDetail(next); })
      .catch((caught: unknown) => { if (active) setError(caught instanceof ApiError ? caught.message : 'Could not load that player’s loans.'); });
    return () => { active = false; };
  }, [playerId, version]);

  async function correct(event: FormEvent) {
    event.preventDefault();
    if (!pending || !playerId || reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await adminApi.correctPlayerLoans(playerId, { ...pending.input, reason: reason.trim() });
      const open = result.problems.length;
      setNotice(`${result.kind === 'WAIVE_LATE_FEE' ? 'Fee waived' : 'Miss excused'}: ${formatCents(result.waivedCents)} forgiven, debt ${formatCents(result.debtBeforeCents)} → ${formatCents(result.debtAfterCents)}, standing ${STANDING[result.standing] ?? result.standing}${result.dueAgainAt ? `, due again ${adminWhen(result.dueAgainAt)}` : ''}. Saved to the audit log. ${open ? `${open} problem${open === 1 ? '' : 's'} still open.` : 'This player reconciles.'}`);
      setPending(null);
      setReason('');
      setVersion((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That correction did not go through.');
    } finally {
      setBusy(false);
    }
  }

  const empty = (columns: number, label: string) => <tr><td className="se-muted" colSpan={columns}>{label}</td></tr>;

  return (
    <GameLayout>
      <div className="se-pagehead se-admin-pagehead">
        <div>
          <h1 className="se-title">Loan Shark</h1>
          <p className="se-eyebrow">Admin · debt, standings, fees, collections and the loan ledger</p>
        </div>
        <AdminRoundPicker rounds={rounds} roundId={roundId} onChange={setRoundId} />
      </div>
      {roundsError || error ? <Alert>{roundsError ?? error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}
      {report && !report.enabled ? <Alert tone="info">There is no loan shark in this round’s pinned ruleset.</Alert> : null}

      {report ? (
        <>
          <div className="se-stats se-mb">
            <Stat label="Borrowers" value={formatNumber(report.totals.borrowers)} />
            <Stat label="Owed now" value={formatCents(report.totals.debtCents)} />
            <Stat label="Loans" value={`${formatNumber(report.totals.activeLoans)} open · ${formatNumber(report.totals.paidOffLoans)} paid`} />
            <Stat label="Delinquent loans" value={formatNumber(report.totals.delinquentLoans)} />
            <Stat label="Advanced" value={formatCents(report.totals.principalAdvancedCents)} />
            <Stat label="Late fees" value={`${formatCents(report.totals.lateFeesAssessedCents)} · ${formatCents(report.totals.lateFeesWaivedCents)} waived`} />
            <Stat label="Paid" value={`${formatCents(report.totals.paidCents.SCHEDULED)} sched · ${formatCents(report.totals.paidCents.MANUAL)} manual`} />
            <Stat label="Garnished" value={`${formatCents(report.totals.paidCents.COLLECTION)} · ${formatCents(report.totals.garnished24hCents)} 24h`} />
            <Stat label="Standings" value={(['CLEAR', 'DELINQUENT', 'COLLECTIONS', 'RECOVERING'] as const).map((key) => `${STANDING[key]} ${report.totals.standings[key]}`).join(' · ')} />
          </div>

          <Panel title="Reconciliation and exploit checks" aside={report.problems.length ? `${report.problems.length} player${report.problems.length === 1 ? '' : 's'} with problems` : `Clean · ${formatNumber(report.checkedPlayers)} checked`} className="se-mb">
            <p className="se-admin-pad se-hint">Every borrower’s debt against their loans, receipts, fees, waivers and the cash ledger, and the exploit checks: loans accepted or advanced twice, payments journaled twice, a miss charged twice, a standing out of step with missed installments, debt or fees over the limits.</p>
            {report.problems.length ? <ul className="se-admin-list se-admin-pad">{report.problems.map((row) => (
              <li key={row.player.id}>
                <button type="button" className="se-linkbtn" onClick={() => setPlayerId(row.player.id)}>{row.player.displayName}</button>: {row.problems.join('; ')}
              </li>
            ))}</ul> : <p className="se-admin-pad se-muted">Everything adds up.</p>}
          </Panel>

          <Panel title="Borrowers" aside={report.limits ? `Ceiling ${formatCents(report.limits.debtCeilingCents)} · fee cap ${formatCents(report.limits.feeCapCents)}` : undefined} flush className="se-mb">
            <div className="se-tablewrap">
              <table className="se-table se-table--cards">
                <thead><tr><th>Player</th><th className="se-table__number">Owes</th><th className="se-table__number">Of ceiling</th><th>Standing</th><th className="se-table__number">Overdue</th><th className="se-table__number">Missed</th><th className="se-table__number">Late fees</th><th className="se-table__number">Problems</th><th /></tr></thead>
                <tbody>{report.players.length ? report.players.map((row) => (
                  <tr key={row.player.id}>
                    <td className="se-td--title">{row.player.displayName}</td>
                    <td className="se-table__number se-num" data-label="Owes">{formatCents(row.debtCents)}</td>
                    <td className="se-table__number se-num" data-label="Of ceiling">{row.ceilingUsePercent}%</td>
                    <td data-label="Standing">{STANDING[row.standing] ?? row.standing}{row.standing === 'RECOVERING' ? ` · ${row.recoveryNeeded} to go` : ''}</td>
                    <td className="se-table__number se-num" data-label="Overdue">{formatCents(row.overdueCents)}</td>
                    <td className="se-table__number se-num" data-label="Missed">{formatNumber(row.missedInstallments)}</td>
                    <td className="se-table__number se-num" data-label="Late fees">{formatCents(row.feesAssessedCents)}</td>
                    <td className="se-table__number se-num" data-label="Problems">{row.problems ? <strong className="se-text-bad">{row.problems}</strong> : '0'}</td>
                    <td><button type="button" className="se-linkbtn" onClick={() => setPlayerId(row.player.id)}>Inspect</button></td>
                  </tr>
                )) : empty(9, 'Nobody has borrowed this round.')}</tbody>
              </table>
            </div>
          </Panel>

          {detail ? (
            <Panel title={`${detail.player.displayName} · loans`} aside={detail.frozen ? 'Round finished: read-only' : detail.account ? `${STANDING[detail.account.collectionState]} · owes ${formatCents(detail.account.debtCents)}` : undefined} className="se-mb">
              {detail.problems.length ? <Alert>{detail.problems.join('; ')}</Alert> : <p className="se-hint">This player reconciles.</p>}
              {detail.account ? (
                <div className="se-admin-pad">
                  <Row label="Owes" value={`${formatCents(detail.account.debtCents)} of ${formatCents(detail.account.debtCeilingCents)}`} />
                  <Row label="Late fees assessed" value={`${formatCents(detail.account.feesAssessedCents)} of ${formatCents(detail.account.feeCapCents)}`} />
                  <Row label="Standing" value={`${STANDING[detail.account.collectionState]}${detail.account.collectionState === 'RECOVERING' ? ` · ${detail.account.recoveryNeeded} on time to go` : ''}`} />
                </div>
              ) : null}

              {detail.loans.map((loan) => (
                <div key={loan.id} className="se-mb">
                  <h3 className="se-admin-pad">{loan.offerName} · {formatCents(loan.principalCents)} · {loan.status.toLowerCase().replace('_', ' ')} <span className="se-muted">({loan.rulesetId}, taken {adminWhen(loan.acceptedAt)})</span></h3>
                  <p className="se-admin-pad se-hint">Obligation {formatCents(loan.obligationCents)} · outstanding {formatCents(loan.outstandingCents)} · overdue {formatCents(loan.overdueCents)} · late fees {formatCents(loan.lateFeesAssessedCents)} of {formatCents(loan.lateFeeCapCents)} · fee waived on payoff {formatCents(loan.contractFeeWaivedCents)}</p>
                  <div className="se-tablewrap">
                    <table className="se-table se-table--cards">
                      <thead><tr><th>#</th><th>Due</th><th className="se-table__number">Amount</th><th className="se-table__number">Owing</th><th>Status</th><th /></tr></thead>
                      <tbody>{loan.installments.map((row) => (
                        <tr key={row.sequence}>
                          <td className="se-td--title">{row.sequence}</td>
                          <td data-label="Due">{adminWhen(row.dueAt)}{row.missedAt ? ` · missed ${adminWhen(row.missedAt)}` : ''}</td>
                          <td className="se-table__number se-num" data-label="Amount">{formatCents(row.amountCents)}</td>
                          <td className="se-table__number se-num" data-label="Owing">{formatCents(row.remainingCents)}</td>
                          <td data-label="Status">{row.status.toLowerCase()}</td>
                          <td>{row.status === 'MISSED' && !detail.frozen ? (
                            <button type="button" className="se-linkbtn" onClick={() => setPending({ input: { kind: 'EXCUSE_MISS', installmentId: row.id }, label: correctionLabel('EXCUSE_MISS', `installment ${row.sequence} of ${loan.offerName}`) })}>Excuse miss</button>
                          ) : null}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              ))}

              <h3 className="se-admin-pad">Late fees</h3>
              <div className="se-tablewrap se-mb">
                <table className="se-table se-table--cards">
                  <thead><tr><th>Loan</th><th>Installment</th><th className="se-table__number">Charged</th><th className="se-table__number">Quoted</th><th className="se-table__number">Waived</th><th>When</th><th /></tr></thead>
                  <tbody>{detail.fees.length ? detail.fees.map((fee) => (
                    <tr key={fee.id}>
                      <td className="se-td--title">{fee.offerName}</td>
                      <td data-label="Installment">{fee.sequence ?? '—'}</td>
                      <td className="se-table__number se-num" data-label="Charged">{formatCents(fee.amountCents)}</td>
                      <td className="se-table__number se-num" data-label="Quoted">{formatCents(fee.quotedCents)}</td>
                      <td className="se-table__number se-num" data-label="Waived">{formatCents(fee.waivedCents)}</td>
                      <td data-label="When">{adminWhen(fee.createdAt)}</td>
                      <td>{!detail.frozen && fee.waivedCents < fee.amountCents ? (
                        <button type="button" className="se-linkbtn" onClick={() => setPending({ input: { kind: 'WAIVE_LATE_FEE', feeId: fee.id }, label: correctionLabel('WAIVE_LATE_FEE', `the ${formatCents(fee.amountCents)} late fee on ${fee.offerName}`) })}>Waive</button>
                      ) : null}</td>
                    </tr>
                  )) : empty(7, 'No late fees.')}</tbody>
                </table>
              </div>

              {pending ? (
                <form onSubmit={correct} className="se-admin-pad se-mb" noValidate>
                  <p><strong>{pending.label}.</strong> This forgives debt but never pays out cash, keeps the fee and the miss on record, and is saved to the audit log with your reason.</p>
                  <div className="se-field">
                    <label htmlFor="loan-correction-reason">Reason (the verified error)</label>
                    <textarea id="loan-correction-reason" className="se-input" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Button className="se-btn se-btn--primary" type="submit" disabled={busy} disabledReason={reason.trim().length < 3 ? 'Give a reason of at least 3 characters.' : null}>{busy ? 'Saving…' : 'Apply correction'}</Button>
                    <Button className="se-btn" type="button" onClick={() => { setPending(null); setReason(''); }} disabled={busy}>Cancel</Button>
                  </div>
                </form>
              ) : null}

              <h3 className="se-admin-pad">Payments</h3>
              <div className="se-tablewrap se-mb">
                <table className="se-table se-table--cards">
                  <thead><tr><th>Kind</th><th>Loan</th><th className="se-table__number">Paid</th><th>Split</th><th className="se-table__number">Owed after</th><th>When</th></tr></thead>
                  <tbody>{detail.payments.length ? detail.payments.map((row) => (
                    <tr key={row.id}>
                      <td className="se-td--title">{row.kind.toLowerCase()}</td>
                      <td data-label="Loan">{row.offerName}</td>
                      <td className="se-table__number se-num" data-label="Paid">{formatCents(row.paidCents)}</td>
                      <td data-label="Split">late {formatCents(row.lateFeeCents)} · fee {formatCents(row.contractFeeCents)} · principal {formatCents(row.principalCents)}{row.contractFeeWaivedCents ? ` · waived ${formatCents(row.contractFeeWaivedCents)}` : ''}</td>
                      <td className="se-table__number se-num" data-label="Owed after">{formatCents(row.debtAfterCents)}</td>
                      <td data-label="When">{adminWhen(row.createdAt)}</td>
                    </tr>
                  )) : empty(6, 'No payments.')}</tbody>
                </table>
              </div>

              <h3 className="se-admin-pad">Journal</h3>
              <ul className="se-admin-list se-admin-pad se-mb">{detail.journal.map((row) => (
                <li key={row.id}>{adminWhen(row.createdAt)} · {row.label}{row.debtDeltaCents ? ` · ${row.debtDeltaCents > 0 ? '+' : '−'}${formatCents(Math.abs(row.debtDeltaCents))}` : ''} · owed {formatCents(row.debtAfterCents)}</li>
              ))}</ul>

              <h3 className="se-admin-pad">Cash ledger</h3>
              <ul className="se-admin-list se-admin-pad">{detail.ledger.map((row) => (
                <li key={row.id}>{adminWhen(row.createdAt)} · {row.source} · {row.label} · {formatCents(row.amountCents)}</li>
              ))}</ul>
            </Panel>
          ) : null}

          <Panel title="Round journal" aside={`${report.journal.length} recent`} className="se-mb">
            {report.journal.length ? <ul className="se-admin-list se-admin-pad">{report.journal.map((row) => (
              <li key={row.id}>{adminWhen(row.createdAt)} · {row.player.displayName} · {row.label}{row.debtDeltaCents ? ` · ${row.debtDeltaCents > 0 ? '+' : '−'}${formatCents(Math.abs(row.debtDeltaCents))}` : ''}</li>
            ))}</ul> : <p className="se-admin-pad se-muted">Nothing has happened yet.</p>}
          </Panel>
        </>
      ) : null}
    </GameLayout>
  );
}
