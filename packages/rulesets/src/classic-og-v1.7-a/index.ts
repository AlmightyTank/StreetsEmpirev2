import { classicOgV165G } from '../classic-og-v1.6.5-g/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.7.0-A — Individual Roster Foundation.
 *
 * Every thug and worker gets a server-owned member record: a stable id, a role, a status,
 * experience and an assignment history. Existing crews are migrated into members on their
 * first action without adding or removing anyone, and 1.6 dealer careers keep their ids and
 * experience. The player's counts remain the source of truth, so no gameplay value changes.
 */
export const classicOgV17A = {
  ...classicOgV165G,
  meta: { id: 'classic-og-v1.7-a', version: '1.7.0-A', name: 'Classic OG - Individual Roster' },
  crewRoster: { enabled: true },
} as const satisfies Ruleset;
