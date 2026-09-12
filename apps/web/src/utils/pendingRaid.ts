import { z } from 'zod';
import { raidSchema } from '@streets/shared';

/** `kind` is absent on requests saved before drive-bys, which were all raids. */
export const pendingRaidSchema = z.object({ input: raidSchema, targetName: z.string().max(100), kind: z.enum(['RAID', 'DRIVE_BY', 'DRUG_HOES', 'STEAL_RIDE', 'LURE_CREW']).optional() });
export type PendingRaid = z.infer<typeof pendingRaidSchema>;
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (playerId: string) => `se.pending-raid.${playerId}`;

/** Raids have permanent receipts, so an uncertain request must never expire into a new intent. */
export function loadPendingRaid(storage: Store | null, playerId: string): PendingRaid | null {
  try {
    const raw = storage?.getItem(key(playerId));
    if (!raw) return null;
    const parsed = pendingRaidSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
    storage?.removeItem(key(playerId));
  } catch { /* Storage may be disabled or malformed. */ }
  return null;
}

export function savePendingRaid(storage: Store | null, playerId: string, pending: PendingRaid | null): void {
  try {
    if (pending) storage?.setItem(key(playerId), JSON.stringify(pending));
    else storage?.removeItem(key(playerId));
  } catch { /* The page still retains the exact request in memory. */ }
}
