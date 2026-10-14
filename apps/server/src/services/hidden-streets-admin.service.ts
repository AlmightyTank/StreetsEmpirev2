import type { PrismaClient } from '@prisma/client';
import {
  classicOgV18S,
  questCosmeticProblems,
  rulesets,
  type QuestDefinition,
  type QuestDefinitionCatalog,
  type QuestRewardDefinition,
  type RandomEncounterTrigger,
  type Ruleset,
} from '@streets/rulesets';

type CheckStatus = 'PASS' | 'WARN' | 'FAIL';

export interface HiddenStreetsAdminCheckDto {
  readonly key: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface HiddenStreetsAdminReportDto {
  readonly ruleset: { readonly id: string; readonly version: string; readonly name: string; readonly latest: boolean };
  readonly totals: {
    readonly secretDefinitions: number;
    readonly encounterEntries: number;
    readonly cosmeticRewards: number;
    readonly families: number;
  };
  readonly families: readonly { readonly family: string; readonly secrets: number; readonly cosmeticRewards: readonly string[] }[];
  readonly encountersByTrigger: Readonly<Partial<Record<RandomEncounterTrigger, readonly string[]>>>;
  readonly checks: readonly HiddenStreetsAdminCheckDto[];
  readonly adminControls: readonly string[];
  readonly telemetryKeys: readonly string[];
  readonly liveMetrics?: {
    readonly revealedSecretRows: number;
    readonly completedSecretRows: number;
    readonly accountCosmeticUnlocks: number;
  };
}

const competitiveRewardKinds = new Set<QuestRewardDefinition['kind']>(['WEAPON_ACCESS', 'PERMANENT_UNLOCK']);

function secretDefinitions(ruleset: Ruleset): QuestDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {}).filter((definition) => definition.type === 'SECRET');
}

function cosmeticRewardKeys(definition: QuestDefinition): string[] {
  return definition.rewards
    .filter((reward) => reward.kind === 'COSMETIC_UNLOCK' && typeof reward.key === 'string')
    .map((reward) => reward.key!);
}

function groupedFamilies(secrets: readonly QuestDefinition[]) {
  const rows = new Map<string, { family: string; secrets: number; cosmeticRewards: Set<string> }>();
  for (const definition of secrets) {
    const family = definition.availability.secretContent?.family ?? 'UNSPECIFIED';
    const row = rows.get(family) ?? { family, secrets: 0, cosmeticRewards: new Set<string>() };
    row.secrets += 1;
    for (const key of cosmeticRewardKeys(definition)) row.cosmeticRewards.add(key);
    rows.set(family, row);
  }
  return [...rows.values()]
    .sort((left, right) => left.family.localeCompare(right.family))
    .map((row) => ({ family: row.family, secrets: row.secrets, cosmeticRewards: [...row.cosmeticRewards].sort() }));
}

function encountersByTrigger(ruleset: Ruleset): HiddenStreetsAdminReportDto['encountersByTrigger'] {
  const result: Partial<Record<RandomEncounterTrigger, string[]>> = {};
  for (const [trigger, config] of Object.entries(ruleset.randomEncounters?.triggers ?? {}) as [RandomEncounterTrigger, NonNullable<Ruleset['randomEncounters']>['triggers'][RandomEncounterTrigger]][]) {
    const keys = (config?.entries ?? [])
      .map((entry) => entry.key)
      .filter((key) => key.startsWith('scout-') || key.startsWith('travel-') || key.startsWith('store-') || key.startsWith('turf-') || key.startsWith('combat-'))
      .sort();
    if (keys.length) result[trigger] = keys;
  }
  return result;
}

function checks(ruleset: Ruleset, secrets: readonly QuestDefinition[]): HiddenStreetsAdminCheckDto[] {
  const catalog = (ruleset.questDefinitions ?? {}) as QuestDefinitionCatalog;
  const cosmeticProblems = questCosmeticProblems(catalog, ruleset.cosmetics);
  const checks: HiddenStreetsAdminCheckDto[] = [{
    key: 'cosmetic-reward-catalog',
    status: cosmeticProblems.length ? 'FAIL' : 'PASS',
    detail: cosmeticProblems.length ? cosmeticProblems.join('; ') : 'Every COSMETIC_UNLOCK reward points at a ruleset cosmetic definition.',
  }];

  const duplicateKeys = [...new Set(secrets.map((secret) => secret.key).filter((key, index, keys) => keys.indexOf(key) !== index))];
  checks.push({
    key: 'stable-secret-keys',
    status: duplicateKeys.length ? 'FAIL' : 'PASS',
    detail: duplicateKeys.length ? `Duplicate secret keys: ${duplicateKeys.join(', ')}` : `${secrets.length} secret keys are unique in this ruleset.`,
  });

  const spoilerUnsafe = secrets.filter((secret) => secret.availability.hidden !== true || !secret.availability.secretTrigger);
  checks.push({
    key: 'spoiler-safe-authoring',
    status: spoilerUnsafe.length ? 'FAIL' : 'PASS',
    detail: spoilerUnsafe.length ? `Secrets missing hidden trigger contract: ${spoilerUnsafe.map((secret) => secret.key).join(', ')}` : 'Every secret remains hidden until its server-side trigger is satisfied.',
  });

  const competitive = secrets.filter((secret) => secret.rewards.some((reward) => competitiveRewardKinds.has(reward.kind)));
  checks.push({
    key: 'cosmetic-only-permanent-rewards',
    status: competitive.length ? 'FAIL' : 'PASS',
    detail: competitive.length ? `Secrets include competitive permanent rewards: ${competitive.map((secret) => secret.key).join(', ')}` : 'No Hidden Streets secret grants weapon access or permanent gameplay unlocks.',
  });

  const disabledOrTestOnly = secrets.filter((secret) => secret.availability.secretContent?.disabled || secret.availability.secretContent?.testOnly);
  checks.push({
    key: 'protected-live-defaults',
    status: disabledOrTestOnly.length ? 'WARN' : 'PASS',
    detail: disabledOrTestOnly.length ? `Some secrets are test-only/disabled: ${disabledOrTestOnly.map((secret) => secret.key).join(', ')}` : 'No shipped Hidden Streets secret is test-only or disabled in the latest ruleset.',
  });

  return checks;
}

async function liveMetrics(prisma: PrismaClient, ruleset: Ruleset): Promise<HiddenStreetsAdminReportDto['liveMetrics']> {
  const [revealedSecretRows, completedSecretRows, accountCosmeticUnlocks] = await Promise.all([
    prisma.playerQuest.count({ where: { questDefinition: { is: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, type: 'SECRET' } } } }),
    prisma.playerQuest.count({ where: { status: 'COMPLETED', questDefinition: { is: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, type: 'SECRET' } } } }),
    prisma.accountCosmeticUnlock.count({ where: { sourceRulesetId: ruleset.meta.id, sourceRulesetVersion: ruleset.meta.version } }),
  ]);
  return { revealedSecretRows, completedSecretRows, accountCosmeticUnlocks };
}

export const HiddenStreetsAdminService = {
  async releaseReport(prisma?: PrismaClient, ruleset: Ruleset = classicOgV18S): Promise<HiddenStreetsAdminReportDto> {
    const secrets = secretDefinitions(ruleset).filter((secret) => secret.availability.secretContent);
    const familyRows = groupedFamilies(secrets);
    const cosmeticRewards = [...new Set(secrets.flatMap(cosmeticRewardKeys))].sort();
    const report: HiddenStreetsAdminReportDto = {
      ruleset: {
        id: ruleset.meta.id,
        version: ruleset.meta.version,
        name: ruleset.meta.name,
        latest: Object.values(rulesets).at(-1) === ruleset,
      },
      totals: {
        secretDefinitions: secrets.length,
        encounterEntries: Object.values(ruleset.randomEncounters?.triggers ?? {}).reduce((total, trigger) => total + (trigger?.entries.length ?? 0), 0),
        cosmeticRewards: cosmeticRewards.length,
        families: familyRows.length,
      },
      families: familyRows,
      encountersByTrigger: encountersByTrigger(ruleset),
      checks: checks(ruleset, secrets),
      adminControls: [
        'Quest enable/disable: AdminQuestService.setQuestEnabled',
        'Eligibility preview: this report lists versioned triggers, families, encounters and rewards before rollout.',
        'Rollback: pin new rounds to the previous ruleset or disable specific QuestDefinition rows without mutating old pinned rounds.',
      ],
      telemetryKeys: [
        'hidden_streets.secret.revealed',
        'hidden_streets.secret.completed',
        'hidden_streets.encounter.offered',
        'hidden_streets.choice.expired',
        'hidden_streets.reward.duplicate_attempt',
      ],
      ...(prisma ? { liveMetrics: await liveMetrics(prisma, ruleset) } : {}),
    };
    return report;
  },
};
