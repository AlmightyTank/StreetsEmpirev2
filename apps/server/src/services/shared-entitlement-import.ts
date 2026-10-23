import type { AccountCosmeticUnlock, CrownWallet } from '@prisma/client';
import { DROP_SOURCE } from '@streets/rulesets';

export interface LegacyEntitlementSnapshot {
  environment: 'beta' | 'production';
  localAccountId: string;
  balance: number;
  heldAt: Date | null;
  holdReason: string | null;
  unlocks: Array<Pick<AccountCosmeticUnlock, 'key' | 'kind' | 'title' | 'description' | 'rarity' | 'styleKey' | 'sourceQuestKey' | 'awardedAt'>>;
}

export function snapshotLegacyEntitlements(
  environment: 'beta' | 'production',
  localAccountId: string,
  wallet: Pick<CrownWallet, 'balance' | 'heldAt' | 'holdReason'> | null,
  unlocks: LegacyEntitlementSnapshot['unlocks'],
): LegacyEntitlementSnapshot {
  if (!localAccountId.trim()) throw new Error('A local account id is required.');
  const balance = wallet?.balance ?? 0;
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error(`Invalid legacy Crown balance for ${environment} account ${localAccountId}.`);
  return {
    environment,
    localAccountId,
    balance,
    heldAt: wallet?.heldAt ?? null,
    holdReason: wallet?.holdReason ?? null,
    // Only cosmetics bought or unlocked through The Drop belong in this shared store.
    unlocks: unlocks.filter((unlock) => unlock.sourceQuestKey === DROP_SOURCE),
  };
}

export function legacyCrownImportRef(snapshot: Pick<LegacyEntitlementSnapshot, 'environment' | 'localAccountId'>): string {
  return `legacy-import:${snapshot.environment}:${snapshot.localAccountId}`;
}
