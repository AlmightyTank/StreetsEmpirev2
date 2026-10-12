/** Presentation-only shop filters. Server permissions and checkout checks remain authoritative. */
export type StoreShelfFilter = 'all' | 'available' | 'locked' | 'sold-out';

export interface StoreShelfSummary {
  name: string;
  purchaseUnlocked: boolean;
  soldOut: boolean;
}

export function matchesStoreShelf(
  shelf: StoreShelfSummary,
  query: string,
  filter: StoreShelfFilter,
): boolean {
  const search = query.trim().toLocaleLowerCase();
  if (search && !shelf.name.toLocaleLowerCase().includes(search)) return false;
  if (filter === 'available') return shelf.purchaseUnlocked && !shelf.soldOut;
  if (filter === 'locked') return !shelf.purchaseUnlocked;
  if (filter === 'sold-out') return shelf.soldOut;
  return true;
}
