import type { RoundPlayer } from '@prisma/client';
import { STREET_SKILL_KEYS, streetSkillCatchUpMultiplier, streetSkillPointsForXp, streetSkillTaperedXp, streetSkillTaperMultiplier, type StreetSkillKey, type StreetSkillsRules } from '@streets/rulesets';
import { resolveModifiers, type ModifierContribution, type ModifierResolution } from '@streets/rules-engine';
import type { Db } from '../utils/db.js';
import { lockRoundPlayer } from '../utils/db.js';
import { AppError } from '../utils/errors.js';

export interface SkillXpAward {
  skill: StreetSkillKey;
  amount: number;
  sourceKey?: string;
}

export interface PlayerSkillModifierReceipt {
  readonly effectId: string;
  readonly sourceId: string;
  readonly label: string;
  readonly requestedPercent: number;
  readonly appliedPercent: number;
  readonly capped: boolean;
}

function skillKey(value: string): StreetSkillKey {
  if ((STREET_SKILL_KEYS as readonly string[]).includes(value)) return value as StreetSkillKey;
  throw AppError.badRequest('STREET_SKILL_UNKNOWN', 'That street skill does not exist.');
}

function choicesObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

export const PlayerSkillService = {
  async view(tx: Db, roundPlayerId: string, rules: StreetSkillsRules, now = new Date()) {
    const rows = await tx.playerSkill.findMany({ where: { roundPlayerId }, orderBy: { skill: 'asc' } });
    const skills = STREET_SKILL_KEYS.map((skill) => {
      const row = rows.find((candidate) => candidate.skill === skill);
      const points = row?.points ?? 0;
      const sameWindow = Boolean(row?.xpWindowStartsAt && now.getTime() - row.xpWindowStartsAt.getTime() < 86_400_000);
      const xpToday = sameWindow ? row?.xpInWindow ?? 0 : 0;
      const milestones = rules.milestones[skill] ?? [];
      return {
        skill,
        xp: row?.xp ?? 0,
        points,
        xpToday,
        taperBand: streetSkillTaperMultiplier(xpToday, rules) === 1 ? 'FULL' as const : streetSkillTaperMultiplier(xpToday, rules) === 0.5 ? 'HALF' as const : 'QUARTER' as const,
        choices: choicesObject(row?.choices),
        respecs: row?.respecs ?? 0,
        respecReadyAt: row?.respecReadyAt?.toISOString() ?? null,
        milestones: milestones.map((milestone) => ({
          threshold: milestone.threshold,
          unlocked: points >= milestone.threshold,
          choice: choicesObject(row?.choices)[String(milestone.threshold)] ?? null,
          choices: milestone.choices,
        })),
      };
    });
    const xpToday = skills.reduce((total, skill) => total + skill.xpToday, 0);
    const taperMultiplier = streetSkillTaperMultiplier(xpToday, rules);
    return {
      skills,
      totalPoints: skills.reduce((total, skill) => total + skill.points, 0),
      totalPointCap: rules.totalPointCap,
      skillPointCap: rules.skillPointCap,
      dailyFullXp: rules.dailyFullXp,
      dailyHalfXp: rules.dailyHalfXp,
      xpToday,
      taperBand: taperMultiplier === 1 ? 'FULL' as const : taperMultiplier === 0.5 ? 'HALF' as const : 'QUARTER' as const,
    };
  },
  async publicBadges(tx: Db, roundPlayerIds: readonly string[]) {
    const rows = await tx.playerSkill.findMany({
      where: { roundPlayerId: { in: [...roundPlayerIds] }, points: { gt: 0 } },
      select: { roundPlayerId: true, skill: true, points: true },
    });
    const order = new Map(STREET_SKILL_KEYS.map((skill, index) => [skill, index]));
    const labels: Record<StreetSkillKey, string> = {
      HUSTLE: 'Hustle', MUSCLE: 'Muscle', WHEELS: 'Wheels', FIXER: 'Fixer', CONNECTIONS: 'Connections', LUCK: 'Luck',
    };
    const result = new Map<string, Array<{ skill: StreetSkillKey; label: string; points: number }>>();
    for (const row of rows) {
      if (!order.has(row.skill as StreetSkillKey)) continue;
      const badge = { skill: row.skill as StreetSkillKey, label: labels[row.skill as StreetSkillKey], points: row.points };
      result.set(row.roundPlayerId, [...(result.get(row.roundPlayerId) ?? []), badge]);
    }
    for (const badges of result.values()) badges.sort((a, b) => b.points - a.points || order.get(a.skill)! - order.get(b.skill)!);
    return result;
  },
  async choose(tx: Db, input: { roundPlayerId: string; rules: StreetSkillsRules; skill: string; threshold: number; choice: string }) {
    await lockRoundPlayer(tx, input.roundPlayerId);
    const skill = skillKey(input.skill);
    const milestone = (input.rules.milestones[skill] ?? []).find((candidate) => candidate.threshold === input.threshold);
    if (!milestone) throw AppError.badRequest('STREET_SKILL_MILESTONE_UNKNOWN', 'That milestone is not available.');
    const selected = milestone.choices.find((candidate) => candidate.key === input.choice);
    if (!selected) throw AppError.badRequest('STREET_SKILL_CHOICE_UNKNOWN', 'That choice is not available for this milestone.');
    const row = await tx.playerSkill.upsert({
      where: { roundPlayerId_skill: { roundPlayerId: input.roundPlayerId, skill } },
      create: { roundPlayerId: input.roundPlayerId, skill },
      update: {},
    });
    if (row.points < milestone.threshold) throw AppError.conflict('STREET_SKILL_MILESTONE_LOCKED', `Reach ${milestone.threshold} ${skill.toLowerCase()} points before choosing this perk.`);
    const choices = choicesObject(row.choices);
    if (choices[String(milestone.threshold)]) throw AppError.conflict('STREET_SKILL_CHOICE_SET', 'That milestone choice has already been set. Respec the skill to choose again.');
    choices[String(milestone.threshold)] = selected.key;
    const updated = await tx.playerSkill.update({ where: { id: row.id }, data: { choices } });
    return { skill, threshold: milestone.threshold, choice: selected, choices: choicesObject(updated.choices) };
  },
  async respec(tx: Db, input: { roundPlayerId: string; rules: StreetSkillsRules; skill: string; now: Date }) {
    await lockRoundPlayer(tx, input.roundPlayerId);
    const skill = skillKey(input.skill);
    const row = await tx.playerSkill.findUnique({ where: { roundPlayerId_skill: { roundPlayerId: input.roundPlayerId, skill } } });
    if (!row || !Object.keys(choicesObject(row.choices)).length) throw AppError.conflict('STREET_SKILL_NOTHING_TO_RESPEC', 'This skill has no milestone choices to reset.');
    if (row.respecReadyAt && row.respecReadyAt > input.now) throw AppError.conflict('STREET_SKILL_RESPEC_COOLDOWN', `That skill can be respecced again at ${row.respecReadyAt.toISOString()}.`);
    const cost = input.rules.respec.baseCostCents * (row.respecs + 1);
    const player = await tx.roundPlayer.findUnique({ where: { id: input.roundPlayerId }, select: { cashCents: true } });
    if (!player || player.cashCents < BigInt(cost)) throw AppError.conflict('STREET_SKILL_RESPEC_FUNDS', 'You cannot afford this respec.');
    const readyAt = new Date(input.now.getTime() + input.rules.respec.cooldownHours * 3_600_000);
    await tx.roundPlayer.update({ where: { id: input.roundPlayerId }, data: { cashCents: { decrement: BigInt(cost) } } });
    const updated = await tx.playerSkill.update({ where: { id: row.id }, data: { choices: {}, respecs: { increment: 1 }, respecReadyAt: readyAt } });
    return { skill, costCents: cost, respecs: updated.respecs, respecReadyAt: readyAt, choices: {} };
  },
  /** Resolve boss passives together with territory, crew, and item sources. */
  async resolveModifiers(tx: Db, input: {
    roundPlayerId: string;
    rules: StreetSkillsRules;
    additional?: readonly ModifierContribution[];
  }): Promise<ModifierResolution & { readonly receipts: readonly PlayerSkillModifierReceipt[] }> {
    const skills = await tx.playerSkill.findMany({
      where: { roundPlayerId: input.roundPlayerId },
      select: { skill: true, points: true },
    });
    const skillContributions: ModifierContribution[] = [];
    for (const skill of skills) {
      const key = skill.skill as StreetSkillKey;
      for (const passive of input.rules.passives.filter((entry) => entry.effectId.startsWith(`${key}_`))) {
        const percent = passive.maxPercent * Math.max(0, Math.min(40, skill.points)) / 40;
        if (!percent) continue;
        skillContributions.push({
          effectId: passive.effectId,
          category: passive.category,
          percent,
          sourceId: `street-skill:${key}`,
          label: passive.label,
        });
      }
    }
    const resolution = resolveModifiers([...(input.additional ?? []), ...skillContributions], input.rules.modifierCaps);
    return {
      ...resolution,
      receipts: resolution.modifiers.map((modifier) => ({
        effectId: modifier.effectId,
        sourceId: modifier.sourceId,
        label: modifier.label,
        requestedPercent: modifier.percent,
        appliedPercent: modifier.appliedPercent,
        capped: modifier.capped,
      })),
    };
  },
  async award(tx: Db, input: { roundPlayerId: string; player: Pick<RoundPlayer, 'createdAt'>; rules: StreetSkillsRules; award: SkillXpAward; sourceKey: string; now: Date }): Promise<number> {
    const base = Math.max(0, Math.floor(input.award.amount));
    if (!base) return 0;
    const skill = await tx.playerSkill.upsert({
      where: { roundPlayerId_skill: { roundPlayerId: input.roundPlayerId, skill: input.award.skill } },
      create: { roundPlayerId: input.roundPlayerId, skill: input.award.skill },
      update: {},
    });
    const receipt = await tx.playerSkillAward.createMany({
      data: [{ playerSkillId: skill.id, roundPlayerId: input.roundPlayerId, sourceKey: input.award.sourceKey ?? input.sourceKey, amount: base, awardedAt: input.now }],
      skipDuplicates: true,
    });
    if (!receipt.count) return 0;
    const sameWindow = Boolean(skill.xpWindowStartsAt && input.now.getTime() - skill.xpWindowStartsAt.getTime() < 86_400_000);
    const windowXp = sameWindow ? skill.xpInWindow : 0;
    const tapered = streetSkillTaperedXp(base, windowXp, input.rules);
    const earned = Math.max(1, Math.floor(tapered * streetSkillCatchUpMultiplier(input.player.createdAt, input.now, input.rules)));
    const nextXp = skill.xp + earned;
    await tx.playerSkill.update({
      where: { id: skill.id },
      data: { xp: nextXp, points: streetSkillPointsForXp(nextXp, input.rules), xpWindowStartsAt: sameWindow ? skill.xpWindowStartsAt : input.now, xpInWindow: windowXp + earned },
    });
    return earned;
  },
  async awardMany(tx: Db, input: { roundPlayerId: string; player: Pick<RoundPlayer, 'createdAt'>; rules: StreetSkillsRules; awards: readonly SkillXpAward[]; sourceKey: string; now: Date }): Promise<number> {
    let total = 0;
    for (const award of input.awards) total += await PlayerSkillService.award(tx, { ...input, award, sourceKey: `${input.sourceKey}:${award.skill}` });
    return total;
  },
};
