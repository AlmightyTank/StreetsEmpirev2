import type { Ruleset } from '@streets/rulesets';
import { runBusinessSimulation } from './business.js';

export const BUSINESS_RELEASE_ROUND_DAYS = 28;

export type BusinessReleaseStrategyKey = 'BUSINESS_HEAVY' | 'TURF_RAIDER' | 'RUNNER' | 'MIXED';

export interface BusinessReleaseSummary {
  readonly key: BusinessReleaseStrategyKey;
  readonly name: string;
  readonly businessValueCents: number;
  readonly otherPlayValueCents: number;
  readonly investmentCents: number;
  readonly endValueCents: number;
  readonly activeRacketsAtSweep: number;
  readonly frontOnlyCrackdownHeat: number;
  readonly requestedCrackdownHeat: number;
  readonly shutsRacketsForSweep: boolean;
}

interface Scenario {
  readonly key: BusinessReleaseStrategyKey;
  readonly name: string;
  readonly businessShare: number;
  readonly otherPlayShare: number;
  readonly racketShare: number;
  readonly awayShare: number;
  readonly stabilityShare: number;
  readonly buildStartsDay: number;
  readonly rampDays: number;
  readonly heldBlocks: number;
  readonly shutsRacketsForSweep: boolean;
}

const SCENARIOS: readonly Scenario[] = [
  { key: 'BUSINESS_HEAVY', name: 'Business-heavy', businessShare: 1, otherPlayShare: 0.10, racketShare: 1, awayShare: 0, stabilityShare: 1, buildStartsDay: 1, rampDays: 7, heldBlocks: 2, shutsRacketsForSweep: false },
  { key: 'TURF_RAIDER', name: 'Turf-raider', businessShare: 0.50, otherPlayShare: 0.60, racketShare: 0.50, awayShare: 0, stabilityShare: 0.78, buildStartsDay: 4, rampDays: 10, heldBlocks: 2, shutsRacketsForSweep: false },
  { key: 'RUNNER', name: 'Runner / outpost operator', businessShare: 0.55, otherPlayShare: 0.72, racketShare: 0.35, awayShare: 0.50, stabilityShare: 0.95, buildStartsDay: 4, rampDays: 12, heldBlocks: 2, shutsRacketsForSweep: true },
  { key: 'MIXED', name: 'Mixed', businessShare: 0.67, otherPlayShare: 0.75, racketShare: 0.35, awayShare: 0.25, stabilityShare: 0.90, buildStartsDay: 3, rampDays: 10, heldBlocks: 2, shutsRacketsForSweep: true },
];

function dollars(cents: number): string {
  return '$' + Math.round(cents / 100).toLocaleString('en-US');
}

/**
 * Whole-round release comparison.
 *
 * The static business gate owns exact lot/staff/upkeep/racket formulas. This layer phases a
 * fully-built home cap in over 28 days so the release check compares four play styles in the
 * same unit. Non-business activity uses the late crew's real street-day value as a common
 * opportunity budget; exact road/turf outcomes remain owned by their dedicated QA gates.
 */
export function runBusinessReleaseSimulation(ruleset: Ruleset): BusinessReleaseSummary[] {
  const business = ruleset.business;
  if (!business) return [];

  const crew = runBusinessSimulation(ruleset).at(-1);
  if (!crew) return [];
  const cap = crew.homeCaps.find((row) => row.citySlug === ruleset.round.startingCitySlug) ?? crew.homeCaps[0];
  if (!cap) return [];

  const capDistricts = new Set(cap.districts);
  const capLots = crew.lots.filter((row) => row.block.citySlug === cap.citySlug && capDistricts.has(row.district));
  const fullInvestmentCents = capLots.reduce((sum, row) => sum + row.totalCostCents, 0);
  const crackdown = ruleset.turf?.crackdown;
  const sweepDay = crackdown
    ? BUSINESS_RELEASE_ROUND_DAYS - crackdown.hoursBeforeRoundEnd / 24
    : Number.POSITIVE_INFINITY;
  const warningDay = crackdown
    ? sweepDay - crackdown.warningHours / 24
    : Number.POSITIVE_INFINITY;

  return SCENARIOS.map((scenario) => {
    let businessValueCents = 0;
    let otherPlayValueCents = 0;
    const geographyShare = (1 - scenario.awayShare) + scenario.awayShare * business.awayOutputShare;

    for (let day = 1; day <= BUSINESS_RELEASE_ROUND_DAYS; day += 1) {
      otherPlayValueCents += crew.streetCentsPerDay * scenario.otherPlayShare;
      if (day < scenario.buildStartsDay) continue;

      const maturity = Math.min(1, (day - scenario.buildStartsDay + 1) / scenario.rampDays);
      const racketsPaused = scenario.shutsRacketsForSweep && day >= warningDay && day <= sweepDay;
      businessValueCents += cap.netCentsPerDay
        * scenario.businessShare * maturity * geographyShare * scenario.stabilityShare;
      if (!racketsPaused) {
        businessValueCents += cap.racketCentsPerDay
          * scenario.businessShare * scenario.racketShare * maturity * geographyShare * scenario.stabilityShare;
      }
    }

    const investmentCents = fullInvestmentCents * scenario.businessShare;
    const activeRacketsAtSweep = scenario.shutsRacketsForSweep
      ? 0
      : Math.max(0, Math.round(capLots.length * scenario.businessShare * scenario.racketShare));
    const frontOnlyCrackdownHeat = (crackdown?.heatPerHeldBlock ?? 0) * scenario.heldBlocks;
    const requestedCrackdownHeat = frontOnlyCrackdownHeat
      + (business.crackdown?.activeRacketHeatPerBusiness ?? 0) * activeRacketsAtSweep;

    return {
      key: scenario.key,
      name: scenario.name,
      businessValueCents: Math.round(businessValueCents),
      otherPlayValueCents: Math.round(otherPlayValueCents),
      investmentCents: Math.round(investmentCents),
      endValueCents: Math.round(ruleset.round.startingPlayer.cashCents + businessValueCents + otherPlayValueCents - investmentCents),
      activeRacketsAtSweep,
      frontOnlyCrackdownHeat,
      requestedCrackdownHeat,
      shutsRacketsForSweep: scenario.shutsRacketsForSweep,
    };
  });
}

export function businessReleaseGate(ruleset: Ruleset, rows: readonly BusinessReleaseSummary[]): string[] {
  if (rows.length !== SCENARIOS.length) {
    return [`Release simulation returned ${rows.length} profiles; expected ${SCENARIOS.length}.`];
  }

  const businessHeavy = rows.find((row) => row.key === 'BUSINESS_HEAVY');
  const mixed = rows.find((row) => row.key === 'MIXED');
  if (!businessHeavy || !mixed) return ['Release simulation is missing business-heavy or mixed play.'];

  const problems: string[] = [];
  if (mixed.endValueCents <= businessHeavy.endValueCents) {
    problems.push(`Mixed play ends at ${dollars(mixed.endValueCents)}, not above business-heavy play at ${dollars(businessHeavy.endValueCents)}.`);
  }
  if ((ruleset.business?.crackdown?.activeRacketHeatPerBusiness ?? 0) <= 0) {
    problems.push('The F release ruleset does not add Federal Heat for an active racket.');
  }
  if (businessHeavy.activeRacketsAtSweep > 0 && businessHeavy.requestedCrackdownHeat <= businessHeavy.frontOnlyCrackdownHeat) {
    problems.push('Business-heavy play keeps rackets running but gets no extra crackdown pressure.');
  }
  if (mixed.shutsRacketsForSweep && mixed.requestedCrackdownHeat !== mixed.frontOnlyCrackdownHeat) {
    problems.push('A mixed crew that heeds the warning still gets racket-specific crackdown pressure.');
  }
  return problems;
}

export function businessReleaseMarkdown(rows: readonly BusinessReleaseSummary[]): string {
  const lines = [
    '## 1.1.0-F full-round release profiles',
    '',
    `Deterministic ${BUSINESS_RELEASE_ROUND_DAYS}-day comparison. Business values use the pinned lot/staff/upkeep/racket formulas; other play is expressed in the same late-crew street-day opportunity unit.`,
    '',
    '| Plan | Business value | Other play | Build spend | Rackets at sweep | Fed Heat requested | End value |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.name} | ${dollars(row.businessValueCents)} | ${dollars(row.otherPlayValueCents)} | ${dollars(row.investmentCents)} | ${row.activeRacketsAtSweep} | ${row.requestedCrackdownHeat} | ${dollars(row.endValueCents)} |`);
  }
  return lines.join('\n') + '\n';
}
