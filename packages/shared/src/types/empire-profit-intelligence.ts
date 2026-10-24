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

export interface ProfitComparisonDto {
  comparisonVersion: '2.6.0-D1';
  routes: Array<{ route: string[]; tripCount: number; buyCents: string; sellCents: string; tradeDeltaCents: string }>;
  tradeCities: Array<{ citySlug: string; cityName: string; buyCents: string; sellCents: string; tradeDeltaCents: string }>;
  currentRegisters: Array<{ citySlug: string; cityName: string; registerCents: string }>;
  observedMarkets: Array<{ citySlug: string; cityName: string; seenAt: string; products: Array<{ productKey: string; buyCents: number; sellCents: number; depth: number | null }> }>;
  cashAway: { activeRunCents: string; activeBossTripCents: string; totalCents: string };
  caveats: string[];
}

export interface ProfitIntelligenceDto {
  classificationVersion: '2.6.0-B1';
  reportVersion: '2.6.0-C1';
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
  profitEstimate: {
    basis: 'KNOWN_LEDGER_CASH_MARGIN'; completeness: 'INCOMPLETE';
    recognizedIncomeCents: string; recognizedCostsCents: string; estimatedNetCents: string; notes: string[];
  };
  comparison: ProfitComparisonDto;
  efficiency: {
    dealerNetSalesCents: string; dealerWagesCents: string; salesToWagesRatio: string | null;
    turnEfficiencyAvailable: false; turnEfficiencyReason: string;
  };
}
