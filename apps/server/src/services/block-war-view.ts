import {
  alliedShare,
  allyThugCap,
  blockWarRules,
  hoursToFullControl,
  siegeControlPerHour,
  type Ruleset,
} from '@streets/rules-engine';
import type { BusinessKey } from '@streets/rulesets';
import type { BlockWarDto } from '@streets/shared';
import type { Db } from '../utils/db.js';

const HOUR_MS = 3_600_000;
type ViewDb = Pick<Db, 'blockWar' | 'roundPlayer' | 'business'>;

export interface WarViewer {
  id: string;
  cityId: string;
  allianceId: string | null;
}

/**
 * 1.1.0-D. Every live war in the round, as `viewer` sees it, keyed by block. Wars are public
 * (the Street Wire announces them); what a player can do in one depends on their role.
 */
export async function blockWarViews(db: ViewDb, ruleset: Ruleset, roundId: string, viewer: WarViewer, now: Date): Promise<Map<string, BlockWarDto>> {
  const views = new Map<string, BlockWarDto>();
  const rules = blockWarRules(ruleset);
  if (!rules) return views;
  const wars = await db.blockWar.findMany({
    where: { roundId, status: { not: 'ENDED' } },
    include: {
      attacker: { select: { publicPimpId: true, displayName: true, allianceId: true } },
      defender: { select: { publicPimpId: true, displayName: true, allianceId: true } },
      turf: { select: { cityId: true, cornerThugs: true } },
      fightRows: { where: { status: 'PENDING' }, orderBy: { landsAt: 'asc' } },
      squads: { where: { active: true } },
    },
  });
  if (!wars.length) return views;
  const allyIds = [...new Set(wars.flatMap((war) => [war.attackerAllyId, war.defenderAllyId]).filter((id): id is string => Boolean(id)))];
  const allies = new Map((allyIds.length
    ? await db.roundPlayer.findMany({ where: { id: { in: allyIds } }, select: { id: true, displayName: true } })
    : []).map((row) => [row.id, row.displayName]));
  const torches = await db.business.findMany({
    where: { turfId: { in: wars.map((war) => war.turfId) }, torchUntil: { not: null } },
    select: { turfId: true, lot: true, kind: true, torchUntil: true },
  });
  const myAllySlots = await db.blockWar.count({ where: { roundId, status: { not: 'ENDED' }, OR: [{ attackerAllyId: viewer.id }, { defenderAllyId: viewer.id }] } });

  for (const war of wars) {
    const role: BlockWarDto['role'] = war.attackerId === viewer.id ? 'attacker'
      : war.defenderId === viewer.id ? 'defender'
        : war.attackerAllyId === viewer.id ? 'attackerAlly'
          : war.defenderAllyId === viewer.id ? 'defenderAlly'
            : 'observer';
    const pending = war.fightRows.find((fight) => fight.landsAt > now) ?? null;
    const attackerSquads = war.squads.filter((squad) => squad.side === 'ATTACKER');
    const defenderSquads = war.squads.filter((squad) => squad.side === 'DEFENDER');
    const declarer = attackerSquads.filter((squad) => squad.role === 'DECLARER').reduce((sum, squad) => sum + squad.thugs, 0);
    const attackerAlly = attackerSquads.filter((squad) => squad.role === 'ALLY').reduce((sum, squad) => sum + squad.thugs, 0);
    const share = alliedShare(declarer, attackerAlly);
    const siege = war.status === 'SIEGE' && war.controlAt;
    const control = siege ? Math.min(100, war.control + siegeControlPerHour(ruleset, share) * Math.max(0, (now.getTime() - war.controlAt!.getTime()) / HOUR_MS)) : war.control;
    const fullAt = siege ? new Date(now.getTime() + hoursToFullControl(ruleset, control, share) * HOUR_MS) : null;
    const mine = war.squads.filter((squad) => squad.playerId === viewer.id).reduce((sum, squad) => sum + squad.thugs, 0);
    const cap = allyThugCap(ruleset, declarer);
    const party = role === 'attacker' || role === 'defender';

    const answer = (side: 'ATTACKER' | 'DEFENDER'): string | null => {
      const until = side === 'ATTACKER' ? war.attackerCallUntil : war.defenderCallUntil;
      const callerAlliance = side === 'ATTACKER' ? war.attacker.allianceId : war.defender.allianceId;
      const slot = side === 'ATTACKER' ? war.attackerAllyId : war.defenderAllyId;
      if (party) return 'This is your own war.';
      if (!viewer.allianceId || viewer.allianceId !== callerAlliance) return 'Only their alliance can answer.';
      if (viewer.cityId !== war.turf.cityId) return 'Only members living in this city can answer.';
      if (!until || until <= now) return 'No call for help is open on that side.';
      if (slot && slot !== viewer.id) return 'Another member already answered for that side.';
      if (!slot && myAllySlots >= (ruleset.business?.allies.maxWarsAsAlly ?? 1)) return 'You are already the ally in another war.';
      const fight = war.fightRows.find((row) => row.landsAt > now && (side === 'DEFENDER' || row.kind !== 'BREAK'));
      if (!fight && !(side === 'ATTACKER' && war.status === 'SIEGE')) return 'There is no fight to join on that side right now.';
      if (cap - mine < 1) return 'You already match the declarer\'s squad, the most an ally can send.';
      return null;
    };
    const assaultIn = war.nextAssaultAt && war.nextAssaultAt > now ? war.nextAssaultAt : null;
    const callSide = role === 'attacker' ? 'ATTACKER' : role === 'defender' ? 'DEFENDER' : null;
    const callOpen = callSide === 'DEFENDER'
      ? Boolean(pending)
      : callSide === 'ATTACKER' && (Boolean(pending && pending.kind !== 'BREAK') || war.status === 'SIEGE');
    const pendingDefense = war.fightRows.find((fight) => fight.kind !== 'BREAK' && fight.landsAt > now);
    const sentToPending = pendingDefense ? war.squads.some((squad) => squad.fightId === pendingDefense.id && squad.playerId === viewer.id) : false;
    const name = (kind: string) => ruleset.business?.catalog[kind as BusinessKey]?.name ?? kind;

    views.set(war.turfId, {
      id: war.id,
      goal: war.goal,
      status: war.status as BlockWarDto['status'],
      role,
      attacker: { publicPimpId: war.attacker.publicPimpId, displayName: war.attacker.displayName },
      defender: { publicPimpId: war.defender.publicPimpId, displayName: war.defender.displayName },
      declaredAt: war.declaredAt.toISOString(),
      endsBy: war.endsBy.toISOString(),
      control: Math.round(control * 10) / 10,
      controlPerHour: Math.round(siegeControlPerHour(ruleset, share) * 10) / 10,
      fullControlAt: fullAt && fullAt < war.endsBy ? fullAt.toISOString() : null,
      nextAssaultAt: assaultIn?.toISOString() ?? null,
      pendingFight: pending ? { kind: pending.kind, landsAt: pending.landsAt.toISOString() } : null,
      committed: {
        attacker: attackerSquads.reduce((sum, squad) => sum + squad.thugs, 0),
        defender: defenderSquads.reduce((sum, squad) => sum + squad.thugs, 0) + war.turf.cornerThugs,
      },
      mine,
      allyCap: cap,
      allies: {
        attacker: war.attackerAllyId ? { displayName: allies.get(war.attackerAllyId) ?? 'An ally', cutPercent: Math.round(war.attackerCut * 100), fought: war.attackerAllyFought } : null,
        defender: war.defenderAllyId ? { displayName: allies.get(war.defenderAllyId) ?? 'An ally', cutPercent: Math.round(war.defenderCut * 100), fought: war.defenderAllyFought } : null,
      },
      calls: {
        attacker: war.attackerCallUntil && war.attackerCallUntil > now ? { cutPercent: Math.round(war.attackerCut * 100), until: war.attackerCallUntil.toISOString() } : null,
        defender: war.defenderCallUntil && war.defenderCallUntil > now ? { cutPercent: Math.round(war.defenderCut * 100), until: war.defenderCallUntil.toISOString() } : null,
      },
      actions: {
        defend: role !== 'defender' ? 'Only the holder sends backup.'
          : !pendingDefense ? 'No assault is coming right now.'
            : sentToPending ? 'You already sent backup to this fight.' : null,
        breakSiege: role !== 'defender' ? 'Only the holder can break the siege.'
          : war.status !== 'SIEGE' ? 'Nobody is besieging the block.'
            : war.fightRows.some((fight) => fight.kind === 'BREAK') ? 'A break attempt is already on its way.' : null,
        assault: role !== 'attacker' ? 'Only the declarer can assault the block.'
          : war.status !== 'BETWEEN' || war.fightRows.length ? 'Your squad is already in this fight.'
            : assaultIn ? 'Your crew is regrouping.' : null,
        callAlly: !callSide ? 'Only the declarer or the holder can call for help.'
          : !viewer.allianceId ? 'You have no alliance to call.'
            : !callOpen ? 'There is no fight coming for an ally to join.' : null,
        answerAttacker: answer('ATTACKER'),
        answerDefender: answer('DEFENDER'),
        concede: role !== 'defender' ? 'Only the holder can concede.' : war.status !== 'SIEGE' ? 'You can only concede while the block is under siege.' : null,
        withdraw: role !== 'attacker' ? 'Only the declarer can withdraw.' : null,
        torch: role !== 'defender' ? 'Only the holder can torch a business.' : null,
      },
      torches: torches.filter((row) => row.turfId === war.turfId && row.torchUntil).map((row) => ({ lot: row.lot, name: name(row.kind), until: row.torchUntil!.toISOString() })),
    });
  }
  return views;
}
