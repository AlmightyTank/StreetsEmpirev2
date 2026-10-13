import { describe, expect, it } from 'vitest';
import { classicOgV18P, classicOgV18Q } from '../index.js';
import { questCosmeticProblems, questDefinitionProblems } from '../quest-definitions.js';
import type { QuestCosmeticCatalog, QuestDefinitionCatalog } from '../types.js';

const catalogP = classicOgV18P.questDefinitions as unknown as QuestDefinitionCatalog;
const catalogQ = classicOgV18Q.questDefinitions as unknown as QuestDefinitionCatalog;
const cosmeticsP = classicOgV18P.cosmetics as unknown as QuestCosmeticCatalog | undefined;
const cosmeticsQ = classicOgV18Q.cosmetics as unknown as QuestCosmeticCatalog | undefined;

describe('hidden streets slice D ruleset', () => {
  it('adds Blackwood cosmetic definitions on a new pinned ruleset only', () => {
    expect(cosmeticsP?.['blackwood-gate-badge']).toBeUndefined();
    expect(cosmeticsP?.['blackwood-gate-frame']).toBeUndefined();
    expect(cosmeticsP?.['blackwood-manor-theme']).toBeUndefined();

    expect(classicOgV18Q.meta).toMatchObject({
      id: 'classic-og-v1.8-q',
      version: '1.8.0-Q',
    });
    expect(cosmeticsQ?.['blackwood-gate-badge']).toMatchObject({
      kind: 'TITLE_BADGE',
      rarity: 'epic',
    });
    expect(cosmeticsQ?.['blackwood-gate-frame']).toMatchObject({
      kind: 'PROFILE_FRAME',
      styleKey: 'blackwood-gate-frame',
    });
    expect(cosmeticsQ?.['blackwood-manor-theme']).toMatchObject({
      kind: 'SITE_THEME',
      styleKey: 'blackwood-manor',
    });
  });

  it('adds badge and frame rewards to Blackwood Gate without mutating P', () => {
    const rewardKeysP = catalogP.SECRET_BLACKWOOD_GATE!.rewards.map((reward) => reward.key).filter(Boolean);
    const rewardKeysQ = catalogQ.SECRET_BLACKWOOD_GATE!.rewards.map((reward) => reward.key).filter(Boolean);

    expect(rewardKeysP).not.toContain('blackwood-gate-badge');
    expect(rewardKeysP).not.toContain('blackwood-gate-frame');
    expect(rewardKeysQ).toEqual(expect.arrayContaining(['blackwood-gate-badge', 'blackwood-gate-frame']));
  });

  it('passes quest and cosmetic reward validation', () => {
    expect(questDefinitionProblems(catalogQ)).toEqual([]);
    expect(questCosmeticProblems(catalogQ, classicOgV18Q.cosmetics)).toEqual([]);
  });

  it('reports unknown cosmetic rewards before runtime claim failures', () => {
    expect(questCosmeticProblems({
      ...catalogQ,
      SECRET_BLACKWOOD_GATE: {
        ...catalogQ.SECRET_BLACKWOOD_GATE!,
        rewards: [...catalogQ.SECRET_BLACKWOOD_GATE!.rewards, { kind: 'COSMETIC_UNLOCK', key: 'missing-cosmetic' }],
      },
    }, classicOgV18Q.cosmetics)).toEqual([
      'SECRET_BLACKWOOD_GATE: COSMETIC_UNLOCK reward missing-cosmetic is not in ruleset cosmetics',
    ]);
  });
});
