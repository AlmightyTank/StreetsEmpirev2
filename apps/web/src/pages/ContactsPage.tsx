import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { BlockedRolodexDto, ContactDto, ContactKindDto, ContactsDto } from '@streets/shared';
import { CONTACT_NOTE_MAX, formatCents, formatNumber } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { contactsApi } from '../api/playing-together.js';
import { Alert } from '../components/Alert.js';
import { AllianceTag } from '../components/AllianceTag.js';
import { Button } from '../components/Button.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';

type ContactView = 'all' | 'contacts' | 'enemies' | 'alliance' | 'blocked';

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

function until(iso: string): string {
  const minutes = Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return 'expired';
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.ceil(minutes / 60);
  return hours < 48 ? `${hours}h left` : `${Math.ceil(hours / 24)}d left`;
}

function battleKindLabel(kind: string): string {
  return kind.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function intelLines(contact: ContactDto): string[] {
  const lines: string[] = [];
  if (contact.intel.payback.available) {
    lines.push(`Payback open${contact.intel.payback.until ? ` · ${until(contact.intel.payback.until)}` : ''}${contact.intel.payback.source === 'alliance' ? ' · alliance hit' : ''}`);
  }
  if (contact.intel.sharedAlliance) {
    lines.push('Current alliance member');
  }
  if (contact.intel.lastBattle) {
    const battle = contact.intel.lastBattle;
    lines.push(`${battleKindLabel(battle.kind)} ${battle.role === 'ATTACKER' ? 'sent' : 'received'} · ${battle.won ? 'won' : 'lost'} · ${ago(battle.at)}`);
  }
  if (contact.intel.lastRecon) {
    lines.push(`Recon ${ago(contact.intel.lastRecon.at)} · ${contact.intel.lastRecon.cashBand} cash · ${contact.intel.lastRecon.strengthBand} strength`);
  }
  if (contact.intel.turf.blocksWon || contact.intel.turf.blocksLost) {
    lines.push(`Turf ${formatNumber(contact.intel.turf.blocksWon)} won / ${formatNumber(contact.intel.turf.blocksLost)} lost`);
  }
  return lines;
}

function ContactRow({ contact, busy, onSave, onKind, onRemove }: {
  contact: ContactDto;
  busy: boolean;
  onSave: (note: string) => void;
  onKind: (kind: ContactKindDto) => void;
  onRemove: () => void;
}) {
  const [note, setNote] = useState(contact.note);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setNote(contact.note), [contact.note]);

  const active = isActive(contact);
  const lines = intelLines(contact);
  const nextKind: ContactKindDto = contact.kind === 'CONTACT' ? 'ENEMY' : 'CONTACT';

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
            <span className={`se-tag ${contact.kind === 'ENEMY' ? 'se-tag--bad' : 'se-tag--dim'}`}>
              {contact.kind === 'ENEMY' ? 'Enemy' : 'Contact'}
            </span>
            {!contact.standing ? (
              <span className="se-tag se-tag--dim">Gone</span>
            ) : active ? (
              <span className="se-tag se-tag--good">Active</span>
            ) : (
              <span className="se-tag se-tag--dim">Quiet</span>
            )}
            {contact.blocked ? <span className="se-tag se-tag--bad">Blocked</span> : null}
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
      <td data-label="Intel" className="se-contact__intel">
        {lines.length ? (
          <ul>
            {lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        ) : (
          <span className="se-muted">No earned history yet</span>
        )}
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
          <Button
            type="button"
            className="se-btn se-btn--ghost se-btn--sm"
            disabledReason={busy ? 'Still saving.' : null}
            onClick={() => onKind(nextKind)}
          >
            {nextKind === 'ENEMY' ? 'Mark enemy' : 'Mark contact'}
          </Button>
          <Link className="se-btn se-btn--ghost se-btn--sm" to={`/game/console?to=${contact.publicPimpId}`}>
            Message
          </Link>
          <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/combat">
            Recon / Raid
          </Link>
          {contact.blocked ? (
            <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/console">
              Manage block
            </Link>
          ) : null}
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

function BlockedRow({ player }: { player: BlockedRolodexDto }) {
  return (
    <tr>
      <td className="se-td--title">
        <div className="se-contacts-person">
          <div className="se-contacts-person__name">
            <AllianceTag alliance={player.alliance} />
            <Link to={`/game/players/${player.publicPimpId}`} className="se-playerlink">
              {player.displayName}
            </Link>
            <span className="se-muted se-num">#{player.publicPimpId}</span>
          </div>
          <div className="se-contacts-person__status">
            <span className="se-tag se-tag--bad">Blocked</span>
            {player.isContact ? <span className="se-tag se-tag--dim">In rolodex</span> : null}
          </div>
        </div>
      </td>
      <td data-label="Blocked">{ago(player.blockedAt)}</td>
      <td data-label="Actions">
        <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/console">
          Manage block
        </Link>
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
  const [kind, setKind] = useState<ContactKindDto>('CONTACT');
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
    if (await run(() => contactsApi.add(id, note.trim() || undefined, kind))) {
      setPimp('');
      setKind('CONTACT');
      setNote('');
    }
  }

  const contacts = data?.contacts ?? [];
  const blocked = data?.blocked ?? [];
  const slotsLeft = data ? Math.max(0, data.max - contacts.length) : 0;

  const visibleContacts = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return contacts.filter((contact) => {
      if (view === 'contacts' && contact.kind !== 'CONTACT') return false;
      if (view === 'enemies' && contact.kind !== 'ENEMY') return false;
      if (view === 'alliance' && !contact.categories.includes('ALLIANCE')) return false;
      if (view === 'blocked') return false;
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

  const visibleBlocked = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return blocked.filter((player) => {
      if (view !== 'blocked') return false;
      if (!needle) return true;
      return [
        player.displayName,
        String(player.publicPimpId),
        player.alliance?.name ?? '',
        player.alliance?.tag ?? '',
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [blocked, query, view]);

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
              <small>Enemies</small>
              <strong>{data ? formatNumber(data.counts.ENEMY) : '—'}</strong>
            </span>
            <span>
              <small>Alliance</small>
              <strong>{data ? formatNumber(data.counts.ALLIANCE) : '—'}</strong>
            </span>
            <span>
              <small>Blocked</small>
              <strong>{data ? formatNumber(data.counts.BLOCKED) : '—'}</strong>
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
                  ['all', 'All', data?.counts.ALL ?? contacts.length],
                  ['contacts', 'Contacts', data?.counts.CONTACT ?? 0],
                  ['enemies', 'Enemies', data?.counts.ENEMY ?? 0],
                  ['alliance', 'Alliance', data?.counts.ALLIANCE ?? 0],
                  ['blocked', 'Blocked', data?.counts.BLOCKED ?? blocked.length],
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

            <Panel title={view === 'blocked' ? 'Blocked players' : 'Street book'} aside={data ? `${formatNumber(view === 'blocked' ? visibleBlocked.length : visibleContacts.length)} shown` : 'Loading'} flush className="se-contacts-panel">
              {!data ? <p className="se-muted se-admin-pad">Flipping through the cards...</p> : null}
              {data && view !== 'blocked' && contacts.length === 0 ? (
                <div className="se-contacts-empty">
                  <strong>Your street book is empty.</strong>
                  <span>Add players by pimp number here, or from their public profile.</span>
                </div>
              ) : null}
              {data && view !== 'blocked' && contacts.length > 0 && visibleContacts.length === 0 ? (
                <div className="se-contacts-empty">
                  <strong>No contacts match this view.</strong>
                  <span>Clear the search or switch filters to see the rest of your rolodex.</span>
                </div>
              ) : null}
              {data && view === 'blocked' && visibleBlocked.length === 0 ? (
                <div className="se-contacts-empty">
                  <strong>No blocked players match this view.</strong>
                  <span>Blocks are account-wide and managed from the Console.</span>
                </div>
              ) : null}
              {view === 'blocked' && visibleBlocked.length ? (
                <div className="se-tablewrap">
                  <table className="se-table se-table--cards se-contacts-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Blocked</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBlocked.map((player) => <BlockedRow key={player.publicPimpId} player={player} />)}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {view !== 'blocked' && visibleContacts.length ? (
                <div className="se-tablewrap">
                  <table className="se-table se-table--cards se-contacts-table">
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th className="se-table__number">National</th>
                        <th className="se-table__number">Net Worth</th>
                        <th>Seen</th>
                        <th>Private note</th>
                        <th>Earned intel</th>
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
                          onKind={(next) => void run(() => contactsApi.kind(contact.publicPimpId, next))}
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
                <label className="se-contacts-kind">
                  <span>Lane</span>
                  <select className="se-input" value={kind} onChange={(event) => setKind(event.target.value as ContactKindDto)}>
                    <option value="CONTACT">Contact</option>
                    <option value="ENEMY">Enemy</option>
                  </select>
                </label>
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
                  <strong>Earned only</strong>
                </div>
              </div>
              <p className="se-hint">
                Contacts are a personal round-only rolodex. Battle, turf and recon context appears only after your crew legitimately learned it.
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
