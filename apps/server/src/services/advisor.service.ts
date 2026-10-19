import type { AdvisorDto, AdvisorFocus, AdvisorSignalSnapshot, AdvisorSuggestionDto } from '@streets/shared';

const DEFAULT_FOCUS: AdvisorFocus = 'balanced';

/** The guided tour owns the first-run command surface. */
export function shouldDeferAdvisor(tourActive: boolean): boolean {
  return tourActive;
}

function candidate(
  key: string,
  ruleId: string,
  kind: AdvisorSuggestionDto['kind'],
  title: string,
  reason: string,
  href: string | null,
  actionable: boolean,
  sourceId: string | null = null,
): AdvisorSuggestionDto {
  return { key, ruleId, kind, title, reason, href, actionable, sourceId };
}

/**
 * Pure recommendation engine. It intentionally accepts only the allowlisted
 * owner snapshot; rival, scout, combat and Black Book data cannot enter here.
 */
export function recommendAdvisor(
  snapshot: AdvisorSignalSnapshot,
  _rulesetVersion: string,
  focus: AdvisorFocus = DEFAULT_FOCUS,
  suppressed: ReadonlySet<string> = new Set(),
  _now = new Date(),
): AdvisorSuggestionDto[] {
  const urgent: AdvisorSuggestionDto[] = [];
  const growth: AdvisorSuggestionDto[] = [];
  const allows = (rule: AdvisorSuggestionDto['ruleId']): boolean => {
    if (focus === 'balanced') return true;
    if (focus === 'quests') return rule.startsWith('quest-');
    if (focus === 'money') return rule === 'supply-shortfall' || rule === 'affordable-holding';
    if (focus === 'territory') return rule === 'affordable-holding';
    if (focus === 'crew') return rule === 'turns-empty';
    return true;
  };

  if (snapshot.quest && snapshot.rules.quests && allows('quest-active-progress') && !suppressed.has(`quest:${snapshot.quest.key}`)) {
    const ready = snapshot.quest.status === 'READY_TO_TURN_IN';
    urgent.push(candidate(
      `quest:${snapshot.quest.key}`,
      ready ? 'quest-ready-claim' : 'quest-active-progress',
      'urgent',
      ready ? 'Claim your finished job' : 'Keep your active job moving',
      ready ? 'Your job is ready to turn in.' : (snapshot.quest.progressLabel ?? 'Your active job has progress to make.'),
      ready ? '/quests' : '/quests',
      !snapshot.paused,
      snapshot.quest.key,
    ));
  }

  if (snapshot.rules.heat && allows('heat-high') && snapshot.heat !== null && snapshot.heatMax !== null && snapshot.heat >= snapshot.heatMax * 0.8 && !suppressed.has('heat-high')) {
    urgent.push(candidate(
      'heat-high', 'heat-high', 'urgent', 'Cool the streets',
      `Your Heat is ${snapshot.heat}/${snapshot.heatMax}. Manage it before taking another risky action.`,
      '/dashboard#heat', false,
    ));
  }

  const stockShortfall = snapshot.products?.find((product) => product.quantity <= 0);
  if (stockShortfall && !snapshot.paused && allows('supply-shortfall') && !suppressed.has(`stock:${stockShortfall.key}`)) {
    growth.push(candidate(
      `stock:${stockShortfall.key}`, 'supply-shortfall', 'growth', 'Restock your operation',
      `Your ${stockShortfall.key} supply is empty.`, '/store', !snapshot.paused,
    ));
  }

  if (snapshot.rules.holdings && snapshot.holdingsAvailable && allows('affordable-holding') && !suppressed.has('holdings')) {
    growth.push(candidate(
      'holdings', 'affordable-holding', 'growth', 'Review a safe investment',
      'You have an affordable player-owned city holding to review.', '/holdings', !snapshot.paused,
    ));
  }

  if (snapshot.turns <= 0 && allows('turns-empty') && !suppressed.has('turns-empty')) {
    growth.push(candidate(
      'turns-empty', 'turns-empty', 'info', 'Your crew is out of turns',
      'No turns are available right now; the next dashboard refresh will update this briefing.', null, false,
    ));
  }

  return [...urgent.slice(0, 1), ...growth.slice(0, 2)];
}

export function buildAdvisor(snapshot: AdvisorSignalSnapshot, rulesetVersion: string, focus: AdvisorFocus = DEFAULT_FOCUS, suppressed: ReadonlySet<string> = new Set(), now = new Date()): AdvisorDto {
  return { suggestions: recommendAdvisor(snapshot, rulesetVersion, focus, suppressed, now), focus, generatedAt: now.toISOString() };
}
