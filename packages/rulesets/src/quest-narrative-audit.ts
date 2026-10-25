import type { ContactCatalog, QuestDefinition, QuestDefinitionCatalog } from './types.js';

export type QuestNarrativeAuditIssueKind =
  | 'MISSING_CONTACT'
  | 'UNKNOWN_CONTACT'
  | 'MISSING_STORY'
  | 'INCOMPLETE_STORY';

export interface QuestNarrativeAuditIssue {
  readonly kind: QuestNarrativeAuditIssueKind;
  readonly questKey: string;
  readonly message: string;
}

const REQUIRED_STORY_FIELDS = ['chapter', 'intro', 'inProgress', 'ready', 'completed', 'actionHint'] as const;

/**
 * Slice 1 audit: reports narrative ownership gaps without changing quest behavior yet.
 * This deliberately accepts the current nullable contactKey/story model so the existing
 * historical rulesets can be measured before the fields become mandatory.
 */
export function questNarrativeAudit(
  catalog: QuestDefinitionCatalog,
  contacts: ContactCatalog | undefined,
): QuestNarrativeAuditIssue[] {
  const issues: QuestNarrativeAuditIssue[] = [];

  for (const [catalogKey, quest] of Object.entries(catalog)) {
    const questKey = catalogKey;
    if (!quest.contactKey) {
      issues.push({ kind: 'MISSING_CONTACT', questKey, message: `${questKey}: contactKey is required` });
    } else if (!contacts || !Object.prototype.hasOwnProperty.call(contacts, quest.contactKey)) {
      issues.push({ kind: 'UNKNOWN_CONTACT', questKey, message: `${questKey}: unknown contact ${quest.contactKey}` });
    }

    if (!quest.story) {
      issues.push({ kind: 'MISSING_STORY', questKey, message: `${questKey}: story is required` });
      continue;
    }

    for (const field of REQUIRED_STORY_FIELDS) {
      const value = quest.story[field];
      if (typeof value !== 'string' || !value.trim()) {
        issues.push({ kind: 'INCOMPLETE_STORY', questKey, message: `${questKey}: story.${field} is required` });
      }
    }
  }

  return issues;
}

export function questNarrativeAuditByRuleset(
  ruleset: { readonly meta: { readonly id: string }; readonly questDefinitions?: QuestDefinitionCatalog; readonly contacts?: ContactCatalog },
): QuestNarrativeAuditIssue[] {
  return ruleset.questDefinitions ? questNarrativeAudit(ruleset.questDefinitions, ruleset.contacts) : [];
}

export function questNarrativeAuditSummary(issues: readonly QuestNarrativeAuditIssue[]) {
  return issues.reduce<Record<QuestNarrativeAuditIssueKind, number>>((summary, issue) => {
    summary[issue.kind] += 1;
    return summary;
  }, { MISSING_CONTACT: 0, UNKNOWN_CONTACT: 0, MISSING_STORY: 0, INCOMPLETE_STORY: 0 });
}

export type { QuestDefinition };
