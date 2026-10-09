import type { CaseSourceDto, WantedStageDto } from '@streets/shared';

/** 1.3.0-A. How each Wanted stage reads to the player. */
const STAGE_NAMES: Record<WantedStageDto, string> = {
  QUIET: 'Quiet',
  NOTICED: 'Noticed',
  INVESTIGATION: 'Under Investigation',
  WARRANT: 'Warrant',
  FEDERAL: 'Federal',
};

/** What each stage means, in one line. Nothing reads the Case yet in 1.3.0-A. */
const STAGE_BLURBS: Record<WantedStageDto, string> = {
  QUIET: 'Nothing on file.',
  NOTICED: 'A file exists. Nothing comes of it yet.',
  INVESTIGATION: 'Detectives are working the case.',
  WARRANT: 'Enough for a warrant once the courts start signing them.',
  FEDERAL: 'The Feds have taken an interest.',
};

const SOURCE_NAMES: Record<CaseSourceDto, string> = {
  SCOUT: 'Scout',
  PRODUCE: 'Produce',
  RUN_SALE: 'Run sale',
  COMBAT: 'Fight supply',
  CONVOY: 'Convoy tail',
  TORCH: 'Torched a business',
  SACK: 'Sacked a block',
  RACKETS: 'Rackets',
  CRACKDOWN: 'Federal sweep',
  BUST: 'Busted',
  ARREST: 'Arrested',
  ROAD_STOP: 'Pulled over on a run',
  HIJACK: 'Hit a run',
  CURRENCY_REPORT: 'Currency report',
  LAUNDERING: 'Laundering',
  COOLING: 'Cooled off',
  WARRANT: 'Warrant served',
  LAWYER: 'Lawyered up',
  QUASH: 'Warrant quashed',
  STING: 'Internal Affairs sting',
  FEDERAL: 'Federal case moved',
  ADMIN: 'Corrected by staff',
  SEIZURE: 'Lane load searched',
};

const OFFICIAL_TITLES: Record<string, string> = {
  CAPTAIN: 'Precinct Captain',
  DA: 'District Attorney',
  JUDGE: 'Judge',
  CUSTOMS: 'Customs Officer',
};

const OFFICIAL_HELP: Record<string, string> = {
  CAPTAIN: 'Can give you more time to respond when trouble reaches the courts.',
  DA: 'Can slow an investigation and help with a city warrant.',
  JUDGE: 'Can soften the penalties from a served warrant.',
  CUSTOMS: 'Can reduce attention on departures from the city.',
};

export function officialTitle(role: string): string {
  return OFFICIAL_TITLES[role] ?? role;
}

export function officialHelp(role: string): string {
  return OFFICIAL_HELP[role] ?? '';
}

const TARGET_NAMES: Record<string, string> = {
  HIDEOUT: 'Hideout raid',
  BUSINESS: 'Business raid',
  PERSONAL: 'Personal warrant',
};

/** "Hideout raid", "Business raid", "Personal warrant". */
export function warrantTargetName(target: string): string {
  return TARGET_NAMES[target] ?? target;
}

export function wantedStageName(stage: string): string {
  return STAGE_NAMES[stage as WantedStageDto] ?? stage;
}

export function wantedStageBlurb(stage: WantedStageDto): string {
  return STAGE_BLURBS[stage];
}

export function caseSourceName(source: string): string {
  return SOURCE_NAMES[source as CaseSourceDto] ?? source;
}

/** Meter tone for a stage: calm, watch it, or serious. */
export function wantedStageTone(stage: WantedStageDto): 'good' | 'warn' | 'bad' {
  return stage === 'QUIET' || stage === 'NOTICED' ? 'good' : stage === 'INVESTIGATION' ? 'warn' : 'bad';
}

/** A Case change with its sign: "+4.0", "−1.5". */
export function formatCaseDelta(value: number): string {
  return value < 0 ? `−${formatCase(-value)}` : `+${formatCase(value)}`;
}

/** A Case value to one decimal, the way the panel shows it. */
export function formatCase(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}
