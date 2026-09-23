import { allianceContracts as phaseTAllianceContracts } from '../classic-og-v0.7-s/alliance-contracts.js';
import type { QuestDefinitionCatalog } from '../types.js';

/**
 * Quest roadmap Phase W: anti-free-rider eligibility for alliance rewards.
 *
 * Shared goals stay shared. Each snapshotted member must also make a small,
 * server-observed contribution before that member can collect the shared payout.
 */
export const hardenedAllianceContracts = {
  ALLIANCE_HOLD_THE_CITY: {
    ...phaseTAllianceContracts.ALLIANCE_HOLD_THE_CITY,
    availability: {
      ...phaseTAllianceContracts.ALLIANCE_HOLD_THE_CITY.availability,
      personalContribution: {
        id: 'personal_defense',
        kind: 'EVENT_COUNT',
        description: 'Personally help defend alliance turf at least once.',
        label: 'defenses helped',
        target: 1,
        params: { eventTypes: ['TURF_PUSH_DEFENSE', 'TURF_PUSH_BACKUP'] },
      },
    },
  },

  ALLIANCE_WAR_CHEST: {
    ...phaseTAllianceContracts.ALLIANCE_WAR_CHEST,
    availability: {
      ...phaseTAllianceContracts.ALLIANCE_WAR_CHEST.availability,
      personalContribution: {
        id: 'personal_sales',
        kind: 'EVENT_SUM',
        description: 'Personally sell at least $25,000 through store counters.',
        label: 'personal store sales',
        target: 2_500_000,
        params: { eventTypes: ['STORE_SELL'], field: 'totalCents', display: 'CURRENCY' },
      },
    },
  },

  ALLIANCE_REINFORCEMENTS: {
    ...phaseTAllianceContracts.ALLIANCE_REINFORCEMENTS,
    availability: {
      ...phaseTAllianceContracts.ALLIANCE_REINFORCEMENTS.availability,
      personalContribution: {
        id: 'personal_backup',
        kind: 'EVENT_SUM',
        description: 'Personally send at least 10 thugs as ally backup.',
        label: 'ally backup thugs sent',
        target: 10,
        params: {
          eventTypes: ['CONVOY_BACKUP', 'TURF_PUSH_BACKUP'],
          field: 'thugs',
          where: { kind: 'ALLY' },
        },
      },
    },
  },

  ALLIANCE_INTERSTATE_EMPIRE: {
    ...phaseTAllianceContracts.ALLIANCE_INTERSTATE_EMPIRE,
    availability: {
      ...phaseTAllianceContracts.ALLIANCE_INTERSTATE_EMPIRE.availability,
      personalContribution: {
        id: 'personal_returned_run',
        kind: 'EVENT_COUNT',
        description: 'Personally bring at least one intercity run home.',
        label: 'returned runs',
        target: 1,
        params: { eventTypes: ['RUN_RETURNED'] },
      },
    },
  },
} as const satisfies QuestDefinitionCatalog;
