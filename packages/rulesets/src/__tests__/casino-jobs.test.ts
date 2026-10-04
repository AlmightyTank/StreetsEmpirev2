import { describe, expect, it } from 'vitest';
import { classicOgV12E2 } from '../classic-og-v1.2-e2/index.js';
import { classicOgV12F } from '../classic-og-v1.2-f/index.js';
import { ACE_HIGH_ROLLER_THEO_CENTS, ACE_REGULAR_THEO_CENTS, casinoJobs } from '../classic-og-v1.2-f/casino-jobs.js';
import { applyQuestProgress } from '../quest-progress.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDataObject, QuestProgressMap, QuestRewardDefinition, Ruleset } from '../types.js';

const aceJobs = Object.values(casinoJobs);
const aceRewards: QuestRewardDefinition[] = aceJobs.flatMap((job) => [...job.rewards] as QuestRewardDefinition[]);

function play(objectiveKey: keyof typeof casinoJobs, events: Array<{ type: string; payload: QuestDataObject; state?: QuestDataObject }>) {
  const quest = casinoJobs[objectiveKey];
  let progress: QuestProgressMap = {};
  let completed = false;
  for (const event of events) {
    const applied = applyQuestProgress(quest.objectives, progress, event);
    progress = applied.progress;
    completed = applied.completed;
  }
  return { progress, completed };
}

const wager = (payload: Partial<QuestDataObject> = {}) => ({
  type: 'CASINO_WAGER',
  payload: { game: 'ROULETTE', tableKey: 'STREET_ROULETTE', room: 'FLOOR', citySlug: 'new-york-city', wagerCents: 1_000, theoCents: 52, ...payload },
});

describe('1.2.0-F casino Jobs ruleset', () => {
  it('pins a new ruleset on top of E2 without touching casino rules', () => {
    expect(classicOgV12F.meta).toEqual({ id: 'classic-og-v1.2-f', version: '1.2.0-F', name: 'Classic OG - Casino Jobs & Rewards' });
    expect(classicOgV12F.casino).toBe(classicOgV12E2.casino);
    expect((classicOgV12E2 as Ruleset).contacts?.ACE).toBeUndefined();
  });

  it('adds Ace beside the six original contacts', () => {
    expect(Object.keys(classicOgV12F.contacts)).toEqual(['MAMA_KING', 'PIP', 'TOMMY', 'WHEELS', 'VIC', 'BLOCKS', 'ACE']);
    for (const key of Object.keys(classicOgV12E2.contacts ?? {}) as Array<keyof typeof classicOgV12E2.contacts>) {
      expect(classicOgV12F.contacts[key]).toBe(classicOgV12E2.contacts[key]);
    }
    expect(classicOgV12F.contacts.ACE.role).toBe('Casino Host');
  });

  it('keeps every earlier Job and adds eight valid one-time casino Jobs for Ace', () => {
    const before = Object.keys(classicOgV12E2.questDefinitions ?? {});
    const after = Object.keys(classicOgV12F.questDefinitions);
    expect(after).toEqual([...before, ...Object.keys(casinoJobs)]);
    expect(aceJobs).toHaveLength(8);
    expect(questDefinitionProblems(classicOgV12F.questDefinitions)).toEqual([]);
    for (const job of aceJobs) {
      expect(job.contactKey).toBe('ACE');
      expect(job.category).toBe('CASINO');
      expect(job.repeatability).toBe('ONCE');
    }
  });

  it('never pays money-like rewards for casino play', () => {
    const kinds = new Set(aceRewards.map((reward) => reward.kind));
    expect([...kinds].sort()).toEqual(['CONTACT_REP', 'COSMETIC_UNLOCK']);
  });

  it('pays only cosmetics that exist, with stable style keys for the accent and frame', () => {
    for (const reward of aceRewards) {
      if (reward.kind === 'COSMETIC_UNLOCK') expect(classicOgV12F.cosmetics[reward.key as keyof typeof classicOgV12F.cosmetics]).toBeDefined();
    }
    expect(classicOgV12F.cosmetics['ace-velvet-rose']).toMatchObject({ kind: 'ACCENT', styleKey: 'velvet-rose' });
    expect(classicOgV12F.cosmetics['ace-velvet-rope-frame']).toMatchObject({ kind: 'PROFILE_FRAME', styleKey: 'velvet-rope-frame' });
    expect(casinoJobs.ACE_BLACK_ROOM.rewards).toContainEqual({ kind: 'COSMETIC_UNLOCK', key: 'ace-velvet-rose' });
    expect(casinoJobs.ACE_BLACK_ROOM.rewards).toContainEqual({ kind: 'COSMETIC_UNLOCK', key: 'ace-velvet-rope-frame' });
  });

  it('ties the status Jobs to the pinned 1.2.0-E tiers', () => {
    const tiers = classicOgV12F.casino.status.tiers;
    expect(ACE_REGULAR_THEO_CENTS).toBe(tiers.find((tier) => tier.key === 'REGULAR')!.minTheoCents);
    expect(ACE_HIGH_ROLLER_THEO_CENTS).toBe(tiers.find((tier) => tier.key === 'HIGH_ROLLER')!.minTheoCents);
  });

  it('makes the finale reachable on Ace standing earned from her own Jobs', () => {
    const rep = (key: keyof typeof casinoJobs) => casinoJobs[key].rewards
      .filter((reward) => reward.kind === 'CONTACT_REP')
      .reduce((sum, reward) => sum + ('amount' in reward ? reward.amount : 0), 0);
    const beforeFinale = aceJobs.filter((job) => job.key !== 'ACE_BLACK_ROOM').reduce((sum, job) => sum + rep(job.key), 0);
    const needed = casinoJobs.ACE_BLACK_ROOM.prerequisites.find((prerequisite) => prerequisite.kind === 'CONTACT_REP_AT_LEAST')!;
    expect(beforeFinale).toBeGreaterThanOrEqual(needed.params.points);
  });
});

describe('1.2.0-F casino Job objectives', () => {
  it('counts distinct games for the floor tour, not repeat play', () => {
    const repeat = play('ACE_FLOOR_TOUR', [wager(), wager(), wager(), wager()]);
    expect(repeat.progress.games?.current).toBe(1);
    const tour = play('ACE_FLOOR_TOUR', ['SLOTS', 'BLACKJACK', 'ROULETTE', 'STREET_DICE'].map((game) => wager({ game })));
    expect(tour.completed).toBe(true);
  });

  it('only counts VIP room wagers behind the velvet rope', () => {
    const floor = play('ACE_VELVET_ROPE', Array.from({ length: 5 }, () => wager()));
    expect(floor.progress.vip_wagers?.current).toBe(0);
    const vip = play('ACE_VELVET_ROPE', Array.from({ length: 5 }, () => wager({ room: 'VIP' })));
    expect(vip.completed).toBe(true);
  });

  it('needs Vegas VIP play and High Roller theo for the Black Room', () => {
    const elsewhere = play('ACE_BLACK_ROOM', Array.from({ length: 3 }, () => ({ ...wager({ room: 'VIP' }), state: { casinoTheoCents: ACE_HIGH_ROLLER_THEO_CENTS } })));
    expect(elsewhere.completed).toBe(false);
    const vegas = play('ACE_BLACK_ROOM', Array.from({ length: 3 }, () => ({ ...wager({ room: 'VIP', citySlug: 'las-vegas' }), state: { casinoTheoCents: ACE_HIGH_ROLLER_THEO_CENTS } })));
    expect(vegas.completed).toBe(true);
  });

  it('reads Regular status from rated theo whenever a wager lands', () => {
    const below = play('ACE_KNOWN_FACE', [{ ...wager(), state: { casinoTheoCents: ACE_REGULAR_THEO_CENTS - 1 } }]);
    expect(below.completed).toBe(false);
    const regular = play('ACE_KNOWN_FACE', [{ ...wager(), state: { casinoTheoCents: ACE_REGULAR_THEO_CENTS } }]);
    expect(regular.completed).toBe(true);
  });

  it('counts only a dealt natural for Natural Talent', () => {
    const win = play('ACE_NATURAL', [{ type: 'CASINO_RESULT', payload: { game: 'BLACKJACK', won: true, highlight: null } }]);
    expect(win.completed).toBe(false);
    const natural = play('ACE_NATURAL', [{ type: 'CASINO_RESULT', payload: { game: 'BLACKJACK', won: true, highlight: 'NATURAL' } }]);
    expect(natural.completed).toBe(true);
  });
});
