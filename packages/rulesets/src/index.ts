import { classicOgV01 } from './classic-og-v0.1/index.js';
import { classicOgV02 } from './classic-og-v0.2/index.js';
import { classicOgV02C } from './classic-og-v0.2-c/index.js';
import { classicOgV02D } from './classic-og-v0.2-d/index.js';
import { classicOgV02E } from './classic-og-v0.2-e/index.js';
import { classicOgV02F } from './classic-og-v0.2-f/index.js';
import { classicOgV02G } from './classic-og-v0.2-g/index.js';
import { classicOgV02H } from './classic-og-v0.2-h/index.js';
import { classicOgV03A } from './classic-og-v0.3-a/index.js';
import { classicOgV03B } from './classic-og-v0.3-b/index.js';
import { classicOgV03C } from './classic-og-v0.3-c/index.js';
import { classicOgV03D } from './classic-og-v0.3-d/index.js';
import { classicOgV04A } from './classic-og-v0.4-a/index.js';
import { classicOgV04B } from './classic-og-v0.4-b/index.js';
import { classicOgV04C } from './classic-og-v0.4-c/index.js';
import { classicOgV04D } from './classic-og-v0.4-d/index.js';
import { classicOgV04E } from './classic-og-v0.4-e/index.js';
import type { Ruleset } from './types.js';

export { classicOgV01 };
export { classicOgV02 };
export { classicOgV02C };
export { classicOgV02D };
export { classicOgV02E };
export { classicOgV02F };
export { classicOgV02G };
export { classicOgV02H };
export { classicOgV03A };
export { classicOgV03B };
export { classicOgV03C };
export { classicOgV03D };
export { classicOgV04A };
export { classicOgV04B };
export { classicOgV04C };
export { classicOgV04D };
export { classicOgV04E };
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
  [classicOgV03A.meta.id]: classicOgV03A,
  [classicOgV03B.meta.id]: classicOgV03B,
  [classicOgV03C.meta.id]: classicOgV03C,
  [classicOgV03D.meta.id]: classicOgV03D,
  [classicOgV04A.meta.id]: classicOgV04A,
  [classicOgV04B.meta.id]: classicOgV04B,
  [classicOgV04C.meta.id]: classicOgV04C,
  [classicOgV04D.meta.id]: classicOgV04D,
  [classicOgV04E.meta.id]: classicOgV04E,
};

export const DEFAULT_RULESET_ID = classicOgV01.meta.id;
