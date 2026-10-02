import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AdminSurveyQuestionResultDto, AdminSurveyResultsDto } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from './Alert.js';
import { Button } from './Button.js';
import { Panel, Stat } from './Panel.js';
import { adminWhen } from '../utils/admin.js';

function percent(value: number): string {
  return `${value.toFixed(value % 1 === 0 ? 0 : 1)}%`;
}

function QuestionResult({ question }: { question: AdminSurveyQuestionResultDto }) {
  const aggregate = question.aggregate;
  return (
    <section className="se-admin-survey-result-question">
      <header>
        <div>
          <span className="se-eyebrow">Question {question.position} · {question.type.replace(/_/g, ' ')}</span>
          <h3>{question.prompt}</h3>
        </div>
        <span className="se-tag">{question.answered} answered · {question.skipped} skipped</span>
      </header>

      {aggregate.kind === 'YES_NO' ? (
        <div className="se-admin-survey-distribution">
          {[
            { label: 'Yes', count: aggregate.yes, value: aggregate.yesPercent },
            { label: 'No', count: aggregate.no, value: aggregate.noPercent },
          ].map((row) => (
            <div className="se-admin-survey-distrow" key={row.label}>
              <div><strong>{row.label}</strong><span>{row.count} · {percent(row.value)}</span></div>
              <div className="se-admin-survey-bar"><span style={{ width: `${Math.min(100, row.value)}%` }} /></div>
            </div>
          ))}
        </div>
      ) : aggregate.kind === 'CHOICE' ? (
        <>
          {aggregate.multiple ? <p className="se-hint">Multi-select percentages use respondents who answered this question, so totals can exceed 100%.</p> : null}
          <div className="se-admin-survey-distribution">
            {aggregate.options.map((option) => (
              <div className="se-admin-survey-distrow" key={option.value}>
                <div><strong>{option.label}</strong><span>{option.count} · {percent(option.percent)}</span></div>
                <div className="se-admin-survey-bar"><span style={{ width: `${Math.min(100, option.percent)}%` }} /></div>
              </div>
            ))}
          </div>
        </>
      ) : aggregate.kind === 'RATING' ? (
        <>
          <div className="se-admin-survey-result-average">
            <strong>{aggregate.average === null ? '—' : aggregate.average.toFixed(2)}</strong>
            <span>average · scale {aggregate.min}–{aggregate.max}</span>
          </div>
          <div className="se-admin-survey-distribution">
            {aggregate.buckets.map((bucket) => (
              <div className="se-admin-survey-distrow" key={bucket.value}>
                <div><strong>{bucket.label}</strong><span>{bucket.count} · {percent(bucket.percent)}</span></div>
                <div className="se-admin-survey-bar"><span style={{ width: `${Math.min(100, bucket.percent)}%` }} /></div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="se-admin-survey-textcount">{aggregate.responseCount} written response{aggregate.responseCount === 1 ? '' : 's'}.</p>
      )}
    </section>
  );
}

export function AdminSurveyResultsPanel({ surveyId, onBack }: { surveyId: string; onBack: () => void }) {
  const [data, setData] = useState<AdminSurveyResultsDto | null>(null);
  const [draftQuery, setDraftQuery] = useState('');
  const [query, setQuery] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adminApi.surveyResults(surveyId, {
        q: query || undefined,
        questionId: questionId || undefined,
        page,
        pageSize: 25,
      }));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load survey results.');
    } finally {
      setLoading(false);
    }
  }, [page, query, questionId, surveyId]);

  useEffect(() => { void load(); }, [load]);

  const textQuestions = useMemo(
    () => (data?.questions ?? []).filter((question) => question.aggregate.kind === 'TEXT'),
    [data],
  );
  const maxDay = Math.max(1, ...(data?.completionTrend.map((row) => row.count) ?? [1]));

  function applySearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setQuery(draftQuery.trim());
  }

  return (
    <div className="se-admin-survey-results">
      <div className="se-pagehead se-pagehead--compact">
        <div>
          <h2 className="se-title">{data?.survey.title ?? 'Survey results'}</h2>
          <p className="se-eyebrow">Results · anonymous player feedback</p>
        </div>
        <Button type="button" className="se-btn se-btn--ghost" onClick={onBack}>Back to survey</Button>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <div className="se-stats se-mb">
        <Stat label="Eligible players" value={data ? data.overview.eligibleAccounts.toLocaleString() : '—'} />
        <Stat label="Responses" value={data ? data.overview.submissions.toLocaleString() : '—'} />
        <Stat label="Response rate" value={data ? percent(data.overview.responseRate) : '—'} />
        <Stat label="Rewards granted" value={data ? data.overview.rewardsGranted.toLocaleString() : '—'} />
      </div>

      {data ? (
        <Panel title="Survey scope" className="se-mb">
          <div className="se-admin-survey-result-meta">
            <span><strong>Status</strong>{data.survey.status}</span>
            <span><strong>Round</strong>{data.survey.roundName ?? 'Global'}</span>
            <span><strong>Release</strong>{data.survey.releaseTag ?? '—'}</span>
            <span><strong>Feature</strong>{data.survey.featureTag ?? '—'}</span>
            <span><strong>First response</strong>{data.overview.firstSubmittedAt ? adminWhen(data.overview.firstSubmittedAt) : '—'}</span>
            <span><strong>Latest response</strong>{data.overview.lastSubmittedAt ? adminWhen(data.overview.lastSubmittedAt) : '—'}</span>
          </div>
          <p className="se-hint se-mt">Eligible-player counts are based on player records that existed while the survey was live. Results never expose usernames, account IDs, pimp IDs or round-player IDs.</p>
        </Panel>
      ) : null}

      <Panel title="Completion trend" aside={data ? `${data.overview.submissions} total` : undefined} className="se-mb">
        {loading && !data ? <p className="se-muted">Loading trend...</p> : !data?.completionTrend.length ? (
          <p className="se-muted">No completions yet.</p>
        ) : (
          <div className="se-admin-survey-trend">
            {data.completionTrend.map((row) => (
              <div className="se-admin-survey-trendrow" key={row.date}>
                <span>{row.date}</span>
                <div className="se-admin-survey-bar"><span style={{ width: `${(row.count / maxDay) * 100}%` }} /></div>
                <strong>{row.count}</strong>
                <small>{row.cumulative} total</small>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Question results" aside={data ? `${data.questions.length} questions` : undefined} className="se-mb" flush>
        {loading && !data ? <p className="se-muted se-admin-pad">Loading question results...</p> : (
          <div className="se-admin-survey-result-questions">
            {(data?.questions ?? []).map((question) => <QuestionResult key={question.id} question={question} />)}
          </div>
        )}
      </Panel>

      <Panel title="Written responses" aside={data ? `${data.textResponses.total} matching` : undefined}>
        <form className="se-admin-survey-result-search" onSubmit={applySearch}>
          <div className="se-field">
            <label className="se-label" htmlFor="survey-result-question">Question</label>
            <select
              id="survey-result-question"
              className="se-input"
              value={questionId}
              onChange={(event) => { setQuestionId(event.target.value); setPage(1); }}
            >
              <option value="">All written questions</option>
              {textQuestions.map((question) => <option key={question.id} value={question.id}>{question.position}. {question.prompt}</option>)}
            </select>
          </div>
          <div className="se-field">
            <label className="se-label" htmlFor="survey-result-search">Search response text</label>
            <input
              id="survey-result-search"
              className="se-input"
              maxLength={120}
              value={draftQuery}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder="e.g. voucher, spacing, mobile"
            />
          </div>
          <Button className="se-btn se-btn--primary" disabledReason={loading ? 'Results are loading.' : null}>Search</Button>
          {(query || questionId) ? (
            <Button type="button" className="se-btn se-btn--ghost" onClick={() => {
              setDraftQuery('');
              setQuery('');
              setQuestionId('');
              setPage(1);
            }}>Clear</Button>
          ) : null}
        </form>

        {!data?.textResponses.responses.length ? (
          <p className="se-muted se-mt">{loading ? 'Loading written responses...' : 'No written responses match these filters.'}</p>
        ) : (
          <div className="se-admin-survey-textresponses se-mt">
            {data.textResponses.responses.map((response) => (
              <article key={`${response.responseNumber}:${response.questionId}`} className="se-admin-survey-textresponse">
                <header>
                  <strong>Response #{response.responseNumber}</strong>
                  <span>{adminWhen(response.submittedAt)}</span>
                </header>
                <small>{response.prompt}</small>
                <p>{response.value}</p>
              </article>
            ))}
          </div>
        )}

        {data && data.textResponses.totalPages > 1 ? (
          <div className="se-admin-survey-pagination">
            <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabledReason={data.textResponses.page <= 1 ? 'Already on the first page.' : loading ? 'Results are loading.' : null}>Previous</Button>
            <span>Page {data.textResponses.page} of {data.textResponses.totalPages}</span>
            <Button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setPage((value) => Math.min(data.textResponses.totalPages, value + 1))}
              disabledReason={data.textResponses.page >= data.textResponses.totalPages ? 'Already on the last page.' : loading ? 'Results are loading.' : null}>Next</Button>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
