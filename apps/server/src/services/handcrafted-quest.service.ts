import type { Prisma, PrismaClient } from '@prisma/client';
import { FACTION_TIERS, contractStanding, factionTierName, factionTierRank, factionTierStartsAt, innerCircleLockedBy, innerCirclePreview, jobStanding as jobStandingFor, lawPriceCents } from '@streets/rules-engine';
import {
  type ContactKey,
  contractBoard,
  jobFaction,
  type FactionKey,
  type FactionTier,
  type QuestBranchDefinition,
  type QuestDefinition,
  type QuestObjectiveDefinition,
  type QuestProgressMap,
  type QuestRewardDefinition,
  type QuestType,
  type Ruleset,
} from '@streets/rulesets';
import type {
  GameActionResult,
  PlayerQuestDto,
  QuestRequirementDto,
  QuestClaimInput,
  QuestBranchChoiceDto,
  QuestBranchReputationDto,
  QuestClaimResult,
  QuestContactDto,
  QuestObjectiveDto,
  QuestPageDto,
  QuestStoryDto,
} from '@streets/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { lockRoundPlayer, type Db } from '../utils/db.js';
import { ActionService, type PlayerState } from './action.service.js';
import { QuestProgressService } from './quest-progress.service.js';
import { FavorInventoryService } from './favor-inventory.service.js';
import { TimedFavorService } from './timed-favor.service.js';
import { SingleUseFavorService } from './single-use-favor.service.js';
import { addContactRep, grantRewards, rewardDto } from './reward-grant.service.js';
import { FactionService } from './faction.service.js';
import { EconomyLedgerService } from './economy-ledger.service.js';
import { FactionPerkService } from './faction-perk.service.js';
import { contractSponsor } from './contract-sponsor.js';
import { StreetPassCredService } from './street-pass-cred.service.js';
import {
  DAILY_CONTRACT_SLOTS,
  dailyContractWindow,
  syncDailyContractAttempts,
} from './daily-contract.service.js';
import {
  WEEKLY_CONTRACT_SLOTS,
  syncDerivedTurfProgress,
  syncWeeklyContractAttempts,
  weeklyContractWindow,
} from './weekly-contract.service.js';
import { syncSecretQuestAttempts } from './secret-quest.service.js';
import {
  cityContractSlots,
  cityContractObjectives,
  cityContractRewards,
  cityContractState,
  cityContractWindow,
  isDynamicCityContractDefinition,
  syncCityContractAttempts,
} from './city-contract.service.js';
import { SEASON_CONTRACT_SLOTS, isSeasonContractDefinition, syncSeasonContractAttempts } from './season-contract.service.js';
import {
  acceptAllianceContract,
  allianceContractContributionSnapshot,
  assertAllianceContractClaim,
  isAllianceContractDefinition,
  lockAllianceContractActor,
  syncAllianceContractAttempts,
} from './alliance-contract.service.js';
import {
  assertCommunityEventClaim,
  communityEventSnapshot,
  isCommunityEventDefinition,
  refreshCommunityEventReadinessForPlayer,
  syncCommunityEventAttempts,
  type CommunityEventSnapshot,
} from './community-event.service.js';

const TRACKED_LIMIT = 3;
/** Shared-board work: not counted as a personal job and not abandonable. Personal jobs have no cap. */
const BOARD_QUEST_TYPES = ['ALLIANCE', 'CITY_CONTRACT', 'EVENT', 'SEASON'] as const;
const CONTACT_TIERS = [
  { at: 0, name: 'Unknown' },
  { at: 25, name: 'Acquaintance' },
  { at: 75, name: 'Regular' },
  { at: 150, name: 'Trusted' },
  { at: 300, name: 'Partner' },
  { at: 500, name: 'Inner Circle' },
] as const;

type QuestRow = Prisma.PlayerQuestGetPayload<{ include: { questDefinition: true } }>;
type ContactTier = typeof CONTACT_TIERS[number];

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function availabilityJson(value: Prisma.JsonValue): QuestDefinition['availability'] {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as QuestDefinition['availability']
    : {};
}

function definitions(ruleset: Ruleset): QuestDefinition[] {
  return Object.values(ruleset.questDefinitions ?? {});
}

function isWindowRepeatable(repeatability: QuestDefinition['repeatability']): boolean {
  return repeatability === 'DAILY' || repeatability === 'WEEKLY';
}

function preservesGeneratedOffer(row: QuestRow, ruleset: Ruleset): boolean {
  return isWindowRepeatable(row.questDefinition.repeatability)
    || isDynamicCityContractDefinition(ruleset.questDefinitions?.[row.questDefinition.key]);
}

export function seasonalEventActive(definition: QuestDefinition, now: Date): boolean {
  const window = definition.availability.seasonalEvent;
  if (!window) return true;
  const startsAt = new Date(window.startsAt);
  const endsAt = new Date(window.endsAt);
  return Number.isFinite(startsAt.getTime())
    && Number.isFinite(endsAt.getTime())
    && startsAt < endsAt
    && now >= startsAt
    && now < endsAt;
}

async function seasonalEventAdminTestModeForPlayer(db: Db, roundPlayerId: string): Promise<boolean> {
  if (!env.seasonalEvents.adminTestMode) return false;
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { account: { select: { isAdmin: true } } },
  });
  return player?.account.isAdmin === true;
}

function seasonalEventAvailable(definition: QuestDefinition, now: Date, adminTestMode: boolean): boolean {
  return seasonalEventActive(definition, now)
    || (adminTestMode && Boolean(definition.availability.seasonalEvent));
}

function objectives(value: Prisma.JsonValue): QuestObjectiveDefinition[] {
  return Array.isArray(value) ? value as unknown as QuestObjectiveDefinition[] : [];
}

function rewards(value: Prisma.JsonValue): QuestRewardDefinition[] {
  return Array.isArray(value) ? value as unknown as QuestRewardDefinition[] : [];
}

function progress(value: Prisma.JsonValue): QuestProgressMap {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as unknown as QuestProgressMap
    : {};
}

function contactTier(points: number): { name: string; next: number | null } {
  let tier: ContactTier = CONTACT_TIERS[0]!;
  let next: number | null = null;
  for (let i = 0; i < CONTACT_TIERS.length; i += 1) {
    const candidate = CONTACT_TIERS[i]!;
    if (points >= candidate.at) {
      tier = candidate;
      next = CONTACT_TIERS[i + 1]?.at ?? null;
    }
  }
  return { name: tier.name, next };
}

function contactFor(ruleset: Ruleset, key: string | null | undefined) {
  if (!key || !ruleset.contacts || !(key in ruleset.contacts)) return undefined;
  return ruleset.contacts[key as ContactKey];
}

function branchReputationDto(
  contactKey: string,
  amount: number,
  ruleset: Ruleset,
): QuestBranchReputationDto {
  const name = contactFor(ruleset, contactKey)?.shortName ?? contactKey;
  return {
    contactKey,
    contactName: name,
    amount,
    label: `${amount > 0 ? '+' : ''}${amount} ${name} reputation`,
  };
}

function branchesFor(row: QuestRow, ruleset: Ruleset): readonly QuestBranchDefinition[] {
  return ruleset.questDefinitions?.[row.questDefinition.key]?.branches ?? [];
}

export function resolveQuestBranchForClaim(
  definition: QuestDefinition,
  branchKey: string | undefined,
  chosenBranch: string | null,
): QuestBranchDefinition | null {
  const options = definition.branches ?? [];
  if (!options.length) {
    if (branchKey) {
      throw AppError.conflict('QUEST_BRANCH_NOT_SUPPORTED', 'That job does not have a branch choice.');
    }
    return null;
  }
  if (!branchKey) {
    throw AppError.conflict('QUEST_BRANCH_REQUIRED', 'Choose a side before collecting payment.');
  }
  const selected = options.find((branch) => branch.key === branchKey);
  if (!selected) {
    throw AppError.conflict('QUEST_BRANCH_INVALID', 'That choice is not available for this job.');
  }
  if (chosenBranch && chosenBranch !== selected.key) {
    throw AppError.conflict('QUEST_BRANCH_LOCKED', 'That job already has a different committed choice.');
  }
  return selected;
}

function branchChoicesDto(row: QuestRow, ruleset: Ruleset): QuestBranchChoiceDto[] {
  return branchesFor(row, ruleset).map((branch) => ({
    key: branch.key,
    title: branch.title,
    description: branch.description,
    rewards: branch.rewards.map((reward) => rewardDto(reward, ruleset)),
    reputationDeltas: branch.reputationDeltas.map((delta) =>
      branchReputationDto(delta.contactKey, delta.amount, ruleset)
    ),
  }));
}

function storyDto(row: QuestRow, ruleset: Ruleset): QuestStoryDto | undefined {
  const definition = ruleset.questDefinitions?.[row.questDefinition.key];
  if (!definition?.story) return undefined;
  return {
    ...definition.story,
    speaker: contactFor(ruleset, definition.contactKey)?.shortName ?? 'StreetsEmpire',
  };
}

function objectiveDtos(row: QuestRow, communityEvent?: CommunityEventSnapshot): QuestObjectiveDto[] {
  const requiredProgress = communityEvent?.progress ?? progress(row.objectiveProgress);
  const bonusProgress = progress(row.bonusProgress);
  const requiredDefinitions = cityContractObjectives(row.rewardState)
    ?? objectives(row.questDefinition.objectives);
  const map = (objective: QuestObjectiveDefinition, bonus: boolean): QuestObjectiveDto => {
    const saved = (bonus ? bonusProgress : requiredProgress)[objective.id];
    return {
      id: objective.id,
      kind: objective.kind,
      description: objective.description,
      format: objective.params?.display === 'CURRENCY' ? 'CURRENCY' : 'NUMBER',
      current: saved?.current ?? 0,
      target: objective.target,
      completed: saved?.completed ?? false,
      bonus,
    };
  };
  return [
    ...requiredDefinitions.map((objective) => map(objective, false)),
    ...objectives(row.questDefinition.bonusObjectives).map((objective) => map(objective, true)),
  ];
}

/**
 * 1.4.0-B. Standing a one-time Job pays each faction it helps (see `jobStanding` in the rules
 * engine): never a faction whose contact it merely pays.
 */
function jobStanding(
  ruleset: Ruleset,
  key: string,
  rewards: ReadonlyArray<{ kind: string; key?: string | null; amount?: number | null }>,
  branch?: QuestBranchDefinition | null,
): Map<FactionKey, number> {
  const definition = ruleset.questDefinitions?.[key];
  return definition ? jobStandingFor(ruleset, definition, rewards, branch) : new Map();
}

/** 1.4.0-C. The standing a board contract pays its sponsor, as a one-entry map, or empty. */
function boardStanding(ruleset: Ruleset, definition: QuestDefinition | undefined, rewardState: unknown): Map<FactionKey, number> {
  const sponsor = contractSponsor(ruleset, definition, rewardState);
  const amount = definition ? contractStanding(ruleset, contractBoard(definition)) : 0;
  return sponsor && amount > 0 ? new Map([[sponsor, amount]]) : new Map();
}

/** A faction standing reward is shown and paid as standing, not as an ordinary reward. */
function visibleRewards<T extends { kind: string }>(rewards: readonly T[]): T[] {
  return rewards.filter((reward) => reward.kind !== 'FACTION_STANDING');
}

/** The tier a faction Job needs, or null when it needs none. */
function factionJobTier(definition: QuestDefinition | undefined): FactionTier | null {
  const prerequisite = definition?.prerequisites.find((row) => row.kind === 'FACTION_STANDING_AT_LEAST');
  const tier = prerequisite?.params?.tier;
  return typeof tier === 'string' && (FACTION_TIERS as readonly string[]).includes(tier) ? tier as FactionTier : null;
}

function standingLabel(amount: number, factionName: string): string {
  return `+${amount} ${factionName} standing`;
}

/** 1.4.0-E. What a player brings to a Job card: their standing points and net worth. */
interface QuestContext {
  points: Partial<Record<FactionKey, number>>;
  netWorthCents: bigint;
  /** 1.5.0-E2. For a locked card's "Opens after" list. */
  completed?: ReadonlySet<string>;
  reps?: Readonly<Record<string, number>>;
}

/**
 * 1.5.0-E2. What a locked Job still waits for, in player words, with the earlier Job to link to
 * where there is one. Met requirements are left out; faction tiers are named as they stand.
 */
function questRequirements(ruleset: Ruleset, definition: QuestDefinition | undefined, context: QuestContext): QuestRequirementDto[] {
  if (!definition) return [];
  return definition.prerequisites.flatMap((prerequisite): QuestRequirementDto[] => {
    const params = prerequisite.params ?? {};
    if (prerequisite.kind === 'QUEST_COMPLETED' && typeof params.questKey === 'string') {
      if (context.completed?.has(params.questKey)) return [];
      const earlier = ruleset.questDefinitions?.[params.questKey];
      const giver = contactFor(ruleset, earlier?.contactKey);
      return [{ label: `Finish “${earlier?.title ?? params.questKey}”${giver ? ` for ${giver.shortName}` : ''}`, questKey: params.questKey }];
    }
    if (prerequisite.kind === 'CONTACT_REP_AT_LEAST' && typeof params.contactKey === 'string' && typeof params.points === 'number') {
      const have = context.reps?.[params.contactKey] ?? 0;
      if (have >= params.points) return [];
      return [{ label: `${params.points} rep with ${contactFor(ruleset, params.contactKey)?.shortName ?? params.contactKey} (you have ${have})` }];
    }
    if ((prerequisite.kind === 'FACTION_STANDING_AT_LEAST' || prerequisite.kind === 'FACTION_STANDING_BELOW') && typeof params.factionKey === 'string' && typeof params.tier === 'string') {
      const faction = ruleset.factions?.[params.factionKey as FactionKey]?.name ?? params.factionKey;
      const tier = factionTierName(params.tier as FactionTier);
      return [{ label: prerequisite.kind === 'FACTION_STANDING_AT_LEAST' ? `${tier} with ${faction}` : `Below ${tier} with ${faction}` }];
    }
    if (prerequisite.kind === 'BRANCH_CHOSEN' && typeof params.questKey === 'string') {
      const earlier = ruleset.questDefinitions?.[params.questKey];
      return [{ label: `Pick this side in “${earlier?.title ?? params.questKey}”`, questKey: params.questKey }];
    }
    return [];
  });
}

/**
 * 1.4.0-E. The standing an introduction pays: whatever brings the player up to Known with the
 * faction it introduces, or nothing once they are there.
 */
function introductionStanding(ruleset: Ruleset, definition: QuestDefinition | undefined, points: Partial<Record<FactionKey, number>>): Map<FactionKey, number> {
  const rules = ruleset.factionStanding;
  if (!definition?.introduces || !rules || !ruleset.factions?.[definition.introduces]) return new Map();
  const amount = factionTierStartsAt('KNOWN', rules) - (points[definition.introduces] ?? 0);
  return amount > 0 ? new Map([[definition.introduces, amount]]) : new Map();
}

/** 1.4.0-E. A Job's fee at a net worth, in cents, or 0 for a Job with none. */
function questFeeCents(definition: QuestDefinition | undefined, netWorthCents: bigint): bigint {
  return definition?.fee ? lawPriceCents(netWorthCents, definition.fee) : 0n;
}

function questDto(row: QuestRow, ruleset: Ruleset, context: QuestContext, communityEvent?: CommunityEventSnapshot): PlayerQuestDto {
  const contact = contactFor(ruleset, row.questDefinition.contactKey);
  const cityState = cityContractState(row.rewardState);
  const allianceContribution = allianceContractContributionSnapshot(
    row.questDefinition.availability,
    row.rewardState,
  );
  const resolvedRewards = cityContractRewards(row.rewardState)
    ?? rewards(row.questDefinition.rewards);
  const availability = availabilityJson(row.questDefinition.availability);
  const story = storyDto(row, ruleset);
  return {
    key: row.questDefinition.key,
    attempt: row.attempt,
    title: cityState?.title ?? row.questDefinition.title,
    description: cityState?.description ?? row.questDefinition.description,
    contactKey: row.questDefinition.contactKey,
    contactName: contact?.shortName ?? null,
    ...(row.status === 'LOCKED' ? { requires: questRequirements(ruleset, ruleset.questDefinitions?.[row.questDefinition.key], context) } : {}),
    ...(() => {
      const definition = ruleset.questDefinitions?.[row.questDefinition.key];
      // A board contract names its sponsor (1.4.0-C); a Job, the faction it works for.
      const factionKey = definition && contractBoard(definition) && ruleset.contractSponsors
        ? contractSponsor(ruleset, definition, row.rewardState)
        : definition ? jobFaction(ruleset, definition) : contact?.factionKey;
      const faction = factionKey ? ruleset.factions?.[factionKey] : undefined;
      return { factionKey: faction?.key ?? null, factionName: faction?.name ?? null };
    })(),
    factionJob: ruleset.questDefinitions?.[row.questDefinition.key]?.category === 'FACTION',
    factionStandings: [
      ...jobStanding(ruleset, row.questDefinition.key, rewards(row.questDefinition.rewards)),
      ...boardStanding(ruleset, ruleset.questDefinitions?.[row.questDefinition.key], row.rewardState),
      ...introductionStanding(ruleset, ruleset.questDefinitions?.[row.questDefinition.key], context.points),
    ].flatMap(([factionKey, amount]) => {
      const name = ruleset.factions?.[factionKey]?.name;
      if (!name) return [];
      // 1.4.0-E: say what collecting it would set off, before it does.
      const preview = row.status === 'COMPLETED' ? { locks: [], lockedBy: null } : innerCirclePreview(ruleset, context.points, factionKey, amount);
      const rivalName = (key: FactionKey) => ruleset.factions?.[key]?.name ?? key;
      return [{
        factionKey, factionName: name, amount, label: standingLabel(amount, name),
        ...(preview.locks.length ? { locks: preview.locks.map(rivalName) } : {}),
        ...(preview.lockedBy ? { heldShortBy: rivalName(preview.lockedBy) } : {}),
      }];
    }),
    ...(() => {
      const definition = ruleset.questDefinitions?.[row.questDefinition.key];
      const introduced = definition?.introduces ? ruleset.factions?.[definition.introduces] : undefined;
      const fee = questFeeCents(definition, context.netWorthCents);
      return {
        ...(fee > 0n ? { feeCents: Number(fee) } : {}),
        ...(introduced ? { introduces: { factionKey: introduced.key, factionName: introduced.name } } : {}),
      };
    })(),
    type: row.questDefinition.type,
    category: row.questDefinition.category,
    difficulty: row.questDefinition.difficulty,
    status: row.status,
    isTracked: row.isTracked,
    chosenBranch: row.chosenBranch,
    branchChoices: branchChoicesDto(row, ruleset),
    ...(story ? { story } : {}),
    objectives: objectiveDtos(row, communityEvent),
    rewards: visibleRewards(resolvedRewards).map((reward) => rewardDto(reward, ruleset)),
    ...(availability.seasonalEvent ? {
      seasonalEvent: {
        eventKey: availability.seasonalEvent.eventKey,
        label: typeof availability.eventLabel === 'string'
          ? availability.eventLabel
          : null,
        startsAt: availability.seasonalEvent.startsAt,
        endsAt: availability.seasonalEvent.endsAt,
      },
    } : {}),
    ...(communityEvent ? {
      communityEvent: {
        startsAt: communityEvent.state.windowStart,
        endsAt: communityEvent.state.windowEnd,
        contributionCurrent: communityEvent.contributionCurrent,
        contributionTarget: communityEvent.contributionTarget,
        contributionLabel: communityEvent.contributionLabel,
        contributionFormat: communityEvent.contributionFormat,
        sharedCompleted: communityEvent.sharedCompleted,
      },
    } : {}),
    ...(allianceContribution ? {
      allianceContract: {
        contributionCurrent: allianceContribution.current,
        contributionTarget: allianceContribution.target,
        contributionLabel: allianceContribution.label,
        contributionFormat: allianceContribution.format,
        contributionCompleted: allianceContribution.completed,
      },
    } : {}),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

async function contactPoints(db: Db | PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<Record<string, number>> {
  const keys = Object.keys(ruleset.contacts ?? {});
  if (!keys.length) return {};
  const rows = await db.playerReputation.findMany({
    where: { roundPlayerId, trader: { in: keys } },
    select: { trader: true, points: true },
  });
  return Object.fromEntries(keys.map((key) => [key, rows.find((row) => row.trader === key)?.points ?? 0]));
}

export function questPrerequisitesMet(
  definition: QuestDefinition,
  completed: ReadonlySet<string>,
  reps: Readonly<Record<string, number>>,
  chosenBranches: Readonly<Record<string, string>>,
  factionTiers: Readonly<Partial<Record<string, FactionTier>>> = {},
): boolean {
  return definition.prerequisites.every((prerequisite) => {
    if (prerequisite.kind === 'QUEST_COMPLETED') {
      const key = prerequisite.params?.questKey;
      return typeof key === 'string' && completed.has(key);
    }
    if (prerequisite.kind === 'CONTACT_REP_AT_LEAST') {
      const key = prerequisite.params?.contactKey;
      const points = prerequisite.params?.points;
      return typeof key === 'string' && typeof points === 'number' && (reps[key] ?? 0) >= points;
    }
    if (prerequisite.kind === 'FACTION_STANDING_AT_LEAST') {
      const factionKey = prerequisite.params?.factionKey;
      const tier = prerequisite.params?.tier;
      const reached = typeof factionKey === 'string' ? factionTiers[factionKey] : undefined;
      return reached !== undefined
        && typeof tier === 'string'
        && (FACTION_TIERS as readonly string[]).includes(tier)
        && factionTierRank(reached) >= factionTierRank(tier as FactionTier);
    }
    if (prerequisite.kind === 'FACTION_STANDING_BELOW') {
      // 1.4.0-E. Only where standing exists: a round without it has nothing to be below.
      const factionKey = prerequisite.params?.factionKey;
      const tier = prerequisite.params?.tier;
      const reached = typeof factionKey === 'string' ? factionTiers[factionKey] : undefined;
      return reached !== undefined
        && typeof tier === 'string'
        && (FACTION_TIERS as readonly string[]).includes(tier)
        && factionTierRank(reached) < factionTierRank(tier as FactionTier);
    }
    if (prerequisite.kind === 'BRANCH_CHOSEN') {
      const questKey = prerequisite.params?.questKey;
      const branchKey = prerequisite.params?.branchKey;
      return typeof questKey === 'string'
        && typeof branchKey === 'string'
        && chosenBranches[questKey] === branchKey;
    }
    return false;
  });
}

export async function syncDefinitions(db: Db | PrismaClient, ruleset: Ruleset): Promise<void> {
  for (const definition of definitions(ruleset)) {
    await db.questDefinition.upsert({
      where: {
        rulesetId_rulesetVersion_key: {
          rulesetId: ruleset.meta.id,
          rulesetVersion: ruleset.meta.version,
          key: definition.key,
        },
      },
      create: {
        key: definition.key,
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        title: definition.title,
        description: definition.description,
        contactKey: definition.contactKey,
        type: definition.type,
        category: definition.category,
        difficulty: definition.difficulty,
        prerequisites: inputJson(definition.prerequisites),
        objectives: inputJson(definition.objectives),
        bonusObjectives: inputJson(definition.bonusObjectives),
        rewards: inputJson(definition.rewards),
        followUpKeys: inputJson(definition.followUpKeys),
        availability: inputJson(definition.availability),
        repeatability: definition.repeatability,
        expiresAfterMinutes: definition.expiresAfterMinutes,
      },
      update: {
        title: definition.title,
        description: definition.description,
        contactKey: definition.contactKey,
        type: definition.type,
        category: definition.category,
        difficulty: definition.difficulty,
        prerequisites: inputJson(definition.prerequisites),
        objectives: inputJson(definition.objectives),
        bonusObjectives: inputJson(definition.bonusObjectives),
        rewards: inputJson(definition.rewards),
        followUpKeys: inputJson(definition.followUpKeys),
        availability: inputJson(definition.availability),
        repeatability: definition.repeatability,
        expiresAfterMinutes: definition.expiresAfterMinutes,
      },
    });
  }
}

async function refreshAvailability(db: Db, roundPlayerId: string, ruleset: Ruleset, now = new Date()): Promise<string[]> {
  await db.playerQuest.updateMany({
    where: {
      roundPlayerId,
      status: { in: ['AVAILABLE', 'ACTIVE', 'READY_TO_TURN_IN'] },
      expiresAt: { not: null, lte: now },
    },
    data: { status: 'EXPIRED', isTracked: false },
  });

  const questDefinitions = await db.questDefinition.findMany({
    where: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, isEnabled: true },
  });
  const existing = await db.playerQuest.findMany({
    where: { roundPlayerId, questDefinitionId: { in: questDefinitions.map((definition) => definition.id) } },
    include: { questDefinition: true },
    orderBy: { attempt: 'desc' },
  });
  const completedRows = existing.filter((row) => row.status === 'COMPLETED');
  const completed = new Set(completedRows.map((row) => row.questDefinition.key));
  const chosenBranches = Object.fromEntries(
    completedRows
      .filter((row) => row.chosenBranch)
      .map((row) => [row.questDefinition.key, row.chosenBranch!]),
  );
  const reps = await contactPoints(db, roundPlayerId, ruleset);
  const tiers = await FactionService.tiers(db, roundPlayerId, ruleset);
  const adminTestMode = await seasonalEventAdminTestModeForPlayer(db, roundPlayerId);
  const newlyAvailable: string[] = [];

  for (const definitionRow of questDefinitions) {
    const definition = (ruleset.questDefinitions ?? {})[definitionRow.key];
    if (!definition) continue;
    // Rotating definitions are materialized by their board services so each
    // reset can create a new PlayerQuest.attempt without disturbing ONCE jobs.
    if (
      (definition.type === 'DAILY' && definition.repeatability === 'DAILY')
      || (definition.type === 'WEEKLY' && definition.repeatability === 'WEEKLY')
      || definition.type === 'SECRET'
      || isDynamicCityContractDefinition(definition)
      || isAllianceContractDefinition(definition)
      || isCommunityEventDefinition(definition)
      || isSeasonContractDefinition(definition)
    ) continue;
    const current = existing.find((row) => row.questDefinitionId === definitionRow.id);
    const seasonalAvailable = seasonalEventAvailable(definition, now, adminTestMode);
    const available = seasonalAvailable && questPrerequisitesMet(definition, completed, reps, chosenBranches, tiers);
    if (!current) {
      await db.playerQuest.create({
        data: {
          roundPlayerId,
          questDefinitionId: definitionRow.id,
          status: available ? 'AVAILABLE' : 'LOCKED',
        },
      });
      if (available) newlyAvailable.push(definition.key);
    } else if (current.status === 'AVAILABLE' && !seasonalAvailable) {
      await db.playerQuest.update({ where: { id: current.id }, data: { status: 'LOCKED', isTracked: false } });
    } else if (current.status === 'LOCKED' && available) {
      await db.playerQuest.update({ where: { id: current.id }, data: { status: 'AVAILABLE' } });
      newlyAvailable.push(definition.key);
    }
  }

  await syncDailyContractAttempts(db, roundPlayerId, ruleset, now);
  await syncWeeklyContractAttempts(db, roundPlayerId, ruleset, now);
  newlyAvailable.push(...await syncCityContractAttempts(db, roundPlayerId, ruleset, now));
  newlyAvailable.push(...await syncSeasonContractAttempts(db, roundPlayerId, ruleset));
  newlyAvailable.push(...await syncAllianceContractAttempts(db, roundPlayerId, ruleset, now));
  await syncCommunityEventAttempts(db, roundPlayerId, ruleset, now);
  await refreshCommunityEventReadinessForPlayer(db, roundPlayerId, ruleset, now);
  newlyAvailable.push(...await syncSecretQuestAttempts(db, roundPlayerId, ruleset));
  await autoAcceptBoardWork(db, roundPlayerId, ruleset, now);
  await syncDerivedTurfProgress(db, roundPlayerId, ruleset, questDefinitions, now);
  return newlyAvailable;
}

/** Move an AVAILABLE job to ACTIVE, the same way whether the player clicked Accept or auto-accept did. */
async function startQuest(db: Db, roundPlayerId: string, row: QuestRow, ruleset: Ruleset, acceptedAt: Date, track: boolean): Promise<void> {
  const preserveOffer = preservesGeneratedOffer(row, ruleset);
  await db.playerQuest.update({
    where: { id: row.id },
    data: {
      status: 'ACTIVE',
      acceptedAt,
      completedAt: null,
      claimedAt: null,
      failedAt: null,
      abandonedAt: null,
      objectiveProgress: {},
      bonusProgress: {},
      rewardState: preserveOffer ? inputJson(row.rewardState) : {},
      expiresAt: preserveOffer
        ? row.expiresAt
        : row.questDefinition.expiresAfterMinutes
          ? new Date(acceptedAt.getTime() + row.questDefinition.expiresAfterMinutes * 60_000)
          : null,
      isTracked: track,
    },
  });
  await QuestProgressService.emit(db, roundPlayerId, {
    sourceKey: `quest-accept:${row.id}:${acceptedAt.getTime()}`,
    type: 'QUEST_ACCEPTED',
    payload: { questKey: row.questDefinition.key },
    at: acceptedAt,
  });
}

/** Rotating board work that auto-accept may start: daily and weekly contracts and the city board. */
function isAutoAcceptBoardWork(definition: QuestDefinition | undefined): boolean {
  if (!definition) return false;
  return (definition.type === 'DAILY' && definition.repeatability === 'DAILY')
    || (definition.type === 'WEEKLY' && definition.repeatability === 'WEEKLY')
    || isDynamicCityContractDefinition(definition);
}

/**
 * Start fresh daily, weekly and city work for players who leave auto-accept on
 * (the default). Community events already start themselves. Auto-started jobs
 * stay off the tracker so they never push out jobs the player pinned, and an
 * attempt the player abandoned is left for them to pick up again by hand.
 */
async function autoAcceptBoardWork(db: Db, roundPlayerId: string, ruleset: Ruleset, now: Date): Promise<void> {
  const player = await db.roundPlayer.findUnique({
    where: { id: roundPlayerId },
    select: { account: { select: { profile: { select: { autoAcceptBoardWork: true } } } } },
  });
  if (player?.account.profile?.autoAcceptBoardWork === false) return;

  const rows = await db.playerQuest.findMany({
    where: {
      roundPlayerId,
      status: 'AVAILABLE',
      abandonedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      questDefinition: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, isEnabled: true },
    },
    include: { questDefinition: true },
    orderBy: [{ createdAt: 'asc' }],
  });
  for (const row of rows) {
    if (!isAutoAcceptBoardWork(ruleset.questDefinitions?.[row.questDefinition.key])) continue;
    await startQuest(db, roundPlayerId, row, ruleset, now, false);
  }
}

async function loadQuest(db: Db, roundPlayerId: string, ruleset: Ruleset, key: string): Promise<QuestRow> {
  const row = await db.playerQuest.findFirst({
    where: {
      roundPlayerId,
      questDefinition: {
        rulesetId: ruleset.meta.id,
        rulesetVersion: ruleset.meta.version,
        key,
        isEnabled: true,
      },
    },
    include: { questDefinition: true },
    orderBy: { attempt: 'desc' },
  });
  if (!row) throw AppError.notFound('QUEST_NOT_FOUND', 'That job is not available in this round.');
  return row;
}

export const HandcraftedQuestService = {
  async sync(prisma: PrismaClient, ruleset: Ruleset): Promise<void> {
    if (!ruleset.questDefinitions) return;
    await syncDefinitions(prisma, ruleset);
  },

  async page(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset): Promise<QuestPageDto> {
    await syncDefinitions(prisma, ruleset);
    return prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      const now = new Date();
      await refreshAvailability(tx, roundPlayerId, ruleset, now);
      const dailyEnabled = definitions(ruleset).some(
        (definition) => definition.type === 'DAILY' && definition.repeatability === 'DAILY',
      );
      const dailyWindow = dailyEnabled ? dailyContractWindow(now, ruleset) : null;
      const weeklyEnabled = definitions(ruleset).some(
        (definition) => definition.type === 'WEEKLY' && definition.repeatability === 'WEEKLY',
      );
      const weeklyWindow = weeklyEnabled ? weeklyContractWindow(now, ruleset) : null;
      const cityEnabled = definitions(ruleset).some(isDynamicCityContractDefinition);
      const cityWindow = cityEnabled ? cityContractWindow(now) : null;
      const seasonEnabled = definitions(ruleset).some(isSeasonContractDefinition);
      const seasonEndsAt = seasonEnabled
        ? (await tx.roundPlayer.findUnique({
            where: { id: roundPlayerId },
            select: { round: { select: { endsAt: true } } },
          }))?.round.endsAt ?? null
        : null;
      const rows = await tx.playerQuest.findMany({
        where: {
          roundPlayerId,
          questDefinition: { rulesetId: ruleset.meta.id, rulesetVersion: ruleset.meta.version, isEnabled: true },
        },
        include: { questDefinition: true },
        orderBy: [{ createdAt: 'asc' }],
      });
      const communitySnapshots = new Map<string, CommunityEventSnapshot>();
      for (const row of rows) {
        if (!isCommunityEventDefinition(ruleset.questDefinitions?.[row.questDefinition.key])) continue;
        const snapshot = await communityEventSnapshot(tx, row);
        if (snapshot) communitySnapshots.set(row.id, snapshot);
      }
      const reps = await contactPoints(tx, roundPlayerId, ruleset);
      const contacts = Object.values(ruleset.contacts ?? {}).map((contact): QuestContactDto => {
        const points = reps[contact.key] ?? 0;
        const tier = contactTier(points);
        const { factionKey, independent, ...identity } = contact;
        const faction = factionKey ? ruleset.factions?.[factionKey] : undefined;
        return {
          ...identity,
          points,
          standing: tier.name,
          nextStandingAt: tier.next,
          faction: faction ? { key: faction.key, name: faction.name } : null,
          independent: independent ?? null,
        };
      });
      const standings = await FactionService.standings(tx, roundPlayerId, ruleset);
      // 1.4.0-E: standing and net worth, for each card's Inner Circle preview and fee.
      const questContext: QuestContext = {
        points: await FactionService.points(tx, roundPlayerId),
        netWorthCents: (await tx.roundPlayer.findUniqueOrThrow({ where: { id: roundPlayerId }, select: { netWorthCents: true } })).netWorthCents,
        completed: new Set(rows.filter((row) => row.status === 'COMPLETED').map((row) => row.questDefinition.key)),
        reps,
      };
      // 1.4.0-D: what standing opens with each faction, and what it says right now.
      const perks = await FactionPerkService.perks(tx, roundPlayerId, ruleset);
      const factions = ruleset.factions ? Object.values(ruleset.factions).flatMap((faction) => faction ? [{
        key: faction.key,
        name: faction.name,
        shortName: faction.shortName,
        identity: faction.identity,
        lane: faction.lane,
        description: faction.description,
        rivals: faction.rivals.map((rival) => ({ key: rival, name: ruleset.factions?.[rival]?.name ?? rival })),
        faces: Object.values(ruleset.contacts ?? {}).flatMap((contact) => contact?.factionKey === faction.key ? [{ key: contact.key, name: contact.shortName }] : []),
        facesNote: faction.facesNote ?? null,
        standing: standings.get(faction.key) ?? null,
        jobs: Object.values(ruleset.questDefinitions ?? {}).flatMap((definition) => {
          if (definition.category !== 'FACTION' || jobFaction(ruleset, definition) !== faction.key) return [];
          const tier = factionJobTier(definition);
          const row = rows.find((candidate) => candidate.questDefinition.key === definition.key);
          return [{ key: definition.key, title: definition.title, tierName: tier ? factionTierName(tier) : null, status: row?.status ?? 'LOCKED' }];
        }),
        ...(ruleset.factionPerks ? { perks: perks.get(faction.key) ?? null } : {}),
        ...(ruleset.factionRivalry?.innerCircleLock ? (() => {
          const lockedBy = innerCircleLockedBy(ruleset, questContext.points, faction.key);
          const reached = (questContext.points[faction.key] ?? 0) >= (ruleset.factionStanding?.tiers.innerCircle ?? Infinity);
          const introduction = Object.values(ruleset.questDefinitions ?? {}).find((definition) => definition.introduces === faction.key);
          const introRow = introduction ? rows.find((candidate) => candidate.questDefinition.key === introduction.key) : undefined;
          const below = (questContext.points[faction.key] ?? 0) < (ruleset.factionStanding?.tiers.known ?? 0);
          return {
            innerCircle: {
              lockedBy: lockedBy ? { key: lockedBy, name: ruleset.factions?.[lockedBy]?.name ?? lockedBy } : null,
              wouldLock: lockedBy || reached ? [] : faction.rivals
                .filter((rival) => (questContext.points[rival] ?? 0) < (ruleset.factionStanding?.tiers.innerCircle ?? Infinity))
                .map((rival) => ({ key: rival, name: ruleset.factions?.[rival]?.name ?? rival })),
              introduction: introduction && (below || introRow?.status === 'COMPLETED')
                ? { key: introduction.key, title: introduction.title, status: introRow?.status ?? 'LOCKED' }
                : null,
            },
          };
        })() : {}),
      }] : []) : null;
      const unlockRows = await tx.playerUnlock.findMany({
        where: { roundPlayerId },
        orderBy: { awardedAt: 'asc' },
      });
      const permanentUnlocks = unlockRows.flatMap((row) => {
        const definition = ruleset.permanentUnlocks?.[row.key];
        if (!definition) return [];
        return [{
          key: row.key,
          name: definition.name,
          description: definition.description,
          category: definition.category,
          sourceQuestKey: row.sourceQuestKey,
          awardedAt: row.awardedAt.toISOString(),
        }];
      });
      const favors = (await FavorInventoryService.list(tx, roundPlayerId, ruleset)).map((entry) => ({
        key: entry.key,
        name: entry.definition.name,
        description: entry.definition.description,
        contactKey: entry.definition.contactKey,
        rarity: entry.definition.rarity ?? 'COMMON',
        activationKind: entry.definition.activation.kind,
        activatable: Boolean(entry.definition.effect),
        category: entry.definition.activation.category,
        durationMinutes: entry.definition.activation.kind === 'TIMED'
          ? entry.definition.activation.durationMinutes
          : null,
        quantity: entry.quantity,
        totalGranted: entry.totalGranted,
        lastSourceQuestKey: entry.lastSourceQuestKey,
      }));
      const activeFavors = await TimedFavorService.listActive(tx, roundPlayerId, ruleset, now);
      const armedFavors = await SingleUseFavorService.listArmed(tx, roundPlayerId, ruleset);
      const owner = await tx.roundPlayer.findUnique({
        where: { id: roundPlayerId },
        select: { account: { select: { profile: { select: { autoAcceptBoardWork: true } } } } },
      });
      return {
        // Sample immediately before the response object is built so browser clock
        // skew cannot decide when an active favor expires.
        serverTime: new Date().toISOString(),
        dailyContracts: {
          enabled: dailyEnabled,
          slots: dailyEnabled ? DAILY_CONTRACT_SLOTS : 0,
          resetAt: dailyWindow?.endsAt.toISOString() ?? null,
        },
        weeklyContracts: {
          enabled: weeklyEnabled,
          slots: weeklyEnabled ? WEEKLY_CONTRACT_SLOTS : 0,
          resetAt: weeklyWindow?.endsAt.toISOString() ?? null,
        },
        cityContracts: {
          enabled: cityEnabled,
          slots: cityEnabled ? cityContractSlots(ruleset) : 0,
          resetAt: cityWindow?.endsAt.toISOString() ?? null,
        },
        seasonContracts: {
          enabled: seasonEnabled,
          slots: seasonEnabled ? SEASON_CONTRACT_SLOTS : 0,
          resetAt: seasonEndsAt?.toISOString() ?? null,
        },
        trackedLimit: TRACKED_LIMIT,
        autoAccept: owner?.account.profile?.autoAcceptBoardWork ?? true,
        counts: {
          available: rows.filter((row) => row.status === 'AVAILABLE').length,
          active: rows.filter((row) =>
            !BOARD_QUEST_TYPES.includes(row.questDefinition.type as typeof BOARD_QUEST_TYPES[number])
            && ['ACTIVE', 'READY_TO_TURN_IN'].includes(row.status)
          ).length,
          ready: rows.filter((row) => row.status === 'READY_TO_TURN_IN').length,
          completed: rows.filter((row) => row.status === 'COMPLETED').length,
        },
        contacts,
        factions,
        permanentUnlocks,
        activeFavors,
        armedFavors,
        favors,
        quests: rows.map((row) => questDto(row, ruleset, questContext, communitySnapshots.get(row.id))),
      };
    });
  },

  async accept(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, key: string): Promise<QuestPageDto> {
    await syncDefinitions(prisma, ruleset);
    const allianceContract = isAllianceContractDefinition(ruleset.questDefinitions?.[key]);
    const expectedAllianceId = allianceContract
      ? (await prisma.roundPlayer.findUnique({
          where: { id: roundPlayerId },
          select: { allianceId: true },
        }))?.allianceId ?? null
      : null;
    if (allianceContract && !expectedAllianceId) {
      throw AppError.conflict('ALLIANCE_REQUIRED', 'Join an alliance before starting an alliance contract.');
    }

    await prisma.$transaction(async (tx) => {
      if (allianceContract) {
        await lockAllianceContractActor(tx, roundPlayerId, expectedAllianceId!);
      } else {
        await lockRoundPlayer(tx, roundPlayerId);
      }
      await refreshAvailability(tx, roundPlayerId, ruleset);
      const row = await loadQuest(tx, roundPlayerId, ruleset, key);
      if (row.status === 'ACTIVE' || row.status === 'READY_TO_TURN_IN') return;
      if (row.status !== 'AVAILABLE') throw AppError.conflict('QUEST_NOT_AVAILABLE', 'That job is not available yet.');
      const tracked = await tx.playerQuest.count({ where: { roundPlayerId, isTracked: true } });
      const acceptedAt = new Date();
      if (row.expiresAt && row.expiresAt.getTime() <= acceptedAt.getTime()) {
        throw AppError.conflict('QUEST_EXPIRED', 'That contract expired at reset. Refresh the board for new work.');
      }
      const definition = (ruleset.questDefinitions ?? {})[row.questDefinition.key];
      const adminTestMode = await seasonalEventAdminTestModeForPlayer(tx, roundPlayerId);
      if (definition && !seasonalEventAvailable(definition, acceptedAt, adminTestMode)) {
        throw AppError.conflict('QUEST_EVENT_CLOSED', 'That seasonal event is no longer active. Refresh the board for current event work.');
      }
      if (allianceContract) {
        await acceptAllianceContract(tx, roundPlayerId, ruleset, key, acceptedAt, tracked < TRACKED_LIMIT);
        return;
      }
      await startQuest(tx, roundPlayerId, row, ruleset, acceptedAt, tracked < TRACKED_LIMIT);
    });
    return this.page(prisma, roundPlayerId, ruleset);
  },

  /** Account-wide, so the choice carries into the next season. Turning it on starts waiting board work right away. */
  async setAutoAccept(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, enabled: boolean): Promise<QuestPageDto> {
    const player = await prisma.roundPlayer.findUnique({ where: { id: roundPlayerId }, select: { accountId: true } });
    if (!player) throw AppError.notFound('PLAYER_NOT_FOUND', 'You are not in this round.');
    await prisma.accountProfile.upsert({
      where: { accountId: player.accountId },
      create: { accountId: player.accountId, autoAcceptBoardWork: enabled },
      update: { autoAcceptBoardWork: enabled },
    });
    return this.page(prisma, roundPlayerId, ruleset);
  },

  async abandon(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, key: string): Promise<QuestPageDto> {
    await syncDefinitions(prisma, ruleset);
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      await refreshAvailability(tx, roundPlayerId, ruleset);
      const row = await loadQuest(tx, roundPlayerId, ruleset, key);
      if (!['ACTIVE', 'READY_TO_TURN_IN'].includes(row.status)) throw AppError.conflict('QUEST_NOT_ACTIVE', 'That job is not active.');
      if (isAllianceContractDefinition(ruleset.questDefinitions?.[row.questDefinition.key])) {
        throw AppError.conflict(
          'ALLIANCE_CONTRACT_SHARED',
          'Alliance contracts cannot be abandoned individually after the shared roster starts.',
        );
      }
      if (isCommunityEventDefinition(ruleset.questDefinitions?.[row.questDefinition.key])) {
        throw AppError.conflict(
          'COMMUNITY_EVENT_AUTOMATIC',
          'Community events run automatically and cannot be abandoned.',
        );
      }
      await tx.questProgressReceipt.deleteMany({ where: { playerQuestId: row.id } });
      const preserveOffer = preservesGeneratedOffer(row, ruleset);
      await tx.playerQuest.update({
        where: { id: row.id },
        data: {
          status: 'AVAILABLE',
          isTracked: false,
          acceptedAt: null,
          abandonedAt: new Date(),
          completedAt: null,
          expiresAt: preserveOffer ? row.expiresAt : null,
          objectiveProgress: {},
          bonusProgress: {},
          rewardState: preserveOffer ? inputJson(row.rewardState) : {},
        },
      });
    });
    return this.page(prisma, roundPlayerId, ruleset);
  },

  async track(prisma: PrismaClient, roundPlayerId: string, ruleset: Ruleset, key: string, tracked: boolean): Promise<QuestPageDto> {
    await syncDefinitions(prisma, ruleset);
    await prisma.$transaction(async (tx) => {
      await lockRoundPlayer(tx, roundPlayerId);
      await refreshAvailability(tx, roundPlayerId, ruleset);
      const row = await loadQuest(tx, roundPlayerId, ruleset, key);
      if (!['ACTIVE', 'READY_TO_TURN_IN'].includes(row.status)) throw AppError.conflict('QUEST_NOT_ACTIVE', 'Only active jobs can be tracked.');
      if (tracked && !row.isTracked) {
        const count = await tx.playerQuest.count({ where: { roundPlayerId, isTracked: true } });
        if (count >= TRACKED_LIMIT) throw AppError.conflict('QUEST_TRACK_LIMIT', `You can only track ${TRACKED_LIMIT} jobs at once.`);
      }
      await tx.playerQuest.update({ where: { id: row.id }, data: { isTracked: tracked } });
    });
    return this.page(prisma, roundPlayerId, ruleset);
  },

  async claim(
    prisma: PrismaClient,
    roundPlayerId: string,
    ruleset: Ruleset,
    key: string,
    input: QuestClaimInput,
  ): Promise<GameActionResult<QuestClaimResult>> {
    await syncDefinitions(prisma, ruleset);
    return ActionService.run<QuestClaimResult>(prisma, roundPlayerId, {
      action: 'QUEST_CLAIM',
      actionId: input.actionId,
      idempotencyScope: `QUEST_CLAIM:${key}`,
      execute: async ({ tx, current, now, player }) => {
        const communityEvent = isCommunityEventDefinition(ruleset.questDefinitions?.[key]);
        if (communityEvent) {
          await syncCommunityEventAttempts(tx, roundPlayerId, ruleset, now);
          await refreshCommunityEventReadinessForPlayer(tx, roundPlayerId, ruleset, now);
        }
        const row = await loadQuest(tx, roundPlayerId, ruleset, key);
        if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) {
          throw AppError.conflict('QUEST_EXPIRED', 'That contract expired at reset. Refresh the board for new work.');
        }
        if (row.status !== 'READY_TO_TURN_IN') throw AppError.conflict('QUEST_NOT_READY', 'Finish the job before collecting payment.');

        const rulesetDefinition = ruleset.questDefinitions?.[row.questDefinition.key];
        if (!rulesetDefinition) {
          throw AppError.conflict('QUEST_DEFINITION_MISSING', 'That job is not available in this ruleset.');
        }
        if (isAllianceContractDefinition(rulesetDefinition)) {
          await assertAllianceContractClaim(
            tx,
            roundPlayerId,
            row.rewardState,
            rulesetDefinition.availability,
          );
        }
        if (communityEvent) {
          await assertCommunityEventClaim(tx, row);
        }
        const selectedBranch = resolveQuestBranchForClaim(
          rulesetDefinition,
          input.branchKey,
          row.chosenBranch,
        );

        const next: PlayerState = { ...current };
        const reputationChanges = selectedBranch?.reputationDeltas.map((delta) =>
          branchReputationDto(delta.contactKey, delta.amount, ruleset)
        ) ?? [];
        for (const delta of selectedBranch?.reputationDeltas ?? []) {
          if (!ruleset.contacts?.[delta.contactKey]) {
            throw AppError.conflict('QUEST_BRANCH_INVALID', 'That branch has an invalid contact consequence.');
          }
          await addContactRep(tx, roundPlayerId, delta.contactKey, delta.amount);
        }

        // 1.4.0-E: an introduction brings the player up to Known; its fee is only taken when it
        // still has something to give, and a claim the player cannot pay for is refused.
        const introduction = introductionStanding(ruleset, rulesetDefinition, rulesetDefinition.introduces ? await FactionService.points(tx, roundPlayerId) : {});
        const feeCents = rulesetDefinition.introduces && !introduction.size ? 0n : questFeeCents(rulesetDefinition, player.netWorthCents);
        if (feeCents > 0n && current.cashCents < feeCents) {
          throw AppError.conflict('QUEST_FEE', `${contactFor(ruleset, row.questDefinition.contactKey)?.shortName ?? 'They'} want $${(Number(feeCents) / 100).toLocaleString('en-US')} up front, and you are short.`);
        }
        next.cashCents -= feeCents;

        const questRewards = [
          ...(cityContractRewards(row.rewardState) ?? rewards(row.questDefinition.rewards)),
          ...(selectedBranch?.rewards ?? []),
        ];
        await grantRewards({ tx, roundPlayerId, accountId: player.accountId, ruleset, now, sourceKey: key }, next, questRewards);
        // 1.4.0-B: a one-time Job also pays standing to the factions it helps, and no others.
        const standingChanges: QuestClaimResult['standingChanges'] = [];
        // 1.4.0-C: a board contract pays its sponsor instead.
        for (const [factionKey, amount] of [...jobStanding(ruleset, key, questRewards, selectedBranch), ...boardStanding(ruleset, rulesetDefinition, row.rewardState), ...introduction]) {
          const source = rulesetDefinition.introduces ? 'INTRODUCTION' : contractBoard(rulesetDefinition) ? 'CONTRACT' : 'JOB';
          const change = await FactionService.grant(tx, roundPlayerId, ruleset, factionKey, amount, source, `job:${row.id}:${factionKey}`, now);
          if (change) {
            const paid = change.after - change.before;
            const rivalName = (rival: FactionKey) => ruleset.factions?.[rival]?.name ?? rival;
            standingChanges.push({
              factionKey, factionName: change.factionName, amount: paid, tierName: factionTierName(change.tier), tierUp: change.tierUp, label: standingLabel(paid, change.factionName),
              ...(change.locked.length ? { locked: change.locked.map(rivalName) } : {}),
              ...(change.heldShortBy ? { heldShortBy: rivalName(change.heldShortBy) } : {}),
            });
          }
        }
        await StreetPassCredService.creditQuest(
          tx,
          roundPlayerId,
          ruleset,
          (rulesetDefinition?.type ?? row.questDefinition.type) as QuestType,
          `quest:${row.id}:${now.toISOString()}`,
          now,
        );

        await tx.playerQuest.update({
          where: { id: row.id },
          data: {
            status: 'COMPLETED',
            claimedAt: now,
            isTracked: false,
            chosenBranch: selectedBranch?.key ?? row.chosenBranch,
          },
        });
        const newlyAvailable = await refreshAvailability(tx, roundPlayerId, ruleset, now);
        const dtoRewards = visibleRewards(questRewards).map((reward) => rewardDto(reward, ruleset));

        return {
          next,
          result: {
            questKey: key,
            title: cityContractState(row.rewardState)?.title ?? row.questDefinition.title,
            chosenBranch: selectedBranch?.key ?? row.chosenBranch,
            rewards: dtoRewards,
            reputationChanges,
            newlyAvailable,
            standingChanges,
            ...(feeCents > 0n ? { feeCents: Number(feeCents) } : {}),
          },
          // The fee is its own ledger line; whatever else the claim paid keeps the usual one.
          ...(feeCents > 0n ? { ledger: [
            { source: 'QUEST_FEE', label: `${row.questDefinition.title} · fee`, amountCents: -feeCents },
            ...EconomyLedgerService.defaultForAction('QUEST_CLAIM', current.cashCents - feeCents, next.cashCents),
          ] } : {}),
          activity: {
            type: 'QUEST_CLAIMED',
            payload: inputJson({
              questKey: key,
              title: cityContractState(row.rewardState)?.title ?? row.questDefinition.title,
              contactKey: row.questDefinition.contactKey,
              chosenBranch: selectedBranch?.key ?? row.chosenBranch,
              rewards: dtoRewards.map((reward) => reward.label),
              reputationChanges: reputationChanges.map((change) => change.label),
              standingChanges: standingChanges.map((change) => change.label),
              ...(standingChanges.some((change) => change.locked?.length) ? { lockedRivals: standingChanges.flatMap((change) => change.locked ?? []) } : {}),
              ...(feeCents > 0n ? { feeCents: Number(feeCents) } : {}),
              newlyAvailable,
            }),
          },
        };
      },
    });
  },
};
