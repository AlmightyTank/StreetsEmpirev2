import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PlayerQuestDto } from '@streets/shared';
import { LATEST_RULESET } from '@streets/rulesets';
import { JOB_PLACES, PLACES, roomSetting } from '../contactRoom.js';

const web = path.resolve(import.meta.dirname, '../../..');
const quest = (key: string, status: PlayerQuestDto['status'], contactKey = 'MAMA_KING') =>
  ({ key, status, contactKey, category: 'CAMPAIGN' }) as PlayerQuestDto;

describe('contact room places', () => {
  it('paints every place and sets each one in a real campaign chapter with a contact', () => {
    for (const place of Object.values(PLACES)) {
      const file = path.join(web, 'public', place.art);
      expect(existsSync(file), place.art).toBe(true);
      expect(readFileSync(file, 'utf8')).not.toMatch(/<script|href=|url\(http/);
    }
    for (const key of Object.keys(JOB_PLACES)) {
      expect(LATEST_RULESET.questDefinitions?.[key]?.contactKey, key).toBeTruthy();
    }
    // Every place is used by at least one chapter.
    expect(new Set(Object.values(JOB_PLACES))).toEqual(new Set(Object.keys(PLACES)));
  });

  it('sets every campaign chapter somewhere, apart from the three that happen at home', () => {
    const campaign = Object.keys(LATEST_RULESET.questDefinitions ?? {}).filter((key) => key.startsWith('ML_'));
    expect(campaign.filter((key) => !JOB_PLACES[key]).sort())
      .toEqual(['ML_M18_WHAT_MAMA_BOUGHT', 'ML_M23_LAST_APPOINTMENT', 'ML_S09_RACK_KEPT_OPEN']);
  });

  it('shows the contact in their own room when nothing takes them elsewhere', () => {
    expect(roomSetting([quest('ML_M18_WHAT_MAMA_BOUGHT', 'ACTIVE')], 'MAMA_KING', { kind: 'hub' }))
      .toEqual({ name: 'Mama’s kitchen', art: '/rooms/mama-king.svg' });
    // A job only on offer has not taken them anywhere yet.
    expect(roomSetting([quest('ML_M02_SMALL_FAVOR', 'AVAILABLE')], 'MAMA_KING', { kind: 'hub' })?.name).toBe('Mama’s kitchen');
  });

  it('shows the place of a job underway, and of the job being talked about', () => {
    const quests = [quest('ML_M02_SMALL_FAVOR', 'ACTIVE'), quest('ML_M18_WHAT_MAMA_BOUGHT', 'AVAILABLE')];
    expect(roomSetting(quests, 'MAMA_KING', { kind: 'hub' })).toBe(PLACES.CORNER_SHOP);
    expect(roomSetting(quests, 'MAMA_KING', { kind: 'work' })).toBe(PLACES.CORNER_SHOP);
    expect(roomSetting(quests, 'MAMA_KING', { kind: 'job', questKey: 'ML_M18_WHAT_MAMA_BOUGHT' })?.name).toBe('Mama’s kitchen');
    expect(roomSetting(quests, 'MAMA_KING', { kind: 'job', questKey: 'ML_M25_MISSING_LINE' })).toBe(PLACES.PORCH_RAIN);
    expect(roomSetting([quest('ML_S12_EVERY_ROAD_HOME', 'READY_TO_TURN_IN', 'WHEELS')], 'WHEELS', { kind: 'standing' })).toBe(PLACES.GAS_STATION);
  });

  it('has no room for a contact without art', () => {
    expect(roomSetting([], 'NOBODY', { kind: 'hub' })).toBeNull();
  });
});
