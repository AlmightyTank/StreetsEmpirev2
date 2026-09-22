import type { HideoutRoomKey, Ruleset } from './types.js';

export type HideoutRequirementKey =
  | 'CLEAN_SHIFT_STREAK'
  | 'ROCKS_SUPPLIED'
  | 'RAIDS_DONE'
  | 'DRIVE_BYS_DONE'
  | 'LOW_RIDERS'
  | 'WEAPONS_OWNED';

export interface HideoutRequirementRule {
  readonly key: HideoutRequirementKey;
  readonly label: string;
  readonly amount: number;
}

export interface HideoutSpecializationChoiceRule {
  readonly key: string;
  readonly name: string;
  readonly blurb: string;
}

export interface HideoutSpecializationRule {
  readonly unlockLevel: number;
  readonly choices: readonly HideoutSpecializationChoiceRule[];
}

export interface HideoutRoomV2Rule {
  /** Requirements are keyed by the level the player is trying to buy. */
  readonly requirements?: Readonly<Partial<Record<number, readonly HideoutRequirementRule[]>>>;
  /** Choice data is exposed now; choosing a branch ships in 0.7.0-G. */
  readonly specialization?: HideoutSpecializationRule;
}

/**
 * 0.7.0-A extension contract.
 *
 * It deliberately lives beside the original HideoutRules rather than replacing
 * it. Older pinned rulesets therefore keep their exact 0.3-0.6 behavior while
 * 0.7 rules can opt into progress gates and specialization metadata.
 */
export interface HideoutAssetProtectionRule {
  /**
   * Total product units automatically sealed by Safe Room level.
   * Index 0 is the unbuilt room; index N is Safe Room level N.
   */
  readonly protectedProductUnitsBySafeRoomLevel: readonly number[];
}

export interface HideoutV2Rules {
  readonly version: 2;
  readonly rooms: Readonly<Partial<Record<HideoutRoomKey, HideoutRoomV2Rule>>>;
  /** Optional 0.7-B asset-protection model. Older 0.7 rules remain cash-only. */
  readonly assetProtection?: HideoutAssetProtectionRule;
}

export const CLASSIC_OG_V07A_HIDEOUT_V2 = {
  version: 2,
  rooms: {
    SAFE_ROOM: {
      requirements: {
        3: [{ key: 'RAIDS_DONE', label: 'Raids completed', amount: 1 }],
      },
      specialization: {
        unlockLevel: 3,
        choices: [
          { key: 'VAULT', name: 'Vault', blurb: 'Prioritize protected cash and protected product storage.' },
          { key: 'PANIC_ROOM', name: 'Panic Room', blurb: 'Prioritize emergency protection when rivals come through the door.' },
        ],
      },
    },
    LOOKOUTS: {
      requirements: {
        3: [{ key: 'WEAPONS_OWNED', label: 'Weapons on hand', amount: 5 }],
      },
      specialization: {
        unlockLevel: 3,
        choices: [
          { key: 'STREET_EYES', name: 'Street Eyes', blurb: 'Prioritize recon warnings and movement intelligence.' },
          { key: 'ARMED_WATCH', name: 'Armed Watch', blurb: 'Prioritize direct home and turf defense.' },
        ],
      },
    },
    WORKSHOP: {
      requirements: {
        3: [{ key: 'ROCKS_SUPPLIED', label: 'Crack supplied to Pip', amount: 100 }],
      },
      specialization: {
        unlockLevel: 3,
        choices: [
          { key: 'DRUG_LAB', name: 'Drug Lab', blurb: 'Prioritize product output and ingredient efficiency.' },
          { key: 'GARAGE', name: 'Garage', blurb: 'Prioritize runs, vehicles, cargo and logistics.' },
        ],
      },
    },
    BACK_OFFICE: {
      requirements: {
        3: [{ key: 'CLEAN_SHIFT_STREAK', label: 'Clean shifts in a row', amount: 3 }],
      },
      specialization: {
        unlockLevel: 3,
        choices: [
          { key: 'BOOKKEEPING', name: 'Bookkeeping', blurb: 'Prioritize ledger visibility and cost control.' },
          { key: 'CONNECTIONS', name: 'Connections', blurb: 'Prioritize contacts, income opportunities and market leverage.' },
        ],
      },
    },
  },
} as const satisfies HideoutV2Rules;

export const CLASSIC_OG_V07B_HIDEOUT_V2 = {
  ...CLASSIC_OG_V07A_HIDEOUT_V2,
  assetProtection: {
    // Product protection starts only after the level-3 progression gate.
    // The cap remains deliberately modest so a rich stash is still worth raiding.
    protectedProductUnitsBySafeRoomLevel: [0, 0, 0, 25, 60, 100],
  },
} as const satisfies HideoutV2Rules;

const HIDEOUT_V2_BY_RULESET_ID: Readonly<Record<string, HideoutV2Rules>> = {
  'classic-og-v0.7-a': CLASSIC_OG_V07A_HIDEOUT_V2,
  'classic-og-v0.7-b': CLASSIC_OG_V07B_HIDEOUT_V2,
};

/** Returns the v2 extension registered for a ruleset, or null when none is registered. */
export function hideoutV2For(ruleset: Pick<Ruleset, 'meta'>): HideoutV2Rules | null {
  return HIDEOUT_V2_BY_RULESET_ID[ruleset.meta.id] ?? null;
}

/** Returns configuration problems for an opted-in v2 extension, or an empty list when none exist. */
export function hideoutV2Problems(ruleset: Ruleset): string[] {
  const extension = hideoutV2For(ruleset);
  if (!extension) return [];

  const problems: string[] = [];
  if (!ruleset.hideout) return ['0.7 hideout extension requires a base hideout.'];

  for (const [roomKey, roomV2] of Object.entries(extension.rooms) as Array<[HideoutRoomKey, HideoutRoomV2Rule]>) {
    const baseRoom = ruleset.hideout.rooms[roomKey];
    if (!baseRoom) {
      problems.push(`${roomKey}: extension points at a room that is not enabled.`);
      continue;
    }

    for (const [levelRaw, requirements] of Object.entries(roomV2.requirements ?? {}) as Array<[string, readonly HideoutRequirementRule[]]>) {
      const level = Number(levelRaw);
      if (!Number.isInteger(level) || level < 1 || level > baseRoom.maxLevel) {
        problems.push(`${roomKey}: requirement level ${levelRaw} is outside 1..${baseRoom.maxLevel}.`);
      }
      for (const requirement of requirements) {
        if (!Number.isSafeInteger(requirement.amount) || requirement.amount <= 0) {
          problems.push(`${roomKey} level ${levelRaw}: ${requirement.key} must require a positive whole amount.`);
        }
        if (!requirement.label.trim()) {
          problems.push(`${roomKey} level ${levelRaw}: ${requirement.key} needs a player-facing label.`);
        }
      }
    }

    const specialization = roomV2.specialization;
    if (specialization) {
      if (
        !Number.isSafeInteger(specialization.unlockLevel)
        || specialization.unlockLevel < 1
        || specialization.unlockLevel > baseRoom.maxLevel
      ) {
        problems.push(`${roomKey}: specialization unlock level is outside 1..${baseRoom.maxLevel}.`);
      }
      if (specialization.choices.length < 2) {
        problems.push(`${roomKey}: specialization needs at least two choices.`);
      }
      const keys = specialization.choices.map((choice) => choice.key);
      if (new Set(keys).size !== keys.length) {
        problems.push(`${roomKey}: specialization choice keys must be unique.`);
      }
    }
  }

  const protection = extension.assetProtection;
  if (protection) {
    const safeRoom = ruleset.hideout.rooms.SAFE_ROOM;
    const levels = protection.protectedProductUnitsBySafeRoomLevel;
    if (levels.length !== safeRoom.maxLevel + 1) {
      problems.push(`SAFE_ROOM: protected product capacity needs ${safeRoom.maxLevel + 1} entries for levels 0..${safeRoom.maxLevel}.`);
    }
    if (levels[0] !== 0) {
      problems.push('SAFE_ROOM: level 0 cannot protect product.');
    }
    let prior = -1;
    for (const [level, units] of levels.entries()) {
      if (!Number.isSafeInteger(units) || units < 0) {
        problems.push(`SAFE_ROOM level ${level}: protected product capacity must be a non-negative whole number.`);
      }
      if (units < prior) {
        problems.push('SAFE_ROOM: protected product capacity cannot decrease at higher levels.');
        break;
      }
      prior = units;
    }
  }

  return problems;
}
