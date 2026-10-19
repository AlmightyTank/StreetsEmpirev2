import { useCallback, useEffect, useState } from 'react';
import type { AdmissionStatusDto } from '@streets/shared';
import { admissionApi } from '../api/admission.js';
import { ADMISSION_REQUIRED_EVENT, ApiError } from '../api/client.js';

const POLL_MS = 5_000;

export function AdmissionGate() {
  const [status, setStatus] = useState<AdmissionStatusDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (join = false) => {
    try {
      setError(null);
      const next = join ? await admissionApi.join() : await admissionApi.status();
      setStatus(next);
      if (next.state === 'admitted' && status?.state === 'queued') window.location.reload();
    } catch (caught) {
      if (caught instanceof ApiError && caught.isUnauthenticated) return;
      setError(caught instanceof Error ? caught.message : 'Could not reach the waiting room.');
    }
  }, [status?.state]);

  useEffect(() => {
    const onRequired = () => { void refresh(true); };
    window.addEventListener(ADMISSION_REQUIRED_EVENT, onRequired);
    void refresh();
    return () => window.removeEventListener(ADMISSION_REQUIRED_EVENT, onRequired);
  }, [refresh]);

  useEffect(() => {
    if (status?.state !== 'queued') return;
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh, status?.state]);

  if (!status || status.state === 'disabled' || status.state === 'not-queued' || status.state === 'admitted') return null;

  async function leave() {
    setBusy(true);
    try {
      await admissionApi.leave();
      setStatus({ state: 'not-queued' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not leave the waiting room.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="se-admission-backdrop" role="dialog" aria-modal="true" aria-labelledby="admission-title">
      <section className="se-admission-card">
        <p className="se-eyebrow">Current round at capacity</p>
        <h1 id="admission-title">You’re in the waiting room</h1>
        <p className="se-muted">Your place is held by your account, so reconnecting or opening another device will not create another slot.</p>
        <div className="se-admission-status" role="status">
          <strong>Position {status.position}</strong>
          <span>{status.lane === 'SUPPORTER' ? 'Paid supporter priority lane' : 'Standard lane'}</span>
        </div>
        <p className="se-hint">Supporter priority affects admission only. It does not grant early round access or gameplay benefits.</p>
        {error ? <p className="se-form-error" role="alert">{error}</p> : null}
        <button type="button" className="se-btn" disabled={busy} onClick={() => void leave()}>{busy ? 'Leaving…' : 'Leave waiting room'}</button>
      </section>
    </div>
  );
}
