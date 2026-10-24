import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { formatNumber } from '@streets/shared';
import { questsApi } from '../api/quests.js';
import { Alert } from '../components/Alert.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { useSession } from '../stores/session.js';
import { buildStoryArchive, type StoryArchive } from '../utils/storyArchive.js';

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Waiting for you',
  ACTIVE: 'In progress',
  READY_TO_TURN_IN: 'Ready to turn in',
  COMPLETED: 'Done',
};

/** Story campaign Slice J. The Missing Line so far: every chapter reached, what was said, what was chosen. */
export function StoryArchivePage() {
  const me = useSession((state) => state.me);
  const [archive, setArchive] = useState<StoryArchive | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([questsApi.page(), questsApi.history()])
      .then(([page, history]) => { if (live) setArchive(buildStoryArchive(history.quests, page.quests)); })
      .catch(() => { if (live) setError('The story could not be loaded. Try again in a moment.'); });
    return () => { live = false; };
  }, []);

  if (!me) return <Navigate to="/join" replace />;

  return (
    <GameLayout>
      <div className="se-quests se-story-archive">
        <header className="se-quests-hero">
          <div className="se-quests-hero__copy">
            <span className="se-eyebrow">The Missing Line</span>
            <h1>Your story so far</h1>
            <p>Every chapter you have reached, what you said along the way, and the choices you made.</p>
          </div>
          <div className="se-quests-hero__side">
            <div className="se-quests-hero__actions">
              <Link className="se-btn se-btn--ghost se-btn--sm" to="/game/quests">Back to jobs</Link>
            </div>
            <div className="se-quests-hero__readout">
              <span>
                <small>Chapters done</small>
                <strong>{archive ? `${formatNumber(archive.completed)}/${formatNumber(archive.total)}` : '—'}</strong>
              </span>
            </div>
          </div>
        </header>

        {error ? <Alert tone="error">{error}</Alert> : null}
        {!archive && !error ? <p className="se-muted">Opening the book...</p> : null}

        {archive?.ending ? (
          <Panel title="How it ended" className="se-mb">
            <p><strong>{archive.ending.title}</strong></p>
            {archive.ending.closing ? <p className="se-story-archive__closing">{archive.ending.closing}</p> : null}
          </Panel>
        ) : null}

        {archive && archive.sections.length === 0 ? (
          <Panel title="Nothing written yet" className="se-mb">
            <p>Mama King has a receipt for you. Start the story from the <Link to="/game/quests">job board</Link>.</p>
          </Panel>
        ) : null}

        {archive?.sections.map((section) => (
          <Panel key={`${section.arc}/${section.chapter}`} title={section.chapter} aside={section.arc === 'SIDE' ? 'Side story' : undefined} className="se-mb">
            <ol className="se-story-archive__list">
              {section.entries.map((entry) => (
                <li key={entry.key} className="se-story-archive__entry">
                  <div className="se-story-archive__head">
                    <strong>{entry.title}</strong>
                    <span className={`se-tag ${entry.status === 'COMPLETED' ? 'se-tag--good' : ''}`}>{STATUS_LABEL[entry.status] ?? entry.status}</span>
                  </div>
                  {entry.speaker ? <span className="se-muted">{entry.speaker}</span> : null}
                  {entry.answers.map((answer) => (
                    <p key={answer.scene} className="se-story-archive__answer">
                      <span className="se-muted">{answer.scene}:</span> “{answer.label}”
                      {answer.outcome ? <><br /><span className="se-muted">{answer.outcome}</span></> : null}
                    </p>
                  ))}
                  {entry.choice ? <p className="se-story-archive__answer"><span className="se-muted">You chose:</span> <strong>{entry.choice}</strong></p> : null}
                  {entry.closing ? <p className="se-story-archive__closing">{entry.closing}</p> : null}
                </li>
              ))}
            </ol>
          </Panel>
        ))}
      </div>
    </GameLayout>
  );
}
