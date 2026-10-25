import { describe, expect, it } from 'vitest';
import { questNarrativeAudit, questNarrativeAuditSummary } from '../quest-narrative-audit.js';
import type { QuestDefinition } from '../types.js';

const quest = (overrides: Partial<QuestDefinition> = {}): QuestDefinition => ({
  key: 'TEST_JOB',
  title: 'Test Job',
  description: 'A test job.',
  contactKey: 'MAMA_KING',
  type: 'SIDE',
  category: 'STREET',
  difficulty: 'CONTRACT',
  prerequisites: [],
  objectives: [{ id: 'complete', kind: 'EVENT_COUNT', description: 'Complete it.', target: 1, params: {} }],
  bonusObjectives: [],
  rewards: [],
  followUpKeys: [],
  repeatability: 'ONCE',
  expiresAfterMinutes: null,
  availability: {},
  ...overrides,
});

const story = {
  chapter: 'The handoff',
  intro: 'Mama has a reason to call.',
  inProgress: 'Mama is waiting.',
  ready: 'Mama is ready to pay.',
  completed: 'Mama remembers the work.',
  actionHint: 'Complete the objective.',
};

describe('quest narrative audit', () => {
  it('reports missing ownership and story separately', () => {
    const issues = questNarrativeAudit({
      NO_CONTACT: quest({ key: 'NO_CONTACT', contactKey: null, story }),
      NO_STORY: quest({ key: 'NO_STORY', story: undefined }),
      BAD_CONTACT: quest({ key: 'BAD_CONTACT', contactKey: 'NO_SUCH_CONTACT', story }),
    }, { MAMA_KING: {} } as never);

    expect(questNarrativeAuditSummary(issues)).toEqual({
      MISSING_CONTACT: 1,
      UNKNOWN_CONTACT: 1,
      MISSING_STORY: 1,
      INCOMPLETE_STORY: 0,
    });
  });

  it('finds blank required story lines', () => {
    const issues = questNarrativeAudit({ JOB: quest({ story: { ...story, ready: ' ' } }) }, { MAMA_KING: {} } as never);
    expect(issues).toEqual([{ kind: 'INCOMPLETE_STORY', questKey: 'JOB', message: 'JOB: story.ready is required' }]);
  });
});
