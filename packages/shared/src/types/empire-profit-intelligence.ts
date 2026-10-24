export type ProfitClassification =
  | 'OPERATING_INCOME' | 'OPERATING_COST' | 'FINES_AND_FEES'
  | 'INVENTORY_PURCHASE' | 'ASSET_PURCHASE' | 'INVENTORY_PROCEEDS'
  | 'FINANCING_PROCEEDS' | 'FINANCING_REPAYMENT' | 'FINANCING_COST'
  | 'PLAYER_TRANSFER' | 'INTERNAL_TRANSFER' | 'REWARD' | 'ASSET_RECOVERY'
  | 'REVERSAL' | 'CORRECTION' | 'MIXED' | 'UNKNOWN';

export type ProfitAttributionStatus = 'KNOWN_CITY' | 'UNKNOWN_CITY';

export interface ProfitIntelligenceTotalsDto {
  entryCount: number;
  inflowCents: string;
  outflowCents: string;
  netCents: string;
}

export interface ProfitIntelligenceSourceTotalDto extends ProfitIntelligenceTotalsDto {
  source: string;
  classification: ProfitClassification;
}

export interface ProfitIntelligenceCityTotalDto extends ProfitIntelligenceTotalsDto {
  citySlug: string | null;
  cityName: string | null;
  attribution: ProfitAttributionStatus;
}

export interface ProfitIntelligenceDaySourceCityDto extends ProfitIntelligenceTotalsDto {
  day: string;
  source: string;
  classification: ProfitClassification;
  citySlug: string | null;
  cityName: string | null;
  attribution: ProfitAttributionStatus;
}

export interface ProfitIntelligenceDto {
  classificationVersion: '2.6.0-B1';
  roundId: string;
  generatedAt: string;
  period: { from: string; to: string; days: number };
  totals: ProfitIntelligenceTotalsDto;
  bySource: ProfitIntelligenceSourceTotalDto[];
  byCity: ProfitIntelligenceCityTotalDto[];
  byDaySourceCity: ProfitIntelligenceDaySourceCityDto[];
  reconciliation: {
    ledgerEntryCount: number;
    projectedEntryCount: number;
    ledgerNetCents: string;
    projectedNetCents: string;
    varianceCents: string;
    matches: boolean;
  };
  dataQuality: { unknownSourceEntries: number; unattributedCityEntries: number };
}
