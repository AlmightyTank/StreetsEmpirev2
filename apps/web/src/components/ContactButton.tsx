import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContactKindDto, ContactLookupDto } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { contactsApi } from '../api/playing-together.js';
import { Button } from './Button.js';

/** 0.3.0-D. Add a player to your contacts from their profile. Hidden on your own profile. */
export function ContactButton({ publicPimpId }: { publicPimpId: number }) {
  const [state, setState] = useState<ContactLookupDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setState(null);
    contactsApi.lookup(publicPimpId).then(setState).catch(() => setState(null));
  }, [publicPimpId]);

  if (!state || state.isYou) return null;
  if (state.contact) return <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/contacts">In your contacts</Link>;

  async function add(kind: ContactKindDto) {
    setBusy(true);
    setError(null);
    try {
      await contactsApi.add(publicPimpId, undefined, kind);
      setState(await contactsApi.lookup(publicPimpId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not add them.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="se-inline-actions" title={error ?? undefined}>
      <Button type="button" className="se-btn se-btn--ghost se-btn--sm"
        disabledReason={busy ? 'Adding...' : state.full ? 'Your contacts are full.' : null}
        onClick={() => void add('CONTACT')}>
        Add to contacts
      </Button>
      <Button type="button" className="se-btn se-btn--ghost se-btn--sm"
        disabledReason={busy ? 'Adding...' : state.full ? 'Your contacts are full.' : null}
        onClick={() => void add('ENEMY')}>
        Add enemy
      </Button>
      {error ? <span className="se-error">{error}</span> : null}
    </span>
  );
}
