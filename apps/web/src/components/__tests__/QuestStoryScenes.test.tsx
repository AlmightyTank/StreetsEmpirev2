import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerQuestDto, QuestStorySceneDto } from '@streets/shared';
import { hasOpenScene, QuestStoryScenes, StoryProse } from '../QuestStoryScenes.js';

const scene: QuestStorySceneDto = {
  key: 'night_receipt',
  title: 'The receipt',
  prose: 'The amount is right.\n\nOne line has been rubbed almost through the paper.',
  responses: [
    { key: 'return_unopened', label: 'Return it unopened' },
    { key: 'read_the_line', label: 'Read the erased line' },
  ],
  available: false,
  response: null,
};

function quest(status: PlayerQuestDto['status'], scenes: QuestStorySceneDto[]): PlayerQuestDto {
  return {
    key: 'ML_M01_NIGHT_RECEIPT',
    status,
    story: {
      chapter: 'Act I', speaker: 'Mama King', intro: 'Rain.', inProgress: 'Rain.', ready: 'Done.', completed: 'Closed.',
      actionHint: 'Read the receipt.', scenes,
    },
  } as PlayerQuestDto;
}

const render = (value: PlayerQuestDto, busy: string | null = null) =>
  renderToStaticMarkup(<QuestStoryScenes quest={value} busy={busy} onRespond={() => undefined} />);

describe('QuestStoryScenes', () => {
  it('renders nothing for a job without scenes', () => {
    expect(render(quest('ACTIVE', []))).toBe('');
    expect(render({ ...quest('ACTIVE', []), story: undefined })).toBe('');
  });

  it('keeps a scene closed, without its prose, until it can be played', () => {
    const available = render(quest('AVAILABLE', [scene]));
    expect(available).toContain('The receipt');
    expect(available).toContain('Take the job to play this scene.');
    expect(available).not.toContain('rubbed almost through');
    expect(available).not.toContain('<button');
    expect(render(quest('ACTIVE', [scene]))).toContain('Opens once the work before it is done.');
  });

  it('shows the prose and one button per response when the scene is open', () => {
    const html = render(quest('ACTIVE', [{ ...scene, available: true }]));
    expect(html).toContain('aria-labelledby="quest-scene-ML_M01_NIGHT_RECEIPT-night_receipt"');
    expect(html).toContain('<p>The amount is right.</p><p>One line has been rubbed almost through the paper.</p>');
    expect(html).toContain('role="group" aria-label="Your response to The receipt"');
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html).toContain('Return it unopened');
    expect(html).toContain('Read the erased line');
  });

  it('disables the responses while another job update is going through', () => {
    const html = render(quest('ACTIVE', [{ ...scene, available: true }]), 'Another job update is still going through.');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it('shows the recorded choice and its outcome, with no buttons, once answered', () => {
    const html = render(quest('COMPLETED', [{
      ...scene,
      response: { key: 'read_the_line', label: 'Read the erased line', outcome: 'You can make out four letters.' },
    }]));
    expect(html).toContain('You chose · Read the erased line');
    expect(html).toContain('You can make out four letters.');
    expect(html).toContain('rubbed almost through');
    expect(html).not.toContain('<button');
    expect(html).toContain('aria-live="polite"');
  });

  it('reports whether a card has a scene waiting', () => {
    expect(hasOpenScene(quest('ACTIVE', [scene]))).toBe(false);
    expect(hasOpenScene(quest('ACTIVE', [scene, { ...scene, key: 'second', available: true }]))).toBe(true);
    expect(hasOpenScene({ ...quest('ACTIVE', []), story: undefined })).toBe(false);
  });

  it('splits prose on blank lines and drops empty paragraphs', () => {
    expect(renderToStaticMarkup(<StoryProse text={'One.\n\n\nTwo.\n  \nThree.'} />)).toBe('<p>One.</p><p>Two.</p><p>Three.</p>');
    expect(renderToStaticMarkup(<StoryProse text="" />)).toBe('');
  });
});
