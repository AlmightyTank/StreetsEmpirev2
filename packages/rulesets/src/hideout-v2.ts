import type { HideoutRoomKey, Ruleset } from './types.js';

export type HideoutRequirementKey =
  | 'CLEAN_SHIFT_STREAK'
  | 'ROCKS_SUPPLIED'
  | 'RAIDS_DONE'
  | 'DRIVE_BYS_DONE'
  | 'LOW_RIDERS'
  | 'WEAPONS_OWNED'
  | 'TURF_BLOCKS_HELD';

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

export type HideoutReconWarningTier = 'NONE' | 'PRESENCE' | 'SOURCE';

export interface HideoutSecurityRule {
  /** Recon warnings by Lookouts level, index 0..max level. */
  readonly warningTierByLookoutsLevel: readonly HideoutReconWarningTier[];
  /** How far back the security desk shows suspicious activity at each level. */
  readonly historyHoursByLookoutsLevel: readonly number[];
  /** Level at which passive home-area traffic count becomes visible. */
  readonly localTrafficMinLevel: number;
  /** Hooks only. Branch selection remains disabled until 0.7.0-G. */
  readonly specializationHooks: {
    readonly streetEyesWarningHoursBonus: number;
    readonly armedWatchDefenseBonusPercent: number;
  };
}

export interface HideoutWorkshopRule {
  /** Output bonus by Workshop level, index 0..max level. */
  readonly outputBonusPercentByWorkshopLevel: readonly number[];
  /** Ingredient-cost reduction by Workshop level, index 0..max level. */
  readonly ingredientEfficiencyPercentByWorkshopLevel: readonly number[];
}

export interface HideoutGarageRule {
  /** Concurrent-run cap by Garage level, index 0..max level. */
  readonly runLimitByGarageLevel: readonly number[];
  /** Relocation fee reduction by Garage level, index 0..max level. */
  readonly relocationFeeDiscountPercentByGarageLevel: readonly number[];
}

export interface HideoutArmoryRule {
  /** Persisted choices the Armory may expose. */
  readonly weaponPriorities: readonly ['POWER', 'CONSERVE'];
}

export interface HideoutInfirmaryRule {
  /** Medicine savings supplied by Workshop infrastructure, index 0..Workshop max level. */
  readonly medicineEfficiencyPercentByWorkshopLevel: readonly number[];
}

export interface HideoutSpecializationEffectsRule {
  readonly safeRoom: {
    readonly vaultProtectedCashCents: number;
    readonly vaultProtectedProductUnits: number;
    readonly panicRoomDefenseBonusPercent: number;
  };
  readonly workshop: {
    readonly drugLabOutputBonusPercent: number;
    readonly garageRelocationDiscountPercent: number;
  };
}

export interface HideoutLedgerRule {
  /** Itemized ledger history unlocked by Back Office level, index 0..max level. */
  readonly historyDaysByBackOfficeLevel: readonly number[];
  /** Maximum itemized rows returned by Back Office level. */
  readonly rowLimitByBackOfficeLevel: readonly number[];
  /** Hooks only. Branch selection becomes active in 0.7.0-G. */
  readonly specializationHooks: {
    readonly bookkeepingHistoryDaysBonus: number;
    readonly connectionsTakeBonusPercent: number;
  };
}

export interface HideoutV2Rules {
  readonly version: 2;
  readonly rooms: Readonly<Partial<Record<HideoutRoomKey, HideoutRoomV2Rule>>>;
  /** Optional 0.7-B asset-protection model. Older 0.7 rules remain cash-only. */
  readonly assetProtection?: HideoutAssetProtectionRule;
  /** Optional 0.7-C Lookouts/security model. */
  readonly security?: HideoutSecurityRule;
  /** Optional 0.7-D Workshop tuning. */
  readonly workshop?: HideoutWorkshopRule;
  /** Optional 0.7-D Garage/logistics tuning. */
  readonly garage?: HideoutGarageRule;
  /** Optional 0.7-E Back Office ledger tuning. */
  readonly ledger?: HideoutLedgerRule;
  /** Optional 0.7-F Armory behavior. */
  readonly armory?: HideoutArmoryRule;
  /** Optional 0.7-F Infirmary behavior. */
  readonly infirmary?: HideoutInfirmaryRule;
  /** 0.7-G opt-in: presence enables permanent seasonal branch selection and its effects. */
  readonly specializationEffects?: HideoutSpecializationEffectsRule;
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

export const CLASSIC_OG_V07C_HIDEOUT_V2 = {
  ...CLASSIC_OG_V07B_HIDEOUT_V2,
  rooms: {
    ...CLASSIC_OG_V07B_HIDEOUT_V2.rooms,
    LOOKOUTS: {
      ...CLASSIC_OG_V07B_HIDEOUT_V2.rooms.LOOKOUTS,
      requirements: {
        ...CLASSIC_OG_V07B_HIDEOUT_V2.rooms.LOOKOUTS.requirements,
        4: [{ key: 'TURF_BLOCKS_HELD', label: 'Turf blocks held', amount: 1 }],
        5: [{ key: 'TURF_BLOCKS_HELD', label: 'Turf blocks held', amount: 3 }],
      },
    },
  },
  security: {
    warningTierByLookoutsLevel: ['NONE', 'PRESENCE', 'PRESENCE', 'SOURCE', 'SOURCE', 'SOURCE'],
    historyHoursByLookoutsLevel: [0, 1, 4, 8, 12, 24],
    localTrafficMinLevel: 2,
    specializationHooks: {
      streetEyesWarningHoursBonus: 12,
      armedWatchDefenseBonusPercent: 5,
    },
  },
} as const satisfies HideoutV2Rules;

export const CLASSIC_OG_V07D_HIDEOUT_V2 = {
  ...CLASSIC_OG_V07C_HIDEOUT_V2,
  rooms: {
    ...CLASSIC_OG_V07C_HIDEOUT_V2.rooms,
    GARAGE: {
      requirements: {
        1: [{ key: 'LOW_RIDERS', label: 'Low-Riders owned', amount: 2 }],
      },
    },
  },
  workshop: {
    // Keep the shipped 3%/level output path, then add a separate modest efficiency curve.
    outputBonusPercentByWorkshopLevel: [0, 3, 6, 9, 12, 15],
    ingredientEfficiencyPercentByWorkshopLevel: [0, 0, 2, 4, 6, 8],
  },
  garage: {
    // No speed bonus: Garage improves logistics without flattening travel risk.
    runLimitByGarageLevel: [1, 2],
    relocationFeeDiscountPercentByGarageLevel: [0, 5],
  },
} as const satisfies HideoutV2Rules;

export const CLASSIC_OG_V07E_HIDEOUT_V2 = {
  ...CLASSIC_OG_V07D_HIDEOUT_V2,
  ledger: {
    // The summary remains useful immediately; higher Back Office levels unlock deeper itemized history.
    historyDaysByBackOfficeLevel: [1, 3, 7, 14, 30, 60],
    rowLimitByBackOfficeLevel: [10, 20, 35, 50, 75, 100],
    specializationHooks: {
      bookkeepingHistoryDaysBonus: 30,
      connectionsTakeBonusPercent: 2,
    },
  },
} as const satisfies HideoutV2Rules;

export const CLASSIC_OG_V07F_HIDEOUT_V2 = {
  ...CLASSIC_OG_V07E_HIDEOUT_V2,
  armory: {
    weaponPriorities: ['POWER', 'CONSERVE'],
  },
  infirmary: {
    // A developed Workshop can stretch medical supplies, but never eliminates the cost of treatment.
    medicineEfficiencyPercentByWorkshopLevel: [0, 0, 0, 5, 10, 15],
  },
} as const satisfies HideoutV2Rules;

export const CLASSIC_OG_V07G_HIDEOUT_V2 = {
  ...CLASSIC_OG_V07F_HIDEOUT_V2,
  rooms: {
    ...CLASSIC_OG_V07F_HIDEOUT_V2.rooms,
    SAFE_ROOM: {
      ...CLASSIC_OG_V07F_HIDEOUT_V2.rooms.SAFE_ROOM,
      specialization: {
        unlockLevel: 3,
        choices: [
          { key: 'VAULT', name: 'Vault', blurb: '+$2,500 raid cash protection and +50 protected product units.' },
          { key: 'PANIC_ROOM', name: 'Panic Room', blurb: '+5% home defense strength when rivals raid.' },
        ],
      },
    },
    LOOKOUTS: {
      ...CLASSIC_OG_V07F_HIDEOUT_V2.rooms.LOOKOUTS,
      specialization: {
        unlockLevel: 3,
        choices: [
          { key: 'STREET_EYES', name: 'Street Eyes', blurb: '+12 hours of suspicious-activity history.' },
          { key: 'ARMED_WATCH', name: 'Armed Watch', blurb: '+5% home defense strength.' },
        ],
      },
    },
    WORKSHOP: {
      ...CLASSIC_OG_V07F_HIDEOUT_V2.rooms.WORKSHOP,
      specialization: {
        unlockLevel: 3,
        choices: [
          { key: 'DRUG_LAB', name: 'Drug Lab', blurb: '+5% product output on every cookable recipe.' },
          { key: 'GARAGE', name: 'Garage', blurb: 'Another 5% off relocation fees; no third run and no road-time reduction.' },
        ],
      },
    },
    BACK_OFFICE: {
      ...CLASSIC_OG_V07F_HIDEOUT_V2.rooms.BACK_OFFICE,
      specialization: {
        unlockLevel: 3,
        choices: [
          { key: 'BOOKKEEPING', name: 'Bookkeeping', blurb: '+30 days of itemized ledger history.' },
          { key: 'CONNECTIONS', name: 'Connections', blurb: '+2% personal street-work cash take.' },
        ],
      },
    },
  },
  specializationEffects: {
    safeRoom: {
      vaultProtectedCashCents: 250_000,
      vaultProtectedProductUnits: 50,
      panicRoomDefenseBonusPercent: 5,
    },
    workshop: {
      drugLabOutputBonusPercent: 5,
      garageRelocationDiscountPercent: 5,
    },
  },
} as const satisfies HideoutV2Rules;

const HIDEOUT_V2_BY_RULESET_ID: Readonly<Record<string, HideoutV2Rules>> = {
  'classic-og-v0.7-a': CLASSIC_OG_V07A_HIDEOUT_V2,
  'classic-og-v0.7-b': CLASSIC_OG_V07B_HIDEOUT_V2,
  'classic-og-v0.7-c': CLASSIC_OG_V07C_HIDEOUT_V2,
  'classic-og-v0.7-d': CLASSIC_OG_V07D_HIDEOUT_V2,
  'classic-og-v0.7-e': CLASSIC_OG_V07E_HIDEOUT_V2,
  'classic-og-v0.7-f': CLASSIC_OG_V07F_HIDEOUT_V2,
  'classic-og-v0.7-g': CLASSIC_OG_V07G_HIDEOUT_V2,
  // 0.7-H extends G with quest permanent unlocks; hideout behavior is unchanged.
  'classic-og-v0.7-h': CLASSIC_OG_V07G_HIDEOUT_V2,
  // 0.7-I adds favor inventory only; hideout behavior remains the G extension.
  'classic-og-v0.7-i': CLASSIC_OG_V07G_HIDEOUT_V2,
  // 0.7-J adds timed favors only; hideout behavior remains unchanged.
  'classic-og-v0.7-j': CLASSIC_OG_V07G_HIDEOUT_V2,
  // 0.7-K adds single-use favors only; hideout behavior remains unchanged.
  'classic-og-v0.7-k': CLASSIC_OG_V07G_HIDEOUT_V2,
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

  const security = extension.security;
  if (security) {
    const lookouts = ruleset.hideout.rooms.LOOKOUTS;
    const expected = lookouts.maxLevel + 1;
    if (security.warningTierByLookoutsLevel.length !== expected) {
      problems.push(`LOOKOUTS: warning tiers need ${expected} entries for levels 0..${lookouts.maxLevel}.`);
    }
    if (security.historyHoursByLookoutsLevel.length !== expected) {
      problems.push(`LOOKOUTS: security history needs ${expected} entries for levels 0..${lookouts.maxLevel}.`);
    }
    if (security.warningTierByLookoutsLevel[0] !== 'NONE' || security.historyHoursByLookoutsLevel[0] !== 0) {
      problems.push('LOOKOUTS: level 0 cannot provide security warnings or history.');
    }
    if (!Number.isSafeInteger(security.localTrafficMinLevel)
      || security.localTrafficMinLevel < 1
      || security.localTrafficMinLevel > lookouts.maxLevel) {
      problems.push(`LOOKOUTS: local traffic level must be inside 1..${lookouts.maxLevel}.`);
    }
    for (const hours of security.historyHoursByLookoutsLevel) {
      if (!Number.isFinite(hours) || hours < 0) {
        problems.push('LOOKOUTS: security history hours must be non-negative.');
        break;
      }
    }
  }

  const workshop = extension.workshop;
  if (workshop) {
    const base = ruleset.hideout.rooms.WORKSHOP;
    const expected = base.maxLevel + 1;
    for (const [label, levels] of [
      ['output bonus', workshop.outputBonusPercentByWorkshopLevel],
      ['ingredient efficiency', workshop.ingredientEfficiencyPercentByWorkshopLevel],
    ] as const) {
      if (levels.length !== expected) {
        problems.push(`WORKSHOP: ${label} needs ${expected} entries for levels 0..${base.maxLevel}.`);
      }
      if (levels[0] !== 0) problems.push(`WORKSHOP: level 0 ${label} must be 0.`);
      let prior = -1;
      for (const value of levels) {
        if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
          problems.push(`WORKSHOP: ${label} must stay between 0 and 100 whole percent.`);
          break;
        }
        if (value < prior) {
          problems.push(`WORKSHOP: ${label} cannot decrease at higher levels.`);
          break;
        }
        prior = value;
      }
    }
  }

  const garage = extension.garage;
  if (garage) {
    const base = ruleset.hideout.rooms.GARAGE;
    if (!base) {
      problems.push('GARAGE: 0.7-D logistics rules require the Garage room.');
    } else {
      const expected = base.maxLevel + 1;
      if (garage.runLimitByGarageLevel.length !== expected) {
        problems.push(`GARAGE: run limit needs ${expected} entries for levels 0..${base.maxLevel}.`);
      }
      if (garage.relocationFeeDiscountPercentByGarageLevel.length !== expected) {
        problems.push(`GARAGE: relocation discount needs ${expected} entries for levels 0..${base.maxLevel}.`);
      }
      if (garage.runLimitByGarageLevel[0] !== 1) {
        problems.push('GARAGE: level 0 must keep the classic one-run limit.');
      }
      if (garage.relocationFeeDiscountPercentByGarageLevel[0] !== 0) {
        problems.push('GARAGE: level 0 cannot discount relocation.');
      }
      for (const value of garage.runLimitByGarageLevel) {
        if (!Number.isSafeInteger(value) || value < 1) {
          problems.push('GARAGE: run limits must be positive whole numbers.');
          break;
        }
      }
      for (const value of garage.relocationFeeDiscountPercentByGarageLevel) {
        if (!Number.isSafeInteger(value) || value < 0 || value > 100) {
          problems.push('GARAGE: relocation discounts must stay between 0 and 100 whole percent.');
          break;
        }
      }
    }
  }


  const ledger = extension.ledger;
  if (ledger) {
    const backOffice = ruleset.hideout.rooms.BACK_OFFICE;
    const expected = backOffice.maxLevel + 1;
    for (const [label, levels] of [
      ['history days', ledger.historyDaysByBackOfficeLevel],
      ['row limit', ledger.rowLimitByBackOfficeLevel],
    ] as const) {
      if (levels.length !== expected) {
        problems.push(`BACK_OFFICE: ${label} needs ${expected} entries for levels 0..${backOffice.maxLevel}.`);
      }
      let prior = -1;
      for (const value of levels) {
        if (!Number.isSafeInteger(value) || value <= 0) {
          problems.push(`BACK_OFFICE: ${label} must be positive whole numbers.`);
          break;
        }
        if (value < prior) {
          problems.push(`BACK_OFFICE: ${label} cannot decrease at higher levels.`);
          break;
        }
        prior = value;
      }
    }
    if (ledger.specializationHooks.bookkeepingHistoryDaysBonus < 0
      || ledger.specializationHooks.connectionsTakeBonusPercent < 0) {
      problems.push('BACK_OFFICE: specialization hooks cannot be negative.');
    }
  }


  const armory = extension.armory;
  if (armory) {
    if (armory.weaponPriorities.length !== 2
      || armory.weaponPriorities[0] !== 'POWER'
      || armory.weaponPriorities[1] !== 'CONSERVE') {
      problems.push('ARMORY: priorities must keep POWER and CONSERVE in that order.');
    }
  }

  const infirmary = extension.infirmary;
  if (infirmary) {
    const workshop = ruleset.hideout.rooms.WORKSHOP;
    const expected = workshop.maxLevel + 1;
    if (infirmary.medicineEfficiencyPercentByWorkshopLevel.length !== expected) {
      problems.push(`INFIRMARY: medicine efficiency needs ${expected} entries for Workshop levels 0..${workshop.maxLevel}.`);
    }
    let prior = -1;
    for (const value of infirmary.medicineEfficiencyPercentByWorkshopLevel) {
      if (!Number.isSafeInteger(value) || value < 0 || value > 50) {
        problems.push('INFIRMARY: medicine efficiency must stay between 0 and 50 whole percent.');
        break;
      }
      if (value < prior) {
        problems.push('INFIRMARY: medicine efficiency cannot decrease at higher Workshop levels.');
        break;
      }
      prior = value;
    }
  }


  const specializationEffects = extension.specializationEffects;
  if (specializationEffects) {
    const safe = specializationEffects.safeRoom;
    const workshopEffects = specializationEffects.workshop;
    if (!Number.isSafeInteger(safe.vaultProtectedCashCents) || safe.vaultProtectedCashCents < 0 || safe.vaultProtectedCashCents > 500_000) {
      problems.push('SPECIALIZATION VAULT: extra protected cash must stay between $0 and $5,000.');
    }
    if (!Number.isSafeInteger(safe.vaultProtectedProductUnits) || safe.vaultProtectedProductUnits < 0 || safe.vaultProtectedProductUnits > 100) {
      problems.push('SPECIALIZATION VAULT: extra protected product must stay between 0 and 100 units.');
    }
    if (!Number.isSafeInteger(safe.panicRoomDefenseBonusPercent) || safe.panicRoomDefenseBonusPercent < 0 || safe.panicRoomDefenseBonusPercent > 5) {
      problems.push('SPECIALIZATION PANIC_ROOM: defense bonus cannot exceed 5%.');
    }
    if (!Number.isSafeInteger(workshopEffects.drugLabOutputBonusPercent) || workshopEffects.drugLabOutputBonusPercent < 0 || workshopEffects.drugLabOutputBonusPercent > 5) {
      problems.push('SPECIALIZATION DRUG_LAB: output bonus cannot exceed 5%.');
    }
    if (!Number.isSafeInteger(workshopEffects.garageRelocationDiscountPercent) || workshopEffects.garageRelocationDiscountPercent < 0 || workshopEffects.garageRelocationDiscountPercent > 5) {
      problems.push('SPECIALIZATION GARAGE: relocation discount cannot exceed 5%.');
    }
  }

  return problems;
}
