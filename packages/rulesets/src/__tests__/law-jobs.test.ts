import { describe, expect, it } from 'vitest';
import { classicOgV13E } from '../classic-og-v1.3-e/index.js';
import { classicOgV13F } from '../classic-og-v1.3-f/index.js';
import { lawJobs } from '../classic-og-v1.3-f/law-jobs.js';
import { applyQuestProgress } from '../quest-progress.js';
import { questDefinitionProblems } from '../quest-definitions.js';
import type { QuestDataObject, QuestProgressMap, QuestRewardDefinition, Ruleset } from '../types.js';

const ledgerJobs = Object.values(lawJobs);
const ledgerRewards: QuestRewardDefinition[] = ledgerJobs.flatMap((job) => [...job.rewards] as QuestRewardDefinition[]);

function play(key: keyof typeof lawJobs, events: Array<{ type: string; payload: QuestDataObject }>, bonus = false) {
  const quest = lawJobs[key];
  let progress: QuestProgressMap = {};
  let completed = false;
  for (const event of events) {
    const applied = applyQuestProgress(bonus ? quest.bonusObjectives : quest.objectives, progress, event);
    progress = applied.progress;
    completed = applied.completed;
  }
  return { progress, completed };
}

const cooled = (payload: Partial<QuestDataObject> = {}) => ({
  type: 'CASE_COOLED',
  payload: { citySlug: 'detroit', cityName: 'Detroit', from: 'NOTICED', to: 'QUIET', peak: 'NOTICED', cleared: true, peakWarrant: false, raided: false, ...payload },
});

describe('1.3.0-F law Jobs ruleset', () => {
  it('pins a new ruleset on top of E without touching the law block', () => {
    expect(classicOgV13F.meta).toEqual({ id: 'classic-og-v1.3-f', version: '1.3.0-F', name: 'Classic OG - Jobs, Feats & Titles' });
    expect(classicOgV13F.law).toBe(classicOgV13E.law);
    expect((classicOgV13E as Ruleset).contacts?.LEDGER).toBeUndefined();
  });

  it('adds Ledger beside every earlier contact', () => {
    expect(Object.keys(classicOgV13F.contacts)).toEqual([...Object.keys(classicOgV13E.contacts), 'LEDGER']);
    expect(classicOgV13F.contacts.LEDGER.role).toBe('Retired Records Sergeant');
  });

  it('keeps every earlier Job and adds seven valid one-time law Jobs for Ledger', () => {
    const before = Object.keys(classicOgV13E.questDefinitions);
    expect(Object.keys(classicOgV13F.questDefinitions)).toEqual([...before, ...Object.keys(lawJobs)]);
    expect(ledgerJobs).toHaveLength(7);
    expect(questDefinitionProblems(classicOgV13F.questDefinitions)).toEqual([]);
    for (const job of ledgerJobs) {
      expect(job.contactKey).toBe('LEDGER');
      expect(job.category).toBe('LAW');
      expect(job.repeatability).toBe('ONCE');
    }
  });

  it('never pays money, turns, items or anything that touches a Case', () => {
    const kinds = new Set(ledgerRewards.map((reward) => reward.kind));
    expect([...kinds].sort()).toEqual(['CONTACT_REP', 'COSMETIC_UNLOCK']);
  });

  it('pays only cosmetics that exist, with a stable style key for the frame', () => {
    for (const reward of ledgerRewards) {
      if (reward.kind === 'COSMETIC_UNLOCK') expect(classicOgV13F.cosmetics[reward.key as keyof typeof classicOgV13F.cosmetics]).toBeDefined();
    }
    expect(classicOgV13F.cosmetics['ledger-case-file-frame']).toMatchObject({ kind: 'PROFILE_FRAME', styleKey: 'case-file-frame' });
  });

  it('makes the finale reachable on Ledger standing earned from her own Jobs', () => {
    const rep = (key: keyof typeof lawJobs) => lawJobs[key].rewards
      .filter((reward) => reward.kind === 'CONTACT_REP')
      .reduce((sum, reward) => sum + ('amount' in reward ? reward.amount : 0), 0);
    const beforeFinale = ledgerJobs.filter((job) => job.key !== 'LEDGER_CASE_CLOSED').reduce((sum, job) => sum + rep(job.key), 0);
    const needed = lawJobs.LEDGER_CASE_CLOSED.prerequisites.find((prerequisite) => prerequisite.kind === 'CONTACT_REP_AT_LEAST')!;
    expect(beforeFinale).toBeGreaterThanOrEqual(needed.params.points);
  });
});

describe('1.3.0-F law Job objectives', () => {
  it('counts any stage fall for Cooling Off, but only a fall to Quiet for its bonus', () => {
    expect(play('LEDGER_COOLING_OFF', [cooled({ to: 'NOTICED', cleared: false })]).completed).toBe(true);
    expect(play('LEDGER_COOLING_OFF', [cooled({ to: 'NOTICED', cleared: false })], true).completed).toBe(false);
    expect(play('LEDGER_COOLING_OFF', [cooled()], true).completed).toBe(true);
  });

  it('counts a new hire for Friends Downtown, not a renewed week', () => {
    const hired = (cityName: string, renewed: boolean) => ({ type: 'OFFICIAL_HIRED', payload: { role: 'CAPTAIN', cityName, renewed } });
    expect(play('LEDGER_FRIENDS_DOWNTOWN', [hired('Detroit', true)]).completed).toBe(false);
    expect(play('LEDGER_FRIENDS_DOWNTOWN', [hired('Detroit', false)]).completed).toBe(true);
    expect(play('LEDGER_FRIENDS_DOWNTOWN', [hired('Detroit', false), hired('Detroit', true), hired('Seattle', true)], true).completed).toBe(false);
    expect(play('LEDGER_FRIENDS_DOWNTOWN', [hired('Detroit', false), hired('Seattle', false)], true).completed).toBe(true);
  });

  it('only counts a cut made while Internal Affairs is looking for Clean Hands', () => {
    const cut = (underInvestigation: boolean) => ({ type: 'OFFICIAL_CUT', payload: { role: 'DA', cityName: 'Detroit', underInvestigation } });
    expect(play('LEDGER_CLEAN_HANDS', [cut(false)]).completed).toBe(false);
    expect(play('LEDGER_CLEAN_HANDS', [cut(true)]).completed).toBe(true);
  });

  it('closes the finale only on a Warrant-stage Case cooled to Quiet with no warrant served', () => {
    expect(play('LEDGER_CASE_CLOSED', [cooled()]).completed).toBe(false);
    expect(play('LEDGER_CASE_CLOSED', [cooled({ peak: 'WARRANT', peakWarrant: true, raided: true })]).completed).toBe(false);
    expect(play('LEDGER_CASE_CLOSED', [cooled({ from: 'NOTICED', to: 'NOTICED', peak: 'WARRANT', cleared: false, peakWarrant: true })]).completed).toBe(false);
    expect(play('LEDGER_CASE_CLOSED', [cooled({ peak: 'FEDERAL', peakWarrant: true })]).completed).toBe(true);
  });
});
