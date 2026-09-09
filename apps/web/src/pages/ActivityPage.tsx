import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { ActivityDto } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { ApiError } from '../api/client.js';
import { ActivityFeed } from '../components/ActivityFeed.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

export function ActivityPage() {
  const me = useSession((s) => s.me);
  const [activity, setActivity] = useState<ActivityDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    communityApi.activity(100)
      .then((response) => setActivity(response.activity))
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load your activity.'))
      .finally(() => setLoading(false));
  }, []);

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Activity</h1>
          <p className="se-eyebrow">Your last 100 moves</p>
        </div>
      </div>
      {error ? <Alert>{error}</Alert> : null}
      <Panel title="Street Log" flush>
        {loading ? <div className="se-panel__body"><p className="se-muted">Reading the log...</p></div> : <ActivityFeed activity={activity} />}
      </Panel>
    </GameLayout>
  );
}
