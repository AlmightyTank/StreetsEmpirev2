import { classicOgV15E3 } from '../classic-og-v1.5-e3/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.6.0-A — Supply Foundation.
 * Adds the pinned capability flag and durable supply-network records while
 * preserving all 1.5.0-E3 city, economy, travel, and vehicle values.
 */
export const classicOgV16A = {
  ...classicOgV15E3,
  meta: { id: 'classic-og-v1.6-a', version: '1.6.0-A', name: 'Classic OG - Supply Foundation' },
  supplyNetwork: { enabled: true },
} as const satisfies Ruleset;
