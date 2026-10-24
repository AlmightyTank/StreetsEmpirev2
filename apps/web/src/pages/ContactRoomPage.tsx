import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import type { PlayerQuestDto, QuestPageDto } from '@streets/shared';
import { ApiError } from '../api/client.js';
import { questsApi } from '../api/quests.js';
import { Alert } from '../components/Alert.js';
import { ContactDialogue } from '../components/ContactDialogue.js';
import { portraitUrl } from '../components/Portrait.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { publishQuestsChanged, trackedFromQuests } from '../quests/questSignals.js';
import { confirmAction } from '../stores/confirm.js';
import { useSession } from '../stores/session.js';
import { contactHistory, roomSetting, type ContactHistoryEntry, type ContactRoomView } from '../utils/contactRoom.js';

/** A visit with one contact: their room, what they say, and the player's answers. */
export function ContactRoomPage() {
  const me = useSession((state) => state.me);
  const refreshSnapshot = useSession((state) => state.refreshSnapshot);
  const navigate = useNavigate();
  const contactKey = String(useParams().contactKey ?? '').toUpperCase();
  const [page, setPage] = useState<QuestPageDto | null>(null);
  const [view, setView] = useState<ContactRoomView>({ kind: 'hub' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ContactHistoryEntry[] | null>(null);
  const roomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const next = await questsApi.page();
      setPage(next);
      setError(null);
      return next;
    } catch {
      setError('Nobody is answering the door right now. Try again in a moment.');
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setView({ kind: 'hub' });
    setHistory(null);
    setHistoryOpen(false);
  }, [contactKey]);

  const loadHistory = useCallback(async () => {
    try {
      const { quests } = await questsApi.history();
      setHistory(contactHistory(quests, contactKey));
    } catch {
      setHistory([]);
    }
  }, [contactKey]);

  function published(next: QuestPageDto) {
    setPage(next);
    publishQuestsChanged({ scope: 'board', quests: next.quests, tracked: trackedFromQuests(next.quests) });
  }

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : failure);
    } finally {
      setBusy(false);
    }
  }

  const accept = (questKey: string) => run(async () => {
    published(await questsApi.accept(questKey, crypto.randomUUID()));
    setNotice('Job accepted.');
  }, 'That job could not be taken.');

  const respond = async (questKey: string, sceneKey: string, responseKey: string, responseLabel: string) => {
    const confirmed = await confirmAction({
      title: `Choose "${responseLabel}"?`,
      body: 'Your choice is part of the story from here on. You cannot change it for this job.',
      confirmLabel: 'Make this choice',
    });
    if (!confirmed) return;
    await run(async () => {
      published(await questsApi.respondToScene(questKey, sceneKey, responseKey));
      if (history) setHistory(null);
    }, 'That choice could not be made.');
  };

  const claim = async (questKey: string, branchKey?: string, branchTitle?: string) => {
    const quest: PlayerQuestDto | undefined = page?.quests.find((entry) => entry.key === questKey);
    const locking = quest?.factionStandings.filter((standing) => standing.locks?.length) ?? [];
    if (locking.length && !(await confirmAction({
      title: `Join ${locking.map((standing) => standing.factionName).join(' and ')}'s Inner Circle?`,
      body: locking.map((standing) => `This locks ${standing.locks!.join(' and ')}'s Inner Circle for the rest of the season.`).join(' '),
      confirmLabel: 'Collect and join',
    }))) return;
    if (branchKey && !(await confirmAction({
      title: `Choose "${branchTitle ?? branchKey}"?`,
      body: 'This choice is permanent for this round and locks the other follow-up path.',
      confirmLabel: 'Choose this path',
    }))) return;
    await run(async () => {
      const result = await questsApi.claim(questKey, crypto.randomUUID(), branchKey);
      useSession.getState().applyActionSnapshot(result.after, result.rankChanges);
      setNotice(`${result.result.title}: payment collected. ${result.result.rewards.map((reward) => reward.label).join(' · ')}`);
      const next = await load();
      if (next) publishQuestsChanged({ scope: 'action', quests: next.quests, tracked: trackedFromQuests(next.quests) });
      setHistory(null);
      setView({ kind: 'work' });
      void refreshSnapshot({ background: true });
    }, 'Payment could not be collected.');
  };

  // Number keys pick the matching option, as in a dialogue menu.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (document.querySelector('[role="alertdialog"]')) return;
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index > 8) return;
      const option = roomRef.current?.querySelectorAll<HTMLElement>('[data-room-options] .se-room__option')[index];
      if (option && !(option as HTMLButtonElement).disabled) {
        event.preventDefault();
        option.click();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!me) return <Navigate to="/join" replace />;

  const contact = page?.contacts.find((entry) => entry.key === contactKey) ?? null;
  const art = contact ? portraitUrl(contact.key) : null;
  const setting = contact && page ? roomSetting(page.quests, contact.key, view) : null;

  return (
    <GameLayout>
      <div
        className="se-room"
        data-contact={contactKey.toLowerCase()}
        ref={roomRef}
        style={setting ? { '--room-art': `url('${setting.art}')` } as CSSProperties : undefined}
      >
        {setting ? <p className="se-room__place" aria-live="polite">{setting.name}</p> : null}
        <div className="se-room__scene" aria-hidden="true">
          {art
            ? <img className="se-room__figure" src={art} alt="" draggable={false} />
            : contact ? <span className="se-room__figure se-room__figure--silhouette" /> : null}
        </div>
        <div className="se-room__front">
          <Link className="se-room__leave" to="/game/quests#contact-standing">← All contacts</Link>
          {error ? <Alert>{error}</Alert> : null}
          {notice ? <Alert tone="success">{notice}</Alert> : null}
          {contact && page ? (
            <ContactDialogue
              contact={contact}
              quests={page.quests}
              view={view}
              busy={busy}
              historyOpen={historyOpen}
              history={history}
              handlers={{
                onView: (next) => { setNotice(null); setView(next); },
                onAccept: (questKey) => void accept(questKey),
                onClaim: (questKey, branchKey, branchTitle) => void claim(questKey, branchKey, branchTitle),
                onRespond: (questKey, sceneKey, responseKey, label) => void respond(questKey, sceneKey, responseKey, label),
                onLeave: () => navigate('/game/quests#contact-standing'),
                onToggleHistory: () => {
                  const open = !historyOpen;
                  setHistoryOpen(open);
                  if (open && history === null) void loadHistory();
                },
              }}
            />
          ) : page ? (
            <section className="se-room__dialogue">
              <p className="se-room__line">Nobody by that name works this city.</p>
              <Link className="se-btn" to="/game/quests#contact-standing">Back to your contacts</Link>
            </section>
          ) : !error ? <p className="se-room__line" role="status">Knocking…</p> : null}
        </div>
      </div>
    </GameLayout>
  );
}
