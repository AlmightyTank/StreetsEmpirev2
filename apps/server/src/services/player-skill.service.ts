import type { PrismaClient, RoundPlayer } from '@prisma/client';
import {
  STREET_SKILL_KEYS,
  streetSkillCatchUpMultiplier,
  streetSkillPerk,
  streetSkillPointsForXp,
  streetSkillTaperedXp,
  streetSkillTaperMultiplier,
  type StreetSkillEffectId,
  type StreetSkillKey,
  type StreetSkillsRules,
} from '@streets/rulesets';
import { loadRulesetForRound, resolveModifiers, type ModifierContribution, type ModifierResolution } from '@streets/rules-engine';
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

/**
 * A player's street skill effects for one settlement. Systems ask for the
 * effect they change; every effect asked for lands on the action's receipt.
 */
export interface SkillEffects {
  readonly active: boolean;
  /** Applied percent for an effect after caps. `weakTarget` drops offensive perks. */
  percent(effectId: StreetSkillEffectId, options?: { weakTarget?: boolean }): number;
  /** Whether a chosen rule-change perk (one without a percent) is in play. */
  has(perkKey: string): boolean;
  /** `value` changed by the effect's percent. */
  scale(effectId: StreetSkillEffectId, value: number, options?: { weakTarget?: boolean }): number;
  /** Receipt lines for the effects this settlement actually used. */
  receipts(): PlayerSkillModifierReceipt[];
}

const labels: Record<StreetSkillKey, string> = {
  HUSTLE: 'Hustle', MUSCLE: 'Muscle', WHEELS: 'Wheels', FIXER: 'Fixer', CONNECTIONS: 'Connections', LUCK: 'Luck',
};

export const NO_SKILL_EFFECTS: SkillEffects = {
  active: false,
  percent: () => 0,
  has: () => false,
  scale: (_effectId, value) => value,
  receipts: () => [],
};

function skillKey(value: string): StreetSkillKey {
  if ((STREET_SKILL_KEYS as readonly string[]).includes(value)) return value as StreetSkillKey;
  throw AppError.badRequest('STREET_SKILL_UNKNOWN', 'That street skill does not exist.');
}

function choicesObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function taperBand(multiplier: number): 'FULL' | 'HALF' | 'QUARTER' {
  return multiplier === 1 ? 'FULL' : multiplier === 0.5 ? 'HALF' : 'QUARTER';
}

/** Passive and chosen-perk contributions for a player's skill rows. */
export function skillContributions(
  rows: ReadonlyArray<{ skill: string; points: number; choices: unknown }>,
  rules: StreetSkillsRules,
): { contributions: Array<ModifierContribution & { offensive: boolean }>; perks: Set<string> } {
  const contributions: Array<ModifierContribution & { offensive: boolean }> = [];
  const perks = new Set<string>();
  for (const row of rows) {
    if (!(STREET_SKILL_KEYS as readonly string[]).includes(row.skill)) continue;
    const key = row.skill as StreetSkillKey;
    const factor = Math.max(0, Math.min(rules.skillPointCap, row.points)) / rules.skillPointCap;
    for (const passive of rules.passives) {
      if (passive.skill !== key || passive.requires) continue;
      const percent = passive.maxPercent * factor;
      if (!percent) continue;
      contributions.push({ effectId: passive.effectId, target: passive.effectId, category: passive.category, percent, sourceId: `street-skill:${key}`, label: passive.label, offensive: false });
    }
    for (const [threshold, choice] of Object.entries(choicesObject(row.choices))) {
      const perk = streetSkillPerk(rules, choice);
      // A choice only counts while the points that unlocked it are still there.
      if (!perk || perk.requires || row.points < Number(threshold)) continue;
      perks.add(perk.key);
      if (perk.effect) {
        contributions.push({
          effectId: perk.effect.effectId,
          target: perk.effect.effectId,
          category: perk.effect.category,
          percent: perk.effect.percent,
          sourceId: `street-perk:${perk.key}`,
          label: `${labels[key]} · ${perk.label}`,
          offensive: Boolean(perk.offensive),
        });
      }
    }
  }
  return { contributions, perks };
}

/** Build the effect reader from resolved contributions. Exported for tests. */
export function buildSkillEffects(
  rows: ReadonlyArray<{ skill: string; points: number; choices: unknown }>,
  rules: StreetSkillsRules,
  additional: readonly ModifierContribution[] = [],
): SkillEffects {
  const { contributions, perks } = skillContributions(rows, rules);
  if (!contributions.length && !perks.size && !additional.length) return NO_SKILL_EFFECTS;
  const full = resolveModifiers([...additional, ...contributions], rules.modifierCaps);
  const safe = resolveModifiers([...additional, ...contributions.filter((entry) => !entry.offensive)], rules.modifierCaps);
  const used = new Map<string, ModifierResolution>();
  const usedPerks = new Set<string>();
  const percent = (effectId: StreetSkillEffectId, options?: { weakTarget?: boolean }) => {
    const resolution = options?.weakTarget ? safe : full;
    const value = resolution.targets[effectId] ?? 0;
    if (value) used.set(effectId, resolution);
    return value;
  };
  return {
    active: true,
    percent,
    has(perkKey) {
      const held = perks.has(perkKey);
      if (held) usedPerks.add(perkKey);
      return held;
    },
    scale(effectId, value, options) {
      const pct = percent(effectId, options);
      return pct ? value * (100 + pct) / 100 : value;
    },
    receipts() {
      const lines: PlayerSkillModifierReceipt[] = [];
      for (const [effectId, resolution] of used) {
        for (const modifier of resolution.modifiers) {
          if (modifier.target !== effectId || modifier.appliedPercent === 0) continue;
          lines.push({ effectId, sourceId: modifier.sourceId, label: modifier.label, requestedPercent: modifier.percent, appliedPercent: modifier.appliedPercent, capped: modifier.capped });
        }
      }
      for (const key of usedPerks) {
        const perk = streetSkillPerk(rules, key);
        lines.push({ effectId: key, sourceId: `street-perk:${key}`, label: perk?.label ?? key, requestedPercent: 0, appliedPercent: 0, capped: false });
      }
      return lines;
    },
  };
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
        taperBand: taperBand(streetSkillTaperMultiplier(xpToday, rules)),
        choices: choicesObject(row?.choices),
        respecs: row?.respecs ?? 0,
        respecReadyAt: row?.respecReadyAt?.toISOString() ?? null,
        respecCostCents: rules.respec.baseCostCents * ((row?.respecs ?? 0) + 1),
        milestones: milestones.map((milestone) => ({
          threshold: milestone.threshold,
          unlocked: points >= milestone.threshold,
          choice: choicesObject(row?.choices)[String(milestone.threshold)] ?? null,
          choices: milestone.choices.map((choice) => ({
            key: choice.key,
            label: choice.label,
            description: choice.description,
            requires: choice.requires ?? null,
          })),
        })),
      };
    });
    // The taper runs per skill, so the day's pace is the busiest skill's.
    const busiest = skills.reduce((max, skill) => Math.max(max, skill.xpToday), 0);
    return {
      skills,
      totalPoints: skills.reduce((total, skill) => total + skill.points, 0),
      totalPointCap: rules.totalPointCap,
      skillPointCap: rules.skillPointCap,
      dailyFullXp: rules.dailyFullXp,
      dailyHalfXp: rules.dailyHalfXp,
      xpToday: busiest,
      taperBand: taperBand(streetSkillTaperMultiplier(busiest, rules)),
    };
  },
  async publicBadges(tx: Db, roundPlayerIds: readonly string[]) {
    const rows = await tx.playerSkill.findMany({
      where: { roundPlayerId: { in: [...roundPlayerIds] }, points: { gt: 0 } },
      select: { roundPlayerId: true, skill: true, points: true },
    });
    const order = new Map(STREET_SKILL_KEYS.map((skill, index) => [skill, index]));
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
    if (selected.requires) throw AppError.conflict('STREET_SKILL_PERK_UNAVAILABLE', `${selected.label} arrives with ${selected.requires}.`);
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
  /** A player's skill effects under the given rules; none when the round has no skills. */
  async effects(db: Db | PrismaClient, roundPlayerId: string, rules: StreetSkillsRules | undefined): Promise<SkillEffects> {
    if (!rules) return NO_SKILL_EFFECTS;
    const rows = await db.playerSkill.findMany({ where: { roundPlayerId }, select: { skill: true, points: true, choices: true } });
    return rows.length ? buildSkillEffects(rows, rules) : NO_SKILL_EFFECTS;
  },
  /** The same, for code that has only the player: reads the round's ruleset first. */
  async effectsFor(db: Db | PrismaClient, roundPlayerId: string): Promise<SkillEffects> {
    const player = await db.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { round: true } });
    if (!player) return NO_SKILL_EFFECTS;
    return PlayerSkillService.effects(db, roundPlayerId, loadRulesetForRound(player.round).streetSkills);
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
    // The shared total cap: the other skills' points leave this one only the room that is left.
    const others = await tx.playerSkill.aggregate({ where: { roundPlayerId: input.roundPlayerId, id: { not: skill.id } }, _sum: { points: true } });
    const points = Math.max(skill.points, streetSkillPointsForXp(nextXp, input.rules, others._sum.points ?? 0));
    await tx.playerSkill.update({
      where: { id: skill.id },
      data: { xp: nextXp, points, xpWindowStartsAt: sameWindow ? skill.xpWindowStartsAt : input.now, xpInWindow: windowXp + earned },
    });
    return earned;
  },
  async awardMany(tx: Db, input: { roundPlayerId: string; player: Pick<RoundPlayer, 'createdAt'>; rules: StreetSkillsRules; awards: readonly SkillXpAward[]; sourceKey: string; now: Date }): Promise<number> {
    let total = 0;
    for (const award of input.awards) total += await PlayerSkillService.award(tx, { ...input, award, sourceKey: `${input.sourceKey}:${award.skill}` });
    return total;
  },
};
