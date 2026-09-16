import { useEffect, useState } from 'react';
import type { GameNewsDto } from '@streets/shared';
import { roundsApi } from '../api/rounds.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { InfoLayout } from '../layouts/InfoLayout.js';
import { formatDate } from '../utils/time.js';

const developmentUpdates = [
  {
    id: 'dev-0.2.0-h',
    title: '0.2.0-H: Raid trophies begin',
    body: 'H keeps the G raid balance and starts the achievement pass for the expanded combat system. Drive-bys, drug runs, ride theft and lure runs now have their own public goals, including landing a drive-by, drugging rival hoes, stealing Low-Riders and pulling unhappy crew across the street. This pass also tightens production polish around round status, new-player onboarding and local-only dev bot controls.',
  },
  {
    id: 'dev-0.2.0-g',
    title: '0.2.0-G: Street polish begins',
    body: 'G keeps the F raid balance and starts making the public round feel more like a finished game. Raid reports now explain what actually happened, recon is being pulled closer to the target picker, the homepage explains the current loop for new players, and the community plan points at a free Flarum forum on forum.streetsempire.dev with Discord login first and StreetsEmpire SSO later.',
  },
  {
    id: 'dev-0.2.0-f',
    title: '0.2.0-F: Public raid round',
    body: 'F is the first public raid round: production rankings and targets are for real active players, while local dev can still seed test rivals when needed. The raid page now has more old-school ways to hit a rival: drug their hoes to burn through supplies, steal a Low-Rider if they have one, or lure unhappy hoes and thugs away with product and beer. It keeps the E weapon, intel and raid tuning: unarmed thugs take a bigger happiness hit, only armed fit thugs count as street cover when scouting, and rankings and profiles show public money, rank streaks, past placements and achievements, while crew, weapons, exposed cash and product stash still require recon. Successful raids roll a 5%-40% cut of exposed cash and product, weighted low so the biggest hits are rare, and back-to-back hits on the same target pay less until you hit someone else. Player profiles also have a full achievement gallery with earned badges and locked progress across rank, wealth, combat, intel, reputation and legacy. Hover the help markers to see what each number means.',
  },
  {
    id: 'dev-0.2.0-d',
    title: '0.2.0-D: Strategy raids are being tested',
    body: 'Raids now have recon and revenge in strategy rounds, and fresh D-round players start with enough cash, crew and pistols to try combat immediately. Recon spends turns to reveal fit thugs, wounds, weapons, a cash band and estimated exposed loot. If someone raids you, a revenge window lets you answer that attacker through the normal target protection and weak-crew filters.',
  },
  {
    id: 'dev-0.2.0-c',
    title: '0.2.0-C: Wounds and recovery',
    body: 'Combat wounds are temporary but real. Wounded thugs remain part of your empire and net worth, but only fit thugs can scout, produce, attack or defend. Wounds recover on the clock, and medicine can treat them immediately.',
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

/** Public: logged-out visitors and the forum footer link here. */
export function NewsPage() {
  const [news, setNews] = useState<GameNewsDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    roundsApi.news()
      .then((response) => setNews(response.news))
      .catch((caught: unknown) => setError(caught instanceof ApiError ? caught.message : 'Could not load the news.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <InfoLayout>
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
              <p className="se-hint se-news__byline">StreetsEmpire development wire</p>
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
              <p className="se-hint se-news__byline">{post.authorName ? `Posted by ${post.authorName}` : 'StreetsEmpire wire'}</p>
            </div>
          </article>
        ))}
      </div>
    </InfoLayout>
  );
}
