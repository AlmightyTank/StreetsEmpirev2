export interface ThugAvailabilityState {
  thugs: number;
  woundedThugs: number;
  busyThugs?: number;
  postedThugs?: number;
  businessThugs?: number;
  dealerThugs?: number;
}

export interface WorkerAvailabilityState {
  whores: number;
  businessWhores?: number;
}

/** Thugs who can do something at home: not wounded, away, posted, or assigned to other work. */
export function fitThugs(player: ThugAvailabilityState): number {
  return Math.max(
    0,
    player.thugs
      - player.woundedThugs
      - (player.busyThugs ?? 0)
      - (player.postedThugs ?? 0)
      - (player.businessThugs ?? 0)
      - (player.dealerThugs ?? 0),
  );
}

/** 1.1.0-B. Girls who work the street or a Produce shift: everyone not working a business. */
export function workingWhores(player: WorkerAvailabilityState): number {
  return Math.max(0, player.whores - (player.businessWhores ?? 0));
}
