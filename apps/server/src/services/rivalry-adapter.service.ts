import type { ActivityType, Prisma } from '@prisma/client';
import type { RivalryOutcome, RivalrySourceKind } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { RivalryService } from './rivalry.service.js';

type ActivityPayload = Record<string, unknown>;

function payloadOf(value: unknown): ActivityPayload {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ActivityPayload : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function boolValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function outcomeFor(won: boolean, flip = false): RivalryOutcome {
  return flip ? 'TURF_FLIP' : won ? 'WIN' : 'LOSS';
}

/**
 * Converts committed PlayerActivity receipts back to their authoritative
 * settled source. The activity row is deliberately only a trigger: all
 * participant, outcome, round and settlement fields come from the source row.
 */
export const RivalryAdapterService = {
  async fromActivity(db: Db, roundPlayerId: string, type: ActivityType, rawPayload: Prisma.InputJsonValue): Promise<void> {
    const payload = payloadOf(rawPayload);
    const sourceId = stringValue(payload.battleId) ?? stringValue(payload.pushId) ?? stringValue(payload.fightId);
    if (!sourceId) return;

    let sourceKind: RivalrySourceKind;
    let source: {
      roundId: string;
      participantAId: string;
      participantBId: string;
      settledAt: Date;
      outcome: RivalryOutcome;
      metadata?: Record<string, unknown>;
    } | null = null;

    if (stringValue(type)?.startsWith('RAID_') || stringValue(type)?.startsWith('DRIVE_BY_') || stringValue(type)?.startsWith('SPECIAL_RAID_')) {
      const battle = await db.raidBattle.findUnique({ where: { id: sourceId }, select: { attackerId: true, defenderId: true, createdAt: true, kind: true, voidedAt: true, attackerReport: true, defenderReport: true, attacker: { select: { roundId: true } } } });
      if (!battle || battle.voidedAt) return;
      if (roundPlayerId !== battle.attackerId && roundPlayerId !== battle.defenderId) return;
      const won = boolValue(payload.won) ?? false;
      sourceKind = payload.payback === true ? 'RETALIATION' : 'COMBAT';
      source = { roundId: battle.attacker.roundId, participantAId: battle.attackerId, participantBId: battle.defenderId, settledAt: battle.createdAt, outcome: outcomeFor(won), metadata: { kind: battle.kind } };
    } else if (type === 'TURF_PUSH_ATTACK' || type === 'TURF_PUSH_DEFENSE') {
      const push = await db.turfPush.findUnique({ where: { id: sourceId }, select: { roundId: true, attackerId: true, defenderId: true, settledAt: true, captured: true, status: true, result: true } });
      if (!push || push.status !== 'LANDED' || !push.settledAt || push.captured === null) return;
      const attacker = roundPlayerId === push.attackerId;
      const won = attacker ? push.captured : !push.captured;
      sourceKind = 'TURF';
      source = { roundId: push.roundId, participantAId: push.attackerId, participantBId: push.defenderId, settledAt: push.settledAt, outcome: outcomeFor(won, push.captured), metadata: { unopposed: payload.unopposed === true, stale: payload.stale === true } };
    } else if (type === 'BLOCK_WAR_FIGHT') {
      const fight = await db.blockWarFight.findUnique({ where: { id: sourceId }, select: { status: true, landsAt: true, result: true, war: { select: { roundId: true, attackerId: true, defenderId: true } } } });
      if (!fight || fight.status !== 'LANDED') return;
      const result = payloadOf(fight.result ?? {});
      const attackerWon = boolValue(result.attackerWon) ?? false;
      if (roundPlayerId !== fight.war.attackerId && roundPlayerId !== fight.war.defenderId) return;
      sourceKind = 'BLOCK_WAR';
      source = { roundId: fight.war.roundId, participantAId: fight.war.attackerId, participantBId: fight.war.defenderId, settledAt: fight.landsAt, outcome: outcomeFor(roundPlayerId === fight.war.attackerId ? attackerWon : !attackerWon), metadata: { fightKind: payload.kind } };
    } else {
      return;
    }

    if (!source) return;
    await RivalryService.recordSettledSource(db, { ...source, sourceKind, sourceId, actorId: roundPlayerId, verified: true, participated: true });
  },
};
