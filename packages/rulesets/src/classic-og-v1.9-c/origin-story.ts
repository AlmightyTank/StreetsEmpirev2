import { defineQuestCatalog } from '../quest-definitions.js';

/** A fast four-beat origin. Every branch pays the same fixed introductory reward. */
export const originStoryQuests = defineQuestCatalog({
  ORIGIN_MEET_CONTACT: {
    key: 'ORIGIN_MEET_CONTACT', title: 'A Name on the Corner',
    description: 'Mama King offers one simple test: work a block and come back with your eyes open.',
    story: { chapter: 'Origin 1 of 4 · The contact', intro: 'Mama folds the city map down to one corner.', inProgress: 'Scout any district once.', ready: 'Mama nods. You showed up.', completed: 'A first contact becomes a first opportunity.', lesson: 'Contacts turn street actions into a larger story.', actionHint: 'Scout any district once.' },
    contactKey: 'MAMA_KING', type: 'STORY', category: 'STREET', difficulty: 'STREET_JOB', prerequisites: [],
    objectives: [{ id: 'first_scout', kind: 'EVENT_COUNT', description: 'Scout any district.', target: 1, params: { eventTypes: ['SCOUT'] } }],
    bonusObjectives: [], rewards: [{ kind: 'CASH', amount: 100000 }], followUpKeys: ['ORIGIN_FIRST_FRONT'], repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },
  ORIGIN_FIRST_FRONT: {
    key: 'ORIGIN_FIRST_FRONT', title: 'The First Front',
    description: 'Turn street money into a front the city can see and remember.',
    story: { chapter: 'Origin 2 of 4 · The opportunity', intro: 'An empty storefront has good bones and a nervous landlord.', inProgress: 'Build one business.', ready: 'The lights come on over your name.', completed: 'You own more than a pocketful of cash now.', lesson: 'Businesses create a visible stake in the city.', actionHint: 'Build one business from the Business screen.' },
    contactKey: null, type: 'STORY', category: 'BUSINESS', difficulty: 'STREET_JOB', prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'ORIGIN_MEET_CONTACT' } }],
    objectives: [{ id: 'first_business', kind: 'EVENT_COUNT', description: 'Build one business.', target: 1, params: { eventTypes: ['BUSINESS_BUILD'] } }],
    bonusObjectives: [], rewards: [{ kind: 'CASH', amount: 100000 }], followUpKeys: ['ORIGIN_STREET_CHOICE'], repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },
  ORIGIN_STREET_CHOICE: {
    key: 'ORIGIN_STREET_CHOICE', title: 'When the Street Answers',
    description: 'A street situation forces a choice; there is no perfect answer, only a consequence that belongs to you.',
    story: { chapter: 'Origin 3 of 4 · The encounter', intro: 'Trouble arrives before the paint on the front is dry.', inProgress: 'Resolve one pending street encounter.', ready: 'The city remembers which answer you gave.', completed: 'Your story now has a decision nobody else made for you.', lesson: 'Encounters create choices and consequences.', actionHint: 'Resolve a pending encounter on the dashboard.' },
    contactKey: null, type: 'STORY', category: 'STREET', difficulty: 'STREET_JOB', prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'ORIGIN_FIRST_FRONT' } }],
    objectives: [{ id: 'first_choice', kind: 'EVENT_COUNT', description: 'Resolve one street encounter.', target: 1, params: { eventTypes: ['RANDOM_ENCOUNTER_CHOICE'] } }],
    bonusObjectives: [], rewards: [{ kind: 'CASH', amount: 100000 }], followUpKeys: ['ORIGIN_CHOOSE_CAREER'], repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },
  ORIGIN_CHOOSE_CAREER: {
    key: 'ORIGIN_CHOOSE_CAREER', title: 'What They Call You',
    description: 'Choose the reputation you want to build. It changes your title and contract lens, never your power.',
    story: { chapter: 'Origin 4 of 4 · The identity', intro: 'Mama asks what kind of name the city should whisper.', inProgress: 'Choose a career identity.', ready: 'The name fits—for now.', completed: 'Your empire has its first chapter.', lesson: 'Career identities express a playstyle without changing the game math.', actionHint: 'Choose a career on the dashboard.' },
    contactKey: 'MAMA_KING', type: 'STORY', category: 'CAREER', difficulty: 'STREET_JOB', prerequisites: [{ kind: 'QUEST_COMPLETED', params: { questKey: 'ORIGIN_STREET_CHOICE' } }],
    objectives: [{ id: 'career', kind: 'EVENT_COUNT', description: 'Choose one career identity.', target: 1, params: { eventTypes: ['CAREER_CHOSEN'] } }],
    bonusObjectives: [], rewards: [{ kind: 'CASH', amount: 100000 }], followUpKeys: [], repeatability: 'ONCE', expiresAfterMinutes: null, availability: {},
  },
});
