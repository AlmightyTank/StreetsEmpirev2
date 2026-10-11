import { describe, expect, it, vi } from 'vitest';

vi.mock('../admin-audit.service.js', () => ({ AdminAuditService: { record: vi.fn() } }));

import { AdminEventService } from '../admin-event.service.js';

describe('admin event release preview', () => {
  it('reports the newest pinned event catalog and bounded modifier simulation', () => {
    const preview = AdminEventService.preview('classic-og-v1.8-k');

    expect(preview.ruleset.version).toBe('1.8.0-K');
    expect(preview.firstClassTypes).toEqual(['COMMUNITY', 'SEASONAL', 'RANDOM_ENCOUNTER', 'CITY_CONDITION']);
    expect(preview.checks.every((check) => check.status === 'PASS')).toBe(true);
    expect(preview.catalog.some((entry) => entry.key === 'EVENT_MONEY_IN_MOTION')).toBe(true);
    expect(preview.catalog.some((entry) => entry.key === 'CITY:money-in-motion-follow-up')).toBe(true);
    expect(preview.modifierSimulation).toContainEqual(expect.objectContaining({
      action: 'PRODUCE_CRACK', district: 'LOW_RENT', rawPercent: 15, cappedPercent: 15,
    }));
  });

  it('rejects unknown ruleset previews', () => {
    expect(() => AdminEventService.preview('not-a-ruleset')).toThrow('That ruleset does not exist.');
  });
});
