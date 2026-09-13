import { classicOgV01 } from './classic-og-v0.1/index.js';
import { classicOgV02 } from './classic-og-v0.2/index.js';
import { classicOgV02C } from './classic-og-v0.2-c/index.js';
import { classicOgV02D } from './classic-og-v0.2-d/index.js';
import { classicOgV02E } from './classic-og-v0.2-e/index.js';
import { classicOgV02F } from './classic-og-v0.2-f/index.js';
import { classicOgV02G } from './classic-og-v0.2-g/index.js';
import { classicOgV02H } from './classic-og-v0.2-h/index.js';
import type { Ruleset } from './types.js';

export { classicOgV01 };
export { classicOgV02 };
export { classicOgV02C };
export { classicOgV02D };
export { classicOgV02E };
export { classicOgV02F };
export { classicOgV02G };
export { classicOgV02H };
export * from './classic-og-v0.1/index.js';
export * from './types.js';
export * from './combat-prototype.js';

/** Every ruleset the engine can load, keyed by its public id. */
export const rulesets: Readonly<Record<string, Ruleset>> = {
  [classicOgV01.meta.id]: classicOgV01,
  [classicOgV02.meta.id]: classicOgV02,
  [classicOgV02C.meta.id]: classicOgV02C,
  [classicOgV02D.meta.id]: classicOgV02D,
  [classicOgV02E.meta.id]: classicOgV02E,
  [classicOgV02F.meta.id]: classicOgV02F,
  [classicOgV02G.meta.id]: classicOgV02G,
  [classicOgV02H.meta.id]: classicOgV02H,
};

export const DEFAULT_RULESET_ID = classicOgV01.meta.id;
