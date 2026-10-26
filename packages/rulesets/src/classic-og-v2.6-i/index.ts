import { classicOgV26H } from '../classic-og-v2.6-h/index.js';
import { defineQuestCatalog } from '../quest-definitions.js';
import type { StreetSkillMilestone, StreetSkillMilestoneChoice } from '../street-skills.js';
import type { Ruleset } from '../types.js';
import { campaignOnlyStories } from './campaign-only-stories.js';
import { questNeedsLawCase } from './law-case-quests.js';

/**
 * 2.6.0-I. The Missing Line is the only story: older story and side jobs are retired from new
 * rounds and their permanent unlocks move onto campaign chapters. Boards, events and secrets stay,
 * except jobs that can only be finished through the law Case. Heat stays. The per-city Case,
 * warrants, lawyers, payroll and informants do not ship on this ruleset.
 */
const { law: _retiredCase, ...withoutCase } = classicOgV26H;

function heatPerk(
  choice: StreetSkillMilestoneChoice,
  label: string,
  description: string,
  effectId: 'HEAT_GAIN' | 'HEAT_COOLING',
  percent: number,
): StreetSkillMilestoneChoice {
  return { key: choice.key, label, description, effect: { effectId, category: 'HEAT', percent } };
}

function retargetFixerChoice(choice: StreetSkillMilestoneChoice): StreetSkillMilestoneChoice {
  if (choice.key === 'LAWYERED_UP') return heatPerk(choice, 'Cool Customer', 'Heat cools 15% faster.', 'HEAT_COOLING', 15);
  if (choice.key === 'QUIET_STREETS') return heatPerk(choice, 'Quiet Streets', 'Work draws 15% less Heat.', 'HEAT_GAIN', -15);
  if (choice.key === 'PAPER_TRAIL') return heatPerk(choice, 'Paper Trail', 'Heat cools 20% faster.', 'HEAT_COOLING', 20);
  return choice;
}

function retargetFixerMilestone(milestone: StreetSkillMilestone): StreetSkillMilestone {
  return { ...milestone, choices: [retargetFixerChoice(milestone.choices[0]), retargetFixerChoice(milestone.choices[1])] };
}

const streetSkills = withoutCase.streetSkills
  ? {
      ...withoutCase.streetSkills,
      sources: withoutCase.streetSkills.sources.map((source) =>
        source.key === 'FIXER_LAW'
          ? { ...source, label: 'Heat action', actionPrefixes: ['HEAT_'] }
          : source,
      ),
      milestones: {
        ...withoutCase.streetSkills.milestones,
        FIXER: withoutCase.streetSkills.milestones.FIXER?.map(retargetFixerMilestone),
      },
    }
  : undefined;

const playableStories = Object.fromEntries(
  Object.entries(campaignOnlyStories).filter(([, definition]) => !questNeedsLawCase(definition)),
);

export const classicOgV26I = {
  ...withoutCase,
  meta: { ...classicOgV26H.meta, id: 'classic-og-v2.6-i', version: '2.6.0-I', name: 'Classic OG - The Missing Line' },
  streetSkills,
  questDefinitions: defineQuestCatalog(playableStories),
} as const satisfies Ruleset;
