import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  SURVEY_DEFAULT_LONG_TEXT_MAX_LENGTH,
  SURVEY_DEFAULT_RATING_MAX,
  SURVEY_DEFAULT_RATING_MIN,
  SURVEY_DEFAULT_SHORT_TEXT_MAX_LENGTH,
  type SurveyDetailDto,
  type SurveyQuestionDto,
  type SurveySummaryDto,
} from '@streets/shared';
import { ApiError } from '../api/client.js';
import { SURVEYS_CHANGED_EVENT, surveysApi } from '../api/surveys.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { RewardChip, rewardText } from '../components/RewardChip.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { confirmAction } from '../stores/confirm.js';
import { useSession } from '../stores/session.js';
import { formatWhen } from '../utils/time.js';
import { newActionId } from '../utils/actionId.js';
import {
  surveyAnswersToForm,
  validateSurveyForm,
  type SurveyFormState,
  type SurveyFormValue,
} from '../utils/surveyForm.js';

type SurveyTab = 'available' | 'completed';

function rewardSummary(survey: Pick<SurveySummaryDto, 'rewards'>): string {
  return survey.rewards.length
    ? survey.rewards.map(rewardText).join(' · ')
    : 'No gameplay reward';
}

function SurveyRewards({ survey }: { survey: Pick<SurveySummaryDto, 'rewards'> }) {
  if (!survey.rewards.length) return <span className="se-survey-no-reward">Feedback only</span>;
  return (
    <div className="se-survey-rewards" aria-label="Completion reward">
      {survey.rewards.map((reward, index) => (
        <RewardChip key={`${reward.kind}:${reward.key ?? index}`} reward={reward} />
      ))}
    </div>
  );
}

function SurveyCard({
  survey,
  completed,
  onOpen,
}: {
  survey: SurveySummaryDto;
  completed: boolean;
  onOpen: () => void;
}) {
  return (
    <article className={`se-survey-card${completed ? ' se-survey-card--completed' : ''}`}>
      <div className="se-survey-card__top">
        <div>
          <div className="se-survey-tags">
            {survey.releaseTag ? <span>{survey.releaseTag}</span> : null}
            {survey.featureTag ? <span>{survey.featureTag}</span> : null}
            {!survey.releaseTag && !survey.featureTag ? <span>Player feedback</span> : null}
          </div>
          <h3>{survey.title}</h3>
        </div>
        <span className={`se-survey-state${completed ? ' se-survey-state--done' : ''}`}>
          {completed ? 'Completed' : 'Available'}
        </span>
      </div>

      <p className="se-survey-card__description">{survey.description}</p>

      <div className="se-survey-card__meta">
        <span>{survey.questionCount} question{survey.questionCount === 1 ? '' : 's'}</span>
        {survey.endsAt && !completed ? <span>Closes {formatWhen(survey.endsAt)}</span> : null}
        {completed && survey.completion ? <span>Submitted {formatWhen(survey.completion.submittedAt)}</span> : null}
      </div>

      <div className="se-survey-card__reward">
        <small>{completed ? 'Reward received' : 'Completion reward'}</small>
        <SurveyRewards survey={survey} />
      </div>

      <button type="button" className="se-btn se-btn--primary se-btn--sm" onClick={onOpen}>
        {completed ? 'View response' : 'Start survey'}
      </button>
    </article>
  );
}

function QuestionInput({
  question,
  value,
  error,
  disabled,
  onChange,
}: {
  question: SurveyQuestionDto;
  value: SurveyFormValue;
  error?: string;
  disabled: boolean;
  onChange: (value: SurveyFormValue) => void;
}) {
  const errorId = `survey-error-${question.id}`;
  const describedBy = [question.description ? `survey-help-${question.id}` : '', error ? errorId : '']
    .filter(Boolean)
    .join(' ') || undefined;
  const selected = Array.isArray(value) ? value : [];
  const ratingMin = question.ratingMin ?? SURVEY_DEFAULT_RATING_MIN;
  const ratingMax = question.ratingMax ?? SURVEY_DEFAULT_RATING_MAX;
  const textMax = question.maxLength ?? (
    question.type === 'SHORT_TEXT'
      ? SURVEY_DEFAULT_SHORT_TEXT_MAX_LENGTH
      : SURVEY_DEFAULT_LONG_TEXT_MAX_LENGTH
  );

  const label = (
    <span className="se-survey-question__legend">
      <span>{question.position}. {question.prompt}</span>
      <span className={question.required ? 'se-survey-required' : 'se-survey-optional'}>
        {question.required ? 'Required' : 'Optional'}
      </span>
    </span>
  );

  return (
    <fieldset
      className={`se-survey-question${error ? ' se-survey-question--error' : ''}`}
      aria-describedby={describedBy}
      disabled={disabled}
    >
      <legend>{label}</legend>
      {question.description ? (
        <p id={`survey-help-${question.id}`} className="se-survey-question__help">{question.description}</p>
      ) : null}

      {question.type === 'YES_NO' ? (
        <div className="se-survey-choicegrid se-survey-choicegrid--two">
          {[
            ['Yes', true],
            ['No', false],
          ].map(([text, option]) => (
            <label key={String(option)} className="se-survey-choice">
              <input
                type="radio"
                name={`survey-${question.id}`}
                checked={value === option}
                onChange={() => onChange(option as boolean)}
              />
              <span>{text}</span>
            </label>
          ))}
        </div>
      ) : null}

      {question.type === 'SINGLE_CHOICE' ? (
        <div className="se-survey-choicegrid">
          {question.options.map((option) => (
            <label key={option.id} className="se-survey-choice">
              <input
                type="radio"
                name={`survey-${question.id}`}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}

      {question.type === 'MULTIPLE_CHOICE' ? (
        <div className="se-survey-choicegrid">
          {question.options.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label key={option.id} className="se-survey-choice">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? selected.filter((entry) => entry !== option.value)
                      : [...selected, option.value];
                    onChange(next);
                  }}
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      ) : null}

      {question.type === 'RATING' ? (
        <div className="se-survey-rating" role="radiogroup" aria-label={question.prompt}>
          {Array.from({ length: Math.max(0, ratingMax - ratingMin + 1) }, (_, index) => ratingMin + index).map((rating) => (
            <label key={rating} className="se-survey-rating__option">
              <input
                type="radio"
                name={`survey-${question.id}`}
                checked={value === rating}
                onChange={() => onChange(rating)}
              />
              <span>{rating}</span>
            </label>
          ))}
        </div>
      ) : null}

      {question.type === 'SHORT_TEXT' ? (
        <div className="se-survey-text">
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            maxLength={textMax}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Type your answer..."
          />
          <small>{typeof value === 'string' ? value.length : 0} / {textMax}</small>
        </div>
      ) : null}

      {question.type === 'LONG_TEXT' ? (
        <div className="se-survey-text">
          <textarea
            value={typeof value === 'string' ? value : ''}
            maxLength={textMax}
            rows={5}
            aria-invalid={Boolean(error)}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Tell us what worked, what did not, or what you would change..."
          />
          <small>{typeof value === 'string' ? value.length : 0} / {textMax}</small>
        </div>
      ) : null}

      {error ? <p id={errorId} className="se-survey-question__error">{error}</p> : null}
    </fieldset>
  );
}

export function SurveysPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get('survey');
  const tab: SurveyTab = searchParams.get('tab') === 'completed' ? 'completed' : 'available';

  const [page, setPage] = useState<Awaited<ReturnType<typeof surveysApi.page>> | null>(null);
  const [detail, setDetail] = useState<SurveyDetailDto | null>(null);
  const [answers, setAnswers] = useState<SurveyFormState>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pendingActionId = useRef<string | null>(null);

  const refreshSnapshot = useSession((state) => state.refreshSnapshot);

  const loadPage = useCallback(async () => {
    try {
      const next = await surveysApi.page();
      setPage(next);
      setLoadError(null);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Could not load surveys right now.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPage();
    const refresh = () => void loadPage();
    window.addEventListener('focus', refresh);
    window.addEventListener(SURVEYS_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener(SURVEYS_CHANGED_EVENT, refresh);
    };
  }, [loadPage]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setAnswers({});
      setSubmitError(null);
      setFieldErrors({});
      setUncertain(false);
      pendingActionId.current = null;
      return;
    }

    let live = true;
    setDetailLoading(true);
    setSubmitError(null);
    setFieldErrors({});
    void surveysApi.detail(selectedId)
      .then((next) => {
        if (!live) return;
        setDetail(next);
        setAnswers(surveyAnswersToForm(next.answers));
        setLoadError(null);
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setDetail(null);
        setLoadError(cause instanceof Error ? cause.message : 'Could not open that survey.');
      })
      .finally(() => { if (live) setDetailLoading(false); });

    return () => { live = false; };
  }, [selectedId]);

  const shown = useMemo(
    () => tab === 'completed' ? page?.completed ?? [] : page?.available ?? [],
    [page, tab],
  );

  function selectTab(next: SurveyTab) {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    params.delete('survey');
    setSearchParams(params);
    setNotice(null);
  }

  function openSurvey(survey: SurveySummaryDto, targetTab: SurveyTab) {
    const params = new URLSearchParams(searchParams);
    params.set('tab', targetTab);
    params.set('survey', survey.id);
    setSearchParams(params);
    setNotice(null);
  }

  function closeSurvey() {
    const params = new URLSearchParams(searchParams);
    params.delete('survey');
    setSearchParams(params);
    setNotice(null);
  }

  function changeAnswer(questionId: string, value: SurveyFormValue) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
    setFieldErrors((current) => {
      if (!(questionId in current)) return current;
      const next = { ...current };
      delete next[questionId];
      return next;
    });
    setSubmitError(null);
  }

  async function moveToCompleted(surveyId: string) {
    await loadPage();
    const completedDetail = await surveysApi.detail(surveyId);
    setDetail(completedDetail);
    setAnswers(surveyAnswersToForm(completedDetail.answers));
    const params = new URLSearchParams(searchParams);
    params.set('tab', 'completed');
    params.set('survey', surveyId);
    setSearchParams(params);
  }

  async function submitSurvey() {
    if (!detail || detail.completion) return;

    const validation = validateSurveyForm(detail.questions, answers);
    if (Object.keys(validation.fields).length) {
      setFieldErrors(validation.fields);
      setSubmitError('Check the highlighted questions before submitting.');
      const first = detail.questions.find((question) => validation.fields[question.id]);
      if (first) {
        window.requestAnimationFrame(() =>
          document.querySelector<HTMLElement>(`[data-survey-question="${first.id}"]`)?.scrollIntoView({ block: 'center' }));
      }
      return;
    }

    if (!uncertain) {
      const confirmed = await confirmAction({
        title: 'Submit this survey?',
        body: `Your answers are final after submission. The reward is for completion only: ${rewardSummary(detail)}.`,
        confirmLabel: 'Submit survey',
      });
      if (!confirmed) return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setFieldErrors({});
    const actionId = pendingActionId.current ?? newActionId();
    pendingActionId.current = actionId;

    try {
      const result = await surveysApi.submit(detail.id, { actionId, answers: validation.answers });
      pendingActionId.current = null;
      setUncertain(false);
      setNotice(`Survey complete — ${result.result.rewards.length ? result.result.rewards.map(rewardText).join(' · ') : 'thank you for the feedback'}.`);
      window.dispatchEvent(new Event(SURVEYS_CHANGED_EVENT));
      await Promise.allSettled([refreshSnapshot(), moveToCompleted(detail.id)]);
    } catch (cause) {
      if (cause instanceof ApiError) {
        if (cause.code === 'SURVEY_ALREADY_COMPLETED') {
          pendingActionId.current = null;
          setUncertain(false);
          setNotice('This survey is already complete.');
          await moveToCompleted(detail.id).catch(() => undefined);
          return;
        }
        setSubmitError(cause.message);
        setFieldErrors(cause.fields ?? {});
        if (cause.isUncertain) {
          setUncertain(true);
        } else {
          pendingActionId.current = null;
          setUncertain(false);
        }
      } else {
        setSubmitError('The server response is uncertain. Retry this exact submission before changing your answers.');
        setUncertain(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const completed = detail?.completion !== null && detail?.completion !== undefined;
  const formLocked = submitting || uncertain || completed;

  return (
    <GameLayout>
      <div className="se-surveys">
        <header className="se-surveys-hero">
          <div className="se-surveys-hero__copy">
            <span className="se-eyebrow">Help shape StreetsEmpire</span>
            <h1>Player Surveys</h1>
            <p>Tell us how the latest changes feel. Rewards are based only on completing the survey — never on whether your feedback is positive or negative.</p>
          </div>
          <div className="se-surveys-hero__stats">
            <span><small>Available</small><strong>{page?.available.length ?? '—'}</strong></span>
            <span><small>Completed</small><strong>{page?.completed.length ?? '—'}</strong></span>
            <span><small>Reward rule</small><strong>Completion only</strong></span>
          </div>
        </header>

        {loadError ? <Alert>{loadError}</Alert> : null}
        {notice ? <Alert tone="success">{notice}</Alert> : null}

        <div className="se-survey-tabs" role="tablist" aria-label="Survey view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'available'}
            className={tab === 'available' ? 'se-survey-tab se-survey-tab--active' : 'se-survey-tab'}
            onClick={() => selectTab('available')}
          >
            Available <span>{page?.available.length ?? 0}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'completed'}
            className={tab === 'completed' ? 'se-survey-tab se-survey-tab--active' : 'se-survey-tab'}
            onClick={() => selectTab('completed')}
          >
            Completed <span>{page?.completed.length ?? 0}</span>
          </button>
        </div>

        {loading ? (
          <div className="se-survey-empty"><strong>Loading surveys...</strong><span>Checking the feedback board.</span></div>
        ) : null}

        {!loading && !shown.length ? (
          <div className="se-survey-empty">
            <strong>{tab === 'available' ? 'No surveys waiting right now.' : 'No completed surveys yet.'}</strong>
            <span>{tab === 'available' ? 'New surveys will appear here when there is a change we want feedback on.' : 'Completed surveys and their rewards will stay here for your records.'}</span>
          </div>
        ) : null}

        {!selectedId && shown.length ? (
          <section className="se-survey-grid" aria-label={tab === 'available' ? 'Available surveys' : 'Completed surveys'}>
            {shown.map((survey) => (
              <SurveyCard
                key={survey.id}
                survey={survey}
                completed={tab === 'completed'}
                onOpen={() => openSurvey(survey, tab)}
              />
            ))}
          </section>
        ) : null}

        {selectedId && detailLoading ? (
          <div className="se-survey-empty"><strong>Opening survey...</strong><span>Loading the questions and reward.</span></div>
        ) : null}

        {selectedId && detail ? (
          <section className="se-survey-sheet" aria-labelledby="survey-detail-title">
            <div className="se-survey-sheet__head">
              <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={closeSurvey}>← Back to surveys</button>
              <div className="se-survey-tags">
                {detail.releaseTag ? <span>{detail.releaseTag}</span> : null}
                {detail.featureTag ? <span>{detail.featureTag}</span> : null}
              </div>
              <h2 id="survey-detail-title">{detail.title}</h2>
              <p>{detail.description}</p>
              <div className="se-survey-sheet__meta">
                <span>{detail.questionCount} question{detail.questionCount === 1 ? '' : 's'}</span>
                {detail.endsAt && !completed ? <span>Closes {formatWhen(detail.endsAt)}</span> : null}
                {completed && detail.completion ? <span>Submitted {formatWhen(detail.completion.submittedAt)}</span> : null}
              </div>
            </div>

            <div className="se-survey-payout">
              <div>
                <small>{completed ? 'Reward received' : 'Completion reward'}</small>
                <strong>{completed ? 'Paid for completing the survey' : 'Paid after a valid submission'}</strong>
              </div>
              <SurveyRewards survey={detail} />
            </div>

            {completed ? (
              <Alert tone="success">
                Completed. These are your saved answers and the exact reward snapshot from your submission.
              </Alert>
            ) : (
              <Alert tone="info">
                Be candid. Positive and negative answers earn the same reward. Required questions only need a structurally valid answer.
              </Alert>
            )}

            {submitError ? <Alert tone={uncertain ? 'warning' : 'error'}>{submitError}</Alert> : null}
            {uncertain ? (
              <Alert tone="warning">
                The last response may have been lost after the server received it. Your answers are locked for safety; retry the same submission to confirm the result without double-paying.
              </Alert>
            ) : null}

            <form className="se-survey-form" onSubmit={(event) => { event.preventDefault(); void submitSurvey(); }}>
              {detail.questions.map((question) => (
                <div key={question.id} data-survey-question={question.id}>
                  <QuestionInput
                    question={question}
                    value={answers[question.id]}
                    error={fieldErrors[question.id]}
                    disabled={formLocked}
                    onChange={(value) => changeAnswer(question.id, value)}
                  />
                </div>
              ))}

              {!completed ? (
                <div className="se-survey-submit">
                  <div>
                    <strong>{uncertain ? 'Confirm this exact submission' : 'Ready to send it?'}</strong>
                    <span>Your answers cannot be edited after the survey is accepted.</span>
                  </div>
                  <Button
                    type="submit"
                    className="se-btn se-btn--primary"
                    disabledReason={submitting ? 'Your survey is being submitted.' : null}
                  >
                    {submitting ? 'Submitting...' : uncertain ? 'Retry submission' : 'Submit survey'}
                  </Button>
                </div>
              ) : null}
            </form>
          </section>
        ) : null}
      </div>
    </GameLayout>
  );
}
