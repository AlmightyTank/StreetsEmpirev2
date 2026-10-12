import type { Prisma, PrismaClient } from '@prisma/client';
import { loadRulesetForRound } from '@streets/rules-engine';
import type { AdminNpcGangControlInput, AdminNpcGangControlResultDto, AdminNpcGangInspectDto } from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { AdminAuditService, type AuditActor } from './admin-audit.service.js';
import { npcIdentity, npcPersonality } from './npc-gang-personality.js';
import { npcRules } from './npc-gang-rules.js';
import { NpcGangService } from './npc-gang.service.js';

/**
 * Phase O. Operator corrections to one NPC gang: run it now, delay it, pause or wake it,
 * retune its traits, tier or personality, and reset momentum, grudges or a migration
 * plan. Every change writes an audit entry with before and after.
 */

export const NPC_GANG_TIERS = ['SCRUB', 'STREET', 'VETERAN', 'KINGPIN'] as const;

const GANG_INCLUDE = { roundPlayer: { select: { id: true, displayName: true, round: true } } } as const;
type LoadedGang = Prisma.NpcGangGetPayload<{ include: typeof GANG_INCLUDE }>;

function memoryObject(value: Prisma.JsonValue): Prisma.JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as Prisma.JsonObject) } : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** An operator pause: kept in memory so the panel can say who and why. */
export function storedPause(memory: Prisma.JsonValue): { by: string; at: string; reason: string; until: string } | null {
  const row = memoryObject(memoryObject(memory).paused as Prisma.JsonValue);
  const by = text(row.by);
  const at = text(row.at);
  const reason = text(row.reason);
  const until = text(row.until);
  return by && at && reason && until ? { by, at, reason, until } : null;
}

function snapshot(gang: Pick<LoadedGang, 'tier' | 'archetype' | 'aggression' | 'ambition' | 'discipline' | 'nextActionAt' | 'dormantUntil'>) {
  return {
    tier: gang.tier,
    archetype: gang.archetype,
    aggression: gang.aggression,
    ambition: gang.ambition,
    discipline: gang.discipline,
    nextActionAt: gang.nextActionAt.toISOString(),
    dormantUntil: gang.dormantUntil?.toISOString() ?? null,
  };
}

async function load(prisma: PrismaClient, roundPlayerId: string): Promise<LoadedGang> {
  const gang = await prisma.npcGang.findUnique({ where: { roundPlayerId }, include: GANG_INCLUDE });
  if (!gang) throw AppError.notFound('NPC_GANG_NOT_FOUND', 'That player is not an NPC gang.');
  return gang;
}

async function inspect(prisma: PrismaClient, gang: LoadedGang): Promise<AdminNpcGangInspectDto> {
  const rules = npcRules(loadRulesetForRound(gang.roundPlayer.round));
  const view = npcPersonality(rules, gang.archetype);
  const memory = memoryObject(gang.memory);
  const decisions = Array.isArray(memory.decisions) ? memory.decisions : [];
  const audit = await prisma.adminAuditLog.findMany({
    where: { targetType: 'npc-gang', targetId: gang.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { createdAt: true, actorUsername: true, action: true, reason: true },
  });
  return {
    gangId: gang.id,
    roundPlayerId: gang.roundPlayerId,
    displayName: gang.roundPlayer.displayName,
    crewName: npcIdentity(view, gang.id, gang.memory).name,
    tier: gang.tier,
    archetype: gang.archetype,
    personality: view.personality.label,
    aggression: gang.aggression,
    ambition: gang.ambition,
    discipline: gang.discipline,
    nextActionAt: gang.nextActionAt.toISOString(),
    dormantUntil: gang.dormantUntil?.toISOString() ?? null,
    paused: storedPause(gang.memory),
    decisions: decisions.flatMap((row) => {
      const entry = memoryObject(row as Prisma.JsonValue);
      const at = text(entry.at);
      const intent = text(entry.intent);
      const outcome = text(entry.outcome);
      return at && intent && outcome ? [{
        at, intent, outcome,
        about: text(entry.about),
        won: typeof entry.won === 'boolean' ? entry.won : null,
        error: text(entry.error),
      }] : [];
    }),
    memory,
    audit: audit.map((row) => ({ at: row.createdAt.toISOString(), actor: row.actorUsername, action: row.action, reason: row.reason })),
  };
}

export const AdminNpcGangService = {
  async inspect(prisma: PrismaClient, roundPlayerId: string): Promise<AdminNpcGangInspectDto> {
    return inspect(prisma, await load(prisma, roundPlayerId));
  },

  async control(prisma: PrismaClient, actor: AuditActor, roundPlayerId: string, input: AdminNpcGangControlInput, now = new Date()): Promise<AdminNpcGangControlResultDto> {
    const before = await load(prisma, roundPlayerId);
    const memory = memoryObject(before.memory);
    const audit = async (verb: string, after: unknown) => AdminAuditService.record(prisma, actor, {
      action: `npc-gang.${verb}`, targetType: 'npc-gang', targetId: before.id, reason: input.reason, before: snapshot(before), after,
    });
    let message: string;

    if (input.action === 'ACT_NOW') {
      const outcome = await NpcGangService.runNow(prisma, before.id, now);
      const after = await load(prisma, roundPlayerId);
      await audit('act-now', { ...snapshot(after), outcome });
      message = `Ran a tick now: ${outcome.toLowerCase().replace(/_/g, ' ')}.`;
    } else if (input.action === 'DELAY') {
      const nextActionAt = new Date(Math.max(before.nextActionAt.getTime(), now.getTime()) + input.minutes * 60_000);
      const after = await prisma.npcGang.update({ where: { id: before.id }, data: { nextActionAt } });
      await audit('delay', snapshot(after));
      message = `Next move pushed back ${input.minutes} minutes.`;
    } else if (input.action === 'PAUSE') {
      // A pause rides the dormancy clock the scheduler already respects; without hours it runs to round end.
      const until = input.hours
        ? new Date(now.getTime() + input.hours * 3_600_000)
        : new Date(Math.max(before.roundPlayer.round.endsAt.getTime(), now.getTime()) + 24 * 3_600_000);
      const paused = { by: actor.username, at: now.toISOString(), reason: input.reason, until: until.toISOString() };
      const after = await prisma.npcGang.update({ where: { id: before.id }, data: { dormantUntil: until, memory: { ...memory, paused } } });
      await audit('pause', snapshot(after));
      message = input.hours ? `Paused for ${input.hours} hours.` : 'Paused for the rest of the round.';
    } else if (input.action === 'WAKE') {
      // Waking ends a pause, a dormancy or a break-up. A dormancy marked as ended lets the
      // gang start on the clean slate it would have had waking on its own.
      const dormancy = memoryObject(memory.dormancy as Prisma.JsonValue);
      const after = await prisma.npcGang.update({
        where: { id: before.id },
        data: {
          dormantUntil: null,
          nextActionAt: now,
          memory: {
            ...memory,
            paused: null,
            retired: null,
            ...(Object.keys(dormancy).length && !dormancy.wokeAt ? { dormancy: { ...dormancy, until: now.toISOString() } } : {}),
          },
        },
      });
      await audit('wake', snapshot(after));
      message = 'Awake and due now.';
    } else if (input.action === 'TUNE') {
      const rules = npcRules(loadRulesetForRound(before.roundPlayer.round));
      if (input.archetype !== undefined && !rules.personalities[input.archetype]) {
        throw AppError.badRequest('UNKNOWN_PERSONALITY', 'Pick one of the listed personalities.');
      }
      if (input.tier !== undefined && !(NPC_GANG_TIERS as readonly string[]).includes(input.tier)) {
        throw AppError.badRequest('UNKNOWN_TIER', 'Pick one of the listed tiers.');
      }
      const data = {
        ...(input.aggression !== undefined ? { aggression: input.aggression } : {}),
        ...(input.ambition !== undefined ? { ambition: input.ambition } : {}),
        ...(input.discipline !== undefined ? { discipline: input.discipline } : {}),
        ...(input.tier !== undefined ? { tier: input.tier } : {}),
        ...(input.archetype !== undefined ? { archetype: input.archetype } : {}),
      };
      if (!Object.keys(data).length) throw AppError.badRequest('NOTHING_TO_TUNE', 'Change at least one trait, the tier or the personality.');
      const after = await prisma.npcGang.update({ where: { id: before.id }, data });
      await audit('tune', snapshot(after));
      message = 'Retuned.';
    } else {
      const reset: Prisma.InputJsonObject = input.scope === 'MOMENTUM'
        ? { lastWokeAt: now.toISOString(), momentum: 0, blockedStreak: 0 }
        : input.scope === 'GRUDGES'
          ? { grudgesClearedAt: now.toISOString(), grudges: [], lastRevenge: null }
          : { migration: null, migrationCheckedAt: now.toISOString() };
      const after = await prisma.npcGang.update({ where: { id: before.id }, data: { memory: { ...memory, ...reset } } });
      await audit(`reset-${input.scope.toLowerCase()}`, { ...snapshot(after), reset: input.scope });
      message = input.scope === 'MOMENTUM'
        ? 'Momentum reset: earlier fights no longer count.'
        : input.scope === 'GRUDGES'
          ? 'Grudges cleared: earlier hits are forgotten.'
          : 'Migration plan dropped.';
    }

    return { message, gang: await inspect(prisma, await load(prisma, roundPlayerId)) };
  },
};
