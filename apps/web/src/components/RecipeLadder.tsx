import { Link } from 'react-router-dom';
import { formatNumber, type QuestPageDto } from '@streets/shared';
import { recipeLadderRows, type RecipeLadderRow } from '../utils/recipes.js';
import { Panel } from './Panel.js';
import { questHref } from './QuestLink.js';

const STATE_LABEL: Record<RecipeLadderRow['state'], string> = {
  OPEN: 'Recipe open',
  READY: 'Ready to collect',
  WORKING: 'In progress',
  AVAILABLE: 'Job available',
  LOCKED: 'Locked',
};

/**
 * Quest Recipe Unlocks D. The whole recipe ladder on the progression desk: which recipes are
 * yours, which job opens the next, and what a locked job still waits for. Locked jobs stay
 * off the Available board; this is where the longer path is shown.
 */
export function RecipeLadderPanel({ page }: { page: Pick<QuestPageDto, 'recipeLadder' | 'quests'> }) {
  const rows = recipeLadderRows(page);
  if (!rows.length) return null;
  const open = rows.filter((row) => row.state === 'OPEN').length;
  return (
    <Panel title="Recipe ladder" aside={`${formatNumber(open)} of ${formatNumber(rows.length)} open`} className="se-quests-panel">
      <p className="se-hint">Crack is yours from the start. Pip opens every other recipe through a job, one after another.</p>
      <ol className="se-recipe-ladder">
        {rows.map((row) => (
          <li key={row.questKey} className={`se-recipe-ladder__step se-recipe-ladder__step--${row.state.toLowerCase()}`}>
            <div className="se-recipe-ladder__head">
              <span className="se-eyebrow">Step {formatNumber(row.step)}</span>
              <strong>{row.productName}</strong>
              <span className="se-recipe-ladder__state">{STATE_LABEL[row.state]}</span>
            </div>
            {row.identity ? <p className="se-recipe-ladder__identity">{row.identity}</p> : null}
            <p className="se-hint">
              {row.state === 'OPEN'
                ? <>Opened by “{row.questTitle}”. <Link className="se-golink" to="/game/produce">Cook it on Produce</Link>.</>
                : <>Job: <Link className="se-golink" to={questHref(row.questKey)}>“{row.questTitle}”</Link></>}
            </p>
            {row.requires.length ? (
              <p className="se-hint se-recipe-ladder__requires">
                Waiting on:{' '}
                {row.requires.map((requirement, index) => (
                  <span key={requirement.label}>
                    {index ? ', ' : ''}
                    {requirement.questKey ? <Link className="se-golink" to={questHref(requirement.questKey)}>{requirement.label}</Link> : requirement.label}
                  </span>
                ))}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
