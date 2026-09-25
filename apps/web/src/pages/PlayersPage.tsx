import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { PlayerActivityBand, PlayerDirectoryDto, PlayerDirectoryView } from '@streets/shared';
import { formatCents, formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { contactsApi, playersApi } from '../api/playing-together.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { Button } from '../components/Button.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';

const VIEWS: Array<{ key: PlayerDirectoryView; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'city', label: 'My city' },
  { key: 'alliance', label: 'Alliance' },
  { key: 'near', label: 'Near rank' },
  { key: 'active', label: 'Active' },
];

function activityLabel(activity: PlayerActivityBand): string {
  if (activity === 'online') return 'Online';
  if (activity === 'recent') return 'Recently active';
  if (activity === 'away') return 'Away';
  return 'Offline';
}

function activityClass(activity: PlayerActivityBand): string {
  if (activity === 'online') return 'se-tag se-tag--good';
  if (activity === 'recent') return 'se-tag se-players-status--recent';
  return 'se-tag se-tag--dim';
}

export function PlayersPage() {
  const [data, setData] = useState<PlayerDirectoryDto | null>(null);
  const [view, setView] = useState<PlayerDirectoryView>('all');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyPlayer, setBusyPlayer] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    setError(null);
    playersApi.list(view, submittedQuery).then((next) => {
      if (live) setData(next);
    }).catch((caught: unknown) => {
      if (live) setError(caught instanceof ApiError ? caught.message : 'Could not load the player directory.');
    });
    return () => { live = false; };
  }, [view, submittedQuery]);

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  }

  async function addContact(publicPimpId: number) {
    setBusyPlayer(publicPimpId);
    setError(null);
    try {
      await contactsApi.add(publicPimpId);
      setData((current) => current ? {
        ...current,
        contactSlots: { ...current.contactSlots, used: Math.min(current.contactSlots.max, current.contactSlots.used + 1) },
        players: current.players.map((player) => player.publicPimpId === publicPimpId
          ? { ...player, isContact: true }
          : player),
      } : current);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not add that player to your contacts.');
    } finally {
      setBusyPlayer(null);
    }
  }

  const countFor = (key: PlayerDirectoryView): number | null =>
    data ? data.counts[key] : null;

  return (
    <GameLayout>
      <div className="se-players">
        <header className="se-players-hero">
          <div className="se-players-hero__copy">
            <span className="se-eyebrow">0.9.0 · The streets are talking</span>
            <h1>Players</h1>
            <p>
              Find crews in the current round, open their public profile, and build your Contacts list
              without turning the directory into free recon.
            </p>
          </div>

          <div className="se-players-hero__readout">
            <span><small>Round players</small><strong>{data ? formatNumber(data.counts.all) : '—'}</strong></span>
            <span><small>In your city</small><strong>{data ? formatNumber(data.counts.city) : '—'}</strong></span>
            <span><small>Alliance</small><strong>{data ? formatNumber(data.counts.alliance) : '—'}</strong></span>
            <span><small>Active 24h</small><strong>{data ? formatNumber(data.counts.active) : '—'}</strong></span>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}

        <section className="se-players-directory">
          <div className="se-players-sectionhead">
            <div>
              <span className="se-eyebrow">Street directory</span>
              <h2>Find somebody</h2>
            </div>
            <p>Activity is intentionally shown as a broad band. Exact last-active times are not exposed here.</p>
          </div>

          <form className="se-players-toolbar" onSubmit={submit}>
            <label className="se-players-search">
              <span>Search</span>
              <div className="se-players-search__row">
                <input
                  className="se-input"
                  type="search"
                  value={query}
                  maxLength={80}
                  placeholder="Display name, #1042, or alliance"
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button className="se-btn se-btn--primary" type="submit">Search</button>
                {submittedQuery ? (
                  <button
                    className="se-btn se-btn--ghost"
                    type="button"
                    onClick={() => { setQuery(''); setSubmittedQuery(''); }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </label>

            <div className="se-players-tabs" role="tablist" aria-label="Player directory view">
              {VIEWS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  className={`se-players-tabs__tab${view === key ? ' se-players-tabs__tab--active' : ''}`}
                  onClick={() => setView(key)}
                >
                  <span>{label}</span>
                  {countFor(key) !== null ? <strong>{formatNumber(countFor(key)!)}</strong> : null}
                </button>
              ))}
            </div>
          </form>

          <Panel
            title="Current round"
            aside={data ? `${formatNumber(data.players.length)} shown` : 'Loading'}
            flush
            className="se-players-panel"
          >
            {!data ? <p className="se-muted se-admin-pad">Checking the streets...</p> : null}
            {data && data.players.length === 0 ? (
              <div className="se-players-empty">
                <strong>No players match this view.</strong>
                <span>Try another directory view or clear your search.</span>
              </div>
            ) : null}
            {data?.players.length ? (
              <div className="se-tablewrap">
                <table className="se-table se-table--cards se-players-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th className="se-table__number">National</th>
                      <th className="se-table__number">Net worth</th>
                      <th>City</th>
                      <th>Activity</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.players.map((player) => (
                      <tr key={player.publicPimpId} className={player.isYou ? 'se-players-row--you' : undefined}>
                        <td className="se-td--title" data-label="Player">
                          <div className="se-players-person">
                            <div className="se-players-person__name">
                              <AllianceTag alliance={player.alliance} />
                              <Link className="se-playerlink" to={`/game/players/${player.publicPimpId}`}>
                                {player.displayName}
                              </Link>
                              <span className="se-muted se-num">#{player.publicPimpId}</span>
                              {player.isYou ? <span className="se-tag se-tag--good">You</span> : null}
                            </div>
                          </div>
                        </td>
                        <td className="se-table__number se-num" data-label="National">
                          #{formatNumber(player.nationalRank)}
                        </td>
                        <td className="se-table__number se-num" data-label="Net worth">
                          {formatCents(player.netWorthCents)}
                        </td>
                        <td data-label="City">{player.city.name}</td>
                        <td data-label="Activity">
                          <span className={activityClass(player.activity)}>{activityLabel(player.activity)}</span>
                        </td>
                        <td data-label="Actions">
                          <span className="se-inline-actions se-players-actions">
                            <Link className="se-btn se-btn--ghost se-btn--sm" to={`/game/players/${player.publicPimpId}`}>
                              Profile
                            </Link>
                            {!player.isYou && player.isContact ? (
                              <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/contacts">Contact</Link>
                            ) : null}
                            {!player.isYou && !player.isContact ? (
                              <Button
                                type="button"
                                className="se-btn se-btn--ghost se-btn--sm"
                                disabledReason={
                                  busyPlayer === player.publicPimpId
                                    ? 'Adding...'
                                    : data.contactSlots.used >= data.contactSlots.max
                                      ? 'Your contacts are full.'
                                      : null
                                }
                                onClick={() => void addContact(player.publicPimpId)}
                              >
                                Add contact
                              </Button>
                            ) : null}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </Panel>

          <div className="se-players-footnote">
            <span>Search uses public round identity only.</span>
            <span>No crew strength, weapons, recon intel, or exact activity timestamp is exposed.</span>
            <span>Contact notes remain private.</span>
          </div>
        </section>
      </div>
    </GameLayout>
  );
}
