import { classicOgV03B } from '../classic-og-v0.3-b/index.js';
import type { Ruleset } from '../types.js';

/**
 * 0.3.0-C keeps 0.3.0-B balance and adds alliances: small crews, no friendly
 * fire, shared revenge, and a cooldown that stops a member being dropped to
 * be raided.
 */
export const classicOgV03C = {
  ...classicOgV03B,
  meta: { id: 'classic-og-v0.3-c', version: '0.3.0-C', name: 'Classic OG - Alliances' },
  alliances: {
    maxMembers: 5,
    // Matches the 24-hour revenge window, so dropping a member cannot outlast revenge.
    leaveCooldownHours: 24,
    inviteExpiresHours: 48,
    maxPendingInvites: 10,
  },
} as const satisfies Ruleset;
