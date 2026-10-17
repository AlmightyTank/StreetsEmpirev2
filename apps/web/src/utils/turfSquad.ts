/** Why a claim, reinforce, or push cannot take thugs who are not at home. */
export type HomeSquadBlock = 'away' | 'short' | 'empty';

/**
 * Away thugs stay away. A squad can only be built from fit, armed thugs still at home.
 * `away` means the whole crew that could fight is already posted, on a job, or out.
 */
export function homeSquadBlock(armedAtHome: number, amount: number): HomeSquadBlock | null {
  const armed = Math.max(0, Math.floor(Number.isFinite(armedAtHome) ? armedAtHome : 0));
  const sending = Math.floor(Number.isFinite(amount) ? amount : 0);
  if (armed < 1) return 'away';
  if (sending < 1) return 'empty';
  if (sending > armed) return 'short';
  return null;
}

/**
 * Starting squad size. A corner you hold can still be pulled, so that number follows the
 * posted crew. A claim or push can only start from whoever is actually at home.
 */
export function initialTurfSquad(owned: boolean, armedAtHome: number, suggested: number, cornerThugs: number): number {
  const armed = Math.max(0, Math.floor(Number.isFinite(armedAtHome) ? armedAtHome : 0));
  const suggestion = Math.max(0, Math.floor(Number.isFinite(suggested) ? suggested : 0));
  if (owned) {
    const posted = Math.max(0, Math.floor(Number.isFinite(cornerThugs) ? cornerThugs : 0));
    return Math.max(1, Math.min(suggestion || posted || 1, Math.max(posted, 1)));
  }
  return Math.min(suggestion, armed);
}
