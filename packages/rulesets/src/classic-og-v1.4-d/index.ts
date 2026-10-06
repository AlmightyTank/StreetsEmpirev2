import { classicOgV14C2 } from '../classic-og-v1.4-c2/index.js';
import type { Ruleset } from '../types.js';

/**
 * 1.4.0-D — Faction Perks.
 *
 * Standing starts to mean something. Known with a faction, it tells you what it sees in its
 * lane; Trusted, it warns you before trouble lands; Connected, it shades one price or cost a
 * little, never by more than the validator's cap:
 *
 * | Faction | Known: information | Trusted: early warning | Connected: nudge |
 * | --- | --- | --- | --- |
 * | The Kings | the locals holding blocks where you work | a corner about to run dry, a shield about to drop | corner upkeep 10% less |
 * | The Outfit | the blocks running rackets near you | where the crackdown lands, a day before the street hears | Tommy's guns 5% cheaper |
 * | Road Saints MC | the hottest roads out of town at your Heat | a hot road ahead of a run on the road | bodyguard tickets 10% cheaper |
 * | The Cartel Line | where Pip is short, and of what | a drought or Pip running out, up to a day ahead | Pip's product 5% cheaper |
 * | Civic Handshake | how close each official is to Internal Affairs | a Case a few points short of its next stage | 10% less exposure per favor |
 *
 * Every warning reads the player's own state or the round's public schedule; none names or
 * reads another player. Everything else is exactly 1.4.0-C2's. See docs/ROADMAP-1.4.0.md.
 */
export const classicOgV14D = {
  ...classicOgV14C2,
  meta: { id: 'classic-og-v1.4-d', version: '1.4.0-D', name: 'Classic OG - Faction Perks' },
  factionPerks: {
    nudges: {
      KINGS: { kind: 'CORNER_UPKEEP', percent: 10 },
      OUTFIT: { kind: 'TOMMY_WEAPONS', percent: 5 },
      ROAD_SAINTS: { kind: 'BODYGUARD_TICKETS', percent: 10 },
      CARTEL_LINE: { kind: 'PIP_PRODUCT', percent: 5 },
      CIVIC_HANDSHAKE: { kind: 'OFFICIAL_EXPOSURE', percent: 10 },
    },
    warnings: {
      cornerLeadHours: 6,
      sweepLeadHours: 24,
      hotRoadChance: 0.05,
      supplyLeadHours: 24,
      stageLeadPoints: 5,
    },
  },
} as const satisfies Ruleset;
