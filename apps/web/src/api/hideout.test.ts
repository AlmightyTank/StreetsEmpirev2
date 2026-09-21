import { describe, expect, it } from 'vitest';
import type { HideoutDto, HideoutV2Dto } from '@streets/shared';
import { normalizeHideoutDto } from './hideout.js';

describe('normalizeHideoutDto', () => {
  it('fills v2 defaults for a legacy cash-only response', () => {
    const legacy: HideoutDto = {
      enabled: true,
      seasonScoped: true,
      totalLevel: 0,
      totalMaxLevel: 5,
      rooms: [{
        key: 'SAFE_ROOM',
        name: 'Safe Room',
        blurb: 'Protect cash.',
        level: 0,
        maxLevel: 5,
        nextCostCents: 50_000,
        currentEffect: 'No active bonus yet.',
        nextEffect: '$1,000 extra cash protected from raids.',
      }],
    };

    const normalized = normalizeHideoutDto(legacy);
    expect(normalized.rulesVersion).toBe(1);
    expect(normalized.rooms[0]).toMatchObject({
      canUpgrade: true,
      lockReason: null,
      nextRequirements: [],
      specialization: null,
    });
  });

  it('marks a maxed legacy room as unavailable', () => {
    const legacy: HideoutDto = {
      enabled: true,
      seasonScoped: true,
      totalLevel: 5,
      totalMaxLevel: 5,
      rooms: [{
        key: 'SAFE_ROOM',
        name: 'Safe Room',
        blurb: 'Protect cash.',
        level: 5,
        maxLevel: 5,
        nextCostCents: null,
        currentEffect: '$5,000 extra cash protected from raids.',
        nextEffect: null,
      }],
    };

    const normalized = normalizeHideoutDto(legacy);
    expect(normalized.rooms[0]?.canUpgrade).toBe(false);
    expect(normalized.rooms[0]?.lockReason).toContain('fully upgraded');
  });

  it('preserves an actual v2 response', () => {
    const v2: HideoutV2Dto = {
      enabled: true,
      seasonScoped: true,
      rulesVersion: 2,
      totalLevel: 2,
      totalMaxLevel: 5,
      rooms: [{
        key: 'SAFE_ROOM',
        name: 'Safe Room',
        blurb: 'Protect cash.',
        level: 2,
        maxLevel: 5,
        nextCostCents: 400_000,
        currentEffect: '$2,000 extra cash protected from raids.',
        nextEffect: '$3,000 extra cash protected from raids.',
        canUpgrade: false,
        lockReason: 'Need Raids completed 0/1.',
        nextRequirements: [{
          key: 'RAIDS_DONE',
          label: 'Raids completed',
          current: 0,
          required: 1,
          met: false,
        }],
        specialization: {
          unlockLevel: 3,
          selectedKey: null,
          choices: [
            { key: 'VAULT', name: 'Vault', blurb: 'Protect assets.' },
            { key: 'PANIC_ROOM', name: 'Panic Room', blurb: 'Protect the crew.' },
          ],
        },
      }],
    };

    expect(normalizeHideoutDto(v2)).toEqual(v2);
  });
});
