import { loadRulesetForRound } from '@streets/rules-engine';
import type { PrismaClient } from '@prisma/client';
import { AppError } from '../utils/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Read-only ammo/parts economy snapshot for beta operators. */
export const AdminAmmoPartsService = {
  async report(prisma: PrismaClient, roundId: string, now = new Date()) {
    const round = await prisma.round.findUnique({ where: { id: roundId }, select: { id: true, rulesetId: true, rulesetVersion: true } });
    if (!round) throw AppError.notFound('ROUND_NOT_FOUND', 'That round does not exist.');
    const ruleset = loadRulesetForRound(round);
    const players = await prisma.roundPlayer.findMany({ where: { roundId }, select: { id: true, publicPimpId: true, displayName: true, ammo: true, vehicleParts: true, pistols: true, shotguns: true, tek9s: true, ak47s: true, thugs: true, woundedThugs: true } });
    const since24h = new Date(now.getTime() - DAY_MS);
    const since7d = new Date(now.getTime() - 7 * DAY_MS);
    const activity = await prisma.playerActivity.findMany({
      where: { roundPlayer: { roundId }, type: { in: ['RAID_ATTACK', 'RAID_DEFENSE', 'DRIVE_BY_ATTACK', 'DRIVE_BY_DEFENSE', 'TURF_PUSH_ATTACK', 'TURF_PUSH_DEFENSE', 'TURF_PUSH_BACKUP', 'BLOCK_WAR_FIGHT'] }, createdAt: { gte: since7d } },
      select: { type: true, payload: true, createdAt: true },
    });
    const spendSince = (since: Date) => activity.reduce((sum, row) => {
      if (row.createdAt < since || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) return sum;
      const payload = row.payload as Record<string, unknown>;
      const combat = payload.ammoCombat;
      if (combat && typeof combat === 'object' && !Array.isArray(combat)) {
        const ammo = combat as Record<string, unknown>;
        return sum + (typeof ammo.spentRounds === 'number' ? ammo.spentRounds : 0);
      }
      return sum + (typeof payload.ammoSpentRounds === 'number' ? payload.ammoSpentRounds : 0);
    }, 0);
    const reserve = (player: typeof players[number]) => {
      const cost = ruleset.ammoParts?.ammo.roundsPerFight;
      if (!cost) return 0;
      let fighters = Math.min(Math.max(0, player.thugs - player.woundedThugs), ruleset.combat?.squadCap ?? Number.MAX_SAFE_INTEGER);
      let rounds = 0;
      const weapons: Array<[number, number]> = [[player.ak47s, cost.AK47], [player.tek9s, cost.TEK9], [player.shotguns, cost.SHOTGUN], [player.pistols, cost.PISTOL]];
      for (const [guns, perFight] of weapons) {
        const assigned = Math.min(fighters, guns);
        rounds += assigned * perFight;
        fighters -= assigned;
      }
      return rounds;
    };
    const lowAmmoPlayers = players.map((player) => ({ roundPlayerId: player.id, publicPimpId: player.publicPimpId, displayName: player.displayName, ammo: player.ammo, oneSquadReserve: reserve(player) }))
      .filter((player) => player.oneSquadReserve > 0 && player.ammo <= player.oneSquadReserve).sort((a, b) => a.ammo - b.ammo).slice(0, 100);
    return {
      roundId, rulesetId: round.rulesetId, generatedAt: now.toISOString(), enabled: ruleset.ammoParts?.enabled ?? false, players: players.length,
      inventory: { ammoRounds: players.reduce((sum, player) => sum + player.ammo, 0), vehicleParts: players.reduce((sum, player) => sum + player.vehicleParts, 0), playersWithNoAmmo: players.filter((player) => player.ammo === 0).length, playersWithNoParts: players.filter((player) => player.vehicleParts === 0).length },
      combatAmmoRoundsSpent24h: spendSince(since24h), combatAmmoRoundsSpent7d: spendSince(since7d), lowAmmoPlayers,
    };
  },
};
