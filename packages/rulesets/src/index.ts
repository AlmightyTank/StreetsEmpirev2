import { classicOgV01 } from './classic-og-v0.1/index.js';
import type { Ruleset } from './types.js';

export { classicOgV01 };
export * from './classic-og-v0.1/index.js';
export * from './types.js';

/** Every ruleset the engine can load, keyed by its public id. */
export const rulesets: Readonly<Record<string, Ruleset>> = {
  [classicOgV01.meta.id]: classicOgV01,
};

export const DEFAULT_RULESET_ID = classicOgV01.meta.id;
