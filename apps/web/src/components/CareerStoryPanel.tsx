import { useState } from 'react';
import type { CareerStoryActiveDto, CareerStoryArchiveDto } from '@streets/shared';
import { communityApi } from '../api/community.js';
import { Alert } from './Alert.js';
import { Panel } from './Panel.js';

export function CareerStoryPanel({ story, portfolio, owner = false, onChanged }: { story: CareerStoryActiveDto | null; portfolio: CareerStoryArchiveDto[]; owner?: boolean; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!story && portfolio.length === 0) return null;
  const current = story?.chapters.find((chapter) => chapter.chapterKey === story.currentChapterKey) ?? null;
  const choiceChapter = story?.chapters.find((chapter) => chapter.completed && !chapter.chosenBranchKey) ?? null;
  async function choose(branchKey: string) {
    if (!choiceChapter) return;
    setBusy(true); setError(null);
    try { await communityApi.chooseCareerStory(choiceChapter.chapterKey, branchKey); onChanged?.(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save that story choice.'); }
    finally { setBusy(false); }
  }
  return (
    <Panel title="Career storyline" className="se-profile-panel se-career-story" aria-live="polite">
      {error ? <Alert>{error}</Alert> : null}
      {story ? <>
        <p className="se-eyebrow">{story.career.replaceAll('_', ' ')} · {story.status.toLowerCase()}{current ? ` · Next: ${current.title}` : ''}</p>
        <div className="se-career-story__chapters" aria-label="Career story chapters">
          {story.chapters.map((chapter) => <div className={`se-career-story__chapter${chapter.completed ? ' is-complete' : ''}`} key={chapter.chapterKey}>
            <span className="se-career-story__order">{chapter.order}</span><div><strong>{chapter.title}</strong><span>{chapter.completed ? 'Receipt verified' : chapter.summary}</span></div>
          </div>)}
        </div>
        {owner && choiceChapter && choiceChapter.branches.length ? <div className="se-career-story__choice"><h3>Choose the mark this chapter leaves</h3><p className="se-muted">This choice is recorded once and changes only your story recognition.</p><div className="se-career-story__branches">{choiceChapter.branches.map((branch) => <button type="button" className="se-btn se-btn--ghost" disabled={busy} aria-label={`Choose ${branch.title}`} key={branch.key} onClick={() => void choose(branch.key)}><strong>{branch.title}</strong><span>{branch.body}</span></button>)}</div></div> : null}
      </> : null}
      {portfolio.length ? <div className="se-career-story__archive"><h3>Story archive</h3>{portfolio.map((entry) => <div className="se-career-story__archive-row" key={`${entry.career}-${entry.title}`}><strong>{entry.title}</strong><span>{entry.completedChapters} chapters · {entry.status.toLowerCase()}</span></div>)}</div> : null}
    </Panel>
  );
}
