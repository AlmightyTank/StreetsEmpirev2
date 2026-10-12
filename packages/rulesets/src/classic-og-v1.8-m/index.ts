import { classicOgV18L } from '../classic-og-v1.8-l/index.js';
import type { RandomEncounterEntryRules, RandomEncounterTrigger, RandomEncounterTriggerRules, Ruleset } from '../types.js';

const priorEncounters = classicOgV18L.randomEncounters!;

/**
 * Easter egg encounters. Each sits at weight 1 beside the ordinary entries, so
 * it turns up a few times a season for an active player. Which choice finds
 * which egg lives with the egg catalog (EASTER_EGG_ENCOUNTERS in
 * @streets/shared); the effects here are deliberately small.
 */
export const easterEggEncounters = {
  SCOUT: {
    key: 'egg-the-statue',
    title: 'The statue',
    text: 'There is a stone statue at the end of the alley, hands over its face like it is crying. You would swear it was not there yesterday. You glance at your phone, and when you look back up, it is closer.',
    tone: 'warn',
    weight: 1,
    choices: [
      { key: 'dont-blink', label: 'Don’t blink', text: 'You stare until your eyes burn. A bus roars past, and when it has gone, so has the statue.' },
      { key: 'run', label: 'Run', text: 'You run. Something touches your shoulder. You wake up on a bench across town with a roll of 1969 banknotes in your pocket.', cash: { minCents: 1_969, maxCents: 1_969 } },
      { key: 'take-a-photo', label: 'Take a photo', text: 'That is not how this works. The photo is just a smear, and somebody saw you photographing a statue at 3am.', heat: { min: 1, max: 1 } },
    ],
  },
  TRAVEL: {
    key: 'egg-the-briefcase',
    title: 'The briefcase',
    text: 'A black briefcase sits on the back seat of a car with its doors open and nobody around. The combination is 666. Of course it is.',
    tone: 'neutral',
    weight: 1,
    choices: [
      { key: 'open', label: 'Open it', text: 'It glows gold. You look for a long moment, then close it. Some things you do not talk about.' },
      { key: 'leave', label: 'Leave it', text: 'Whoever owns that case is not somebody you want looking for you. You keep driving.' },
    ],
  },
  PRODUCE: {
    key: 'egg-the-whistle',
    title: 'Whistling down the block',
    text: 'Somebody is whistling “The Farmer in the Dell” at the end of the block. The kids on the corner go quiet. Somebody says a name.',
    tone: 'warn',
    weight: 1,
    choices: [
      { key: 'get-off-the-corner', label: 'Get off the corner', text: 'You pull the crew inside and kill the lights. The whistling goes past. A man’s gotta have a code.', heat: { min: -1, max: -1 } },
      { key: 'stand-your-ground', label: 'Stand your ground', text: 'He takes the stash money without raising his voice. “You come at the king, you best not miss.”', cash: { minCents: -15_000, maxCents: -5_000 } },
    ],
  },
  TURF: {
    key: 'egg-the-offer',
    title: 'A reasonable man',
    text: 'The man who owns the corner store on your block will not sell, and he will not pay. Your consigliere suggests reasoning with him.',
    tone: 'neutral',
    weight: 1,
    choices: [
      { key: 'make-the-offer', label: 'Make him an offer', text: 'In the morning he finds something in his bed that changes his mind. He signs. Nobody on the block will meet your eye.', cash: { minCents: -2_500, maxCents: -2_500 }, heat: { min: 2, max: 2 } },
      { key: 'leave-the-gun', label: 'Leave it', text: 'Leave the gun, take the cannoli. You walk away and the block stays quiet.' },
    ],
  },
} as const satisfies Partial<Record<RandomEncounterTrigger, RandomEncounterEntryRules>>;

function withEgg(trigger: RandomEncounterTriggerRules, egg: RandomEncounterEntryRules): RandomEncounterTriggerRules {
  return { ...trigger, entries: [...trigger.entries, egg] };
}

const triggers = {
  ...priorEncounters.triggers,
  SCOUT: withEgg(priorEncounters.triggers.SCOUT!, easterEggEncounters.SCOUT),
  TRAVEL: withEgg(priorEncounters.triggers.TRAVEL!, easterEggEncounters.TRAVEL),
  PRODUCE: withEgg(priorEncounters.triggers.PRODUCE!, easterEggEncounters.PRODUCE),
  TURF: withEgg(priorEncounters.triggers.TURF!, easterEggEncounters.TURF),
} satisfies Partial<Record<RandomEncounterTrigger, RandomEncounterTriggerRules>>;

/** 1.8.0-M. Easter eggs: four rare street encounters hide permanent titles. */
export const classicOgV18M = {
  ...classicOgV18L,
  meta: {
    ...classicOgV18L.meta,
    id: 'classic-og-v1.8-m',
    version: '1.8.0-M',
    name: 'Classic OG - Easter Eggs',
  },
  randomEncounters: {
    ...priorEncounters,
    triggers,
  },
} as const satisfies Ruleset;
