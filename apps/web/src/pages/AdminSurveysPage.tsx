import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  AdminSurveyDefinitionInput,
  AdminSurveyDetailDto,
  AdminSurveyQuestionInput,
  AdminSurveyRewardInput,
  AdminSurveysDto,
  SurveyQuestionTypeDto,
  SurveyStatusDto,
} from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { confirmAction } from '../stores/confirm.js';
import { adminWhen } from '../utils/admin.js';

type AdminTab = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'CLOSED';

interface EditorState {
  id: string | null;
  title: string;
  description: string;
  releaseTag: string;
  featureTag: string;
  roundId: string;
  startsAt: string;
  endsAt: string;
  rewards: AdminSurveyRewardInput[];
  questions: AdminSurveyQuestionInput[];
  status: SurveyStatusDto;
}

const QUESTION_LABELS: Record<SurveyQuestionTypeDto, string> = {
  YES_NO: 'Yes / No',
  SINGLE_CHOICE: 'Single choice',
  MULTIPLE_CHOICE: 'Multiple choice',
  RATING: 'Rating',
  SHORT_TEXT: 'Short text',
  LONG_TEXT: 'Long text',
};

const REWARD_KINDS: AdminSurveyRewardInput['kind'][] = [
  'CASH',
  'TURNS',
  'ITEM',
  'CONTACT_REP',
  'PRODUCT',
  'FAVOR_ITEM',
  'PERMANENT_UNLOCK',
  'WEAPON_ACCESS',
  'COSMETIC_UNLOCK',
];

const AMOUNT_REWARDS = new Set<AdminSurveyRewardInput['kind']>([
  'CASH', 'TURNS', 'ITEM', 'CONTACT_REP', 'PRODUCT', 'FAVOR_ITEM',
]);

const KEY_REWARDS = new Set<AdminSurveyRewardInput['kind']>([
  'ITEM', 'CONTACT_REP', 'PRODUCT', 'FAVOR_ITEM', 'PERMANENT_UNLOCK', 'WEAPON_ACCESS', 'COSMETIC_UNLOCK',
]);

function emptyQuestion(type: SurveyQuestionTypeDto = 'YES_NO'): AdminSurveyQuestionInput {
  return {
    type,
    prompt: '',
    description: null,
    required: true,
    minLength: type === 'SHORT_TEXT' || type === 'LONG_TEXT' ? 3 : null,
    maxLength: type === 'SHORT_TEXT' ? 500 : type === 'LONG_TEXT' ? 5000 : null,
    ratingMin: type === 'RATING' ? 1 : null,
    ratingMax: type === 'RATING' ? 5 : null,
    options: type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE'
      ? [{ value: 'OPTION_A', label: 'Option A' }, { value: 'OPTION_B', label: 'Option B' }]
      : [],
  };
}

function blankEditor(): EditorState {
  return {
    id: null,
    title: '',
    description: '',
    releaseTag: '',
    featureTag: '',
    roundId: '',
    startsAt: '',
    endsAt: '',
    rewards: [],
    questions: [emptyQuestion()],
    status: 'DRAFT',
  };
}

function localDateTime(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function iso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function editorFromDetail(detail: AdminSurveyDetailDto): EditorState {
  return {
    id: detail.id,
    title: detail.title,
    description: detail.description,
    releaseTag: detail.releaseTag ?? '',
    featureTag: detail.featureTag ?? '',
    roundId: detail.roundId ?? '',
    startsAt: localDateTime(detail.startsAt),
    endsAt: localDateTime(detail.endsAt),
    rewards: detail.rewards.map((reward) => ({ ...reward })),
    questions: detail.questions.map((question) => ({
      type: question.type,
      prompt: question.prompt,
      description: question.description,
      required: question.required,
      minLength: question.minLength,
      maxLength: question.maxLength,
      ratingMin: question.ratingMin,
      ratingMax: question.ratingMax,
      options: question.options.map((option) => ({ value: option.value, label: option.label })),
    })),
    status: detail.status,
  };
}

function definitionFromEditor(editor: EditorState): AdminSurveyDefinitionInput {
  return {
    title: editor.title.trim(),
    description: editor.description.trim(),
    releaseTag: editor.releaseTag.trim() || null,
    featureTag: editor.featureTag.trim() || null,
    roundId: editor.roundId || null,
    startsAt: iso(editor.startsAt),
    endsAt: iso(editor.endsAt),
    rewards: editor.rewards.map((reward) => ({
      kind: reward.kind,
      ...(reward.amount !== undefined ? { amount: reward.amount } : {}),
      ...(reward.key?.trim() ? { key: reward.key.trim() } : {}),
    })),
    questions: editor.questions.map((question) => ({
      ...question,
      prompt: question.prompt.trim(),
      description: question.description?.trim() || null,
      options: question.options.map((option) => ({
        value: option.value.trim(),
        label: option.label.trim(),
      })),
    })),
  };
}

function move<T>(rows: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

function statusText(status: SurveyStatusDto): string {
  return status === 'DRAFT' ? 'Draft'
    : status === 'SCHEDULED' ? 'Scheduled'
      : status === 'LIVE' ? 'Live'
        : 'Closed';
}

export function AdminSurveysPage() {
  const [data, setData] = useState<AdminSurveysDto | null>(null);
  const [tab, setTab] = useState<AdminTab>('DRAFT');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await adminApi.surveys());
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load surveys.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(
    () => (data?.surveys ?? []).filter((survey) => survey.status === tab),
    [data, tab],
  );

  async function open(id: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setEditor(editorFromDetail(await adminApi.survey(id)));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not open that survey.');
    } finally {
      setBusy(false);
    }
  }

  function startNew() {
    setEditor(blankEditor());
    setTab('DRAFT');
    setError(null);
    setNotice(null);
    setClosing(false);
    setCloseReason('');
  }

  function updateQuestion(index: number, patch: Partial<AdminSurveyQuestionInput>) {
    setEditor((current) => current ? {
      ...current,
      questions: current.questions.map((question, i) => i === index ? { ...question, ...patch } : question),
    } : current);
  }

  function changeQuestionType(index: number, type: SurveyQuestionTypeDto) {
    const current = editor?.questions[index];
    if (!current) return;
    const defaults = emptyQuestion(type);
    updateQuestion(index, {
      type,
      options: defaults.options,
      minLength: defaults.minLength,
      maxLength: defaults.maxLength,
      ratingMin: defaults.ratingMin,
      ratingMax: defaults.ratingMax,
    });
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!editor) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input = definitionFromEditor(editor);
      const saved = editor.id
        ? await adminApi.updateSurvey(editor.id, input)
        : await adminApi.createSurvey(input);
      setEditor(editorFromDetail(saved));
      setNotice(editor.id ? 'Survey changes saved.' : 'Survey draft created.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The survey could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!editor?.id) {
      setError('Save the draft before publishing it.');
      return;
    }
    const scheduled = Boolean(editor.startsAt && new Date(editor.startsAt).getTime() > Date.now());
    const ok = await confirmAction({
      title: scheduled ? 'Schedule this survey?' : 'Publish this survey?',
      body: scheduled
        ? 'The survey will become live automatically at its start time. Once live, its questions and rewards are locked.'
        : 'Players can see and complete it immediately. Questions and rewards lock once it is live.',
      confirmLabel: scheduled ? 'Schedule survey' : 'Publish survey',
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const saved = await adminApi.publishSurvey(editor.id);
      setEditor(editorFromDetail(saved));
      setTab(saved.status === 'SCHEDULED' ? 'SCHEDULED' : 'LIVE');
      setNotice(saved.status === 'SCHEDULED'
        ? `Survey scheduled for ${adminWhen(saved.startsAt)}.`
        : 'Survey is live. Players will receive its announcement through the notification collector.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The survey could not be published.');
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!editor?.id) return;
    const reason = closeReason.trim();
    if (reason.length < 5) {
      setError('Write a close reason of at least 5 characters.');
      return;
    }
    const ok = await confirmAction({
      title: 'Close this survey?',
      body: 'Players will no longer be able to submit it. Completed responses stay in history.',
      confirmLabel: 'Close survey',
      tone: 'danger',
    });
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const saved = await adminApi.closeSurvey(editor.id, reason);
      setEditor(editorFromDetail(saved));
      setTab('CLOSED');
      setNotice('Survey closed.');
      setClosing(false);
      setCloseReason('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The survey could not be closed.');
    } finally {
      setBusy(false);
    }
  }

  const editable = editor ? editor.status === 'DRAFT' || editor.status === 'SCHEDULED' : false;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Surveys</h1>
          <p className="se-eyebrow">Admin · feedback builder, rewards, schedules and publishing</p>
        </div>
        <Button type="button" className="se-btn se-btn--primary" onClick={startNew} disabledReason={busy ? 'Another survey action is still running.' : null}>
          New survey
        </Button>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <div className="se-survey-tabs se-mb" role="tablist" aria-label="Admin survey status">
        {(['DRAFT', 'SCHEDULED', 'LIVE', 'CLOSED'] as const).map((status) => {
          const count = data?.surveys.filter((survey) => survey.status === status).length ?? 0;
          return (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={tab === status}
              className={tab === status ? 'se-survey-tab se-survey-tab--active' : 'se-survey-tab'}
              onClick={() => { setTab(status); setEditor(null); }}
            >
              {statusText(status)} <span>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="se-admin-survey-layout">
        <Panel title={statusText(tab)} aside={`${rows.length} survey${rows.length === 1 ? '' : 's'}`} flush>
          {!data ? (
            <p className="se-muted se-admin-pad">Loading surveys...</p>
          ) : !rows.length ? (
            <p className="se-muted se-admin-pad">No {statusText(tab).toLowerCase()} surveys.</p>
          ) : (
            <div className="se-admin-survey-list">
              {rows.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  className={`se-admin-survey-row${editor?.id === row.id ? ' se-admin-survey-row--active' : ''}`}
                  onClick={() => void open(row.id)}
                  disabled={busy}
                >
                  <span>
                    <strong>{row.title}</strong>
                    <small>{row.releaseTag ?? row.featureTag ?? 'Player feedback'} · {row.questionCount} questions</small>
                  </span>
                  <span>
                    <small>{row.roundName ?? 'Global'}</small>
                    <small>{row.submissionCount} response{row.submissionCount === 1 ? '' : 's'}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <div className="se-admin-survey-editor">
          {!editor ? (
            <Panel title="Survey editor">
              <p className="se-muted">Choose a survey or create a new one. Drafts can be edited freely; live surveys are locked.</p>
            </Panel>
          ) : (
            <form onSubmit={(event) => void save(event)}>
              <Panel title={editor.id ? editor.title || 'Untitled survey' : 'New survey'} aside={statusText(editor.status)} className="se-mb">
                <div className="se-admin-filters">
                  <div className="se-field">
                    <label className="se-label" htmlFor="survey-title">Title</label>
                    <input id="survey-title" className="se-input" maxLength={160} value={editor.title}
                      disabled={!editable} onChange={(event) => setEditor({ ...editor, title: event.target.value })} />
                  </div>
                  <div className="se-field">
                    <label className="se-label" htmlFor="survey-round">Target round</label>
                    <select id="survey-round" className="se-input" value={editor.roundId} disabled={!editable}
                      onChange={(event) => setEditor({ ...editor, roundId: event.target.value })}>
                      <option value="">Global / current round</option>
                      {(data?.rounds ?? []).map((round) => (
                        <option key={round.id} value={round.id}>{round.name} · {round.status} · {round.rulesetVersion}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="se-field">
                  <label className="se-label" htmlFor="survey-description">Description</label>
                  <textarea id="survey-description" className="se-input" rows={4} maxLength={4000} value={editor.description}
                    disabled={!editable} onChange={(event) => setEditor({ ...editor, description: event.target.value })} />
                </div>

                <div className="se-admin-filters">
                  <div className="se-field">
                    <label className="se-label" htmlFor="survey-release">Release tag</label>
                    <input id="survey-release" className="se-input" placeholder="1.1.0-F" value={editor.releaseTag}
                      disabled={!editable} onChange={(event) => setEditor({ ...editor, releaseTag: event.target.value })} />
                  </div>
                  <div className="se-field">
                    <label className="se-label" htmlFor="survey-feature">Feature tag</label>
                    <input id="survey-feature" className="se-input" placeholder="Stores, Quests, Mobile UI..." value={editor.featureTag}
                      disabled={!editable} onChange={(event) => setEditor({ ...editor, featureTag: event.target.value })} />
                  </div>
                </div>

                <div className="se-admin-filters">
                  <div className="se-field">
                    <label className="se-label" htmlFor="survey-start">Starts</label>
                    <input id="survey-start" className="se-input" type="datetime-local" value={editor.startsAt}
                      disabled={!editable} onChange={(event) => setEditor({ ...editor, startsAt: event.target.value })} />
                    <p className="se-hint">Blank publishes immediately. A future time creates a scheduled survey.</p>
                  </div>
                  <div className="se-field">
                    <label className="se-label" htmlFor="survey-end">Closes</label>
                    <input id="survey-end" className="se-input" type="datetime-local" value={editor.endsAt}
                      disabled={!editable} onChange={(event) => setEditor({ ...editor, endsAt: event.target.value })} />
                  </div>
                </div>

                {!editable ? (
                  <p className="se-hint">This survey is {editor.status.toLowerCase()} and its content is locked. You can still close a live survey early.</p>
                ) : null}
              </Panel>

              <Panel title="Completion rewards" aside={`${editor.rewards.length} configured`} className="se-mb">
                <p className="se-hint">Rewards are granted for completion only. The server validates reward kinds, keys and positive amounts before publishing and again before payout.</p>
                <div className="se-admin-survey-rewards">
                  {editor.rewards.map((reward, index) => (
                    <div className="se-admin-survey-reward" key={index}>
                      <select className="se-input" value={reward.kind} disabled={!editable}
                        onChange={(event) => {
                          const kind = event.target.value as AdminSurveyRewardInput['kind'];
                          setEditor({
                            ...editor,
                            rewards: editor.rewards.map((row, i) => i === index
                              ? {
                                  kind,
                                  ...(AMOUNT_REWARDS.has(kind) ? { amount: row.amount ?? 1 } : {}),
                                  ...(KEY_REWARDS.has(kind) ? { key: row.key ?? '' } : {}),
                                }
                              : row),
                          });
                        }}>
                        {REWARD_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                      </select>
                      {KEY_REWARDS.has(reward.kind) ? (
                        <input className="se-input" placeholder="Reward key" value={reward.key ?? ''} disabled={!editable}
                          onChange={(event) => setEditor({
                            ...editor,
                            rewards: editor.rewards.map((row, i) => i === index ? { ...row, key: event.target.value } : row),
                          })} />
                      ) : <span className="se-hint">No key</span>}
                      {AMOUNT_REWARDS.has(reward.kind) ? (
                        <input className="se-input" type="number" min={1} step={1} value={reward.amount ?? 1} disabled={!editable}
                          onChange={(event) => setEditor({
                            ...editor,
                            rewards: editor.rewards.map((row, i) => i === index ? { ...row, amount: Number(event.target.value) } : row),
                          })} />
                      ) : <span className="se-hint">One unlock</span>}
                      {editable ? (
                        <button type="button" className="se-btn se-btn--ghost se-btn--sm"
                          onClick={() => setEditor({ ...editor, rewards: editor.rewards.filter((_, i) => i !== index) })}>Remove</button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {editable ? (
                  <button type="button" className="se-btn se-btn--ghost se-btn--sm se-mt"
                    onClick={() => setEditor({ ...editor, rewards: [...editor.rewards, { kind: 'CASH', amount: 5000 }] })}>
                    + Add reward
                  </button>
                ) : null}
              </Panel>

              <Panel title="Questions" aside={`${editor.questions.length} total`} className="se-mb">
                <div className="se-admin-survey-questions">
                  {editor.questions.map((question, index) => (
                    <section className="se-admin-survey-question" key={index}>
                      <header>
                        <strong>Question {index + 1}</strong>
                        {editable ? (
                          <div>
                            <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setEditor({ ...editor, questions: move(editor.questions, index, -1) })} disabled={index === 0}>↑</button>
                            <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setEditor({ ...editor, questions: move(editor.questions, index, 1) })} disabled={index === editor.questions.length - 1}>↓</button>
                            <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setEditor({ ...editor, questions: editor.questions.filter((_, i) => i !== index) })} disabled={editor.questions.length === 1}>Remove</button>
                          </div>
                        ) : null}
                      </header>

                      <div className="se-admin-filters">
                        <div className="se-field">
                          <label className="se-label">Type</label>
                          <select className="se-input" value={question.type} disabled={!editable}
                            onChange={(event) => changeQuestionType(index, event.target.value as SurveyQuestionTypeDto)}>
                            {Object.entries(QUESTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
                        </div>
                        <label className="se-checkrow se-checkrow--inline">
                          <input type="checkbox" checked={question.required} disabled={!editable}
                            onChange={(event) => updateQuestion(index, { required: event.target.checked })} />
                          <span><strong>Required</strong><small>Must be answered for completion.</small></span>
                        </label>
                      </div>

                      <div className="se-field">
                        <label className="se-label">Prompt</label>
                        <input className="se-input" maxLength={500} value={question.prompt} disabled={!editable}
                          onChange={(event) => updateQuestion(index, { prompt: event.target.value })} />
                      </div>
                      <div className="se-field">
                        <label className="se-label">Help text</label>
                        <input className="se-input" maxLength={1000} value={question.description ?? ''} disabled={!editable}
                          onChange={(event) => updateQuestion(index, { description: event.target.value || null })} />
                      </div>

                      {(question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE') ? (
                        <div className="se-admin-survey-options">
                          {question.options.map((option, optionIndex) => (
                            <div key={optionIndex}>
                              <input className="se-input" placeholder="Stable value" value={option.value} disabled={!editable}
                                onChange={(event) => updateQuestion(index, {
                                  options: question.options.map((row, i) => i === optionIndex ? { ...row, value: event.target.value } : row),
                                })} />
                              <input className="se-input" placeholder="Player-facing label" value={option.label} disabled={!editable}
                                onChange={(event) => updateQuestion(index, {
                                  options: question.options.map((row, i) => i === optionIndex ? { ...row, label: event.target.value } : row),
                                })} />
                              {editable ? <button type="button" className="se-btn se-btn--ghost se-btn--sm"
                                onClick={() => updateQuestion(index, { options: question.options.filter((_, i) => i !== optionIndex) })}>Remove</button> : null}
                            </div>
                          ))}
                          {editable ? <button type="button" className="se-btn se-btn--ghost se-btn--sm"
                            onClick={() => updateQuestion(index, {
                              options: [...question.options, { value: `OPTION_${question.options.length + 1}`, label: `Option ${question.options.length + 1}` }],
                            })}>+ Add choice</button> : null}
                        </div>
                      ) : null}

                      {question.type === 'RATING' ? (
                        <div className="se-admin-filters">
                          <div className="se-field">
                            <label className="se-label">Minimum</label>
                            <input className="se-input" type="number" min={1} max={10} value={question.ratingMin ?? 1} disabled={!editable}
                              onChange={(event) => updateQuestion(index, { ratingMin: Number(event.target.value) })} />
                          </div>
                          <div className="se-field">
                            <label className="se-label">Maximum</label>
                            <input className="se-input" type="number" min={1} max={10} value={question.ratingMax ?? 5} disabled={!editable}
                              onChange={(event) => updateQuestion(index, { ratingMax: Number(event.target.value) })} />
                          </div>
                        </div>
                      ) : null}

                      {(question.type === 'SHORT_TEXT' || question.type === 'LONG_TEXT') ? (
                        <div className="se-admin-filters">
                          <div className="se-field">
                            <label className="se-label">Minimum characters</label>
                            <input className="se-input" type="number" min={1} max={5000} value={question.minLength ?? 3} disabled={!editable}
                              onChange={(event) => updateQuestion(index, { minLength: Number(event.target.value) })} />
                          </div>
                          <div className="se-field">
                            <label className="se-label">Maximum characters</label>
                            <input className="se-input" type="number" min={1} max={5000} value={question.maxLength ?? (question.type === 'SHORT_TEXT' ? 500 : 5000)} disabled={!editable}
                              onChange={(event) => updateQuestion(index, { maxLength: Number(event.target.value) })} />
                          </div>
                        </div>
                      ) : null}
                    </section>
                  ))}
                </div>

                {editable ? (
                  <div className="se-cta se-mt">
                    <button type="button" className="se-btn se-btn--ghost"
                      onClick={() => setEditor({ ...editor, questions: [...editor.questions, emptyQuestion('YES_NO')] })}>+ Add question</button>
                  </div>
                ) : null}
              </Panel>

              <div className="se-admin-survey-actions">
                {editable ? (
                  <Button className="se-btn se-btn--primary" disabledReason={busy ? 'The survey is still saving.' : null}>
                    {busy ? 'Saving...' : editor.id ? 'Save changes' : 'Create draft'}
                  </Button>
                ) : null}
                {editor.status === 'DRAFT' ? (
                  <Button type="button" className="se-btn se-btn--ghost" onClick={() => void publish()}
                    disabledReason={busy ? 'Another survey action is still running.' : !editor.id ? 'Create the draft first.' : null}>
                    {editor.startsAt && new Date(editor.startsAt).getTime() > Date.now() ? 'Schedule survey' : 'Publish survey'}
                  </Button>
                ) : null}
                {(editor.status === 'SCHEDULED' || editor.status === 'LIVE') ? (
                  <Button type="button" className="se-btn se-btn--danger" onClick={() => setClosing(true)}
                    disabledReason={busy ? 'Another survey action is still running.' : null}>
                    Close survey
                  </Button>
                ) : null}
              </div>

              {closing && (editor.status === 'SCHEDULED' || editor.status === 'LIVE') ? (
                <Panel title="Close survey" className="se-mt">
                  <p>Closing stops new submissions immediately. Existing responses and reward history are preserved.</p>
                  <div className="se-field">
                    <label className="se-label" htmlFor="survey-close-reason">Audit reason</label>
                    <textarea
                      id="survey-close-reason"
                      className="se-input se-admin-reason"
                      rows={3}
                      maxLength={500}
                      value={closeReason}
                      onChange={(event) => setCloseReason(event.target.value)}
                    />
                    <p className="se-hint">Required in the admin audit log. At least 5 characters.</p>
                  </div>
                  <div className="se-cta">
                    <Button type="button" className="se-btn se-btn--danger" onClick={() => void close()}
                      disabledReason={busy ? 'The survey is still closing.' : closeReason.trim().length < 5 ? 'Write an audit reason of at least 5 characters.' : null}>
                      Confirm close
                    </Button>
                    <Button type="button" className="se-btn se-btn--ghost" onClick={() => { setClosing(false); setCloseReason(''); }}
                      disabledReason={busy ? 'The survey is still closing.' : null}>
                      Cancel
                    </Button>
                  </div>
                </Panel>
              ) : null}
            </form>
          )}
        </div>
      </div>
    </GameLayout>
  );
}
