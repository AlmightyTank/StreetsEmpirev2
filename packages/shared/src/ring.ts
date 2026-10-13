/**
 * The Ring: one ring per round, Lord-of-the-Rings style.
 *
 * - Surfaces via round news once the round is RING_SURFACE_HOURS old.
 * - The holder gets RING_INVISIBILITY_HOURS of invisibility (combat target
 *   checks fail), broken early by attacking (raid / drive-by / special raid).
 * - After the invisibility lapses the holder is revealed on the combat page
 *   and the Ring can be stolen by winning a raid against them.
 * - The holder can destroy it at the foundry (Detroit) for cash plus the
 *   Ring-bearer title. Whoever still holds it at round end gets My Precious.
 */
export const RING_SURFACE_HOURS = 48;
export const RING_INVISIBILITY_HOURS = 24;
/** Cash paid for throwing the Ring into the foundry, in cents. */
export const RING_DESTROY_REWARD_CENTS = 10_000_000;
/** Turns it costs to carry the Ring to the foundry and destroy it. */
export const RING_DESTROY_TURN_COST = 5;
/** City slug of the foundry (the old foundry = Detroit, the Mount Doom). */
export const RING_FOUNDRY_CITY_SLUG = 'detroit';

export type RingStatus = 'HIDDEN' | 'SURFACED' | 'DESTROYED';

export interface RingStateDto {
  status: RingStatus;
  /** True when the viewer holds the Ring. */
  iHold: boolean;
  /** Revealed holder identity. Null while hidden, invisible, or destroyed. */
  holderPublicPimpId: number | null;
  holderDisplayName: string | null;
  /** When the holder's invisibility lapses, if they are still invisible. */
  invisibleUntil: string | null;
  destroyRewardCents: number;
  destroyTurnCost: number;
  foundryCitySlug: string;
  surfacedAt: string | null;
}

export function ringSurfaceAt(startsAt: Date): Date {
  return new Date(startsAt.getTime() + RING_SURFACE_HOURS * 3_600_000);
}

export function ringInvisibilityUntil(from: Date): Date {
  return new Date(from.getTime() + RING_INVISIBILITY_HOURS * 3_600_000);
}

export function isRingInvisible(invisibleUntil: Date | null | undefined, now: Date): boolean {
  return !!invisibleUntil && invisibleUntil.getTime() > now.getTime();
}

export const RING_SURFACED_NEWS_TITLE = 'A strange Ring has surfaced';
export const RING_SURFACED_NEWS_BODY =
  'Word on the street: a heavy gold band is changing hands in this round. Its bearer cannot be found for a day, but attacking breaks the spell. After that, take it from them in a raid — or carry it to the old foundry in Detroit and throw it in.';
export const RING_DESTROYED_NEWS_TITLE = 'The Ring is destroyed';
