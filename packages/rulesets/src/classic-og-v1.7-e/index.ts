import { classicOgV17D } from '../classic-og-v1.7-d/index.js';

/** 1.7.0-E — selected, transaction-scoped teams for raids and scouting. */
export const classicOgV17E = {
  ...classicOgV17D,
  meta: { id: 'classic-og-v1.7-e', version: '1.7.0-E', name: 'Classic OG - Operational Teams' },
  crewRoster: { ...classicOgV17D.crewRoster, selectedTeams: true },
} as const;
