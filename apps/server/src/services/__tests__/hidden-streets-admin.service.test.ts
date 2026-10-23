import { describe, expect, it } from 'vitest';
import { HiddenStreetsAdminService } from '../hidden-streets-admin.service.js';

describe('HiddenStreetsAdminService', () => {
  it('reports latest Hidden Streets content diagnostics without spoiler payloads', async () => {
    const report = await HiddenStreetsAdminService.releaseReport();

    expect(report.ruleset).toMatchObject({
      id: 'classic-og-v1.8-s',
      version: '1.8.0-S',
      latest: false,
    });
    expect(report.totals.secretDefinitions).toBeGreaterThanOrEqual(27);
    expect(report.families.map((family) => family.family)).toEqual(expect.arrayContaining([
      'COMEDY',
      'LOST_ADVENTURE',
      'DETECTIVE',
      'BLACKWOOD',
      'SCI_FI',
      'DANGEROUS',
      'SHADOW_CITY',
      'FORGOTTEN_GUILD',
      'LEGENDARY_CROSSOVER',
    ]));
    expect(report.encountersByTrigger.SCOUT).toEqual(expect.arrayContaining([
      'scout-old-coin',
      'scout-missing-witness',
      'scout-night-watcher-signal',
      'scout-forgotten-runestone',
    ]));
    expect(report.encountersByTrigger.TRAVEL).toEqual(expect.arrayContaining([
      'travel-three-travelers',
      'travel-extraction-cache',
      'travel-rune-merchant',
    ]));
    expect(report.checks.every((check) => check.status !== 'FAIL')).toBe(true);
    expect(report.checks.find((check) => check.key === 'cosmetic-reward-catalog')).toMatchObject({ status: 'PASS' });
    expect(report.adminControls).toEqual(expect.arrayContaining([
      expect.stringContaining('Quest enable/disable'),
      expect.stringContaining('Rollback'),
    ]));
    expect(report.telemetryKeys).toEqual(expect.arrayContaining([
      'hidden_streets.secret.revealed',
      'hidden_streets.reward.duplicate_attempt',
    ]));
  });
});
