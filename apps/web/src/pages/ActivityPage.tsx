import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { ActivityDto } from '@streets/shared';
import { formatNumber } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { ActivityFeed, activityGroup, activityGroupLabel, type ActivityGroup } from '../components/ActivityFeed.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

type ActivityView = 'all' | ActivityGroup;

const GROUPS: ActivityGroup[] = ['combat', 'street', 'market', 'progress', 'travel', 'turf', 'system'];

function newestLabel(activity: ActivityDto[]): string {
  const newest = activity[0];
  if (!newest) return 'No entries yet';

  const minutes = Math.max(0, Math.floor((Date.now() - new Date(newest.createdAt).getTime()) / 60_000));
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Newest entry ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Newest entry ${hours}h ago`;
  return `Newest entry ${new Date(newest.createdAt).toLocaleDateString()}`;
}

export function ActivityPage() {
  const me = useSession((s) => s.me);
  const [activity, setActivity] = useState<ActivityDto[]>([]);
  const [view, setView] = useState<ActivityView>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await communityApi.activity(100);
      setActivity(response.activity);
    } catch (caught: unknown) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const next = Object.fromEntries(GROUPS.map((group) => [group, 0])) as Record<ActivityGroup, number>;
    for (const entry of activity) next[activityGroup(entry.type)] += 1;
    return next;
  }, [activity]);

  const visibleActivity = useMemo(
    () => view === 'all' ? activity : activity.filter((entry) => activityGroup(entry.type) === view),
    [activity, view],
  );

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-activity">
        <header className="se-activity-hero">
          <div className="se-activity-hero__copy">
            <span className="se-eyebrow">Private street ledger</span>
            <h1>Activity</h1>
            <p>Your latest 100 logged actions, newest first. Filter the ledger without changing or hiding what the server recorded.</p>
          </div>
          <div className="se-activity-hero__side">
            <span className="se-activity-hero__status">{newestLabel(activity)}</span>
            <Button
              className="se-btn se-btn--ghost se-btn--sm"
              disabledReason={loading ? 'The ledger is already refreshing.' : null}
              onClick={() => void load()}
            >
              Refresh log
            </Button>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}

        <section className="se-activity-board">
          <div className="se-activity-sectionhead">
            <div>
              <span className="se-eyebrow">Ledger filters</span>
              <h2>{view === 'all' ? 'All activity' : activityGroupLabel(view)}</h2>
            </div>
            <span className="se-activity-sectionhead__meta">
              {loading ? 'Reading the log…' : `${formatNumber(visibleActivity.length)} shown · ${formatNumber(activity.length)} loaded`}
            </span>
          </div>

          <div className="se-activity-tabs" role="tablist" aria-label="Activity category">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'all'}
              className={`se-activity-tabs__tab${view === 'all' ? ' se-activity-tabs__tab--active' : ''}`}
              onClick={() => setView('all')}
            >
              <span>All</span>
              <strong>{formatNumber(activity.length)}</strong>
            </button>

            {GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={view === group}
                className={`se-activity-tabs__tab se-activity-tabs__tab--${group}${view === group ? ' se-activity-tabs__tab--active' : ''}`}
                onClick={() => setView(group)}
              >
                <span>{activityGroupLabel(group)}</span>
                <strong>{formatNumber(counts[group])}</strong>
              </button>
            ))}
          </div>

          <Panel title="Street log" aside="Newest first · last 100" flush className="se-activity-panel">
            {loading ? (
              <div className="se-activity-loading" role="status">Reading the log...</div>
            ) : visibleActivity.length ? (
              <ActivityFeed activity={visibleActivity} detailed />
            ) : (
              <div className="se-activity-empty">
                <strong>No {view === 'all' ? '' : activityGroupLabel(view).toLowerCase() + ' '}activity in the current log.</strong>
                <span>Switch categories to see the rest of your last 100 recorded actions.</span>
              </div>
            )}
          </Panel>
        </section>
      </div>
    </GameLayout>
  );
}
