/** Keep dashboard warning severity separate from presentation artwork. */
export interface DashboardAttentionInput {
  heatTone: 'good' | 'warn' | 'bad';
  heatLocked: boolean;
  convoyKind?: string | null;
  runWaiting: boolean;
  moving: boolean;
  woundedThugs: number;
  unarmedThugs: number;
  lowWhoreHappiness: boolean;
  lowThugHappiness: boolean;
  atTurnCap: boolean;
}

export function dashboardAttentionState(input: DashboardAttentionInput) {
  const count = [
    input.heatLocked || input.heatTone !== 'good',
    Boolean(input.convoyKind),
    input.runWaiting,
    input.moving,
    input.woundedThugs > 0,
    input.unarmedThugs > 0,
    input.lowWhoreHappiness,
    input.lowThugHappiness,
    input.atTurnCap,
  ].filter(Boolean).length;
  return {
    count,
    critical: input.heatLocked || input.heatTone === 'bad'
      || input.convoyKind === 'tailed' || input.woundedThugs > 0,
  };
}

export type DashboardDisclosure = 'crew' | 'happiness' | 'pressure';
/** Hash links may arrive from notifications, nav tiles or older bookmarks. */
export function dashboardDisclosureForHash(hash: string): DashboardDisclosure | null {
  if (hash === '#crew-inventory') return 'crew';
  if (hash === '#crew-health') return 'happiness';
  if (hash === '#heat' || hash === '#payout') return 'pressure';
  return null;
}
