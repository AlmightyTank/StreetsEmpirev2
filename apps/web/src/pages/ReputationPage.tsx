import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { formatNumber, type QuestPageDto } from '@streets/shared';
import { questsApi } from '../api/quests.js';
import { Alert } from '../components/Alert.js';
import { Panel, Row } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';

export function ReputationPage() {
  const me = useSession((state) => state.me);
  const [page, setPage] = useState<QuestPageDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    questsApi.page()
      .then((value) => {
        setPage(value);
        setError(null);
      })
      .catch(() => setError('Could not read your contact standing right now.'));
  }, []);

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">Underworld Contacts</h1>
          <p className="se-eyebrow">Who knows you, what they handle, and how much they trust you</p>
        </div>
        <Link className="se-btn se-btn--primary" to="/game/quests">View quests</Link>
      </div>

      {error ? <Alert>{error}</Alert> : null}

      {page ? (
        <div className="se-grid">
          {page.contacts.map((contact) => (
            <Panel
              key={contact.key}
              title={contact.name}
              aside={<span className="se-num se-dim">{contact.standing}</span>}
            >
              <p className="se-eyebrow">{contact.role}</p>
              <p className="se-hint">{contact.description}</p>
              <div className="se-rows">
                <Row label="Reputation" value={formatNumber(contact.points)} strong />
                <Row
                  label="Next standing"
                  value={contact.nextStandingAt === null ? 'Max standing' : formatNumber(contact.nextStandingAt)}
                />
                <Row
                  label="Jobs"
                  value={formatNumber(page.quests.filter((quest) => quest.contactKey === contact.key && quest.status !== 'LOCKED').length)}
                />
              </div>
            </Panel>
          ))}
        </div>
      ) : !error ? <p className="se-muted" role="status">Checking your contacts...</p> : null}
    </GameLayout>
  );
}
