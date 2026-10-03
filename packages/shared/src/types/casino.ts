export type CasinoVenueKindDto = 'FULL_CASINO' | 'PRIVATE_CLUB' | 'UNDERGROUND' | 'NIGHTLIFE';

export interface CasinoVenueDto {
  citySlug: string;
  cityName: string;
  name: string;
  blurb: string;
  kind: CasinoVenueKindDto;
  walletChipsCents: number;
  here: boolean;
}

export interface CasinoSessionDto {
  id: string;
  citySlug: string;
  cityName: string;
  venueName: string;
  bankrollCents: number;
  openedAt: string;
}

export interface CasinoSlotPaylineDto {
  key: string;
  name: string;
  /** One row index per reel: 0 top, 1 middle, 2 bottom. */
  rows: number[];
}

export interface CasinoSlotPaytableEntryDto {
  symbolKey: string;
  symbolLabel: string;
  glyph: string;
  payouts: Array<{ matches: number; payoutBps: number }>;
}

export interface CasinoSlotMachineDto {
  key: string;
  name: string;
  blurb: string;
  reels: number;
  rows: number;
  paylines: CasinoSlotPaylineDto[];
  paytable: CasinoSlotPaytableEntryDto[];
  /** Circular virtual reel strips, used only to animate toward server-selected stops. */
  reelStrips: CasinoSlotReelDto[][];
  minBetPerLineCents: number;
  maxBetPerLineCents: number;
  betStepCents: number;
  maxTotalWagerCents: number;
  availableHere: boolean;
  /** Base-game RTP before the free-spin feature. */
  baseRtpBps: number;
  /** Long-run RTP including the configured non-retriggering free spins. */
  effectiveRtpBps: number;
  freeSpins: {
    triggerBps: number;
    presentationLabel: string;
    possibleAwards: number[];
  } | null;
  progressive: {
    poolCents: number;
    contributionBps: number;
    eligibleBetPerLineCents: number;
    requiresAllPaylines: boolean;
  } | null;
}

export interface CasinoSlotReelDto {
  key: string;
  label: string;
  glyph: string;
}

export interface CasinoSlotPositionDto {
  reel: number;
  row: number;
}

export interface CasinoSlotLineWinDto {
  paylineKey: string;
  paylineName: string;
  symbolKey: string;
  symbolLabel: string;
  matchCount: number;
  payoutCents: number;
  positions: CasinoSlotPositionDto[];
}

export type CasinoSlotWinTierDto = 'NONE' | 'SMALL' | 'BIG' | 'MEGA' | 'JACKPOT';

export interface CasinoSlotNearMissDto {
  paylineKey: string;
  symbolKey: string;
  symbolLabel: string;
  reel: number;
}

export interface CasinoSlotSpinDto {
  actionId: string;
  machineKey: string;
  machineName: string;
  betPerLineCents: number;
  activePaylineKeys: string[];
  /** Nominal value of the spin. This stays non-zero on a comped free spin. */
  wagerCents: number;
  /** What was actually removed from the bankroll: zero for a free spin. */
  chargedWagerCents: number;
  isFreeSpin: boolean;
  payoutCents: number;
  netCents: number;
  payoutBps: number;
  grid: CasinoSlotReelDto[][];
  reelStops: number[];
  winningLines: CasinoSlotLineWinDto[];
  nearMiss: CasinoSlotNearMissDto | null;
  winTier: CasinoSlotWinTierDto;
  jackpotContributionCents: number;
  jackpotAwardCents: number;
  freeSpinsAwarded: number;
  freeSpinsRemainingAfter: number;
  bankrollAfterCents: number;
  createdAt: string;
}

export interface CasinoSlotSpinResponseDto {
  page: CasinoPageDto;
  spin: CasinoSlotSpinDto;
}

export interface CasinoFreeSpinBonusDto {
  id: string;
  machineKey: string;
  machineName: string;
  citySlug: string;
  cityName: string;
  betPerLineCents: number;
  activePaylineKeys: string[];
  awardedSpins: number;
  remainingSpins: number;
  totalWonCents: number;
  presentationLabel: string;
  awardedAt: string;
}

export interface CasinoBlackjackTableDto {
  key: string;
  name: string;
  blurb: string;
  minBetCents: number;
  maxBetCents: number;
  betStepCents: number;
  decks: number;
  dealerHitsSoft17: boolean;
  blackjackPays: string;
  maxSplitHands: number;
  allowDoubleAfterSplit: boolean;
  splitAcesOneCard: boolean;
  availableHere: boolean;
}

export interface CasinoBlackjackCardDto {
  code: string | null;
  label: string;
  hidden: boolean;
}

export type CasinoBlackjackOutcomeDto = 'BLACKJACK' | 'WIN' | 'PUSH' | 'LOSE' | 'BUST';
export type CasinoBlackjackPlayerHandStatusDto = 'ACTIVE' | 'STOOD' | 'BUST' | 'DONE';

export interface CasinoBlackjackPlayerHandDto {
  index: number;
  cards: CasinoBlackjackCardDto[];
  total: number;
  soft: boolean;
  status: CasinoBlackjackPlayerHandStatusDto;
  wagerCents: number;
  outcome: CasinoBlackjackOutcomeDto | null;
  returnCents: number;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canSplit: boolean;
}

export interface CasinoBlackjackHandDto {
  id: string;
  tableKey: string;
  tableName: string;
  status: 'ACTIVE' | 'SETTLED';
  dealerCards: CasinoBlackjackCardDto[];
  dealerTotal: number | null;
  dealerSoft: boolean | null;
  playerHands: CasinoBlackjackPlayerHandDto[];
  activeHandIndex: number;
  totalWagerCents: number;
  totalReturnCents: number;
  netCents: number;
  bankrollAfterCents: number;
  shoeRemainingCards: number;
  shuffleNumber: number;
  createdAt: string;
  settledAt: string | null;
}

export interface CasinoBlackjackStateDto {
  enabled: boolean;
  tables: CasinoBlackjackTableDto[];
  activeHand: CasinoBlackjackHandDto | null;
  history: CasinoBlackjackHandDto[];
}

export interface CasinoBlackjackDealResponseDto {
  page: CasinoPageDto;
  blackjack: CasinoBlackjackStateDto;
  hand: CasinoBlackjackHandDto;
}

export type CasinoBlackjackActionResponseDto = CasinoBlackjackDealResponseDto;

export type CasinoLedgerKindDto = 'BUY_CHIPS' | 'REDEEM_CHIPS' | 'SESSION_OPEN' | 'SESSION_CLOSE' | 'SLOT_SPIN' | 'BLACKJACK';

export interface CasinoLedgerEntryDto {
  id: string;
  kind: CasinoLedgerKindDto;
  display: {
    title: string;
    detail: string;
    amountLabel: string;
    amountCents: number;
    tone: 'positive' | 'negative' | 'neutral';
  };
  citySlug: string;
  cityName: string;
  venueName: string;
  sessionId: string | null;
  cashDeltaCents: number;
  walletChipDeltaCents: number;
  sessionChipDeltaCents: number;
  walletChipsAfterCents: number;
  sessionChipsAfterCents: number;
  createdAt: string;
}

export interface CasinoPageDto {
  enabled: boolean;
  /** Cash physically available to the boss at this location; zero while in transit. */
  cashCents: number;
  currentCitySlug: string | null;
  currentVenue: CasinoVenueDto | null;
  venues: CasinoVenueDto[];
  openSession: CasinoSessionDto | null;
  slotMachines: CasinoSlotMachineDto[];
  freeSpinBonus: CasinoFreeSpinBonusDto | null;
  recentLedger: CasinoLedgerEntryDto[];
  totalCasinoValueCents: number;
  limits: {
    chipUnitCents: number;
    cashierMinCents: number;
    cashierMaxCents: number;
    sessionMinCents: number;
    sessionMaxCents: number;
  } | null;
}
