import type { Prisma, PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import { FactionPerkService } from './faction-perk.service.js';
import { createPlayerActivity } from './in-app-notification.service.js';

/** Players looked at in one pass, most recently active first. */
const BATCH = 300;
const TRUSTED_OR_ABOVE = ['TRUSTED', 'CONNECTED', 'INNER_CIRCLE'];

/**
 * 1.4.0-D. Faction warnings reach the bell. Each pass looks at players Trusted with a faction in
 * a live round with perks, works out the same warnings their faction cards show, and logs a
 * FACTION_WARNING activity (the bell and a toast) for each one not sent before. The
 * PlayerFactionWarning row is the marker: written in the same transaction as the activity and
 * unique on the warning's key, so a warning reaches the bell once however often a pass runs, on
 * however many servers. Warnings without a key stay on the card only.
 */
export const FactionWarningService = {
  async sweep(prisma: PrismaClient, now: Date = new Date(), limit = BATCH): Promise<number> {
    const players = await prisma.roundPlayer.findMany({
      where: {
        round: { status: 'ACTIVE', endsAt: { gt: now } },
        factionStandings: { some: { tier: { in: TRUSTED_OR_ABOVE } } },
      },
      orderBy: { lastActiveAt: 'desc' },
      take: limit,
      select: { id: true, round: { select: { rulesetId: true, rulesetVersion: true } } },
    });
    let sent = 0;
    let failure: unknown = null;
    for (const player of players) {
      try {
        const ruleset = loadRulesetForRound(player.round);
        if (!ruleset.factionPerks) continue;
        for (const warning of await FactionPerkService.warnings(prisma, player.id, ruleset, now)) {
          if (!warning.key) continue;
          const created = await prisma.$transaction(async (tx) => {
            const { count } = await tx.playerFactionWarning.createMany({
              data: [{ roundPlayerId: player.id, factionKey: warning.factionKey, warningKey: warning.key!, createdAt: now }],
              skipDuplicates: true,
            });
            if (!count) return false;
            await createPlayerActivity(tx, player.id, 'FACTION_WARNING', {
              factionKey: warning.factionKey,
              factionName: ruleset.factions?.[warning.factionKey]?.name ?? warning.factionKey,
              text: warning.text,
              href: warning.href,
            } as Prisma.InputJsonValue);
            return true;
          });
          if (created) sent += 1;
        }
      } catch (error) {
        // One player's bad state never holds up everyone else's warnings; the first is rethrown.
        failure ??= error;
      }
    }
    if (failure) throw failure;
    return sent;
  },
};
