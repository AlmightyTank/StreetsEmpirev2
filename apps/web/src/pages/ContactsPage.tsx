import { useEffect, useState, type FormEvent } from 'react';
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

function ago(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
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

  return (
    <tr>
      <td className="se-td--title">
        <AllianceTag alliance={contact.alliance} />
        <Link to={`/game/players/${contact.publicPimpId}`} className="se-playerlink">
          {contact.displayName} <span className="se-muted se-num">(#{contact.publicPimpId})</span>
        </Link>
        {contact.standing ? null : <span className="se-tag se-tag--dim">Gone</span>}
      </td>
      <td className="se-table__number se-num" data-label="National">{contact.standing ? `#${formatNumber(contact.standing.nationalRank)}` : '-'}</td>
      <td className="se-table__number se-num" data-label="Net worth">{contact.standing ? formatCents(contact.standing.netWorthCents) : '-'}</td>
      <td data-label="Seen">{contact.standing ? ago(contact.standing.lastActiveAt) : '-'}</td>
      <td data-label="Note" className="se-contact__note">
        <input className="se-input" aria-label={`Note on ${contact.displayName}`} maxLength={CONTACT_NOTE_MAX} value={note}
          placeholder="Private note" onChange={(event) => setNote(event.target.value)} />
      </td>
      <td data-label="">
        <span className="se-inline-actions">
          <Button type="button" className="se-btn se-btn--ghost se-btn--sm" disabledReason={busy ? 'Still saving.' : note === contact.note ? 'Nothing changed.' : null}
            onClick={() => onSave(note)}>Save</Button>
          {confirming ? (
            <Button type="button" className="se-btn se-btn--primary se-btn--sm" disabledReason={busy ? 'Still saving.' : null} onClick={onRemove}>Confirm</Button>
          ) : (
            <button type="button" className="se-btn se-btn--ghost se-btn--sm" onClick={() => setConfirming(true)}>Remove</button>
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

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Contacts</h1>
          <p className="se-eyebrow">Your private rolodex for this round</p>
        </div>
        {data ? <div className="se-pagehead__right se-eyebrow">{formatNumber(data.contacts.length)} / {formatNumber(data.max)}</div> : null}
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <div className="se-grid se-grid--2 se-mb">
        <Panel title="Add a contact">
          <form onSubmit={(event) => void add(event)}>
            <Field label="Pimp number" inputMode="numeric" value={pimp} onChange={(event) => setPimp(event.target.value)} />
            <Field label="Note (optional)" maxLength={CONTACT_NOTE_MAX} value={note} onChange={(event) => setNote(event.target.value)} hint="Only you can see notes." />
            <Button type="submit" className="se-btn se-btn--primary se-btn--block"
              disabledReason={busy ? 'Still saving.' : pimp.trim() === '' ? 'Enter a pimp number first.' : data && data.contacts.length >= data.max ? 'Your contacts are full.' : null}>
              Add contact
            </Button>
          </form>
        </Panel>
        <Panel title="What this shows">
          <p className="se-dim">
            Only public standing: rank, net worth, alliance and when they were last seen. Recon intel never lands
            here, and nobody is told you added them.
          </p>
        </Panel>
      </div>

      <Panel title="Tracked players" flush>
        {!data ? <p className="se-muted se-admin-pad">Flipping through the cards...</p> : null}
        {data && data.contacts.length === 0 ? (
          <p className="se-muted se-admin-pad">Nobody yet. Add players by pimp number, or from their profile.</p>
        ) : null}
        {data?.contacts.length ? (
          <div className="se-tablewrap">
            <table className="se-table se-table--cards">
              <thead>
                <tr>
                  <th>Player</th>
                  <th className="se-table__number">National</th>
                  <th className="se-table__number">Net Worth</th>
                  <th>Seen</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.contacts.map((contact) => (
                  <ContactRow key={contact.publicPimpId} contact={contact} busy={busy}
                    onSave={(next) => void run(() => contactsApi.note(contact.publicPimpId, next))}
                    onRemove={() => void run(() => contactsApi.remove(contact.publicPimpId))} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
    </GameLayout>
  );
}
