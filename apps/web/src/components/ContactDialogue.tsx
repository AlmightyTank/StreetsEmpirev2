import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatNumber, type PlayerQuestDto, type QuestContactDto } from '@streets/shared';
import { QuestLink, questHref } from './QuestLink.js';
import {
  contactJobs,
  greetingFor,
  jobLine,
  jobStatusLabel,
  lockedJobCount,
  openScene,
  storeSlugFor,
  type ContactHistoryEntry,
  type ContactRoomView,
} from '../utils/contactRoom.js';
import { Portrait } from './Portrait.js';
import { StoryProse } from './QuestStoryScenes.js';

export interface ContactDialogueHandlers {
  onView: (view: ContactRoomView) => void;
  onAccept: (questKey: string) => void;
  onClaim: (questKey: string, branchKey?: string, branchTitle?: string) => void;
  onRespond: (questKey: string, sceneKey: string, responseKey: string, responseLabel: string) => void;
  onLeave: () => void;
  onToggleHistory: () => void;
}

interface Option {
  key: string;
  icon: string;
  label: ReactNode;
  detail?: string;
  onSelect?: () => void;
  to?: string;
}

function Options({ options, busy }: { options: Option[]; busy: boolean }) {
  return (
    <ol className="se-room__options" data-room-options="">
      {options.map((option, index) => (
        <li key={option.key}>
          {option.to ? (
            <Link className="se-room__option" to={option.to}>
              <span className="se-room__option-icon" aria-hidden="true">{option.icon}</span>
              <span className="se-room__option-label">{option.label}</span>
              <kbd aria-hidden="true">{index + 1}</kbd>
            </Link>
          ) : (
            <button type="button" className="se-room__option" disabled={busy} onClick={option.onSelect}>
              <span className="se-room__option-icon" aria-hidden="true">{option.icon}</span>
              <span className="se-room__option-label">
                {option.label}
                {option.detail ? <small>{option.detail}</small> : null}
              </span>
              <kbd aria-hidden="true">{index + 1}</kbd>
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

function lastOutcome(quest: PlayerQuestDto): string | null {
  const answered = (quest.story?.scenes ?? []).filter((scene) => scene.response);
  return answered.at(-1)?.response?.outcome ?? null;
}

function prerequisiteStatus(quest: PlayerQuestDto): string {
  switch (quest.status) {
    case 'AVAILABLE': return 'Available now';
    case 'ACTIVE': return 'In progress';
    case 'READY_TO_TURN_IN': return 'Ready to collect';
    case 'COMPLETED': return 'Completed';
    case 'LOCKED': return 'Locked';
    default: return 'Not available';
  }
}

/** A visit with one contact: what they say, and the player's answers as numbered options. */
export function ContactDialogue({
  contact,
  quests,
  view,
  busy,
  historyOpen,
  history,
  handlers,
}: {
  contact: QuestContactDto;
  quests: readonly PlayerQuestDto[];
  view: ContactRoomView;
  busy: boolean;
  historyOpen: boolean;
  history: ContactHistoryEntry[] | null;
  handlers: ContactDialogueHandlers;
}) {
  const jobs = contactJobs(quests, contact.key);
  const locked = lockedJobCount(quests, contact.key);
  const ready = jobs.filter((quest) => quest.status === 'READY_TO_TURN_IN').length;
  const store = storeSlugFor(contact.key);
  const back = (label: string, to: ContactRoomView = { kind: 'hub' }): Option => ({
    key: 'back', icon: '↩', label, onSelect: () => handlers.onView(to),
  });

  let line: string;
  let extra: ReactNode = null;
  let options: Option[];

  const job = view.kind === 'job' ? quests.find((quest) => quest.key === view.questKey && quest.contactKey === contact.key) : undefined;

  if (view.kind === 'job' && job) {
    const scene = openScene(job);
    const outcome = lastOutcome(job);
    if (job.status === 'LOCKED') {
      line = 'I can’t put you on this job yet. Here’s what needs to happen first.';
      extra = (
        <div className="se-room__job">
          <span className="se-eyebrow">{job.title} · Locked</span>
          <p className="se-hint">{job.description}</p>
          {job.requires?.length ? (
            <div className="se-room__requirements">
              <span className="se-eyebrow">Still required</span>
              <ul>
                {job.requires.map((requirement, index) => {
                  const prerequisite = requirement.questKey ? quests.find((entry) => entry.key === requirement.questKey) : undefined;
                  return (
                    <li key={`${requirement.questKey ?? requirement.label}:${index}`}>
                      {prerequisite ? (
                        <>
                          <QuestLink quest={{ key: prerequisite.key, title: prerequisite.title, giverName: prerequisite.contactName }} />
                          <span className="se-room__requirement-status">{prerequisiteStatus(prerequisite)}</span>
                        </>
                      ) : requirement.label}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : <p className="se-room__hint">The next step has not been posted yet. Check back after more of your current work.</p>}
        </div>
      );
      options = [
        ...(job.requires ?? []).flatMap((requirement): Option[] => {
          if (!requirement.questKey) return [];
          const prerequisite = quests.find((entry) => entry.key === requirement.questKey);
          if (!prerequisite) return [];
          return [{
            key: 'prerequisite:' + prerequisite.key,
            icon: '↖',
            label: `Open ${prerequisite.title}`,
            detail: prerequisiteStatus(prerequisite),
            to: questHref(prerequisite.key),
          }];
        }),
        back('Back to this contact’s work.', { kind: 'work' }),
      ];
    } else {
      line = job.status === 'READY_TO_TURN_IN' && outcome ? `${outcome}\n\n${jobLine(job)}` : jobLine(job);
      extra = (
        <div className="se-room__job">
          <span className="se-eyebrow">{job.story?.chapter ? `${job.story.chapter} · ` : ''}{job.title} · {jobStatusLabel(job)}</span>
          {job.status !== 'AVAILABLE' ? (
            <ul className="se-room__objectives">
              {job.objectives.filter((objective) => !objective.bonus).map((objective) => (
                <li key={objective.id} className={objective.completed ? 'is-done' : undefined}>
                  {objective.description} <span className="se-num">{formatNumber(objective.current)} / {formatNumber(objective.target)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {job.rewards.length ? <p className="se-hint">Pays {job.rewards.map((reward) => reward.label).join(' · ')}</p> : null}
        </div>
      );
      if (job.status === 'AVAILABLE') {
        options = [
          { key: 'accept', icon: '✓', label: 'I’ll take it.', onSelect: () => handlers.onAccept(job.key) },
          back('Not right now.', { kind: 'work' }),
        ];
      } else if (scene) {
        options = [
          ...scene.responses.map((response): Option => ({
            key: 'response:' + response.key, icon: '›', label: response.label,
            onSelect: () => handlers.onRespond(job.key, scene.key, response.key, response.label),
          })),
          back('Let me think about it.', { kind: 'work' }),
        ];
      } else if (job.status === 'READY_TO_TURN_IN') {
        options = [
          ...(job.branchChoices.length
            ? job.branchChoices.map((choice): Option => ({
                key: 'branch:' + choice.key, icon: '⚖', label: choice.title, detail: choice.description,
                onSelect: () => handlers.onClaim(job.key, choice.key, choice.title),
              }))
            : [{ key: 'claim', icon: '$', label: 'It’s done. (Collect payment)', onSelect: () => handlers.onClaim(job.key) }]),
          back('Later.', { kind: 'work' }),
        ];
      } else {
        options = [back('I’m on it.', { kind: 'work' })];
        if (job.story?.actionHint) extra = <>{extra}<p className="se-room__hint">{job.story.actionHint}</p></>;
      }
    }
  } else if (view.kind === 'work' || view.kind === 'job') {
    line = jobs.length
      ? (ready ? 'You’ve got something for me. Good. And there’s more where that came from.' : 'Here’s what I’ve got.')
      : locked
        ? 'Nothing for you yet. Finish what’s in front of you and come back.'
        : 'Nothing for you right now.';
    options = [
      ...jobs.map((quest): Option => ({
        key: 'job:' + quest.key, icon: quest.status === 'READY_TO_TURN_IN' ? '$' : openScene(quest) ? '!' : '•',
        label: quest.title, detail: jobStatusLabel(quest),
        onSelect: () => handlers.onView({ kind: 'job', questKey: quest.key }),
      })),
      back('Something else.'),
    ];
  } else if (view.kind === 'standing') {
    line = `${contact.standing}. ${formatNumber(contact.points)} reputation`
      + (contact.nextStandingAt === null ? ', as high as it goes.' : `; the next standing comes at ${formatNumber(contact.nextStandingAt)}.`)
      + (contact.faction ? `\n\nWorks for ${contact.faction.name}.` : contact.independent ? `\n\n${contact.independent}` : '');
    options = [back('Good to know.')];
  } else {
    line = greetingFor(contact);
    options = [
      {
        key: 'work', icon: '✓', label: 'Got any work for me?',
        detail: jobs.length ? `${formatNumber(jobs.length)} open${ready ? ` · ${formatNumber(ready)} ready to collect` : ''}` : undefined,
        onSelect: () => handlers.onView({ kind: 'work' }),
      },
      ...(store ? [{ key: 'trade', icon: '⇄', label: 'Want to trade?', to: `/game/stores/${store}` }] : []),
      { key: 'standing', icon: '★', label: 'Where do we stand?', onSelect: () => handlers.onView({ kind: 'standing' }) },
      { key: 'leave', icon: '⎋', label: 'I’ve got to go.', onSelect: handlers.onLeave },
    ];
  }

  return (
    <section className="se-room__dialogue" aria-labelledby="se-room-speaker">
      <header className="se-room__head">
        <Portrait who={contact.key} size="sm" label={contact.name} />
        <h1 id="se-room-speaker">{contact.shortName}</h1>
        <span className="se-room__role">{contact.role}</span>
        <button type="button" className="se-room__history-toggle" aria-expanded={historyOpen} aria-controls="se-room-history" onClick={handlers.onToggleHistory}>
          {historyOpen ? 'Hide history' : 'Show history'}
        </button>
      </header>
      {historyOpen ? (
        <div id="se-room-history" className="se-room__history">
          {history === null ? <p className="se-hint" role="status">Remembering…</p>
            : history.length ? history.map((entry) => (
              <article key={entry.key}>
                <strong>{entry.title}</strong>
                {entry.choices.map((choice) => <p key={choice.scene} className="se-room__choice">{choice.scene}: you chose “{choice.choice}”</p>)}
                <StoryProse text={entry.closing} />
              </article>
            )) : <p className="se-hint">No finished business with {contact.shortName} yet.</p>}
        </div>
      ) : null}
      <div className="se-room__line" aria-live="polite">
        <StoryProse text={line} />
      </div>
      {extra}
      <Options options={options} busy={busy} />
    </section>
  );
}
