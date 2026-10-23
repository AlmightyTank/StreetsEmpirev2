export interface StartingPlayerResources {
  whores: number;
  thugs: number;
  condoms: number;
  medicine: number;
  crack: number;
  beer: number;
  pistols: number;
  shotguns: number;
  tek9s: number;
  ak47s: number;
  ammo: number;
  vehicleParts: number;
  lowRiders: number;
  payoutPercent: number;
  cashCents: number;
}

/**
 * Legacy gallery receipts deliberately are not an input here. The only
 * cross-round value allowed into a fresh player is the separately governed
 * aftermath reward claim.
 */
export function buildRoundStartingResources(start: StartingPlayerResources, aftermathRewardCents = 0n) {
  return {
    whores: start.whores,
    thugs: start.thugs,
    condoms: start.condoms,
    medicine: start.medicine,
    crack: start.crack,
    beer: start.beer,
    pistols: start.pistols,
    shotguns: start.shotguns,
    tek9s: start.tek9s,
    ak47s: start.ak47s,
    ammo: start.ammo,
    vehicleParts: start.vehicleParts,
    lowRiders: start.lowRiders,
    payoutPercent: start.payoutPercent,
    cashCents: BigInt(start.cashCents) + aftermathRewardCents,
  };
}
