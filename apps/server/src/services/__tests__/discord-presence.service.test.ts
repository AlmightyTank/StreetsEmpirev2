import { describe, expect, it } from 'vitest';
import { buildAnonymousPresenceHighlights } from '../discord-presence.service.js';

describe('buildAnonymousPresenceHighlights', () => {
  it('formats one anonymous status per live-game category', () => {
    const result = buildAnonymousPresenceHighlights({
      slotMetadata: [{ jackpotAwardCents: 12_500_000, displayName: 'DO NOT LEAK' }],
      jackpotPoolCents: 50_000n,
      openSportsbookBets: 3,
      openSportsbookStakeCents: 4_200_000n,
      raidReports: [{ won: true, cashChangeCents: 8_800_000, attackerName: 'DO NOT LEAK' }],
      scoutPayloads: [{ cashCents: 100_000, whores: 4, thugs: 6, playerId: 'DO NOT LEAK' }],
    });

    expect(result).toEqual({ highlights: [
      { kind: 'jackpot', message: '🎰 A $125K jackpot just hit' },
      { kind: 'sportsbook', message: '🏆 $42K riding on 3 open bets' },
      { kind: 'raid', message: '💥 A recent raid scored $88K in loot' },
      { kind: 'scout', message: '🔎 A recent scout run found $1K + 10 recruits' },
    ] });
    expect(JSON.stringify(result)).not.toContain('DO NOT LEAK');
  });

  it('uses the current jackpot pool and omits categories without activity', () => {
    expect(buildAnonymousPresenceHighlights({
      slotMetadata: [],
      jackpotPoolCents: 9_900_000n,
      openSportsbookBets: 0,
      openSportsbookStakeCents: 0n,
      raidReports: [{ cashChangeCents: -500 }],
      scoutPayloads: [{}],
    })).toEqual({ highlights: [
      { kind: 'jackpot', message: '🎰 Casino jackpot: $99K and climbing' },
    ] });
  });
});
