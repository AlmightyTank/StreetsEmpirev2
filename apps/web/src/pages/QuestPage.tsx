import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  formatCents,
  formatNumber,
  type PlayerQuestDto,
  type QuestPageDto,
} from '@streets/shared';
import { ApiError } from '../api/client.js';
import { questsApi } from '../api/quests.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

type Tab = 'available' | 'active' | 'completed';

function formatObjective(objective: PlayerQuestDto['objectives'][number]): string {
  if (objective.kind === 'EARN_CASH') {
    return formatCents(objective.current) + ' / ' + formatCents(objective.target);
  }
  return formatNumber(objective.current) + ' / ' + formatNumber(objective.target);
}

function statusLabel(quest: PlayerQuestDto): string {
  switch (quest.status) {
    case 'READY_TO_TURN_IN': return 'Ready to collect';
    case 'ACTIVE': return 'In progress';
    case 'AVAILABLE': return 'Available';
    case 'LOCKED': return 'Locked';
    case 'COMPLETED': return 'Completed';
    case 'EXPIRED': return 'Expired';
    case 'FAILED': return 'Failed';
  }
}

function QuestCard({
  quest,
  page,
  busy,
  onAccept,
  onClaim,
  onTrack,
  onAbandon,
}: {
  quest: PlayerQuestDto;
  page: QuestPageDto;
  busy: string | null;
  onAccept: (key: string) => void;
  onClaim: (key: string) => void;
  onTrack: (key: string, tracked: boolean) => void;
  onAbandon: (key: string) => void;
}) {
  const active = quest.status === 'ACTIVE' || quest.status === 'READY_TO_TURN_IN';
  const trackedCount = page.quests.filter((item) => item.isTracked).length;

  return (
    <Panel
      title={quest.title}
      aside={<span className="se-num se-dim">{quest.contactName ?? 'StreetsEmpire'} · {statusLabel(quest)}</span>}
    >
      <p className="se-hint">{quest.description}</p>
      <div className="se-rows">
        {quest.objectives.map((objective) => (
          <Row
            key={objective.id}
            label={(objective.bonus ? 'Bonus · ' : '') + objective.description}
            value={objective.completed ? 'Complete' : formatObjective(objective)}
            strong={objective.completed}
          />
        ))}
      </div>

      <div className="se-mt">
        <p className="se-eyebrow">Rewards</p>
        <div className="se-rows">
          {quest.rewards.map((reward, index) => (
            <Row key={reward.kind + ':' + (reward.key ?? index)} label={reward.label} value="" />
          ))}
        </div>
      </div>

      <div className="se-actions se-mt">
        {quest.status === 'AVAILABLE' ? (
          <Button
            className="se-btn se-btn--primary"
            disabledReason={busy ?? (page.counts.active >= page.activeLimit
              ? 'You already have ' + page.activeLimit + ' active jobs.'
              : null)}
            onClick={() => onAccept(quest.key)}
          >
            Accept job
          </Button>
        ) : null}

        {quest.status === 'READY_TO_TURN_IN' ? (
          <Button className="se-btn se-btn--primary" disabledReason={busy} onClick={() => onClaim(quest.key)}>
            Collect payment
          </Button>
        ) : null}

        {active ? (
          <>
            <Button
              className="se-btn"
              disabledReason={busy ?? (!quest.isTracked && trackedCount >= page.trackedLimit
                ? 'You can only track ' + page.trackedLimit + ' jobs.'
                : null)}
              onClick={() => onTrack(quest.key, !quest.isTracked)}
            >
              {quest.isTracked ? 'Stop tracking' : 'Track job'}
            </Button>
            <Button className="se-btn se-btn--ghost" disabledReason={busy} onClick={() => onAbandon(quest.key)}>
              Abandon
            </Button>
          </>
        ) : null}
      </div>

      {quest.expiresAt ? <p className="se-hint">Expires {new Date(quest.expiresAt).toLocaleString()}.</p> : null}
    </Panel>
  );
}

export function QuestPage() {
  const me = useSession((state) => state.me);
  const refreshSnapshot = useSession((state) => state.refreshSnapshot);
  const [page, setPage] = useState<QuestPageDto | null>(null);
  const [tab, setTab] = useState<Tab>('available');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPage(await questsApi.page());
      setError(null);
    } catch {
      setError('Could not load jobs right now. Try again.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    if (!page) return [];
    if (tab === 'active') return page.quests.filter((quest) => ['ACTIVE', 'READY_TO_TURN_IN'].includes(quest.status));
    if (tab === 'completed') return page.quests.filter((quest) => ['COMPLETED', 'FAILED', 'EXPIRED'].includes(quest.status));
    return page.quests.filter((quest) => ['AVAILABLE', 'LOCKED'].includes(quest.status));
  }, [page, tab]);

  async function mutate(key: string, action: () => Promise<QuestPageDto>, success?: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setPage(await action());
      if (success) setNotice(success);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'That job could not be updated.');
    } finally {
      setBusy(null);
    }
  }

  async function claim(key: string) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await questsApi.claim(key, crypto.randomUUID());
      setNotice(result.result.title + ' complete — payment collected.');
      await Promise.all([load(), refreshSnapshot()]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Payment could not be collected.');
    } finally {
      setBusy(null);
    }
  }

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Quests</h1>
          <p className="se-eyebrow">Jobs, contacts and underworld progression</p>
        </div>
        <Link className="se-btn se-btn--ghost" to="/game/reputation">Contact standing</Link>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <Alert tone="info">{notice}</Alert> : null}

      {page ? (
        <>
          <div className="se-grid se-grid--sidebar">
            <Panel title="Jobs">
              <div className="se-rows">
                <Row label="Available" value={formatNumber(page.counts.available)} />
                <Row label="Active" value={formatNumber(page.counts.active) + ' / ' + formatNumber(page.activeLimit)} />
                <Row label="Ready to collect" value={formatNumber(page.counts.ready)} strong={page.counts.ready > 0} />
                <Row label="Completed" value={formatNumber(page.counts.completed)} />
                <Row
                  label="Tracked"
                  value={formatNumber(page.quests.filter((quest) => quest.isTracked).length) + ' / ' + formatNumber(page.trackedLimit)}
                />
              </div>
            </Panel>

            <Panel title="Contacts">
              <div className="se-rows">
                {page.contacts.map((contact) => (
                  <Row
                    key={contact.key}
                    label={contact.shortName + ' · ' + contact.role}
                    value={contact.standing + ' · ' + formatNumber(contact.points) + ' rep'}
                  />
                ))}
              </div>
            </Panel>
          </div>

          <div className="se-storetabs se-mt" role="tablist" aria-label="Quest view">
            {([
              ['available', 'Available (' + page.counts.available + ')'],
              ['active', 'Active (' + page.counts.active + ')'],
              ['completed', 'Completed (' + page.counts.completed + ')'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={'se-storetabs__tab' + (tab === key ? ' se-storetabs__tab--active' : '')}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="se-grid se-mt">
            {shown.length ? shown.map((quest) => (
              <QuestCard
                key={quest.key}
                quest={quest}
                page={page}
                busy={busy ? 'Another job update is still going through.' : null}
                onAccept={(key) => void mutate(key, () => questsApi.accept(key, crypto.randomUUID()), 'Job accepted.')}
                onClaim={(key) => void claim(key)}
                onTrack={(key, tracked) => void mutate(key, () => questsApi.track(key, tracked))}
                onAbandon={(key) => void mutate(key, () => questsApi.abandon(key), 'Job abandoned.')}
              />
            )) : <p className="se-muted">No jobs in this section yet.</p>}
          </div>
        </>
      ) : !error ? <p className="se-muted" role="status">Checking the street for work...</p> : null}
    </GameLayout>
  );
}
