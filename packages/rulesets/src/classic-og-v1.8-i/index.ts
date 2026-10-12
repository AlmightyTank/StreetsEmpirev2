import { classicOgV18H } from '../classic-og-v1.8-h/index.js';
import type { RandomEncounterTrigger, RandomEncounterTriggerRules, Ruleset } from '../types.js';

const priorEncounters = classicOgV18H.randomEncounters!;

function upgradeTrigger(
  trigger: RandomEncounterTriggerRules,
  chance: number,
  cooldownMinutes: number,
  extra: RandomEncounterTriggerRules['entries'][number],
): RandomEncounterTriggerRules {
  return {
    ...trigger,
    chance,
    cooldownMinutes,
    perKeyCooldownMinutes: Math.max(trigger.perKeyCooldownMinutes ?? 0, 240),
    entries: [...trigger.entries, extra],
  };
}

const triggers = {
  ...priorEncounters.triggers,
  SCOUT: upgradeTrigger(priorEncounters.triggers.SCOUT!, 0.09, 45, {
    key: 'scout-bus-stop-whisper',
    title: 'Bus stop whisper',
    text: 'A night-shift regular offers a useful lead, but wants a little cash before sharing it.',
    tone: 'neutral',
    weight: 3,
    choices: [
      { key: 'buy-the-lead', label: 'Buy the lead', text: 'Pay $5 to get the quiet location.', cash: { minCents: -500, maxCents: -500 } },
      { key: 'skip-the-lead', label: 'Leave it', text: 'Keep your cash and move on.' },
    ],
  }),
  PRODUCE: upgradeTrigger(priorEncounters.triggers.PRODUCE!, 0.075, 60, {
    key: 'produce-supplier-shortfall',
    title: 'Supplier shortfall',
    text: 'A supplier can bring a few extra units now, or you can keep the batch quiet and wait.',
    tone: 'neutral',
    weight: 3,
    choices: [
      { key: 'take-the-extra', label: 'Take the extra stock', text: 'Accept a small supply of extra product.', supplies: { crack: { min: 3, max: 7 } } },
      { key: 'keep-it-quiet', label: 'Keep it quiet', text: 'Turn the supplier away without drawing attention.', heat: { min: -1, max: -1 } },
    ],
  }),
  TRAVEL: upgradeTrigger(priorEncounters.triggers.TRAVEL!, 0.09, 60, {
    key: 'travel-bridge-detour',
    title: 'Bridge detour',
    text: 'A lane closure splits the route. Pay for the faster crossing or take the longer, watched road.',
    tone: 'neutral',
    weight: 3,
    choices: [
      { key: 'pay-crossing', label: 'Pay $8 crossing fee', text: 'Pay the posted crossing fee and keep the route calm.', cash: { minCents: -800, maxCents: -800 } },
      { key: 'take-watched-road', label: 'Take the watched road', text: 'Keep the cash; the detour draws a little attention.', heat: { min: 1, max: 1 } },
    ],
  }),
  STORE: upgradeTrigger(priorEncounters.triggers.STORE!, 0.07, 45, {
    key: 'store-miscounted-crate',
    title: 'Miscounted crate',
    text: 'A delivery was counted wrong. The clerk offers the surplus supplies, or you can pass.',
    tone: 'neutral',
    weight: 3,
    choices: [
      { key: 'take-surplus', label: 'Take surplus supplies', text: 'Keep the extra supplies for the crew.', supplies: { condoms: { min: 1, max: 2 }, beer: { min: 1, max: 2 } } },
      { key: 'pass-crate', label: 'Pass', text: 'Leave the crate for the next customer.' },
    ],
  }),
  TURF: upgradeTrigger(priorEncounters.triggers.TURF!, 0.06, 60, {
    key: 'turf-block-cleanup',
    title: 'Block cleanup',
    text: 'Residents are cleaning up the block after a rough week. Help out or take the quiet route past them.',
    tone: 'neutral',
    weight: 3,
    choices: [
      { key: 'help-cleanup', label: 'Donate $6', text: 'Cover cleanup supplies and cool the block down.', cash: { minCents: -600, maxCents: -600 }, heat: { min: -2, max: -1 } },
      { key: 'keep-moving', label: 'Keep moving', text: 'Leave the residents to their work.' },
    ],
  }),
  COMBAT: upgradeTrigger(priorEncounters.triggers.COMBAT!, 0.045, 90, {
    key: 'combat-witness-at-the-deli',
    title: 'Witness at the deli',
    text: 'A nearby shopkeeper saw the fight. Offer a small hush payment or let the moment pass.',
    tone: 'neutral',
    weight: 3,
    choices: [
      { key: 'pay-witness', label: 'Pay $10', text: 'Settle the shopkeeper down before the story spreads.', cash: { minCents: -1_000, maxCents: -1_000 }, heat: { min: -2, max: -1 } },
      { key: 'leave-witness', label: 'Leave it alone', text: 'Keep your cash and accept the attention.', heat: { min: 1, max: 1 } },
    ],
  }),
} satisfies Partial<Record<RandomEncounterTrigger, RandomEncounterTriggerRules>>;

/** 1.8.5-E. Action encounters use first-class event occurrences and receipts. */
export const classicOgV18I = {
  ...classicOgV18H,
  meta: {
    id: 'classic-og-v1.8-i',
    version: '1.8.0-I',
    name: 'Classic OG - First-Class Street Encounters',
    eventSystem: { communityEvents: 'FIRST_CLASS', seasonalEvents: 'FIRST_CLASS', randomEncounters: 'FIRST_CLASS' },
  },
  randomEncounters: {
    ...priorEncounters,
    triggers,
  },
} as const satisfies Ruleset;
