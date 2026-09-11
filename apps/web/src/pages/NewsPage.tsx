import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { GameNewsDto } from '@streets/shared';
import { roundsApi } from '../api/rounds.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { formatDate } from '../utils/time.js';

const developmentUpdates = [
  {
    id: 'dev-0.2.0-e',
    title: '0.2.0-E: Raid onboarding targets',
    body: 'The current local development round now seeds three New York rivals so a fresh player can test raids without waiting for another human account. E also makes weapons and intel matter more: unarmed thugs take a bigger happiness hit, only armed fit thugs count as street cover when scouting, and rankings and profiles now show public money, rank streaks, past placements and achievements, while crew, weapons, exposed cash and crack stash still require recon. Successful E-round raids now steal a bigger cash cut and part of the defender crack stash. Player profiles also have a full achievement gallery with earned badges and locked progress across rank, wealth, combat, intel, reputation and legacy. Hover the new help markers to see what each number means.',
  },
  {
    id: 'dev-0.2.0-d',
    title: '0.2.0-D: Strategy raids are being tested',
    body: 'Raids now have recon and revenge in strategy rounds, and fresh D-round players start with enough cash, crew and pistols to try combat immediately. Recon spends turns to reveal fit thugs, wounds, weapons, a cash band and estimated exposed loot. If someone raids you, a revenge window lets you answer that attacker through the normal target protection and weak-crew filters.',
  },
  {
    id: 'dev-0.2.0-c',
    title: '0.2.0-C: Wounds and recovery',
    body: 'Combat wounds are temporary but real. Wounded thugs remain part of your empire and net worth, but only fit thugs can scout, cook, attack or defend. Wounds recover on the clock, and medicine can treat them immediately.',
  },
  {
    id: 'dev-reputation',
    title: 'Reputation opens the heavy guns',
    body: 'The Street tracks trader reputation. Daily trading and one-time favours earn standing, which unlocks shotguns, Tek-9s and AK-47s and speeds up shop restocks.',
  },
  {
    id: 'dev-0.2.0-b',
    title: '0.2.0-B: First playable cash raids',
    body: 'Cash raids spend turns, fight automatic defense, transfer bounded exposed cash on a win, write battle reports for both players, and protect defenders after they are hit.',
  },
] as const;

export function NewsPage() {
  const me = useSession((s) => s.me);
  const [news, setNews] = useState<GameNewsDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    roundsApi.news()
      .then((response) => setNews(response.news))
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load the news.'))
      .finally(() => setLoading(false));
  }, []);

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">News</h1>
          <p className="se-eyebrow">Word from the street</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {loading ? <p className="se-muted">Checking the wire...</p> : null}
      {!loading && news.length === 0 ? <p className="se-muted">No round news has been posted yet.</p> : null}

      <div className="se-news-list">
        {developmentUpdates.map((post) => (
          <article className="se-panel se-news se-news--pinned" key={post.id}>
            <div className="se-panel__head">
              <h2 className="se-panel__title">Development · {post.title}</h2>
              <span className="se-news__date se-num">Current build</span>
            </div>
            <div className="se-panel__body">
              <p className="se-news__body">{post.body}</p>
              <p className="se-hint se-news__byline">Street Empire development wire</p>
            </div>
          </article>
        ))}
        {news.map((post) => (
          <article className={`se-panel se-news${post.isPinned ? ' se-news--pinned' : ''}`} key={post.id}>
            <div className="se-panel__head">
              <h2 className="se-panel__title">{post.isPinned ? 'Pinned · ' : ''}{post.title}</h2>
              <span className="se-news__date se-num">{formatDate(post.publishedAt)}</span>
            </div>
            <div className="se-panel__body">
              <p className="se-news__body">{post.body}</p>
              <p className="se-hint se-news__byline">{post.authorName ? `Posted by ${post.authorName}` : 'Street Empire wire'}</p>
            </div>
          </article>
        ))}
      </div>
    </GameLayout>
  );
}
