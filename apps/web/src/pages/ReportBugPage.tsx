import { useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { BUG_REPORT_CATEGORIES, BUG_REPORT_CATEGORY_LABELS, type BugReportCategory } from '@streets/shared';
import { authApi } from '../api/auth.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { InfoLayout } from '../layouts/InfoLayout.js';

/** rc.2. Report a bug to staff. It lands in Admin → Bug reports with the page and app version. */
export function ReportBugPage() {
  const location = useLocation();
  // The page they came from, when a link carried it here.
  const from = new URLSearchParams(location.search).get('from') ?? undefined;
  const [category, setCategory] = useState<BugReportCategory>('GAMEPLAY');
  const [summary, setSummary] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const response = await authApi.reportBug({ category, summary, details, ...(from ? { pagePath: from.slice(0, 200) } : {}) });
      setSent(response.message);
      setSummary('');
      setDetails('');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFields(caught.fields ?? {});
      } else {
        setError('Could not send that. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <InfoLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Report a bug</h1>
          <p className="se-eyebrow">Something broken, wrong or confusing? Tell staff.</p>
        </div>
      </div>
      {sent ? (
        <Panel title="Report sent">
          <p role="status">{sent}</p>
          <button type="button" className="se-btn se-btn--ghost" onClick={() => setSent(null)}>Report something else</button>
        </Panel>
      ) : (
        <Panel title="What went wrong?">
          <form onSubmit={submit} noValidate>
            <div className="se-field">
              <label className="se-label" htmlFor="bug-category">Kind of problem</label>
              <select id="bug-category" className="se-input" value={category} onChange={(event) => setCategory(event.target.value as BugReportCategory)}>
                {BUG_REPORT_CATEGORIES.map((key) => <option key={key} value={key}>{BUG_REPORT_CATEGORY_LABELS[key]}</option>)}
              </select>
            </div>
            <Field
              label="In a few words"
              name="summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={120}
              required
              error={fields.summary}
              hint="For example: Selling at Pip's took my cash but not the product."
            />
            <div className="se-field">
              <label className="se-label" htmlFor="bug-details">What happened</label>
              <textarea
                id="bug-details"
                className="se-input"
                rows={6}
                maxLength={4000}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                aria-describedby="bug-details-hint"
                aria-invalid={fields.details ? true : undefined}
              />
              {fields.details ? <p className="se-error">{fields.details}</p> : null}
              <p id="bug-details-hint" className="se-hint">What you did, what you expected, and what happened instead. Your pimp name, browser and the game version go with it.</p>
            </div>
            {error ? <Alert>{error}</Alert> : null}
            <Button className="se-btn se-btn--primary" disabledReason={busy ? 'Sending...' : null}>{busy ? 'Sending...' : 'Send report'}</Button>
          </form>
          <p className="se-hint se-mt">Cheating or abuse by another player? Use Report on their message or tell staff on Discord.</p>
        </Panel>
      )}
    </InfoLayout>
  );
}
