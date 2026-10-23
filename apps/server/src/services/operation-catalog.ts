/**
 * Canonical sources a 2.2.0 operation may cite. Each id already belongs to
 * supply, travel, or turf. This module does not settle combat, convoys, or stock.
 *
 * - supply-stock: SupplyStock.id, a warehouse quantity
 * - run: Run.id, the shipment ConvoyService and TravelService already settle
 * - block-war: BlockWar.id while the war is not ENDED
 * - turf-push: TurfPush.id while the push is PENDING
 * - intel-rumor: IntelRumor.id for a Big Score intel window
 */
export const OPERATION_SOURCES = {
  supplyStock: 'supply-stock',
  shipment: 'run',
  blockWar: 'block-war',
  turfPush: 'turf-push',
  intelRumor: 'intel-rumor',
} as const;

export type OperationSourceKind = (typeof OPERATION_SOURCES)[keyof typeof OPERATION_SOURCES];
