import type { CareerIdentityKey, CareerStoryArcDefinition, CareerStoryChapterDefinition } from '@streets/shared';
import type { Ruleset } from '@streets/rulesets';
import { CAREER_KEYS, CAREER_PRESENTATION } from './player-career.service.js';

const CAREER_SOURCE: Record<CareerIdentityKey, CareerStoryChapterDefinition['sourceKind'][]> = {
  ENFORCER: ['COMBAT', 'TURF', 'CREW'],
  SMUGGLER: ['TRAVEL', 'SUPPLY', 'PUBLIC_ACTIVITY'],
  FIXER: ['CONTACT', 'FACTION', 'CASE'],
  BUSINESS_BOSS: ['BUSINESS', 'SUPPLY', 'CONTACT'],
  INTELLIGENCE_BROKER: ['SCOUT', 'COMBAT', 'PUBLIC_ACTIVITY'],
};

function chapter(career: CareerIdentityKey, order: number, sourceKind: CareerStoryChapterDefinition['sourceKind']): CareerStoryChapterDefinition {
  const key = `${career.toLowerCase()}-${order}`;
  return {
    key,
    order,
    title: `${CAREER_PRESENTATION[career].title}: Chapter ${order}`,
    summary: `A verified ${sourceKind.toLowerCase()} receipt advances your career story.`,
    sourceKind,
    objectiveKey: `${key}:settled`,
    prerequisiteChapterKey: order === 1 ? null : `${career.toLowerCase()}-${order - 1}`,
    branches: [
      { key: `${key}-steady`, title: 'Keep it steady', body: 'A measured choice earns recognition without changing the economics.', reward: { kind: 'PROFILE_MOMENT', key: `${key}-steady`, label: 'Steady hand' } },
      { key: `${key}-bold`, title: 'Take the bold line', body: 'A visible choice earns a different cosmetic record at the same budget.', reward: { kind: 'PROFILE_MOMENT', key: `${key}-bold`, label: 'Bold line' } },
    ],
    optionalCrossover: order === 3,
  };
}

export const CAREER_STORY_CATALOG_VERSION = '2.4.0-A';

export const CAREER_STORY_CATALOG: readonly CareerStoryArcDefinition[] = CAREER_KEYS.map((career) => ({
  career,
  version: CAREER_STORY_CATALOG_VERSION,
  title: `${CAREER_PRESENTATION[career].title} story`,
  contractCategories: CAREER_PRESENTATION[career].contractCategories,
  chapters: CAREER_SOURCE[career].map((source, index) => chapter(career, index + 1, source)),
  rewardBudget: { cosmeticSlots: 3, contactRep: 1, temporaryGrantCents: 0 },
}));

export function validateCareerStoryCatalog(catalog: readonly CareerStoryArcDefinition[] = CAREER_STORY_CATALOG): void {
  if (catalog.length !== CAREER_KEYS.length || new Set(catalog.map((arc) => arc.career)).size !== CAREER_KEYS.length) throw new Error('Career story catalog must contain each career exactly once.');
  for (const career of CAREER_KEYS) {
    const arc = catalog.find((entry) => entry.career === career);
    if (!arc || arc.version !== CAREER_STORY_CATALOG_VERSION || arc.chapters.length < 3 || arc.chapters.length > 5) throw new Error(`Invalid story arc for ${career}.`);
    arc.chapters.forEach((entry, index) => {
      if (entry.order !== index + 1 || (index === 0 ? entry.prerequisiteChapterKey !== null : entry.prerequisiteChapterKey !== arc.chapters[index - 1]!.key)) throw new Error(`Invalid chapter order for ${career}.`);
      if (entry.branches.length < 2 || entry.branches.some((branch) => branch.reward.kind === 'TEMPORARY_GRANT')) throw new Error(`Invalid branch budget for ${entry.key}.`);
    });
  }
}

validateCareerStoryCatalog();

export function careerStoryArc(career: CareerIdentityKey): CareerStoryArcDefinition {
  return CAREER_STORY_CATALOG.find((arc) => arc.career === career)!;
}

export function loadCareerStoryArc(ruleset: Ruleset, career: CareerIdentityKey): CareerStoryArcDefinition | null {
  if (ruleset.careerStorylines?.enabled !== true || ruleset.careerStorylines.catalogVersion !== CAREER_STORY_CATALOG_VERSION) return null;
  return careerStoryArc(career);
}
