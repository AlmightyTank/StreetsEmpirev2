import { classicOgV18R } from '../classic-og-v1.8-r/index.js';
import { HIDDEN_STREETS_EXPANSION_COSMETICS } from '../hidden-streets-cosmetics.js';
import { tourCampaignQuests } from '../tour-campaign.js';
import { defineQuestCatalog, questCosmeticProblems } from '../quest-definitions.js';
import type {
  QuestCosmeticCatalog,
  QuestDefinition,
  QuestDefinitionCatalog,
  QuestDifficulty,
  QuestRewardDefinition,
  RandomEncounterEntryRules,
  RandomEncounterTrigger,
  RandomEncounterTriggerRules,
  Ruleset,
} from '../types.js';

const cosmetics = {
  ...classicOgV18R.cosmetics!,
  ...HIDDEN_STREETS_EXPANSION_COSMETICS,
} as const satisfies QuestCosmeticCatalog;

const priorEncounters = classicOgV18R.randomEncounters!;

function withEntries(
  trigger: RandomEncounterTriggerRules,
  entries: readonly RandomEncounterEntryRules[],
): RandomEncounterTriggerRules {
  return { ...trigger, entries: [...trigger.entries, ...entries] };
}

const expansionEncounters = {
  SCOUT: [
    { key: 'scout-old-coin', title: 'The Old Coin', text: 'A tarnished coin turns up under a loose curb brick with a district mark nobody uses anymore.', tone: 'neutral', weight: 2, choices: [
      { key: 'mark-the-curb', label: 'Mark the curb', text: 'You mark the spot and pocket the first map clue.', cash: { minCents: 1_000, maxCents: 6_000 } },
      { key: 'ask-around', label: 'Ask around', text: 'The questions cost time but cool down a rumor.', heat: { min: -1, max: -1 } },
      { key: 'leave-the-coin', label: 'Leave the coin', text: 'You leave it where it was and remember the symbol.' },
    ] },
    { key: 'scout-missing-witness', title: 'The Quiet Witness', text: 'A nervous witness wants a safe route and a respectful ear, not a spectacle.', tone: 'warn', weight: 2, choices: [
      { key: 'walk-the-route', label: 'Walk the route', text: 'You find a safer path and a better description.', heat: { min: -1, max: -1 } },
      { key: 'note-the-car', label: 'Note the car', text: 'A plate fragment turns into a paid tip.', cash: { minCents: 2_000, maxCents: 7_500 } },
      { key: 'keep-distance', label: 'Keep distance', text: 'You back off before attention follows you both.' },
    ] },
    { key: 'scout-dream-static', title: 'Dream Static', text: 'A streetlight hums in a rhythm that feels like a warning from a half-remembered dream.', tone: 'warn', weight: 1, choices: [
      { key: 'write-the-rhythm', label: 'Write the rhythm', text: 'The pattern becomes a chamber clue.', cash: { minCents: 1_500, maxCents: 6_500 } },
      { key: 'wake-the-block', label: 'Wake the block', text: 'Lights come on and the strange pressure lifts.', heat: { min: -1, max: -1 } },
      { key: 'ignore-the-hum', label: 'Ignore the hum', text: 'The hum follows you for one more block.' },
    ] },
    { key: 'scout-star-chart-fragment', title: 'Star-Chart Fragment', text: 'A foil scrap shows city streets overlaid with a sky that does not match tonight.', tone: 'neutral', weight: 1, choices: [
      { key: 'line-up-stars', label: 'Line up stars', text: 'Two blocks and a rooftop angle turn into a clean clue.', cash: { minCents: 2_000, maxCents: 8_000 } },
      { key: 'fold-it-away', label: 'Fold it away', text: 'You keep the fragment before the wind takes it.' },
      { key: 'sell-the-paper', label: 'Sell the paper', text: 'A collector overpays for the wrong reason.', cash: { minCents: 3_000, maxCents: 10_000 } },
    ] },
    { key: 'scout-night-watcher-signal', title: 'Rooftop Signal', text: 'A narrow beam sweeps the roofline, original symbol and all, then vanishes before sirens arrive.', tone: 'neutral', weight: 1, choices: [
      { key: 'trace-the-roof', label: 'Trace the roof', text: 'A chalk mark points to the next lookout.', cash: { minCents: 2_500, maxCents: 8_500 } },
      { key: 'stay-in-shadow', label: 'Stay in shadow', text: 'You stay unseen and leave less heat behind.', heat: { min: -1, max: -1 } },
      { key: 'walk-away', label: 'Walk away', text: 'Some lights are invitations, some are warnings.' },
    ] },
    { key: 'scout-forgotten-runestone', title: 'Forgotten Runestone', text: 'A carved stone under the city bears original guild marks and a practical warning.', tone: 'neutral', weight: 1, choices: [
      { key: 'copy-the-mark', label: 'Copy the mark', text: 'The copied mark opens the first guild note.', cash: { minCents: 1_000, maxCents: 5_000 } },
      { key: 'clean-the-stone', label: 'Clean the stone', text: 'A second line of the inscription appears.', heat: { min: -1, max: -1 } },
      { key: 'leave-covered', label: 'Leave it covered', text: 'You cover it again and keep the location quiet.' },
    ] },
  ] satisfies readonly RandomEncounterEntryRules[],
  TRAVEL: [
    { key: 'travel-three-travelers', title: 'Three Travelers', text: 'Three singers at a roadside stop argue over a record, a map, and which bridge is haunted.', tone: 'neutral', weight: 2, choices: [
      { key: 'buy-the-record', label: 'Buy the record', text: 'The record sleeve hides a rail clue.', cash: { minCents: -3_000, maxCents: -1_000 } },
      { key: 'share-the-route', label: 'Share the route', text: 'They trade a shortcut for your time.', heat: { min: -1, max: -1 } },
      { key: 'keep-driving', label: 'Keep driving', text: 'The chorus sticks anyway.' },
    ] },
    { key: 'travel-timekeeper-anomaly', title: 'Clockwork Detour', text: 'Every clock on the dashboard jumps by seven minutes at the same empty mile marker.', tone: 'warn', weight: 1, choices: [
      { key: 'mark-the-mile', label: 'Mark the mile', text: 'The marker becomes the first clockwork clue.', cash: { minCents: 2_000, maxCents: 7_000 } },
      { key: 'reset-the-clocks', label: 'Reset the clocks', text: 'The reset calms the crew and the road.', heat: { min: -1, max: -1 } },
      { key: 'drive-through', label: 'Drive through', text: 'You drive through before the minute repeats.' },
    ] },
    { key: 'travel-extraction-cache', title: 'Extraction Cache', text: 'A sealed cache beside the road lists the risk before anyone asks you to open it.', tone: 'warn', weight: 1, choices: [
      { key: 'open-after-reading', label: 'Open after reading', text: 'You accept the visible risk and pocket a bounded find.', cash: { minCents: 3_000, maxCents: 12_000 }, heat: { min: 1, max: 1 } },
      { key: 'mark-for-later', label: 'Mark for later', text: 'You leave it intact and record the extraction point.' },
      { key: 'walk-away-clean', label: 'Walk away clean', text: 'No surprise spend, no surprise debt.' },
    ] },
    { key: 'travel-rune-merchant', title: 'Wandering Rune Merchant', text: 'A traveler unfolds original stone charms and a ledger of fair, finite trades.', tone: 'neutral', weight: 1, choices: [
      { key: 'trade-for-rune', label: 'Trade for rune', text: 'The trade is modest, fair, and recorded.', cash: { minCents: -5_000, maxCents: -2_000 } },
      { key: 'ask-about-guild', label: 'Ask about guild', text: 'A guild door clue comes free with a warning.', heat: { min: -1, max: -1 } },
      { key: 'pass-politely', label: 'Pass politely', text: 'The merchant nods and moves on.' },
    ] },
  ] satisfies readonly RandomEncounterEntryRules[],
  STORE: [
    { key: 'store-dockyard-manifest', title: 'Dockyard Manifest', text: 'A misfiled manifest slips under the counter with three numbers circled in red pencil.', tone: 'neutral', weight: 1, choices: [
      { key: 'copy-manifest', label: 'Copy manifest', text: 'You copy the useful line before it disappears.', cash: { minCents: 1_500, maxCents: 6_000 } },
      { key: 'flag-the-error', label: 'Flag the error', text: 'A clerk fixes the mistake and the heat drops.', heat: { min: -1, max: -1 } },
      { key: 'leave-paperwork', label: 'Leave paperwork', text: 'You leave the paperwork on the counter.' },
    ] },
    { key: 'store-red-storm-device', title: 'Red Storm Device', text: 'A humming experimental box arrives with recovery instructions and no promise of power.', tone: 'warn', weight: 1, choices: [
      { key: 'stabilize-device', label: 'Stabilize device', text: 'You stabilize it enough to read the label.', cash: { minCents: 2_000, maxCents: 7_500 } },
      { key: 'power-it-down', label: 'Power it down', text: 'The room quiets and nobody panics.', heat: { min: -1, max: -1 } },
      { key: 'leave-crated', label: 'Leave crated', text: 'You leave it crated and unarmed.' },
    ] },
  ] satisfies readonly RandomEncounterEntryRules[],
  TURF: [
    { key: 'turf-laughing-card', title: 'The Laughing Card', text: 'A bright card with an original crown-smile cipher is pinned where everyone can see it.', tone: 'warn', weight: 1, choices: [
      { key: 'decode-card', label: 'Decode card', text: 'The card points to a staged sequence, not a random threat.', cash: { minCents: 2_000, maxCents: 8_000 } },
      { key: 'clear-the-crowd', label: 'Clear the crowd', text: 'You lower the temperature before rumors spread.', heat: { min: -1, max: -1 } },
      { key: 'bag-as-evidence', label: 'Bag evidence', text: 'You keep the card and skip the show.' },
    ] },
  ] satisfies readonly RandomEncounterEntryRules[],
  COMBAT: [
    { key: 'combat-five-names', title: 'Five Names', text: 'A quiet list of five names circulates after a fight, more investigation than threat.', tone: 'warn', weight: 1, choices: [
      { key: 'verify-list', label: 'Verify list', text: 'You verify one name without escalating the story.', cash: { minCents: 3_000, maxCents: 9_000 } },
      { key: 'cool-the-room', label: 'Cool the room', text: 'Nobody gets extra heat for a rumor.', heat: { min: -1, max: -1 } },
      { key: 'fold-list-away', label: 'Fold list away', text: 'You keep the list as evidence, not a trophy.' },
    ] },
  ] satisfies readonly RandomEncounterEntryRules[],
} as const satisfies Partial<Record<RandomEncounterTrigger, readonly RandomEncounterEntryRules[]>>;

const randomEncounters = {
  ...priorEncounters,
  triggers: {
    ...priorEncounters.triggers,
    SCOUT: withEntries(priorEncounters.triggers.SCOUT!, expansionEncounters.SCOUT),
    TRAVEL: withEntries(priorEncounters.triggers.TRAVEL!, expansionEncounters.TRAVEL),
    STORE: withEntries(priorEncounters.triggers.STORE!, expansionEncounters.STORE),
    TURF: withEntries(priorEncounters.triggers.TURF!, expansionEncounters.TURF),
    COMBAT: withEntries(priorEncounters.triggers.COMBAT!, expansionEncounters.COMBAT),
  },
} as const;

const base = classicOgV18R.questDefinitions as QuestDefinitionCatalog;

type Trigger = NonNullable<QuestDefinition['availability']['secretTrigger']>;

function encounterTrigger(eventTypes: readonly string[], key: string, target = 1): Trigger {
  return { kind: 'ACTIVITY_COUNT', eventTypes, where: { 'encounter.key': key }, target };
}

function simpleSecret(input: {
  key: string;
  title: string;
  description: string;
  family: string;
  tier: 'OBVIOUS' | 'HIDDEN' | 'LEGENDARY';
  trigger: Trigger;
  objectiveId: string;
  objective: string;
  objectiveEvents: readonly string[];
  target?: number;
  rewards: readonly QuestRewardDefinition[];
  difficulty?: QuestDifficulty;
  cooldownMinutes?: number;
}): QuestDefinition {
  return {
    key: input.key,
    title: input.title,
    description: input.description,
    contactKey: null,
    type: 'SECRET',
    category: input.family,
    difficulty: input.difficulty ?? 'SERIOUS_BUSINESS',
    prerequisites: [],
    objectives: [{ id: input.objectiveId, kind: 'EVENT_COUNT', description: input.objective, target: input.target ?? 2, params: { eventTypes: input.objectiveEvents } }],
    bonusObjectives: [],
    rewards: [...input.rewards],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {
      hidden: true,
      secretTrigger: input.trigger,
      secretContent: { family: input.family, discoveryTier: input.tier, clueMilestones: [input.objectiveId], cooldownMinutes: input.cooldownMinutes ?? 1_440 },
    },
  };
}

const expansionSecrets = {
  SECRET_LOST_FORTUNE: simpleSecret({
    key: 'SECRET_LOST_FORTUNE', title: 'Lost Fortune', family: 'LOST_ADVENTURE', tier: 'HIDDEN',
    description: 'An old coin points to map fragments, tunnels, and a buried city stash that can be solved without any other storyline.',
    trigger: encounterTrigger(['SCOUT'], 'scout-old-coin'), objectiveId: 'map_fragments', objective: 'Find 3 map fragments while scouting.', objectiveEvents: ['SCOUT'], target: 3,
    rewards: [{ kind: 'CASH', amount: 3_500_000 }, { kind: 'COSMETIC_UNLOCK', key: 'lost-fortune-badge' }, { kind: 'COSMETIC_UNLOCK', key: 'lost-fortune-frame' }],
  }),
  SECRET_THREE_TRAVELERS: simpleSecret({
    key: 'SECRET_THREE_TRAVELERS', title: 'Three Travelers', family: 'LOST_ADVENTURE', tier: 'OBVIOUS',
    description: 'Three roadside travelers turn an old record and rail clues into a comic detour with a recoverable ending.',
    trigger: encounterTrigger(['RUN_LAUNCHED'], 'travel-three-travelers'), objectiveId: 'rail_clues', objective: 'Bring 2 road runs home after the travelers sing their clue.', objectiveEvents: ['RUN_RETURNED'], target: 2,
    rewards: [{ kind: 'CASH', amount: 2_750_000 }, { kind: 'FAVOR_ITEM', key: 'BURNER_PHONE', amount: 1 }],
  }),
  SECRET_DOCKYARD_INVESTIGATION: simpleSecret({
    key: 'SECRET_DOCKYARD_INVESTIGATION', title: 'Dockyard Investigation', family: 'DETECTIVE', tier: 'HIDDEN',
    description: 'Misfiled cargo manifests reveal a respectful investigation about suspicious shipments and careful evidence handling.',
    trigger: encounterTrigger(['STORE_BUY', 'STORE_SELL'], 'store-dockyard-manifest'), objectiveId: 'manifest_checks', objective: 'Check 3 store records after finding the manifest.', objectiveEvents: ['STORE_BUY', 'STORE_SELL'], target: 3,
    rewards: [{ kind: 'CASH', amount: 3_000_000 }, { kind: 'COSMETIC_UNLOCK', key: 'pattern-board-badge' }],
  }),
  SECRET_MISSING_WITNESS: simpleSecret({
    key: 'SECRET_MISSING_WITNESS', title: 'Missing Witness', family: 'DETECTIVE', tier: 'HIDDEN',
    description: 'Protect a witness through evidence and route planning without sensationalizing harm or exposing private player data.',
    trigger: encounterTrigger(['SCOUT'], 'scout-missing-witness'), objectiveId: 'safe_routes', objective: 'Scout 3 safe route checks for the witness.', objectiveEvents: ['SCOUT'], target: 3,
    rewards: [{ kind: 'CASH', amount: 3_000_000 }, { kind: 'CONTACT_REP', key: 'VIC', amount: 12 }],
  }),
  SECRET_THE_PATTERN: simpleSecret({
    key: 'SECRET_THE_PATTERN', title: 'The Pattern', family: 'DETECTIVE', tier: 'LEGENDARY',
    description: 'Five district clues resolve into a profiling-board finale and an optional pointer back toward Blackwood.',
    trigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['SCOUT'], target: 5 }, objectiveId: 'five_district_notes', objective: 'Scout 5 times while assembling the pattern board.', objectiveEvents: ['SCOUT'], target: 5,
    rewards: [{ kind: 'CASH', amount: 4_000_000 }, { kind: 'COSMETIC_UNLOCK', key: 'pattern-board-badge' }],
  }),
  SECRET_BLACKWOOD_MANOR: simpleSecret({
    key: 'SECRET_BLACKWOOD_MANOR', title: 'Blackwood Manor', family: 'BLACKWOOD', tier: 'LEGENDARY',
    description: 'Follow the colorful van trail into a manor case of disguises, traps, and an unmasking before the final strange twist.',
    trigger: encounterTrigger(['SCOUT'], 'scout-colorful-van'), objectiveId: 'manor_rooms', objective: 'Scout 4 room clues in any order.', objectiveEvents: ['SCOUT'], target: 4,
    rewards: [{ kind: 'CASH', amount: 4_500_000 }, { kind: 'COSMETIC_UNLOCK', key: 'manor-unmasked-badge' }, { kind: 'COSMETIC_UNLOCK', key: 'blackwood-manor-theme' }],
  }),
  SECRET_THIRTEEN_CHAMBERS: simpleSecret({
    key: 'SECRET_THIRTEEN_CHAMBERS', title: 'Thirteen Chambers', family: 'BLACKWOOD', tier: 'LEGENDARY',
    description: 'A staged set of thirteen chamber mysteries can be solved in flexible order without any unobtainable clue.',
    trigger: encounterTrigger(['SCOUT'], 'scout-dream-static'), objectiveId: 'chamber_notes', objective: 'Record 5 chamber notes from scouting.', objectiveEvents: ['SCOUT'], target: 5,
    rewards: [{ kind: 'CASH', amount: 3_500_000 }],
  }),
  SECRET_DONT_FALL_ASLEEP: simpleSecret({
    key: 'SECRET_DONT_FALL_ASLEEP', title: "Don't Fall Asleep", family: 'BLACKWOOD', tier: 'HIDDEN',
    description: 'An eerie dream sequence keeps intensity optional and uses reduced-motion-safe presentation.',
    trigger: encounterTrigger(['SCOUT'], 'scout-dream-static'), objectiveId: 'waking_clues', objective: 'Find 2 waking clues after the dream static.', objectiveEvents: ['SCOUT'], target: 2,
    rewards: [{ kind: 'CASH', amount: 2_500_000 }],
  }),
  SECRET_NEW_EARTH: simpleSecret({
    key: 'SECRET_NEW_EARTH', title: 'New Earth', family: 'SCI_FI', tier: 'HIDDEN',
    description: 'Star-chart fragments appear through ordinary actions and resolve into an original cosmic transmission.',
    trigger: encounterTrigger(['SCOUT'], 'scout-star-chart-fragment'), objectiveId: 'chart_fragments', objective: 'Collect 3 star-chart fragments while scouting.', objectiveEvents: ['SCOUT'], target: 3,
    rewards: [{ kind: 'CASH', amount: 3_500_000 }, { kind: 'COSMETIC_UNLOCK', key: 'star-chart-frame' }],
  }),
  SECRET_TIMEKEEPER: simpleSecret({
    key: 'SECRET_TIMEKEEPER', title: 'The Timekeeper', family: 'SCI_FI', tier: 'HIDDEN',
    description: 'A clockwork anomaly becomes a small puzzle with explainable optional links to other mysteries.',
    trigger: encounterTrigger(['RUN_LAUNCHED'], 'travel-timekeeper-anomaly'), objectiveId: 'clock_marks', objective: 'Bring 2 runs home after the clockwork detour.', objectiveEvents: ['RUN_RETURNED'], target: 2,
    rewards: [{ kind: 'CASH', amount: 3_000_000 }],
  }),
  SECRET_RED_STORM: simpleSecret({
    key: 'SECRET_RED_STORM', title: 'Red Storm', family: 'SCI_FI', tier: 'HIDDEN',
    description: 'Recover an experimental device safely; the reward is bounded cosmetics and story progress, not power.',
    trigger: encounterTrigger(['STORE_BUY', 'STORE_SELL'], 'store-red-storm-device'), objectiveId: 'device_recovery', objective: 'Complete 2 store actions while stabilizing the device.', objectiveEvents: ['STORE_BUY', 'STORE_SELL'], target: 2,
    rewards: [{ kind: 'CASH', amount: 3_000_000 }],
  }),
  SECRET_FIVE_NAMES: simpleSecret({
    key: 'SECRET_FIVE_NAMES', title: 'Five Names', family: 'DANGEROUS', tier: 'HIDDEN',
    description: 'A non-graphic boss investigation keeps the list as evidence, not glorification.',
    trigger: encounterTrigger(['RAID_ATTACK', 'DRIVE_BY_ATTACK'], 'combat-five-names'), objectiveId: 'verify_names', objective: 'Resolve 2 combat actions while verifying the list.', objectiveEvents: ['RAID_ATTACK', 'DRIVE_BY_ATTACK'], target: 2,
    rewards: [{ kind: 'CASH', amount: 3_500_000 }],
  }),
  SECRET_EXTRACTION_REQUIRED: simpleSecret({
    key: 'SECRET_EXTRACTION_REQUIRED', title: 'Extraction Required', family: 'DANGEROUS', tier: 'OBVIOUS',
    description: 'A high-risk cache states costs before confirmation and never hides cash, turns, or retry drains.',
    trigger: encounterTrigger(['RUN_LAUNCHED'], 'travel-extraction-cache'), objectiveId: 'clean_extracts', objective: 'Bring 2 runs home after reading an extraction cache.', objectiveEvents: ['RUN_RETURNED'], target: 2,
    rewards: [{ kind: 'CASH', amount: 3_000_000 }, { kind: 'COSMETIC_UNLOCK', key: 'extraction-badge' }],
  }),
  SECRET_NIGHT_WATCHER: simpleSecret({
    key: 'SECRET_NIGHT_WATCHER', title: 'The Night Watcher', family: 'SHADOW_CITY', tier: 'HIDDEN',
    description: 'An original rooftop investigator leaves signals, lookouts, and choices about cooperation versus staying unseen.',
    trigger: encounterTrigger(['SCOUT'], 'scout-night-watcher-signal'), objectiveId: 'rooftop_marks', objective: 'Scout 3 rooftop marks.', objectiveEvents: ['SCOUT'], target: 3,
    rewards: [{ kind: 'CASH', amount: 3_500_000 }, { kind: 'COSMETIC_UNLOCK', key: 'shadow-city-frame' }],
  }),
  SECRET_LAUGHING_KING: simpleSecret({
    key: 'SECRET_LAUGHING_KING', title: 'The Laughing King', family: 'SHADOW_CITY', tier: 'HIDDEN',
    description: 'Original cards, theatrical robberies, and false leads build a mastermind case without glamorizing harm.',
    trigger: encounterTrigger(['TURF_POST', 'TURF_PUSH_ATTACK'], 'turf-laughing-card'), objectiveId: 'card_ciphers', objective: 'Work 2 turf actions while decoding card ciphers.', objectiveEvents: ['TURF_POST', 'TURF_PUSH_ATTACK'], target: 2,
    rewards: [{ kind: 'CASH', amount: 3_500_000 }, { kind: 'COSMETIC_UNLOCK', key: 'shadow-city-badge' }],
  }),
  SECRET_ONE_BAD_NIGHT: simpleSecret({
    key: 'SECRET_ONE_BAD_NIGHT', title: 'One Bad Night', family: 'SHADOW_CITY', tier: 'LEGENDARY',
    description: 'An optional combined finale decodes staged clues to avert panic after both Shadow City branches are known.',
    trigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['SCOUT', 'TURF_POST', 'TURF_PUSH_ATTACK'], target: 6 }, objectiveId: 'staged_sequence', objective: 'Resolve 6 Shadow City investigation actions.', objectiveEvents: ['SCOUT', 'TURF_POST', 'TURF_PUSH_ATTACK'], target: 6,
    rewards: [{ kind: 'CASH', amount: 5_000_000 }, { kind: 'COSMETIC_UNLOCK', key: 'shadow-city-badge' }],
  }),
  SECRET_FORGOTTEN_GUILD: simpleSecret({
    key: 'SECRET_FORGOTTEN_GUILD', title: 'The Forgotten Guild', family: 'FORGOTTEN_GUILD', tier: 'HIDDEN',
    description: 'Original runestones, sealed doors, and an artisan journal open a hidden guild under the city without adding a skill system.',
    trigger: encounterTrigger(['SCOUT'], 'scout-forgotten-runestone'), objectiveId: 'guild_doors', objective: 'Scout 3 guild door clues.', objectiveEvents: ['SCOUT'], target: 3,
    rewards: [{ kind: 'CASH', amount: 4_000_000 }, { kind: 'COSMETIC_UNLOCK', key: 'guildmaster-badge' }],
  }),
  SECRET_WANDERING_RUNE_MERCHANT: simpleSecret({
    key: 'SECRET_WANDERING_RUNE_MERCHANT', title: 'The Wandering Rune Merchant', family: 'FORGOTTEN_GUILD', tier: 'OBVIOUS',
    description: 'A fair rare merchant offers clues and artifacts without paid rerolls or farmable power.',
    trigger: encounterTrigger(['RUN_LAUNCHED'], 'travel-rune-merchant'), objectiveId: 'merchant_notes', objective: 'Bring 2 runs home after meeting the rune merchant.', objectiveEvents: ['RUN_RETURNED'], target: 2,
    rewards: [{ kind: 'CASH', amount: 2_500_000 }],
  }),
  SECRET_THREE_GUILD_TRIALS: simpleSecret({
    key: 'SECRET_THREE_GUILD_TRIALS', title: 'Three Guild Trials', family: 'FORGOTTEN_GUILD', tier: 'LEGENDARY',
    description: 'Exploration, puzzle-solving, and planning trials reuse existing actions instead of creating duplicate skill progression.',
    trigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['SCOUT', 'RUN_RETURNED', 'STORE_BUY', 'STORE_SELL'], target: 6 }, objectiveId: 'trial_notes', objective: 'Complete 6 existing actions as guild trial notes.', objectiveEvents: ['SCOUT', 'RUN_RETURNED', 'STORE_BUY', 'STORE_SELL'], target: 6,
    rewards: [{ kind: 'CASH', amount: 5_000_000 }, { kind: 'COSMETIC_UNLOCK', key: 'guild-arcane-frame' }],
  }),
  SECRET_ANCIENT_SEALS: simpleSecret({
    key: 'SECRET_ANCIENT_SEALS', title: 'Ancient Seals', family: 'FORGOTTEN_GUILD', tier: 'HIDDEN',
    description: 'Collect original seal clues through Scout, Travel, and Contacts with reliable acquisition paths.',
    trigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['SCOUT', 'RUN_LAUNCHED', 'QUEST_ACCEPTED'], target: 3 }, objectiveId: 'seal_clues', objective: 'Collect 3 seal clues from normal actions.', objectiveEvents: ['SCOUT', 'RUN_LAUNCHED', 'QUEST_ACCEPTED'], target: 3,
    rewards: [{ kind: 'CASH', amount: 3_500_000 }],
  }),
  SECRET_YOU_HAD_TO_BE_THERE: simpleSecret({
    key: 'SECRET_YOU_HAD_TO_BE_THERE', title: 'You Had to Be There', family: 'LEGENDARY_CROSSOVER', tier: 'LEGENDARY',
    description: 'The versioned completion case rewards the defined Hidden Streets set for this ruleset without moving the goalposts later.',
    trigger: { kind: 'ACTIVITY_COUNT', eventTypes: ['SCOUT', 'RUN_RETURNED', 'STORE_BUY', 'STORE_SELL', 'TURF_POST'], target: 12 }, objectiveId: 'collection_review', objective: 'Complete 12 supported investigation actions across Hidden Streets families.', objectiveEvents: ['SCOUT', 'RUN_RETURNED', 'STORE_BUY', 'STORE_SELL', 'TURF_POST'], target: 12,
    rewards: [{ kind: 'CASH', amount: 6_000_000 }, { kind: 'COSMETIC_UNLOCK', key: 'you-had-to-be-there-badge' }, { kind: 'COSMETIC_UNLOCK', key: 'you-had-to-be-there-frame' }],
  }),
} as const satisfies QuestDefinitionCatalog;

const questDefinitions = defineQuestCatalog({
  ...base,
  ...tourCampaignQuests,
  ...expansionSecrets,
});

const cosmeticProblems = questCosmeticProblems(questDefinitions, cosmetics);
if (cosmeticProblems.length) {
  throw new Error(`Invalid quest cosmetic rewards:\n- ${cosmeticProblems.join('\n- ')}`);
}

export const classicOgV18S = {
  ...classicOgV18R,
  meta: {
    ...classicOgV18R.meta,
    id: 'classic-og-v1.8-s',
    version: '1.8.0-S',
    name: 'Classic OG - Hidden Streets Complete',
  },
  cosmetics,
  randomEncounters,
  questDefinitions,
} as const satisfies Ruleset;
