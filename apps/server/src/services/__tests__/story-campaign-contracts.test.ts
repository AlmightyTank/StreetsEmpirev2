import { describe, expect, it } from 'vitest';
import {
  LATEST_RULESET,
  applyQuestProgress,
  questDefinitionProblems,
  type QuestBranchDefinition,
  type QuestDefinition,
  type QuestObjectiveDefinition,
} from '@streets/rulesets';
import { questPrerequisitesMet, resolveQuestBranchForClaim } from '../handcrafted-quest.service.js';

/**
 * Story campaign Slice A: the existing quest-engine behavior The Missing Line is built on.
 * See docs/STORY-QUEST-CAMPAIGN-SLICE-A.md. Store payloads are pinned against PostgreSQL in
 * story-campaign-evidence.integration.test.ts.
 */

function quest(key: string, overrides: Partial<QuestDefinition> = {}): QuestDefinition {
  return {
    key,
    title: key,
    description: `${key} description`,
    contactKey: 'MAMA_KING',
    type: 'STORY',
    category: 'STREET',
    difficulty: 'STREET_JOB',
    prerequisites: [],
    objectives: [{ id: 'run', kind: 'EVENT_COUNT', description: 'Bring a run home.', target: 1, params: { eventTypes: ['RUN_RETURNED'] } }],
    bonusObjectives: [],
    rewards: [{ kind: 'CASH', amount: 1_000 }],
    followUpKeys: [],
    repeatability: 'ONCE',
    expiresAfterMinutes: null,
    availability: {},
    ...overrides,
  };
}

const done = (objective: QuestObjectiveDefinition, type: string, payload: Record<string, unknown>) =>
  applyQuestProgress([objective], {}, { type, payload: payload as never }).completed;

describe('story campaign Slice A contracts', () => {
  it('ANDs QUEST_COMPLETED prerequisites, so Two Buyers waits for all three leads in any order', () => {
    const twoBuyers = quest('ML_M09_TWO_BUYERS', {
      prerequisites: ['ML_M06_PIPS_COUNT', 'ML_M07_NORTH_ROAD', 'ML_M08_TOMMYS_SERIAL']
        .map((questKey) => ({ kind: 'QUEST_COMPLETED', params: { questKey } })),
    });
    const leads = ['ML_M06_PIPS_COUNT', 'ML_M07_NORTH_ROAD', 'ML_M08_TOMMYS_SERIAL'];
    for (const lead of leads) {
      expect(questPrerequisitesMet(twoBuyers, new Set([lead]), {}, {})).toBe(false);
      expect(questPrerequisitesMet(twoBuyers, new Set(leads.filter((key) => key !== lead)), {}, {})).toBe(false);
    }
    expect(questPrerequisitesMet(twoBuyers, new Set([...leads].reverse()), {}, {})).toBe(true);
  });

  it('accepts turn-in branches that all lead to the same follow-up, and locks the first committed choice', () => {
    const branch = (key: string): QuestBranchDefinition => ({
      key, title: key, description: `${key} stance`, rewards: [{ kind: 'CASH', amount: 1_000 }],
      reputationDeltas: [], followUpKeys: ['ML_M24_TABLE'],
    });
    const lastAppointment = quest('ML_M23_LAST_APPOINTMENT', {
      followUpKeys: ['ML_M24_TABLE'],
      branches: ['MEET_MARA_ACCEPT', 'MEET_MARA_REFUSE', 'MEET_MARA_DEFER'].map(branch),
    });
    expect(questDefinitionProblems({ ML_M23_LAST_APPOINTMENT: lastAppointment, ML_M24_TABLE: quest('ML_M24_TABLE') })).toEqual([]);
    expect(resolveQuestBranchForClaim(lastAppointment, 'MEET_MARA_DEFER', null)?.followUpKeys).toEqual(['ML_M24_TABLE']);
    expect(() => resolveQuestBranchForClaim(lastAppointment, 'MEET_MARA_ACCEPT', 'MEET_MARA_DEFER')).toThrow(/different committed choice/);
    expect(() => resolveQuestBranchForClaim(lastAppointment, undefined, null)).toThrow(/Choose a side/);
  });

  it('counts run, recon and supply-lane events on type alone, whatever the outcome', () => {
    const count = (eventType: string): QuestObjectiveDefinition => ({
      id: 'evidence', kind: 'EVENT_COUNT', description: eventType, target: 1, params: { eventTypes: [eventType] },
    });
    // A run with incidents still comes home; a seized lane shipment still arrives.
    expect(done(count('RUN_RETURNED'), 'RUN_RETURNED', { runId: 'r', incidents: ['POLICE_STOP'], cashCents: 0 })).toBe(true);
    expect(done(count('COMBAT_RECON'), 'COMBAT_RECON', { target: 'Rival', turns: 1 })).toBe(true);
    expect(done(count('SUPPLY_LANE_ARRIVED'), 'SUPPLY_LANE_ARRIVED', { delivered: 0, lost: 10, outcome: 'SEIZED' })).toBe(true);
    expect(done(count('RUN_RETURNED'), 'RUN_LAUNCHED', { runId: 'r' })).toBe(false);
  });

  it('records the target ruleset facts the campaign depends on', () => {
    expect(LATEST_RULESET.stores).toHaveProperty('PIP');
    expect(LATEST_RULESET.stores).toHaveProperty('TOMMY');
    expect(LATEST_RULESET.supplyNetwork?.enabled).toBe(true);
    expect(LATEST_RULESET.travel?.runs).toBeDefined();
    // Contacts are pinned per ruleset. Ledger already exists (Marisol Pike); Mara Venn arrives with Act V.
    const contacts = LATEST_RULESET.contacts ?? {};
    for (const key of ['MAMA_KING', 'PIP', 'TOMMY', 'WHEELS', 'VIC', 'BLOCKS', 'LEDGER']) expect(contacts).toHaveProperty(key);
    expect(contacts).not.toHaveProperty('MARA_VENN');
  });
});
