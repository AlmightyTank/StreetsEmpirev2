import type { CrewMomentDto } from '@streets/shared';
import { crewMemberTraits } from './crew-profile.js';

/**
 * 2.1.0-C. Read-only scene cards: no RNG, no writing state, no work rewards.
 * Input comes exclusively from the immutable, server-settled loyalty ledger and
 * a narrow, verified career event used for injuries on completed travel.
 */
type SettledReceipt = { source: string; points: number; at: Date };
type CareerEvent = {
  kind: string;
  assignmentKind: string | null;
  summary: string | null;
  at: Date;
};

const TITLES = {
  JOB_COMPLETED: 'A Job in the Books',
  DEFENSE_HELD: 'The Corner Held',
  TRAVEL_COMPLETED: 'Back from the Road',
  DEALER_SHIFT: 'Another Shift Settled',
  RECOVERY_INCIDENT: 'The Road Left a Mark',
} as const;

type MomentSource = keyof typeof TITLES;
const VERIFIED_SOURCES: readonly MomentSource[] = ['JOB_COMPLETED', 'DEFENSE_HELD', 'TRAVEL_COMPLETED', 'DEALER_SHIFT'];

/** These lines are deliberately framed as *interpretation*, not actual dialogue or unverified actions. */
const TRAIT_FLAVOR: Readonly<Record<string, string>> = {
  Steady: 'A steady presence is becoming part of their story.',
  Observant: 'The details seem to matter to them.',
  Streetwise: 'Their street sense gives the story its flavor.',
  Dependable: 'The crew is learning to count on their consistency.',
  'Cool under pressure': 'Even a hard day gets a measured retelling.',
  'Quick learner': 'Each completed job adds another lesson to their record.',
};

const FACT: Record<MomentSource, string> = {
  JOB_COMPLETED: 'A completed crew job is on the record.',
  DEFENSE_HELD: 'Their corner successfully held during a real push.',
  TRAVEL_COMPLETED: 'They completed a verified escort or bodyguard trip.',
  DEALER_SHIFT: 'A staffed dealer shift closed with actual sales.',
  RECOVERY_INCIDENT: 'They returned from a trip with a recorded wound.',
};

function isMomentSource(source: string): source is Exclude<MomentSource, 'RECOVERY_INCIDENT'> {
  return VERIFIED_SOURCES.some((candidate) => candidate === source);
}

function isVerifiedTravelInjury(event: CareerEvent): boolean {
  return event.kind === 'UNASSIGNED'
    && (event.assignmentKind === 'ESCORT' || event.assignmentKind === 'BODYGUARD')
    && /;\s*wounded\.\s*$/i.test(event.summary ?? '');
}

/**
 * One latest verified example per work category and one real travel incident.
 * Bounded to three for mobile, deterministic across refreshes/retries, no made-up
 * wins or losses, and no stories for attendance, transfers or paid training.
 */
export function crewMomentsFor(input: {
  role: 'THUG' | 'WORKER';
  serial: number;
  receipts: readonly SettledReceipt[];
  careerEvents: readonly CareerEvent[];
}): CrewMomentDto[] {
  const trait = crewMemberTraits(input.role, input.serial)[0] ?? 'Steady';
  const flavor = TRAIT_FLAVOR[trait] ?? TRAIT_FLAVOR.Steady!;
  const candidates: Array<{ source: MomentSource; at: Date }> = [];
  const seen = new Set<MomentSource>();
  for (const receipt of [...input.receipts].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    if (receipt.points <= 0 || !isMomentSource(receipt.source) || seen.has(receipt.source)) continue;
    seen.add(receipt.source);
    candidates.push({ source: receipt.source, at: receipt.at });
  }
  const wound = [...input.careerEvents]
    .filter(isVerifiedTravelInjury)
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  if (wound) candidates.push({ source: 'RECOVERY_INCIDENT', at: wound.at });
  return candidates.sort((a, b) => b.at.getTime() - a.at.getTime()
    || a.source.localeCompare(b.source)).slice(0, 3).map(({ source, at }) => ({
    source,
    title: TITLES[source],
    description: `${FACT[source]} ${flavor}`,
    trait,
    at: at.toISOString(),
  }));
}
