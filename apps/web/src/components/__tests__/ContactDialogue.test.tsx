import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { PlayerQuestDto, QuestContactDto, QuestStorySceneDto } from '@streets/shared';
import { ContactDialogue } from '../ContactDialogue.js';
import { contactHistory, contactJobs, contactRoomHref, greetingFor, jobLine, lockedJobCount, storeSlugFor, type ContactRoomView } from '../../utils/contactRoom.js';

const pip: QuestContactDto = {
  key: 'PIP', name: 'Pip', shortName: 'Pip', role: 'Products & Distribution', description: 'Pip moves product.',
  points: 12, standing: 'Known', nextStandingAt: 25, faction: { key: 'CARTEL', name: 'The Cartel Line' }, independent: null,
} as QuestContactDto;

const scene: QuestStorySceneDto = {
  key: 'count_sheet', title: 'The count sheet', prose: 'Pip lays your receipt beside his count.',
  responses: [{ key: 'compare', label: 'Compare the totals' }], available: true, response: null,
};

function quest(key: string, status: PlayerQuestDto['status'], extra: Partial<PlayerQuestDto> = {}): PlayerQuestDto {
  return {
    key, title: key.replace(/_/g, ' '), description: `${key} description`, status, contactKey: 'PIP', contactName: 'Pip',
    category: 'STREET', type: 'STORY', branchChoices: [], factionStandings: [],
    objectives: [{ id: 'sale', kind: 'EVENT_COUNT', description: 'Sell to Pip.', current: status === 'AVAILABLE' ? 0 : 1, target: 1, completed: status !== 'AVAILABLE' && status !== 'ACTIVE', bonus: false }],
    rewards: [{ kind: 'CASH', amount: 250_000, label: '$2,500.00' }],
    story: { chapter: 'Act II', speaker: 'Pip', intro: 'Pip keeps two books.', inProgress: 'Trade with me.', ready: 'The shortage is real.', completed: 'I signed it.', actionHint: 'Make any trade at Pip’s counter.' },
    ...extra,
  } as PlayerQuestDto;
}

const noop = () => undefined;
const handlers = { onView: noop, onAccept: noop, onClaim: noop, onRespond: noop, onLeave: noop, onToggleHistory: noop };

function render(view: ContactRoomView, quests: PlayerQuestDto[], extra: { busy?: boolean; historyOpen?: boolean; history?: ReturnType<typeof contactHistory> | null } = {}) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ContactDialogue contact={pip} quests={quests} view={view} busy={extra.busy ?? false}
        historyOpen={extra.historyOpen ?? false} history={extra.history ?? null} handlers={handlers} />
    </MemoryRouter>,
  );
}

describe('contact room helpers', () => {
  it('links, greets and finds the counter', () => {
    expect(contactRoomHref('MAMA_KING')).toBe('/game/visit/mama_king');
    expect(greetingFor({ key: 'PIP', description: 'x' })).toMatch(/scale/);
    expect(greetingFor({ key: 'SOMEONE_NEW', description: 'Fallback line.' })).toBe('Fallback line.');
    expect(storeSlugFor('PIP')).toBe('pip');
    expect(storeSlugFor('LEDGER')).toBeNull();
  });

  it('lists a contact’s open work: ready, then active, then on offer, campaign first', () => {
    const quests = [
      quest('SIDE_OFFER', 'AVAILABLE'),
      quest('ML_OFFER', 'AVAILABLE', { category: 'CAMPAIGN' }),
      quest('ACTIVE_JOB', 'ACTIVE'),
      quest('READY_JOB', 'READY_TO_TURN_IN'),
      quest('LOCKED_JOB', 'LOCKED'),
      quest('DONE_JOB', 'COMPLETED'),
      { ...quest('TOMMY_JOB', 'AVAILABLE'), contactKey: 'TOMMY' },
    ];
    expect(contactJobs(quests, 'PIP').map((entry) => entry.key)).toEqual(['READY_JOB', 'ACTIVE_JOB', 'ML_OFFER', 'SIDE_OFFER']);
    expect(lockedJobCount(quests, 'PIP')).toBe(1);
  });

  it('speaks the line that fits where a job stands', () => {
    expect(jobLine(quest('A', 'AVAILABLE'))).toBe('Pip keeps two books.\n\nA description');
    expect(jobLine(quest('A', 'ACTIVE'))).toBe('Trade with me.');
    expect(jobLine(quest('A', 'READY_TO_TURN_IN'))).toBe('The shortage is real.');
    expect(jobLine(quest('A', 'ACTIVE', { story: { ...quest('A', 'ACTIVE').story!, scenes: [scene] } }))).toBe(scene.prose);
  });

  it('remembers finished business and the choices made in it', () => {
    const done = quest('ML_DONE', 'COMPLETED', { story: { ...quest('X', 'COMPLETED').story!, scenes: [{ ...scene, available: false, response: { key: 'compare', label: 'Compare the totals', outcome: 'They do not match.' } }] } });
    expect(contactHistory([done, quest('OPEN', 'ACTIVE')], 'PIP')).toEqual([
      { key: 'ML_DONE', title: 'ML DONE', closing: 'I signed it.', choices: [{ scene: 'The count sheet', choice: 'Compare the totals' }] },
    ]);
  });
});

describe('ContactDialogue', () => {
  it('opens with a greeting and the four ways a visit can go', () => {
    const html = render({ kind: 'hub' }, [quest('READY_JOB', 'READY_TO_TURN_IN'), quest('OFFER', 'AVAILABLE')]);
    expect(html).toContain('aria-labelledby="se-room-speaker"');
    expect(html).toContain('Buying, selling, or just here to look at my scale?');
    expect(html).toContain('Got any work for me?');
    expect(html).toContain('2 open · 1 ready to collect');
    expect(html).toContain('href="/game/stores/pip"');
    expect(html).toContain('Where do we stand?');
    expect(html).toContain('I’ve got to go.');
    expect(html).toContain('aria-expanded="false"');
  });

  it('lists the work on offer and says so when there is none', () => {
    expect(render({ kind: 'work' }, [quest('OFFER', 'AVAILABLE')])).toContain('OFFER');
    expect(render({ kind: 'work' }, [quest('LATER', 'LOCKED')])).toContain('Nothing for you yet.');
    expect(render({ kind: 'work' }, [])).toContain('Nothing for you right now.');
  });

  it('offers to take a job, plays an open scene as answers, and collects when ready', () => {
    const offer = render({ kind: 'job', questKey: 'OFFER' }, [quest('OFFER', 'AVAILABLE')]);
    expect(offer).toContain('I’ll take it.');
    expect(offer).toContain('Pays $2,500.00');

    const sceneQuest = quest('SCENE', 'ACTIVE', { story: { ...quest('X', 'ACTIVE').story!, scenes: [scene] } });
    const playing = render({ kind: 'job', questKey: 'SCENE' }, [sceneQuest]);
    expect(playing).toContain('Pip lays your receipt beside his count.');
    expect(playing).toContain('Compare the totals');
    expect(playing).toContain('Let me think about it.');

    const ready = render({ kind: 'job', questKey: 'READY' }, [quest('READY', 'READY_TO_TURN_IN')]);
    expect(ready).toContain('It’s done. (Collect payment)');

    const branching = render({ kind: 'job', questKey: 'READY' }, [quest('READY', 'READY_TO_TURN_IN', {
      branchChoices: [{ key: 'SIDE_A', title: 'Side with Pip', description: 'Pip owes you.', rewards: [], reputationDeltas: [] }],
    } as Partial<PlayerQuestDto>)]);
    expect(branching).toContain('Side with Pip');
    expect(branching).not.toContain('Collect payment');
  });

  it('shows the work still to do on an active job', () => {
    const html = render({ kind: 'job', questKey: 'ACTIVE' }, [quest('ACTIVE', 'ACTIVE')]);
    expect(html).toContain('Sell to Pip.');
    expect(html).toContain('Make any trade at Pip’s counter.');
    expect(html).toContain('I’m on it.');
  });

  it('says where the player stands', () => {
    const html = render({ kind: 'standing' }, []);
    expect(html).toContain('Known. 12 reputation; the next standing comes at 25.');
    expect(html).toContain('Works for The Cartel Line.');
  });

  it('disables answers while a request is going through, and numbers every option', () => {
    const html = render({ kind: 'hub' }, [], { busy: true });
    expect(html.match(/<button type="button" class="se-room__option" disabled=""/g)?.length).toBe(3);
    expect(html).toContain('<kbd aria-hidden="true">4</kbd>');
  });

  it('shows the history of finished business when opened', () => {
    expect(render({ kind: 'hub' }, [], { historyOpen: true, history: null })).toContain('Remembering…');
    expect(render({ kind: 'hub' }, [], { historyOpen: true, history: [] })).toContain('No finished business with Pip yet.');
    const html = render({ kind: 'hub' }, [], { historyOpen: true, history: [{ key: 'K', title: 'Pip’s Count', closing: 'I signed it.', choices: [{ scene: 'The count sheet', choice: 'Compare the totals' }] }] });
    expect(html).toContain('The count sheet: you chose “Compare the totals”');
  });
});
