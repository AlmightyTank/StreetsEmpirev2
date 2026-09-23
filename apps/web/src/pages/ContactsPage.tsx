import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ContactDto, ContactsDto } from '@streets/shared';
import { CONTACT_NOTE_MAX, formatCents, formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { contactsApi } from '../api/playing-together.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';

type ContactView = 'all' | 'active' | 'noted' | 'gone';

const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

function ago(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function isActive(contact: ContactDto): boolean {
  return Boolean(contact.standing && Date.now() - new Date(contact.standing.lastActiveAt).getTime() <= ACTIVE_WINDOW_MS);
}

function ContactMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'accent' | 'good' | 'warn';
}) {
  return (
    <div className={`se-contacts-metric${tone ? ` se-contacts-metric--${tone}` : ''}`}>
      <span className="se-contacts-metric__label">{label}</span>
      <strong className="se-contacts-metric__value">{value}</strong>
      {detail ? <span className="se-contacts-metric__detail">{detail}</span> : null}
    </div>
  );
}

function ContactRow({ contact, busy, onSave, onRemove }: {
  contact: ContactDto;
  busy: boolean;
  onSave: (note: string) => void;
  onRemove: () => void;
}) {
  const [note, setNote] = useState(contact.note);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setNote(contact.note), [contact.note]);

  const active = isActive(contact);

  return (
    <tr className={contact.standing ? undefined : 'se-contacts-row--gone'}>
      <td className="se-td--title">
        <div className="se-contacts-person">
          <div className="se-contacts-person__name">
            <AllianceTag alliance={contact.alliance} />
            <Link to={`/game/players/${contact.publicPimpId}`} className="se-playerlink">
              {contact.displayName}
            </Link>
            <span className="se-muted se-num">#{contact.publicPimpId}</span>
          </div>
          <div className="se-contacts-person__status">
            {!contact.standing ? (
              <span className="se-tag se-tag--dim">Gone</span>
            ) : active ? (
              <span className="se-tag se-tag--good">Active</span>
            ) : (
              <span className="se-tag se-tag--dim">Quiet</span>
            )}
            {contact.standing?.city ? <span>{contact.standing.city}</span> : null}
          </div>
        </div>
      </td>
      <td className="se-table__number se-num" data-label="National">
        {contact.standing ? `#${formatNumber(contact.standing.nationalRank)}` : '—'}
      </td>
      <td className="se-table__number se-num" data-label="Net worth">
        {contact.standing ? formatCents(contact.standing.netWorthCents) : '—'}
      </td>
      <td data-label="Seen">
        {contact.standing ? ago(contact.standing.lastActiveAt) : 'No longer active'}
      </td>
      <td data-label="Private note" className="se-contact__note">
        <input
          className="se-input se-contacts-note"
          aria-label={`Private note on ${contact.displayName}`}
          maxLength={CONTACT_NOTE_MAX}
          value={note}
          placeholder="Private note"
          onChange={(event) => setNote(event.target.value)}
        />
      </td>
      <td data-label="Actions">
        <span className="se-inline-actions se-contacts-actions">
          <Button
            type="button"
            className="se-btn se-btn--ghost se-btn--sm"
            disabledReason={busy ? 'Still saving.' : note === contact.note ? 'Nothing changed.' : null}
            onClick={() => onSave(note)}
          >
            Save
          </Button>
          {confirming ? (
            <Button
              type="button"
              className="se-btn se-btn--primary se-btn--sm"
              disabledReason={busy ? 'Still saving.' : null}
              onClick={onRemove}
            >
              Confirm
            </Button>
          ) : (
            <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setConfirming(true)}>
              Remove
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

/** 0.3.0-D. The OG rolodex: players you track, their public standing, and notes nobody else sees. */
export function ContactsPage() {
  const [data, setData] = useState<ContactsDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pimp, setPimp] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ContactView>('all');

  useEffect(() => {
    contactsApi.list().then(setData).catch((caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Could not load your contacts.');
    });
  }, []);

  async function run(action: () => Promise<ContactsDto>) {
    setBusy(true);
    setError(null);
    try {
      setData(await action());
      return true;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not go through. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const id = Number(pimp.replace(/^#/, ''));
    if (!Number.isSafeInteger(id) || id < 1) {
      setError('Enter a pimp number, e.g. 1042.');
      return;
    }
    if (await run(() => contactsApi.add(id, note.trim() || undefined))) {
      setPimp('');
      setNote('');
    }
  }

  const contacts = data?.contacts ?? [];
  const activeCount = contacts.filter(isActive).length;
  const notedCount = contacts.filter((contact) => contact.note.trim().length > 0).length;
  const goneCount = contacts.filter((contact) => !contact.standing).length;
  const slotsLeft = data ? Math.max(0, data.max - contacts.length) : 0;

  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return contacts.filter((contact) => {
      if (view === 'active' && !isActive(contact)) return false;
      if (view === 'noted' && contact.note.trim().length === 0) return false;
      if (view === 'gone' && contact.standing) return false;
      if (!needle) return true;

      const searchText = [
        contact.displayName,
        String(contact.publicPimpId),
        contact.note,
        contact.standing?.city ?? '',
        contact.alliance?.name ?? '',
        contact.alliance?.tag ?? '',
      ].join(' ').toLowerCase();

      return searchText.includes(needle);
    });
  }, [contacts, query, view]);

  return (
    <GameLayout>
      <div className="se-contacts">
        <header className="se-contacts-hero">
          <div className="se-contacts-hero__copy">
            <span className="se-eyebrow">Private street network</span>
            <h1>Contacts</h1>
            <p>Keep tabs on players you care about this round, attach private notes, and jump straight to their public profiles without mixing recon intel into your rolodex.</p>
          </div>

          <div className="se-contacts-hero__readout">
            <span>
              <small>Tracked</small>
              <strong>{data ? `${formatNumber(contacts.length)} / ${formatNumber(data.max)}` : '—'}</strong>
            </span>
            <span>
              <small>Active 24h</small>
              <strong>{data ? formatNumber(activeCount) : '—'}</strong>
            </span>
            <span>
              <small>With notes</small>
              <strong>{data ? formatNumber(notedCount) : '—'}</strong>
            </span>
            <span>
              <small>Gone</small>
              <strong>{data ? formatNumber(goneCount) : '—'}</strong>
            </span>
          </div>
        </header>

        {error ? <Alert>{error}</Alert> : null}

        <section className="se-contacts-work">
          <div className="se-contacts-work__main">
            <div className="se-contacts-sectionhead">
              <div>
                <span className="se-eyebrow">Rolodex</span>
                <h2>Your tracked players</h2>
              </div>
              <span className="se-contacts-sectionhead__meta">
                {data ? `${formatNumber(slotsLeft)} slot${slotsLeft === 1 ? '' : 's'} open` : 'Loading'}
              </span>
            </div>

            <div className="se-contacts-toolbar">
              <label className="se-contacts-search">
                <span>Search contacts</span>
                <input
                  className="se-input"
                  type="search"
                  value={query}
                  placeholder="Name, #, city, alliance, or note"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>

              <div className="se-contacts-tabs" role="tablist" aria-label="Contact view">
                {([
                  ['all', 'All', contacts.length],
                  ['active', 'Active', activeCount],
                  ['noted', 'Noted', notedCount],
                  ['gone', 'Gone', goneCount],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={view === key}
                    className={`se-contacts-tabs__tab${view === key ? ' se-contacts-tabs__tab--active' : ''}`}
                    onClick={() => setView(key)}
                  >
                    <span>{label}</span>
                    <strong>{formatNumber(count)}</strong>
                  </button>
                ))}
              </div>
            </div>

            <Panel title="Street book" aside={data ? `${formatNumber(visibleContacts.length)} shown` : 'Loading'} flush className="se-contacts-panel">
              {!data ? <p className="se-muted se-admin-pad">Flipping through the cards...</p> : null}
              {data && contacts.length === 0 ? (
                <div className="se-contacts-empty">
                  <strong>Your street book is empty.</strong>
                  <span>Add players by pimp number here, or from their public profile.</span>
                </div>
              ) : null}
              {data && contacts.length > 0 && visibleContacts.length === 0 ? (
                <div className="se-contacts-empty">
                  <strong>No contacts match this view.</strong>
                  <span>Clear the search or switch filters to see the rest of your rolodex.</span>
                </div>
              ) : null}
              {visibleContacts.length ? (
                <div className="se-tablewrap">
                  <table className="se-table se-table--cards se-contacts-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th className="se-table__number">National</th>
                        <th className="se-table__number">Net Worth</th>
                        <th>Seen</th>
                        <th>Private note</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleContacts.map((contact) => (
                        <ContactRow
                          key={contact.publicPimpId}
                          contact={contact}
                          busy={busy}
                          onSave={(next) => void run(() => contactsApi.note(contact.publicPimpId, next))}
                          onRemove={() => void run(() => contactsApi.remove(contact.publicPimpId))}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Panel>
          </div>

          <aside className="se-contacts-work__rail">
            <Panel title="Add a contact" aside={data ? `${formatNumber(slotsLeft)} open` : undefined} className="se-contacts-panel">
              <form onSubmit={(event) => void add(event)} className="se-contacts-form">
                <Field
                  label="Pimp number"
                  inputMode="numeric"
                  value={pimp}
                  onChange={(event) => setPimp(event.target.value)}
                  hint="Use the public number shown on a player's profile."
                />
                <Field
                  label="Private note (optional)"
                  maxLength={CONTACT_NOTE_MAX}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  hint="Only you can see notes."
                />
                <Button
                  type="submit"
                  className="se-btn se-btn--primary se-btn--block"
                  disabledReason={
                    busy
                      ? 'Still saving.'
                      : pimp.trim() === ''
                        ? 'Enter a pimp number first.'
                        : data && contacts.length >= data.max
                          ? 'Your contacts are full.'
                          : null
                  }
                >
                  Add contact
                </Button>
              </form>
            </Panel>

            <Panel title="What stays private" className="se-contacts-panel">
              <div className="se-contacts-privacy">
                <div>
                  <span>Your note</span>
                  <strong>Private</strong>
                </div>
                <div>
                  <span>Added contact</span>
                  <strong>Not announced</strong>
                </div>
                <div>
                  <span>Rank / worth / city</span>
                  <strong>Public standing</strong>
                </div>
                <div>
                  <span>Recon intel</span>
                  <strong>Never stored here</strong>
                </div>
              </div>
              <p className="se-hint">
                Contacts are a personal round-only rolodex. For private combat intelligence, use recon from the Raids tab instead.
              </p>
            </Panel>

            <Panel title="Quick links" className="se-contacts-panel">
              <div className="se-contacts-links">
                <Link to="/game/rankings">Browse rankings</Link>
                <Link to="/game/raids">Open Raids / recon</Link>
                <Link to="/game/alliance">Open Alliance</Link>
              </div>
            </Panel>
          </aside>
        </section>
      </div>
    </GameLayout>
  );
}
